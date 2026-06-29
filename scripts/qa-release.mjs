import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const releaseRoot = resolve(repoRoot, ".modelforge-release");

function check(label, ok, detail, severity = "fail") {
  return { label, ok: Boolean(ok), detail, severity };
}

function format(item) {
  const status = item.ok ? "PASS" : item.severity === "warn" ? "WARN" : "FAIL";
  return `${status} ${item.label}: ${item.detail}`;
}

async function readText(path) {
  return readFile(resolve(repoRoot, path), "utf-8");
}

async function main() {
  const packageJson = JSON.parse(await readText("package.json"));
  const gitignore = await readText(".gitignore");
  const readme = await readText("README.md");
  const changelog = await readText("CHANGELOG.md");
  const gettingStarted = await readText("docs/GETTING_STARTED_5_MINUTES.md");
  const privacy = await readText("docs/PRIVACY_LOCAL_FIRST.md");
  const limitations = await readText("docs/KNOWN_LIMITATIONS.md");
  const checks = [
    check("Version", packageJson.version === "1.0.0", packageJson.version),
    check("Release script", packageJson.scripts?.["release:zip"] === "node scripts/build-release.mjs", packageJson.scripts?.["release:zip"] || "missing"),
    check("Release QA script", packageJson.scripts?.["qa:release"] === "node scripts/qa-release.mjs", packageJson.scripts?.["qa:release"] || "missing"),
    check("Release output ignored", gitignore.includes(".modelforge-release/"), ".modelforge-release/"),
    check("Portable builder exists", existsSync(resolve(repoRoot, "scripts", "build-release.mjs")), "scripts/build-release.mjs"),
    check("Changelog v1", changelog.includes("## 1.0.0"), "CHANGELOG.md"),
    check("Getting started guide", /Start-ModelForge\.cmd/.test(gettingStarted) && /5 minutes/i.test(gettingStarted), "docs/GETTING_STARTED_5_MINUTES.md"),
    check("Privacy statement", /local-first/i.test(privacy) && /diagnostics/i.test(privacy) && /exports/i.test(privacy), "docs/PRIVACY_LOCAL_FIRST.md"),
    check("Known limitations", /LoRA\/QLoRA/i.test(limitations) && /not a foundation\s+model/i.test(limitations), "docs/KNOWN_LIMITATIONS.md"),
    check("README release links", readme.includes("docs/GETTING_STARTED_5_MINUTES.md") && readme.includes("npm.cmd run release:zip"), "README.md")
  ];

  const latestPath = join(releaseRoot, "latest.json");
  if (existsSync(latestPath)) {
    const latest = JSON.parse(await readFile(latestPath, "utf-8"));
    const zipPath = latest.zipPath || join(releaseRoot, `ModelForge-v${packageJson.version}.zip`);
    const packageDir = latest.packageDir || join(releaseRoot, `ModelForge-v${packageJson.version}`);
    const zipStat = existsSync(zipPath) ? await stat(zipPath) : null;
    checks.push(
      check("Generated release manifest", latest.schema === "modelforge.release_package.v1" && latest.version === packageJson.version, latestPath),
      check("Generated release folder", existsSync(packageDir), packageDir),
      check("Generated release zip", Boolean(zipStat && zipStat.size > 50_000), zipStat ? `${zipStat.size.toLocaleString()} bytes` : zipPath),
      check("Generated launcher", existsSync(join(packageDir, "Start-ModelForge.cmd")), join(packageDir, "Start-ModelForge.cmd")),
      check("Generated portable README", existsSync(join(packageDir, "README-PORTABLE.md")), join(packageDir, "README-PORTABLE.md")),
      check("Generated docs", existsSync(join(packageDir, "docs", "GETTING_STARTED_5_MINUTES.md")), join(packageDir, "docs")),
      check("Generated dist", existsSync(join(packageDir, "dist", "index.html")), join(packageDir, "dist", "index.html")),
      check("Generated checksum", /^[a-f0-9]{64}$/i.test(latest.zipSha256 || ""), latest.zipSha256 || "missing")
    );
  } else {
    checks.push(check("Generated release package", false, "run npm.cmd run release:zip to create .modelforge-release/latest.json", "warn"));
  }

  console.log("ModelForge release QA");
  for (const item of checks) {
    console.log(format(item));
  }
  const failures = checks.filter((item) => !item.ok && item.severity !== "warn");
  if (failures.length) {
    console.error(`Release QA failed: ${failures.length} hard check(s) failed.`);
    process.exit(1);
  }
  const warnings = checks.filter((item) => !item.ok && item.severity === "warn");
  console.log(warnings.length ? `Release QA passed with ${warnings.length} warning(s).` : "Release QA passed.");
}

main().catch((error) => {
  console.error(`Release QA failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
