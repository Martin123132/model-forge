import { spawn } from "node:child_process";
import process from "node:process";
import path from "node:path";

const root = process.cwd();
const dCacheRoot = path.resolve(root, "..", ".cache");
const env = {
  ...process.env,
  MODEL_FORGE_DATA_ROOT: process.env.MODEL_FORGE_DATA_ROOT || path.join(root, ".modelforge-data"),
  MODEL_FORGE_SOURCE_ROOT: process.env.MODEL_FORGE_SOURCE_ROOT || root,
  npm_config_cache: process.env.npm_config_cache || path.join(dCacheRoot, "npm"),
  TEMP: process.env.TEMP || path.join(dCacheRoot, "temp"),
  TMP: process.env.TMP || path.join(dCacheRoot, "temp"),
  PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(dCacheRoot, "playwright")
};

const webCommand = process.platform === "win32" ? "cmd.exe" : "npm";
const webArgs = process.platform === "win32" ? ["/d", "/s", "/c", "npm.cmd run dev:web"] : ["run", "dev:web"];
const children = [
  spawn(process.execPath, ["server.mjs", "--api-only"], { cwd: root, env, stdio: "inherit" }),
  spawn(webCommand, webArgs, { cwd: root, env, stdio: "inherit" })
];

let shuttingDown = false;

function stopAll(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
}

for (const child of children) {
  child.on("exit", (code) => {
    if (!shuttingDown && code !== 0) {
      stopAll(code ?? 1);
    }
  });
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
