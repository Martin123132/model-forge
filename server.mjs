import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";

const projectRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const setupConfigDir = join(projectRoot, ".modelforge-local");
const setupConfigPath = join(setupConfigDir, "setup.json");
const defaultDataRoot = resolve(process.env.MODEL_FORGE_DATA_ROOT || join(projectRoot, ".modelforge-data"));
const defaultSourceRoot = resolve(process.env.MODEL_FORGE_SOURCE_ROOT || projectRoot);
const bundledPython = join(projectRoot, ".venv", "Scripts", "python.exe");
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
  ".cache",
  ".pytest_cache",
  "__pycache__",
  ".venv",
  "venv"
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

async function ensureDataRoot() {
  await mkdir(join(dataRoot, "runs"), { recursive: true });
  await mkdir(join(dataRoot, "proofs"), { recursive: true });
  await mkdir(join(dataRoot, "sources"), { recursive: true });
  await mkdir(join(dataRoot, "repomori"), { recursive: true });
  await mkdir(join(dataRoot, "agentledger"), { recursive: true });
  await mkdir(join(dataRoot, "models"), { recursive: true });
  await mkdir(join(dataRoot, "evals"), { recursive: true });
  await mkdir(join(dataRoot, "share"), { recursive: true });
  await mkdir(join(dataRoot, "datasets"), { recursive: true });
  await mkdir(join(dataRoot, "datasets", "history"), { recursive: true });
  await mkdir(join(dataRoot, "recipes"), { recursive: true });
  await mkdir(join(dataRoot, "recipes", "history"), { recursive: true });
  await mkdir(join(dataRoot, "exports"), { recursive: true });
  await mkdir(join(dataRoot, "exports", "runs"), { recursive: true });
  await mkdir(join(dataRoot, "chats"), { recursive: true });
  await mkdir(join(dataRoot, "builder"), { recursive: true });
  await mkdir(join(dataRoot, "builder", "history"), { recursive: true });
  await mkdir(join(dataRoot, "builder", "runs"), { recursive: true });
}

function commandEnv(extra = {}) {
  return {
    ...process.env,
    TEMP: process.env.TEMP || join(resolve(projectRoot, ".."), ".cache", "temp"),
    TMP: process.env.TMP || join(resolve(projectRoot, ".."), ".cache", "temp"),
    PIP_CACHE_DIR: process.env.PIP_CACHE_DIR || join(resolve(projectRoot, ".."), ".cache", "pip"),
    npm_config_cache: process.env.npm_config_cache || join(resolve(projectRoot, ".."), ".cache", "npm"),
    ...extra
  };
}

function runCommand(command, args, options = {}) {
  return new Promise((resolveCommand) => {
    const env = commandEnv(options.env || {});
    execFile(command, args, { cwd: options.cwd || projectRoot, env, timeout: options.timeout || 8000, windowsHide: true }, (error, stdout, stderr) => {
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

function defaultTargetModelName() {
  return cleanSetting(setupConfig.targetModel) || "modelforge-local:latest";
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
    sourceRoot,
    dataRoot,
    ollamaModels: nextOllamaModels,
    pythonCommand,
    baseModel: cleanSetting(config.baseModel),
    targetModel: cleanSetting(config.targetModel) || "modelforge-local:latest",
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
    sourceRoot,
    dataRoot,
    ollamaModels: process.env.OLLAMA_MODELS || setupConfig.ollamaModels || "",
    pythonCommand,
    baseModel: setupConfig.baseModel || "",
    targetModel: setupConfig.targetModel || "modelforge-local:latest"
  };
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

async function getSetupState() {
  const config = currentSetupConfig();
  const [sourceCheck, dataCheck, toolStatus, ollama, latestProof, latestEval, latestRecipe] = await Promise.all([
    pathCheck(sourceRoot),
    pathCheck(dataRoot, { create: true }),
    getToolStatus(),
    getOllamaStatus(),
    getLatestProofBundle(),
    getLatestEvalReport(),
    getLatestForgeRecipe()
  ]);
  const sources = sourceCheck.ok ? await walkSources(sourceRoot) : null;
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

async function saveSetupConfig(body = {}) {
  const nextConfig = {
    sourceRoot: resolvePathSetting(body.sourceRoot, sourceRoot),
    dataRoot: resolvePathSetting(body.dataRoot, dataRoot),
    ollamaModels: cleanSetting(body.ollamaModels),
    pythonCommand: cleanSetting(body.pythonCommand) || pythonCommand,
    baseModel: cleanSetting(body.baseModel),
    targetModel: cleanSetting(body.targetModel) || defaultTargetModelName(),
    updatedAt: new Date().toISOString()
  };
  const sourceCheck = await pathCheck(nextConfig.sourceRoot);
  if (!sourceCheck.ok) {
    throw new Error(`Source folder is not readable: ${nextConfig.sourceRoot}`);
  }
  applySetupConfig(nextConfig);
  await ensureDataRoot();
  await mkdir(setupConfigDir, { recursive: true });
  await writeJson(setupConfigPath, nextConfig);
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

async function getToolStatus() {
  const [repomori, agentledger, ollama] = await Promise.all([
    runCommand(pythonCommand, ["-m", "repomori", "--help"], { timeout: 5000 }),
    runCommand(pythonCommand, ["-m", "agentledger", "--version"], { timeout: 5000 }),
    runCommand("ollama", ["--version"], { timeout: 5000 })
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
  return {
    intent: cleanSetting(body.intent).slice(0, 1200),
    audience: cleanSetting(body.audience || "personal").slice(0, 80),
    personality: cleanSetting(body.personality || "practical").slice(0, 80),
    privacy: cleanSetting(body.privacy || "local-only").slice(0, 80),
    qualitySpeed: cleanSetting(body.qualitySpeed || "balanced").slice(0, 80),
    buildMode: cleanSetting(body.buildMode || "auto").slice(0, 80),
    targetDevice: cleanSetting(body.targetDevice || "this machine").slice(0, 120),
    dataTypes: dataTypes.length ? dataTypes : ["code", "documents"]
  };
}

function chooseBaseModelRecommendation(request, hardware, ollama) {
  const intent = request.intent.toLowerCase();
  const codeHeavy = request.dataTypes.includes("code") || /\b(code|repo|developer|programming|typescript|python)\b/.test(intent);
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
  const [hardware, sources, latestModelExport, latestProof, latestEval, latestDataset, latestRecipe, ollama] = await Promise.all([
    getHardwareProfile(),
    walkSources(sourceRoot),
    getLatestModelExport(),
    getLatestProofBundle(),
    getLatestEvalReport(),
    getLatestDatasetForge(),
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
    modelProfileReady: Boolean(latestModelExport?.modelfilePath),
    recipeReady: Boolean(latestRecipe?.recipeId),
    proofFresh,
    evalFresh
  };
  const route = chooseBuilderRoute(request, hardware, artifacts);
  const baseModel = chooseBaseModelRecommendation(request, hardware, ollama);
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
      "Build a source inventory with hashes and license signals.",
      artifacts.sourceReady ? `${sources.totalFiles.toLocaleString()} files found.` : "Choose a readable source folder first.",
      "sources"
    ),
    planStep(
      "dataset-forge",
      "Build Dataset Forge pack",
      artifacts.datasetReady ? "pass" : artifacts.sourceReady ? "ready" : "blocked",
      "Create JSONL examples from local source files with hashes and provenance.",
      artifacts.datasetReady ? `${latestDataset.summary.totalExamples.toLocaleString()} examples ready.` : "This is the next practical build step.",
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
    baseModelRecommendation: baseModel,
    estimates: {
      time: estimatedTime,
      disk: estimatedDisk,
      hardwareTier: hardware.tier.label
    },
    steps,
    limitations,
    nextActions,
    files: {
      dir: latestDir,
      json: join(latestDir, "build-plan.json"),
      markdown: join(latestDir, "build-plan.md"),
      versionDir,
      versionJson: join(versionDir, "build-plan.json"),
      versionMarkdown: join(versionDir, "build-plan.md")
    }
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
    "",
    "## Intent",
    "",
    plan.intent,
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
  await writeJson(plan.files.versionJson, plan);
  await writeFile(plan.files.versionMarkdown, markdown, "utf-8");
  return plan;
}

function builderRunId() {
  return `builder-run-${new Date().toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "Z")}`;
}

function builderRunTerminalStatus(status) {
  return ["pass", "fail", "canceled"].includes(String(status || ""));
}

function builderStage(id, label, action) {
  return {
    id,
    label,
    action,
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
    builderStage("preflight", "Preflight", "Confirm the saved setup, plan, and local build roots."),
    builderStage("source-boundary", "Source Boundary", "Record the current source inventory for this build run."),
    builderStage("model-profile", "Model Profile", "Export the local Ollama profile and system prompt."),
    builderStage("proof-gates", "Proof And Gates", "Build proof, run eval gates, and prepare share evidence."),
    builderStage("dataset-forge", "Dataset Forge", "Create source-grounded JSONL examples with provenance."),
    builderStage("recipe", "Forge Recipe", "Package dataset, proof, eval, profile, and runner contracts."),
    builderStage(routeNeedsAdapter ? "adapter-pack" : "export-pack", routeNeedsAdapter ? "Adapter Pack" : "Export Pack", routeNeedsAdapter ? "Export the adapter-ready package and runner contract." : "Run the exported Ollama pack and store the receipt."),
    builderStage("finalize", "Ready Pack", "Refresh the build plan and write the final run receipt.")
  ];
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
    "## Stages",
    "",
    ...run.stages.map((stage) => `- ${stage.label}: ${stage.status}. ${stage.summary}${stage.artifact ? ` Artifact: ${stage.artifact}` : ""}`),
    "",
    "## Outputs",
    "",
    `- Build plan: ${run.outputs.buildPlanPath || ""}`,
    `- Source inventory: ${run.outputs.sourceInventoryPath || ""}`,
    `- Model profile: ${run.outputs.modelProfilePath || ""}`,
    `- Proof bundle: ${run.outputs.proofPath || ""}`,
    `- Eval report: ${run.outputs.evalPath || ""}`,
    `- Dataset: ${run.outputs.datasetPath || ""}`,
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
    stages: createBuilderRunStages(plan),
    outputs: {
      buildPlanPath: plan.files?.json || "",
      sourceInventoryPath: "",
      modelProfilePath: "",
      proofPath: "",
      evalPath: "",
      sharePath: "",
      datasetPath: "",
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

    const sources = await runBuilderStage(job, "source-boundary", async () => {
      const nextSources = await walkSources(sourceRoot);
      const inventory = await writeSourceInventory(job.run.files.dir, nextSources);
      return {
        summary: `Recorded ${nextSources.totalFiles.toLocaleString()} files and ${nextSources.sampledFiles.toLocaleString()} sampled rows.`,
        artifact: inventory.inventoryPath,
        value: nextSources
      };
    });
    job.run.outputs.sourceInventoryPath = join(job.run.files.dir, "source-inventory.json");

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
      const nextDataset = await buildDatasetForge({ requestedBy: `Builder run ${runId}` });
      return {
        summary: `${nextDataset.summary.totalExamples.toLocaleString()} examples, ${nextDataset.summary.estimatedTokens.toLocaleString()} estimated tokens.`,
        artifact: nextDataset.files.jsonl,
        value: nextDataset
      };
    });
    job.run.outputs.datasetPath = dataset.files.jsonl;

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
        summary: `${finalPlan.routeLabel}. ${sources.totalFiles.toLocaleString()} files, ${dataset.summary.totalExamples.toLocaleString()} examples, pack receipt ready.`,
        artifact: finalPlan.files.json,
        value: finalPlan
      };
    });
    job.run.outputs.finalPlanPath = activePlan.files?.json || "";
    job.run.plan = activePlan;
    await finishBuilderRun(job, {
      ok: true,
      status: "pass",
      summary: `Build complete: ${activePlan.routeLabel}. Export pack receipt is ready.`
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
  const [latestProof, latestEval] = await Promise.all([getLatestProofBundle(), getLatestEvalReport()]);
  const proofSourceSummary = latestProof?.manifest?.sourceSummary || null;
  const sourcesMatchProof = Boolean(
    latestProof &&
      proofSourceSummary &&
      proofSourceSummary.totalFiles === sources.totalFiles &&
      proofSourceSummary.sampledFiles === sources.sampledFiles &&
      proofSourceSummary.totalSizeBytes === sources.totalSizeBytes
  );
  const evalMatchesProof = Boolean(latestEval && latestProof && latestEval.proofPath === latestProof.path);
  const candidateRows = sources.rows.filter(isDatasetForgeCandidate).slice(0, maxFiles);
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
  const manifest = {
    schema: "modelforge.dataset_forge.v1",
    datasetId,
    status: examples.length ? "ready" : "empty",
    createdAt,
    sourceRoot,
    dataRoot,
    requestedBy: body.requestedBy || "ModelForge UI",
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
      sourcesMatchProof,
      evalMatchesProof,
      licenseSignals: sources.licenseSignals
    },
    splits: {
      train: Math.max(0, examples.length - Math.max(1, Math.round(examples.length * 0.1))),
      validation: examples.length ? Math.max(1, Math.round(examples.length * 0.1)) : 0
    },
    files: {
      dir: latestDir,
      manifest: join(latestDir, "dataset-manifest.json"),
      jsonl: join(latestDir, "dataset.jsonl"),
      readme: join(latestDir, "README.md"),
      preview: join(latestDir, "dataset-preview.md"),
      versionDir,
      versionManifest: join(versionDir, "dataset-manifest.json"),
      versionJsonl: join(versionDir, "dataset.jsonl"),
      versionReadme: join(versionDir, "README.md"),
      versionPreview: join(versionDir, "dataset-preview.md")
    },
    examplesPreview: preview
  };
  const previewMarkdown = [
    "# Dataset Forge Preview",
    "",
    `Dataset: ${datasetId}`,
    `Examples: ${examples.length}`,
    `Estimated tokens: ${estimatedTokens}`,
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
    `Examples: ${examples.length}`,
    `Estimated tokens: ${estimatedTokens}`,
    `License reviewed: ${licenseReviewedPercent}%`,
    "",
    "## Files",
    "",
    "- `dataset.jsonl` - chat/instruction examples with source provenance.",
    "- `dataset-manifest.json` - counts, source boundary, proof freshness, and file paths.",
    "- `dataset-preview.md` - small human-readable sample.",
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
  await writeJson(manifest.files.manifest, manifest);
  await writeFile(manifest.files.jsonl, jsonl, "utf-8");
  await writeFile(manifest.files.readme, readme, "utf-8");
  await writeFile(manifest.files.preview, previewMarkdown, "utf-8");
  await writeJson(manifest.files.versionManifest, { ...manifest, files: { ...manifest.files, dir: versionDir } });
  await writeFile(manifest.files.versionJsonl, jsonl, "utf-8");
  await writeFile(manifest.files.versionReadme, readme, "utf-8");
  await writeFile(manifest.files.versionPreview, previewMarkdown, "utf-8");
  return manifest;
}

async function getLatestDatasetForge() {
  return readJsonIfExists(join(dataRoot, "datasets", "latest", "dataset-manifest.json"));
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

async function walkSources(root, limit = 450) {
  const rows = [];
  let totalFiles = 0;
  let totalSize = 0;
  const licenseSignals = await getProjectLicenseSignals(root);

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
        if (!skippedDirs.has(entry.name)) {
          await walk(absolute);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      totalFiles += 1;
      let fileStat;
      try {
        fileStat = await stat(absolute);
      } catch {
        continue;
      }
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

async function writeSourceInventory(targetDir, sources) {
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
    licenseReview: buildLicenseReview(sources),
    rows: sources.rows
  };
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

  const result = await runCommand(command[0], command.slice(1), { timeout: 90000, cwd: sourceRoot });
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
    const result = await runCommand(command[0], command.slice(1), { timeout: 120000, cwd: modelDir });
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
    const child = spawn("ollama", ["create", prepared.targetModel, "-f", prepared.relativeModelfile], {
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
  const [toolStatus, latestProof, latestModelExport, latestEval, latestShare, latestDataset, ollama] = await Promise.all([
    getToolStatus(),
    getLatestProofBundle(),
    getLatestModelExport(),
    getLatestEvalReport(),
    getLatestShareCard(),
    getLatestDatasetForge(),
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
      forgedExamples: latestDataset?.summary?.totalExamples || 0,
      forgedTokens: latestDataset?.summary?.estimatedTokens || 0,
      forgedPath: datasetPath
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
      rows: dataset.rows,
      tokens: dataset.tokens,
      estimatedSize: dataset.estimatedSize,
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
    `- Forged JSONL: ${datasetPath || "not built"}`,
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
        requiredInputs: ["forge-recipe.json", "training/dataset.jsonl", "training/lora-plan.json", "proof/evidence-manifest.json", "eval-report.json"],
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
  const contextMessage = {
    role: "system",
    content: [
      "You are the ModelForge local smoke-test assistant.",
      "Stay inside the evidence recorded by the local proof bundle.",
      "Recognized evidence types include source hashes, source inventory, RepoMori source packs, AgentLedger run receipts, Ollama Modelfiles, model cards, dataset cards, and eval reports.",
      "If the user asks for evidence, name one of those evidence types. Do not invent unrelated formats or claims."
    ].join(" ")
  };
  const messages = userMessages[0]?.role === "system" ? userMessages : [contextMessage, ...userMessages];

  if (!modelName) {
    throw new Error("No Ollama model is available for chat.");
  }
  if (!userMessages.length || !userMessages.some((message) => message.role === "user" && message.content.trim())) {
    throw new Error("Chat requires a user message.");
  }

  async function callOllamaChat(targetModel) {
    const response = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: targetModel,
        messages,
        stream: false,
        options: {
          temperature: 0.2
        }
      }),
      signal: AbortSignal.timeout(120000)
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
    messages: [...userMessages, assistantMessage]
  };
  await writeJson(join(dataRoot, "chats", "latest-chat.json"), transcript);
  return {
    ok: true,
    modelName: activeModel,
    requestedModelName: modelName,
    fallbackUsed,
    message: assistantMessage,
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

async function getOllamaStatus() {
  const version = await runCommand("ollama", ["--version"], { timeout: 5000 });
  const list = await runCommand("ollama", ["list"], { timeout: 8000 });
  const models = list.ok ? parseOllamaList(list.stdout) : [];
  const modelsRoot = process.env.OLLAMA_MODELS || "";
  const configuredBaseModel = setupConfig.baseModel || "";
  const configuredModel = models.find((model) => model.name === configuredBaseModel)?.name || "";
  return {
    ok: version.ok,
    version: version.stdout.trim() || version.stderr.trim() || "Unavailable",
    modelsRoot,
    models,
    selectedModel: configuredModel || models.find((model) => model.name.includes("llama3.2"))?.name || models[0]?.name || "",
    error: version.ok ? "" : version.error || version.stderr
  };
}

async function getProjectPayload() {
  const sources = await walkSources(sourceRoot);
  const [toolStatus, latestModelExport, latestProof, latestEval, latestShare, latestDataset, latestRecipe, latestRecipeRun, recipeRunHistory, recipeHistory, latestBuildPlan, latestBuilderRun, builderRunHistory] = await Promise.all([
    getToolStatus(),
    getLatestModelExport(),
    getLatestProofBundle(),
    getLatestEvalReport(),
    getLatestShareCard(),
    getLatestDatasetForge(),
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
    name: "Repo-Aware Local Model",
    status: "Active",
    sourceRoot,
    dataRoot,
    toolStatus,
    latestModelExport,
    latestProof,
    latestEval,
    latestShare,
    latestDataset,
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

    if (request.method === "GET" && url.pathname === "/api/tools/status") {
      sendJson(response, 200, await getToolStatus());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/setup") {
      sendJson(response, 200, await getSetupState());
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
