import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";

const projectRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const setupConfigDir = join(projectRoot, ".modelforge-local");
const setupConfigPath = join(setupConfigDir, "setup.json");
const projectRegistryPath = join(setupConfigDir, "projects.json");
const defaultDataRoot = resolve(process.env.MODEL_FORGE_DATA_ROOT || join(projectRoot, ".modelforge-data"));
const defaultSourceRoot = resolve(process.env.MODEL_FORGE_SOURCE_ROOT || projectRoot);
const bundledPython = join(projectRoot, ".venv", "Scripts", "python.exe");
const ollamaCliCache = { expiresAt: 0, promise: null, value: null };
const ollamaStatusCache = { expiresAt: 0, promise: null, value: null };
let dataRoot = defaultDataRoot;
let sourceRoot = defaultSourceRoot;
let pythonCommand = process.env.MODEL_FORGE_PYTHON || (existsSync(bundledPython) ? bundledPython : "python");
let setupConfig = {};
const apiOnly = process.argv.includes("--api-only");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || process.env.MODEL_FORGE_PORT || (apiOnly ? 4188 : 4178));
const recipeRunJobs = new Map();
const builderRunJobs = new Map();

const skippedDirs = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  ".modelforge-data",
  ".modelforge-local",
  ".modelforge-release",
  ".cache",
  ".pytest_cache",
  "__pycache__",
  ".venv",
  "venv"
]);

const skippedSourceFileNames = new Set([
  ".modelforge-api.err.log",
  ".modelforge-api.out.log"
]);

const languageByExtension = new Map([
  [".ts", "TypeScript"],
  [".tsx", "TypeScript"],
  [".js", "JavaScript"],
  [".jsx", "JavaScript"],
  [".mjs", "JavaScript"],
  [".cjs", "JavaScript"],
  [".py", "Python"],
  [".md", "Markdown"],
  [".json", "JSON"],
  [".jsonl", "JSONL"],
  [".toml", "TOML"],
  [".yml", "YAML"],
  [".yaml", "YAML"],
  [".css", "CSS"],
  [".html", "HTML"],
  [".ps1", "PowerShell"],
  [".bat", "Batch"],
  [".png", "PNG"],
  [".svg", "SVG"]
]);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".ico", "image/x-icon"],
  [".json", "application/json; charset=utf-8"]
]);

async function ensureDataRootAt(root = dataRoot) {
  await mkdir(join(root, "runs"), { recursive: true });
  await mkdir(join(root, "proofs"), { recursive: true });
  await mkdir(join(root, "sources"), { recursive: true });
  await mkdir(join(root, "repomori"), { recursive: true });
  await mkdir(join(root, "agentledger"), { recursive: true });
  await mkdir(join(root, "models"), { recursive: true });
  await mkdir(join(root, "evals"), { recursive: true });
  await mkdir(join(root, "share"), { recursive: true });
  await mkdir(join(root, "datasets"), { recursive: true });
  await mkdir(join(root, "datasets", "history"), { recursive: true });
  await mkdir(join(root, "knowledge"), { recursive: true });
  await mkdir(join(root, "knowledge", "history"), { recursive: true });
  await mkdir(join(root, "recipes"), { recursive: true });
  await mkdir(join(root, "recipes", "history"), { recursive: true });
  await mkdir(join(root, "exports"), { recursive: true });
  await mkdir(join(root, "exports", "runs"), { recursive: true });
  await mkdir(join(root, "chats"), { recursive: true });
  await mkdir(join(root, "builder"), { recursive: true });
  await mkdir(join(root, "builder", "history"), { recursive: true });
  await mkdir(join(root, "builder", "runs"), { recursive: true });
  await mkdir(join(root, "logs"), { recursive: true });
}

async function ensureDataRoot() {
  await ensureDataRootAt(dataRoot);
}

function commandEnv(extra = {}) {
  const env = {
    ...process.env,
    TEMP: process.env.TEMP || join(resolve(projectRoot, ".."), ".cache", "temp"),
    TMP: process.env.TMP || join(resolve(projectRoot, ".."), ".cache", "temp"),
    PIP_CACHE_DIR: process.env.PIP_CACHE_DIR || join(resolve(projectRoot, ".."), ".cache", "pip"),
    npm_config_cache: process.env.npm_config_cache || join(resolve(projectRoot, ".."), ".cache", "npm"),
    ...extra
  };
  const command = ollamaCommand();
  if (isAbsolute(command)) {
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
    env[pathKey] = `${dirname(command)}${process.platform === "win32" ? ";" : ":"}${env[pathKey] || ""}`;
  }
  return env;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolveCommand) => {
    const env = commandEnv(options.env || {});
    execFile(command, args, { cwd: options.cwd || projectRoot, env, timeout: options.timeout || 8000, windowsHide: true, maxBuffer: options.maxBuffer || 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolveCommand({
        ok: !error,
        code: error?.code ?? 0,
        stdout: String(stdout || ""),
        stderr: String(stderr || ""),
        error: error ? String(error.message || error) : ""
      });
    });
  });
}

async function writeJson(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

async function copyIfExists(source, target) {
  if (!source || !existsSync(source)) return false;
  await mkdir(resolve(target, ".."), { recursive: true });
  await copyFile(source, target);
  return true;
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return null;
  }
}

async function readTextIfExists(path) {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}

function cleanSetting(value) {
  return String(value || "").trim();
}

function resolvePathSetting(value, fallback) {
  const raw = cleanSetting(value);
  return resolve(raw || fallback);
}

function splitPatternList(value) {
  if (Array.isArray(value)) {
    return value.map(cleanSetting).filter(Boolean).slice(0, 80);
  }
  return String(value || "")
    .split(/[\n,;]+/)
    .map(cleanSetting)
    .filter(Boolean)
    .slice(0, 80);
}

function joinPatternList(value) {
  return splitPatternList(value).join("\n");
}

function defaultTargetModelName() {
  return cleanSetting(setupConfig.targetModel) || "modelforge-local:latest";
}

function defaultStarterModelName() {
  const configured = cleanSetting(process.env.MODEL_FORGE_STARTER_MODEL) || "llama3.2:3b";
  return /^[a-z0-9][a-z0-9._:/-]{0,120}$/i.test(configured) ? configured : "llama3.2:3b";
}

function ollamaCommand() {
  const configured = cleanSetting(process.env.MODEL_FORGE_OLLAMA_COMMAND || process.env.OLLAMA_EXE);
  if (configured) return configured;
  const candidates =
    process.platform === "win32"
      ? [
          "D:\\AI\\Ollama\\app\\ollama.exe",
          process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs", "Ollama", "ollama.exe") : "",
          process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Ollama", "ollama.exe") : ""
        ]
      : [];
  return candidates.find((candidate) => candidate && existsSync(candidate)) || "ollama";
}

function applySetupConfig(config = {}, { persistEnv = true } = {}) {
  const nextDataRoot = resolvePathSetting(config.dataRoot, defaultDataRoot);
  const nextSourceRoot = resolvePathSetting(config.sourceRoot, defaultSourceRoot);
  const nextPython = cleanSetting(config.pythonCommand) || process.env.MODEL_FORGE_PYTHON || (existsSync(bundledPython) ? bundledPython : "python");
  const nextOllamaModels = cleanSetting(config.ollamaModels || process.env.OLLAMA_MODELS);

  dataRoot = nextDataRoot;
  sourceRoot = nextSourceRoot;
  pythonCommand = nextPython;
  setupConfig = {
    projectId: cleanSetting(config.projectId || config.id),
    projectName: cleanSetting(config.projectName || config.name) || "Repo-Aware Local Model",
    sourceRoot,
    dataRoot,
    ollamaModels: nextOllamaModels,
    pythonCommand,
    baseModel: cleanSetting(config.baseModel),
    targetModel: cleanSetting(config.targetModel) || "modelforge-local:latest",
    sourceIncludes: joinPatternList(config.sourceIncludes),
    sourceExcludes: joinPatternList(config.sourceExcludes),
    updatedAt: config.updatedAt || ""
  };

  if (persistEnv && nextOllamaModels) {
    process.env.OLLAMA_MODELS = nextOllamaModels;
  }
}

async function loadSetupConfig() {
  const savedConfig = await readJsonIfExists(setupConfigPath);
  applySetupConfig({
    ...(savedConfig || {}),
    sourceRoot: process.env.MODEL_FORGE_SOURCE_ROOT || savedConfig?.sourceRoot || defaultSourceRoot,
    dataRoot: process.env.MODEL_FORGE_DATA_ROOT || savedConfig?.dataRoot || defaultDataRoot,
    pythonCommand: process.env.MODEL_FORGE_PYTHON || savedConfig?.pythonCommand,
    ollamaModels: process.env.OLLAMA_MODELS || savedConfig?.ollamaModels
  });
  return savedConfig;
}

function currentSetupConfig() {
  return {
    projectId: setupConfig.projectId || "",
    projectName: setupConfig.projectName || "Repo-Aware Local Model",
    sourceRoot,
    dataRoot,
    ollamaModels: process.env.OLLAMA_MODELS || setupConfig.ollamaModels || "",
    pythonCommand,
    baseModel: setupConfig.baseModel || "",
    targetModel: setupConfig.targetModel || "modelforge-local:latest",
    sourceIncludes: setupConfig.sourceIncludes || "",
    sourceExcludes: setupConfig.sourceExcludes || ""
  };
}

function projectSlug(value = "") {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return slug || "local-ai";
}

function projectIdFor(config = {}) {
  const seed = `${config.sourceRoot || sourceRoot}|${config.dataRoot || dataRoot}|${config.projectName || ""}`;
  return `project-${createHash("sha256").update(seed).digest("hex").slice(0, 12)}`;
}

function projectNameFromRoot(root = "") {
  const parts = String(root || "").replaceAll("\\", "/").split("/").filter(Boolean);
  return parts.at(-1) || "Repo-Aware Local Model";
}

function projectEntryFromConfig(config = {}, overrides = {}) {
  const sourceValue = resolvePathSetting(config.sourceRoot, sourceRoot);
  const dataValue = resolvePathSetting(config.dataRoot, dataRoot);
  const name = cleanSetting(config.projectName || config.name) || projectNameFromRoot(sourceValue);
  const now = new Date().toISOString();
  return {
    id: cleanSetting(config.projectId || config.id) || projectIdFor({ sourceRoot: sourceValue, dataRoot: dataValue, projectName: name }),
    name,
    status: cleanSetting(config.status) || "active",
    sourceRoot: sourceValue,
    dataRoot: dataValue,
    ollamaModels: cleanSetting(config.ollamaModels),
    pythonCommand: cleanSetting(config.pythonCommand) || pythonCommand,
    baseModel: cleanSetting(config.baseModel),
    targetModel: cleanSetting(config.targetModel) || "modelforge-local:latest",
    sourceIncludes: joinPatternList(config.sourceIncludes),
    sourceExcludes: joinPatternList(config.sourceExcludes),
    createdAt: config.createdAt || now,
    updatedAt: config.updatedAt || now,
    lastOpenedAt: config.lastOpenedAt || "",
    lastDataResetAt: config.lastDataResetAt || "",
    ...overrides
  };
}

function currentProjectEntry(overrides = {}) {
  return projectEntryFromConfig(currentSetupConfig(), {
    status: "active",
    lastOpenedAt: new Date().toISOString(),
    ...overrides
  });
}

function summarizeProjectEntry(project, preferredStorage) {
  const includePatterns = splitPatternList(project.sourceIncludes);
  const excludePatterns = splitPatternList(project.sourceExcludes);
  return {
    ...project,
    active: project.id === setupConfig.projectId || (!setupConfig.projectId && project.sourceRoot === sourceRoot && project.dataRoot === dataRoot),
    dataOnPreferredDrive: !preferredStorage?.canUsePreferred || isWindowsPathOnDrive(project.dataRoot, "D"),
    dataResetReady: projectDataRootSafety(project).ok,
    dataResetReason: projectDataRootSafety(project).reason,
    sourceRules: {
      includePatterns,
      excludePatterns,
      includeCount: includePatterns.length,
      excludeCount: excludePatterns.length
    }
  };
}

async function readProjectRegistry() {
  await mkdir(setupConfigDir, { recursive: true });
  const saved = await readJsonIfExists(projectRegistryPath);
  const now = new Date().toISOString();
  if (saved?.schema === "modelforge.project_registry.v1" && Array.isArray(saved.projects)) {
    return {
      schema: saved.schema,
      createdAt: saved.createdAt || now,
      updatedAt: saved.updatedAt || now,
      activeProjectId: saved.activeProjectId || setupConfig.projectId || "",
      projects: saved.projects.map((project) => projectEntryFromConfig(project))
    };
  }
  const seeded = currentProjectEntry({ createdAt: now, updatedAt: now });
  return {
    schema: "modelforge.project_registry.v1",
    createdAt: now,
    updatedAt: now,
    activeProjectId: seeded.id,
    projects: [seeded]
  };
}

async function writeProjectRegistry(registry) {
  const normalized = {
    schema: "modelforge.project_registry.v1",
    createdAt: registry.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activeProjectId: registry.activeProjectId || "",
    projects: (registry.projects || []).map((project) => projectEntryFromConfig(project))
  };
  await mkdir(setupConfigDir, { recursive: true });
  await writeJson(projectRegistryPath, normalized);
  return normalized;
}

async function upsertCurrentProjectInRegistry() {
  const registry = await readProjectRegistry();
  const current = currentProjectEntry();
  const projects = registry.projects.filter((project) => project.id !== current.id);
  projects.unshift(current);
  return writeProjectRegistry({
    ...registry,
    activeProjectId: current.id,
    projects
  });
}

async function getProjectRegistry() {
  const [registry, preferredStorage] = await Promise.all([readProjectRegistry(), getPreferredStoragePlan()]);
  const activeProjectId = registry.projects.some((project) => project.id === registry.activeProjectId)
    ? registry.activeProjectId
    : registry.projects.some((project) => project.id === setupConfig.projectId)
      ? setupConfig.projectId
      : registry.projects.find((project) => project.sourceRoot === sourceRoot && project.dataRoot === dataRoot)?.id || registry.projects[0]?.id || "";
  const projects = registry.projects.map((project) => summarizeProjectEntry(project, preferredStorage));
  return {
    schema: registry.schema,
    createdAt: registry.createdAt,
    updatedAt: registry.updatedAt,
    activeProjectId,
    registryPath: projectRegistryPath,
    recommended: {
      dataRoot: preferredStorage.recommendedDataRoot,
      ollamaModels: preferredStorage.recommendedOllamaModels,
      preferredDrive: preferredStorage.preferredDrive
    },
    summary: {
      total: projects.length,
      active: projects.filter((project) => project.status !== "archived").length,
      archived: projects.filter((project) => project.status === "archived").length
    },
    projects
  };
}

async function persistActiveProjectConfig(project) {
  const nextConfig = projectEntryFromConfig(project, {
    lastOpenedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  const setupShape = {
    ...nextConfig,
    projectId: nextConfig.id,
    projectName: nextConfig.name
  };
  applySetupConfig(setupShape);
  await ensureDataRoot();
  if (nextConfig.ollamaModels) {
    await mkdir(nextConfig.ollamaModels, { recursive: true });
  }
  await mkdir(setupConfigDir, { recursive: true });
  await writeJson(setupConfigPath, setupShape);
  return setupShape;
}

async function createProject(body = {}) {
  const preferredStorage = await getPreferredStoragePlan();
  const sourceValue = resolvePathSetting(body.sourceRoot, sourceRoot);
  const sourceCheck = await pathCheck(sourceValue);
  if (!sourceCheck.ok) {
    throw new Error(`Source folder is not readable: ${sourceValue}`);
  }
  const name = cleanSetting(body.name || body.projectName) || projectNameFromRoot(sourceValue);
  const suggestedDataRoot = join(resolve(preferredStorage.recommendedDataRoot, ".."), projectSlug(name), ".modelforge-data");
  const entry = projectEntryFromConfig({
    projectName: name,
    sourceRoot: sourceValue,
    dataRoot: resolvePathSetting(body.dataRoot, suggestedDataRoot),
    ollamaModels: cleanSetting(body.ollamaModels || setupConfig.ollamaModels || process.env.OLLAMA_MODELS),
    pythonCommand: cleanSetting(body.pythonCommand || pythonCommand),
    baseModel: cleanSetting(body.baseModel || setupConfig.baseModel),
    targetModel: cleanSetting(body.targetModel || setupConfig.targetModel || "modelforge-local:latest"),
    sourceIncludes: body.sourceIncludes || "",
    sourceExcludes: body.sourceExcludes || ""
  });
  const registry = await readProjectRegistry();
  const projects = [entry, ...registry.projects.filter((project) => project.id !== entry.id)];
  await writeProjectRegistry({ ...registry, activeProjectId: entry.id, projects });
  await persistActiveProjectConfig(entry);
  return {
    ok: true,
    project: await getProjectPayload(),
    setup: await getSetupState(),
    registry: await getProjectRegistry()
  };
}

async function selectProject(projectId = "") {
  const registry = await readProjectRegistry();
  const target = registry.projects.find((project) => project.id === projectId && project.status !== "archived");
  if (!target) {
    throw new Error("Select an active project from the registry.");
  }
  const selected = await persistActiveProjectConfig(target);
  const projects = registry.projects.map((project) => (project.id === selected.id ? selected : project));
  await writeProjectRegistry({ ...registry, activeProjectId: selected.id, projects });
  return {
    ok: true,
    project: await getProjectPayload(),
    setup: await getSetupState(),
    registry: await getProjectRegistry()
  };
}

async function archiveProject(projectId = "") {
  const registry = await readProjectRegistry();
  const target = registry.projects.find((project) => project.id === projectId);
  if (!target) {
    throw new Error("Project was not found.");
  }
  const activeProjects = registry.projects.filter((project) => project.status !== "archived");
  if (activeProjects.length <= 1 && target.status !== "archived") {
    throw new Error("Keep at least one active project.");
  }
  const archived = projectEntryFromConfig(target, { status: "archived", updatedAt: new Date().toISOString() });
  let activeProjectId = registry.activeProjectId;
  const projects = registry.projects.map((project) => (project.id === projectId ? archived : project));
  if (registry.activeProjectId === projectId) {
    const nextActive = projects.find((project) => project.status !== "archived");
    activeProjectId = nextActive?.id || "";
    if (nextActive) {
      await persistActiveProjectConfig(nextActive);
    }
  }
  await writeProjectRegistry({ ...registry, activeProjectId, projects });
  return {
    ok: true,
    project: await getProjectPayload(),
    setup: await getSetupState(),
    registry: await getProjectRegistry()
  };
}

async function deleteProject(projectId = "") {
  const registry = await readProjectRegistry();
  const target = registry.projects.find((project) => project.id === projectId);
  if (!target) {
    throw new Error("Project was not found.");
  }
  if (registry.projects.length <= 1) {
    throw new Error("Keep at least one project in the registry.");
  }
  const projects = registry.projects.filter((project) => project.id !== projectId);
  let activeProjectId = registry.activeProjectId;
  if (registry.activeProjectId === projectId) {
    const nextActive = projects.find((project) => project.status !== "archived") || projects[0];
    activeProjectId = nextActive.id;
    await persistActiveProjectConfig(nextActive);
  }
  await writeProjectRegistry({ ...registry, activeProjectId, projects });
  return {
    ok: true,
    project: await getProjectPayload(),
    setup: await getSetupState(),
    registry: await getProjectRegistry()
  };
}

function normalizedLocalPath(pathValue = "") {
  return resolve(pathValue).replace(/[\\/]+$/g, "").replaceAll("/", "\\").toLowerCase();
}

function projectDataRootSafety(project = {}) {
  const rawDataRoot = cleanSetting(project.dataRoot);
  if (!rawDataRoot) {
    return { ok: false, path: "", reason: "No data root is configured." };
  }

  const resolvedDataRoot = resolve(rawDataRoot);
  const dataPath = normalizedLocalPath(resolvedDataRoot);
  const sourcePath = project.sourceRoot ? normalizedLocalPath(project.sourceRoot) : "";
  const rootPath = normalizedLocalPath(projectRoot);
  const homePath = os.homedir() ? normalizedLocalPath(os.homedir()) : "";

  if (!dataPath.endsWith("\\.modelforge-data")) {
    return {
      ok: false,
      path: resolvedDataRoot,
      reason: "Data reset only runs inside a folder named .modelforge-data."
    };
  }
  if (sourcePath && dataPath === sourcePath) {
    return {
      ok: false,
      path: resolvedDataRoot,
      reason: "The data root matches the source folder, so ModelForge will not reset it."
    };
  }
  if (dataPath === rootPath) {
    return {
      ok: false,
      path: resolvedDataRoot,
      reason: "The data root matches the app folder, so ModelForge will not reset it."
    };
  }
  if (homePath && dataPath === homePath) {
    return {
      ok: false,
      path: resolvedDataRoot,
      reason: "The data root matches the user home folder, so ModelForge will not reset it."
    };
  }
  if (/^[a-z]:$/i.test(dataPath) || /^[a-z]:\\$/i.test(dataPath)) {
    return {
      ok: false,
      path: resolvedDataRoot,
      reason: "The data root is a drive root, so ModelForge will not reset it."
    };
  }

  return {
    ok: true,
    path: resolvedDataRoot,
    reason: "Only generated ModelForge data inside this .modelforge-data folder will be reset."
  };
}

function hasRunningProjectJobs() {
  const recipeRunning = [...recipeRunJobs.values()].some((job) => job?.run?.status === "running");
  const builderRunning = [...builderRunJobs.values()].some((job) => job?.run?.status === "running");
  return recipeRunning || builderRunning;
}

async function resetProjectData(body = {}) {
  if (body.confirmed !== true) {
    throw new Error("Confirm the generated-data reset before running it.");
  }

  const registry = await readProjectRegistry();
  const projectId = cleanSetting(body.projectId || registry.activeProjectId || setupConfig.projectId);
  const target = registry.projects.find((project) => project.id === projectId);
  if (!target) {
    throw new Error("Project was not found.");
  }

  const safety = projectDataRootSafety(target);
  if (!safety.ok) {
    throw new Error(safety.reason);
  }

  const resetActiveProject = projectId === registry.activeProjectId || projectId === setupConfig.projectId;
  if (resetActiveProject && hasRunningProjectJobs()) {
    throw new Error("Wait for the active build or export job to finish before resetting project data.");
  }

  await mkdir(safety.path, { recursive: true });
  const entries = await readdir(safety.path, { withFileTypes: true }).catch(() => []);
  const removed = [];
  const skipped = [];

  for (const entry of entries) {
    const entryPath = resolve(safety.path, entry.name);
    if (!isInsidePath(safety.path, entryPath)) {
      skipped.push({ name: entry.name, reason: "Outside data root" });
      continue;
    }
    await rm(entryPath, { recursive: true, force: true });
    removed.push({
      name: entry.name,
      type: entry.isDirectory() ? "folder" : "file"
    });
  }

  await ensureDataRootAt(safety.path);
  const resetAt = new Date().toISOString();
  const resetReceipt = {
    schema: "modelforge.project_data_reset.v1",
    createdAt: resetAt,
    projectId: target.id,
    projectName: target.name,
    dataRoot: safety.path,
    summary: removed.length
      ? `Reset generated data for ${target.name}: ${removed.length} item${removed.length === 1 ? "" : "s"} cleared.`
      : `Reset generated data for ${target.name}: data root was already clean.`,
    kept: ["source folder", "project registry", "setup config"],
    removed,
    skipped,
    receiptPath: join(safety.path, "logs", "latest-data-reset.json")
  };
  await writeJson(resetReceipt.receiptPath, resetReceipt);

  const updatedProjects = registry.projects.map((project) =>
    project.id === target.id
      ? projectEntryFromConfig(project, {
          lastDataResetAt: resetAt,
          updatedAt: resetAt
        })
      : project
  );
  await writeProjectRegistry({ ...registry, projects: updatedProjects });

  return {
    ok: true,
    reset: resetReceipt,
    project: await getProjectPayload(),
    setup: await getSetupState(),
    registry: await getProjectRegistry()
  };
}

async function getWindowsDriveInfo(letter = "D") {
  const driveName = String(letter || "D").replace(/[^a-z]/gi, "").slice(0, 1).toUpperCase() || "D";
  if (process.platform !== "win32") {
    return {
      available: false,
      name: driveName,
      root: "",
      freeBytes: 0,
      free: "Unavailable",
      usedBytes: 0,
      used: "Unavailable",
      detail: "Windows drive checks only run on Windows."
    };
  }

  const script = [
    `$drive = Get-PSDrive -Name '${driveName}' -ErrorAction SilentlyContinue;`,
    "if ($drive) { [pscustomobject]@{ Name=$drive.Name; Root=$drive.Root; Free=$drive.Free; Used=$drive.Used } | ConvertTo-Json -Compress }"
  ].join(" ");
  const result = await runCommand("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { timeout: 6000 });
  const parsed = result.ok && result.stdout.trim() ? parseJsonLoose(result.stdout) : null;
  if (!parsed) {
    return {
      available: false,
      name: driveName,
      root: `${driveName}:\\`,
      freeBytes: 0,
      free: "Unavailable",
      usedBytes: 0,
      used: "Unavailable",
      detail: `${driveName}: is not available.`
    };
  }

  const freeBytes = Math.max(0, Number(parsed.Free || 0));
  const usedBytes = Math.max(0, Number(parsed.Used || 0));
  return {
    available: true,
    name: String(parsed.Name || driveName),
    root: String(parsed.Root || `${driveName}:\\`),
    freeBytes,
    free: formatBytes(freeBytes),
    usedBytes,
    used: formatBytes(usedBytes),
    detail: `${driveName}: has ${formatBytes(freeBytes)} free.`
  };
}

async function getPreferredStoragePlan() {
  const dDrive = await getWindowsDriveInfo("D");
  const useDDrive = process.platform === "win32" && dDrive.available;
  const baseRoot = useDDrive ? join(dDrive.root, "AI") : projectRoot;
  return {
    schema: "modelforge.preferred_storage.v1",
    preferredDrive: useDDrive ? "D:" : process.platform === "win32" ? "project folder" : "current system",
    dDrive,
    canUsePreferred: useDDrive,
    recommendedDataRoot: useDDrive ? join(baseRoot, "ModelForge", ".modelforge-data") : defaultDataRoot,
    recommendedOllamaModels: useDDrive ? join(baseRoot, "Ollama", "models") : process.env.OLLAMA_MODELS || setupConfig.ollamaModels || "",
    detail: useDDrive ? "D: is available, so ModelForge can keep heavy artifacts away from C:." : "D: was not detected, so ModelForge will use the configured project data root."
  };
}

function driveLetterOf(pathValue = "") {
  return String(pathValue || "").match(/^([a-z]):\\/i)?.[1]?.toUpperCase() || "";
}

function isWindowsPathOnDrive(pathValue = "", driveName = "D") {
  return driveLetterOf(pathValue) === String(driveName || "").replace(/[^a-z]/gi, "").slice(0, 1).toUpperCase();
}

async function pathCheck(path, { shouldBeDirectory = true, create = false } = {}) {
  try {
    if (create) {
      await mkdir(path, { recursive: true });
    }
    const pathStat = await stat(path);
    const typeOk = shouldBeDirectory ? pathStat.isDirectory() : pathStat.isFile();
    return {
      ok: typeOk,
      detail: typeOk ? "Ready" : shouldBeDirectory ? "Path exists but is not a folder." : "Path exists but is not a file."
    };
  } catch (error) {
    return {
      ok: false,
      detail: error?.code === "ENOENT" ? "Path does not exist." : String(error?.message || error)
    };
  }
}

function setupCheck(id, label, ok, value, detail, fix = "") {
  return {
    id,
    label,
    status: ok ? "pass" : "warn",
    value,
    detail,
    fix
  };
}

function setupDoctorCheck(id, label, status, value, detail, repairActionId = "") {
  return {
    id,
    label,
    status,
    value,
    detail,
    repairActionId
  };
}

function setupDoctorStatus(checks = []) {
  if (checks.some((check) => check.status === "fail")) return "blocked";
  if (checks.some((check) => check.status === "warn")) return "needs-attention";
  return "ready";
}

function setupDoctorTitle(status) {
  if (status === "ready") return "Ready to build locally";
  if (status === "blocked") return "Repair before building";
  return "Almost ready";
}

async function getPythonStatus() {
  const result = await runCommand(pythonCommand, ["--version"], { timeout: 5000 });
  const detail = result.stdout.trim() || result.stderr.trim() || result.error;
  return {
    ok: result.ok,
    label: result.ok ? detail || "Python available" : "Missing",
    detail: result.ok ? `${pythonCommand} responded.` : detail || `${pythonCommand} did not respond.`
  };
}

function buildSetupDoctor({ config, sourceCheck, dataCheck, sources, toolStatus, pythonStatus, ollama, hardware, preferredStorage }) {
  const launcherPath = join(projectRoot, "Start-ModelForge.cmd");
  const starterModel = defaultStarterModelName();
  const recommended = {
    dataRoot: preferredStorage.recommendedDataRoot,
    ollamaModels: preferredStorage.recommendedOllamaModels
  };
  const dataOnPreferredDrive = !preferredStorage.canUsePreferred || isWindowsPathOnDrive(config.dataRoot, "D");
  const configuredModelsRoot = config.ollamaModels || ollama.modelsRoot || "";
  const modelsOnPreferredDrive = !preferredStorage.canUsePreferred || !configuredModelsRoot || isWindowsPathOnDrive(configuredModelsRoot, "D");
  const hasEnoughDisk = hardware.disk.freeBytes >= 30 * 1024 * 1024 * 1024;
  const hasMinimumDisk = hardware.disk.freeBytes >= 10 * 1024 * 1024 * 1024 || hardware.disk.freeBytes === 0;
  const memoryGb = hardware.memory.totalBytes / 1024 / 1024 / 1024;
  const hardwareOk = hardware.tier.canRunQuantized || memoryGb >= 16 || hardware.gpu.detected;
  const ollamaReady = toolStatus.ollama.ok && ollama.ok;
  const ollamaHasModels = ollama.models.length > 0;

  const actions = [];
  if (preferredStorage.canUsePreferred && (!dataOnPreferredDrive || !modelsOnPreferredDrive)) {
    actions.push({
      id: "use-d-drive-storage",
      label: "Use D-drive storage",
      kind: "apply-config",
      tone: "primary",
      detail: "Move future ModelForge data and Ollama model storage to D:\\AI.",
      configPatch: {
        dataRoot: recommended.dataRoot,
        ollamaModels: recommended.ollamaModels
      }
    });
  }
  if (!toolStatus.ollama.ok) {
    actions.push({
      id: "install-ollama",
      label: "Install Ollama",
      kind: "manual",
      tone: "warning",
      detail: "Install Ollama for Windows, then press Recheck. ModelForge will detect it automatically."
    });
  } else if (!ollamaReady) {
    actions.push({
      id: "start-ollama",
      label: "Start Ollama",
      kind: "server-action",
      tone: "primary",
      detail: "ModelForge will start the local Ollama server, then recheck model readiness.",
      command: "ollama serve",
      busyLabel: "Starting"
    });
  } else if (!ollamaHasModels) {
    actions.push({
      id: "pull-small-model",
      label: "Install starter model",
      kind: "server-action",
      tone: "primary",
      detail: `ModelForge will run Ollama's pull step for ${starterModel}, save it as the base model, and write a repair receipt.`,
      command: `ollama pull ${starterModel}`,
      busyLabel: "Installing",
      modelName: starterModel
    });
  }
  if (!pythonStatus.ok) {
    actions.push({
      id: "set-python",
      label: "Set Python",
      kind: "manual",
      tone: "warning",
      detail: "Install Python or point ModelForge at the bundled .venv Python path."
    });
  }

  const checks = [
    setupDoctorCheck(
      "launcher",
      "One-click launcher",
      existsSync(launcherPath) ? "pass" : "warn",
      existsSync(launcherPath) ? "Available" : "Missing",
      existsSync(launcherPath) ? "Start-ModelForge.cmd can launch the local API, web app, and browser." : "Add the Windows launcher before calling this non-dev ready."
    ),
    setupDoctorCheck(
      "source-folder",
      "Source folder",
      sourceCheck.ok && Boolean(sources?.totalFiles) ? "pass" : "fail",
      `${sources?.totalFiles || 0} files`,
      sourceCheck.ok ? "ModelForge can read the selected source folder." : sourceCheck.detail
    ),
    setupDoctorCheck(
      "data-drive",
      "Storage location",
      dataCheck.ok && dataOnPreferredDrive ? "pass" : dataCheck.ok ? "warn" : "fail",
      config.dataRoot,
      dataOnPreferredDrive ? preferredStorage.detail : "D: is available; use it for generated datasets, proofs, exports, and run logs.",
      preferredStorage.canUsePreferred ? "use-d-drive-storage" : ""
    ),
    setupDoctorCheck(
      "disk-space",
      "Disk space",
      hasEnoughDisk ? "pass" : hasMinimumDisk ? "warn" : "fail",
      hardware.disk.free,
      hasEnoughDisk ? "Enough free space for v1 local builds." : "Keep at least 30 GB free for model pulls, datasets, proof bundles, and exports."
    ),
    setupDoctorCheck(
      "python",
      "Python",
      pythonStatus.ok ? "pass" : "warn",
      pythonStatus.label,
      pythonStatus.detail,
      pythonStatus.ok ? "" : "set-python"
    ),
    setupDoctorCheck(
      "ollama",
      "Ollama",
      ollamaReady && ollamaHasModels ? "pass" : ollamaReady ? "warn" : "fail",
      ollamaReady ? `${ollama.models.length} model${ollama.models.length === 1 ? "" : "s"}` : "Not running",
      ollamaReady ? (ollamaHasModels ? `${ollama.selectedModel || "A local model"} is available.` : "Ollama is running, but no local model is installed.") : ollama.error || toolStatus.ollama.detail,
      !toolStatus.ollama.ok ? "install-ollama" : ollamaReady ? (ollamaHasModels ? "" : "pull-small-model") : "start-ollama"
    ),
    setupDoctorCheck(
      "ollama-models",
      "Model folder",
      modelsOnPreferredDrive ? "pass" : "warn",
      configuredModelsRoot || "Default",
      modelsOnPreferredDrive ? "Model storage is aligned with the current storage plan." : "D: is available; model pulls should avoid C: when possible.",
      preferredStorage.canUsePreferred ? "use-d-drive-storage" : ""
    ),
    setupDoctorCheck(
      "hardware-fit",
      "Hardware fit",
      hardwareOk ? "pass" : "warn",
      hardware.tier.label,
      hardware.modelFit?.summary || hardware.tier.detail
    )
  ];

  const status = setupDoctorStatus(checks);
  const blocking = checks.filter((check) => check.status === "fail").length;
  const warnings = checks.filter((check) => check.status === "warn").length;

  return {
    schema: "modelforge.first_run_doctor.v1",
    createdAt: new Date().toISOString(),
    status,
    title: setupDoctorTitle(status),
    summary:
      status === "ready"
        ? "This machine is ready for the guided local build path."
        : status === "blocked"
          ? `${blocking} blocker${blocking === 1 ? "" : "s"} must be repaired before a non-dev first run.`
          : `${warnings} item${warnings === 1 ? "" : "s"} should be reviewed before calling this v1-ready.`,
    preferredDrive: preferredStorage.preferredDrive,
    recommended,
    launch: {
      available: existsSync(launcherPath),
      scriptPath: launcherPath,
      command: "Start-ModelForge.cmd"
    },
    hardwareSummary: {
      tier: hardware.tier.label,
      cpu: `${hardware.cpu.threads} threads`,
      ram: hardware.memory.total,
      gpu: hardware.gpu.detected ? hardware.gpu.totalVram : "No GPU detected",
      diskFree: hardware.disk.free
    },
    checks,
    actions
  };
}

async function getSetupDoctorInputs() {
  const config = currentSetupConfig();
  const preferredStorage = await getPreferredStoragePlan();
  const [sourceCheck, dataCheck, toolStatus, pythonStatus, ollama, hardware] = await Promise.all([
    pathCheck(sourceRoot),
    pathCheck(dataRoot, { create: true }),
    getToolStatus(),
    getPythonStatus(),
    getOllamaStatus(),
    getHardwareProfile()
  ]);
  const sources = sourceCheck.ok ? await walkSources(sourceRoot) : null;
  return { config, preferredStorage, sourceCheck, dataCheck, sources, toolStatus, pythonStatus, ollama, hardware };
}

async function getSetupState() {
  const inputs = await getSetupDoctorInputs();
  const { config, sourceCheck, dataCheck, sources, toolStatus, ollama } = inputs;
  const [latestProof, latestEval, latestRecipe] = await Promise.all([
    getLatestProofBundle(),
    getLatestEvalReport(),
    getLatestForgeRecipe()
  ]);
  const configured = existsSync(setupConfigPath);
  const selectedBaseModel = setupConfig.baseModel || ollama.selectedModel || "";
  const modelAvailable = Boolean(!selectedBaseModel || ollama.models.some((model) => model.name === selectedBaseModel));
  const proofSourceSummary = latestProof?.manifest?.sourceSummary || null;
  const proofFresh = Boolean(
    latestProof &&
      sources &&
      proofSourceSummary &&
      proofSourceSummary.totalFiles === sources.totalFiles &&
      proofSourceSummary.sampledFiles === sources.sampledFiles &&
      proofSourceSummary.totalSizeBytes === sources.totalSizeBytes
  );
  const evalFresh = Boolean(proofFresh && latestEval && latestProof && latestEval.proofPath === latestProof.path);
  const recipeReady = Boolean(latestRecipe && latestRecipe.status === "ready");

  return {
    schema: "modelforge.setup_state.v1",
    configured,
    config,
    defaults: {
      projectRoot,
      sourceRoot: defaultSourceRoot,
      dataRoot: defaultDataRoot,
      pythonCommand: existsSync(bundledPython) ? bundledPython : "python"
    },
    summary: {
      sources: sources?.totalFiles || 0,
      sampled: sources?.sampledFiles || 0,
      proofFresh,
      evalFresh,
      recipeReady
    },
    doctor: buildSetupDoctor(inputs),
    checks: [
      setupCheck("source-root", "Source folder", sourceCheck.ok && Boolean(sources?.totalFiles), `${sources?.totalFiles || 0} files`, sourceCheck.ok ? "Folder is readable." : sourceCheck.detail, "Choose a folder that exists on this machine."),
      setupCheck("data-root", "Data root", dataCheck.ok, dataRoot, dataCheck.detail, "Use a writable folder, ideally on D:."),
      setupCheck("repomori", "RepoMori", toolStatus.repomori.ok, toolStatus.repomori.label, toolStatus.repomori.detail, "Install RepoMori in the configured Python environment."),
      setupCheck("agentledger", "AgentLedger", toolStatus.agentledger.ok, toolStatus.agentledger.label, toolStatus.agentledger.detail, "Install AgentLedger in the configured Python environment."),
      setupCheck("ollama", "Ollama", toolStatus.ollama.ok && ollama.ok, ollama.selectedModel || "No model", ollama.ok ? ollama.version : ollama.error || toolStatus.ollama.detail, "Start Ollama and pull a local base model."),
      setupCheck("base-model", "Base model", modelAvailable, selectedBaseModel || "Auto", modelAvailable ? "Base model can be selected for exports." : "Saved base model was not found in Ollama.", "Pick an installed Ollama model.")
    ]
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

const setupDoctorScenarioSpecs = {
  ready: {
    status: "ready",
    checkStatuses: { "source-folder": "pass", ollama: "pass", python: "pass", "disk-space": "pass" },
    actionIds: []
  },
  "missing-ollama": {
    status: "blocked",
    checkStatuses: { ollama: "fail" },
    actionIds: ["install-ollama"]
  },
  "stopped-ollama": {
    status: "blocked",
    checkStatuses: { ollama: "fail" },
    actionIds: ["start-ollama"]
  },
  "no-models": {
    status: "needs-attention",
    checkStatuses: { ollama: "warn" },
    actionIds: ["pull-small-model"]
  },
  "bad-source-folder": {
    status: "blocked",
    checkStatuses: { "source-folder": "fail" },
    actionIds: []
  },
  "missing-python": {
    status: "needs-attention",
    checkStatuses: { python: "warn" },
    actionIds: ["set-python"]
  },
  "low-disk": {
    status: "blocked",
    checkStatuses: { "disk-space": "fail" },
    actionIds: []
  },
  "c-drive-storage": {
    status: "needs-attention",
    checkStatuses: { "data-drive": "warn", "ollama-models": "warn" },
    actionIds: ["use-d-drive-storage"]
  }
};

function applySetupDoctorScenario(inputs, scenario) {
  const next = cloneJson(inputs);
  const starterModel = defaultStarterModelName();
  const simulatedModel = { name: starterModel, id: "simulated", size: "2.0 GB", modified: "simulated" };
  const missingOllamaDetail = "Ollama CLI was not found in the simulated clean-machine environment.";
  const stoppedOllamaDetail = "Ollama is installed, but the local server is not responding.";

  next.sourceCheck = { ok: true, detail: "Ready" };
  next.dataCheck = { ok: true, detail: "Ready" };
  next.sources = next.sources || { totalFiles: 1, sampledFiles: 1, totalSizeBytes: 1024 };
  next.toolStatus.ollama = { ok: true, label: "Available", detail: "ollama version is available" };
  next.ollama = { ...next.ollama, ok: true, version: "ollama version is available", models: [simulatedModel], selectedModel: starterModel, error: "" };
  next.pythonStatus = { ok: true, label: "Python 3.x", detail: "python responded." };
  next.hardware.disk = { ...next.hardware.disk, freeBytes: 60 * 1024 * 1024 * 1024, free: "60.00 GB" };

  if (scenario === "missing-ollama") {
    next.toolStatus.ollama = { ok: false, label: "Missing", detail: missingOllamaDetail };
    next.ollama = { ...next.ollama, ok: false, version: "Unavailable", models: [], selectedModel: "", error: missingOllamaDetail };
  } else if (scenario === "stopped-ollama") {
    next.toolStatus.ollama = { ok: true, label: "Available", detail: "ollama version is available" };
    next.ollama = { ...next.ollama, ok: false, version: "ollama version is available", models: [], selectedModel: "", error: stoppedOllamaDetail };
  } else if (scenario === "no-models") {
    next.toolStatus.ollama = { ok: true, label: "Available", detail: "ollama version is available" };
    next.ollama = { ...next.ollama, ok: true, version: "ollama version is available", models: [], selectedModel: "", error: "" };
  } else if (scenario === "bad-source-folder") {
    next.sourceCheck = { ok: false, detail: "Path does not exist." };
    next.sources = null;
    next.config.sourceRoot = "Z:\\missing\\model-forge-source";
  } else if (scenario === "missing-python") {
    next.pythonStatus = { ok: false, label: "Missing", detail: "python did not respond." };
  } else if (scenario === "low-disk") {
    next.hardware.disk = { ...next.hardware.disk, freeBytes: 5 * 1024 * 1024 * 1024, free: "5.00 GB" };
  } else if (scenario === "c-drive-storage") {
    next.preferredStorage = {
      ...next.preferredStorage,
      preferredDrive: "D:",
      canUsePreferred: true,
      recommendedDataRoot: "D:\\AI\\ModelForge\\.modelforge-data",
      recommendedOllamaModels: "D:\\AI\\Ollama\\models",
      detail: "D: is available, so ModelForge can keep heavy artifacts away from C:."
    };
    next.config = {
      ...next.config,
      dataRoot: "C:\\AI\\ModelForge\\.modelforge-data",
      ollamaModels: "C:\\AI\\Ollama\\models",
      baseModel: next.config.baseModel || starterModel
    };
    next.ollama = { ...next.ollama, modelsRoot: next.config.ollamaModels };
  }

  return next;
}

async function simulateSetupDoctor(body = {}) {
  const scenario = cleanSetting(body.scenario) || "ready";
  if (!setupDoctorScenarioSpecs[scenario]) {
    throw new Error(`Unknown setup doctor scenario: ${scenario}`);
  }
  const inputs = applySetupDoctorScenario(await getSetupDoctorInputs(), scenario);
  const doctor = buildSetupDoctor(inputs);
  return {
    ok: true,
    schema: "modelforge.first_run_doctor_simulation.v1",
    scenario,
    expected: setupDoctorScenarioSpecs[scenario],
    doctor,
    observed: {
      status: doctor.status,
      checkStatuses: Object.fromEntries((doctor.checks || []).map((check) => [check.id, check.status])),
      actionIds: (doctor.actions || []).map((action) => action.id)
    }
  };
}

async function saveSetupConfig(body = {}) {
  const nextConfig = {
    projectId: cleanSetting(body.projectId || setupConfig.projectId),
    projectName: cleanSetting(body.projectName || setupConfig.projectName || "Repo-Aware Local Model"),
    sourceRoot: resolvePathSetting(body.sourceRoot, sourceRoot),
    dataRoot: resolvePathSetting(body.dataRoot, dataRoot),
    ollamaModels: cleanSetting(body.ollamaModels),
    pythonCommand: cleanSetting(body.pythonCommand) || pythonCommand,
    baseModel: cleanSetting(body.baseModel),
    targetModel: cleanSetting(body.targetModel) || defaultTargetModelName(),
    sourceIncludes: joinPatternList(body.sourceIncludes),
    sourceExcludes: joinPatternList(body.sourceExcludes),
    updatedAt: new Date().toISOString()
  };
  const sourceCheck = await pathCheck(nextConfig.sourceRoot);
  if (!sourceCheck.ok) {
    throw new Error(`Source folder is not readable: ${nextConfig.sourceRoot}`);
  }
  applySetupConfig(nextConfig);
  await ensureDataRoot();
  if (nextConfig.ollamaModels) {
    await mkdir(nextConfig.ollamaModels, { recursive: true });
  }
  await mkdir(setupConfigDir, { recursive: true });
  await writeJson(setupConfigPath, nextConfig);
  await upsertCurrentProjectInRegistry();
  return getSetupState();
}

async function runFirstSetup(body = {}) {
  if (body.config) {
    await saveSetupConfig(body.config);
  }
  await ensureDataRoot();
  const modelName = cleanSetting(body.modelName) || defaultTargetModelName();
  const baseModel = cleanSetting(body.baseModel) || setupConfig.baseModel || undefined;
  const create = body.createModel === true;
  const modelExport = await exportOllamaProfile(join(dataRoot, "models", "latest"), {
    baseModel,
    modelName,
    create
  });
  const proofBundle = await buildProofBundle({ requestedBy: "ModelForge setup" });
  const evalReport = await runEvalGates();
  const shareCard = await buildShareCard({ tone: "public" });
  const datasetForge = await buildDatasetForge({ requestedBy: "ModelForge setup" });
  const recipe = await buildForgeRecipe({ modelName, baseModel: modelExport.baseModel });
  return {
    ok: true,
    setup: await getSetupState(),
    results: {
      modelExport,
      proofBundle,
      evalReport,
      shareCard,
      datasetForge,
      recipe
    },
    project: await getProjectPayload()
  };
}

function commandReceipt({ name, ok, status, command, outputPath, summary, stdout, stderr, error, startedAt, endedAt }) {
  return {
    name,
    ok,
    status: status || (ok ? "ok" : "failed"),
    command,
    outputPath,
    summary,
    stdoutTail: tail(stdout || "", 2000),
    stderrTail: tail(stderr || "", 2000),
    error: error || "",
    startedAt,
    endedAt
  };
}

function safeModelName(value = "") {
  const modelName = cleanSetting(value);
  return /^[a-z0-9][a-z0-9._:/-]{0,120}$/i.test(modelName) ? modelName : "";
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function startDetachedCommand(command, args, options = {}) {
  try {
    const child = spawn(command, args, {
      cwd: options.cwd || projectRoot,
      env: commandEnv(options.env || {}),
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.on("error", () => {});
    child.unref();
    return { ok: true, pid: child.pid || 0, error: "" };
  } catch (error) {
    return { ok: false, pid: 0, error: String(error?.message || error) };
  }
}

async function waitForOllamaReady(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let latest = await getOllamaStatus({ force: true });
  while (!latest.ok && Date.now() < deadline) {
    await sleep(600);
    latest = await getOllamaStatus({ force: true });
  }
  return latest;
}

async function runStartOllamaRepair(body = {}) {
  const actionId = "start-ollama";
  const startedAt = new Date().toISOString();
  const receiptDir = join(dataRoot, "setup", "repairs");
  const receiptPath = join(receiptDir, `repair-${startedAt.replaceAll(":", "-").replace(/\.\d+Z$/, "Z")}.json`);
  const command = ["ollama", "serve"];
  const actualCommand = [ollamaCommand(), "serve"];
  await ensureDataRoot();
  await mkdir(receiptDir, { recursive: true });

  if (body.dryRun === true) {
    const dryRunReceipt = {
      schema: "modelforge.setup_repair.v1",
      actionId,
      ok: true,
      dryRun: true,
      command,
      outputPath: receiptPath,
      summary: "Ready to start Ollama with ollama serve.",
      startedAt,
      endedAt: new Date().toISOString()
    };
    return {
      ok: true,
      repair: dryRunReceipt,
      setup: await getSetupState(),
      project: await getProjectPayload(),
      ollama: await getOllamaStatus({ force: true })
    };
  }

  const before = await getOllamaStatus({ force: true });
  const toolStatus = await getToolStatus();
  if (!toolStatus.ollama.ok) {
    const endedAt = new Date().toISOString();
    const receipt = {
      schema: "modelforge.setup_repair.v1",
      actionId,
      ok: false,
      dryRun: false,
      command,
      processId: 0,
      beforeOk: before.ok,
      afterOk: false,
      outputPath: receiptPath,
      receipt: commandReceipt({
        name: "Setup repair: start Ollama",
        ok: false,
        status: "failed",
        command,
        outputPath: receiptPath,
        summary: "Ollama CLI is not installed, so ModelForge cannot start it.",
        stderr: toolStatus.ollama.detail,
        error: toolStatus.ollama.detail,
        startedAt,
        endedAt
      }),
      startedAt,
      endedAt,
      summary: "Install Ollama before starting it from ModelForge."
    };
    await writeJson(receiptPath, receipt);
    return {
      ok: false,
      error: receipt.receipt.error || receipt.summary,
      repair: receipt,
      setup: await getSetupState(),
      project: await getProjectPayload(),
      ollama: before
    };
  }

  const launch = before.ok ? { ok: true, pid: 0, error: "" } : startDetachedCommand(actualCommand[0], actualCommand.slice(1));
  const after = before.ok ? before : await waitForOllamaReady();
  const ok = Boolean(after.ok);
  const endedAt = new Date().toISOString();
  const receipt = {
    schema: "modelforge.setup_repair.v1",
    actionId,
    ok,
    dryRun: false,
    command,
    processId: launch.pid,
    beforeOk: before.ok,
    afterOk: after.ok,
    outputPath: receiptPath,
    receipt: commandReceipt({
      name: "Setup repair: start Ollama",
      ok,
      status: ok ? "ok" : "failed",
      command,
      outputPath: receiptPath,
      summary: ok ? "Ollama is responding to local model commands." : "ModelForge could not start or reach Ollama.",
      stdout: launch.pid ? `Started detached process ${launch.pid}.` : before.ok ? "Ollama was already responding." : "",
      stderr: after.ok ? "" : after.error || launch.error,
      error: ok ? "" : after.error || launch.error || "Ollama did not respond before the repair timeout.",
      startedAt,
      endedAt
    }),
    startedAt,
    endedAt,
    summary: ok ? "Ollama is running." : "Start Ollama repair failed."
  };
  await writeJson(receiptPath, receipt);
  return {
    ok,
    error: ok ? "" : receipt.receipt.error || receipt.summary,
    repair: receipt,
    setup: await getSetupState(),
    project: await getProjectPayload(),
    ollama: after
  };
}

async function runSetupDoctorAction(body = {}) {
  const actionId = cleanSetting(body.actionId);
  if (actionId === "start-ollama") {
    return runStartOllamaRepair(body);
  }
  if (actionId !== "pull-small-model") {
    throw new Error(`Unsupported setup repair action: ${actionId || "missing"}`);
  }

  const modelName = safeModelName(body.modelName) || defaultStarterModelName();
  const startedAt = new Date().toISOString();
  const receiptDir = join(dataRoot, "setup", "repairs");
  const receiptPath = join(receiptDir, `repair-${startedAt.replaceAll(":", "-").replace(/\.\d+Z$/, "Z")}.json`);
  const command = ["ollama", "pull", modelName];
  const actualCommand = [ollamaCommand(), "pull", modelName];
  await ensureDataRoot();
  await mkdir(receiptDir, { recursive: true });

  if (body.dryRun === true) {
    const dryRunReceipt = {
      schema: "modelforge.setup_repair.v1",
      actionId,
      modelName,
      ok: true,
      dryRun: true,
      command,
      outputPath: receiptPath,
      summary: `Ready to install starter model ${modelName}.`,
      startedAt,
      endedAt: new Date().toISOString()
    };
    return {
      ok: true,
      repair: dryRunReceipt,
      setup: await getSetupState(),
      project: await getProjectPayload(),
      ollama: await getOllamaStatus({ force: true })
    };
  }

  const before = await getOllamaStatus({ force: true });
  const result = await runCommand(actualCommand[0], actualCommand.slice(1), { timeout: 20 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 });
  const after = await getOllamaStatus({ force: true });
  const installed = after.models.some((model) => model.name === modelName);
  const ok = result.ok && installed;
  if (installed) {
    await saveSetupConfig({ ...currentSetupConfig(), baseModel: modelName });
  }
  const endedAt = new Date().toISOString();
  const receipt = {
    schema: "modelforge.setup_repair.v1",
    actionId,
    modelName,
    ok,
    dryRun: false,
    beforeModelCount: before.models.length,
    afterModelCount: after.models.length,
    receipt: commandReceipt({
      name: "Setup repair: install starter model",
      ok,
      status: ok ? "ok" : "failed",
      command,
      outputPath: receiptPath,
      summary: ok ? `Installed starter model ${modelName} and saved it as the base model.` : `Could not verify starter model ${modelName} after Ollama pull.`,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error,
      startedAt,
      endedAt
    }),
    startedAt,
    endedAt,
    outputPath: receiptPath,
    summary: ok ? `Installed starter model ${modelName}.` : `Starter model repair failed for ${modelName}.`
  };
  await writeJson(receiptPath, receipt);
  return {
    ok,
    error: ok ? "" : receipt.receipt.error || receipt.receipt.stderrTail || receipt.summary,
    repair: receipt,
    setup: await getSetupState(),
    project: await getProjectPayload(),
    ollama: after
  };
}

function cleanTerminalText(text) {
  const normalized = String(text || "")
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u2800-\u28ff]/g, "")
    .replace(/\r/g, "\n")
    .replace(/(?:gathering model components\s*){2,}/gi, "gathering model components\n")
    .replace(/success\s+gathering model components/gi, "success\ngathering model components")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  const seenProgress = new Set();
  return normalized
    .split(/\n/)
    .map((line) => line.trimEnd())
    .filter((line) => {
      const key = line.trim();
      if (!key) return false;
      if (/^(gathering model components|using existing layer sha256:[a-f0-9]+|writing manifest|success)$/i.test(key)) {
        if (seenProgress.has(key)) return false;
        seenProgress.add(key);
      }
      return true;
    })
    .join("\n");
}

function tail(text, length) {
  const clean = cleanTerminalText(text);
  return clean.length <= length ? clean : clean.slice(clean.length - length);
}

function isInsidePath(parent, candidate) {
  const relativePath = relative(parent, candidate);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

async function getOllamaCliStatus({ force = false } = {}) {
  const now = Date.now();
  if (!force && ollamaCliCache.value && ollamaCliCache.expiresAt > now) {
    return ollamaCliCache.value;
  }
  if (!force && ollamaCliCache.promise) {
    return ollamaCliCache.promise;
  }
  ollamaCliCache.promise = (async () => {
    let result = await runCommand(ollamaCommand(), ["--version"], { timeout: 5000 });
    if (!result.ok) {
      await sleep(250);
      result = await runCommand(ollamaCommand(), ["--version"], { timeout: 5000 });
    }
    ollamaCliCache.value = result;
    ollamaCliCache.expiresAt = Date.now() + 2000;
    ollamaCliCache.promise = null;
    return result;
  })();
  return ollamaCliCache.promise;
}

async function getToolStatus() {
  const [repomori, agentledger, ollama] = await Promise.all([
    runCommand(pythonCommand, ["-m", "repomori", "--help"], { timeout: 5000 }),
    runCommand(pythonCommand, ["-m", "agentledger", "--version"], { timeout: 5000 }),
    getOllamaCliStatus()
  ]);

  return {
    repomori: {
      ok: repomori.ok,
      label: repomori.ok ? "Available" : "Missing",
      detail: repomori.ok ? `${pythonCommand} -m repomori` : "RepoMori is not installed in the active Python."
    },
    agentledger: {
      ok: agentledger.ok,
      label: agentledger.ok ? "Available" : "Missing",
      detail: agentledger.stdout.trim() || agentledger.stderr.trim() || agentledger.error
    },
    ollama: {
      ok: ollama.ok,
      label: ollama.ok ? "Available" : "Missing",
      detail: ollama.stdout.trim() || ollama.stderr.trim() || ollama.error
    }
  };
}

async function sha256File(path) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", rejectHash);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function diagnosticPath(pathValue = "") {
  const raw = String(pathValue || "");
  if (!raw) return "";
  const normalized = raw.replaceAll("/", "\\");
  const home = os.homedir().replaceAll("/", "\\");
  if (home && normalized.toLowerCase().startsWith(home.toLowerCase())) {
    return `~${normalized.slice(home.length)}`;
  }
  return normalized.replace(/^([A-Z]:\\Users\\)[^\\]+/i, "$1~");
}

function sanitizeDiagnosticText(value = "") {
  let text = String(value || "");
  const pathValues = [os.homedir(), projectRoot, sourceRoot, dataRoot, setupConfigPath, projectRegistryPath].filter(Boolean);
  for (const pathValue of pathValues) {
    const escaped = String(pathValue).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(escaped, "gi"), diagnosticPath(pathValue));
  }
  text = text
    .replace(/[A-Z]:\\Users\\[^\\\s"]+/gi, (match) => diagnosticPath(match))
    .replace(/(api[_-]?key|token|secret|password|credential)(["'=:\s]+)[^"'\s,}]+/gi, "$1$2[redacted]");
  return text;
}

async function diagnosticResult(label, fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error: sanitizeDiagnosticText(error?.message || error), label };
  }
}

function diagnosticArtifactPath(pathValue = "") {
  return pathValue ? diagnosticPath(pathValue) : "";
}

async function listDiagnosticsLogs() {
  const logsRoot = join(dataRoot, "logs");
  try {
    await mkdir(logsRoot, { recursive: true });
    const entries = await readdir(logsRoot, { withFileTypes: true });
    const logs = [];
    for (const entry of entries.filter((item) => item.isFile())) {
      const logPath = join(logsRoot, entry.name);
      const logStat = await stat(logPath);
      logs.push({
        name: entry.name,
        path: diagnosticPath(logPath),
        size: formatBytes(logStat.size),
        sizeBytes: logStat.size,
        modifiedAt: logStat.mtime.toISOString()
      });
    }
    return logs.sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt))).slice(0, 12);
  } catch (error) {
    return [{ name: "logs-unavailable", path: diagnosticPath(logsRoot), size: "0 B", sizeBytes: 0, modifiedAt: "", error: sanitizeDiagnosticText(error?.message || error) }];
  }
}

function diagnosticsMarkdown(report) {
  const checks = report.setup.doctorChecks.map((check) => `- ${check.status}: ${check.label} - ${check.value}`).join("\n") || "- No doctor checks reported.";
  const logs = report.logs.recentFiles.map((log) => `- ${log.name} (${log.size})`).join("\n") || "- No recent log files.";
  const nextSteps = report.nextSteps.map((step) => `- ${step}`).join("\n") || "- No immediate diagnostics blocker was found. Continue with the guided build path.";
  return [
    "# ModelForge Diagnostics",
    "",
    `Created: ${report.createdAt}`,
    `App: ${report.app.version} (${report.app.gitCommit || "unknown commit"})`,
    `Project: ${report.project.name}`,
    `Doctor: ${report.setup.doctorStatus} - ${report.setup.doctorTitle}`,
    "",
    "## Privacy",
    "",
    report.privacy.summary,
    "",
    "## Paths",
    "",
    `- Source: ${report.paths.sourceRoot}`,
    `- Data: ${report.paths.dataRoot}`,
    `- Logs: ${report.paths.logsRoot}`,
    "",
    "## Doctor Checks",
    "",
    checks,
    "",
    "## Current Build State",
    "",
    `- Sources: ${report.project.sourceFiles} files`,
    `- Ollama: ${report.ollama.ok ? "running" : "not ready"} (${report.ollama.selectedModel || report.ollama.error || "no model"})`,
    `- Proof: ${report.artifacts.proof.status}`,
    `- Eval: ${report.artifacts.eval.summary || "missing"}`,
    `- Dataset: ${report.artifacts.dataset.summary || "missing"}`,
    `- Recipe: ${report.artifacts.recipe.status}`,
    `- Build From Plan: ${report.artifacts.builderRun.status}`,
    "",
    "## Recent Logs",
    "",
    logs,
    "",
    "## Suggested Next Steps",
    "",
    nextSteps,
    ""
  ].join("\n");
}

function diagnosticsNextSteps({ setup, project, latestBuildRun }) {
  const steps = [];
  const failedChecks = setup?.doctor?.checks?.filter((check) => check.status === "fail") || [];
  const warnedChecks = setup?.doctor?.checks?.filter((check) => check.status === "warn") || [];
  if (failedChecks.length) {
    steps.push(`Repair ${failedChecks.map((check) => check.label).join(", ")} in Setup, then press Recheck.`);
  } else if (warnedChecks.length) {
    steps.push(`Review ${warnedChecks.map((check) => check.label).join(", ")} before calling the machine v1-ready.`);
  }
  if (!project?.latestProof) {
    steps.push("Build proof so release gates can point to current evidence.");
  }
  if (project?.latestProof && project?.latestEval && project.latestEval.proofPath !== project.latestProof.path) {
    steps.push("Run release gates again because the eval report points at an older proof.");
  }
  if (!project?.latestRecipeRun || project.latestRecipeRun.status !== "pass") {
    steps.push("Run the export pack to prove the Ollama target can be recreated from the recipe.");
  }
  if (latestBuildRun?.status === "failed" || latestBuildRun?.status === "fail") {
    steps.push(`Rerun Build From Plan after fixing: ${latestBuildRun.error || latestBuildRun.summary}`);
  }
  return steps.slice(0, 5);
}

async function buildDiagnosticsReport() {
  await ensureDataRoot();
  const createdAt = new Date().toISOString();
  const [packageInfo, gitCommit, gitStatus, setupResult, projectResult, hardwareResult, ollamaResult, registryResult, logs] = await Promise.all([
    diagnosticResult("package", () => readJsonIfExists(join(projectRoot, "package.json"))),
    diagnosticResult("git-commit", async () => (await runCommand("git", ["rev-parse", "--short", "HEAD"], { timeout: 4000 })).stdout.trim()),
    diagnosticResult("git-status", async () => sanitizeDiagnosticText((await runCommand("git", ["status", "--short"], { timeout: 4000 })).stdout.trim())),
    diagnosticResult("setup", () => getSetupState()),
    diagnosticResult("project", () => getProjectPayload()),
    diagnosticResult("hardware", () => getHardwareProfile()),
    diagnosticResult("ollama", () => getOllamaStatus()),
    diagnosticResult("registry", () => getProjectRegistry()),
    listDiagnosticsLogs()
  ]);

  const setup = setupResult.ok ? setupResult.value : null;
  const project = projectResult.ok ? projectResult.value : null;
  const hardware = hardwareResult.ok ? hardwareResult.value : null;
  const ollama = ollamaResult.ok ? ollamaResult.value : null;
  const registry = registryResult.ok ? registryResult.value : null;
  const latestBuildRun = project?.latestBuilderRun || null;
  const diagnosticsJsonPath = join(dataRoot, "logs", "latest-diagnostics.json");
  const diagnosticsMarkdownPath = join(dataRoot, "logs", "latest-diagnostics.md");
  const pkg = packageInfo.ok && packageInfo.value ? packageInfo.value : {};

  const report = {
    schema: "modelforge.diagnostics.v1",
    createdAt,
    privacy: {
      summary: "Environment variables, secrets, full home-directory paths, and raw source contents are not included. Home paths are shortened to ~.",
      pathPolicy: "home-relative",
      sourceContentsIncluded: false,
      environmentIncluded: false
    },
    app: {
      name: pkg.name || "model-forge",
      version: pkg.version || "unknown",
      gitCommit: gitCommit.ok ? gitCommit.value : "",
      gitDirty: gitStatus.ok ? Boolean(gitStatus.value) : null,
      node: process.version
    },
    system: {
      os: process.platform,
      arch: process.arch,
      release: os.release()
    },
    paths: {
      projectRoot: diagnosticPath(projectRoot),
      sourceRoot: diagnosticPath(sourceRoot),
      dataRoot: diagnosticPath(dataRoot),
      setupConfig: diagnosticPath(setupConfigPath),
      projectRegistry: diagnosticPath(projectRegistryPath),
      logsRoot: diagnosticPath(join(dataRoot, "logs"))
    },
    setup: {
      loaded: setupResult.ok,
      error: setupResult.ok ? "" : setupResult.error,
      configured: Boolean(setup?.configured),
      doctorStatus: setup?.doctor?.status || "unknown",
      doctorTitle: setup?.doctor?.title || "unknown",
      doctorSummary: setup?.doctor?.summary || "",
      doctorChecks: (setup?.doctor?.checks || []).map((check) => ({
        id: check.id,
        label: check.label,
        status: check.status,
        value: sanitizeDiagnosticText(check.value),
        detail: sanitizeDiagnosticText(check.detail),
        repairActionId: check.repairActionId || ""
      })),
      repairActions: (setup?.doctor?.actions || []).map((action) => ({
        id: action.id,
        label: action.label,
        kind: action.kind,
        tone: action.tone,
        detail: sanitizeDiagnosticText(action.detail),
        command: Array.isArray(action.command) ? action.command.map(sanitizeDiagnosticText) : sanitizeDiagnosticText(action.command || ""),
        busyLabel: action.busyLabel || "",
        modelName: action.modelName || ""
      }))
    },
    storage: {
      preferredDrive: setup?.doctor?.preferredDrive || registry?.recommended?.preferredDrive || "",
      recommendedDataRoot: diagnosticPath(setup?.doctor?.recommended?.dataRoot || registry?.recommended?.dataRoot || ""),
      recommendedOllamaModels: diagnosticPath(setup?.doctor?.recommended?.ollamaModels || registry?.recommended?.ollamaModels || "")
    },
    hardware: {
      loaded: hardwareResult.ok,
      error: hardwareResult.ok ? "" : hardwareResult.error,
      tier: hardware?.tier?.label || setup?.doctor?.hardwareSummary?.tier || "",
      modelFit: hardware?.modelFit?.summary || "",
      cpuThreads: hardware?.cpu?.threads || 0,
      ram: hardware?.memory?.total || setup?.doctor?.hardwareSummary?.ram || "",
      gpu: hardware?.gpu?.detected ? hardware.gpu.totalVram : setup?.doctor?.hardwareSummary?.gpu || "No GPU detected",
      diskFree: hardware?.disk?.free || setup?.doctor?.hardwareSummary?.diskFree || ""
    },
    ollama: {
      loaded: ollamaResult.ok,
      ok: Boolean(ollama?.ok),
      version: ollama?.version || "",
      modelCount: ollama?.models?.length || 0,
      selectedModel: ollama?.selectedModel || "",
      modelsRoot: diagnosticPath(ollama?.modelsRoot || ""),
      error: sanitizeDiagnosticText(ollama?.error || ollamaResult.error || "")
    },
    project: {
      loaded: projectResult.ok,
      error: projectResult.ok ? "" : projectResult.error,
      name: project?.name || setupConfig.projectName || "unknown",
      status: project?.status || "unknown",
      sourceFiles: project?.sources?.totalFiles || 0,
      sampledFiles: project?.sources?.sampledFiles || 0,
      dataRoot: diagnosticPath(project?.dataRoot || dataRoot)
    },
    registry: {
      loaded: registryResult.ok,
      total: registry?.summary?.total || 0,
      active: registry?.summary?.active || 0,
      archived: registry?.summary?.archived || 0,
      activeProjectId: registry?.activeProjectId || ""
    },
    artifacts: {
      proof: {
        status: project?.latestProof ? "ready" : "missing",
        path: diagnosticArtifactPath(project?.latestProof?.path),
        builtAt: project?.latestProof?.builtAt || ""
      },
      eval: {
        status: project?.latestEval ? "ready" : "missing",
        summary: project?.latestEval?.summary || "",
        proofPath: diagnosticArtifactPath(project?.latestEval?.proofPath)
      },
      dataset: {
        status: project?.latestDataset ? "ready" : "missing",
        datasetId: project?.latestDataset?.datasetId || "",
        summary: project?.latestDataset?.summary ? `${project.latestDataset.summary.totalExamples} examples, ${project.latestDataset.summary.estimatedTokens} tokens` : ""
      },
      recipe: {
        status: project?.latestRecipe?.status || "missing",
        recipeId: project?.latestRecipe?.recipeId || "",
        exportDir: diagnosticArtifactPath(project?.latestRecipe?.files?.exportDir)
      },
      recipeRun: {
        status: project?.latestRecipeRun?.status || "missing",
        runId: project?.latestRecipeRun?.runId || "",
        summary: sanitizeDiagnosticText(project?.latestRecipeRun?.summary || "")
      },
      builderRun: {
        status: latestBuildRun?.status || "missing",
        runId: latestBuildRun?.runId || "",
        summary: sanitizeDiagnosticText(latestBuildRun?.summary || ""),
        receipt: diagnosticArtifactPath(latestBuildRun?.files?.receipt)
      }
    },
    jobs: {
      activeRecipeRuns: [...recipeRunJobs.values()].filter((job) => job?.run?.status === "running").length,
      activeBuilderRuns: [...builderRunJobs.values()].filter((job) => job?.run?.status === "running").length
    },
    logs: {
      recentFiles: logs,
      latestJson: diagnosticPath(diagnosticsJsonPath),
      latestMarkdown: diagnosticPath(diagnosticsMarkdownPath)
    },
    health: {
      package: packageInfo.ok,
      gitCommit: gitCommit.ok,
      gitStatus: gitStatus.ok,
      setup: setupResult.ok,
      project: projectResult.ok,
      hardware: hardwareResult.ok,
      ollama: ollamaResult.ok,
      registry: registryResult.ok
    },
    nextSteps: diagnosticsNextSteps({ setup, project, latestBuildRun })
  };

  await writeJson(diagnosticsJsonPath, report);
  await writeFile(diagnosticsMarkdownPath, diagnosticsMarkdown(report), "utf-8");
  report.files = {
    json: diagnosticPath(diagnosticsJsonPath),
    markdown: diagnosticPath(diagnosticsMarkdownPath),
    downloadName: `model-forge-diagnostics-${createdAt.replaceAll(":", "-").replace(/\.\d+Z$/, "Z")}.json`
  };
  await writeJson(diagnosticsJsonPath, report);
  await writeFile(diagnosticsMarkdownPath, diagnosticsMarkdown(report), "utf-8");
  return report;
}

function estimateDatasetMetrics(sources) {
  const rows = Math.max(sources.totalFiles * 9, sources.sampledFiles * 8, 128);
  const tokens = Math.max(sources.totalFiles * 3600, 4200);
  const estimatedMegabytes = Math.max(1, Math.round((sources.totalSizeBytes / 1024 / 1024) * 7));
  const reviewedPercent = sources.totalFiles ? Math.round((sources.reviewedFiles / sources.totalFiles) * 100) : 0;
  return {
    rows,
    tokens,
    estimatedSize: `${estimatedMegabytes} MB est.`,
    reviewedPercent
  };
}

function builderPlanId() {
  return `build-plan-${new Date().toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "Z")}`;
}

function parseJsonLoose(text) {
  try {
    return JSON.parse(String(text || "").trim());
  } catch {
    return null;
  }
}

function parseNvidiaGpus(output) {
  return String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, memory, driverVersion] = line.split(",").map((part) => part.trim());
      const memoryMb = Math.max(0, Math.round(Number(memory) || 0));
      return {
        name: name || "NVIDIA GPU",
        memoryMb,
        memory: memoryMb ? `${memoryMb.toLocaleString()} MB` : "Unknown",
        driverVersion: driverVersion || "",
        source: "nvidia-smi"
      };
    });
}

function normalizeVideoController(controller) {
  const adapterBytes = Math.max(0, Number(controller?.AdapterRAM || controller?.adapterRam || 0));
  const memoryMb = adapterBytes ? Math.round(adapterBytes / 1024 / 1024) : 0;
  return {
    name: String(controller?.Name || controller?.name || "Display adapter"),
    memoryMb,
    memory: memoryMb ? `${memoryMb.toLocaleString()} MB` : "Unknown",
    driverVersion: String(controller?.DriverVersion || controller?.driverVersion || ""),
    source: "Win32_VideoController"
  };
}

async function getWindowsVideoControllers() {
  if (process.platform !== "win32") return [];
  const script = [
    "$controllers = Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue |",
    "Select-Object Name,AdapterRAM,DriverVersion;",
    "if ($controllers) { $controllers | ConvertTo-Json -Compress }"
  ].join(" ");
  const result = await runCommand("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { timeout: 6000 });
  if (!result.ok || !result.stdout.trim()) return [];
  const parsed = parseJsonLoose(result.stdout);
  return (Array.isArray(parsed) ? parsed : parsed ? [parsed] : []).map(normalizeVideoController);
}

async function getDataDriveSpace() {
  const driveMatch = dataRoot.match(/^([a-z]):/i);
  if (process.platform === "win32" && driveMatch) {
    const driveName = driveMatch[1].toUpperCase();
    const script = [
      `$drive = Get-PSDrive -Name '${driveName}' -ErrorAction SilentlyContinue;`,
      "if ($drive) { [pscustomobject]@{ Name=$drive.Name; Root=$drive.Root; Free=$drive.Free; Used=$drive.Used } | ConvertTo-Json -Compress }"
    ].join(" ");
    const result = await runCommand("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { timeout: 6000 });
    const parsed = result.ok ? parseJsonLoose(result.stdout) : null;
    if (parsed) {
      const freeBytes = Math.max(0, Number(parsed.Free || 0));
      const usedBytes = Math.max(0, Number(parsed.Used || 0));
      return {
        dataRoot,
        root: String(parsed.Root || `${driveName}:\\`),
        freeBytes,
        free: formatBytes(freeBytes),
        usedBytes,
        used: formatBytes(usedBytes),
        source: "Get-PSDrive"
      };
    }
  }

  if (process.platform !== "win32") {
    const result = await runCommand("df", ["-k", dataRoot], { timeout: 6000 });
    const lines = result.stdout.split(/\r?\n/).filter(Boolean);
    const fields = lines[1]?.trim().split(/\s+/) || [];
    const freeBytes = Math.max(0, Number(fields[3] || 0) * 1024);
    const usedBytes = Math.max(0, Number(fields[2] || 0) * 1024);
    if (freeBytes || usedBytes) {
      return {
        dataRoot,
        root: fields[5] || dataRoot,
        freeBytes,
        free: formatBytes(freeBytes),
        usedBytes,
        used: formatBytes(usedBytes),
        source: "df"
      };
    }
  }

  return {
    dataRoot,
    root: dataRoot,
    freeBytes: 0,
    free: "Unknown",
    usedBytes: 0,
    used: "Unknown",
    source: "unavailable"
  };
}

function hardwareTierFor({ totalMemoryBytes, totalVramMb, gpuDetected }) {
  const totalMemoryGb = totalMemoryBytes / 1024 / 1024 / 1024;
  if (totalVramMb >= 24576 && totalMemoryGb >= 48) {
    return {
      id: "workstation",
      label: "Workstation builder",
      detail: "Strong local adapter builds are realistic, with room for larger quantized bases.",
      canTrainAdapter: true,
      canRunQuantized: true
    };
  }
  if (totalVramMb >= 12000 && totalMemoryGb >= 24) {
    return {
      id: "adapter-ready",
      label: "Adapter-ready",
      detail: "LoRA/QLoRA-style adapter builds are plausible once a runner is connected.",
      canTrainAdapter: true,
      canRunQuantized: true
    };
  }
  if (totalVramMb >= 8000 && totalMemoryGb >= 16) {
    return {
      id: "starter-lora",
      label: "Starter adapter",
      detail: "Small adapter experiments may fit, but dataset/export builds are the safer default.",
      canTrainAdapter: true,
      canRunQuantized: true
    };
  }
  if (totalMemoryGb >= 16 || gpuDetected) {
    return {
      id: "profile-dataset",
      label: "Profile and dataset builder",
      detail: "Best route is local profiles, source-grounded datasets, and export packs before training.",
      canTrainAdapter: false,
      canRunQuantized: true
    };
  }
  return {
    id: "small-local",
    label: "Small local builder",
    detail: "Keep the build light: proof, dataset, compact local models, and external training later.",
    canTrainAdapter: false,
    canRunQuantized: false
  };
}

function fitStatus(rank) {
  if (rank >= 3) return "comfortable";
  if (rank === 2) return "possible";
  if (rank === 1) return "tight";
  return "avoid";
}

function estimateModelFit(hardwareInput) {
  const memoryGb = hardwareInput.totalMemoryBytes / 1024 / 1024 / 1024;
  const vramGb = hardwareInput.totalVramMb / 1024;
  const hasGpu = hardwareInput.gpuDetected;
  const candidates = [
    {
      id: "small-instruct",
      label: "1B-3B instruct",
      localUse: fitStatus(memoryGb >= 12 ? 3 : memoryGb >= 8 ? 2 : 1),
      buildUse: fitStatus(memoryGb >= 16 ? 3 : memoryGb >= 8 ? 2 : 1),
      detail: "Best first target for laptops and proof-aware assistants."
    },
    {
      id: "seven-b-quantized",
      label: "7B/8B quantized",
      localUse: fitStatus(vramGb >= 8 || memoryGb >= 24 ? 3 : vramGb >= 6 || memoryGb >= 16 ? 2 : 0),
      buildUse: fitStatus(vramGb >= 12 ? 3 : vramGb >= 8 ? 2 : vramGb >= 6 ? 1 : 0),
      detail: "Useful general local model class; GPU memory decides comfort."
    },
    {
      id: "fourteen-b-quantized",
      label: "13B/14B quantized",
      localUse: fitStatus(vramGb >= 16 || memoryGb >= 48 ? 3 : vramGb >= 12 || memoryGb >= 32 ? 2 : 0),
      buildUse: fitStatus(vramGb >= 20 ? 3 : vramGb >= 16 ? 2 : vramGb >= 12 ? 1 : 0),
      detail: "Better reasoning, but expensive for mid-range machines."
    },
    {
      id: "lora-adapter",
      label: "LoRA adapter training",
      localUse: fitStatus(vramGb >= 16 ? 3 : vramGb >= 8 ? 2 : vramGb >= 6 ? 1 : 0),
      buildUse: fitStatus(vramGb >= 16 ? 3 : vramGb >= 8 ? 2 : vramGb >= 6 ? 1 : 0),
      detail: "Real adapter training wants more VRAM than simple local inference."
    },
    {
      id: "multimodal",
      label: "Vision/audio models",
      localUse: fitStatus(vramGb >= 16 ? 3 : vramGb >= 12 ? 2 : hasGpu ? 1 : 0),
      buildUse: fitStatus(vramGb >= 24 ? 3 : vramGb >= 16 ? 2 : vramGb >= 12 ? 1 : 0),
      detail: "Keep this as a later route unless the GPU has generous memory."
    }
  ];
  const bestLocal = candidates.find((candidate) => candidate.localUse === "comfortable") || candidates.find((candidate) => candidate.localUse === "possible") || candidates[0];
  const adapterCandidate = candidates.find((candidate) => candidate.id === "lora-adapter");
  return {
    schema: "modelforge.model_fit.v1",
    createdAt: new Date().toISOString(),
    summary: bestLocal
      ? `Best local fit: ${bestLocal.label}. Adapter training: ${adapterCandidate?.buildUse || "avoid"}.`
      : "No model fit estimate is available.",
    candidates
  };
}

async function getHardwareProfile() {
  const [nvidia, windowsControllers, disk, ollama] = await Promise.all([
    runCommand("nvidia-smi", ["--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits"], { timeout: 6000 }),
    getWindowsVideoControllers(),
    getDataDriveSpace(),
    getOllamaStatus()
  ]);
  const nvidiaDevices = nvidia.ok ? parseNvidiaGpus(nvidia.stdout) : [];
  const fallbackDevices = nvidiaDevices.length ? [] : windowsControllers;
  const devices = [...nvidiaDevices, ...fallbackDevices];
  const totalVramMb = devices.reduce((total, device) => total + Math.max(0, Number(device.memoryMb || 0)), 0);
  const totalMemoryBytes = os.totalmem();
  const tier = hardwareTierFor({
    totalMemoryBytes,
    totalVramMb,
    gpuDetected: devices.length > 0
  });
  const modelFit = estimateModelFit({
    totalMemoryBytes,
    totalVramMb,
    gpuDetected: devices.length > 0
  });

  return {
    schema: "modelforge.hardware_profile.v1",
    createdAt: new Date().toISOString(),
    platform: {
      os: os.platform(),
      arch: os.arch(),
      release: os.release()
    },
    cpu: {
      model: os.cpus()[0]?.model || "Unknown CPU",
      cores: Math.max(1, Math.ceil((os.cpus().length || 1) / 2)),
      threads: os.cpus().length || 1
    },
    memory: {
      totalBytes: totalMemoryBytes,
      total: formatBytes(totalMemoryBytes),
      freeBytes: os.freemem(),
      free: formatBytes(os.freemem())
    },
    disk,
    gpu: {
      detected: devices.length > 0,
      source: nvidiaDevices.length ? "nvidia-smi" : fallbackDevices.length ? "Win32_VideoController" : "none",
      totalVramMb,
      totalVram: totalVramMb ? `${totalVramMb.toLocaleString()} MB` : "Unknown",
      devices
    },
    ollama: {
      ok: ollama.ok,
      version: ollama.version,
      selectedModel: ollama.selectedModel,
      modelCount: ollama.models.length,
      modelsRoot: ollama.modelsRoot
    },
    tier,
    modelFit
  };
}

function normalizeBuilderRequest(body = {}) {
  const rawDataTypes = Array.isArray(body.dataTypes) ? body.dataTypes : [];
  const dataTypes = rawDataTypes.map((item) => cleanSetting(item).toLowerCase()).filter(Boolean).slice(0, 8);
  const templateId = cleanSetting(body.templateId || "custom").slice(0, 80);
  const aiType = cleanSetting(body.aiType || "coding-helper").slice(0, 80);
  return {
    aiName: cleanSetting(body.aiName || defaultAiName({ templateId, aiType })).slice(0, 120),
    voice: cleanSetting(body.voice || defaultVoiceFor({ templateId, aiType })).slice(0, 80),
    intent: cleanSetting(body.intent).slice(0, 1200),
    templateId,
    aiType,
    audience: cleanSetting(body.audience || "personal").slice(0, 80),
    personality: cleanSetting(body.personality || "practical").slice(0, 80),
    privacy: cleanSetting(body.privacy || "local-only").slice(0, 80),
    qualitySpeed: cleanSetting(body.qualitySpeed || "balanced").slice(0, 80),
    buildMode: cleanSetting(body.buildMode || "auto").slice(0, 80),
    hardwarePreference: cleanSetting(body.hardwarePreference || "auto-fit").slice(0, 80),
    targetDevice: cleanSetting(body.targetDevice || "this machine").slice(0, 120),
    knowledgeSource: cleanSetting(body.knowledgeSource || "project-source").slice(0, 80),
    sourceScope: cleanSetting(body.sourceScope || "whole-project").slice(0, 80),
    boundaryMode: cleanSetting(body.boundaryMode || "source-backed").slice(0, 80),
    dataTypes: dataTypes.length ? dataTypes : ["code", "documents"]
  };
}

function aiTypeSpec(aiType = "") {
  const specs = {
    "coding-helper": {
      label: "Coding helper",
      promise: "answers implementation questions with file-backed evidence",
      capability: "Source-grounded code explanations and build/run guidance."
    },
    "learning-tutor": {
      label: "Learning tutor",
      promise: "turns local material into patient explanations and practice prompts",
      capability: "Step-by-step tutoring from the selected source boundary."
    },
    "business-assistant": {
      label: "Business assistant",
      promise: "summarizes operational knowledge and drafts reusable team answers",
      capability: "Team-ready briefs, decisions, and repeatable operating notes."
    },
    "research-bot": {
      label: "Research bot",
      promise: "organizes evidence and keeps claims tied to sources",
      capability: "Evidence summaries, comparison notes, and citation-ready answers."
    },
    "support-bot": {
      label: "Support bot",
      promise: "answers support-style questions from approved local knowledge",
      capability: "Customer-safe responses with clear unknown/unsupported handling."
    },
    "game-npc": {
      label: "Game NPC",
      promise: "uses local lore and rules to respond in character",
      capability: "Character behavior drafts, dialogue, and scenario knowledge packs."
    }
  };
  return specs[aiType] || specs["coding-helper"];
}

function knowledgeSourceLabel(value = "") {
  if (value === "docs-only") return "documentation only";
  if (value === "selected-files") return "selected files first";
  if (value === "mixed-local") return "mixed local source and notes";
  return "the configured project source";
}

function templateLabel(value = "") {
  if (value === "repo-copilot") return "Repo copilot";
  if (value === "docs-tutor") return "Docs tutor";
  if (value === "support-agent") return "Support agent";
  if (value === "research-brief") return "Research brief bot";
  if (value === "game-lore") return "Game lore NPC";
  return "Custom build";
}

function defaultAiName({ templateId = "", aiType = "" } = {}) {
  if (templateId === "repo-copilot") return "Forge Copilot";
  if (templateId === "docs-tutor") return "Forge Tutor";
  if (templateId === "support-agent") return "Evidence Support";
  if (templateId === "research-brief") return "Research Forge";
  if (templateId === "game-lore") return "Lorekeeper";
  const type = aiTypeSpec(aiType);
  return `${type.label} Forge`;
}

function defaultVoiceFor({ templateId = "", aiType = "" } = {}) {
  if (templateId === "docs-tutor" || aiType === "learning-tutor") return "patient-teacher";
  if (templateId === "research-brief" || aiType === "research-bot") return "evidence-analyst";
  if (templateId === "game-lore" || aiType === "game-npc") return "in-character";
  if (aiType === "coding-helper") return "direct-operator";
  return "calm-practical";
}

function voiceLabel(value = "") {
  if (value === "direct-operator") return "Direct operator";
  if (value === "patient-teacher") return "Patient teacher";
  if (value === "evidence-analyst") return "Evidence analyst";
  if (value === "concise-support") return "Concise support";
  if (value === "in-character") return "In character";
  return "Calm practical";
}

function hardwarePreferenceLabel(value = "") {
  if (value === "low-memory") return "Low-memory safe";
  if (value === "max-quality") return "Maximum local quality";
  if (value === "portable") return "Portable runner";
  return "Auto fit";
}

function sourceScopeLabel(value = "") {
  if (value === "docs-first") return "docs and README first";
  if (value === "code-hotspots") return "code hotspots first";
  if (value === "small-safe-sample") return "a small reviewed starter sample";
  return "the whole project boundary";
}

const sourceScopeIds = ["whole-project", "docs-first", "code-hotspots", "small-safe-sample"];

function normalizeSourceScopeId(value = "") {
  return sourceScopeIds.includes(value) ? value : "whole-project";
}

function sourceScopeSpec(value = "") {
  const id = normalizeSourceScopeId(value);
  const specs = {
    "whole-project": {
      id,
      label: "Whole project",
      detail: "Use every file in the current source boundary."
    },
    "docs-first": {
      id,
      label: "Docs first",
      detail: "Start with README, docs, notes, and text knowledge."
    },
    "code-hotspots": {
      id,
      label: "Code hotspots",
      detail: "Start with implementation files, scripts, and code-facing configs."
    },
    "small-safe-sample": {
      id,
      label: "Small safe sample",
      detail: "Start with a compact reviewed subset that is easier to inspect."
    }
  };
  return specs[id];
}

function sourceScopePreviewRow(row, reason = "") {
  return {
    path: row.path,
    language: row.language,
    size: row.size,
    sizeBytes: row.sizeBytes,
    license: row.license,
    hashShort: row.hashShort,
    reason
  };
}

function isDocsFirstRow(row) {
  const path = String(row.path || "").toLowerCase();
  const extension = extname(path);
  return (
    path === "readme.md" ||
    path.startsWith("docs/") ||
    path.includes("/docs/") ||
    ["markdown", "text"].includes(String(row.language || "").toLowerCase()) ||
    [".md", ".mdx", ".txt", ".rst", ".adoc"].includes(extension)
  );
}

function isCodeHotspotRow(row) {
  const path = String(row.path || "").toLowerCase();
  const language = String(row.language || "").toLowerCase();
  const extension = extname(path);
  if (path === "server.mjs" || path.startsWith("src/") || path.startsWith("scripts/") || path.startsWith("mcp/")) {
    return true;
  }
  if (["typescript", "javascript", "python", "powershell", "css", "html"].includes(language)) {
    return true;
  }
  return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".ps1", ".css", ".html"].includes(extension);
}

function isCodeConfigRow(row) {
  const path = String(row.path || "").toLowerCase();
  const language = String(row.language || "").toLowerCase();
  return (
    ["json", "jsonl", "toml", "yaml"].includes(language) ||
    path === "package.json" ||
    path === "vite.config.ts" ||
    path.startsWith("tsconfig") ||
    path.endsWith(".config.js") ||
    path.endsWith(".config.ts") ||
    path.endsWith(".config.mjs")
  );
}

function hasSensitiveLookingPath(row) {
  const path = String(row.path || "").toLowerCase();
  const name = path.split("/").pop() || path;
  return name.startsWith(".env") || /(^|[\/_.-])(secret|token|password|credential|private|key)([\/_.-]|$)/i.test(path);
}

function sourceScopeBaseDecision(row, scopeId) {
  if (scopeId === "whole-project") {
    return { include: true, reason: "Inside the current project boundary." };
  }
  if (scopeId === "docs-first") {
    return isDocsFirstRow(row)
      ? { include: true, reason: "Documentation, README, or note-style source." }
      : { include: false, reason: "Outside the docs-first starter boundary." };
  }
  if (scopeId === "code-hotspots") {
    return isCodeHotspotRow(row) || isCodeConfigRow(row)
      ? { include: true, reason: "Implementation, script, or code-facing config." }
      : { include: false, reason: "Outside the code-hotspots starter boundary." };
  }
  if (!isDatasetForgeCandidate(row)) {
    return { include: false, reason: "Not a safe text candidate for the starter sample." };
  }
  if (row.sizeBytes > 120_000) {
    return { include: false, reason: "Too large for the small safe starter sample." };
  }
  if (hasSensitiveLookingPath(row)) {
    return { include: false, reason: "Path looks sensitive; review manually before inclusion." };
  }
  if (!isLicenseReviewedLabel(row.license)) {
    return { include: false, reason: "License posture is not reviewed yet." };
  }
  return { include: true, reason: "Reviewed, readable, and compact starter file." };
}

function sourceScopeRank(row, scopeId) {
  const path = String(row.path || "").toLowerCase();
  if (scopeId === "docs-first") {
    if (path === "readme.md") return 0;
    if (path.startsWith("docs/")) return 1;
    if (String(row.language).toLowerCase() === "markdown") return 2;
    return 4;
  }
  if (scopeId === "code-hotspots") {
    if (path === "server.mjs") return 0;
    if (path.startsWith("src/")) return 1;
    if (path.startsWith("scripts/")) return 2;
    if (isCodeConfigRow(row)) return 3;
    return 5;
  }
  if (scopeId === "small-safe-sample") {
    if (path === "readme.md") return 0;
    if (path === "package.json") return 1;
    if (path === "server.mjs") return 2;
    if (path.startsWith("src/")) return 3;
    if (path.startsWith("scripts/")) return 4;
    if (path.startsWith("docs/")) return 5;
    return 8;
  }
  return 10;
}

function resolveSourceScope(sources, scopeId = "whole-project", options = {}) {
  const normalizedScopeId = normalizeSourceScopeId(scopeId);
  const spec = sourceScopeSpec(normalizedScopeId);
  const starterLimit = Math.max(1, Math.min(Number(options.smallSafeLimit || 24), 80));
  const rows = [...(sources?.rows || [])];
  const decisions = rows.map((row, index) => {
    const decision = sourceScopeBaseDecision(row, normalizedScopeId);
    return {
      row,
      index,
      include: decision.include,
      reason: decision.reason,
      rank: sourceScopeRank(row, normalizedScopeId)
    };
  });
  if (normalizedScopeId === "small-safe-sample") {
    const included = decisions
      .filter((decision) => decision.include)
      .sort((left, right) => left.rank - right.rank || left.index - right.index);
    const allowed = new Set(included.slice(0, starterLimit).map((decision) => decision.index));
    for (const decision of decisions) {
      if (decision.include && !allowed.has(decision.index)) {
        decision.include = false;
        decision.reason = `Outside the first ${starterLimit} reviewed starter files.`;
      }
    }
  }
  const ordered = decisions.sort((left, right) => {
    if (left.include !== right.include) return left.include ? -1 : 1;
    return left.rank - right.rank || left.index - right.index;
  });
  const includedDecisions = ordered.filter((decision) => decision.include);
  const excludedDecisions = ordered.filter((decision) => !decision.include);
  const includedRows = includedDecisions.map((decision) => decision.row);
  const excludedRows = excludedDecisions.map((decision) => decision.row);
  const includedSizeBytes = includedRows.reduce((total, row) => total + (row.sizeBytes || 0), 0);
  const excludedSizeBytes = excludedRows.reduce((total, row) => total + (row.sizeBytes || 0), 0);
  return {
    schema: "modelforge.source_scope.v1",
    id: normalizedScopeId,
    label: spec.label,
    detail: spec.detail,
    totalFiles: sources?.totalFiles || 0,
    sampledFiles: sources?.sampledFiles || rows.length,
    includedFiles: includedRows.length,
    excludedFiles: excludedRows.length,
    includedSizeBytes,
    includedSize: formatBytes(includedSizeBytes),
    excludedSizeBytes,
    excludedSize: formatBytes(excludedSizeBytes),
    datasetCandidateFiles: includedRows.filter(isDatasetForgeCandidate).length,
    includedPreview: includedDecisions.slice(0, 10).map((decision) => sourceScopePreviewRow(decision.row, decision.reason)),
    excludedPreview: excludedDecisions.slice(0, 10).map((decision) => sourceScopePreviewRow(decision.row, decision.reason)),
    includedRows,
    excludedRows,
    includedPaths: includedDecisions.map((decision) => sourceScopePreviewRow(decision.row, decision.reason)),
    excludedPaths: excludedDecisions.map((decision) => sourceScopePreviewRow(decision.row, decision.reason))
  };
}

function publicSourceScopeResolution(resolution) {
  return {
    schema: resolution.schema,
    id: resolution.id,
    label: resolution.label,
    detail: resolution.detail,
    totalFiles: resolution.totalFiles,
    sampledFiles: resolution.sampledFiles,
    includedFiles: resolution.includedFiles,
    excludedFiles: resolution.excludedFiles,
    includedSizeBytes: resolution.includedSizeBytes,
    includedSize: resolution.includedSize,
    excludedSizeBytes: resolution.excludedSizeBytes,
    excludedSize: resolution.excludedSize,
    datasetCandidateFiles: resolution.datasetCandidateFiles,
    includedPreview: resolution.includedPreview,
    excludedPreview: resolution.excludedPreview,
    includedPaths: resolution.includedPaths,
    excludedPaths: resolution.excludedPaths
  };
}

function buildSourceScopePreview(sources, selectedScope = "whole-project") {
  return {
    schema: "modelforge.source_scope_preview.v1",
    selected: normalizeSourceScopeId(selectedScope),
    options: sourceScopeIds.map((id) => publicSourceScopeResolution(resolveSourceScope(sources, id)))
  };
}

async function writeSourceScopeReceipt(targetDir, resolution, context = {}) {
  const receiptJson = join(targetDir, "source-scope.json");
  const receiptMarkdown = join(targetDir, "source-scope.md");
  const payload = {
    ...publicSourceScopeResolution(resolution),
    createdAt: new Date().toISOString(),
    requestedBy: context.requestedBy || "ModelForge",
    sourceRoot,
    title: context.title || "ModelForge Source Scope"
  };
  const includedLines = payload.includedPaths.length
    ? payload.includedPaths.map((row) => `- ${row.path} (${row.language}, ${row.size}) - ${row.reason}`)
    : ["- No files included by this scope."];
  const excludedLines = payload.excludedPaths.length
    ? payload.excludedPaths.map((row) => `- ${row.path} (${row.language}, ${row.size}) - ${row.reason}`)
    : ["- No files excluded by this scope."];
  const markdown = [
    `# ${payload.title}`,
    "",
    `Scope: ${payload.label}`,
    `Detail: ${payload.detail}`,
    `Source root: ${sourceRoot}`,
    `Included files: ${payload.includedFiles}`,
    `Excluded files: ${payload.excludedFiles}`,
    `Dataset candidates: ${payload.datasetCandidateFiles}`,
    "",
    "## Included Files",
    "",
    ...includedLines,
    "",
    "## Excluded Files",
    "",
    ...excludedLines,
    ""
  ].join("\n");
  await writeJson(receiptJson, payload);
  await writeFile(receiptMarkdown, markdown, "utf-8");
  return { json: receiptJson, markdown: receiptMarkdown };
}

function boundaryLabel(value = "") {
  if (value === "strict-citations") return "strict source citations";
  if (value === "creative-safe") return "creative but source-aware";
  if (value === "operator") return "direct operator mode";
  return "source-backed answers";
}

function firstRunChecklist({ artifacts, hardware, sources, baseModel, sourceScope }) {
  const sourceCount = sourceScope?.includedFiles ?? sources?.totalFiles ?? 0;
  return [
    {
      label: "Setup saved",
      status: artifacts.setupConfigured ? "pass" : "ready",
      detail: artifacts.setupConfigured ? "Local paths and model names are saved." : "Save Setup once so artifacts stay in the configured data root."
    },
    {
      label: "Source boundary",
      status: sourceCount ? "pass" : "blocked",
      detail: sourceCount
        ? `${sourceCount.toLocaleString()} files are included by ${sourceScope?.label || "the current source scope"}.`
        : "Choose or scan a source folder before building."
    },
    {
      label: "Hardware route",
      status: hardware.tier.canTrainAdapter ? "pass" : "warn",
      detail: hardware.modelFit?.summary || hardware.tier.detail
    },
    {
      label: "Base model",
      status: hardware.ollama.ok ? "pass" : "warn",
      detail: hardware.ollama.ok ? `${baseModel.model} is the recommended starting point.` : "Ollama is not ready, so keep this as an export plan until it starts."
    },
    {
      label: "Dataset path",
      status: artifacts.datasetReady ? "pass" : sourceCount ? "ready" : "blocked",
      detail: artifacts.datasetReady ? "Dataset and local knowledge artifacts already exist." : "First build should create source-grounded examples and retrieval snippets."
    },
    {
      label: "Release proof",
      status: artifacts.proofFresh && artifacts.evalFresh ? "pass" : "ready",
      detail: artifacts.proofFresh && artifacts.evalFresh ? "Proof and gates match the current source tree." : "Refresh proof before making public claims."
    }
  ];
}

function buildPlanBlueprint({ request, hardware, route, baseModel, artifacts, sources, sourceScope }) {
  const type = aiTypeSpec(request.aiType);
  const sourceLabel = knowledgeSourceLabel(request.knowledgeSource);
  const scopeLabel = sourceScope?.label?.toLowerCase() || sourceScopeLabel(request.sourceScope);
  const boundary = boundaryLabel(request.boundaryMode);
  const sourceCount = sourceScope?.includedFiles ?? sources?.totalFiles ?? 0;
  const excludedCount = sourceScope?.excludedFiles || 0;
  const datasetStatus = artifacts.datasetReady ? "Reuse the existing Dataset Forge and local knowledge packs." : "Build fresh Dataset Forge and local knowledge packs first.";
  const proofStatus = artifacts.proofFresh && artifacts.evalFresh ? "Proof and gates already match the source tree." : "Refresh proof and gates before sharing.";
  const localFit = hardware.modelFit?.summary || hardware.tier.detail;
  const checklist = firstRunChecklist({ artifacts, hardware, sources, baseModel, sourceScope });
  return {
    schema: "modelforge.builder_blueprint.v1",
    title: `${type.label} for ${request.audience || "personal"} use`,
    summary: `Build a ${type.label.toLowerCase()} that ${type.promise}.`,
    aiType: {
      id: request.aiType,
      label: type.label,
      capability: type.capability
    },
    userPromise: `${type.label}: ${type.capability}`,
    starterTemplate: templateLabel(request.templateId),
    knowledge: `Use ${sourceLabel}${sourceCount ? ` across ${sourceCount.toLocaleString()} scoped files` : ""}.`,
    sourceScope: `Start with ${scopeLabel}${excludedCount ? `; ${excludedCount.toLocaleString()} files stay out of this first scope` : ""}.`,
    boundaries: `${boundary}; ${request.privacy === "local-only" ? "keep artifacts local" : "prepare shareable proof before release"}.`,
    route: `${route.label}: ${route.reason}`,
    hardwareFit: localFit,
    firstBuild: datasetStatus,
    releasePosture: proofStatus,
    capabilities: [
      { label: "Starter template", detail: templateLabel(request.templateId) },
      { label: "Answer style", detail: `${request.personality || "practical"} responses for ${request.audience || "personal"} users.` },
      { label: "Source scope", detail: `${sourceScope?.includedFiles || 0} included, ${sourceScope?.excludedFiles || 0} excluded.` },
      { label: "Knowledge boundary", detail: `Ground answers in ${sourceLabel} with ${boundary}.` },
      { label: "Build route", detail: route.label },
      { label: "Base model", detail: `${baseModel.model}: ${baseModel.reason}` }
    ],
    firstRunChecklist: checklist,
    watchouts: [
      hardware.tier.canTrainAdapter ? "Adapter training is plausible but still depends on exact model settings." : "This machine should prepare or run compact models rather than train heavy adapters.",
      request.privacy === "local-only" ? "Keep source, datasets, and receipts inside the configured local data root." : "Review license and proof before any external runner or public share."
    ]
  };
}

function audienceLabel(value = "") {
  if (value === "team") return "Small team";
  if (value === "public") return "Public users";
  return "Personal use";
}

function personalityLabel(value = "") {
  if (value === "teacher") return "Patient teacher";
  if (value === "operator") return "Direct operator";
  if (value === "creative") return "Creative helper";
  return "Practical";
}

function privacyLabel(value = "") {
  if (value === "shareable") return "Shareable with proof review";
  return "Local-only";
}

function buildMethodForRoute(route, artifacts) {
  if (route.id === "source-onboarding") {
    return "Save setup and scan the source boundary before generating model artifacts.";
  }
  if (route.id === "adapter-lora" || route.id === "dataset-then-adapter") {
    return artifacts.datasetReady
      ? "Package the existing scoped dataset into an adapter-ready recipe and runner contract."
      : "Build a scoped Dataset Forge pack first, then prepare an adapter-ready recipe and runner contract.";
  }
  if (route.id === "export-runner" || route.id === "recipe-export") {
    return "Use the scoped dataset, local knowledge pack, Ollama profile, proof gates, and recipe export pack as the rebuildable AI package.";
  }
  return "Create a scoped Dataset Forge pack, local knowledge pack, Ollama profile, proof gates, and export recipe before any heavier training route.";
}

function buildAiProfileContract({ request, route, baseModel, artifacts, sources, sourceScope }) {
  const type = aiTypeSpec(request.aiType);
  const sourceLabel = knowledgeSourceLabel(request.knowledgeSource);
  const boundary = boundaryLabel(request.boundaryMode);
  const scopedFiles = sourceScope?.includedFiles ?? sources?.totalFiles ?? 0;
  const dataTypes = request.dataTypes?.length ? request.dataTypes.join(", ") : "selected local files";
  const localOnly = request.privacy !== "shareable";
  const aiName = request.aiName || defaultAiName(request);
  const voice = voiceLabel(request.voice);
  return {
    schema: "modelforge.builder_ai_profile.v1",
    name: aiName,
    title: `${aiName} - ${type.label}`,
    summary: `${aiName} is a ${type.label.toLowerCase()} that ${type.promise}, using ${sourceLabel} from ${scopedFiles.toLocaleString()} scoped files.`,
    audience: audienceLabel(request.audience),
    personality: personalityLabel(request.personality),
    voice,
    privacy: privacyLabel(request.privacy),
    targetDevice: request.targetDevice || "this machine",
    baseModel: baseModel.model,
    route: route.label,
    buildMethod: buildMethodForRoute(route, artifacts),
    knowledgeBoundary: `${boundary}; ${localOnly ? "keep all source and generated artifacts local" : "prepare proof before sharing"}.`,
    sourceScope: `${sourceScope?.label || sourceScopeLabel(request.sourceScope)} with ${scopedFiles.toLocaleString()} included files and ${(sourceScope?.excludedFiles || 0).toLocaleString()} excluded files.`,
    answerRules: [
      "Prefer source-backed answers over guesses.",
      request.boundaryMode === "strict-citations" ? "Show source paths for claims that depend on local knowledge." : "Separate local evidence from open questions.",
      request.boundaryMode === "creative-safe" ? "Creative responses must stay inside the selected lore or knowledge boundary." : "Refuse or flag requests that need files outside the selected scope.",
      localOnly ? "Keep prompts, datasets, receipts, and model artifacts on this machine." : "Review license and proof gates before sharing any pack."
    ],
    outputs: [
      {
        label: "Source scope",
        detail: `${sourceScope?.label || "Selected scope"} locks the files this AI is allowed to learn from.`,
        status: artifacts.sourceReady ? "ready" : "blocked",
        workspace: "sources"
      },
      {
        label: "Local AI profile",
        detail: `Ollama Modelfile and system prompt based on ${baseModel.model}.`,
        status: artifacts.modelProfileReady ? "ready" : artifacts.sourceReady ? "planned" : "blocked",
        workspace: "model"
      },
      {
        label: "Dataset and knowledge",
        detail: `JSONL examples plus retrieval snippets from ${dataTypes}.`,
        status: artifacts.datasetReady && artifacts.knowledgePackReady ? "ready" : artifacts.sourceReady ? "planned" : "blocked",
        workspace: "model"
      },
      {
        label: "Recipe and export pack",
        detail: "Versioned rebuild instructions, runner contract, and copied artifacts.",
        status: artifacts.recipeReady ? "ready" : artifacts.datasetReady ? "planned" : "blocked",
        workspace: "model"
      },
      {
        label: "Proof and release gates",
        detail: "Source hashes, receipts, model card, license review, and freshness checks.",
        status: artifacts.proofFresh && artifacts.evalFresh ? "ready" : artifacts.sourceReady ? "planned" : "blocked",
        workspace: "release"
      }
    ],
    doneWhen: [
      "A build run has a receipt with every stage completed or a clear repair hint.",
      "The AI can answer a smoke prompt using the selected source boundary.",
      "Dataset, knowledge pack, recipe, and export pack paths are visible from Model Lab.",
      "Proof and release gates are fresh before the project is shared."
    ]
  };
}

function buildStarterModelCard({ planId, createdAt, request, aiProfile, route, baseModel, hardware, hardwareRecipe, sourceScope, limitations, files }) {
  const type = aiTypeSpec(request.aiType);
  const sourceLabel = knowledgeSourceLabel(request.knowledgeSource);
  const scopedFiles = sourceScope?.includedFiles || 0;
  return {
    schema: "modelforge.starter_model_card.v1",
    cardId: `${planId}-starter-card`,
    createdAt,
    planId,
    aiName: aiProfile.name,
    role: type.label,
    voice: aiProfile.voice,
    audience: aiProfile.audience,
    summary: aiProfile.summary,
    intendedUse: [
      `Answer as a ${type.label.toLowerCase()} for ${aiProfile.audience.toLowerCase()}.`,
      `Use ${sourceLabel} from ${scopedFiles.toLocaleString()} scoped files.`,
      `Follow the ${route.label.toLowerCase()} build route on ${aiProfile.targetDevice}.`
    ],
    notFor: [
      "Making claims from files outside the selected source scope.",
      "Pretending this is a new foundation model trained from scratch.",
      request.privacy === "shareable" ? "Public sharing before proof and license gates are reviewed." : "Sending local source, prompts, datasets, or receipts outside this machine without review."
    ],
    sourceBoundary: aiProfile.sourceScope,
    buildRoute: `${route.label}: ${route.reason}`,
    baseModel: baseModel.model,
    hardwareFit: hardware.modelFit?.summary || hardware.tier.detail,
    localBuildSettings: hardwareRecipe
      ? {
          preference: hardwareRecipe.preference,
          modelClass: hardwareRecipe.recommended.modelClass,
          quantization: hardwareRecipe.recommended.quantization,
          contextWindowTokens: hardwareRecipe.recommended.contextWindowTokens,
          gpuLayers: hardwareRecipe.recommended.gpuLayers,
          runner: hardwareRecipe.recommended.runner
        }
      : null,
    answerRules: aiProfile.answerRules,
    releaseChecklist: [
      "Build From Plan receipt exists.",
      "Dataset and knowledge pack are scoped to the selected source boundary.",
      "Export pack can recreate the local target or has a clear runner plan.",
      "Proof bundle and release gates are fresh.",
      "License review has no blockers."
    ],
    limitations,
    files
  };
}

function starterModelCardMarkdown(card) {
  return [
    `# ${card.aiName} Starter Model Card`,
    "",
    `Card: ${card.cardId}`,
    `Created: ${card.createdAt}`,
    `Plan: ${card.planId}`,
    `Role: ${card.role}`,
    `Voice: ${card.voice}`,
    `Audience: ${card.audience}`,
    `Base model: ${card.baseModel}`,
    "",
    "## Summary",
    "",
    card.summary,
    "",
    "## Intended Use",
    "",
    ...card.intendedUse.map((item) => `- ${item}`),
    "",
    "## Not For",
    "",
    ...card.notFor.map((item) => `- ${item}`),
    "",
    "## Source Boundary",
    "",
    card.sourceBoundary,
    "",
    "## Build Route",
    "",
    card.buildRoute,
    "",
    "## Hardware Fit",
    "",
    card.hardwareFit,
    "",
    ...(card.localBuildSettings
      ? [
          "## Local Build Settings",
          "",
          `Preference: ${card.localBuildSettings.preference}`,
          `Model class: ${card.localBuildSettings.modelClass}`,
          `Quantization: ${card.localBuildSettings.quantization}`,
          `Context window: ${card.localBuildSettings.contextWindowTokens.toLocaleString()} tokens`,
          `GPU layers: ${card.localBuildSettings.gpuLayers}`,
          `Runner: ${card.localBuildSettings.runner}`,
          ""
        ]
      : []),
    "## Answer Rules",
    "",
    ...card.answerRules.map((item) => `- ${item}`),
    "",
    "## Release Checklist",
    "",
    ...card.releaseChecklist.map((item) => `- ${item}`),
    "",
    "## Limitations",
    "",
    ...card.limitations.map((item) => `- ${item}`),
    ""
  ].join("\n");
}

function chooseBaseModelRecommendation(request, hardware, ollama) {
  const intent = request.intent.toLowerCase();
  const codeHeavy = request.aiType === "coding-helper" || request.dataTypes.includes("code") || /\b(code|repo|developer|programming|typescript|python)\b/.test(intent);
  const selected = ollama.selectedModel || hardware.ollama.selectedModel || "";
  if (hardware.gpu.totalVramMb >= 12000) {
    return {
      label: codeHeavy ? "7B code-capable instruct base" : "7B general instruct base",
      model: selected || (codeHeavy ? "qwen2.5-coder:7b" : "llama3.1:8b"),
      reason: "This hardware tier can usually handle a useful quantized 7B-class base locally."
    };
  }
  if (hardware.memory.totalBytes >= 16 * 1024 * 1024 * 1024) {
    return {
      label: "Compact instruct base",
      model: selected || "llama3.2:3b",
      reason: "A compact local base keeps the first build responsive while the dataset and proof path mature."
    };
  }
  return {
    label: "Small local or external runner base",
    model: selected || "tinyllama or llama3.2:1b",
    reason: "The plan should stay light until more RAM or GPU memory is available."
  };
}

function modelFitCandidate(hardware, id) {
  return hardware.modelFit?.candidates?.find((candidate) => candidate.id === id) || null;
}

function chooseHardwareModelClass(request, hardware) {
  const memoryGb = hardware.memory.totalBytes / 1024 / 1024 / 1024;
  const vramGb = hardware.gpu.totalVramMb / 1024;
  const preference = request.hardwarePreference || "auto-fit";
  const codeHeavy = request.aiType === "coding-helper" || request.dataTypes.includes("code");

  if (preference === "low-memory") return modelFitCandidate(hardware, "small-instruct") || { id: "small-instruct", label: "1B-3B instruct" };
  if (preference === "max-quality" && (vramGb >= 16 || memoryGb >= 48)) {
    return modelFitCandidate(hardware, "fourteen-b-quantized") || { id: "fourteen-b-quantized", label: "13B/14B quantized" };
  }
  if (vramGb >= 8 || memoryGb >= 24 || (preference === "max-quality" && (vramGb >= 6 || memoryGb >= 16))) {
    return modelFitCandidate(hardware, "seven-b-quantized") || { id: "seven-b-quantized", label: codeHeavy ? "7B/8B code-capable quantized" : "7B/8B quantized" };
  }
  return modelFitCandidate(hardware, "small-instruct") || { id: "small-instruct", label: "1B-3B instruct" };
}

function quantizationForRecipe({ request, hardware, modelClass }) {
  const preference = request.hardwarePreference || "auto-fit";
  const vramGb = hardware.gpu.totalVramMb / 1024;
  const memoryGb = hardware.memory.totalBytes / 1024 / 1024 / 1024;
  if (preference === "low-memory" || memoryGb < 12) return "Q4_K_S or Q3_K_M";
  if (modelClass.id === "fourteen-b-quantized" && preference === "max-quality" && vramGb >= 16) return "Q5_K_M";
  if (modelClass.id === "seven-b-quantized" && (vramGb >= 8 || memoryGb >= 24)) return "Q4_K_M";
  if (preference === "portable") return "Q4_K_M";
  return "Q4_K_M";
}

function contextWindowForRecipe({ request, hardware, modelClass }) {
  const preference = request.hardwarePreference || "auto-fit";
  const memoryGb = hardware.memory.totalBytes / 1024 / 1024 / 1024;
  const vramGb = hardware.gpu.totalVramMb / 1024;
  if (preference === "low-memory" || memoryGb < 12) return 2048;
  if (modelClass.id === "fourteen-b-quantized" && (vramGb >= 16 || memoryGb >= 48)) return 8192;
  if (vramGb >= 12 || memoryGb >= 32) return 8192;
  if (vramGb >= 8 || memoryGb >= 24) return 6144;
  return 4096;
}

function gpuLayerSettingForRecipe(hardware) {
  const vramGb = hardware.gpu.totalVramMb / 1024;
  if (!hardware.gpu.detected || !hardware.gpu.totalVramMb) return "CPU only";
  if (vramGb >= 16) return "All practical layers";
  if (vramGb >= 8) return "Most layers";
  if (vramGb >= 6) return "Partial layers";
  return "Minimal offload";
}

function batchSizeForRecipe({ request, hardware }) {
  const preference = request.hardwarePreference || "auto-fit";
  const memoryGb = hardware.memory.totalBytes / 1024 / 1024 / 1024;
  const vramGb = hardware.gpu.totalVramMb / 1024;
  if (preference === "low-memory" || memoryGb < 12) return 128;
  if (vramGb >= 12 || memoryGb >= 32) return 512;
  return 256;
}

function runnerForRecipe({ hardware, route }) {
  const routeNeedsAdapter = ["adapter-lora", "dataset-then-adapter"].includes(route.id);
  if (routeNeedsAdapter) return hardware.ollama.ok ? "Ollama export now; adapter runner later" : "External adapter runner later; install Ollama for local profile tests";
  if (hardware.ollama.ok) return "Ollama local runner";
  return "Install or start Ollama before local chat tests";
}

function buildHardwareRecipe({ request, hardware, route, baseModel, estimatedDisk }) {
  const modelClass = chooseHardwareModelClass(request, hardware);
  const routeNeedsAdapter = ["adapter-lora", "dataset-then-adapter"].includes(route.id);
  const fitStatus = routeNeedsAdapter ? modelFitCandidate(hardware, "lora-adapter")?.buildUse || "tight" : modelClass.localUse || modelClass.buildUse || "possible";
  const cpuThreads = Math.max(1, Math.min(hardware.cpu.threads || 1, Math.max(1, (hardware.cpu.threads || 1) - 2)));
  const quantization = quantizationForRecipe({ request, hardware, modelClass });
  const contextWindowTokens = contextWindowForRecipe({ request, hardware, modelClass });
  const gpuLayers = gpuLayerSettingForRecipe(hardware);
  const batchSize = batchSizeForRecipe({ request, hardware });
  const runner = runnerForRecipe({ hardware, route });
  const warnings = [];
  if (!hardware.ollama.ok) warnings.push("Ollama is not ready, so local chat tests need setup before the generated target can run.");
  if (!hardware.gpu.detected) warnings.push("No GPU was detected; the first build should favor compact quantized models and proof/export artifacts.");
  if (hardware.disk.freeBytes && hardware.disk.freeBytes < 10 * 1024 * 1024 * 1024) warnings.push("Free disk space is tight for model pulls and export packs.");
  if (routeNeedsAdapter && !hardware.tier.canTrainAdapter) warnings.push("Adapter training is listed as a plan, not a guaranteed local execution path on this machine.");

  const reasoning = [
    `${hardwarePreferenceLabel(request.hardwarePreference)} selected from ${hardware.memory.total} RAM and ${hardware.gpu.detected ? hardware.gpu.totalVram : "no detected GPU VRAM"}.`,
    `${modelClass.label} is the safest first model class for this hardware profile.`,
    `${quantization} keeps memory pressure aligned with the selected route.`,
    `${contextWindowTokens.toLocaleString()} tokens keeps the first local tests useful without hiding hardware limits.`
  ];

  return {
    schema: "modelforge.hardware_recipe.v1",
    createdAt: new Date().toISOString(),
    preference: hardwarePreferenceLabel(request.hardwarePreference),
    fitStatus,
    summary: `${modelClass.label} with ${quantization}, ${contextWindowTokens.toLocaleString()} context tokens, ${gpuLayers.toLowerCase()}, and ${runner.toLowerCase()}.`,
    resources: {
      cpuThreads: `${hardware.cpu.threads || 1} threads`,
      ram: hardware.memory.total,
      gpu: hardware.gpu.detected ? `${hardware.gpu.devices.length} detected` : "No GPU detected",
      vram: hardware.gpu.detected ? hardware.gpu.totalVram : "No GPU VRAM",
      diskFree: hardware.disk.free,
      ollama: hardware.ollama.ok ? `Ready${hardware.ollama.selectedModel ? `, ${hardware.ollama.selectedModel}` : ""}` : "Not ready"
    },
    recommended: {
      modelClass: modelClass.label,
      baseModel: baseModel.model,
      quantization,
      contextWindowTokens,
      gpuLayers,
      cpuThreads,
      batchSize,
      runner,
      storageBudget: estimatedDisk,
      buildRoute: route.label
    },
    reasoning,
    warnings,
    nextSteps: [
      `Use ${baseModel.model} or the closest installed model in the ${modelClass.label} class.`,
      `Keep the first context window at ${contextWindowTokens.toLocaleString()} tokens before tuning upward.`,
      routeNeedsAdapter ? "Build the dataset and recipe before attempting adapter execution." : "Run Build From Plan to create the dataset, proof, recipe, and export receipts."
    ]
  };
}

function chooseBuilderRoute(request, hardware, artifacts) {
  const wantsAdapter = request.buildMode === "adapter" || request.qualitySpeed === "quality" || request.qualitySpeed === "maximum";
  const wantsPortable = request.buildMode === "portable" || request.targetDevice.toLowerCase().includes("another");
  if (!artifacts.sourceReady) {
    return {
      id: "source-onboarding",
      label: "Source setup first",
      reason: "ModelForge needs a readable source boundary before it can build datasets, recipes, or proof."
    };
  }
  if (hardware.tier.canTrainAdapter && wantsAdapter && artifacts.datasetReady) {
    return {
      id: "adapter-lora",
      label: "LoRA/QLoRA adapter route",
      reason: "Your hardware has enough GPU memory for a realistic adapter path, and a Dataset Forge pack exists."
    };
  }
  if (hardware.tier.canTrainAdapter && wantsAdapter) {
    return {
      id: "dataset-then-adapter",
      label: "Dataset pack, then adapter",
      reason: "The machine looks adapter-capable, but the source-grounded dataset should be built before training."
    };
  }
  if (wantsPortable && artifacts.recipeReady) {
    return {
      id: "export-runner",
      label: "Reusable export pack",
      reason: "A recipe already exists, so the best next move is a portable pack with proof and runner instructions."
    };
  }
  if (artifacts.datasetReady) {
    return {
      id: "recipe-export",
      label: "Recipe and export route",
      reason: "A dataset exists; turn it into a versioned recipe that can recreate the local target."
    };
  }
  return {
    id: "dataset-pack",
    label: "Dataset pack now",
    reason: "This is the safest non-dev path: build clean JSONL examples with source hashes before any heavier model work."
  };
}

function planStep(id, label, status, action, detail, workspace) {
  return { id, label, status, action, detail, workspace };
}

async function getLatestBuilderPlan() {
  return readJsonIfExists(join(dataRoot, "builder", "latest", "build-plan.json"));
}

async function getBuilderPlanById(planId = "") {
  const safePlanId = String(planId || "").trim();
  if (!safePlanId) return getLatestBuilderPlan();
  if (!/^build-plan-\d{4}-\d{2}-\d{2}T/.test(safePlanId)) {
    throw new Error("A valid builder plan id is required.");
  }
  const fromHistory = await readJsonIfExists(join(dataRoot, "builder", "history", safePlanId, "build-plan.json"));
  if (fromHistory) return fromHistory;
  const latest = await getLatestBuilderPlan();
  return latest?.planId === safePlanId ? latest : null;
}

async function buildAiBuildPlan(body = {}) {
  await ensureDataRoot();
  const createdAt = new Date().toISOString();
  const planId = builderPlanId();
  const latestDir = join(dataRoot, "builder", "latest");
  const versionDir = join(dataRoot, "builder", "history", planId);
  const request = normalizeBuilderRequest(body);
  const [hardware, sources, latestModelExport, latestProof, latestEval, latestDataset, latestKnowledgePack, latestRecipe, ollama] = await Promise.all([
    getHardwareProfile(),
    walkSources(sourceRoot),
    getLatestModelExport(),
    getLatestProofBundle(),
    getLatestEvalReport(),
    getLatestDatasetForge(),
    getLatestKnowledgePack(),
    getLatestForgeRecipe(),
    getOllamaStatus()
  ]);
  const proofSourceSummary = latestProof?.manifest?.sourceSummary || null;
  const proofFresh = Boolean(
    latestProof &&
      proofSourceSummary &&
      proofSourceSummary.totalFiles === sources.totalFiles &&
      proofSourceSummary.sampledFiles === sources.sampledFiles &&
      proofSourceSummary.totalSizeBytes === sources.totalSizeBytes
  );
  const evalFresh = Boolean(latestEval && latestProof && latestEval.proofPath === latestProof.path && proofFresh);
  const artifacts = {
    setupConfigured: existsSync(setupConfigPath),
    sourceReady: sources.totalFiles > 0,
    datasetReady: Boolean(latestDataset?.summary?.totalExamples),
    knowledgePackReady: Boolean(latestKnowledgePack?.summary?.totalSnippets),
    modelProfileReady: Boolean(latestModelExport?.modelfilePath),
    recipeReady: Boolean(latestRecipe?.recipeId),
    proofFresh,
    evalFresh
  };
  const route = chooseBuilderRoute(request, hardware, artifacts);
  const baseModel = chooseBaseModelRecommendation(request, hardware, ollama);
  const selectedSourceScope = resolveSourceScope(sources, request.sourceScope);
  const sourceScopePreview = buildSourceScopePreview(sources, request.sourceScope);
  const blueprint = buildPlanBlueprint({ request, hardware, route, baseModel, artifacts, sources, sourceScope: selectedSourceScope });
  const aiProfile = buildAiProfileContract({ request, route, baseModel, artifacts, sources, sourceScope: selectedSourceScope });
  const routeNeedsAdapter = ["adapter-lora", "dataset-then-adapter"].includes(route.id);
  const estimatedTime = routeNeedsAdapter
    ? hardware.tier.id === "starter-lora"
      ? "45-180 minutes after adapter runner wiring"
      : "30-120 minutes after adapter runner wiring"
    : artifacts.datasetReady
      ? "5-20 minutes for recipe/export refresh"
      : "10-30 minutes for dataset, proof, and recipe artifacts";
  const estimatedDisk = routeNeedsAdapter
    ? hardware.gpu.totalVramMb >= 12000
      ? "8-30 GB depending on base and adapter settings"
      : "4-12 GB for compact experiments"
    : "500 MB-3 GB for source, proof, dataset, and export packs";
  const hardwareRecipe = buildHardwareRecipe({ request, hardware, route, baseModel, estimatedDisk });
  const steps = [
    planStep(
      "setup",
      "Confirm local setup",
      artifacts.setupConfigured ? "pass" : "ready",
      "Save source, data root, Ollama model path, base model, and target model.",
      artifacts.setupConfigured ? "Setup is saved." : "Start here so paths stay on the intended drive.",
      "setup"
    ),
    planStep(
      "source-boundary",
      "Scan source boundary",
      artifacts.sourceReady ? "pass" : "blocked",
      "Build a scoped source inventory with hashes, license signals, and include/exclude receipts.",
      artifacts.sourceReady
        ? `${selectedSourceScope.includedFiles.toLocaleString()} included, ${selectedSourceScope.excludedFiles.toLocaleString()} excluded by ${selectedSourceScope.label}.`
        : "Choose a readable source folder first.",
      "sources"
    ),
    planStep(
      "dataset-forge",
      "Build Dataset Forge pack",
      artifacts.datasetReady ? "pass" : artifacts.sourceReady ? "ready" : "blocked",
      "Create JSONL examples and a local knowledge pack from included source-scope files.",
      artifacts.datasetReady
        ? `${latestDataset.summary.totalExamples.toLocaleString()} examples and ${(latestKnowledgePack?.summary?.totalSnippets || 0).toLocaleString()} retrieval snippets ready.`
        : "This is the next practical build step.",
      "model"
    ),
    planStep(
      "model-profile",
      "Export local model profile",
      artifacts.modelProfileReady ? "pass" : ollama.ok ? "ready" : "warn",
      "Write an Ollama Modelfile and source-bounded system prompt.",
      artifacts.modelProfileReady ? latestModelExport.modelName : ollama.ok ? "Ollama is available." : "Start Ollama or keep this as an export-only plan.",
      "model"
    ),
    planStep(
      "recipe",
      "Package forge recipe",
      artifacts.recipeReady ? "pass" : artifacts.datasetReady ? "ready" : "blocked",
      "Bundle dataset, proof, eval gates, Ollama profile, and runner contracts.",
      artifacts.recipeReady ? latestRecipe.recipeId : "Build after Dataset Forge exists.",
      "model"
    ),
    planStep(
      routeNeedsAdapter ? "adapter-runner" : "export-runner",
      routeNeedsAdapter ? "Prepare adapter runner" : "Run export pack",
      route.id === "adapter-lora" ? "ready" : artifacts.recipeReady ? "ready" : "blocked",
      routeNeedsAdapter ? "Use the recipe's LoRA/QLoRA plan without widening the source boundary." : "Recreate the local model target from the exported pack and store the receipt.",
      routeNeedsAdapter ? "Adapter execution is the next planned capability." : "This proves the pack can rebuild the target.",
      "model"
    ),
    planStep(
      "proof-release",
      "Refresh proof and release gates",
      artifacts.proofFresh && artifacts.evalFresh ? "pass" : latestProof ? "warn" : "ready",
      "Rebuild proof, run gates, and review license posture before sharing.",
      artifacts.proofFresh && artifacts.evalFresh ? "Proof and eval match the current source tree." : "Public claims should wait for fresh proof.",
      "release"
    )
  ];
  const limitations = [
    routeNeedsAdapter
      ? "ModelForge exports the adapter plan today; full local LoRA/QLoRA execution is the next runner milestone."
      : "This plan builds model-ready artifacts and local Ollama targets, not a new foundation model from scratch.",
    hardware.tier.canTrainAdapter
      ? "Adapter feasibility still depends on the exact base model, context length, batch size, and quantization."
      : "No strong local-training GPU was detected, so the recommended route avoids pretending this machine should train heavy adapters.",
    request.privacy === "local-only"
      ? "The plan keeps source and artifacts inside the configured local data root."
      : "If you use an external runner later, rebuild proof before exporting and review license constraints."
  ];
  const nextActions = [
    !artifacts.setupConfigured ? { id: "open-setup", label: "Open Setup", workspace: "setup" } : null,
    artifacts.sourceReady && !artifacts.datasetReady ? { id: "build-dataset", label: "Build Dataset", workspace: "model" } : null,
    artifacts.datasetReady && !artifacts.recipeReady ? { id: "build-recipe", label: "Build Recipe", workspace: "model" } : null,
    artifacts.recipeReady ? { id: "open-model", label: "Open Model Lab", workspace: "model" } : null,
    !artifacts.proofFresh || !artifacts.evalFresh ? { id: "open-release", label: "Review Gates", workspace: "release" } : null
  ].filter(Boolean);
  const planFiles = {
    dir: latestDir,
    json: join(latestDir, "build-plan.json"),
    markdown: join(latestDir, "build-plan.md"),
    starterModelCardJson: join(latestDir, "starter-model-card.json"),
    starterModelCardMarkdown: join(latestDir, "starter-model-card.md"),
    versionDir,
    versionJson: join(versionDir, "build-plan.json"),
    versionMarkdown: join(versionDir, "build-plan.md"),
    versionStarterModelCardJson: join(versionDir, "starter-model-card.json"),
    versionStarterModelCardMarkdown: join(versionDir, "starter-model-card.md")
  };
  const starterModelCard = buildStarterModelCard({
    planId,
    createdAt,
    request,
    aiProfile,
    hardwareRecipe,
    route,
    baseModel,
    hardware,
    sourceScope: selectedSourceScope,
    limitations,
    files: {
      json: planFiles.starterModelCardJson,
      markdown: planFiles.starterModelCardMarkdown,
      versionJson: planFiles.versionStarterModelCardJson,
      versionMarkdown: planFiles.versionStarterModelCardMarkdown
    }
  });
  const plan = {
    schema: "modelforge.builder_plan.v1",
    planId,
    createdAt,
    intent: request.intent || "Build a useful local AI from this source boundary.",
    request,
    sourceRoot,
    dataRoot,
    hardware,
    artifacts,
    recommendedRoute: route.id,
    routeLabel: route.label,
    routeReason: route.reason,
    sourceScopePreview,
    aiProfile,
    starterModelCard,
    hardwareRecipe,
    blueprint,
    baseModelRecommendation: baseModel,
    estimates: {
      time: estimatedTime,
      disk: estimatedDisk,
      hardwareTier: hardware.tier.label
    },
    steps,
    limitations,
    nextActions,
    files: planFiles
  };
  const markdown = [
    "# ModelForge Build Plan",
    "",
    `Plan: ${planId}`,
    `Created: ${createdAt}`,
    `Route: ${route.label}`,
    `Reason: ${route.reason}`,
    `Hardware tier: ${hardware.tier.label}`,
    `Base model: ${baseModel.model}`,
    `Hardware preference: ${hardwareRecipe.preference}`,
    `Local fit recipe: ${hardwareRecipe.summary}`,
    `AI name: ${aiProfile.name}`,
    `Voice: ${aiProfile.voice}`,
    `Blueprint: ${blueprint.summary}`,
    `AI profile: ${aiProfile.summary}`,
    "",
    "## Intent",
    "",
    plan.intent,
    "",
    "## Blueprint",
    "",
    `Template: ${blueprint.starterTemplate}`,
    `AI type: ${blueprint.aiType.label}`,
    `Knowledge: ${blueprint.knowledge}`,
    `Source scope: ${blueprint.sourceScope}`,
    `Included files: ${selectedSourceScope.includedFiles}`,
    `Excluded files: ${selectedSourceScope.excludedFiles}`,
    `Boundaries: ${blueprint.boundaries}`,
    `First build: ${blueprint.firstBuild}`,
    `Release posture: ${blueprint.releasePosture}`,
    "",
    "## AI Build Contract",
    "",
    `Name: ${aiProfile.name}`,
    `Audience: ${aiProfile.audience}`,
    `Personality: ${aiProfile.personality}`,
    `Voice: ${aiProfile.voice}`,
    `Privacy: ${aiProfile.privacy}`,
    `Target device: ${aiProfile.targetDevice}`,
    `Base model: ${aiProfile.baseModel}`,
    `Route: ${aiProfile.route}`,
    `Build method: ${aiProfile.buildMethod}`,
    `Knowledge boundary: ${aiProfile.knowledgeBoundary}`,
    `Source scope: ${aiProfile.sourceScope}`,
    `Starter model card: ${starterModelCard.files.markdown}`,
    "",
    "## Hardware Fit Recipe",
    "",
    `Fit status: ${hardwareRecipe.fitStatus}`,
    `Model class: ${hardwareRecipe.recommended.modelClass}`,
    `Base model: ${hardwareRecipe.recommended.baseModel}`,
    `Quantization: ${hardwareRecipe.recommended.quantization}`,
    `Context window: ${hardwareRecipe.recommended.contextWindowTokens.toLocaleString()} tokens`,
    `GPU layers: ${hardwareRecipe.recommended.gpuLayers}`,
    `CPU threads: ${hardwareRecipe.recommended.cpuThreads}`,
    `Batch size: ${hardwareRecipe.recommended.batchSize}`,
    `Runner: ${hardwareRecipe.recommended.runner}`,
    `Storage budget: ${hardwareRecipe.recommended.storageBudget}`,
    "",
    "### Hardware Reasoning",
    "",
    ...hardwareRecipe.reasoning.map((item) => `- ${item}`),
    "",
    ...(hardwareRecipe.warnings.length
      ? ["### Hardware Warnings", "", ...hardwareRecipe.warnings.map((item) => `- ${item}`), ""]
      : []),
    "### Answer Rules",
    "",
    ...aiProfile.answerRules.map((item) => `- ${item}`),
    "",
    "### Outputs",
    "",
    ...aiProfile.outputs.map((item) => `- ${item.label}: ${item.status}. ${item.detail}`),
    "",
    "### Done When",
    "",
    ...aiProfile.doneWhen.map((item) => `- ${item}`),
    "",
    "## First-Run Checklist",
    "",
    ...blueprint.firstRunChecklist.map((item) => `- ${item.label}: ${item.status}. ${item.detail}`),
    "",
    "## Source Scope Preview",
    "",
    ...sourceScopePreview.options.map((option) => `- ${option.label}: ${option.includedFiles} included, ${option.excludedFiles} excluded, ${option.datasetCandidateFiles} dataset candidates.`),
    "",
    "## Steps",
    "",
    ...steps.map((step) => `- ${step.label}: ${step.status}. ${step.action} ${step.detail}`),
    "",
    "## Limitations",
    "",
    ...limitations.map((item) => `- ${item}`),
    ""
  ].join("\n");

  for (const dir of [latestDir, versionDir]) {
    await mkdir(dir, { recursive: true });
  }
  await writeJson(plan.files.json, plan);
  await writeFile(plan.files.markdown, markdown, "utf-8");
  await writeJson(plan.files.starterModelCardJson, starterModelCard);
  await writeFile(plan.files.starterModelCardMarkdown, starterModelCardMarkdown(starterModelCard), "utf-8");
  await writeJson(plan.files.versionJson, plan);
  await writeFile(plan.files.versionMarkdown, markdown, "utf-8");
  await writeJson(plan.files.versionStarterModelCardJson, starterModelCard);
  await writeFile(plan.files.versionStarterModelCardMarkdown, starterModelCardMarkdown(starterModelCard), "utf-8");
  return plan;
}

function builderRunId() {
  return `builder-run-${new Date().toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "Z")}`;
}

function builderRunTerminalStatus(status) {
  return ["pass", "fail", "canceled"].includes(String(status || ""));
}

function builderStage(id, label, action, plainLanguage = "", repairHint = "") {
  return {
    id,
    label,
    action,
    plainLanguage,
    repairHint,
    status: "ready",
    summary: "Waiting",
    artifact: "",
    startedAt: "",
    endedAt: "",
    error: ""
  };
}

function createBuilderRunStages(plan) {
  const routeNeedsAdapter = ["adapter-lora", "dataset-then-adapter"].includes(plan?.recommendedRoute);
  return [
    builderStage(
      "preflight",
      "Preflight",
      "Confirm the saved setup, plan, and local build roots.",
      "ModelForge checks the saved paths, local data root, and build plan before touching artifacts.",
      "Open Setup and save the source folder, data root, Ollama model path, base model, and target model."
    ),
    builderStage(
      "source-boundary",
      "Source Boundary",
      "Record the current source inventory for this build run.",
      "The build records exactly which files are inside the source boundary so later claims can be checked.",
      "Check that the configured source folder exists and is not empty."
    ),
    builderStage(
      "model-profile",
      "Model Profile",
      "Export the local Ollama profile and system prompt.",
      "ModelForge writes the Modelfile, system prompt, and local model profile used by the recipe.",
      "Start Ollama or choose an installed base model in Setup."
    ),
    builderStage(
      "proof-gates",
      "Proof And Gates",
      "Build proof, run eval gates, and prepare share evidence.",
      "The run refreshes model cards, receipts, source hashes, license checks, and release gates.",
      "Open Release, review the failing gate, then rebuild proof."
    ),
    builderStage(
      "dataset-forge",
      "Dataset Forge",
      "Create source-grounded JSONL examples with provenance.",
      "The source inventory becomes training-style examples with file paths, hashes, and license labels.",
      "Open Model Lab, review Dataset Forge inputs, and exclude files that should not become examples."
    ),
    builderStage(
      "recipe",
      "Forge Recipe",
      "Package dataset, proof, eval, profile, and runner contracts.",
      "The recipe packages the dataset, proof, eval report, Ollama profile, and runner instructions together.",
      "Rebuild Dataset Forge and the model profile before creating the recipe again."
    ),
    builderStage(
      routeNeedsAdapter ? "adapter-pack" : "export-pack",
      routeNeedsAdapter ? "Adapter Pack" : "Export Pack",
      routeNeedsAdapter ? "Export the adapter-ready package and runner contract." : "Run the exported Ollama pack and store the receipt.",
      routeNeedsAdapter ? "ModelForge prepares the adapter-ready pack and runner contract for later LoRA/QLoRA execution." : "ModelForge runs the exported pack to prove it can recreate the local Ollama target.",
      routeNeedsAdapter ? "Review the adapter plan and choose a smaller base model if the hardware estimate is tight." : "Check Ollama is running and that the target model name is writable."
    ),
    builderStage(
      "finalize",
      "Ready Pack",
      "Refresh the build plan and write the final run receipt.",
      "The final step refreshes the build plan with the new artifacts and writes a readable receipt.",
      "Rerun Build From Plan after fixing the earlier failed stage."
    )
  ];
}

function handoffArtifact(label, value, detail, path = "", workspace = "model") {
  return { label, value, detail, path, workspace };
}

function buildBuilderHandoff({ run, plan, dataset, recipe, modelExport, packRun, sourceScope, proofBundle, evalReport }) {
  const blueprint = plan?.blueprint || {};
  const aiLabel = plan?.aiProfile?.name || blueprint.aiType?.label || "local AI";
  const routeLabel = plan?.routeLabel || "local build route";
  const targetModel = recipe?.targetModel || modelExport?.modelName || defaultTargetModelName();
  const knowledgeSnippets = dataset?.knowledgePack?.snippets || recipe?.dataset?.knowledgeSnippets || 0;
  const datasetExamples = dataset?.summary?.totalExamples || recipe?.dataset?.rows || 0;
  const scopedFiles = sourceScope?.includedFiles || dataset?.sourceScope?.includedFiles || 0;
  const hardwareFit = plan?.hardware?.modelFit?.summary || blueprint.hardwareFit || plan?.estimates?.hardwareTier || "Hardware route recorded.";
  const packStatus = packRun?.status === "pass" ? "ready" : "review";
  return {
    schema: "modelforge.builder_handoff.v1",
    createdAt: new Date().toISOString(),
    title: `Your ${aiLabel} is built`,
    summary: `Your hardware supports ${routeLabel}, so ModelForge built ${targetModel} with source-scoped data, a local knowledge pack, proof, and a rebuildable export pack.`,
    hardwareFit,
    route: {
      label: routeLabel,
      reason: plan?.routeReason || "",
      hardwareTier: plan?.estimates?.hardwareTier || plan?.hardware?.tier?.label || "",
      baseModel: modelExport?.baseModel || recipe?.baseModel || plan?.baseModelRecommendation?.model || ""
    },
    builtArtifacts: [
      handoffArtifact("AI target", targetModel, packStatus === "ready" ? "Created from the export pack and ready for Model Lab tests." : "Profile and recipe are ready; run the export pack when Ollama is available.", recipe?.files?.exportDir || "", "model"),
      handoffArtifact("Local knowledge", `${knowledgeSnippets.toLocaleString()} snippets`, `Built from ${scopedFiles.toLocaleString()} scoped files for source-backed chat.`, dataset?.knowledgePack?.jsonl || run.outputs.knowledgePackPath || "", "model"),
      handoffArtifact("Dataset", `${datasetExamples.toLocaleString()} examples`, "JSONL examples keep source paths, hashes, license labels, and provenance attached.", dataset?.files?.jsonl || run.outputs.datasetPath || "", "model"),
      handoffArtifact("Proof", evalReport?.summary || "Proof bundle and gates refreshed.", "Release gates, source hashes, model cards, and receipts were rebuilt for this run.", proofBundle?.path || run.outputs.proofPath || "", "release")
    ],
    actions: [
      {
        id: "test-ai",
        label: "Test your AI",
        detail: "Open Model Lab and ask the forged target a source-backed question.",
        workspace: "model"
      },
      {
        id: "review-proof",
        label: "Review proof",
        detail: "Open Release to check gates and evidence before sharing.",
        workspace: "release"
      }
    ],
    receipts: {
      builderRun: run.files.receipt,
      sourceScope: run.outputs.sourceScopeReceiptPath,
      modelProfile: run.outputs.modelProfilePath,
      proof: run.outputs.proofPath,
      eval: run.outputs.evalPath,
      dataset: run.outputs.datasetPath,
      knowledgePack: run.outputs.knowledgePackPath,
      recipe: run.outputs.recipePath,
      exportPack: run.outputs.exportDir,
      packRun: run.outputs.packRunReceiptPath
    }
  };
}

async function getLatestBuilderRun() {
  return readJsonIfExists(join(dataRoot, "builder", "latest", "build-run.json"));
}

async function getBuilderRun(runId = "") {
  const safeRunId = String(runId || "").trim();
  if (safeRunId && builderRunJobs.has(safeRunId)) {
    return builderRunJobs.get(safeRunId).run;
  }
  if (safeRunId) {
    if (!/^builder-run-\d{4}-\d{2}-\d{2}T/.test(safeRunId)) {
      throw new Error("A valid builder run id is required.");
    }
    const fromHistory = await readJsonIfExists(join(dataRoot, "builder", "runs", safeRunId, "build-run.json"));
    if (fromHistory) return fromHistory;
  }
  return getLatestBuilderRun();
}

async function getBuilderRunHistory(limit = 8) {
  const historyRoot = join(dataRoot, "builder", "runs");
  let entries = [];
  try {
    entries = await readdir(historyRoot, { withFileTypes: true });
  } catch {
    entries = [];
  }
  const runs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && /^builder-run-\d{4}-\d{2}-\d{2}T/.test(entry.name))
      .map((entry) => readJsonIfExists(join(historyRoot, entry.name, "build-run.json")))
  );
  return runs
    .filter(Boolean)
    .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")))
    .slice(0, limit);
}

async function persistBuilderRun(run) {
  await writeJson(run.files.json, run);
  await writeJson(join(dataRoot, "builder", "latest", "build-run.json"), run);
}

function getBuilderStage(run, stageId) {
  return run.stages.find((stage) => stage.id === stageId);
}

async function updateBuilderStage(job, stageId, updates = {}) {
  const stage = getBuilderStage(job.run, stageId);
  if (!stage) return;
  Object.assign(stage, updates);
  job.run.updatedAt = new Date().toISOString();
  await persistBuilderRun(job.run);
}

function ensureBuilderJobActive(job) {
  if (job.cancelRequested) {
    const error = new Error(`Canceled builder run ${job.run.runId}.`);
    error.code = "BUILDER_RUN_CANCELED";
    throw error;
  }
}

async function runBuilderStage(job, stageId, work) {
  ensureBuilderJobActive(job);
  const startedAt = new Date().toISOString();
  await updateBuilderStage(job, stageId, {
    status: "running",
    summary: "Running",
    startedAt,
    endedAt: "",
    error: ""
  });
  try {
    const result = await work();
    ensureBuilderJobActive(job);
    await updateBuilderStage(job, stageId, {
      status: "pass",
      summary: result?.summary || "Complete",
      artifact: result?.artifact || "",
      endedAt: new Date().toISOString()
    });
    return result?.value ?? result;
  } catch (error) {
    const canceled = error?.code === "BUILDER_RUN_CANCELED";
    await updateBuilderStage(job, stageId, {
      status: canceled ? "canceled" : "fail",
      summary: canceled ? "Canceled" : "Failed",
      error: String(error?.message || error),
      endedAt: new Date().toISOString()
    });
    throw error;
  }
}

async function writeBuilderRunReceipt(run) {
  const handoff = run.handoff || null;
  const handoffLines = handoff
    ? [
        "## Build Handoff",
        "",
        handoff.title,
        "",
        handoff.summary,
        "",
        `Hardware fit: ${handoff.hardwareFit || ""}`,
        `Route: ${handoff.route?.label || ""}`,
        "",
        "### Built",
        "",
        ...(handoff.builtArtifacts || []).map((artifact) => `- ${artifact.label}: ${artifact.value}. ${artifact.detail}${artifact.path ? ` Artifact: ${artifact.path}` : ""}`),
        "",
        "### Next",
        "",
        ...(handoff.actions || []).map((action) => `- ${action.label}: ${action.detail}`),
        ""
      ]
    : [];
  const lines = [
    "# ModelForge Builder Run",
    "",
    `Run: ${run.runId}`,
    `Plan: ${run.planId}`,
    `Status: ${run.status}`,
    `Started: ${run.startedAt}`,
    `Ended: ${run.endedAt || ""}`,
    "",
    "## Summary",
    "",
    run.summary,
    "",
    ...handoffLines,
    "## Stages",
    "",
    ...run.stages.map((stage) => `- ${stage.label}: ${stage.status}. ${stage.summary}${stage.plainLanguage ? ` ${stage.plainLanguage}` : ""}${stage.artifact ? ` Artifact: ${stage.artifact}` : ""}`),
    "",
    "## Outputs",
    "",
    `- Build plan: ${run.outputs.buildPlanPath || ""}`,
    `- Source inventory: ${run.outputs.sourceInventoryPath || ""}`,
    `- Source scope receipt: ${run.outputs.sourceScopeReceiptPath || ""}`,
    `- Model profile: ${run.outputs.modelProfilePath || ""}`,
    `- Proof bundle: ${run.outputs.proofPath || ""}`,
    `- Eval report: ${run.outputs.evalPath || ""}`,
    `- Dataset: ${run.outputs.datasetPath || ""}`,
    `- Knowledge pack: ${run.outputs.knowledgePackPath || ""}`,
    `- Recipe: ${run.outputs.recipePath || ""}`,
    `- Export pack: ${run.outputs.exportDir || ""}`,
    `- Pack receipt: ${run.outputs.packRunReceiptPath || ""}`,
    ""
  ];
  await writeFile(run.files.receipt, lines.join("\n"), "utf-8");
}

async function finishBuilderRun(job, { ok, status, summary, error = "" }) {
  if (builderRunTerminalStatus(job.run.status)) return job.run;
  const endedAt = new Date().toISOString();
  job.run.ok = ok;
  job.run.status = status;
  job.run.summary = summary;
  job.run.error = error;
  job.run.endedAt = endedAt;
  job.run.updatedAt = endedAt;
  await writeBuilderRunReceipt(job.run);
  await persistBuilderRun(job.run);
  builderRunJobs.delete(job.run.runId);
  return job.run;
}

async function startBuilderRun(body = {}) {
  await ensureDataRoot();
  let plan = body.planId ? await getBuilderPlanById(body.planId) : await getLatestBuilderPlan();
  if (!plan && body.request) {
    plan = await buildAiBuildPlan(body.request);
  }
  if (!plan) {
    throw new Error("Create a Builder plan before starting a build.");
  }
  const runId = builderRunId();
  const runDir = join(dataRoot, "builder", "runs", runId);
  const startedAt = new Date().toISOString();
  const run = {
    schema: "modelforge.builder_run.v1",
    runId,
    planId: plan.planId,
    ok: false,
    status: "running",
    summary: `Starting build from plan ${plan.planId}.`,
    error: "",
    startedAt,
    updatedAt: startedAt,
    endedAt: "",
    sourceRoot,
    dataRoot,
    plan,
    handoff: null,
    stages: createBuilderRunStages(plan),
    outputs: {
      buildPlanPath: plan.files?.json || "",
      sourceInventoryPath: "",
      sourceScopeReceiptPath: "",
      modelProfilePath: "",
      proofPath: "",
      evalPath: "",
      sharePath: "",
      datasetPath: "",
      knowledgePackPath: "",
      recipePath: "",
      exportDir: "",
      packRunId: "",
      packRunReceiptPath: "",
      finalPlanPath: ""
    },
    files: {
      dir: runDir,
      json: join(runDir, "build-run.json"),
      receipt: join(runDir, "build-run-receipt.md")
    }
  };
  await mkdir(runDir, { recursive: true });
  await persistBuilderRun(run);
  const job = {
    run,
    cancelRequested: false,
    currentPackRunId: ""
  };
  builderRunJobs.set(runId, job);
  void executeBuilderRun(runId);
  return run;
}

async function waitForRecipePackRun(runId, job) {
  for (let index = 0; index < 300; index += 1) {
    ensureBuilderJobActive(job);
    const run = await getRecipePackRun(runId);
    if (!run || run.status !== "running") return run;
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
  throw new Error("Timed out waiting for export pack run.");
}

async function executeBuilderRun(runId) {
  const job = builderRunJobs.get(runId);
  if (!job) return null;
  try {
    let activePlan = job.run.plan;
    await runBuilderStage(job, "preflight", async () => {
      const setup = await getSetupState();
      if (!setup.configured) {
        throw new Error("Setup must be saved before Build From Plan can run.");
      }
      return {
        summary: `Setup saved. Data root: ${dataRoot}`,
        artifact: setupConfigPath
      };
    });

    const sourceBoundary = await runBuilderStage(job, "source-boundary", async () => {
      const nextSources = await walkSources(sourceRoot);
      const sourceScope = resolveSourceScope(nextSources, activePlan.request?.sourceScope || "whole-project");
      const inventory = await writeSourceInventory(job.run.files.dir, nextSources, sourceScope);
      const scopeReceipt = await writeSourceScopeReceipt(job.run.files.dir, sourceScope, {
        title: "Build From Plan Source Scope",
        requestedBy: `Builder run ${runId}`
      });
      return {
        summary: `Recorded ${sourceScope.includedFiles.toLocaleString()} included files and ${sourceScope.excludedFiles.toLocaleString()} excluded files for ${sourceScope.label}.`,
        artifact: inventory.inventoryPath,
        value: { sources: nextSources, sourceScope, scopeReceipt }
      };
    });
    const sources = sourceBoundary.sources;
    const builderSourceScope = sourceBoundary.sourceScope;
    job.run.outputs.sourceInventoryPath = join(job.run.files.dir, "source-inventory.json");
    job.run.outputs.sourceScopeReceiptPath = sourceBoundary.scopeReceipt?.markdown || join(job.run.files.dir, "source-scope.md");

    const modelExport = await runBuilderStage(job, "model-profile", async () => {
      const exported = await exportOllamaProfile(join(dataRoot, "models", "latest"), {
        baseModel: activePlan.baseModelRecommendation?.model || setupConfig.baseModel,
        modelName: defaultTargetModelName(),
        create: false
      });
      return {
        summary: exported.summary,
        artifact: exported.profilePath,
        value: exported
      };
    });
    job.run.outputs.modelProfilePath = modelExport.profilePath;

    const proofGateResult = await runBuilderStage(job, "proof-gates", async () => {
      const proofBundle = await buildProofBundle({ requestedBy: `Builder run ${runId}` });
      const evalReport = await runEvalGates();
      const shareCard = await buildShareCard({ tone: "public" });
      return {
        summary: evalReport.summary,
        artifact: proofBundle.path,
        value: { proofBundle, evalReport, shareCard }
      };
    });
    job.run.outputs.proofPath = proofGateResult.proofBundle.path;
    job.run.outputs.evalPath = join(dataRoot, "evals", "latest", "eval-report.json");
    job.run.outputs.sharePath = proofGateResult.shareCard.files?.json || "";

    const dataset = await runBuilderStage(job, "dataset-forge", async () => {
      const nextDataset = await buildDatasetForge({
        requestedBy: `Builder run ${runId}`,
        sourceScope: activePlan.request?.sourceScope || builderSourceScope.id,
        request: activePlan.request
      });
      return {
        summary: `${nextDataset.summary.totalExamples.toLocaleString()} examples and ${nextDataset.knowledgePack?.snippets || 0} retrieval snippets from ${nextDataset.sourceScope?.includedFiles?.toLocaleString() || builderSourceScope.includedFiles.toLocaleString()} scoped files.`,
        artifact: nextDataset.files.jsonl,
        value: nextDataset
      };
    });
    job.run.outputs.datasetPath = dataset.files.jsonl;
    job.run.outputs.knowledgePackPath = dataset.knowledgePack?.jsonl || "";

    const recipe = await runBuilderStage(job, "recipe", async () => {
      const nextRecipe = await buildForgeRecipe({
        modelName: modelExport.modelName,
        baseModel: modelExport.baseModel
      });
      return {
        summary: `${nextRecipe.recipeId} is ${nextRecipe.status}.`,
        artifact: nextRecipe.files.json,
        value: nextRecipe
      };
    });
    job.run.outputs.recipePath = recipe.files.json;
    job.run.outputs.exportDir = recipe.files.exportDir || "";

    const exportStageId = ["adapter-lora", "dataset-then-adapter"].includes(activePlan.recommendedRoute) ? "adapter-pack" : "export-pack";
    const packRun = await runBuilderStage(job, exportStageId, async () => {
      const nextPackRun = await startRecipePackRun({ recipeId: recipe.recipeId, modelName: recipe.targetModel });
      job.currentPackRunId = nextPackRun.runId || "";
      const finished = await waitForRecipePackRun(job.currentPackRunId, job);
      if (!finished || finished.status !== "pass") {
        throw new Error(finished?.summary || "Export pack did not complete.");
      }
      return {
        summary: finished.summary,
        artifact: finished.receiptPath,
        value: finished
      };
    });
    job.run.outputs.packRunId = packRun.runId || "";
    job.run.outputs.packRunReceiptPath = packRun.receiptPath || "";

    activePlan = await runBuilderStage(job, "finalize", async () => {
      const finalPlan = await buildAiBuildPlan(activePlan.request || {});
      return {
        summary: `${finalPlan.routeLabel}. ${builderSourceScope.includedFiles.toLocaleString()} scoped files, ${dataset.summary.totalExamples.toLocaleString()} examples, ${dataset.knowledgePack?.snippets || 0} retrieval snippets, pack receipt ready.`,
        artifact: finalPlan.files.json,
        value: finalPlan
      };
    });
    job.run.outputs.finalPlanPath = activePlan.files?.json || "";
    job.run.plan = activePlan;
    job.run.handoff = buildBuilderHandoff({
      run: job.run,
      plan: activePlan,
      dataset,
      recipe,
      modelExport,
      packRun,
      sourceScope: builderSourceScope,
      proofBundle: proofGateResult.proofBundle,
      evalReport: proofGateResult.evalReport
    });
    await finishBuilderRun(job, {
      ok: true,
      status: "pass",
      summary: job.run.handoff.summary
    });
  } catch (error) {
    const canceled = error?.code === "BUILDER_RUN_CANCELED" || job.cancelRequested;
    await finishBuilderRun(job, {
      ok: false,
      status: canceled ? "canceled" : "fail",
      summary: canceled ? `Canceled build from plan ${job.run.planId}.` : `Build from plan ${job.run.planId} failed.`,
      error: String(error?.message || error)
    });
  }
  return builderRunJobs.get(runId)?.run || getBuilderRun(runId);
}

async function cancelBuilderRun(runId = "") {
  const safeRunId = String(runId || "").trim();
  if (!safeRunId) {
    throw new Error("A builder run id is required.");
  }
  const job = builderRunJobs.get(safeRunId);
  if (!job) {
    return getBuilderRun(safeRunId);
  }
  job.cancelRequested = true;
  job.run.summary = `Cancel requested for builder run ${safeRunId}.`;
  job.run.updatedAt = new Date().toISOString();
  if (job.currentPackRunId) {
    await cancelRecipePackRun(job.currentPackRunId);
  }
  await persistBuilderRun(job.run);
  return job.run;
}

function datasetForgeId() {
  return `dataset-${new Date().toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "Z")}`;
}

function isDatasetForgeCandidate(row) {
  const extension = extname(row.path || "").toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".zip", ".gz", ".pdf"].includes(extension)) {
    return false;
  }
  if (row.sizeBytes > 420_000) {
    return false;
  }
  return ["TypeScript", "JavaScript", "Python", "Markdown", "JSON", "JSONL", "TOML", "YAML", "CSS", "HTML", "PowerShell", "Text", "File"].includes(row.language);
}

function normalizeDatasetText(text, limit = 18_000) {
  const normalized = String(text || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, "  ")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}\n\n[truncated by ModelForge Dataset Forge]` : normalized;
}

function datasetInstructionFor(row) {
  if (row.language === "Markdown") {
    return `Explain the purpose and reusable knowledge in ${row.path} without making claims outside the file.`;
  }
  if (["TypeScript", "JavaScript", "Python"].includes(row.language)) {
    return `Summarize the implementation responsibilities, public surface, and important constraints in ${row.path}.`;
  }
  if (["JSON", "JSONL", "TOML", "YAML"].includes(row.language)) {
    return `Describe what configuration or structured data ${row.path} controls.`;
  }
  return `Describe the useful project knowledge contained in ${row.path}.`;
}

function datasetAnswerFor(row, text) {
  const firstLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join(" ");
  return [
    `Source file: ${row.path}`,
    `Language: ${row.language}`,
    `License posture: ${row.license}`,
    `SHA-256: ${row.hash}`,
    "",
    "Bounded summary:",
    firstLines || "No readable text content was available after normalization.",
    "",
    "Use this answer only inside the recorded ModelForge source boundary and rebuild the dataset if this file changes."
  ].join("\n");
}

async function buildDatasetForge(body = {}) {
  await ensureDataRoot();
  const createdAt = new Date().toISOString();
  const datasetId = datasetForgeId();
  const latestDir = join(dataRoot, "datasets", "latest");
  const versionDir = join(dataRoot, "datasets", "history", datasetId);
  const maxFiles = Math.max(1, Math.min(Number(body.maxFiles || 120), 220));
  const sources = await walkSources(sourceRoot);
  const [latestProof, latestEval, latestPlan] = await Promise.all([getLatestProofBundle(), getLatestEvalReport(), getLatestBuilderPlan()]);
  const requestedScope = normalizeSourceScopeId(body.sourceScope || body.request?.sourceScope || latestPlan?.request?.sourceScope || "whole-project");
  const sourceScope = resolveSourceScope(sources, requestedScope);
  const proofSourceSummary = latestProof?.manifest?.sourceSummary || null;
  const sourcesMatchProof = Boolean(
    latestProof &&
      proofSourceSummary &&
      proofSourceSummary.totalFiles === sources.totalFiles &&
      proofSourceSummary.sampledFiles === sources.sampledFiles &&
      proofSourceSummary.totalSizeBytes === sources.totalSizeBytes
  );
  const evalMatchesProof = Boolean(latestEval && latestProof && latestEval.proofPath === latestProof.path);
  const scopedCandidateRows = sourceScope.includedRows.filter(isDatasetForgeCandidate);
  const candidateRows = scopedCandidateRows.slice(0, maxFiles);
  const examples = [];
  let skippedFiles = sources.rows.length - candidateRows.length;

  for (const row of candidateRows) {
    const absolutePath = resolve(sourceRoot, row.path);
    if (!isInsidePath(sourceRoot, absolutePath)) {
      skippedFiles += 1;
      continue;
    }
    try {
      const text = normalizeDatasetText(await readFile(absolutePath, "utf-8"));
      if (!text) {
        skippedFiles += 1;
        continue;
      }
      const instruction = datasetInstructionFor(row);
      const output = datasetAnswerFor(row, text);
      examples.push({
        id: `example-${String(examples.length + 1).padStart(4, "0")}`,
        sourcePath: row.path,
        language: row.language,
        license: row.license,
        sha256: row.hash,
        hashShort: row.hashShort,
        sizeBytes: row.sizeBytes,
        kind: "source-grounded-summary",
        instruction,
        input: text,
        output,
        messages: [
          {
            role: "system",
            content: "You are a local, source-grounded ModelForge assistant. Stay inside the supplied file and recorded source boundary."
          },
          {
            role: "user",
            content: `${instruction}\n\n${text}`
          },
          {
            role: "assistant",
            content: output
          }
        ],
        provenance: {
          sourceRoot,
          sourcePath: row.path,
          sha256: row.hash,
          license: row.license,
          proofPath: latestProof?.path || ""
        }
      });
    } catch {
      skippedFiles += 1;
    }
  }

  const jsonl = examples.map((example) => JSON.stringify(example)).join("\n") + (examples.length ? "\n" : "");
  const totalInputBytes = examples.reduce((total, example) => total + Buffer.byteLength(example.input, "utf-8"), 0);
  const totalOutputBytes = examples.reduce((total, example) => total + Buffer.byteLength(example.output, "utf-8"), 0);
  const estimatedTokens = Math.max(0, Math.round((totalInputBytes + totalOutputBytes) / 4));
  const licenseReviewedPercent = sources.totalFiles ? Math.round((sources.reviewedFiles / sources.totalFiles) * 100) : 0;
  const preview = examples.slice(0, 6).map((example) => ({
    id: example.id,
    sourcePath: example.sourcePath,
    language: example.language,
    license: example.license,
    hashShort: example.hashShort,
    instruction: example.instruction,
    inputPreview: example.input.slice(0, 220),
    outputPreview: example.output.slice(0, 260)
  }));
  const knowledgePack = await buildKnowledgePack(
    {
      requestedBy: body.requestedBy || "ModelForge UI",
      sourceScope: requestedScope,
      request: body.request,
      maxFiles
    },
    { createdAt, sources, sourceScope, latestProof, latestEval, latestPlan }
  );
  const manifest = {
    schema: "modelforge.dataset_forge.v1",
    datasetId,
    status: examples.length ? "ready" : "empty",
    createdAt,
    sourceRoot,
    dataRoot,
    requestedBy: body.requestedBy || "ModelForge UI",
    sourceScope: publicSourceScopeResolution(sourceScope),
    summary: {
      totalExamples: examples.length,
      includedFiles: examples.length,
      skippedFiles,
      totalInputBytes,
      totalOutputBytes,
      estimatedTokens,
      estimatedSize: formatBytes(Buffer.byteLength(jsonl, "utf-8")),
      licenseReviewedPercent
    },
    filters: {
      maxFiles,
      maxBytesPerFile: 420_000,
      candidateLanguages: Array.from(new Set(candidateRows.map((row) => row.language))).sort()
    },
    provenance: {
      proofPath: latestProof?.path || "",
      proofBuiltAt: latestProof?.builtAt || "",
      evalPath: latestEval ? join(dataRoot, "evals", "latest", "eval-report.json") : "",
      sourceFiles: sources.totalFiles,
      sampledFiles: sources.sampledFiles,
      scopedFiles: sourceScope.includedFiles,
      scopedDatasetCandidates: sourceScope.datasetCandidateFiles,
      sourcesMatchProof,
      evalMatchesProof,
      licenseSignals: sources.licenseSignals
    },
    splits: {
      train: Math.max(0, examples.length - Math.max(1, Math.round(examples.length * 0.1))),
      validation: examples.length ? Math.max(1, Math.round(examples.length * 0.1)) : 0
    },
    knowledgePack: knowledgePack
      ? {
          packId: knowledgePack.packId,
          status: knowledgePack.status,
          snippets: knowledgePack.summary.totalSnippets,
          estimatedTokens: knowledgePack.summary.estimatedTokens,
          manifest: knowledgePack.files.manifest,
          jsonl: knowledgePack.files.jsonl
        }
      : null,
    files: {
      dir: latestDir,
      manifest: join(latestDir, "dataset-manifest.json"),
      jsonl: join(latestDir, "dataset.jsonl"),
      readme: join(latestDir, "README.md"),
      preview: join(latestDir, "dataset-preview.md"),
      sourceScopeReceipt: join(latestDir, "source-scope.md"),
      sourceScopeJson: join(latestDir, "source-scope.json"),
      versionDir,
      versionManifest: join(versionDir, "dataset-manifest.json"),
      versionJsonl: join(versionDir, "dataset.jsonl"),
      versionReadme: join(versionDir, "README.md"),
      versionPreview: join(versionDir, "dataset-preview.md"),
      versionSourceScopeReceipt: join(versionDir, "source-scope.md"),
      versionSourceScopeJson: join(versionDir, "source-scope.json")
    },
    examplesPreview: preview
  };
  const previewMarkdown = [
    "# Dataset Forge Preview",
    "",
    `Dataset: ${datasetId}`,
    `Examples: ${examples.length}`,
    `Estimated tokens: ${estimatedTokens}`,
    `Source scope: ${sourceScope.label}`,
    `Scoped files: ${sourceScope.includedFiles}`,
    `Excluded files: ${sourceScope.excludedFiles}`,
    `Proof fresh: ${sourcesMatchProof ? "yes" : "no"}`,
    "",
    ...preview.flatMap((example) => [
      `## ${example.id} - ${example.sourcePath}`,
      "",
      `Language: ${example.language}`,
      `License: ${example.license}`,
      `Hash: ${example.hashShort}`,
      "",
      example.instruction,
      "",
      "```text",
      example.outputPreview,
      "```",
      ""
    ])
  ].join("\n");
  const readme = [
    "# ModelForge Dataset Pack",
    "",
    `Dataset: ${datasetId}`,
    `Created: ${createdAt}`,
    `Source root: ${sourceRoot}`,
    `Source scope: ${sourceScope.label}`,
    `Examples: ${examples.length}`,
    `Estimated tokens: ${estimatedTokens}`,
    `License reviewed: ${licenseReviewedPercent}%`,
    "",
    "## Files",
    "",
    "- `dataset.jsonl` - chat/instruction examples with source provenance.",
    "- `dataset-manifest.json` - counts, source boundary, proof freshness, and file paths.",
    "- `dataset-preview.md` - small human-readable sample.",
    "- `source-scope.md` - included/excluded source files for this dataset build.",
    "- `../knowledge/latest/knowledge-pack.jsonl` - local retrieval snippets for Model Lab chat.",
    "",
    "## Guardrails",
    "",
    "- Rebuild after changing the source tree.",
    "- Keep examples inside the recorded source boundary.",
    "- Treat this as a local training/export pack, not a claim that a model has learned every file.",
    ""
  ].join("\n");

  for (const dir of [latestDir, versionDir]) {
    await mkdir(dir, { recursive: true });
  }
  const versionFiles = {
    ...manifest.files,
    dir: versionDir,
    manifest: manifest.files.versionManifest,
    jsonl: manifest.files.versionJsonl,
    readme: manifest.files.versionReadme,
    preview: manifest.files.versionPreview,
    sourceScopeReceipt: manifest.files.versionSourceScopeReceipt,
    sourceScopeJson: manifest.files.versionSourceScopeJson
  };
  await writeJson(manifest.files.manifest, manifest);
  await writeFile(manifest.files.jsonl, jsonl, "utf-8");
  await writeFile(manifest.files.readme, readme, "utf-8");
  await writeFile(manifest.files.preview, previewMarkdown, "utf-8");
  await writeSourceScopeReceipt(latestDir, sourceScope, {
    title: "Dataset Forge Source Scope",
    requestedBy: manifest.requestedBy
  });
  await writeJson(manifest.files.versionManifest, { ...manifest, files: versionFiles });
  await writeFile(manifest.files.versionJsonl, jsonl, "utf-8");
  await writeFile(manifest.files.versionReadme, readme, "utf-8");
  await writeFile(manifest.files.versionPreview, previewMarkdown, "utf-8");
  await writeSourceScopeReceipt(versionDir, sourceScope, {
    title: "Dataset Forge Source Scope",
    requestedBy: manifest.requestedBy
  });
  return manifest;
}

async function getLatestDatasetForge() {
  return readJsonIfExists(join(dataRoot, "datasets", "latest", "dataset-manifest.json"));
}

function knowledgePackId(createdAt = new Date().toISOString()) {
  return `knowledge-${createdAt.replaceAll(":", "-").replace(/\.\d+Z$/, "Z")}`;
}

function isKnowledgePackCandidate(row) {
  if (!isDatasetForgeCandidate(row)) {
    return false;
  }
  if (hasSensitiveLookingPath(row)) {
    return false;
  }
  return row.sizeBytes <= 320_000;
}

const knowledgeStopWords = new Set([
  "about",
  "after",
  "again",
  "against",
  "also",
  "because",
  "before",
  "being",
  "between",
  "could",
  "every",
  "from",
  "have",
  "into",
  "just",
  "like",
  "more",
  "only",
  "other",
  "should",
  "than",
  "that",
  "their",
  "there",
  "these",
  "this",
  "through",
  "with",
  "within",
  "without",
  "would",
  "your"
]);

function extractKnowledgeKeywords(value = "", limit = 18) {
  const counts = new Map();
  const words = String(value || "")
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9_-]{2,}/g) || [];
  for (const word of words) {
    if (knowledgeStopWords.has(word) || /^\d+$/.test(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([word]) => word);
}

function knowledgeTitleFor(row, text = "") {
  const heading = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^#{1,3}\s+\S/.test(line));
  if (heading) {
    return heading.replace(/^#{1,3}\s+/, "").slice(0, 120);
  }
  return String(row.path || "").split("/").pop() || row.path || "Local source";
}

function splitKnowledgeText(text = "", maxChars = 1400, overlap = 140) {
  const blocks = String(text || "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const chunks = [];
  let current = "";
  for (const block of blocks.length ? blocks : [String(text || "").trim()]) {
    if (block.length > maxChars) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
      for (let index = 0; index < block.length; index += maxChars - overlap) {
        chunks.push(block.slice(index, index + maxChars).trim());
      }
      continue;
    }
    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length > maxChars && current) {
      chunks.push(current.trim());
      current = block;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }
  return chunks.filter((chunk) => chunk.length >= 80).slice(0, 6);
}

function publicKnowledgeSnippet(snippet, score = undefined) {
  return {
    id: snippet.id,
    sourcePath: snippet.sourcePath,
    title: snippet.title,
    language: snippet.language,
    license: snippet.license,
    hashShort: snippet.hashShort,
    chunkIndex: snippet.chunkIndex,
    keywords: snippet.keywords,
    textPreview: snippet.textPreview || String(snippet.text || "").slice(0, 220),
    ...(score === undefined ? {} : { score })
  };
}

async function buildKnowledgePack(body = {}, context = {}) {
  await ensureDataRoot();
  const createdAt = context.createdAt || new Date().toISOString();
  const packId = knowledgePackId(createdAt);
  const latestDir = join(dataRoot, "knowledge", "latest");
  const versionDir = join(dataRoot, "knowledge", "history", packId);
  const maxFiles = Math.max(1, Math.min(Number(body.maxFiles || 140), 220));
  const sources = context.sources || (await walkSources(sourceRoot));
  const [latestProof, latestEval, latestPlan] = await Promise.all([
    context.latestProof === undefined ? getLatestProofBundle() : context.latestProof,
    context.latestEval === undefined ? getLatestEvalReport() : context.latestEval,
    context.latestPlan === undefined ? getLatestBuilderPlan() : context.latestPlan
  ]);
  const requestedScope = normalizeSourceScopeId(body.sourceScope || body.request?.sourceScope || latestPlan?.request?.sourceScope || "whole-project");
  const sourceScope = context.sourceScope || resolveSourceScope(sources, requestedScope);
  const candidateRows = sourceScope.includedRows.filter(isKnowledgePackCandidate).slice(0, maxFiles);
  const proofSourceSummary = latestProof?.manifest?.sourceSummary || null;
  const sourcesMatchProof = Boolean(
    latestProof &&
      proofSourceSummary &&
      proofSourceSummary.totalFiles === sources.totalFiles &&
      proofSourceSummary.sampledFiles === sources.sampledFiles &&
      proofSourceSummary.totalSizeBytes === sources.totalSizeBytes
  );
  const evalMatchesProof = Boolean(latestEval && latestProof && latestEval.proofPath === latestProof.path);
  const snippets = [];
  const filesWithSnippets = new Set();
  let skippedFiles = Math.max(sourceScope.includedRows.length - candidateRows.length, 0);

  for (const row of candidateRows) {
    const absolutePath = resolve(sourceRoot, row.path);
    if (!isInsidePath(sourceRoot, absolutePath)) {
      skippedFiles += 1;
      continue;
    }
    try {
      const text = normalizeDatasetText(await readFile(absolutePath, "utf-8"), 24_000);
      const chunks = splitKnowledgeText(text);
      if (!chunks.length) {
        skippedFiles += 1;
        continue;
      }
      const title = knowledgeTitleFor(row, text);
      filesWithSnippets.add(row.path);
      for (const chunk of chunks) {
        const snippetId = `snippet-${String(snippets.length + 1).padStart(4, "0")}`;
        snippets.push({
          id: snippetId,
          sourcePath: row.path,
          title,
          language: row.language,
          license: row.license,
          sha256: row.hash,
          hashShort: row.hashShort,
          sizeBytes: row.sizeBytes,
          chunkIndex: snippets.filter((snippet) => snippet.sourcePath === row.path).length + 1,
          kind: "source-knowledge-snippet",
          text: chunk,
          textPreview: chunk.slice(0, 260),
          keywords: extractKnowledgeKeywords(`${row.path} ${title} ${chunk}`),
          provenance: {
            sourceRoot,
            sourcePath: row.path,
            sha256: row.hash,
            license: row.license,
            proofPath: latestProof?.path || ""
          }
        });
      }
    } catch {
      skippedFiles += 1;
    }
  }

  const jsonl = snippets.map((snippet) => JSON.stringify(snippet)).join("\n") + (snippets.length ? "\n" : "");
  const totalTextBytes = snippets.reduce((total, snippet) => total + Buffer.byteLength(snippet.text, "utf-8"), 0);
  const estimatedTokens = Math.max(0, Math.round(totalTextBytes / 4));
  const snippetsPreview = snippets.slice(0, 8).map((snippet) => publicKnowledgeSnippet(snippet));
  const files = {
    dir: latestDir,
    manifest: join(latestDir, "knowledge-manifest.json"),
    json: join(latestDir, "knowledge-pack.json"),
    jsonl: join(latestDir, "knowledge-pack.jsonl"),
    readme: join(latestDir, "README.md"),
    preview: join(latestDir, "knowledge-preview.md"),
    sourceScopeReceipt: join(latestDir, "source-scope.md"),
    sourceScopeJson: join(latestDir, "source-scope.json"),
    versionDir,
    versionManifest: join(versionDir, "knowledge-manifest.json"),
    versionJson: join(versionDir, "knowledge-pack.json"),
    versionJsonl: join(versionDir, "knowledge-pack.jsonl"),
    versionReadme: join(versionDir, "README.md"),
    versionPreview: join(versionDir, "knowledge-preview.md"),
    versionSourceScopeReceipt: join(versionDir, "source-scope.md"),
    versionSourceScopeJson: join(versionDir, "source-scope.json")
  };
  const manifest = {
    schema: "modelforge.knowledge_pack.v1",
    packId,
    status: snippets.length ? "ready" : "empty",
    createdAt,
    sourceRoot,
    dataRoot,
    requestedBy: body.requestedBy || "ModelForge UI",
    sourceScope: publicSourceScopeResolution(sourceScope),
    summary: {
      totalSnippets: snippets.length,
      includedFiles: filesWithSnippets.size,
      skippedFiles,
      totalTextBytes,
      estimatedTokens,
      estimatedSize: formatBytes(Buffer.byteLength(jsonl, "utf-8")),
      retrieval: "local keyword overlap"
    },
    filters: {
      maxFiles,
      maxBytesPerFile: 320_000,
      maxSnippetsPerFile: 6,
      candidateLanguages: Array.from(new Set(candidateRows.map((row) => row.language))).sort()
    },
    provenance: {
      proofPath: latestProof?.path || "",
      proofBuiltAt: latestProof?.builtAt || "",
      evalPath: latestEval ? join(dataRoot, "evals", "latest", "eval-report.json") : "",
      sourceFiles: sources.totalFiles,
      sampledFiles: sources.sampledFiles,
      scopedFiles: sourceScope.includedFiles,
      sourcesMatchProof,
      evalMatchesProof,
      licenseSignals: sources.licenseSignals
    },
    files,
    snippetsPreview
  };
  const previewMarkdown = [
    "# Local Knowledge Pack Preview",
    "",
    `Pack: ${packId}`,
    `Snippets: ${snippets.length}`,
    `Source scope: ${sourceScope.label}`,
    `Estimated tokens: ${estimatedTokens}`,
    "",
    ...snippetsPreview.flatMap((snippet) => [
      `## ${snippet.sourcePath}`,
      "",
      `Title: ${snippet.title}`,
      `Language: ${snippet.language}`,
      `License: ${snippet.license}`,
      `Hash: ${snippet.hashShort}`,
      `Keywords: ${snippet.keywords.join(", ")}`,
      "",
      "```text",
      snippet.textPreview,
      "```",
      ""
    ])
  ].join("\n");
  const readme = [
    "# ModelForge Local Knowledge Pack",
    "",
    `Pack: ${packId}`,
    `Created: ${createdAt}`,
    `Source root: ${sourceRoot}`,
    `Source scope: ${sourceScope.label}`,
    `Snippets: ${snippets.length}`,
    `Estimated tokens: ${estimatedTokens}`,
    "",
    "## Files",
    "",
    "- `knowledge-pack.jsonl` - source snippets for local chat retrieval.",
    "- `knowledge-pack.json` - the full local pack with snippets and provenance.",
    "- `knowledge-manifest.json` - compact manifest for UI and release receipts.",
    "- `knowledge-preview.md` - small human-readable preview.",
    "- `source-scope.md` - included/excluded source files for this pack.",
    "",
    "## Guardrails",
    "",
    "- Retrieval stays inside the recorded source scope.",
    "- Chat should say when the local pack does not contain an answer.",
    "- Rebuild after changing the source tree or source-scope rules.",
    ""
  ].join("\n");
  const pack = { ...manifest, snippets };
  const versionFiles = {
    ...files,
    dir: versionDir,
    manifest: files.versionManifest,
    json: files.versionJson,
    jsonl: files.versionJsonl,
    readme: files.versionReadme,
    preview: files.versionPreview,
    sourceScopeReceipt: files.versionSourceScopeReceipt,
    sourceScopeJson: files.versionSourceScopeJson
  };
  const versionManifest = { ...manifest, files: versionFiles };
  const versionPack = { ...versionManifest, snippets };

  for (const dir of [latestDir, versionDir]) {
    await mkdir(dir, { recursive: true });
  }
  await writeJson(files.manifest, manifest);
  await writeJson(files.json, pack);
  await writeFile(files.jsonl, jsonl, "utf-8");
  await writeFile(files.readme, readme, "utf-8");
  await writeFile(files.preview, previewMarkdown, "utf-8");
  await writeSourceScopeReceipt(latestDir, sourceScope, {
    title: "Knowledge Pack Source Scope",
    requestedBy: manifest.requestedBy
  });
  await writeJson(files.versionManifest, versionManifest);
  await writeJson(files.versionJson, versionPack);
  await writeFile(files.versionJsonl, jsonl, "utf-8");
  await writeFile(files.versionReadme, readme, "utf-8");
  await writeFile(files.versionPreview, previewMarkdown, "utf-8");
  await writeSourceScopeReceipt(versionDir, sourceScope, {
    title: "Knowledge Pack Source Scope",
    requestedBy: manifest.requestedBy
  });
  return manifest;
}

async function getLatestKnowledgePack(options = {}) {
  const manifest = await readJsonIfExists(join(dataRoot, "knowledge", "latest", "knowledge-manifest.json"));
  if (!manifest || !options.full) {
    return manifest;
  }
  return (await readJsonIfExists(manifest.files?.json || join(dataRoot, "knowledge", "latest", "knowledge-pack.json"))) || manifest;
}

function scoreKnowledgeSnippet(snippet, queryKeywords = []) {
  if (!queryKeywords.length) return 0;
  const keywords = new Set(snippet.keywords || []);
  const sourcePath = String(snippet.sourcePath || "").toLowerCase();
  const haystack = `${snippet.title || ""} ${sourcePath} ${snippet.text || ""}`.toLowerCase();
  return queryKeywords.reduce((score, keyword) => {
    let nextScore = score;
    if (keywords.has(keyword)) nextScore += 4;
    if (sourcePath.includes(keyword)) nextScore += 3;
    if (haystack.includes(keyword)) nextScore += 1;
    return nextScore;
  }, 0);
}

async function retrieveKnowledgeSnippets(prompt = "", options = {}) {
  const pack = await getLatestKnowledgePack({ full: true });
  const snippets = Array.isArray(pack?.snippets) ? pack.snippets : [];
  const queryKeywords = extractKnowledgeKeywords(prompt, 22);
  if (!pack || !snippets.length) {
    return { pack: pack || null, queryKeywords, snippets: [] };
  }
  const scored = snippets
    .map((snippet) => ({ snippet, score: scoreKnowledgeSnippet(snippet, queryKeywords) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.snippet.sourcePath.localeCompare(right.snippet.sourcePath));
  const selected = scored.slice(0, Math.max(1, Math.min(Number(options.limit || 4), 8)));
  return {
    pack,
    queryKeywords,
    snippets: selected.map((item) => ({
      ...publicKnowledgeSnippet(item.snippet, item.score),
      text: item.snippet.text
    }))
  };
}

function detectLanguage(filePath) {
  const base = filePath.toLowerCase();
  if (base === "license" || base.startsWith("license.")) return "Text";
  return languageByExtension.get(extname(filePath).toLowerCase()) || "File";
}

function isProjectLicenseFile(filePath) {
  const name = filePath.toLowerCase();
  return name === "license" || name === "copying" || name.startsWith("license.") || name.startsWith("copying.");
}

async function getProjectLicenseSignals(root) {
  const packageJson = await readJsonIfExists(join(root, "package.json"));
  const packageLicense = typeof packageJson?.license === "string" ? packageJson.license.trim() : "";
  const licenseCandidates = ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING", "COPYING.md", "COPYING.txt"];
  const projectLicensePath = licenseCandidates.find((candidate) => existsSync(join(root, candidate))) || "";
  return {
    packageLicense,
    projectLicensePath,
    projectLicenseReady: Boolean(packageLicense && projectLicensePath)
  };
}

function inferLicense(filePath, signals = {}) {
  const name = filePath.toLowerCase();
  const ext = extname(filePath).toLowerCase();
  const projectCovered = Boolean(signals.projectLicenseReady);

  if (isProjectLicenseFile(filePath)) return "Project license";
  if (name === "package.json") return signals.packageLicense ? "Package license" : "Package license missing";
  if (name === "package-lock.json" || name.endsWith("-lock.json")) return projectCovered ? "Dependency lock" : "Dependency lock pending";
  if (name.includes("node_modules/")) return "Dependency";
  if (name.startsWith("src/") || name.startsWith("scripts/") || name === "server.mjs") return projectCovered ? "Project source" : "Source pending";
  if (name.startsWith("docs/") || name === "readme.md") return projectCovered ? "Project docs" : "Docs pending";
  if (name.startsWith("public/") || [".png", ".ico", ".svg", ".jpg", ".jpeg", ".webp"].includes(ext)) return projectCovered ? "Project asset" : "Asset pending";
  if (
    name.startsWith(".") ||
    name === "index.html" ||
    name.endsWith(".json") ||
    name.endsWith(".config.js") ||
    name.endsWith(".config.ts") ||
    name.endsWith(".config.mjs") ||
    name.startsWith("tsconfig") ||
    name === "vite.config.ts"
  ) {
    return projectCovered ? "Project config" : "Config pending";
  }
  return projectCovered ? "Project file" : "License pending";
}

function isLicenseReviewedLabel(label = "") {
  return Boolean(label && !/(pending|missing|unreviewed)/i.test(label));
}

function normalizeSourcePath(value = "") {
  return String(value || "").replaceAll("\\", "/").replace(/^\/+/, "").toLowerCase();
}

function sourcePatternMatches(pathValue = "", pattern = "") {
  const relPath = normalizeSourcePath(pathValue);
  const normalized = normalizeSourcePath(pattern).replace(/^\*\//, "");
  if (!normalized) return false;
  if (normalized === "*") return true;
  if (normalized.includes("*")) {
    const expression = normalized
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    return new RegExp(`^${expression}$`, "i").test(relPath);
  }
  if (normalized.endsWith("/")) {
    return relPath.startsWith(normalized);
  }
  return relPath === normalized || relPath.startsWith(`${normalized}/`) || relPath.includes(normalized);
}

function sourceRulesFromConfig(config = setupConfig) {
  return {
    includePatterns: splitPatternList(config.sourceIncludes),
    excludePatterns: splitPatternList(config.sourceExcludes)
  };
}

function sourceRuleDecision(relPath = "", rules = sourceRulesFromConfig()) {
  const includePatterns = rules.includePatterns || [];
  const excludePatterns = rules.excludePatterns || [];
  const excludedBy = excludePatterns.find((pattern) => sourcePatternMatches(relPath, pattern)) || "";
  if (excludedBy) {
    return { include: false, reason: `Excluded by ${excludedBy}` };
  }
  const includedBy = includePatterns.find((pattern) => sourcePatternMatches(relPath, pattern)) || "";
  if (includePatterns.length && !includedBy) {
    return { include: false, reason: "Outside include rules" };
  }
  return { include: true, reason: includedBy ? `Included by ${includedBy}` : "Included" };
}

async function walkSources(root, limit = 450) {
  const rows = [];
  let totalFiles = 0;
  let totalSize = 0;
  let ruleExcludedFiles = 0;
  const excludedPreview = [];
  const licenseSignals = await getProjectLicenseSignals(root);
  const sourceRules = sourceRulesFromConfig();

  async function walk(dir) {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const absolute = join(dir, entry.name);
      const rel = relative(root, absolute).replaceAll("\\", "/");

      if (entry.isDirectory()) {
        const directoryDecision = sourceRuleDecision(`${rel}/`, { includePatterns: [], excludePatterns: sourceRules.excludePatterns });
        if (!skippedDirs.has(entry.name) && directoryDecision.include) {
          await walk(absolute);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (skippedSourceFileNames.has(entry.name)) {
        continue;
      }

      let fileStat;
      try {
        fileStat = await stat(absolute);
      } catch {
        continue;
      }

      const ruleDecision = sourceRuleDecision(rel, sourceRules);
      if (!ruleDecision.include) {
        ruleExcludedFiles += 1;
        if (excludedPreview.length < 12) {
          excludedPreview.push({
            path: rel,
            language: detectLanguage(rel),
            size: formatBytes(fileStat.size),
            sizeBytes: fileStat.size,
            reason: ruleDecision.reason
          });
        }
        continue;
      }

      totalFiles += 1;
      totalSize += fileStat.size;

      if (rows.length >= limit) {
        continue;
      }

      let digest = "pending";
      try {
        digest = await sha256File(absolute);
      } catch {
        digest = "unreadable";
      }

      rows.push({
        path: rel,
        type: "File",
        language: detectLanguage(rel),
        sizeBytes: fileStat.size,
        size: formatBytes(fileStat.size),
        license: inferLicense(rel, licenseSignals),
        added: fileStat.mtime.toISOString().slice(0, 16).replace("T", " "),
        hash: digest,
        hashShort: digest === "unreadable" ? digest : `${digest.slice(0, 10)}...${digest.slice(-8)}`
      });
    }
  }

  await walk(root);

  const reviewed = rows.filter((row) => isLicenseReviewedLabel(row.license)).length;
  const unreviewed = Math.max(totalFiles - reviewed, 0);

  return {
    root,
    totalFiles,
    sampledFiles: rows.length,
    totalSizeBytes: totalSize,
    totalSize: formatBytes(totalSize),
    reviewedFiles: reviewed,
    unreviewedFiles: unreviewed,
    licenseSignals,
    sourceRules: {
      schema: "modelforge.source_rules.v1",
      includePatterns: sourceRules.includePatterns,
      excludePatterns: sourceRules.excludePatterns,
      includedFiles: totalFiles,
      excludedFiles: ruleExcludedFiles,
      scannedFiles: totalFiles + ruleExcludedFiles,
      excludedPreview
    },
    rows
  };
}

function buildLicenseReview(sources) {
  const rows = sources.rows || [];
  const categoryCounts = rows.reduce((counts, row) => {
    counts[row.license] = (counts[row.license] || 0) + 1;
    return counts;
  }, {});
  const pendingRows = rows.filter((row) => !isLicenseReviewedLabel(row.license));
  const coveragePercent = sources.totalFiles ? Math.round((sources.reviewedFiles / sources.totalFiles) * 100) : 0;
  const blockers = [];
  if (!sources.licenseSignals?.projectLicensePath) {
    blockers.push("Add a project LICENSE file.");
  }
  if (!sources.licenseSignals?.packageLicense) {
    blockers.push("Add a package.json license field.");
  }
  if (pendingRows.length) {
    blockers.push(`Classify or clear ${pendingRows.length.toLocaleString()} pending file${pendingRows.length === 1 ? "" : "s"}.`);
  }

  return {
    schema: "modelforge.license_review.v1",
    createdAt: new Date().toISOString(),
    coveragePercent,
    reviewedFiles: sources.reviewedFiles,
    pendingFiles: sources.unreviewedFiles,
    projectLicensePath: sources.licenseSignals?.projectLicensePath || "",
    packageLicense: sources.licenseSignals?.packageLicense || "",
    projectLicenseReady: Boolean(sources.licenseSignals?.projectLicenseReady),
    blockers,
    categoryCounts,
    queue: pendingRows.slice(0, 8).map((row) => ({
      path: row.path,
      label: row.license,
      language: row.language,
      size: row.size
    }))
  };
}

async function writeSourceInventory(targetDir, sources, sourceScope = null) {
  const inventoryPath = join(targetDir, "source-inventory.json");
  const summaryPath = join(targetDir, "source-summary.md");
  const payload = {
    schema: "modelforge.source_inventory.v1",
    createdAt: new Date().toISOString(),
    sourceRoot,
    totalFiles: sources.totalFiles,
    sampledFiles: sources.sampledFiles,
    totalSizeBytes: sources.totalSizeBytes,
    reviewedFiles: sources.reviewedFiles,
    unreviewedFiles: sources.unreviewedFiles,
    licenseSignals: sources.licenseSignals,
    sourceRules: sources.sourceRules || null,
    licenseReview: buildLicenseReview(sources),
    sourceScope: sourceScope ? publicSourceScopeResolution(sourceScope) : null,
    rows: sources.rows
  };
  const scopeLines = sourceScope
    ? [
        "",
        "## Source Scope",
        "",
        `Scope: ${sourceScope.label}`,
        `Included files: ${sourceScope.includedFiles}`,
        `Excluded files: ${sourceScope.excludedFiles}`,
        `Dataset candidates: ${sourceScope.datasetCandidateFiles}`,
        "",
        "### Included Preview",
        "",
        ...sourceScope.includedPreview.map((row) => `- ${row.path} (${row.language}, ${row.size}) - ${row.reason}`),
        "",
        "### Excluded Preview",
        "",
        ...sourceScope.excludedPreview.map((row) => `- ${row.path} (${row.language}, ${row.size}) - ${row.reason}`)
      ]
    : [];
  const summary = [
    "# Source Inventory",
    "",
    `Source root: ${sourceRoot}`,
    `Total files: ${sources.totalFiles}`,
    `Sampled files: ${sources.sampledFiles}`,
    `Total size: ${sources.totalSize}`,
    `Reviewed files: ${sources.reviewedFiles}`,
    `Unreviewed files: ${sources.unreviewedFiles}`,
    `Project license file: ${sources.licenseSignals?.projectLicensePath || "missing"}`,
    `Package license field: ${sources.licenseSignals?.packageLicense || "missing"}`,
    "",
    ...scopeLines,
    "",
    "## Sampled Paths",
    "",
    ...sources.rows.slice(0, 40).map((row) => `- ${row.path} (${row.language}, ${row.size}, ${row.license})`),
    ""
  ].join("\n");
  await writeJson(inventoryPath, payload);
  await writeFile(summaryPath, summary, "utf-8");
  return {
    inventoryPath,
    summaryPath,
    summary: `Recorded ${sources.sampledFiles} sampled source rows from ${sources.totalFiles} files.`
  };
}

async function runRepoMoriSnapshot(runDir, label = "run") {
  const startedAt = new Date().toISOString();
  const outputDir = join(runDir, "repomori");
  await mkdir(outputDir, { recursive: true });
  const toolStatus = await getToolStatus();
  const command = [
    pythonCommand,
    "-m",
    "repomori",
    "snapshot",
    sourceRoot,
    "--out-dir",
    join(outputDir, "packs"),
    "--handoff",
    `ModelForge ${label} source pack`,
    "--json"
  ];

  if (!toolStatus.repomori.ok) {
    const receiptPath = join(outputDir, "repomori-skipped.json");
    const receipt = commandReceipt({
      name: "repomori_snapshot",
      ok: false,
      status: "skipped",
      command,
      outputPath: receiptPath,
      summary: "RepoMori is not installed in the active Python, so source-pack creation was skipped.",
      startedAt,
      endedAt: new Date().toISOString()
    });
    await writeJson(receiptPath, receipt);
    return receipt;
  }

  const result = await runCommand(command[0], command.slice(1), { timeout: 180000, cwd: sourceRoot });
  const outputPath = join(outputDir, "repomori-output.json");
  await writeFile(outputPath, result.stdout || result.stderr || "", "utf-8");
  const receipt = commandReceipt({
    name: "repomori_snapshot",
    ok: result.ok,
    command,
    outputPath,
    summary: result.ok ? "RepoMori source pack snapshot completed." : "RepoMori source pack snapshot failed.",
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error,
    startedAt,
    endedAt: new Date().toISOString()
  });
  await writeJson(join(outputDir, "repomori-receipt.json"), receipt);
  return receipt;
}

async function runAgentLedgerSnapshot(runDir, label = "run") {
  const startedAt = new Date().toISOString();
  const outputDir = join(runDir, "agentledger");
  await mkdir(outputDir, { recursive: true });
  const command = [
    pythonCommand,
    "-m",
    "agentledger",
    "snapshot",
    "--repo",
    sourceRoot,
    "--out",
    outputDir,
    "--privacy-mode",
    "summary",
    "--no-tokometer"
  ];
  const result = await runCommand(command[0], command.slice(1), { timeout: 90000, cwd: sourceRoot });
  let latestPath = "";
  try {
    latestPath = (await readFile(join(outputDir, "latest.txt"), "utf-8")).trim();
  } catch {
    latestPath = "";
  }
  const receipt = commandReceipt({
    name: "agentledger_snapshot",
    ok: result.ok,
    command,
    outputPath: latestPath || outputDir,
    summary: result.ok ? "AgentLedger repository snapshot completed." : "AgentLedger repository snapshot failed.",
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error,
    startedAt,
    endedAt: new Date().toISOString()
  });
  await writeJson(join(outputDir, "agentledger-receipt.json"), receipt);
  return receipt;
}

function buildSystemPrompt(sources) {
  return [
    "You are ModelForge Repo-Aware Local Model.",
    "",
    "You are a local-first assistant for one explicitly supplied source workspace.",
    "Use the source inventory and model card as the boundary for project-specific claims.",
    "When you are uncertain, say what evidence would be needed instead of inventing details.",
    "Do not claim that source code, datasets, licenses, or evaluations were reviewed unless the evidence bundle records it.",
    "Prefer concise engineering answers with file paths, commands, risks, and next steps.",
    "",
    "Current source summary:",
    `- Source root: ${sourceRoot}`,
    `- Files indexed: ${sources.totalFiles}`,
    `- Sampled files: ${sources.sampledFiles}`,
    `- Total source size: ${sources.totalSize}`,
    `- Preliminary reviewed files: ${sources.reviewedFiles}`,
    `- Preliminary unreviewed files: ${sources.unreviewedFiles}`,
    "",
    "Evidence rule: if a question depends on provenance, cite the local proof bundle path or ask the user to run the relevant gate."
  ].join("\n");
}

async function exportOllamaProfile(targetDir, options = {}) {
  const startedAt = new Date().toISOString();
  const ollama = await getOllamaStatus();
  const sources = await walkSources(sourceRoot);
  const modelDir = join(targetDir, "ollama-profile");
  await mkdir(modelDir, { recursive: true });
  const baseModel = options.baseModel || setupConfig.baseModel || ollama.selectedModel || "llama3.2:3b";
  const modelName = options.modelName || defaultTargetModelName();
  const systemPrompt = buildSystemPrompt(sources);
  const modelfile = [
    `FROM ${baseModel}`,
    "",
    "PARAMETER temperature 0.2",
    "PARAMETER top_p 0.9",
    "PARAMETER num_ctx 8192",
    "",
    "SYSTEM \"\"\"",
    systemPrompt,
    "\"\"\"",
    ""
  ].join("\n");
  const modelfilePath = join(modelDir, "Modelfile");
  const promptPath = join(modelDir, "system-prompt.md");
  const profilePath = join(modelDir, "model-profile.json");
  await writeFile(modelfilePath, modelfile, "utf-8");
  await writeFile(promptPath, systemPrompt + "\n", "utf-8");
  const profile = {
    schema: "modelforge.ollama_profile.v1",
    createdAt: new Date().toISOString(),
    modelName,
    baseModel,
    modelfilePath,
    promptPath,
    sourceRoot,
    ollamaModelsRoot: ollama.modelsRoot,
    createCommand: ["ollama", "create", modelName, "-f", modelfilePath]
  };
  await writeJson(profilePath, profile);

  let createReceipt = null;
  if (options.create === true) {
    const command = ["ollama", "create", modelName, "-f", modelfilePath];
    const actualCommand = [ollamaCommand(), "create", modelName, "-f", modelfilePath];
    const result = await runCommand(actualCommand[0], actualCommand.slice(1), { timeout: 120000, cwd: modelDir });
    createReceipt = commandReceipt({
      name: "ollama_create",
      ok: result.ok,
      command,
      outputPath: profilePath,
      summary: result.ok ? `Created Ollama model ${modelName}.` : `Ollama model creation failed for ${modelName}.`,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error,
      startedAt,
      endedAt: new Date().toISOString()
    });
    await writeJson(join(modelDir, "ollama-create-receipt.json"), createReceipt);
  }

  return {
    status: "ready",
    path: modelDir,
    modelfilePath,
    promptPath,
    profilePath,
    modelName,
    baseModel,
    created: createReceipt?.ok || false,
    createReceipt,
    summary: `Exported Ollama profile for ${modelName} from ${baseModel}.`
  };
}

async function getLatestModelExport() {
  const modelDir = join(dataRoot, "models", "latest", "ollama-profile");
  const modelfilePath = join(modelDir, "Modelfile");
  const profilePath = join(modelDir, "model-profile.json");
  if (!existsSync(modelfilePath) || !existsSync(profilePath)) {
    return null;
  }

  const profile = await readJsonIfExists(profilePath);
  const createReceipt = await readJsonIfExists(join(modelDir, "ollama-create-receipt.json"));
  const modelName = profile?.modelName || "modelforge-local:latest";
  const baseModel = profile?.baseModel || "";
  return {
    status: "ready",
    path: modelDir,
    modelfilePath,
    promptPath: profile?.promptPath || join(modelDir, "system-prompt.md"),
    profilePath,
    modelName,
    baseModel,
    created: Boolean(createReceipt?.ok),
    createReceipt,
    summary: `Exported Ollama profile for ${modelName}${baseModel ? ` from ${baseModel}` : ""}.`
  };
}

async function getLatestProofBundle() {
  let proofDir = "";
  try {
    proofDir = (await readFile(join(dataRoot, "latest-proof.txt"), "utf-8")).trim();
  } catch {
    return null;
  }
  if (!proofDir || !existsSync(proofDir)) {
    return null;
  }

  const manifest = await readJsonIfExists(join(proofDir, "evidence-manifest.json"));
  if (!manifest) {
    return null;
  }
  let modelCard = "";
  let sourceSummary = "";
  try {
    modelCard = await readFile(join(proofDir, "model-card.md"), "utf-8");
  } catch {
    modelCard = "";
  }
  try {
    sourceSummary = await readFile(join(proofDir, "source-summary.md"), "utf-8");
  } catch {
    sourceSummary = "";
  }
  return {
    status: "ready",
    path: proofDir,
    builtAt: manifest.createdAt || "",
    size: "local",
    manifest,
    modelCard,
    sourceSummary
  };
}

async function getLatestEvalReport() {
  return readJsonIfExists(join(dataRoot, "evals", "latest", "eval-report.json"));
}

async function getLatestShareCard() {
  return readJsonIfExists(join(dataRoot, "share", "latest", "share-card.json"));
}

async function getLatestForgeRecipe() {
  return readJsonIfExists(join(dataRoot, "recipes", "latest", "forge-recipe.json"));
}

async function getForgeRecipeHistory(limit = 8) {
  const historyRoot = join(dataRoot, "recipes", "history");
  let entries = [];
  try {
    entries = await readdir(historyRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const recipes = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readJsonIfExists(join(historyRoot, entry.name, "forge-recipe.json")))
  );
  return recipes
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, limit);
}

async function getForgeRecipeById(recipeId) {
  const safeRecipeId = String(recipeId || "").trim();
  if (!/^recipe-\d{4}-\d{2}-\d{2}T/.test(safeRecipeId)) {
    throw new Error("A valid recipe id is required.");
  }
  return readJsonIfExists(join(dataRoot, "recipes", "history", safeRecipeId, "forge-recipe.json"));
}

async function selectForgeRecipe(recipeId) {
  const safeRecipeId = String(recipeId || "").trim();
  if (!/^recipe-\d{4}-\d{2}-\d{2}T/.test(safeRecipeId)) {
    throw new Error("A valid recipe id is required.");
  }
  const versionDir = join(dataRoot, "recipes", "history", safeRecipeId);
  const recipe = await readJsonIfExists(join(versionDir, "forge-recipe.json"));
  if (!recipe) {
    throw new Error(`Recipe ${safeRecipeId} was not found.`);
  }
  const latestDir = join(dataRoot, "recipes", "latest");
  await writeJson(join(latestDir, "forge-recipe.json"), recipe);
  const versionMarkdown = join(versionDir, "forge-recipe.md");
  if (!(await copyIfExists(versionMarkdown, join(latestDir, "forge-recipe.md")))) {
    await writeFile(join(latestDir, "forge-recipe.md"), `# Forge Recipe\n\nRecipe ID: ${safeRecipeId}\n`, "utf-8");
  }
  return recipe;
}

async function getLatestRecipeRun() {
  return readJsonIfExists(join(dataRoot, "exports", "latest-run.json"));
}

function recipeRunId() {
  return `pack-run-${new Date().toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "Z")}`;
}

function terminalRunStatus(status) {
  return ["pass", "fail", "canceled"].includes(status);
}

async function prepareRecipePackRun(body = {}) {
  const startedAt = new Date().toISOString();
  const recipe = body.recipeId ? await getForgeRecipeById(body.recipeId) : await getLatestForgeRecipe();
  if (!recipe) {
    throw new Error("Build or select a Forge Recipe before running the export pack.");
  }

  const exportsRoot = resolve(dataRoot, "exports");
  const exportDir = resolve(recipe.files?.exportDir || join(exportsRoot, recipe.recipeId));
  if (!isInsidePath(exportsRoot, exportDir)) {
    throw new Error("Recipe export path is outside the ModelForge exports folder.");
  }

  const modelfilePath = join(exportDir, "ollama", "Modelfile");
  if (!existsSync(modelfilePath)) {
    throw new Error("The selected export pack does not include ollama/Modelfile.");
  }

  const targetModel = String(body.modelName || recipe.targetModel || "modelforge-local:latest").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(targetModel)) {
    throw new Error("Model name can only contain letters, numbers, '.', '-', '_', '/', and ':'.");
  }

  const relativeModelfile = join("ollama", "Modelfile");
  const displayModelfile = process.platform === "win32" ? ".\\ollama\\Modelfile" : "./ollama/Modelfile";
  const command = ["ollama", "create", targetModel, "-f", displayModelfile];
  const runId = recipeRunId();
  const historyRunPath = join(exportsRoot, "runs", `${runId}.json`);
  const receiptPath = join(exportDir, "ollama", "ollama-create-receipt.json");

  return {
    startedAt,
    recipe,
    targetModel,
    exportDir,
    relativeModelfile,
    command,
    runId,
    historyRunPath,
    receiptPath,
    exportRunPath: join(exportDir, "model-forge-run.json")
  };
}

async function persistRecipeRun(run) {
  await writeJson(run.runPath, run);
  if (run.exportRunPath) {
    await writeJson(run.exportRunPath, run);
  }
  await writeJson(join(dataRoot, "exports", "latest-run.json"), run);
}

async function startRecipePackRun(body = {}) {
  const prepared = await prepareRecipePackRun(body);
  const receipt = {
    name: "recipe_pack_ollama_create",
    ok: false,
    status: "running",
    command: prepared.command,
    outputPath: prepared.receiptPath,
    summary: `Running Ollama create for export pack ${prepared.recipe.recipeId}.`,
    stdoutTail: "",
    stderrTail: "",
    error: "",
    startedAt: prepared.startedAt,
    endedAt: ""
  };
  const packRun = {
    schema: "modelforge.recipe_pack_run.v1",
    runId: prepared.runId,
    ok: false,
    status: "running",
    recipeId: prepared.recipe.recipeId,
    targetModel: prepared.targetModel,
    exportDir: prepared.exportDir,
    command: prepared.command,
    receiptPath: prepared.receiptPath,
    runPath: prepared.historyRunPath,
    exportRunPath: prepared.exportRunPath,
    summary: receipt.summary,
    startedAt: prepared.startedAt,
    endedAt: "",
    updatedAt: prepared.startedAt,
    receipt
  };
  await persistRecipeRun(packRun);

  const job = {
    run: packRun,
    child: null,
    stdout: "",
    stderr: "",
    cancelRequested: false
  };
  recipeRunJobs.set(prepared.runId, job);

  function updateLiveTails() {
    job.run.updatedAt = new Date().toISOString();
    job.run.receipt.stdoutTail = tail(job.stdout, 4000);
    job.run.receipt.stderrTail = tail(job.stderr, 4000);
  }

  try {
    const child = spawn(ollamaCommand(), ["create", prepared.targetModel, "-f", prepared.relativeModelfile], {
      cwd: prepared.exportDir,
      env: commandEnv(),
      windowsHide: true
    });
    job.child = child;

    child.stdout.on("data", (chunk) => {
      job.stdout += String(chunk || "");
      updateLiveTails();
    });
    child.stderr.on("data", (chunk) => {
      job.stderr += String(chunk || "");
      updateLiveTails();
    });
    child.on("error", async (error) => {
      job.stderr += `\n${String(error?.message || error)}`;
      await finishRecipePackJob(prepared.runId, { code: 1, error: String(error?.message || error) });
    });
    child.on("close", async (code, signal) => {
      await finishRecipePackJob(prepared.runId, { code, signal });
    });
  } catch (error) {
    job.stderr += `\n${String(error?.message || error)}`;
    await finishRecipePackJob(prepared.runId, { code: 1, error: String(error?.message || error) });
  }

  return packRun;
}

async function finishRecipePackJob(runId, result = {}) {
  const job = recipeRunJobs.get(runId);
  if (!job || terminalRunStatus(job.run.status)) {
    return job?.run || null;
  }

  const endedAt = new Date().toISOString();
  const canceled = job.cancelRequested || result.signal === "SIGTERM";
  const ok = !canceled && result.code === 0 && !result.error;
  const status = canceled ? "canceled" : ok ? "pass" : "fail";
  const summary = canceled
    ? `Canceled Ollama create for export pack ${job.run.recipeId}.`
    : ok
      ? `Created Ollama model ${job.run.targetModel} from export pack ${job.run.recipeId}.`
      : `Ollama create failed for export pack ${job.run.recipeId}.`;
  const receipt = commandReceipt({
    name: "recipe_pack_ollama_create",
    ok,
    status: canceled ? "canceled" : ok ? "ok" : "failed",
    command: job.run.command,
    outputPath: job.run.receiptPath,
    summary,
    stdout: job.stdout,
    stderr: job.stderr,
    error: result.error || "",
    startedAt: job.run.startedAt,
    endedAt
  });
  job.run.ok = ok;
  job.run.status = status;
  job.run.summary = summary;
  job.run.endedAt = endedAt;
  job.run.updatedAt = endedAt;
  job.run.receipt = receipt;
  await writeJson(job.run.receiptPath, receipt);
  await persistRecipeRun(job.run);
  recipeRunJobs.delete(runId);
  return job.run;
}

async function getRecipePackRun(runId = "") {
  const safeRunId = String(runId || "").trim();
  if (safeRunId && recipeRunJobs.has(safeRunId)) {
    return recipeRunJobs.get(safeRunId).run;
  }
  if (safeRunId) {
    if (!/^pack-run-\d{4}-\d{2}-\d{2}T/.test(safeRunId)) {
      throw new Error("A valid pack run id is required.");
    }
    const fromHistory = await readJsonIfExists(join(dataRoot, "exports", "runs", `${safeRunId}.json`));
    if (fromHistory) return fromHistory;
  }
  return getLatestRecipeRun();
}

async function cancelRecipePackRun(runId = "") {
  const safeRunId = String(runId || "").trim();
  if (!safeRunId) {
    throw new Error("A pack run id is required.");
  }
  const job = recipeRunJobs.get(safeRunId);
  if (!job) {
    return getRecipePackRun(safeRunId);
  }
  job.cancelRequested = true;
  job.run.summary = `Cancel requested for export pack ${job.run.recipeId}.`;
  job.run.updatedAt = new Date().toISOString();
  job.child?.kill();
  return job.run;
}

async function getRecipeRunHistory(limit = 8) {
  const historyRoot = join(dataRoot, "exports", "runs");
  let entries = [];
  try {
    entries = await readdir(historyRoot, { withFileTypes: true });
  } catch {
    entries = [];
  }
  const runs = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => readJsonIfExists(join(historyRoot, entry.name)))
  );
  const latest = await getLatestRecipeRun();
  const byId = new Map();
  for (const run of [...recipeRunJobs.values()].map((job) => job.run).concat(runs.filter(Boolean), latest ? [latest] : [])) {
    const key = run.runId || `${run.recipeId}-${run.startedAt}`;
    byId.set(key, run);
  }
  return Array.from(byId.values())
    .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")))
    .slice(0, limit);
}

async function runEvalGates() {
  const createdAt = new Date().toISOString();
  const [sources, toolStatus, latestProof, latestModelExport] = await Promise.all([
    walkSources(sourceRoot),
    getToolStatus(),
    getLatestProofBundle(),
    getLatestModelExport()
  ]);
  const receipts = latestProof?.manifest?.receipts || [];
  const receiptOk = (name) => receipts.find((receipt) => receipt.name === name)?.ok === true;
  const reviewedRatio = sources.totalFiles ? sources.reviewedFiles / sources.totalFiles : 0;
  const licenseReview = buildLicenseReview(sources);
  const modelProfileReady = Boolean(latestModelExport?.modelfilePath && existsSync(latestModelExport.modelfilePath));
  const sourceHashesReady = sources.rows.length > 0 && sources.rows.every((row) => row.hash && row.hash !== "pending" && row.hash !== "unreadable");
  const proofSourceSummary = latestProof?.manifest?.sourceSummary || null;
  const proofFresh = Boolean(
    proofSourceSummary &&
      proofSourceSummary.totalFiles === sources.totalFiles &&
      proofSourceSummary.sampledFiles === sources.sampledFiles &&
      proofSourceSummary.totalSizeBytes === sources.totalSizeBytes
  );

  const gates = [
    {
      id: "source-hashes",
      label: "Source Hashes",
      status: sourceHashesReady ? "pass" : "fail",
      value: `${sources.sampledFiles}/${sources.totalFiles}`,
      detail: sourceHashesReady ? "Sampled files have SHA-256 hashes." : "Some sampled files could not be hashed."
    },
    {
      id: "provenance-receipts",
      label: "Provenance Receipts",
      status: receiptOk("repomori_snapshot") && receiptOk("agentledger_snapshot") ? "pass" : "warn",
      value: `${receipts.filter((receipt) => receipt.ok).length}/${Math.max(receipts.length, 2)}`,
      detail: "Requires RepoMori and AgentLedger receipts from the latest proof bundle."
    },
    {
      id: "proof-freshness",
      label: "Proof Freshness",
      status: proofFresh ? "pass" : "fail",
      value: proofSourceSummary ? `${proofSourceSummary.totalFiles}/${sources.totalFiles}` : "missing",
      detail: proofFresh ? "Proof bundle matches the current source inventory." : "Rebuild proof so receipts match the current source tree."
    },
    {
      id: "license-review",
      label: "License Review",
      status: reviewedRatio >= 0.6 && licenseReview.projectLicenseReady ? "pass" : "warn",
      value: `${Math.round(reviewedRatio * 100)}%`,
      detail:
        reviewedRatio >= 0.6 && licenseReview.projectLicenseReady
          ? "License review coverage is above the release threshold."
          : licenseReview.blockers[0] || "License review is preliminary and needs expansion before public release."
    },
    {
      id: "pii-filenames",
      label: "PII Filename Sweep",
      status: sources.rows.some((row) => /secret|token|password|credential|private/i.test(row.path)) ? "warn" : "pass",
      value: "sampled",
      detail: "Checks sampled filenames for obvious sensitive-data signals."
    },
    {
      id: "model-profile",
      label: "Model Profile",
      status: modelProfileReady ? "pass" : "fail",
      value: latestModelExport?.modelName || "missing",
      detail: modelProfileReady ? "Ollama Modelfile/profile exists." : "Export an Ollama profile before release."
    },
    {
      id: "ollama-create",
      label: "Ollama Create",
      status: latestModelExport?.created ? "pass" : "ready",
      value: latestModelExport?.created ? "created" : "manual",
      detail: latestModelExport?.created ? "Local Ollama model was created from the profile." : "Creation is gated and has not been run yet."
    },
    {
      id: "tool-availability",
      label: "Tool Availability",
      status: toolStatus.repomori.ok && toolStatus.agentledger.ok && toolStatus.ollama.ok ? "pass" : "warn",
      value: `${[toolStatus.repomori.ok, toolStatus.agentledger.ok, toolStatus.ollama.ok].filter(Boolean).length}/3`,
      detail: "RepoMori, AgentLedger, and Ollama should all be available."
    }
  ];
  const passCount = gates.filter((gate) => gate.status === "pass").length;
  const warnCount = gates.filter((gate) => gate.status === "warn").length;
  const failCount = gates.filter((gate) => gate.status === "fail").length;
  const report = {
    schema: "modelforge.eval_report.v1",
    createdAt,
    sourceRoot,
    proofPath: latestProof?.path || "",
    modelName: latestModelExport?.modelName || "",
    summary: `${passCount}/${gates.length} gates passing, ${warnCount} warnings, ${failCount} failures.`,
    licenseReview,
    gates
  };
  const evalDir = join(dataRoot, "evals", "latest");
  await writeJson(join(evalDir, "eval-report.json"), report);
  await writeJson(join(evalDir, "license-review.json"), licenseReview);
  return report;
}

async function buildShareCard(body = {}) {
  const createdAt = new Date().toISOString();
  const [latestProof, latestModelExport] = await Promise.all([getLatestProofBundle(), getLatestModelExport()]);
  const evalReport = (await getLatestEvalReport()) || (await runEvalGates());
  const modelName = latestModelExport?.modelName || "modelforge-local:latest";
  const tone = body.tone || "public";
  const text = [
    "I built a source-available, local-first AI model forge workflow.",
    "",
    `Model profile: ${modelName}`,
    `Source boundary: ${sourceRoot}`,
    `Proof bundle: ${latestProof?.path || "not built yet"}`,
    `Eval status: ${evalReport.summary}`,
    "",
    "Receipts: source hashes, RepoMori source pack, AgentLedger run record, Ollama Modelfile.",
    "Position: source-available AI can be measured, reproduced, and improved in public without pretending every claim is already proven."
  ].join("\n");
  const card = {
    schema: "modelforge.share_card.v1",
    createdAt,
    tone,
    headline: "Source-available model forge, with receipts.",
    text,
    modelName,
    proofPath: latestProof?.path || "",
    evalSummary: evalReport.summary,
    files: {
      markdown: join(dataRoot, "share", "latest", "share-card.md"),
      json: join(dataRoot, "share", "latest", "share-card.json")
    }
  };
  await writeJson(card.files.json, card);
  await writeFile(card.files.markdown, `# ${card.headline}\n\n${text}\n`, "utf-8");
  return card;
}

async function buildForgeRecipe(body = {}) {
  const createdAt = new Date().toISOString();
  const recipeId = `recipe-${createdAt.replaceAll(":", "-").replace(/\.\d+Z$/, "Z")}`;
  const recipeDir = join(dataRoot, "recipes", "latest");
  const historyRoot = join(dataRoot, "recipes", "history");
  const versionDir = join(historyRoot, recipeId);
  const exportDir = join(dataRoot, "exports", recipeId);
  const jsonPath = join(recipeDir, "forge-recipe.json");
  const markdownPath = join(recipeDir, "forge-recipe.md");
  const versionJsonPath = join(versionDir, "forge-recipe.json");
  const versionMarkdownPath = join(versionDir, "forge-recipe.md");
  const exportManifestPath = join(exportDir, "model-forge-package.json");
  const exportReadmePath = join(exportDir, "README.md");
  const sources = await walkSources(sourceRoot);
  const [toolStatus, latestProof, latestModelExport, latestEval, latestShare, latestDataset, latestKnowledgePack, ollama] = await Promise.all([
    getToolStatus(),
    getLatestProofBundle(),
    getLatestModelExport(),
    getLatestEvalReport(),
    getLatestShareCard(),
    getLatestDatasetForge(),
    getLatestKnowledgePack(),
    getOllamaStatus()
  ]);
  let existingVersionCount = 0;
  try {
    existingVersionCount = (await readdir(historyRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).length;
  } catch {
    existingVersionCount = 0;
  }
  const dataset = estimateDatasetMetrics(sources);
  const baseModel = body.baseModel || latestModelExport?.baseModel || ollama.selectedModel || "";
  const targetModel = body.modelName || latestModelExport?.modelName || "modelforge-local:latest";
  const proofPath = latestProof?.path || "";
  const evalPath = latestEval ? join(dataRoot, "evals", "latest", "eval-report.json") : "";
  const sharePath = latestShare?.files?.json || "";
  const datasetPath = latestDataset?.files?.jsonl || "";
  const knowledgePackPath = latestKnowledgePack?.files?.jsonl || "";
  const proofSourceSummary = latestProof?.manifest?.sourceSummary || null;
  const sourcesMatchProof = Boolean(
    latestProof &&
      proofSourceSummary &&
      proofSourceSummary.totalFiles === sources.totalFiles &&
      proofSourceSummary.sampledFiles === sources.sampledFiles &&
      proofSourceSummary.totalSizeBytes === sources.totalSizeBytes
  );
  const evalMatchesProof = Boolean(latestEval && latestProof && latestEval.proofPath === latestProof.path);
  const recipeStatus = !latestProof ? "draft" : sourcesMatchProof && (!latestEval || evalMatchesProof) ? "ready" : "stale";
  const publicPositioning =
    "Source-available for personal and non-commercial use under PolyForm Noncommercial 1.0.0; commercial use requires a separate written license.";

  const stages = [
    {
      id: "source-pack",
      label: "Source Pack",
      status: sources.totalFiles ? (sourcesMatchProof ? "ready" : "stale") : "blocked",
      action: "Snapshot source files with SHA-256 hashes.",
      artifact: proofPath ? join(proofPath, "source-inventory.json") : ""
    },
    {
      id: "dataset-draft",
      label: "Dataset Draft",
      status: latestDataset ? (sourcesMatchProof ? "ready" : "stale") : sources.sampledFiles ? "pending" : "blocked",
      action: "Build JSONL examples from sampled files, retaining hashes, license labels, and source-boundary provenance.",
      artifact: datasetPath || (proofPath ? join(proofPath, "dataset-card.json") : "")
    },
    {
      id: "knowledge-pack",
      label: "Knowledge Pack",
      status: latestKnowledgePack ? (sourcesMatchProof ? "ready" : "stale") : latestDataset ? "pending" : "blocked",
      action: "Build local retrieval snippets from the same source scope for Model Lab chat.",
      artifact: knowledgePackPath
    },
    {
      id: "model-profile",
      label: "Model Profile",
      status: latestModelExport ? "ready" : "draft",
      action: "Export an Ollama Modelfile with a provenance-bounded system prompt.",
      artifact: latestModelExport?.modelfilePath || ""
    },
    {
      id: "training-plan",
      label: "Training Plan",
      status: sourcesMatchProof && latestEval ? "ready" : "pending",
      action: "Package LoRA/QLoRA and runner-adapter instructions from the reviewed source pack.",
      artifact: exportManifestPath
    },
    {
      id: "release-gates",
      label: "Release Gates",
      status: latestEval ? (evalMatchesProof && sourcesMatchProof ? "ready" : "stale") : "pending",
      action: "Run source, license, proof, and model availability gates before sharing.",
      artifact: evalPath
    },
    {
      id: "proof-bundle",
      label: "Proof Bundle",
      status: latestProof ? (sourcesMatchProof ? "ready" : "stale") : "pending",
      action: "Assemble model card, source inventory, receipts, and profile artifacts.",
      artifact: proofPath
    }
  ];
  const runnerPlans = [
    {
      id: "ollama-profile",
      label: "Ollama profile",
      status: latestModelExport ? "ready" : "pending",
      output: "ollama/Modelfile",
      command: `ollama create ${targetModel} -f .\\ollama\\Modelfile`,
      purpose: "Create a local instruction-following target from the provenance-bounded Modelfile."
    },
    {
      id: "lora-qlora-plan",
      label: "LoRA/QLoRA plan",
      status: latestDataset && sourcesMatchProof && latestEval ? "ready" : "pending",
      output: "training/dataset.jsonl",
      command: "Use the reviewed dataset summary as the adapter recipe input.",
      purpose: "Export source-grounded JSONL examples plus adapter intent before training."
    },
    {
      id: "external-runner",
      label: "External runner adapter",
      status: "planned",
      output: "runner/adapter-contract.json",
      command: "Map the export package into a fine-tuning runner without widening the evidence boundary.",
      purpose: "Keep future trainers honest about source hashes, license status, and proof freshness."
    }
  ];
  const trainingPlan = {
    schema: "modelforge.training_plan.v1",
    createdAt,
    intent: "Turn the reviewed local source pack into reproducible model-build recipes, starting with Ollama profiles and extending to adapter fine-tuning.",
    sourceBoundary: sourceRoot,
    license: publicPositioning,
    dataset: {
      rowEstimate: dataset.rows,
      tokenEstimate: dataset.tokens,
      reviewedFiles: sources.reviewedFiles,
      sampledFiles: sources.sampledFiles,
      sourceScope: latestDataset?.sourceScope || null,
      forgedExamples: latestDataset?.summary?.totalExamples || 0,
      forgedTokens: latestDataset?.summary?.estimatedTokens || 0,
      forgedPath: datasetPath,
      knowledgePack: latestKnowledgePack
        ? {
            packId: latestKnowledgePack.packId,
            snippets: latestKnowledgePack.summary.totalSnippets,
            estimatedTokens: latestKnowledgePack.summary.estimatedTokens,
            jsonl: knowledgePackPath
          }
        : null
    },
    runnerPlans,
    gates: latestEval?.gates?.map((gate) => ({ id: gate.id, status: gate.status, value: gate.value })) || []
  };

  const recipe = {
    schema: "modelforge.forge_recipe.v1",
    recipeId,
    status: recipeStatus,
    version: {
      number: existingVersionCount + 1,
      path: versionDir
    },
    createdAt,
    sourceRoot,
    dataRoot,
    baseModel,
    targetModel,
    dataset: {
      sourceFiles: sources.totalFiles,
      sampledFiles: sources.sampledFiles,
      sourceScope: latestDataset?.sourceScope || null,
      rows: dataset.rows,
      tokens: dataset.tokens,
      estimatedSize: dataset.estimatedSize,
      knowledgeSnippets: latestKnowledgePack?.summary?.totalSnippets || 0,
      knowledgeTokens: latestKnowledgePack?.summary?.estimatedTokens || 0,
      reviewedFiles: sources.reviewedFiles,
      unreviewedFiles: sources.unreviewedFiles,
      licenseReviewedPercent: dataset.reviewedPercent
    },
    tools: toolStatus,
    stages,
    modelPlan: trainingPlan,
    gates: latestEval?.gates || [],
    freshness: {
      currentSourceFiles: sources.totalFiles,
      proofSourceFiles: proofSourceSummary?.totalFiles || 0,
      currentSampledFiles: sources.sampledFiles,
      proofSampledFiles: proofSourceSummary?.sampledFiles || 0,
      sourcesMatchProof,
      evalMatchesProof,
      proofBuiltAt: latestProof?.builtAt || "",
      evalCreatedAt: latestEval?.createdAt || ""
    },
    evidence: {
      proofPath,
      evalPath,
      sharePath,
      datasetPath,
      knowledgePackPath,
      modelProfilePath: latestModelExport?.profilePath || "",
      modelfilePath: latestModelExport?.modelfilePath || ""
    },
    files: {
      json: jsonPath,
      markdown: markdownPath,
      versionJson: versionJsonPath,
      versionMarkdown: versionMarkdownPath,
      exportDir,
      exportManifest: exportManifestPath,
      exportReadme: exportReadmePath
    }
  };

  const gateLines = recipe.gates.length
    ? recipe.gates.map((gate) => `- ${gate.label}: ${gate.status} (${gate.value})`).join("\n")
    : "- No eval gates have been run yet.";
  const stageLines = stages
    .map((stage) => `- ${stage.label}: ${stage.status}. ${stage.action}${stage.artifact ? ` Artifact: ${stage.artifact}` : ""}`)
    .join("\n");
  const markdown = [
    "# Forge Recipe",
    "",
    `Recipe ID: ${recipeId}`,
    `Status: ${recipeStatus}`,
    `Version: ${recipe.version.number}`,
    `Created: ${createdAt}`,
    `Source root: ${sourceRoot}`,
    "",
    "## Target",
    "",
    `- Base model: ${baseModel || "not selected"}`,
    `- Target model: ${targetModel}`,
    "",
    "## Dataset",
    "",
    `- Source files: ${sources.totalFiles}`,
    `- Sampled files: ${sources.sampledFiles}`,
    `- Estimated rows: ${dataset.rows}`,
    `- Estimated tokens: ${dataset.tokens}`,
    `- Forged examples: ${latestDataset?.summary?.totalExamples || 0}`,
    `- Source scope: ${latestDataset?.sourceScope?.label || "not scoped"}`,
    `- Scoped files: ${latestDataset?.sourceScope?.includedFiles || 0}`,
    `- Excluded files: ${latestDataset?.sourceScope?.excludedFiles || 0}`,
    `- Forged JSONL: ${datasetPath || "not built"}`,
    `- Knowledge pack: ${knowledgePackPath || "not built"}`,
    `- Retrieval snippets: ${latestKnowledgePack?.summary?.totalSnippets || 0}`,
    `- Estimated size: ${dataset.estimatedSize}`,
    `- License reviewed: ${dataset.reviewedPercent}%`,
    `- Proof source files: ${proofSourceSummary?.totalFiles || 0}`,
    `- Source/proof match: ${sourcesMatchProof ? "yes" : "no"}`,
    "",
    "## Stages",
    "",
    stageLines,
    "",
    "## Model-Making Plan",
    "",
    trainingPlan.intent,
    "",
    `License posture: ${publicPositioning}`,
    "",
    ...runnerPlans.flatMap((plan) => [
      `### ${plan.label}`,
      "",
      `- Status: ${plan.status}`,
      `- Output: ${plan.output}`,
      `- Command: ${plan.command}`,
      `- Purpose: ${plan.purpose}`,
      ""
    ]),
    "",
    "## Gates",
    "",
    gateLines,
    "",
    "## Evidence",
    "",
    `- Proof bundle: ${proofPath || "not built"}`,
    `- Eval report: ${evalPath || "not run"}`,
    `- Dataset pack: ${datasetPath || "not built"}`,
    `- Knowledge pack: ${knowledgePackPath || "not built"}`,
    `- Eval/proof match: ${evalMatchesProof ? "yes" : "no"}`,
    `- Modelfile: ${latestModelExport?.modelfilePath || "not exported"}`,
    `- Share card: ${sharePath || "not built"}`,
    "",
    "## Export Pack",
    "",
    `- Folder: ${exportDir}`,
    `- Manifest: ${exportManifestPath}`,
    ""
  ].join("\n");

  await writeJson(jsonPath, recipe);
  await writeFile(markdownPath, markdown, "utf-8");
  await writeJson(versionJsonPath, recipe);
  await writeFile(versionMarkdownPath, markdown, "utf-8");

  const copiedArtifacts = [];
  const copyTargets = [
    [jsonPath, join(exportDir, "forge-recipe.json"), "forge-recipe.json"],
    [markdownPath, join(exportDir, "forge-recipe.md"), "forge-recipe.md"],
    [join(projectRoot, "README.md"), join(exportDir, "project", "README.md"), "project/README.md"],
    [join(projectRoot, "LICENSE"), join(exportDir, "project", "LICENSE"), "project/LICENSE"],
    [join(projectRoot, "package.json"), join(exportDir, "project", "package.json"), "project/package.json"],
    [latestModelExport?.modelfilePath, join(exportDir, "ollama", "Modelfile"), "ollama/Modelfile"],
    [latestModelExport?.promptPath, join(exportDir, "ollama", "system-prompt.md"), "ollama/system-prompt.md"],
    [latestModelExport?.profilePath, join(exportDir, "ollama", "model-profile.json"), "ollama/model-profile.json"],
    [proofPath ? join(proofPath, "evidence-manifest.json") : "", join(exportDir, "proof", "evidence-manifest.json"), "proof/evidence-manifest.json"],
    [proofPath ? join(proofPath, "model-card.md") : "", join(exportDir, "proof", "model-card.md"), "proof/model-card.md"],
    [proofPath ? join(proofPath, "dataset-card.json") : "", join(exportDir, "proof", "dataset-card.json"), "proof/dataset-card.json"],
    [proofPath ? join(proofPath, "source-summary.md") : "", join(exportDir, "proof", "source-summary.md"), "proof/source-summary.md"],
    [evalPath, join(exportDir, "eval-report.json"), "eval-report.json"],
    [sharePath, join(exportDir, "share-card.json"), "share-card.json"],
    [latestDataset?.files?.jsonl, join(exportDir, "training", "dataset.jsonl"), "training/dataset.jsonl"],
    [latestDataset?.files?.manifest, join(exportDir, "training", "dataset-manifest.json"), "training/dataset-manifest.json"],
    [latestDataset?.files?.readme, join(exportDir, "training", "dataset-readme.md"), "training/dataset-readme.md"],
    [latestDataset?.files?.preview, join(exportDir, "training", "dataset-preview.md"), "training/dataset-preview.md"],
    [latestDataset?.files?.sourceScopeReceipt, join(exportDir, "training", "source-scope.md"), "training/source-scope.md"],
    [latestDataset?.files?.sourceScopeJson, join(exportDir, "training", "source-scope.json"), "training/source-scope.json"],
    [latestKnowledgePack?.files?.jsonl, join(exportDir, "knowledge", "knowledge-pack.jsonl"), "knowledge/knowledge-pack.jsonl"],
    [latestKnowledgePack?.files?.json, join(exportDir, "knowledge", "knowledge-pack.json"), "knowledge/knowledge-pack.json"],
    [latestKnowledgePack?.files?.manifest, join(exportDir, "knowledge", "knowledge-manifest.json"), "knowledge/knowledge-manifest.json"],
    [latestKnowledgePack?.files?.readme, join(exportDir, "knowledge", "README.md"), "knowledge/README.md"],
    [latestKnowledgePack?.files?.preview, join(exportDir, "knowledge", "knowledge-preview.md"), "knowledge/knowledge-preview.md"],
    [latestKnowledgePack?.files?.sourceScopeReceipt, join(exportDir, "knowledge", "source-scope.md"), "knowledge/source-scope.md"],
    [latestKnowledgePack?.files?.sourceScopeJson, join(exportDir, "knowledge", "source-scope.json"), "knowledge/source-scope.json"],
    ["", join(exportDir, "training", "lora-plan.json"), "training/lora-plan.json"],
    ["", join(exportDir, "runner", "adapter-contract.json"), "runner/adapter-contract.json"]
  ];
  for (const [source, target, label] of copyTargets) {
    if (label === "training/lora-plan.json") {
      await writeJson(target, trainingPlan);
      copiedArtifacts.push(label);
    } else if (label === "runner/adapter-contract.json") {
      await writeJson(target, {
        schema: "modelforge.runner_adapter_contract.v1",
        createdAt,
        recipeId,
        targetModel,
        requiredInputs: ["forge-recipe.json", "training/dataset.jsonl", "knowledge/knowledge-pack.jsonl", "training/lora-plan.json", "proof/evidence-manifest.json", "eval-report.json"],
        evidenceBoundary: recipe.evidence,
        freshness: recipe.freshness,
        license: publicPositioning,
        notes: [
          "Do not train or publish from this pack if proof freshness is stale.",
          "Do not widen the source boundary without rebuilding proof and eval artifacts.",
          "Commercial use requires a separate written license."
        ]
      });
      copiedArtifacts.push(label);
    } else if (await copyIfExists(source, target)) {
      copiedArtifacts.push(label);
    }
  }

  const packageManifest = {
    schema: "modelforge.export_package.v1",
    createdAt,
    recipeId,
    recipeStatus,
    sourceRoot,
    targetModel,
    baseModel,
    exportDir,
    license: publicPositioning,
    publicPositioning: "Source-available model forge with receipts.",
    copiedArtifacts,
    modelPlan: trainingPlan,
    datasetForge: latestDataset
      ? {
          datasetId: latestDataset.datasetId,
          examples: latestDataset.summary.totalExamples,
          estimatedTokens: latestDataset.summary.estimatedTokens,
          manifest: "training/dataset-manifest.json",
          jsonl: "training/dataset.jsonl"
        }
      : null,
    knowledgePack: latestKnowledgePack
      ? {
          packId: latestKnowledgePack.packId,
          snippets: latestKnowledgePack.summary.totalSnippets,
          estimatedTokens: latestKnowledgePack.summary.estimatedTokens,
          manifest: "knowledge/knowledge-manifest.json",
          jsonl: "knowledge/knowledge-pack.jsonl"
        }
      : null,
    runner: {
      kind: "ollama",
      createCommand: ["ollama", "create", targetModel, "-f", "ollama/Modelfile"],
      smokePrompt: "List the evidence you have before making claims about this workspace."
    },
    evidence: recipe.evidence,
    freshness: recipe.freshness
  };
  const exportReadme = [
    "# ModelForge Export Pack",
    "",
    `Recipe: ${recipeId}`,
    `Status: ${recipeStatus}`,
    `Target model: ${targetModel}`,
    `Base model: ${baseModel || "not selected"}`,
    `License: ${publicPositioning}`,
    "",
    "## Run",
    "",
    "```powershell",
    `ollama create ${targetModel} -f .\\ollama\\Modelfile`,
    "```",
    "",
    "## Included",
    "",
    copiedArtifacts.length ? copiedArtifacts.map((artifact) => `- ${artifact}`).join("\n") : "- No artifacts copied.",
    "",
    "## Model-Making Plan",
    "",
    trainingPlan.intent,
    "",
    ...runnerPlans.flatMap((plan) => [
      `- ${plan.label}: ${plan.status}; output ${plan.output}`
    ]),
    "",
    "## Dataset Forge",
    "",
    latestDataset
      ? `- Examples: ${latestDataset.summary.totalExamples}\n- Estimated tokens: ${latestDataset.summary.estimatedTokens}\n- JSONL: training/dataset.jsonl`
      : "- Dataset pack has not been built yet.",
    "",
    "## Local Knowledge Pack",
    "",
    latestKnowledgePack
      ? `- Snippets: ${latestKnowledgePack.summary.totalSnippets}\n- Estimated tokens: ${latestKnowledgePack.summary.estimatedTokens}\n- JSONL: knowledge/knowledge-pack.jsonl`
      : "- Knowledge pack has not been built yet.",
    "",
    "## Evidence",
    "",
    `- Source/proof match: ${sourcesMatchProof ? "yes" : "no"}`,
    `- Eval/proof match: ${evalMatchesProof ? "yes" : "no"}`,
    `- Proof bundle: ${proofPath || "not built"}`,
    ""
  ].join("\n");
  await writeJson(exportManifestPath, packageManifest);
  await writeFile(exportReadmePath, exportReadme, "utf-8");
  return recipe;
}

function isInlineExportArtifact(label = "") {
  return /\.(md|txt|json|jsonl|yaml|yml|toml|ps1|sh|bat|mjs|js|ts|tsx|css|html|svg)$/i.test(label);
}

async function getLatestExportPack() {
  const recipe = await getLatestForgeRecipe();
  if (!recipe?.files?.exportDir || !recipe.files.exportManifest) {
    return null;
  }
  const exportDir = resolve(recipe.files.exportDir);
  const exportsRoot = resolve(dataRoot, "exports");
  if (!isInsidePath(exportsRoot, exportDir)) {
    return null;
  }
  const manifest = await readJsonIfExists(recipe.files.exportManifest);
  if (!manifest) {
    return null;
  }
  const readme = await readTextIfExists(recipe.files.exportReadme || join(exportDir, "README.md"));
  return {
    schema: "modelforge.export_pack_summary.v1",
    recipeId: recipe.recipeId,
    recipeStatus: recipe.status,
    exportDir,
    manifestPath: recipe.files.exportManifest,
    readmePath: recipe.files.exportReadme || join(exportDir, "README.md"),
    artifactCount: Array.isArray(manifest.copiedArtifacts) ? manifest.copiedArtifacts.length : 0,
    copiedArtifacts: manifest.copiedArtifacts || [],
    manifest,
    readme,
    downloadName: `${recipe.recipeId}-model-forge-export.json`
  };
}

function libraryReceipt(label, path, kind = "artifact") {
  if (!path) return null;
  return {
    label,
    path,
    kind,
    exists: existsSync(path)
  };
}

function compactSourceEvidence(row) {
  return {
    path: row.path,
    language: row.language,
    license: row.license,
    hashShort: row.hashShort
  };
}

async function buildModelLibrary() {
  const createdAt = new Date().toISOString();
  const [
    sources,
    ollama,
    latestModelExport,
    latestRecipe,
    latestDataset,
    latestKnowledgePack,
    latestProof,
    latestEval,
    latestExportPack,
    latestRecipeRun,
    recipeRunHistory,
    recipeHistory
  ] = await Promise.all([
    walkSources(sourceRoot),
    getOllamaStatus(),
    getLatestModelExport(),
    getLatestForgeRecipe(),
    getLatestDatasetForge(),
    getLatestKnowledgePack(),
    getLatestProofBundle(),
    getLatestEvalReport(),
    getLatestExportPack(),
    getLatestRecipeRun(),
    getRecipeRunHistory(),
    getForgeRecipeHistory()
  ]);
  const installedNames = new Set((ollama.models || []).map((model) => model.name));
  const baseModel = latestModelExport?.baseModel || latestRecipe?.baseModel || ollama.selectedModel || "";
  const forgedModel = latestModelExport?.modelName || latestRecipe?.targetModel || defaultTargetModelName();
  const forgedInstalled = Boolean(forgedModel && installedNames.has(forgedModel));
  const proofSourceSummary = latestProof?.manifest?.sourceSummary || null;
  const proofFresh = Boolean(
    proofSourceSummary &&
      proofSourceSummary.totalFiles === sources.totalFiles &&
      proofSourceSummary.sampledFiles === sources.sampledFiles &&
      proofSourceSummary.totalSizeBytes === sources.totalSizeBytes
  );
  const evalFresh = Boolean(latestEval && latestProof?.path && latestEval.proofPath === latestProof.path && proofFresh);
  const sourceEvidence = (sources.rows || []).slice(0, 6).map(compactSourceEvidence);
  const globalReceipts = [
    libraryReceipt("Model profile", latestModelExport?.profilePath, "model"),
    libraryReceipt("Modelfile", latestModelExport?.modelfilePath || latestRecipe?.evidence?.modelfilePath, "model"),
    libraryReceipt("System prompt", latestModelExport?.promptPath, "model"),
    libraryReceipt("Ollama create receipt", latestModelExport?.createReceipt?.outputPath || latestRecipeRun?.receiptPath, "receipt"),
    libraryReceipt("Dataset JSONL", latestDataset?.files?.jsonl, "dataset"),
    libraryReceipt("Dataset manifest", latestDataset?.files?.manifest, "dataset"),
    libraryReceipt("Knowledge pack", latestKnowledgePack?.files?.jsonl, "knowledge"),
    libraryReceipt("Knowledge manifest", latestKnowledgePack?.files?.manifest, "knowledge"),
    libraryReceipt("Forge recipe", latestRecipe?.files?.json, "recipe"),
    libraryReceipt("Export manifest", latestExportPack?.manifestPath, "export"),
    libraryReceipt("Export README", latestExportPack?.readmePath, "export"),
    libraryReceipt("Proof bundle", latestProof?.path, "proof"),
    libraryReceipt("Eval report", latestRecipe?.evidence?.evalPath || latestEval?.proofPath, "eval")
  ].filter(Boolean);
  const items = [];

  if (forgedModel || latestRecipe || latestModelExport) {
    const created = Boolean(latestModelExport?.created || forgedInstalled || latestRecipeRun?.status === "pass");
    items.push({
      id: "forged-current",
      name: forgedModel || "modelforge-local:latest",
      kind: "forged",
      status: created ? "created" : latestModelExport ? "profile" : latestRecipe ? "recipe" : "missing",
      statusLabel: created ? "Runnable" : latestModelExport ? "Profile ready" : latestRecipe ? "Recipe ready" : "Needs build",
      modelName: forgedModel || "",
      baseModel,
      description: created
        ? "Your current local AI target is available for chat tests."
        : latestModelExport
          ? "Profile is ready; enable Ollama create when you want the local target built."
          : "Build from plan to create the local AI target.",
      canChat: Boolean(ollama.ok && (created || forgedInstalled) && forgedModel),
      canRunPack: Boolean(latestRecipe?.recipeId),
      createdAt: latestModelExport?.createReceipt?.endedAt || latestRecipeRun?.endedAt || latestModelExport?.createReceipt?.startedAt || latestRecipe?.createdAt || "",
      metrics: {
        examples: latestDataset?.summary?.totalExamples || latestRecipe?.dataset?.rows || 0,
        tokens: latestDataset?.summary?.estimatedTokens || latestRecipe?.dataset?.tokens || 0,
        knowledgeSnippets: latestKnowledgePack?.summary?.totalSnippets || latestRecipe?.dataset?.knowledgeSnippets || 0,
        sourceFiles: sources.totalFiles,
        proofFresh,
        evalFresh,
        evalSummary: latestEval?.summary || "No eval report yet."
      },
      receipts: globalReceipts,
      sources: sourceEvidence
    });
  }

  if (baseModel) {
    const baseInfo = (ollama.models || []).find((model) => model.name === baseModel);
    items.push({
      id: "base-current",
      name: baseModel,
      kind: "base",
      status: baseInfo ? "runnable" : "missing",
      statusLabel: baseInfo ? "Installed" : "Not found",
      modelName: baseModel,
      baseModel: "",
      description: baseInfo ? "The base model used for comparison and fallback." : "Configured base model is not installed in Ollama yet.",
      canChat: Boolean(ollama.ok && baseInfo),
      canRunPack: false,
      createdAt: baseInfo?.modified || "",
      metrics: {
        size: baseInfo?.size || "",
        modified: baseInfo?.modified || "",
        sourceFiles: 0
      },
      receipts: [],
      sources: []
    });
  }

  if (latestRecipe) {
    items.push({
      id: `recipe-${latestRecipe.recipeId}`,
      name: `Recipe ${latestRecipe.version?.number || 1}`,
      kind: "recipe",
      status: latestRecipe.status || "draft",
      statusLabel: latestRecipe.status === "ready" ? "Ready" : latestRecipe.status === "stale" ? "Review" : "Draft",
      modelName: latestRecipe.targetModel || forgedModel,
      baseModel: latestRecipe.baseModel || baseModel,
      description: "Reusable export pack with Modelfile, dataset, proof links, and runner commands.",
      canChat: Boolean(ollama.ok && latestRecipe.targetModel && installedNames.has(latestRecipe.targetModel)),
      canRunPack: true,
      createdAt: latestRecipe.createdAt || "",
      metrics: {
        examples: latestRecipe.dataset?.rows || 0,
        tokens: latestRecipe.dataset?.tokens || 0,
        knowledgeSnippets: latestRecipe.dataset?.knowledgeSnippets || latestKnowledgePack?.summary?.totalSnippets || 0,
        sourceFiles: latestRecipe.dataset?.sourceFiles || sources.totalFiles,
        proofFresh: Boolean(latestRecipe.freshness?.sourcesMatchProof),
        evalFresh: Boolean(latestRecipe.freshness?.evalMatchesProof)
      },
      receipts: [
        libraryReceipt("Recipe JSON", latestRecipe.files?.json, "recipe"),
        libraryReceipt("Recipe markdown", latestRecipe.files?.markdown, "recipe"),
        libraryReceipt("Export folder", latestRecipe.files?.exportDir, "export"),
        libraryReceipt("Export manifest", latestRecipe.files?.exportManifest, "export"),
        libraryReceipt("Export README", latestRecipe.files?.exportReadme, "export")
      ].filter(Boolean),
      sources: sourceEvidence.slice(0, 3)
    });
  }

  const knownNames = new Set(items.map((item) => item.modelName).filter(Boolean));
  for (const model of (ollama.models || []).filter((model) => !knownNames.has(model.name)).slice(0, 6)) {
    items.push({
      id: `ollama-${model.name.replace(/[^A-Za-z0-9_-]/g, "-")}`,
      name: model.name,
      kind: "ollama",
      status: "runnable",
      statusLabel: "Installed",
      modelName: model.name,
      baseModel: "",
      description: "Installed Ollama model available for quick local tests.",
      canChat: Boolean(ollama.ok),
      canRunPack: false,
      createdAt: model.modified || "",
      metrics: {
        size: model.size,
        modified: model.modified,
        sourceFiles: 0
      },
      receipts: [],
      sources: []
    });
  }

  const createdCount = items.filter((item) => ["created", "runnable"].includes(item.status)).length;
  const runnableCount = items.filter((item) => item.canChat).length;
  const recipeCount = new Set([latestRecipe?.recipeId, ...(recipeHistory || []).map((recipe) => recipe.recipeId)].filter(Boolean)).size;

  return {
    schema: "modelforge.model_library.v1",
    createdAt,
    summary: {
      total: items.length,
      created: createdCount,
      runnable: runnableCount,
      recipes: recipeCount,
      knowledgeSnippets: latestKnowledgePack?.summary?.totalSnippets || 0,
      chatsReady: Boolean(ollama.ok && runnableCount),
      sourceFiles: sources.totalFiles
    },
    defaultPrompt: "List the evidence you have before making claims about this workspace.",
    compare: {
      baseModel,
      forgedModel,
      canCompare: Boolean(ollama.ok && baseModel && forgedModel && baseModel !== forgedModel && (forgedInstalled || latestModelExport?.created || latestRecipeRun?.status === "pass")),
      detail: baseModel && forgedModel
        ? `Compare ${baseModel} against ${forgedModel} with the same local prompt.`
        : "Create or select a base and forged model before comparing."
    },
    receipts: globalReceipts,
    items,
    latestRun: latestRecipeRun || null,
    runHistory: recipeRunHistory || []
  };
}

async function buildExportDownloadPayload(currentPack) {
  const pack = currentPack || (await getLatestExportPack());
  if (!pack) {
    throw new Error("Build a Forge Recipe before downloading an export pack.");
  }
  const exportDir = resolve(pack.exportDir);
  const artifacts = [];
  for (const label of pack.copiedArtifacts || []) {
    const artifactPath = resolve(exportDir, label);
    if (!isInsidePath(exportDir, artifactPath)) {
      continue;
    }
    try {
      const artifactStat = await stat(artifactPath);
      if (!artifactStat.isFile()) {
        continue;
      }
      const inline = isInlineExportArtifact(label) && artifactStat.size <= 320_000;
      artifacts.push({
        path: label,
        sizeBytes: artifactStat.size,
        inline,
        content: inline ? await readFile(artifactPath, "utf-8") : ""
      });
    } catch {
      artifacts.push({
        path: label,
        sizeBytes: 0,
        inline: false,
        content: "",
        missing: true
      });
    }
  }
  return {
    schema: "modelforge.export_download.v1",
    createdAt: new Date().toISOString(),
    recipeId: pack.recipeId,
    exportDir: pack.exportDir,
    manifest: pack.manifest,
    readme: pack.readme,
    artifacts
  };
}

async function compareOllamaModels(body = {}) {
  const library = await buildModelLibrary();
  const prompt = String(body.prompt || library.defaultPrompt || "").trim().slice(0, 6000);
  const baseModel = String(body.baseModel || library.compare.baseModel || "").trim();
  const forgedModel = String(body.forgedModel || library.compare.forgedModel || "").trim();
  if (!prompt) {
    throw new Error("Comparison requires a prompt.");
  }

  async function safeChat(label, modelName) {
    const requestedModelName = String(modelName || "").trim();
    if (!requestedModelName) {
      return {
        ok: false,
        label,
        modelName: "",
        requestedModelName,
        fallbackUsed: false,
        message: { role: "assistant", content: "", createdAt: new Date().toISOString() },
        error: "No model is configured for this side."
      };
    }
    try {
      const result = await chatWithOllama({
        modelName: requestedModelName,
        messages: [{ role: "user", content: prompt }],
        maxTokens: Number(body.maxTokens || 80),
        timeoutMs: Number(body.timeoutMs || 180000)
      });
      return {
        ok: true,
        label,
        modelName: result.modelName,
        requestedModelName: result.requestedModelName || requestedModelName,
        fallbackUsed: Boolean(result.fallbackUsed),
        message: result.message,
        transcriptPath: result.transcriptPath,
        error: ""
      };
    } catch (error) {
      return {
        ok: false,
        label,
        modelName: "",
        requestedModelName,
        fallbackUsed: false,
        message: { role: "assistant", content: "", createdAt: new Date().toISOString() },
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  const base = await safeChat("Base model", baseModel);
  const forged = await safeChat("Forged AI", forgedModel);
  const transcript = {
    schema: "modelforge.chat_compare.v1",
    createdAt: new Date().toISOString(),
    prompt,
    base,
    forged,
    libraryCreatedAt: library.createdAt
  };
  const transcriptPath = join(dataRoot, "chats", "latest-compare.json");
  await writeJson(transcriptPath, transcript);
  return {
    ok: Boolean(base.ok || forged.ok),
    schema: transcript.schema,
    createdAt: transcript.createdAt,
    prompt,
    base,
    forged,
    transcriptPath
  };
}

async function chatWithOllama(body = {}) {
  const latestModelExport = await getLatestModelExport();
  const ollama = await getOllamaStatus();
  const modelName = body.modelName || (latestModelExport?.created ? latestModelExport.modelName : ollama.selectedModel);
  const userMessages = Array.isArray(body.messages)
    ? body.messages
        .filter((message) => typeof message?.content === "string" && ["system", "user", "assistant"].includes(message.role))
        .slice(-10)
        .map((message) => ({ role: message.role, content: message.content.slice(0, 6000) }))
    : [{ role: "user", content: String(body.prompt || "").slice(0, 6000) }];
  const latestUserPrompt = [...userMessages].reverse().find((message) => message.role === "user" && message.content.trim())?.content || "";
  const retrieval = await retrieveKnowledgeSnippets(latestUserPrompt, { limit: Number(body.retrievalLimit || 4) });
  const retrievalLines = retrieval.snippets.length
    ? retrieval.snippets.map((snippet, index) => [`[K${index + 1}] ${snippet.sourcePath} (${snippet.language}, ${snippet.hashShort})`, snippet.text.slice(0, 1200)].join("\n")).join("\n\n")
    : "";
  const contextMessage = {
    role: "system",
    content: [
      "You are the ModelForge local smoke-test assistant.",
      "Stay inside the evidence recorded by the local proof bundle.",
      "Recognized evidence types include source hashes, source inventory, RepoMori source packs, AgentLedger run receipts, Ollama Modelfiles, model cards, dataset cards, and eval reports.",
      "If the user asks for evidence, name one of those evidence types. Do not invent unrelated formats or claims.",
      retrieval.pack
        ? "A local knowledge pack is available. Use the snippets below when they are relevant, cite source paths, and say when the pack does not contain enough evidence."
        : "No local knowledge pack has been built yet, so keep answers limited to model/profile evidence.",
      retrievalLines ? `Local knowledge snippets:\n${retrievalLines}` : "No matching local knowledge snippets were found for this prompt."
    ].join(" ")
  };
  const messages = [contextMessage, ...userMessages];

  if (!modelName) {
    throw new Error("No Ollama model is available for chat.");
  }
  if (!userMessages.length || !userMessages.some((message) => message.role === "user" && message.content.trim())) {
    throw new Error("Chat requires a user message.");
  }
  const timeoutMs = Math.min(Math.max(Number(body.timeoutMs || 120000), 1000), 300000);
  const maxTokens = Math.min(Math.max(Number(body.maxTokens || 160), 16), 512);

  async function callOllamaChat(targetModel) {
    const response = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: targetModel,
        messages,
        stream: false,
        options: {
          temperature: 0.2,
          num_predict: maxTokens
        }
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  }

  let activeModel = modelName;
  let fallbackUsed = false;
  let chatResult = await callOllamaChat(activeModel);
  const fallbackModel = latestModelExport?.baseModel || ollama.selectedModel;
  if (!chatResult.ok && chatResult.status === 404 && fallbackModel && fallbackModel !== activeModel) {
    activeModel = fallbackModel;
    fallbackUsed = true;
    chatResult = await callOllamaChat(activeModel);
  }
  if (!chatResult.ok) {
    throw new Error(`Ollama chat failed with ${chatResult.status}: ${chatResult.text.slice(0, 300)}`);
  }
  const data = JSON.parse(chatResult.text || "{}");
  const assistantMessage = {
    role: "assistant",
    content: data?.message?.content || "",
    createdAt: new Date().toISOString()
  };
  const transcript = {
    schema: "modelforge.chat_transcript.v1",
    createdAt: new Date().toISOString(),
    modelName: activeModel,
    requestedModelName: modelName,
    fallbackUsed,
    retrieval: {
      packId: retrieval.pack?.packId || "",
      queryKeywords: retrieval.queryKeywords,
      sources: retrieval.snippets.map(({ text, ...snippet }) => snippet)
    },
    messages: [...userMessages, { ...assistantMessage, sources: retrieval.snippets.map(({ text, ...snippet }) => snippet) }]
  };
  await writeJson(join(dataRoot, "chats", "latest-chat.json"), transcript);
  return {
    ok: true,
    modelName: activeModel,
    requestedModelName: modelName,
    fallbackUsed,
    message: { ...assistantMessage, sources: retrieval.snippets.map(({ text, ...snippet }) => snippet) },
    retrieval: transcript.retrieval,
    transcriptPath: join(dataRoot, "chats", "latest-chat.json")
  };
}

async function runReceiptPipeline(label = "pipeline") {
  const runId = new Date().toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "Z");
  const runDir = join(dataRoot, "runs", runId);
  await mkdir(runDir, { recursive: true });
  const sources = await walkSources(sourceRoot);
  const sourceInventory = await writeSourceInventory(runDir, sources);
  const toolStatus = await getToolStatus();
  const [repomoriReceipt, agentledgerReceipt, modelProfile] = await Promise.all([
    runRepoMoriSnapshot(runDir, label),
    runAgentLedgerSnapshot(runDir, label),
    exportOllamaProfile(runDir, { create: false })
  ]);
  const manifest = {
    schema: "modelforge.pipeline_run.v2",
    id: runId,
    createdAt: new Date().toISOString(),
    label,
    sourceRoot,
    dataRoot,
    sourceInventory,
    toolStatus,
    receipts: [repomoriReceipt, agentledgerReceipt],
    modelProfile
  };
  await writeJson(join(runDir, "run-manifest.json"), manifest);
  await writeFile(join(dataRoot, "latest-run.txt"), runDir, "utf-8");
  return { id: runId, runDir, manifest, sources };
}

function parseOllamaList(output) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.slice(1).map((line) => {
    const parts = line.split(/\s{2,}|\t+/).filter(Boolean);
    return {
      name: parts[0] || line.split(/\s+/)[0],
      id: parts[1] || "",
      size: parts[2] || "",
      modified: parts.slice(3).join(" ") || ""
    };
  }).filter((model) => model.name && model.name !== "NAME");
}

async function readOllamaStatus() {
  const command = ollamaCommand();
  const version = await getOllamaCliStatus();
  let list = version.ok ? await runCommand(command, ["list"], { timeout: 8000 }) : { ok: false, stdout: "", stderr: "", error: version.error };
  if (version.ok && !list.ok) {
    await sleep(250);
    list = await runCommand(command, ["list"], { timeout: 8000 });
  }
  const models = list.ok ? parseOllamaList(list.stdout) : [];
  const modelsRoot = process.env.OLLAMA_MODELS || "";
  const configuredBaseModel = setupConfig.baseModel || "";
  const configuredModel = models.find((model) => model.name === configuredBaseModel)?.name || "";
  const error = !version.ok ? version.error || version.stderr : !list.ok ? list.error || list.stderr || "Ollama is installed but the local server is not responding." : "";
  return {
    ok: version.ok && list.ok,
    version: version.stdout.trim() || version.stderr.trim() || "Unavailable",
    modelsRoot,
    models,
    selectedModel: configuredModel || models.find((model) => model.name.includes("llama3.2"))?.name || models[0]?.name || "",
    error
  };
}

async function getOllamaStatus({ force = false } = {}) {
  const now = Date.now();
  if (!force && ollamaStatusCache.value && ollamaStatusCache.expiresAt > now) {
    return ollamaStatusCache.value;
  }
  if (!force && ollamaStatusCache.promise) {
    return ollamaStatusCache.promise;
  }
  ollamaStatusCache.promise = (async () => {
    const status = await readOllamaStatus();
    ollamaStatusCache.value = status;
    ollamaStatusCache.expiresAt = Date.now() + 1500;
    ollamaStatusCache.promise = null;
    return status;
  })();
  return ollamaStatusCache.promise;
}

async function getProjectPayload() {
  const sources = await walkSources(sourceRoot);
  const [toolStatus, latestModelExport, latestProof, latestEval, latestShare, latestDataset, latestKnowledgePack, latestRecipe, latestRecipeRun, recipeRunHistory, recipeHistory, latestBuildPlan, latestBuilderRun, builderRunHistory] = await Promise.all([
    getToolStatus(),
    getLatestModelExport(),
    getLatestProofBundle(),
    getLatestEvalReport(),
    getLatestShareCard(),
    getLatestDatasetForge(),
    getLatestKnowledgePack(),
    getLatestForgeRecipe(),
    getLatestRecipeRun(),
    getRecipeRunHistory(),
    getForgeRecipeHistory(),
    getLatestBuilderPlan(),
    getLatestBuilderRun(),
    getBuilderRunHistory()
  ]);
  const dataset = estimateDatasetMetrics(sources);
  const modelMetric = latestModelExport ? "Exported" : toolStatus.ollama.ok ? "Profile ready" : "Ollama missing";
  const evalGates = latestEval?.gates || [];
  const evalPassCount = evalGates.filter((gate) => ["pass", "passed"].includes(String(gate.status).toLowerCase())).length;
  const evalWarnCount = evalGates.filter((gate) => ["warn", "warning"].includes(String(gate.status).toLowerCase())).length;
  const evalFailCount = evalGates.filter((gate) => ["fail", "failed"].includes(String(gate.status).toLowerCase())).length;
  const proofSourceSummary = latestProof?.manifest?.sourceSummary || null;
  const proofFresh = Boolean(
    latestProof &&
      proofSourceSummary &&
      proofSourceSummary.totalFiles === sources.totalFiles &&
      proofSourceSummary.sampledFiles === sources.sampledFiles &&
      proofSourceSummary.totalSizeBytes === sources.totalSizeBytes
  );
  return {
    name: setupConfig.projectName || "Repo-Aware Local Model",
    status: "Active",
    sourceRoot,
    dataRoot,
    toolStatus,
    latestModelExport,
    latestProof,
    latestEval,
    latestShare,
    latestDataset,
    latestKnowledgePack,
    latestRecipe,
    latestRecipeRun,
    recipeRunHistory,
    recipeHistory,
    latestBuildPlan,
    latestBuilderRun,
    builderRunHistory,
    pipeline: [
      {
        id: "source-pack",
        index: 1,
        title: "Source Pack",
        description: "Connect repo or folder and collect files",
        status: toolStatus.repomori.ok ? "complete" : "warning",
        metric: `${sources.totalFiles.toLocaleString()} files`,
        detail: toolStatus.repomori.ok ? sources.totalSize : "RepoMori skipped"
      },
      {
        id: "dataset-draft",
        index: 2,
        title: "Dataset Forge",
        description: "Build JSONL examples with source provenance",
        status: latestDataset ? "complete" : sources.totalFiles > 0 ? "ready" : "ready",
        metric: latestDataset ? `${latestDataset.summary.totalExamples.toLocaleString()} examples` : `${dataset.rows.toLocaleString()} est.`,
        detail: latestDataset ? `${latestDataset.summary.estimatedTokens.toLocaleString()} tokens` : "Build JSONL"
      },
      {
        id: "ollama-profile",
        index: 3,
        title: "Ollama Profile",
        description: "Model, system prompt, params, template",
        status: toolStatus.ollama.ok ? "complete" : "failed",
        metric: modelMetric,
        detail: "ctx: 8k temp: 0.2"
      },
      {
        id: "eval-gates",
        index: 4,
        title: "Eval Gates",
        description: "Quality, safety, license, regression",
        status: evalFailCount ? "failed" : !latestEval ? "ready" : evalWarnCount ? "warning" : "complete",
        metric: latestEval ? `${evalPassCount}/${evalGates.length} passed` : "Waiting",
        detail: latestEval ? `${evalWarnCount} warnings, ${evalFailCount} failing` : "Run gates"
      },
      {
        id: "proof-bundle",
        index: 5,
        title: "Proof Bundle",
        description: "Assemble evidence bundle for distribution",
        status: latestProof ? (proofFresh ? "complete" : "warning") : "ready",
        metric: latestProof ? (proofFresh ? "Fresh" : "Stale") : "Ready",
        detail: latestProof ? (proofFresh ? "Evidence current" : "Rebuild proof") : "Build on demand"
      }
    ],
    sources
  };
}

async function buildProofBundle(body = {}) {
  const timestamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "Z");
  const proofDir = join(dataRoot, "proofs", timestamp);
  await mkdir(proofDir, { recursive: true });
  const project = await getProjectPayload();
  const ollama = await getOllamaStatus();
  const sourceInventory = await writeSourceInventory(proofDir, project.sources);
  const toolStatus = await getToolStatus();
  const [repomoriReceipt, agentledgerReceipt, modelProfile] = await Promise.all([
    runRepoMoriSnapshot(proofDir, "proof bundle"),
    runAgentLedgerSnapshot(proofDir, "proof bundle"),
    exportOllamaProfile(proofDir, { create: false })
  ]);
  const manifest = {
    schema: "modelforge.proof_manifest.v1",
    createdAt: new Date().toISOString(),
    project: project.name,
    sourceRoot: project.sourceRoot,
    dataRoot,
    requestedBy: body.requestedBy || "local-user",
    toolStatus,
    sourceSummary: {
      totalFiles: project.sources.totalFiles,
      sampledFiles: project.sources.sampledFiles,
      totalSizeBytes: project.sources.totalSizeBytes,
      reviewedFiles: project.sources.reviewedFiles,
      unreviewedFiles: project.sources.unreviewedFiles
    },
    ollama: {
      ok: ollama.ok,
      version: ollama.version,
      modelsRoot: ollama.modelsRoot,
      selectedModel: ollama.selectedModel,
      modelCount: ollama.models.length
    },
    sourceInventory,
    receipts: [repomoriReceipt, agentledgerReceipt],
    modelProfile,
    artifacts: [
      "model-card.md",
      "dataset-card.json",
      "evidence-manifest.json",
      "source-inventory.json",
      "source-summary.md",
      "ollama-profile/Modelfile",
      "ollama-profile/model-profile.json"
    ]
  };

  const modelCard = [
    "# Repo-Aware Local Model",
    "",
    "Generated by ModelForge.",
    "",
    "## Base Model",
    "",
    ollama.selectedModel || "Not selected",
    "",
    "## Source Boundary",
    "",
    `Source root: ${project.sourceRoot}`,
    `Files indexed: ${project.sources.totalFiles}`,
    `Sampled rows: ${project.sources.sampledFiles}`,
    "",
    "## Current Safety Position",
    "",
    "- Local-first proof bundle created.",
    "- Source hashes recorded for sampled files.",
    "- License review status is preliminary.",
    `- AgentLedger status: ${agentledgerReceipt.status}.`,
    `- RepoMori status: ${repomoriReceipt.status}.`,
    `- Ollama profile: ${modelProfile.modelName}.`,
    ""
  ].join("\n");

  await writeFile(join(proofDir, "model-card.md"), modelCard, "utf-8");
  await writeFile(join(proofDir, "dataset-card.json"), JSON.stringify(project.sources, null, 2) + "\n", "utf-8");
  await writeFile(join(proofDir, "evidence-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  await writeFile(join(dataRoot, "latest-proof.txt"), proofDir, "utf-8");
  const sourceSummaryText = await readFile(sourceInventory.summaryPath, "utf-8");

  return {
    status: "ready",
    path: proofDir,
    builtAt: manifest.createdAt,
    size: "local",
    manifest,
    modelCard,
    sourceSummary: sourceSummaryText
  };
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    return {};
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendJsonDownload(response, filename, payload) {
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-disposition": `attachment; filename="${filename.replace(/[^a-z0-9._-]/gi, "-")}"`,
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendTextDownload(response, filename, text, contentType = "text/plain; charset=utf-8") {
  response.writeHead(200, {
    "content-type": contentType,
    "content-disposition": `attachment; filename="${filename.replace(/[^a-z0-9._-]/gi, "-")}"`,
    "cache-control": "no-store"
  });
  response.end(text);
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  response.end(text);
}

async function serveStatic(request, response, pathname) {
  const distRoot = join(projectRoot, "dist");
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(join(distRoot, requestedPath));
  if (!filePath.startsWith(distRoot)) {
    sendText(response, 403, "Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    response.writeHead(200, {
      "content-type": mimeTypes.get(extname(filePath)) || "application/octet-stream"
    });
    response.end(data);
  } catch {
    try {
      const data = await readFile(join(distRoot, "index.html"));
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(data);
    } catch {
      sendText(response, 404, "Build not found. Run npm.cmd run build first.");
    }
  }
}

async function handleApi(request, response, url) {
  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        app: "ModelForge",
        projectRoot,
        dataRoot,
        sourceRoot,
        pythonCommand,
        ollamaModels: process.env.OLLAMA_MODELS || "",
        node: process.version
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/diagnostics") {
      sendJson(response, 200, { ok: true, diagnostics: await buildDiagnosticsReport() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/diagnostics/download") {
      const diagnostics = await buildDiagnosticsReport();
      sendJsonDownload(response, diagnostics.files?.downloadName || "model-forge-diagnostics.json", diagnostics);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/tools/status") {
      sendJson(response, 200, await getToolStatus());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/setup") {
      sendJson(response, 200, await getSetupState());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/projects") {
      sendJson(response, 200, { ok: true, registry: await getProjectRegistry() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/projects") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await createProject(body));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/projects/select") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await selectProject(body.projectId));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/projects/archive") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await archiveProject(body.projectId));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/projects/delete") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await deleteProject(body.projectId));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/projects/reset-data") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await resetProjectData(body));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/setup/config") {
      const body = await readJsonBody(request);
      sendJson(response, 200, { ok: true, setup: await saveSetupConfig(body), project: await getProjectPayload() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/setup/run") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await runFirstSetup(body));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/setup/doctor/action") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await runSetupDoctorAction(body));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/setup/doctor/simulate") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await simulateSetupDoctor(body));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/ollama/status") {
      sendJson(response, 200, await getOllamaStatus());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/hardware/profile") {
      sendJson(response, 200, await getHardwareProfile());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/sources") {
      sendJson(response, 200, await walkSources(sourceRoot));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/project") {
      sendJson(response, 200, await getProjectPayload());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/models/library") {
      sendJson(response, 200, { ok: true, library: await buildModelLibrary() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/builder/plan") {
      sendJson(response, 200, { ok: true, plan: await getLatestBuilderPlan() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/builder/plan") {
      const body = await readJsonBody(request);
      const plan = await buildAiBuildPlan(body);
      sendJson(response, 200, { ok: true, plan, project: await getProjectPayload() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/builder/run") {
      sendJson(response, 200, { ok: true, run: await getBuilderRun(url.searchParams.get("runId") || "") });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/builder/runs") {
      sendJson(response, 200, { ok: true, runs: await getBuilderRunHistory() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/builder/run") {
      const body = await readJsonBody(request);
      const run = await startBuilderRun(body);
      sendJson(response, 202, { ok: true, run });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/builder/run/cancel") {
      const body = await readJsonBody(request);
      sendJson(response, 200, { ok: true, run: await cancelBuilderRun(body.runId) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/dataset/latest") {
      sendJson(response, 200, { ok: true, dataset: await getLatestDatasetForge() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/dataset/build") {
      const body = await readJsonBody(request);
      const dataset = await buildDatasetForge(body);
      sendJson(response, 200, { ok: true, dataset, project: await getProjectPayload() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/dataset/download") {
      const dataset = await getLatestDatasetForge();
      if (!dataset?.files?.jsonl || !existsSync(dataset.files.jsonl)) {
        sendJson(response, 404, { ok: false, error: "Build a Dataset Forge pack before downloading JSONL." });
        return;
      }
      sendTextDownload(response, `${dataset.datasetId}-dataset.jsonl`, await readFile(dataset.files.jsonl, "utf-8"), "application/x-ndjson; charset=utf-8");
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/proof/latest") {
      sendJson(response, 200, { ok: true, bundle: await getLatestProofBundle() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/recipe/latest") {
      sendJson(response, 200, { ok: true, recipe: await getLatestForgeRecipe() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/recipes/history") {
      sendJson(response, 200, { ok: true, recipes: await getForgeRecipeHistory() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/recipe/runs") {
      sendJson(response, 200, { ok: true, runs: await getRecipeRunHistory() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/export/latest") {
      sendJson(response, 200, { ok: true, pack: await getLatestExportPack() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/export/download") {
      const pack = await getLatestExportPack();
      if (!pack) {
        sendJson(response, 404, { ok: false, error: "Build a Forge Recipe before downloading an export pack." });
        return;
      }
      const payload = await buildExportDownloadPayload(pack);
      sendJsonDownload(response, pack?.downloadName || "model-forge-export.json", payload);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/recipe/select") {
      const body = await readJsonBody(request);
      const recipe = await selectForgeRecipe(body.recipeId);
      sendJson(response, 200, { ok: true, recipe, project: await getProjectPayload() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/recipe/run") {
      const body = await readJsonBody(request);
      const run = await startRecipePackRun(body);
      sendJson(response, 202, { ok: true, run });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/recipe/run") {
      sendJson(response, 200, { ok: true, run: await getRecipePackRun(url.searchParams.get("runId") || "") });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/recipe/run/cancel") {
      const body = await readJsonBody(request);
      sendJson(response, 200, { ok: true, run: await cancelRecipePackRun(body.runId) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/pipeline/run") {
      const body = await readJsonBody(request);
      const run = await runReceiptPipeline(body.action || "run-pipeline");
      sendJson(response, 200, { ok: true, runPath: run.runDir, run: run.manifest, project: await getProjectPayload() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/model/export") {
      const body = await readJsonBody(request);
      const modelExport = await exportOllamaProfile(join(dataRoot, "models", "latest"), {
        baseModel: body.baseModel,
        modelName: body.modelName,
        create: body.create === true
      });
      sendJson(response, 200, { ok: true, modelExport });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/model/create") {
      const body = await readJsonBody(request);
      const modelExport = await exportOllamaProfile(join(dataRoot, "models", "latest"), {
        baseModel: body.baseModel,
        modelName: body.modelName || "modelforge-local:latest",
        create: true
      });
      sendJson(response, 200, { ok: modelExport.created, modelExport, project: await getProjectPayload() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/chat") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await chatWithOllama(body));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/chat/compare") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await compareOllamaModels(body));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/evals/latest") {
      sendJson(response, 200, { ok: true, evalReport: await getLatestEvalReport() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/evals/run") {
      sendJson(response, 200, { ok: true, evalReport: await runEvalGates(), project: await getProjectPayload() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/proof/build") {
      const body = await readJsonBody(request);
      sendJson(response, 200, { ok: true, bundle: await buildProofBundle(body) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/share/latest") {
      sendJson(response, 200, { ok: true, shareCard: await getLatestShareCard() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/share/build") {
      const body = await readJsonBody(request);
      sendJson(response, 200, { ok: true, shareCard: await buildShareCard(body), project: await getProjectPayload() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/recipe/build") {
      const body = await readJsonBody(request);
      sendJson(response, 200, { ok: true, recipe: await buildForgeRecipe(body), project: await getProjectPayload() });
      return;
    }

    sendJson(response, 404, { ok: false, error: "API route not found" });
  } catch (error) {
    sendJson(response, 500, { ok: false, error: String(error?.message || error) });
  }
}

await loadSetupConfig();
await ensureDataRoot();

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(request, response, url);
    return;
  }
  if (apiOnly) {
    sendJson(response, 404, { ok: false, error: "API server only" });
    return;
  }
  await serveStatic(request, response, url.pathname);
});

server.listen(port, host, () => {
  const mode = apiOnly ? "API" : "web";
  console.log(`ModelForge ${mode} server listening on http://${host}:${port}`);
  console.log(`Data root: ${dataRoot}`);
  console.log(`Source root: ${sourceRoot}`);
  console.log(`Setup config: ${setupConfigPath}`);
});
