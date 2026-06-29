import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const releaseRoot = resolve(repoRoot, ".modelforge-release");

function isInsidePath(parent, child) {
  const relativePath = relative(resolve(parent), resolve(child));
  return relativePath === "" || (!!relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd || repoRoot,
      env: { ...process.env, ...(options.env || {}) },
      stdio: options.stdio || "inherit",
      windowsHide: true
    });
    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

function quoteCmdArg(arg) {
  return /^[\w:/@%+=.,-]+$/.test(arg) ? arg : `"${arg.replaceAll("\"", "\"\"")}"`;
}

function runNpm(args) {
  if (process.platform !== "win32") {
    return run("npm", args);
  }
  return run("cmd.exe", ["/d", "/s", "/c", ["npm.cmd", ...args.map(quoteCmdArg)].join(" ")]);
}

async function copyRequired(source, target) {
  const sourcePath = resolve(repoRoot, source);
  if (!existsSync(sourcePath)) {
    throw new Error(`Required release input is missing: ${source}`);
  }
  await cp(sourcePath, target, { recursive: true });
}

async function sha256File(path) {
  const buffer = await readFile(path);
  return createHash("sha256").update(buffer).digest("hex");
}

function portableLauncher(version) {
  return [
    "@echo off",
    "setlocal",
    "",
    "cd /d \"%~dp0\"",
    `title ModelForge v${version}`,
    "",
    "echo.",
    `echo Starting ModelForge v${version}...`,
    "echo.",
    "",
    "where node >nul 2>nul",
    "if errorlevel 1 (",
    "  echo ModelForge needs Node.js 20 or newer.",
    "  echo Install Node.js from https://nodejs.org/ and run this launcher again.",
    "  pause",
    "  exit /b 1",
    ")",
    "",
    "set \"MODEL_FORGE_SOURCE_ROOT=%CD%\"",
    "",
    "if exist \"D:\\\" (",
    "  set \"MODEL_FORGE_DATA_ROOT=D:\\AI\\ModelForge\\.modelforge-data\"",
    "  set \"OLLAMA_MODELS=D:\\AI\\Ollama\\models\"",
    "  set \"MODEL_FORGE_CACHE_ROOT=D:\\AI\\ModelForge\\.cache\"",
    ") else (",
    "  set \"MODEL_FORGE_DATA_ROOT=%CD%\\.modelforge-data\"",
    "  set \"MODEL_FORGE_CACHE_ROOT=%CD%\\.cache\"",
    ")",
    "",
    "if not exist \"%MODEL_FORGE_DATA_ROOT%\" mkdir \"%MODEL_FORGE_DATA_ROOT%\"",
    "if defined OLLAMA_MODELS if not exist \"%OLLAMA_MODELS%\" mkdir \"%OLLAMA_MODELS%\"",
    "if not exist \"%MODEL_FORGE_CACHE_ROOT%\" mkdir \"%MODEL_FORGE_CACHE_ROOT%\"",
    "",
    "set \"npm_config_cache=%MODEL_FORGE_CACHE_ROOT%\\npm\"",
    "set \"TEMP=%MODEL_FORGE_CACHE_ROOT%\\temp\"",
    "set \"TMP=%MODEL_FORGE_CACHE_ROOT%\\temp\"",
    "set \"PLAYWRIGHT_BROWSERS_PATH=%MODEL_FORGE_CACHE_ROOT%\\playwright\"",
    "",
    "echo Data root: %MODEL_FORGE_DATA_ROOT%",
    "if defined OLLAMA_MODELS echo Ollama models: %OLLAMA_MODELS%",
    "echo.",
    "echo Opening http://127.0.0.1:4178/",
    "echo Close this window to stop ModelForge.",
    "echo.",
    "",
    "start \"\" \"http://127.0.0.1:4178/\"",
    "node server.mjs",
    "if errorlevel 1 (",
    "  echo.",
    "  echo ModelForge stopped with an error.",
    "  pause",
    "  exit /b 1",
    ")",
    ""
  ].join("\r\n");
}

function portablePackageJson(packageJson) {
  return {
    name: packageJson.name,
    version: packageJson.version,
    private: true,
    description: packageJson.description,
    license: packageJson.license,
    type: "module",
    scripts: {
      start: "node server.mjs"
    }
  };
}

async function compressRelease(packageDir, zipPath) {
  const zipParent = dirname(zipPath);
  await mkdir(zipParent, { recursive: true });
  if (process.platform === "win32") {
    await run(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Compress-Archive -Path (Join-Path $env:MODEL_FORGE_RELEASE_PACKAGE '*') -DestinationPath $env:MODEL_FORGE_RELEASE_ZIP -Force"
      ],
      {
        env: {
          MODEL_FORGE_RELEASE_PACKAGE: packageDir,
          MODEL_FORGE_RELEASE_ZIP: zipPath
        }
      }
    );
    return;
  }
  await run("zip", ["-r", zipPath, "."], { cwd: packageDir });
}

async function main() {
  const packageJson = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf-8"));
  const version = packageJson.version;
  const packageName = `ModelForge-v${version}`;
  const packageDir = resolve(releaseRoot, packageName);
  const zipPath = resolve(releaseRoot, `${packageName}.zip`);

  if (!isInsidePath(repoRoot, releaseRoot)) {
    throw new Error(`Refusing to write release outside the repository: ${releaseRoot}`);
  }

  console.log(`Building ModelForge ${version} release...`);
  await runNpm(["run", "build"]);

  if (existsSync(releaseRoot)) {
    if (!isInsidePath(repoRoot, releaseRoot) || !releaseRoot.endsWith(".modelforge-release")) {
      throw new Error(`Refusing to clean unexpected release path: ${releaseRoot}`);
    }
    await rm(releaseRoot, { recursive: true, force: true });
  }
  await mkdir(packageDir, { recursive: true });

  await copyRequired("dist", join(packageDir, "dist"));
  await copyRequired("docs", join(packageDir, "docs"));
  for (const file of ["README.md", "CHANGELOG.md", "LICENSE", ".env.example", "server.mjs"]) {
    await copyRequired(file, join(packageDir, file));
  }

  await writeFile(join(packageDir, "package.json"), JSON.stringify(portablePackageJson(packageJson), null, 2) + "\n", "utf-8");
  await writeFile(join(packageDir, "Start-ModelForge.cmd"), portableLauncher(version), "utf-8");
  await writeFile(
    join(packageDir, "README-PORTABLE.md"),
    [
      "# ModelForge Portable Release",
      "",
      "Double-click `Start-ModelForge.cmd` to run the built app.",
      "",
      "- Requires Node.js 20 or newer.",
      "- Uses `D:\\AI\\ModelForge\\.modelforge-data` when the D drive exists.",
      "- Uses `D:\\AI\\Ollama\\models` for Ollama model files when the D drive exists.",
      "- Opens `http://127.0.0.1:4178/`.",
      "- Keeps source, generated data, diagnostics, proof, datasets, knowledge packs, and chats local unless you manually export/share them.",
      "",
      "Start with `docs/GETTING_STARTED_5_MINUTES.md`."
    ].join("\n") + "\n",
    "utf-8"
  );

  const manifest = {
    schema: "modelforge.release_package.v1",
    createdAt: new Date().toISOString(),
    version,
    packageName,
    packageDir,
    zipPath,
    launcher: "Start-ModelForge.cmd",
    startUrl: "http://127.0.0.1:4178/",
    dataRootPreference: "D:\\AI\\ModelForge\\.modelforge-data when D: exists, otherwise the release folder",
    ollamaModelsPreference: "D:\\AI\\Ollama\\models when D: exists",
    included: [
      "dist/",
      "docs/",
      "README.md",
      "README-PORTABLE.md",
      "CHANGELOG.md",
      "LICENSE",
      ".env.example",
      "server.mjs",
      "package.json",
      "Start-ModelForge.cmd"
    ],
    excluded: ["node_modules/", ".modelforge-data/", ".modelforge-local/", ".cache/", ".git/"]
  };
  await writeFile(join(packageDir, "RELEASE-MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  await compressRelease(packageDir, zipPath);
  const zipStat = await stat(zipPath);
  const zipSha256 = await sha256File(zipPath);
  const latest = {
    ...manifest,
    zipSizeBytes: zipStat.size,
    zipSha256
  };
  await writeFile(join(releaseRoot, "latest.json"), JSON.stringify(latest, null, 2) + "\n", "utf-8");
  await writeFile(join(packageDir, "RELEASE-MANIFEST.json"), JSON.stringify(latest, null, 2) + "\n", "utf-8");
  console.log(`Release folder: ${packageDir}`);
  console.log(`Release zip: ${zipPath}`);
  console.log(`SHA-256: ${zipSha256}`);
}

main().catch((error) => {
  console.error(`Release build failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
