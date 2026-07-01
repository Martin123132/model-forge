import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  CircleStop,
  Clock3,
  Cpu,
  Database,
  Download,
  FileText,
  Gauge,
  HardDrive,
  Hammer,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  PackageCheck,
  Play,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Wand2
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  AdapterBuilderReceipt,
  AdapterOperationJob,
  AdapterPromotionReceipt,
  AdapterTrainingReadiness,
  AdapterTrainerFixLoopReceipt,
  AdapterTrainerPreflightReceipt,
  AdapterTrainingRun,
  BuilderAiCreateReceipt,
  BuilderAppliedHardwareRecipe,
  BuilderGuidedTestReceipt,
  BuilderAiProfile,
  BuilderPlan,
  BuilderPlanRequest,
  BuilderRun,
  BuilderRunHandoff,
  DatasetForge,
  ForgeRecipe,
  HardwareProfile,
  SetupState,
  SourceScopeOption,
  SourceScopePreview,
  SourceSummary
} from "../lib/types";
import { StatusPill } from "./StatusPill";
import type { WorkspaceView } from "./WorkspaceTabs";

type BuilderWizardProps = {
  hardware?: HardwareProfile | null;
  plan?: BuilderPlan | null;
  setup?: SetupState | null;
  sources?: SourceSummary | null;
  datasetForge?: DatasetForge | null;
  recipe?: ForgeRecipe | null;
  appliedHardwareRecipe?: BuilderAppliedHardwareRecipe | null;
  guidedBuilderTest?: BuilderGuidedTestReceipt | null;
  builderAiCreateReceipt?: BuilderAiCreateReceipt | null;
  adapterBuild?: AdapterBuilderReceipt | null;
  adapterReadiness?: AdapterTrainingReadiness | null;
  adapterOperationJob?: AdapterOperationJob | null;
  adapterOperationHistory?: AdapterOperationJob[];
  adapterPreflight?: AdapterTrainerPreflightReceipt | null;
  adapterFixLoop?: AdapterTrainerFixLoopReceipt | null;
  adapterTrainingRun?: AdapterTrainingRun | null;
  adapterPromotion?: AdapterPromotionReceipt | null;
  builderRun?: BuilderRun | null;
  builderRunHistory?: BuilderRun[];
  busy: boolean;
  builderRunBusy: boolean;
  applyRecipeBusy: boolean;
  createAiBusy: boolean;
  adapterBusy: boolean;
  adapterReadinessBusy: boolean;
  adapterDepsBusy: boolean;
  adapterCacheBusy: boolean;
  adapterBaseModelBusy: boolean;
  adapterPreflightBusy: boolean;
  adapterFixLoopBusy: boolean;
  adapterTrainingBusy: boolean;
  adapterPromoteBusy: boolean;
  chatBusy: boolean;
  hardwareBusy: boolean;
  datasetBusy: boolean;
  recipeBusy: boolean;
  onBuildPlan: (request: BuilderPlanRequest) => void;
  onApplyHardwareRecipe: () => void;
  onCreateOrUpdateAi: () => void;
  onBuildAdapter: () => void;
  onCheckAdapterReadiness: () => void;
  onInstallAdapterDeps: () => void;
  onWarmAdapterBaseCache: () => void;
  onCancelAdapterOperation: (jobId: string) => void;
  onRetryAdapterOperation: (jobId: string) => void;
  onApplyRecommendedAdapterBaseModel: () => void;
  onRunAdapterPreflight: () => void;
  onRunAdapterFixLoop: () => void;
  onRunAdapterTraining: () => void;
  onCancelAdapterTraining: (runId: string) => void;
  onPromoteAdapter: () => void;
  onRunGuidedTest: (prompt: string, modelName: string) => void;
  onStartBuild: () => void;
  onCancelBuild: (runId: string) => void;
  onRefreshHardware: () => void;
  onNavigate: (view: WorkspaceView) => void;
  onBuildDataset: () => void;
  onBuildRecipe: () => void;
};

type BuilderBlueprint = NonNullable<BuilderPlan["blueprint"]>;
type BuilderHardwareRecipe = NonNullable<BuilderPlan["hardwareRecipe"]>;

const aiTypeOptions = [
  { id: "coding-helper", label: "Coding helper", detail: "Repo answers, fixes, and explanations", Icon: BrainCircuit },
  { id: "learning-tutor", label: "Tutor", detail: "Patient lessons and practice prompts", Icon: Sparkles },
  { id: "business-assistant", label: "Business assistant", detail: "Team notes, decisions, and summaries", Icon: PackageCheck },
  { id: "research-bot", label: "Research bot", detail: "Evidence gathering and comparison", Icon: FileText },
  { id: "support-bot", label: "Support bot", detail: "Approved answers from local knowledge", Icon: ShieldCheck },
  { id: "game-npc", label: "Game NPC", detail: "Lore-aware dialogue and behavior", Icon: Bot }
];

const templateOptions = [
  {
    id: "repo-copilot",
    label: "Repo copilot",
    detail: "Explain, fix, and navigate a codebase",
    Icon: BrainCircuit,
    aiName: "Forge Copilot",
    voice: "direct-operator",
    intent: "Build a local coding helper that can explain this repo, answer implementation questions, point to source files, and suggest safe next changes with evidence.",
    aiType: "coding-helper",
    audience: "personal",
    personality: "operator",
    privacy: "local-only",
    qualitySpeed: "balanced",
    buildMode: "auto",
    hardwarePreference: "auto-fit",
    targetDevice: "this machine",
    knowledgeSource: "project-source",
    sourceScope: "code-hotspots",
    boundaryMode: "source-backed",
    dataTypes: ["code", "documents", "configs"]
  },
  {
    id: "docs-tutor",
    label: "Docs tutor",
    detail: "Teach from local notes and project docs",
    Icon: Sparkles,
    aiName: "Forge Tutor",
    voice: "patient-teacher",
    intent: "Build a patient tutor that turns the project docs and notes into clear lessons, practice prompts, and source-backed explanations for non-developers.",
    aiType: "learning-tutor",
    audience: "team",
    personality: "teacher",
    privacy: "local-only",
    qualitySpeed: "quality",
    buildMode: "dataset",
    hardwarePreference: "max-quality",
    targetDevice: "this machine",
    knowledgeSource: "docs-only",
    sourceScope: "docs-first",
    boundaryMode: "strict-citations",
    dataTypes: ["documents", "research"]
  },
  {
    id: "support-agent",
    label: "Support agent",
    detail: "Approved answers from known sources",
    Icon: ShieldCheck,
    aiName: "Evidence Support",
    voice: "concise-support",
    intent: "Build a support assistant that answers common questions from approved local knowledge, refuses unsupported claims, and keeps answers concise enough for public use.",
    aiType: "support-bot",
    audience: "public",
    personality: "practical",
    privacy: "shareable",
    qualitySpeed: "balanced",
    buildMode: "portable",
    hardwarePreference: "portable",
    targetDevice: "another machine",
    knowledgeSource: "selected-files",
    sourceScope: "small-safe-sample",
    boundaryMode: "strict-citations",
    dataTypes: ["documents", "configs"]
  },
  {
    id: "research-brief",
    label: "Research brief",
    detail: "Compare evidence and keep citations tight",
    Icon: FileText,
    aiName: "Research Forge",
    voice: "evidence-analyst",
    intent: "Build a research bot that gathers evidence from local research material, compares competing claims, and clearly separates sourced facts from open questions.",
    aiType: "research-bot",
    audience: "team",
    personality: "practical",
    privacy: "local-only",
    qualitySpeed: "quality",
    buildMode: "dataset",
    hardwarePreference: "max-quality",
    targetDevice: "this machine",
    knowledgeSource: "mixed-local",
    sourceScope: "docs-first",
    boundaryMode: "strict-citations",
    dataTypes: ["documents", "research"]
  },
  {
    id: "game-lore",
    label: "Game lore NPC",
    detail: "In-character replies from lore and rules",
    Icon: Bot,
    aiName: "Lorekeeper",
    voice: "in-character",
    intent: "Build a game NPC assistant that uses local lore, rules, and character notes to answer in character while keeping world facts consistent.",
    aiType: "game-npc",
    audience: "personal",
    personality: "creative",
    privacy: "local-only",
    qualitySpeed: "balanced",
    buildMode: "dataset",
    hardwarePreference: "auto-fit",
    targetDevice: "this machine",
    knowledgeSource: "mixed-local",
    sourceScope: "small-safe-sample",
    boundaryMode: "creative-safe",
    dataTypes: ["documents", "research"]
  }
];

const purposeOptions = [
  { id: "auto", label: "Auto", detail: "Let ModelForge pick the path" },
  { id: "profile", label: "Local profile", detail: "Fastest Ollama target" },
  { id: "dataset", label: "Dataset", detail: "Source-grounded examples" },
  { id: "adapter", label: "Adapter", detail: "LoRA/QLoRA-ready path" },
  { id: "portable", label: "Portable", detail: "Export pack first" }
];

const dataTypeOptions = [
  { id: "code", label: "Code" },
  { id: "documents", label: "Docs" },
  { id: "configs", label: "Configs" },
  { id: "research", label: "Research" }
];

const privacyOptions = [
  { id: "local-only", label: "Local only" },
  { id: "shareable", label: "Shareable proof" }
];

const qualityOptions = [
  { id: "fast", label: "Fast" },
  { id: "balanced", label: "Balanced" },
  { id: "quality", label: "Quality" }
];

const hardwarePreferenceOptions = [
  { id: "auto-fit", label: "Auto fit", detail: "Let ModelForge choose safe local settings" },
  { id: "low-memory", label: "Low memory", detail: "Smaller model, lighter context" },
  { id: "max-quality", label: "Max quality", detail: "Use the biggest sensible local fit" },
  { id: "portable", label: "Portable", detail: "Favor settings that can move machines" }
];

const voiceOptions = [
  { id: "calm-practical", label: "Calm practical", detail: "Plain, steady, useful" },
  { id: "direct-operator", label: "Direct operator", detail: "Short action-first replies" },
  { id: "patient-teacher", label: "Patient teacher", detail: "Explains steps gently" },
  { id: "evidence-analyst", label: "Evidence analyst", detail: "Careful with claims" },
  { id: "concise-support", label: "Concise support", detail: "Brief public-safe answers" },
  { id: "in-character", label: "In character", detail: "Creative but bounded" }
];

const knowledgeSourceOptions = [
  { id: "project-source", label: "Project source" },
  { id: "docs-only", label: "Docs only" },
  { id: "selected-files", label: "Selected files first" },
  { id: "mixed-local", label: "Mixed local notes" }
];

const sourceScopeOptions = [
  { id: "whole-project", label: "Whole project", detail: "Use the current source boundary" },
  { id: "docs-first", label: "Docs first", detail: "Prioritize README, docs, notes" },
  { id: "code-hotspots", label: "Code hotspots", detail: "Start with implementation files" },
  { id: "small-safe-sample", label: "Small safe sample", detail: "Begin with a reviewed subset" }
];

const boundaryOptions = [
  { id: "source-backed", label: "Source-backed" },
  { id: "strict-citations", label: "Strict citations" },
  { id: "creative-safe", label: "Creative but bounded" },
  { id: "operator", label: "Direct operator" }
];

const sourceScopeOrder = sourceScopeOptions.map((option) => option.id);

function sourceExtension(path = "") {
  const match = path.toLowerCase().match(/\.[^.\\/]+$/);
  return match?.[0] || "";
}

function isDocsPreviewRow(row: SourceSummary["rows"][number]) {
  const path = row.path.toLowerCase();
  return path === "readme.md" || path.startsWith("docs/") || row.language === "Markdown" || row.language === "Text" || [".md", ".mdx", ".txt"].includes(sourceExtension(path));
}

function isCodePreviewRow(row: SourceSummary["rows"][number]) {
  const path = row.path.toLowerCase();
  const codeLanguages = ["TypeScript", "JavaScript", "Python", "PowerShell", "CSS", "HTML"];
  const configLanguages = ["JSON", "JSONL", "TOML", "YAML"];
  return path === "server.mjs" || path.startsWith("src/") || path.startsWith("scripts/") || codeLanguages.includes(row.language) || configLanguages.includes(row.language);
}

function isDatasetPreviewCandidate(row: SourceSummary["rows"][number]) {
  const extension = sourceExtension(row.path);
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".zip", ".gz", ".pdf"].includes(extension)) return false;
  if (row.sizeBytes > 420_000) return false;
  return ["TypeScript", "JavaScript", "Python", "Markdown", "JSON", "JSONL", "TOML", "YAML", "CSS", "HTML", "PowerShell", "Text", "File"].includes(row.language);
}

function sourcePreviewReason(row: SourceSummary["rows"][number], scopeId: string) {
  if (scopeId === "whole-project") return { include: true, reason: "Inside the current project boundary." };
  if (scopeId === "docs-first") {
    return isDocsPreviewRow(row)
      ? { include: true, reason: "Documentation, README, or note-style source." }
      : { include: false, reason: "Outside the docs-first starter boundary." };
  }
  if (scopeId === "code-hotspots") {
    return isCodePreviewRow(row)
      ? { include: true, reason: "Implementation, script, or code-facing config." }
      : { include: false, reason: "Outside the code-hotspots starter boundary." };
  }
  if (!isDatasetPreviewCandidate(row)) return { include: false, reason: "Not a safe text candidate for the starter sample." };
  if (row.sizeBytes > 120_000) return { include: false, reason: "Too large for the small safe starter sample." };
  const lowerPath = row.path.toLowerCase();
  const fileName = lowerPath.split("/").pop() || lowerPath;
  if (fileName.startsWith(".env") || /(^|[\/_.-])(secret|token|password|credential|private|key)([\/_.-]|$)/i.test(lowerPath)) {
    return { include: false, reason: "Path looks sensitive; review manually before inclusion." };
  }
  return { include: true, reason: "Reviewed, readable, and compact starter file." };
}

function sourcePreviewRank(row: SourceSummary["rows"][number], scopeId: string) {
  const path = row.path.toLowerCase();
  if (scopeId === "docs-first") {
    if (path === "readme.md") return 0;
    if (path.startsWith("docs/")) return 1;
    if (row.language === "Markdown") return 2;
    return 4;
  }
  if (scopeId === "code-hotspots") {
    if (path === "server.mjs") return 0;
    if (path.startsWith("src/")) return 1;
    if (path.startsWith("scripts/")) return 2;
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

function createClientSourceScopeOption(sources: SourceSummary | null | undefined, scopeId: string): SourceScopeOption {
  const option = sourceScopeOptions.find((item) => item.id === scopeId) || sourceScopeOptions[0];
  const rows = sources?.rows || [];
  const decisions = rows.map((row, index) => {
    const decision = sourcePreviewReason(row, scopeId);
    return {
      row,
      index,
      include: decision.include,
      reason: decision.reason,
      rank: sourcePreviewRank(row, scopeId)
    };
  });
  if (scopeId === "small-safe-sample") {
    const allowed = new Set(
      decisions
        .filter((decision) => decision.include)
        .sort((left, right) => left.rank - right.rank || left.index - right.index)
        .slice(0, 24)
        .map((decision) => decision.index)
    );
    for (const decision of decisions) {
      if (decision.include && !allowed.has(decision.index)) {
        decision.include = false;
        decision.reason = "Outside the first 24 reviewed starter files.";
      }
    }
  }
  const ordered = decisions.sort((left, right) => {
    if (left.include !== right.include) return left.include ? -1 : 1;
    return left.rank - right.rank || left.index - right.index;
  });
  const included = ordered.filter((decision) => decision.include);
  const excluded = ordered.filter((decision) => !decision.include);
  const mapRow = (decision: (typeof decisions)[number]) => ({
    path: decision.row.path,
    language: decision.row.language,
    size: decision.row.size,
    sizeBytes: decision.row.sizeBytes,
    license: decision.row.license,
    hashShort: decision.row.hashShort,
    reason: decision.reason
  });
  const includedSizeBytes = included.reduce((total, decision) => total + decision.row.sizeBytes, 0);
  const excludedSizeBytes = excluded.reduce((total, decision) => total + decision.row.sizeBytes, 0);
  return {
    id: option.id,
    label: option.label,
    detail: option.detail,
    totalFiles: sources?.totalFiles || 0,
    sampledFiles: sources?.sampledFiles || rows.length,
    includedFiles: included.length,
    excludedFiles: excluded.length,
    includedSizeBytes,
    includedSize: `${Math.round(includedSizeBytes / 1024).toLocaleString()} KB`,
    excludedSizeBytes,
    excludedSize: `${Math.round(excludedSizeBytes / 1024).toLocaleString()} KB`,
    datasetCandidateFiles: included.filter((decision) => isDatasetPreviewCandidate(decision.row)).length,
    includedPreview: included.slice(0, 8).map(mapRow),
    excludedPreview: excluded.slice(0, 8).map(mapRow)
  };
}

function createClientSourceScopePreview(sources: SourceSummary | null | undefined, selected: string): SourceScopePreview {
  return {
    schema: "modelforge.source_scope_preview.client.v1",
    selected,
    options: sourceScopeOrder.map((scopeId) => createClientSourceScopeOption(sources, scopeId))
  };
}

function stepStatus(status: string): "pass" | "warn" | "fail" | "neutral" {
  if (status === "pass") return "pass";
  if (status === "warn" || status === "ready") return "warn";
  if (status === "blocked" || status === "fail") return "fail";
  return "neutral";
}

function stepLabel(status: string) {
  if (status === "pass") return "Ready";
  if (status === "ready") return "Next";
  if (status === "blocked") return "Blocked";
  if (status === "warn") return "Review";
  return status || "Pending";
}

function outputStatusTone(status?: string): "pass" | "warn" | "fail" | "neutral" {
  if (status === "ready") return "pass";
  if (status === "blocked") return "fail";
  if (status === "planned") return "warn";
  return "neutral";
}

function outputStatusLabel(status?: string) {
  if (status === "ready") return "Ready";
  if (status === "blocked") return "Blocked";
  if (status === "planned") return "Planned";
  return status || "Draft";
}

function runStatusTone(status?: string): "pass" | "warn" | "fail" | "neutral" {
  if (status === "pass") return "pass";
  if (status === "fail") return "fail";
  if (status === "running") return "warn";
  return "neutral";
}

function runStatusLabel(status?: string) {
  if (status === "pass") return "Complete";
  if (status === "fail") return "Failed";
  if (status === "running") return "Running";
  if (status === "canceled") return "Canceled";
  return "Ready";
}

function buildRunProgress(run?: BuilderRun | null) {
  const stages = run?.stages || [];
  const total = stages.length;
  const complete = stages.filter((stage) => ["pass", "fail", "canceled"].includes(stage.status)).length;
  return { complete, total, percent: total ? Math.round((complete / total) * 100) : 0 };
}

function fitTone(status?: string): "pass" | "warn" | "fail" | "neutral" {
  if (status === "comfortable") return "pass";
  if (status === "possible" || status === "tight") return "warn";
  if (status === "avoid") return "fail";
  return "neutral";
}

function receiptTone(status?: string): "pass" | "warn" | "fail" | "neutral" {
  if (status === "pass" || status === "warn" || status === "fail") return status;
  return "neutral";
}

function createReceiptTone(status?: string): "pass" | "warn" | "fail" | "neutral" {
  if (status === "created" || status === "updated" || status === "ready") return "pass";
  if (status === "blocked" || status === "failed") return "fail";
  if (status === "review") return "warn";
  return "neutral";
}

function trainingRouteTone(status?: string): "pass" | "warn" | "fail" | "neutral" {
  if (status === "recommended" || status === "possible") return "pass";
  if (status === "stretch") return "warn";
  if (status === "blocked" || status === "avoid") return "fail";
  return "neutral";
}

function trainingRouteLabel(status?: string) {
  if (status === "recommended") return "Recommended";
  if (status === "possible") return "Possible";
  if (status === "stretch") return "Stretch";
  if (status === "blocked") return "Blocked";
  if (status === "avoid") return "Avoid";
  return status || "Draft";
}

function adapterReceiptTone(status?: string): "pass" | "warn" | "fail" | "neutral" {
  if (status === "trained" || status === "ready") return "pass";
  if (status === "dry-run") return "warn";
  if (status === "blocked" || status === "failed") return "fail";
  return "neutral";
}

function adapterRunTone(status?: string): "pass" | "warn" | "fail" | "neutral" {
  if (status === "pass") return "pass";
  if (status === "running") return "warn";
  if (status === "fail" || status === "canceled") return "fail";
  return "neutral";
}

function adapterReadinessTone(status?: string): "pass" | "warn" | "fail" | "neutral" {
  if (status === "ready") return "pass";
  if (status === "blocked") return "fail";
  if (status) return "warn";
  return "neutral";
}

function adapterRunLabel(run?: AdapterTrainingRun | null) {
  if (!run) return "Not run";
  if (run.status === "running") return run.mode === "train" ? "Training" : "Dry-running";
  if (run.status === "pass") return run.mode === "train" ? "Trained" : "Dry-run";
  if (run.status === "canceled") return "Canceled";
  if (run.status === "fail") return "Failed";
  return run.status || "Not run";
}

function adapterRunPercent(run?: AdapterTrainingRun | null) {
  const current = Number(run?.progress?.currentStep || 0);
  const total = Number(run?.progress?.totalSteps || 0);
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
}

function adapterOperationTone(status?: string): "pass" | "warn" | "fail" | "neutral" {
  if (status === "pass") return "pass";
  if (status === "running" || status === "queued") return "warn";
  if (status === "fail" || status === "canceled") return "fail";
  return "neutral";
}

function adapterOperationKindLabel(kind?: string) {
  if (kind === "dependency-install") return "Dependencies";
  if (kind === "base-cache-warmup") return "Base cache";
  return kind || "Operation";
}

function adapterOperationLabel(job?: AdapterOperationJob | null) {
  if (!job) return "Idle";
  if (job.status === "queued") return "Queued";
  if (job.status === "running") return job.cancelRequested ? "Canceling" : "Running";
  if (job.status === "pass") return "Passed";
  if (job.status === "fail") return "Failed";
  if (job.status === "canceled") return "Canceled";
  return job.status || "Idle";
}

function adapterOperationPercent(job?: AdapterOperationJob | null) {
  const current = Number(job?.progress?.currentStep || 0);
  const total = Number(job?.progress?.totalSteps || 0);
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
}

function adapterOperationIsActive(job?: AdapterOperationJob | null) {
  return job?.status === "queued" || job?.status === "running";
}

function adapterPreflightTone(status?: string): "pass" | "warn" | "fail" | "neutral" {
  if (status === "ready" || status === "pass") return "pass";
  if (status === "blocked" || status === "fail") return "fail";
  if (status) return "warn";
  return "neutral";
}

function adapterPreflightLabel(preflight?: AdapterTrainerPreflightReceipt | null) {
  if (!preflight) return "Not checked";
  if (preflight.guard?.willRunMode === "train") return "Real ready";
  if (preflight.status === "blocked") return "Blocked";
  if (preflight.guard?.dryRunAllowed) return "Dry-run";
  return preflight.status || "Preflight";
}

function adapterFixLoopTone(status?: string): "pass" | "warn" | "fail" | "neutral" {
  if (status === "pass") return "pass";
  if (status === "running" || status === "blocked") return "warn";
  if (status === "fail" || status === "canceled") return "fail";
  return "neutral";
}

function adapterFixLoopLabel(fixLoop?: AdapterTrainerFixLoopReceipt | null) {
  if (!fixLoop) return "Not run";
  if (fixLoop.status === "pass") return "Fixed";
  if (fixLoop.status === "running") return "Fixing";
  if (fixLoop.status === "blocked") return "Needs action";
  return fixLoop.status || "Fix loop";
}

function optionLabel(options: Array<{ id: string; label: string }>, id?: string) {
  return options.find((option) => option.id === id)?.label || options[0]?.label || "Auto";
}

function draftModelClass(hardware: HardwareProfile | null | undefined, preference: string) {
  const candidates = hardware?.modelFit?.candidates || [];
  const memoryGb = (hardware?.memory.totalBytes || 0) / 1024 / 1024 / 1024;
  const vramGb = (hardware?.gpu.totalVramMb || 0) / 1024;
  const findCandidate = (id: string) => candidates.find((candidate) => candidate.id === id);
  if (preference === "low-memory") return findCandidate("small-instruct") || { id: "small-instruct", label: "1B-3B instruct", localUse: "possible" };
  if (preference === "max-quality" && (vramGb >= 16 || memoryGb >= 48)) {
    return findCandidate("fourteen-b-quantized") || { id: "fourteen-b-quantized", label: "13B/14B quantized", localUse: "possible" };
  }
  if (vramGb >= 8 || memoryGb >= 24 || (preference === "max-quality" && (vramGb >= 6 || memoryGb >= 16))) {
    return findCandidate("seven-b-quantized") || { id: "seven-b-quantized", label: "7B/8B quantized", localUse: "possible" };
  }
  return findCandidate("small-instruct") || { id: "small-instruct", label: "1B-3B instruct", localUse: "possible" };
}

function createDraftHardwareRecipe({
  hardware,
  request,
  routeLabel
}: {
  hardware?: HardwareProfile | null;
  request: BuilderPlanRequest;
  routeLabel: string;
}): BuilderHardwareRecipe {
  const preference = optionLabel(hardwarePreferenceOptions, request.hardwarePreference);
  if (!hardware) {
    return {
      schema: "modelforge.hardware_recipe.draft.v1",
      createdAt: "",
      preference,
      fitStatus: "possible",
      summary: "Hardware check pending before local build settings can be trusted.",
      resources: {
        cpuThreads: "Checking",
        ram: "Checking",
        gpu: "Checking",
        vram: "Checking",
        diskFree: "Checking",
        ollama: "Checking"
      },
      recommended: {
        modelClass: "Pending hardware scan",
        baseModel: "best local base",
        quantization: "Pending",
        contextWindowTokens: 4096,
        gpuLayers: "Pending",
        cpuThreads: 1,
        batchSize: 128,
        runner: "Pending hardware scan",
        storageBudget: "Plan required",
        buildRoute: routeLabel
      },
      reasoning: ["Run the hardware check to estimate model class, quantization, context, and runner settings."],
      warnings: [],
      nextSteps: ["Check hardware, then create the build plan."]
    };
  }

  const modelClass = draftModelClass(hardware, request.hardwarePreference);
  const memoryGb = hardware.memory.totalBytes / 1024 / 1024 / 1024;
  const vramGb = hardware.gpu.totalVramMb / 1024;
  const quantization =
    request.hardwarePreference === "low-memory" || memoryGb < 12
      ? "Q4_K_S or Q3_K_M"
      : modelClass.id === "fourteen-b-quantized" && request.hardwarePreference === "max-quality" && vramGb >= 16
        ? "Q5_K_M"
        : "Q4_K_M";
  const contextWindowTokens =
    request.hardwarePreference === "low-memory" || memoryGb < 12 ? 2048 : vramGb >= 12 || memoryGb >= 32 ? 8192 : vramGb >= 8 || memoryGb >= 24 ? 6144 : 4096;
  const gpuLayers = !hardware.gpu.detected || !hardware.gpu.totalVramMb ? "CPU only" : vramGb >= 16 ? "All practical layers" : vramGb >= 8 ? "Most layers" : vramGb >= 6 ? "Partial layers" : "Minimal offload";
  const cpuThreads = Math.max(1, Math.min(hardware.cpu.threads || 1, Math.max(1, (hardware.cpu.threads || 1) - 2)));
  const batchSize = request.hardwarePreference === "low-memory" || memoryGb < 12 ? 128 : vramGb >= 12 || memoryGb >= 32 ? 512 : 256;
  const runner = hardware.ollama.ok ? "Ollama local runner" : "Install or start Ollama before local chat tests";
  const warnings = [
    !hardware.ollama.ok ? "Ollama is not ready, so local chat tests need setup before the generated target can run." : "",
    !hardware.gpu.detected ? "No GPU was detected; start compact and keep proof/export artifacts first." : "",
    hardware.disk.freeBytes && hardware.disk.freeBytes < 10 * 1024 * 1024 * 1024 ? "Free disk space is tight for local model pulls and export packs." : ""
  ].filter(Boolean);

  return {
    schema: "modelforge.hardware_recipe.draft.v1",
    createdAt: hardware.createdAt,
    preference,
    fitStatus: modelClass.localUse || "possible",
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
      baseModel: hardware.ollama.selectedModel || "best local base",
      quantization,
      contextWindowTokens,
      gpuLayers,
      cpuThreads,
      batchSize,
      runner,
      storageBudget: "Plan required",
      buildRoute: routeLabel
    },
    reasoning: [
      `${preference} selected from ${hardware.memory.total} RAM and ${hardware.gpu.detected ? hardware.gpu.totalVram : "no detected GPU VRAM"}.`,
      `${modelClass.label} is the safest first model class for this hardware profile.`,
      `${quantization} keeps memory pressure aligned with the selected route.`
    ],
    warnings,
    nextSteps: ["Create the build plan to save this recipe.", `Keep first tests at ${contextWindowTokens.toLocaleString()} context tokens.`, "Run Build From Plan after the recipe is saved."]
  };
}

function createDraftBlueprint({
  templateId,
  aiType,
  audience,
  personality,
  privacy,
  buildMode,
  hardwarePreference,
  targetDevice,
  knowledgeSource,
  sourceScope,
  boundaryMode,
  hardware,
  sourceCount
}: {
  templateId: string;
  aiType: string;
  audience: string;
  personality: string;
  privacy: string;
  buildMode: string;
  hardwarePreference: string;
  targetDevice: string;
  knowledgeSource: string;
  sourceScope: string;
  boundaryMode: string;
  hardware?: HardwareProfile | null;
  sourceCount: number;
}): BuilderBlueprint {
  const aiLabel = optionLabel(aiTypeOptions, aiType);
  const templateLabel = templateOptions.find((option) => option.id === templateId)?.label || "Custom build";
  const knowledgeLabel = optionLabel(knowledgeSourceOptions, knowledgeSource).toLowerCase();
  const scopeLabel = optionLabel(sourceScopeOptions, sourceScope).toLowerCase();
  const boundaryLabel = optionLabel(boundaryOptions, boundaryMode).toLowerCase();
  const hardwarePreferenceLabel = optionLabel(hardwarePreferenceOptions, hardwarePreference).toLowerCase();
  const hardwareFit = hardware?.modelFit?.summary || hardware?.tier.detail || "Hardware check pending.";
  return {
    schema: "modelforge.builder_blueprint.v1",
    title: `${aiLabel} for ${audience || "personal"} use`,
    summary: `Build a ${aiLabel.toLowerCase()} for ${targetDevice || "this machine"}.`,
    aiType: {
      id: aiType,
      label: aiLabel,
      capability: `${aiLabel} behavior with ${personality || "practical"} responses.`
    },
    userPromise: `${aiLabel} behavior with ${personality || "practical"} responses.`,
    starterTemplate: templateLabel,
    knowledge: `Use ${knowledgeLabel}${sourceCount ? ` across ${sourceCount.toLocaleString()} local files` : ""}.`,
    sourceScope: `Start with ${scopeLabel}.`,
    boundaries: `${boundaryLabel}; ${privacy === "local-only" ? "keep artifacts local" : "prepare shareable proof"}.`,
    route: buildMode === "auto" ? `ModelForge will choose the practical route with ${hardwarePreferenceLabel} settings.` : `Preferred route: ${optionLabel(purposeOptions, buildMode)} with ${hardwarePreferenceLabel} settings.`,
    hardwareFit,
    firstBuild: "Create a build plan to turn this preview into saved steps.",
    releasePosture: "Proof and release gates will be refreshed before sharing.",
    capabilities: [
      { label: "Template", detail: templateLabel },
      { label: "AI type", detail: aiLabel },
      { label: "Source scope", detail: scopeLabel },
      { label: "Boundary", detail: boundaryLabel },
      { label: "Hardware", detail: hardwareFit }
    ],
    firstRunChecklist: [
      {
        label: "Source boundary",
        status: sourceCount ? "pass" : "ready",
        detail: sourceCount ? `${sourceCount.toLocaleString()} files are ready to inspect.` : "Scan a folder before starting the build."
      },
      {
        label: "Hardware route",
        status: hardware ? "pass" : "ready",
        detail: hardwareFit
      },
      {
        label: "First dataset",
        status: sourceCount ? "ready" : "blocked",
        detail: `Begin with ${scopeLabel} and keep proof attached.`
      }
    ],
    watchouts: [
      privacy === "local-only" ? "Local-only builds should stay inside the configured data root." : "Shareable builds need a fresh proof review.",
      "ModelForge will keep the route realistic for this machine."
    ]
  };
}

function audienceDisplay(value = "") {
  if (value === "team") return "Small team";
  if (value === "public") return "Public users";
  return "Personal use";
}

function personalityDisplay(value = "") {
  if (value === "teacher") return "Patient teacher";
  if (value === "operator") return "Direct operator";
  if (value === "creative") return "Creative helper";
  return "Practical";
}

function privacyDisplay(value = "") {
  if (value === "shareable") return "Shareable with proof review";
  return "Local-only";
}

function draftBuildMethod(buildMode: string, sourceCount: number) {
  if (!sourceCount) return "Scan the source boundary before generating model artifacts.";
  if (buildMode === "adapter") return "Build a scoped dataset first, then prepare an adapter-ready recipe and runner contract.";
  if (buildMode === "portable") return "Build a scoped dataset, recipe, proof bundle, and export pack that can move to another machine.";
  if (buildMode === "profile") return "Export an Ollama Modelfile and source-bounded system prompt before heavier dataset work.";
  return "Create a scoped Dataset Forge pack, local knowledge pack, Ollama profile, proof gates, and export recipe.";
}

function createDraftAiProfile({
  aiName,
  voice,
  aiType,
  audience,
  personality,
  privacy,
  buildMode,
  targetDevice,
  knowledgeSource,
  boundaryMode,
  dataTypes,
  hardware,
  sourceScopeOption,
  planReady
}: {
  aiName: string;
  voice: string;
  aiType: string;
  audience: string;
  personality: string;
  privacy: string;
  buildMode: string;
  targetDevice: string;
  knowledgeSource: string;
  boundaryMode: string;
  dataTypes: string[];
  hardware?: HardwareProfile | null;
  sourceScopeOption: SourceScopeOption;
  planReady: boolean;
}): BuilderAiProfile {
  const aiLabel = optionLabel(aiTypeOptions, aiType);
  const activeAiName = aiName.trim() || `${aiLabel} Forge`;
  const voiceLabel = optionLabel(voiceOptions, voice);
  const sourceLabel = optionLabel(knowledgeSourceOptions, knowledgeSource).toLowerCase();
  const boundaryLabel = optionLabel(boundaryOptions, boundaryMode).toLowerCase();
  const sourceCount = sourceScopeOption.includedFiles || 0;
  const baseModel = hardware?.ollama.selectedModel || "best local base";
  const dataTypeLabel = dataTypes.length ? dataTypes.join(", ") : "selected local files";
  return {
    schema: "modelforge.builder_ai_profile.draft.v1",
    name: activeAiName,
    title: `${activeAiName} - ${aiLabel}`,
    summary: `${activeAiName} is a ${aiLabel.toLowerCase()} using ${sourceLabel} from ${sourceCount.toLocaleString()} scoped files.`,
    audience: audienceDisplay(audience),
    personality: personalityDisplay(personality),
    voice: voiceLabel,
    privacy: privacyDisplay(privacy),
    targetDevice: targetDevice || "this machine",
    baseModel,
    route: buildMode === "auto" ? "Auto route" : optionLabel(purposeOptions, buildMode),
    buildMethod: draftBuildMethod(buildMode, sourceCount),
    knowledgeBoundary: `${boundaryLabel}; ${privacy === "local-only" ? "keep all source and generated artifacts local" : "prepare proof before sharing"}.`,
    sourceScope: `${sourceScopeOption.label} with ${sourceCount.toLocaleString()} included files and ${sourceScopeOption.excludedFiles.toLocaleString()} excluded files.`,
    answerRules: [
      "Prefer source-backed answers over guesses.",
      boundaryMode === "strict-citations" ? "Show source paths for claims that depend on local knowledge." : "Separate local evidence from open questions.",
      boundaryMode === "creative-safe" ? "Creative responses must stay inside the selected lore or knowledge boundary." : "Flag requests that need files outside the selected scope.",
      privacy === "local-only" ? "Keep prompts, datasets, receipts, and model artifacts on this machine." : "Review license and proof gates before sharing any pack."
    ],
    outputs: [
      {
        label: "Source scope",
        detail: `${sourceScopeOption.label} locks the files this AI is allowed to learn from.`,
        status: sourceCount ? "ready" : "blocked",
        workspace: "sources"
      },
      {
        label: "Local AI profile",
        detail: `Ollama Modelfile and system prompt based on ${baseModel}.`,
        status: sourceCount ? "planned" : "blocked",
        workspace: "model"
      },
      {
        label: "Dataset and knowledge",
        detail: `JSONL examples plus retrieval snippets from ${dataTypeLabel}.`,
        status: sourceCount ? "planned" : "blocked",
        workspace: "model"
      },
      {
        label: "Recipe and export pack",
        detail: "Versioned rebuild instructions, runner contract, and copied artifacts.",
        status: planReady ? "planned" : "blocked",
        workspace: "model"
      },
      {
        label: "Proof and release gates",
        detail: "Source hashes, receipts, model card, license review, and freshness checks.",
        status: sourceCount ? "planned" : "blocked",
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

function formatStamp(value?: string) {
  return value ? new Date(value).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "No plan yet";
}

function compactPath(path?: string) {
  if (!path) return "Not set";
  return path.replace(/^([A-Z]:\\Users\\[^\\]+\\Documents\\)/i, "~\\Documents\\");
}

function sameStringList(left: string[] = [], right: string[] = []) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function requestMatchesPlan(saved?: BuilderPlanRequest, current?: BuilderPlanRequest) {
  if (!saved || !current) return false;
  return (
    (saved.aiName || "") === current.aiName &&
    (saved.voice || "") === current.voice &&
    saved.intent === current.intent &&
    saved.templateId === current.templateId &&
    saved.aiType === current.aiType &&
    saved.audience === current.audience &&
    saved.personality === current.personality &&
    saved.privacy === current.privacy &&
    saved.qualitySpeed === current.qualitySpeed &&
    saved.buildMode === current.buildMode &&
    (saved.hardwarePreference || "auto-fit") === current.hardwarePreference &&
    saved.targetDevice === current.targetDevice &&
    saved.knowledgeSource === current.knowledgeSource &&
    saved.sourceScope === current.sourceScope &&
    saved.boundaryMode === current.boundaryMode &&
    sameStringList(saved.dataTypes, current.dataTypes)
  );
}

function buildFallbackHandoff({
  activeRun,
  plan,
  datasetForge,
  recipe
}: {
  activeRun?: BuilderRun | null;
  plan?: BuilderPlan | null;
  datasetForge?: DatasetForge | null;
  recipe?: ForgeRecipe | null;
}): BuilderRunHandoff | null {
  if (!activeRun || activeRun.status !== "pass") return null;
  const aiLabel = activeRun.plan?.aiProfile?.name || activeRun.plan?.blueprint?.aiType?.label || plan?.aiProfile?.name || plan?.blueprint?.aiType?.label || "local AI";
  const routeLabel = activeRun.plan?.routeLabel || plan?.routeLabel || "local build route";
  const targetModel = recipe?.targetModel || "modelforge-local:latest";
  const snippets = datasetForge?.knowledgePack?.snippets || recipe?.dataset?.knowledgeSnippets || 0;
  const examples = datasetForge?.summary?.totalExamples || recipe?.dataset?.rows || 0;
  return {
    schema: "modelforge.builder_handoff.v1",
    createdAt: activeRun.endedAt || activeRun.updatedAt,
    title: `Your ${aiLabel} is built`,
    summary: `Your hardware supports ${routeLabel}, so ModelForge built ${targetModel} with source-scoped data, a local knowledge pack, proof, and a rebuildable export pack.`,
    hardwareFit: activeRun.plan?.hardware?.modelFit?.summary || plan?.hardware?.modelFit?.summary || activeRun.plan?.estimates?.hardwareTier || "",
    route: {
      label: routeLabel,
      reason: activeRun.plan?.routeReason || plan?.routeReason || "",
      hardwareTier: activeRun.plan?.estimates?.hardwareTier || plan?.estimates?.hardwareTier || "",
      baseModel: activeRun.plan?.baseModelRecommendation?.model || plan?.baseModelRecommendation?.model || ""
    },
    builtArtifacts: [
      {
        label: "AI target",
        value: targetModel,
        detail: "Created from the export pack and ready for Model Lab tests.",
        path: activeRun.outputs.exportDir,
        workspace: "model"
      },
      {
        label: "Local knowledge",
        value: `${snippets.toLocaleString()} snippets`,
        detail: "Built for source-backed chat from the selected source scope.",
        path: activeRun.outputs.knowledgePackPath || "",
        workspace: "model"
      },
      {
        label: "Dataset",
        value: `${examples.toLocaleString()} examples`,
        detail: "JSONL examples keep source paths, hashes, license labels, and provenance attached.",
        path: activeRun.outputs.datasetPath,
        workspace: "model"
      },
      {
        label: "Proof",
        value: "Gates refreshed",
        detail: "Release gates, source hashes, model cards, and receipts were rebuilt for this run.",
        path: activeRun.outputs.proofPath,
        workspace: "release"
      }
    ],
    actions: [
      { id: "test-ai", label: "Test your AI", detail: "Open Model Lab and ask the forged target a source-backed question.", workspace: "model" },
      { id: "review-proof", label: "Review proof", detail: "Open Release to check gates and evidence before sharing.", workspace: "release" }
    ],
    receipts: activeRun.outputs
  };
}

export function BuilderWizard({
  hardware,
  plan,
  setup,
  sources,
  datasetForge,
  recipe,
  appliedHardwareRecipe,
  guidedBuilderTest,
  builderAiCreateReceipt,
  adapterBuild,
  adapterReadiness,
  adapterOperationJob,
  adapterOperationHistory = [],
  adapterPreflight,
  adapterFixLoop,
  adapterTrainingRun,
  adapterPromotion,
  builderRun,
  builderRunHistory = [],
  busy,
  builderRunBusy,
  applyRecipeBusy,
  createAiBusy,
  adapterBusy,
  adapterReadinessBusy,
  adapterDepsBusy,
  adapterCacheBusy,
  adapterBaseModelBusy,
  adapterPreflightBusy,
  adapterFixLoopBusy,
  adapterTrainingBusy,
  adapterPromoteBusy,
  chatBusy,
  hardwareBusy,
  datasetBusy,
  recipeBusy,
  onBuildPlan,
  onApplyHardwareRecipe,
  onCreateOrUpdateAi,
  onBuildAdapter,
  onCheckAdapterReadiness,
  onInstallAdapterDeps,
  onWarmAdapterBaseCache,
  onCancelAdapterOperation,
  onRetryAdapterOperation,
  onApplyRecommendedAdapterBaseModel,
  onRunAdapterPreflight,
  onRunAdapterFixLoop,
  onRunAdapterTraining,
  onCancelAdapterTraining,
  onPromoteAdapter,
  onRunGuidedTest,
  onStartBuild,
  onCancelBuild,
  onRefreshHardware,
  onNavigate,
  onBuildDataset,
  onBuildRecipe
}: BuilderWizardProps) {
  const [aiName, setAiName] = useState(plan?.request.aiName || plan?.aiProfile?.name || "Forge Copilot");
  const [voice, setVoice] = useState(plan?.request.voice || "direct-operator");
  const [intent, setIntent] = useState(
    plan?.request.intent || "Build a practical local AI assistant that understands this project and can answer with source-backed evidence."
  );
  const [templateId, setTemplateId] = useState(plan?.request.templateId || "custom");
  const [aiType, setAiType] = useState(plan?.request.aiType || "coding-helper");
  const [audience, setAudience] = useState(plan?.request.audience || "personal");
  const [personality, setPersonality] = useState(plan?.request.personality || "practical");
  const [buildMode, setBuildMode] = useState(plan?.request.buildMode || "auto");
  const [privacy, setPrivacy] = useState(plan?.request.privacy || "local-only");
  const [qualitySpeed, setQualitySpeed] = useState(plan?.request.qualitySpeed || "balanced");
  const [hardwarePreference, setHardwarePreference] = useState(plan?.request.hardwarePreference || "auto-fit");
  const [targetDevice, setTargetDevice] = useState(plan?.request.targetDevice || "this machine");
  const [knowledgeSource, setKnowledgeSource] = useState(plan?.request.knowledgeSource || "project-source");
  const [sourceScope, setSourceScope] = useState(plan?.request.sourceScope || "whole-project");
  const [boundaryMode, setBoundaryMode] = useState(plan?.request.boundaryMode || "source-backed");
  const [dataTypes, setDataTypes] = useState<string[]>(plan?.request.dataTypes?.length ? plan.request.dataTypes : ["code", "documents"]);

  const readiness = useMemo(() => {
    const sourceCount = sources?.totalFiles || 0;
    return [
      {
        label: "Setup",
        value: setup?.configured ? "Saved" : "Needs confirm",
        tone: setup?.configured ? "pass" : "warn",
        Icon: ShieldCheck
      },
      {
        label: "Sources",
        value: sourceCount ? `${sourceCount.toLocaleString()} files` : "No scan",
        tone: sourceCount ? "pass" : "warn",
        Icon: FileText
      },
      {
        label: "Dataset",
        value: datasetForge ? `${datasetForge.summary.totalExamples.toLocaleString()} examples` : "Not built",
        tone: datasetForge ? "pass" : "warn",
        Icon: Database
      },
      {
        label: "Recipe",
        value: recipe ? recipe.status : "Not built",
        tone: recipe?.status === "ready" ? "pass" : recipe ? "warn" : "neutral",
        Icon: PackageCheck
      }
    ] as const;
  }, [datasetForge, recipe, setup?.configured, sources?.totalFiles]);

  const activeRun = builderRun || builderRunHistory[0] || null;
  const runProgress = buildRunProgress(activeRun);
  const fitCandidates = hardware?.modelFit?.candidates || [];
  const runIsActive = activeRun?.status === "running";
  const currentRequest = useMemo<BuilderPlanRequest>(
    () => ({
      aiName,
      voice,
      intent,
      templateId,
      aiType,
      audience,
      personality,
      privacy,
      qualitySpeed,
      buildMode,
      hardwarePreference,
      targetDevice,
      knowledgeSource,
      sourceScope,
      boundaryMode,
      dataTypes
    }),
    [aiName, aiType, audience, boundaryMode, buildMode, dataTypes, hardwarePreference, intent, knowledgeSource, personality, privacy, qualitySpeed, sourceScope, targetDevice, templateId, voice]
  );
  const planMatchesForm = requestMatchesPlan(plan?.request, currentRequest);
  const sourceScopePreview = useMemo(
    () => (planMatchesForm && plan?.sourceScopePreview ? plan.sourceScopePreview : createClientSourceScopePreview(sources, sourceScope)),
    [plan?.sourceScopePreview, planMatchesForm, sourceScope, sources]
  );
  const selectedSourceScope =
    sourceScopePreview.options.find((option) => option.id === sourceScopePreview.selected || option.id === sourceScope) ||
    sourceScopePreview.options[0] ||
    createClientSourceScopeOption(sources, sourceScope);
  const sourceCount = selectedSourceScope.includedFiles || sources?.totalFiles || 0;
  const blueprint = useMemo(
    () =>
      (planMatchesForm && plan?.blueprint) ||
      createDraftBlueprint({
        templateId,
        aiType,
        audience,
        personality,
        privacy,
        buildMode,
        hardwarePreference,
        targetDevice,
        knowledgeSource,
        sourceScope,
        boundaryMode,
        hardware,
        sourceCount
      }),
    [aiType, audience, boundaryMode, buildMode, hardware, hardwarePreference, knowledgeSource, personality, plan?.blueprint, planMatchesForm, privacy, sourceCount, sourceScope, targetDevice, templateId]
  );
  const hardwareRecipe = useMemo(
    () => (planMatchesForm && plan?.hardwareRecipe) || createDraftHardwareRecipe({ hardware, request: currentRequest, routeLabel: blueprint.route }),
    [blueprint.route, currentRequest, hardware, plan?.hardwareRecipe, planMatchesForm]
  );
  const appliedRecipeMatchesPlan = Boolean(planMatchesForm && plan?.planId && appliedHardwareRecipe?.ok && appliedHardwareRecipe.planId === plan.planId);
  const appliedReceiptPath = appliedRecipeMatchesPlan ? appliedHardwareRecipe?.files.latestJson || appliedHardwareRecipe?.files.historyJson || "" : "";
  const guidedTest = appliedRecipeMatchesPlan ? appliedHardwareRecipe?.testPrompt : null;
  const guidedReceiptMatchesPlan = Boolean(
    appliedRecipeMatchesPlan &&
      guidedBuilderTest?.planId === plan?.planId &&
      guidedBuilderTest?.appliedReceiptId === appliedHardwareRecipe?.receiptId
  );
  const guidedReceipt = guidedReceiptMatchesPlan ? guidedBuilderTest : null;
  const guidedReceiptTone =
    guidedReceipt?.status === "pass" ? "pass" : guidedReceipt?.status === "warn" ? "warn" : guidedReceipt?.status === "fail" ? "fail" : "neutral";
  const guidedReceiptPath = guidedReceipt?.files.latestJson || guidedReceipt?.files.historyJson || "";
  const createReceiptMatchesPlan = Boolean(
    appliedRecipeMatchesPlan &&
      builderAiCreateReceipt?.planId === plan?.planId &&
      builderAiCreateReceipt?.appliedReceiptId === appliedHardwareRecipe?.receiptId
  );
  const createReceipt = createReceiptMatchesPlan ? builderAiCreateReceipt : null;
  const createReceiptPath = createReceipt?.files.latestJson || createReceipt?.files.historyJson || "";
  const createReceiptStatus = createReceipt?.ok && createReceipt.readiness?.installed ? "Ready" : createReceipt ? createReceipt.readiness?.label || createReceipt.status : "Not installed";
  const createReceiptSummary = createReceipt?.summary || "Create the Ollama target from the applied hardware recipe.";
  const createActionLabel = createAiBusy ? "Creating" : createReceipt?.ok ? "Update AI" : "Create AI";
  const trainingRoutePlan = planMatchesForm ? plan?.trainingRoutePlan || null : null;
  const trainingRouteOptions = trainingRoutePlan?.routes || [];
  const selectedTrainingRoute =
    trainingRouteOptions.find((route) => route.id === trainingRoutePlan?.selectedRouteId) ||
    trainingRouteOptions[0] ||
    null;
  const adapterReceiptMatchesPlan = Boolean(planMatchesForm && plan?.planId && adapterBuild?.planId === plan.planId);
  const adapterReceipt = adapterReceiptMatchesPlan ? adapterBuild : null;
  const adapterReceiptPath = adapterReceipt?.files.receiptJson || adapterReceipt?.files.historyReceiptJson || "";
  const adapterActionLabel = adapterBusy ? "Preparing" : adapterReceipt ? "Rebuild Adapter" : "Prepare Adapter";
  const adapterReadinessMatchesReceipt = Boolean(adapterReceipt?.adapterBuildId && adapterReadiness?.adapterBuildId === adapterReceipt.adapterBuildId);
  const currentAdapterReadiness = adapterReadinessMatchesReceipt ? adapterReadiness : adapterReceipt?.runner?.readiness || null;
  const adapterOperationMatchesReceipt = Boolean(adapterReceipt?.adapterBuildId && adapterOperationJob?.adapterBuildId === adapterReceipt.adapterBuildId);
  const currentAdapterOperation = adapterOperationMatchesReceipt ? adapterOperationJob : null;
  const adapterOperationProgress = adapterOperationPercent(currentAdapterOperation);
  const adapterOperationActive = adapterOperationIsActive(currentAdapterOperation);
  const adapterOperationReceiptPath =
    currentAdapterOperation?.files.latestReceiptJson ||
    currentAdapterOperation?.files.receiptJson ||
    currentAdapterOperation?.files.latestJson ||
    "";
  const adapterOperationLog = currentAdapterOperation?.logs?.combinedTail || "";
  const adapterOperationHistoryForReceipt = adapterReceipt?.adapterBuildId
    ? adapterOperationHistory.filter((job) => job.adapterBuildId === adapterReceipt.adapterBuildId).slice(0, 4)
    : [];
  const canWarmAdapterCache = Boolean(
    adapterReceipt?.adapterBuildId &&
      (currentAdapterReadiness?.recommendedBaseModel?.modelId ||
        adapterReceipt.config?.trainer?.transformersModelId ||
        adapterReceipt.config?.trainer?.recommendedTransformersModelId ||
        adapterReceipt.adapter?.transformersModelId)
  );
  const adapterPreflightMatchesReceipt = Boolean(adapterReceipt?.adapterBuildId && adapterPreflight?.adapterBuildId === adapterReceipt.adapterBuildId);
  const currentAdapterPreflight = adapterPreflightMatchesReceipt ? adapterPreflight : null;
  const adapterPreflightReceiptPath = currentAdapterPreflight?.files?.latestJson || currentAdapterPreflight?.files?.historyJson || "";
  const adapterPreflightNextAction = currentAdapterPreflight?.suggestedActions?.find((action) => action.primary) || currentAdapterPreflight?.suggestedActions?.[0] || null;
  const adapterWillRunRealTraining = Boolean(currentAdapterPreflight?.guard?.willRunMode === "train");
  const adapterFixLoopMatchesReceipt = Boolean(adapterReceipt?.adapterBuildId && adapterFixLoop?.adapterBuildId === adapterReceipt.adapterBuildId);
  const currentAdapterFixLoop = adapterFixLoopMatchesReceipt ? adapterFixLoop : null;
  const adapterFixLoopReceiptPath = currentAdapterFixLoop?.files?.latestJson || currentAdapterFixLoop?.files?.historyJson || "";
  const adapterFixLoopActive = Boolean(currentAdapterFixLoop?.status === "running");
  const adapterFixLoopLatestAction = [...(currentAdapterFixLoop?.actions || [])].reverse()[0] || null;
  const adapterRunMatchesReceipt = Boolean(adapterReceipt?.adapterBuildId && adapterTrainingRun?.adapterBuildId === adapterReceipt.adapterBuildId);
  const currentAdapterRun = adapterRunMatchesReceipt ? adapterTrainingRun : null;
  const adapterRunProgress = adapterRunPercent(currentAdapterRun);
  const adapterCheckpoint = currentAdapterRun?.checkpoint || adapterReceipt?.runner?.checkpoint || null;
  const adapterPromoteMatchesReceipt = Boolean(adapterReceipt?.adapterBuildId && adapterPromotion?.adapterBuildId === adapterReceipt.adapterBuildId);
  const currentAdapterPromotion = adapterPromoteMatchesReceipt ? adapterPromotion : null;
  const canPromoteAdapter = Boolean(adapterCheckpoint?.trained && adapterReceipt?.adapterBuildId && currentAdapterRun?.status === "pass");
  const aiProfile = useMemo(
    () =>
      (planMatchesForm && plan?.aiProfile) ||
      createDraftAiProfile({
        aiName,
        voice,
        aiType,
        audience,
        personality,
        privacy,
        buildMode,
        targetDevice,
        knowledgeSource,
        boundaryMode,
        dataTypes,
        hardware,
        sourceScopeOption: selectedSourceScope,
        planReady: Boolean(plan && planMatchesForm)
      }),
    [aiName, aiType, audience, boundaryMode, buildMode, dataTypes, hardware, knowledgeSource, personality, plan, planMatchesForm, privacy, selectedSourceScope, targetDevice, voice]
  );
  const activeStage =
    activeRun?.stages.find((stage) => stage.status === "running") ||
    activeRun?.stages.find((stage) => stage.status === "fail" || stage.status === "canceled") ||
    [...(activeRun?.stages || [])].reverse().find((stage) => stage.status === "pass") ||
    activeRun?.stages[0] ||
    null;
  const outputRows = activeRun
    ? [
        { label: "Proof", path: activeRun.outputs.proofPath },
        { label: "Source scope", path: activeRun.outputs.sourceScopeReceiptPath },
        { label: "Dataset", path: activeRun.outputs.datasetPath },
        { label: "Recipe", path: activeRun.outputs.recipePath },
        { label: "Pack receipt", path: activeRun.outputs.packRunReceiptPath },
        { label: "Run receipt", path: activeRun.files.receipt }
      ].filter((row) => row.path)
    : [];
  const handoff = activeRun?.handoff || buildFallbackHandoff({ activeRun, plan, datasetForge, recipe });
  const pastRuns = builderRunHistory.filter((run) => run.runId !== activeRun?.runId).slice(0, 4);
  const checklistItems = blueprint.firstRunChecklist || [];

  function applyTemplate(template: (typeof templateOptions)[number]) {
    setAiName(template.aiName);
    setVoice(template.voice);
    setTemplateId(template.id);
    setIntent(template.intent);
    setAiType(template.aiType);
    setAudience(template.audience);
    setPersonality(template.personality);
    setPrivacy(template.privacy);
    setQualitySpeed(template.qualitySpeed);
    setBuildMode(template.buildMode);
    setHardwarePreference(template.hardwarePreference);
    setTargetDevice(template.targetDevice);
    setKnowledgeSource(template.knowledgeSource);
    setSourceScope(template.sourceScope);
    setBoundaryMode(template.boundaryMode);
    setDataTypes(template.dataTypes);
  }

  function toggleDataType(id: string) {
    setDataTypes((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function submitPlan() {
    onBuildPlan(currentRequest);
  }

  function goToPlanAction(workspace: string) {
    if (workspace === "setup" || workspace === "sources" || workspace === "proof" || workspace === "model" || workspace === "release") {
      onNavigate(workspace);
    }
  }

  return (
    <section className="workbench-panel builder-panel" aria-labelledby="builder-title">
      <div className="builder-hero">
        <div>
          <h1 id="builder-title">Build the AI you need</h1>
          <p>Tell ModelForge what you want in plain English. It will check the machine, choose a realistic route, and hand you the next build steps.</p>
        </div>
        <div className="builder-hero-actions">
          <button className="plain-button small" type="button" onClick={onRefreshHardware} disabled={hardwareBusy}>
            <RefreshCw className={hardwareBusy ? "spin-icon" : ""} size={15} />
            <span>{hardwareBusy ? "Checking" : "Check Hardware"}</span>
          </button>
          <button className="primary-action compact" type="button" onClick={submitPlan} disabled={busy || !intent.trim() || !aiName.trim()}>
            {busy ? <LoaderCircle className="spin-icon" size={15} /> : <Wand2 size={15} />}
            <span>{busy ? "Creating" : "Create Build Plan"}</span>
          </button>
          {runIsActive && activeRun ? (
            <button className="danger-action compact" type="button" onClick={() => onCancelBuild(activeRun.runId)}>
              <CircleStop size={15} />
              <span>Cancel Build</span>
            </button>
          ) : (
            <button className="primary-action compact" type="button" onClick={onStartBuild} disabled={!plan || !planMatchesForm || builderRunBusy}>
              {builderRunBusy ? <LoaderCircle className="spin-icon" size={15} /> : <Rocket size={15} />}
              <span>{builderRunBusy ? "Starting" : plan && !planMatchesForm ? "Plan Changed" : "Start Build"}</span>
            </button>
          )}
        </div>
      </div>

      <div className="builder-ai-profile-card builder-contract-overview">
        <div className="builder-ai-profile-heading">
          <div>
            <span>AI build contract</span>
            <h2>{aiProfile.title}</h2>
            <p>{aiProfile.summary}</p>
          </div>
          <StatusPill status={planMatchesForm ? "pass" : "neutral"} label={planMatchesForm ? "Saved" : "Draft"} />
        </div>

        <div className="ai-profile-facts">
          <div>
            <Bot size={15} />
            <span>Identity</span>
            <strong>{aiProfile.name}</strong>
            <em>{aiProfile.voice}</em>
          </div>
          <div>
            <ShieldCheck size={15} />
            <span>Boundary</span>
            <strong>{aiProfile.privacy}</strong>
            <em>{aiProfile.knowledgeBoundary}</em>
          </div>
          <div>
            <BrainCircuit size={15} />
            <span>Base</span>
            <strong>{aiProfile.baseModel}</strong>
            <em>{aiProfile.route}</em>
          </div>
          <div>
            <Database size={15} />
            <span>Scope</span>
            <strong>{selectedSourceScope.label}</strong>
            <em>{aiProfile.sourceScope}</em>
          </div>
        </div>

        <div className="ai-profile-method">
          <strong>How ModelForge will make it</strong>
          <p>{aiProfile.buildMethod}</p>
        </div>

        <div className="ai-profile-model-card">
          <FileText size={15} />
          <span>
            <strong>Starter model card</strong>
            <em title={plan?.starterModelCard?.files.markdown || ""}>
              {planMatchesForm && plan?.starterModelCard?.files.markdown ? compactPath(plan.starterModelCard.files.markdown) : "Create the build plan to save the starter model card."}
            </em>
          </span>
          <StatusPill status={planMatchesForm && plan?.starterModelCard ? "pass" : "neutral"} label={planMatchesForm && plan?.starterModelCard ? "Saved" : "Draft"} />
        </div>

        <div className="ai-profile-rules">
          <strong>Answer rules</strong>
          <div>
            {aiProfile.answerRules.map((rule) => (
              <span key={rule}>
                <ShieldCheck size={12} />
                {rule}
              </span>
            ))}
          </div>
        </div>

        <div className="ai-profile-output-list">
          {aiProfile.outputs.map((output) => (
            <button className="ai-profile-output" key={output.label} type="button" onClick={() => goToPlanAction(output.workspace)}>
              <span>
                <strong>{output.label}</strong>
                <em>{output.detail}</em>
              </span>
              <StatusPill status={outputStatusTone(output.status)} label={outputStatusLabel(output.status)} />
            </button>
          ))}
        </div>

        <div className="ai-profile-done">
          <strong>Done when</strong>
          <div>
            {aiProfile.doneWhen.map((item) => (
              <span key={item}>
                <CheckCircle2 size={12} />
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="builder-layout">
        <form className="builder-form" onSubmit={(event) => event.preventDefault()}>
          <div className="builder-field builder-field-wide">
            <span>Start with a template</span>
            <div className="builder-template-grid">
              {templateOptions.map((option) => {
                const Icon = option.Icon;
                return (
                  <button
                    aria-pressed={templateId === option.id}
                    className={templateId === option.id ? "is-selected" : ""}
                    data-template-id={option.id}
                    key={option.id}
                    type="button"
                    onClick={() => applyTemplate(option)}
                  >
                    <Icon size={16} />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.detail}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="builder-identity-card builder-field-wide">
            <label className="builder-field">
              <span>Name this AI</span>
              <input value={aiName} onChange={(event) => setAiName(event.target.value)} placeholder="Forge Copilot" />
            </label>
            <div className="builder-field">
              <span>Voice</span>
              <div className="voice-grid">
                {voiceOptions.map((option) => (
                  <button
                    aria-pressed={voice === option.id}
                    className={voice === option.id ? "is-selected" : ""}
                    key={option.id}
                    type="button"
                    onClick={() => setVoice(option.id)}
                  >
                    <strong>{option.label}</strong>
                    <small>{option.detail}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="builder-field builder-field-wide">
            <span>Choose the AI shape</span>
            <div className="ai-type-grid">
              {aiTypeOptions.map((option) => {
                const Icon = option.Icon;
                return (
                  <button
                    aria-pressed={aiType === option.id}
                    className={aiType === option.id ? "is-selected" : ""}
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setTemplateId("custom");
                      setAiType(option.id);
                    }}
                  >
                    <Icon size={16} />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.detail}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="builder-field builder-field-wide">
            <span>What should this AI do?</span>
            <textarea aria-label="What should this AI do?" value={intent} onChange={(event) => setIntent(event.target.value)} rows={5} />
          </label>

          <div className="builder-field">
            <span>Knowledge source</span>
            <select value={knowledgeSource} onChange={(event) => setKnowledgeSource(event.target.value)}>
              {knowledgeSourceOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="builder-field">
            <span>Answer boundary</span>
            <select value={boundaryMode} onChange={(event) => setBoundaryMode(event.target.value)}>
              {boundaryOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="builder-field builder-field-wide">
            <span>Source scope</span>
            <div className="source-scope-grid">
              {sourceScopePreview.options.map((option) => (
                <button
                  aria-pressed={sourceScope === option.id}
                  className={sourceScope === option.id ? "is-selected" : ""}
                  data-source-scope-id={option.id}
                  key={option.id}
                  type="button"
                  onClick={() => setSourceScope(option.id)}
                >
                  <strong>{option.label}</strong>
                  <small>
                    {option.includedFiles.toLocaleString()} in / {option.excludedFiles.toLocaleString()} out
                  </small>
                  <em>{option.datasetCandidateFiles.toLocaleString()} dataset candidates</em>
                </button>
              ))}
            </div>
            <div className="source-scope-preview-card">
              <div>
                <strong>{selectedSourceScope.label}</strong>
                <span>
                  {selectedSourceScope.includedFiles.toLocaleString()} included, {selectedSourceScope.excludedFiles.toLocaleString()} excluded
                </span>
              </div>
              <p>{selectedSourceScope.detail}</p>
              <div className="source-scope-preview-lists">
                <div>
                  <strong>Included preview</strong>
                  {(selectedSourceScope.includedPreview.length ? selectedSourceScope.includedPreview : []).slice(0, 5).map((row) => (
                    <span key={`in-${row.path}`} title={row.reason}>
                      <b>{row.path}</b>
                      <em>{row.reason}</em>
                    </span>
                  ))}
                  {!selectedSourceScope.includedPreview.length ? <span>No files included yet.</span> : null}
                </div>
                <div>
                  <strong>Excluded preview</strong>
                  {(selectedSourceScope.excludedPreview.length ? selectedSourceScope.excludedPreview : []).slice(0, 5).map((row) => (
                    <span key={`out-${row.path}`} title={row.reason}>
                      <b>{row.path}</b>
                      <em>{row.reason}</em>
                    </span>
                  ))}
                  {!selectedSourceScope.excludedPreview.length ? <span>No files excluded by this scope.</span> : null}
                </div>
              </div>
            </div>
          </div>

          <div className="builder-field">
            <span>Who is it for?</span>
            <select value={audience} onChange={(event) => setAudience(event.target.value)}>
              <option value="personal">Just me</option>
              <option value="team">A small team</option>
              <option value="public">A public release</option>
            </select>
          </div>

          <div className="builder-field">
            <span>Personality</span>
            <select value={personality} onChange={(event) => setPersonality(event.target.value)}>
              <option value="practical">Practical</option>
              <option value="teacher">Patient teacher</option>
              <option value="operator">Direct operator</option>
              <option value="creative">Creative helper</option>
            </select>
          </div>

          <div className="builder-field builder-field-wide">
            <span>Build route</span>
            <div className="segmented-grid">
              {purposeOptions.map((option) => (
                <button
                  aria-pressed={buildMode === option.id}
                  className={buildMode === option.id ? "is-selected" : ""}
                  key={option.id}
                  type="button"
                  onClick={() => setBuildMode(option.id)}
                >
                  <strong>{option.label}</strong>
                  <small>{option.detail}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="builder-field builder-field-wide">
            <span>Hardware fit priority</span>
            <div className="segmented-grid">
              {hardwarePreferenceOptions.map((option) => (
                <button
                  aria-pressed={hardwarePreference === option.id}
                  className={hardwarePreference === option.id ? "is-selected" : ""}
                  key={option.id}
                  type="button"
                  onClick={() => setHardwarePreference(option.id)}
                >
                  <strong>{option.label}</strong>
                  <small>{option.detail}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="builder-field builder-field-wide">
            <span>Data this AI should learn from</span>
            <div className="checkbox-grid">
              {dataTypeOptions.map((option) => (
                <label key={option.id}>
                  <input checked={dataTypes.includes(option.id)} type="checkbox" onChange={() => toggleDataType(option.id)} />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="builder-field">
            <span>Privacy posture</span>
            <div className="segmented-row">
              {privacyOptions.map((option) => (
                <button
                  aria-pressed={privacy === option.id}
                  className={privacy === option.id ? "is-selected" : ""}
                  key={option.id}
                  type="button"
                  onClick={() => setPrivacy(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="builder-field">
            <span>Speed vs quality</span>
            <div className="segmented-row">
              {qualityOptions.map((option) => (
                <button
                  aria-pressed={qualitySpeed === option.id}
                  className={qualitySpeed === option.id ? "is-selected" : ""}
                  key={option.id}
                  type="button"
                  onClick={() => setQualitySpeed(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="builder-field builder-field-wide">
            <span>Target device</span>
            <input value={targetDevice} onChange={(event) => setTargetDevice(event.target.value)} />
          </label>

          <div className="builder-blueprint-card builder-field-wide">
            <div className="builder-blueprint-heading">
              <div>
                <span>Blueprint preview</span>
                <h2>{blueprint.title}</h2>
              </div>
              <StatusPill status={planMatchesForm ? "pass" : "neutral"} label={planMatchesForm ? "Saved" : "Draft"} />
            </div>
            <p>{blueprint.summary}</p>
            <div className="blueprint-metrics">
              <div>
                <strong>Knowledge</strong>
                <span>{blueprint.knowledge}</span>
              </div>
              <div>
                <strong>Source scope</strong>
                <span>{blueprint.sourceScope}</span>
              </div>
              <div>
                <strong>Boundary</strong>
                <span>{blueprint.boundaries}</span>
              </div>
              <div>
                <strong>Hardware fit</strong>
                <span>{blueprint.hardwareFit}</span>
              </div>
            </div>
            <div className="blueprint-capability-grid">
              {blueprint.capabilities.map((capability) => (
                <div key={capability.label}>
                  <strong>{capability.label}</strong>
                  <span>{capability.detail}</span>
                </div>
              ))}
            </div>
          </div>

        </form>

        <aside className="builder-plan" aria-label="Build plan">
          <div className="hardware-strip">
            <div>
              <Cpu size={16} />
              <span>CPU</span>
              <strong>{hardware?.cpu.threads ? `${hardware.cpu.threads} threads` : "Checking"}</strong>
            </div>
            <div>
              <HardDrive size={16} />
              <span>RAM</span>
              <strong>{hardware?.memory.total || "Checking"}</strong>
            </div>
            <div>
              <Gauge size={16} />
              <span>GPU</span>
              <strong>{hardware?.gpu.detected ? hardware.gpu.totalVram : "No GPU"}</strong>
            </div>
            <div>
              <Bot size={16} />
              <span>Ollama</span>
              <strong>{hardware?.ollama.ok ? "Ready" : "Missing"}</strong>
            </div>
          </div>

          <div className="builder-hardware-recipe-card" aria-label="Local fit recipe">
            <div className="builder-route-heading">
              <div>
                <span>{hardwareRecipe.preference}</span>
                <h2>Local fit recipe</h2>
              </div>
              <StatusPill status={fitTone(hardwareRecipe.fitStatus)} label={hardwareRecipe.fitStatus} />
            </div>
            <p>{hardwareRecipe.summary}</p>
            <div className="hardware-recipe-grid">
              <div>
                <span>Model class</span>
                <strong>{hardwareRecipe.recommended.modelClass}</strong>
              </div>
              <div>
                <span>Quantization</span>
                <strong>{hardwareRecipe.recommended.quantization}</strong>
              </div>
              <div>
                <span>Context</span>
                <strong>{hardwareRecipe.recommended.contextWindowTokens.toLocaleString()} tokens</strong>
              </div>
              <div>
                <span>GPU layers</span>
                <strong>{hardwareRecipe.recommended.gpuLayers}</strong>
              </div>
              <div>
                <span>CPU threads</span>
                <strong>{hardwareRecipe.recommended.cpuThreads}</strong>
              </div>
              <div>
                <span>Batch</span>
                <strong>{hardwareRecipe.recommended.batchSize}</strong>
              </div>
              <div>
                <span>Runner</span>
                <strong>{hardwareRecipe.recommended.runner}</strong>
              </div>
              <div>
                <span>Storage</span>
                <strong>{hardwareRecipe.recommended.storageBudget}</strong>
              </div>
            </div>
            <div className="hardware-recipe-reasoning">
              {hardwareRecipe.reasoning.slice(0, 3).map((item) => (
                <span key={item}>
                  <CheckCircle2 size={12} />
                  {item}
                </span>
              ))}
            </div>
            {hardwareRecipe.warnings.length ? (
              <div className="hardware-recipe-warnings">
                {hardwareRecipe.warnings.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            ) : null}
            <div className={`hardware-apply-card ${appliedRecipeMatchesPlan ? "applied" : "pending"}`}>
              <div>
                <strong>{appliedRecipeMatchesPlan ? "Recipe applied" : "Apply this recipe"}</strong>
                <span>
                  {appliedRecipeMatchesPlan
                    ? appliedHardwareRecipe?.summary
                    : planMatchesForm
                      ? `Check or install ${hardwareRecipe.recommended.baseModel}, then write the model profile with these settings.`
                      : "Create the build plan before applying hardware settings."}
                </span>
              </div>
              <StatusPill status={appliedRecipeMatchesPlan ? "pass" : planMatchesForm ? "warn" : "neutral"} label={appliedRecipeMatchesPlan ? "Ready" : planMatchesForm ? "Not applied" : "Draft"} />
              {appliedRecipeMatchesPlan ? (
                <div className="hardware-apply-facts">
                  <span>
                    <strong>Base model</strong>
                    <em>{appliedHardwareRecipe?.baseModel.resolved}</em>
                  </span>
                  <span>
                    <strong>Profile</strong>
                    <em title={appliedHardwareRecipe?.modelProfile.profilePath || ""}>{compactPath(appliedHardwareRecipe?.modelProfile.profilePath)}</em>
                  </span>
                  <span>
                    <strong>Receipt</strong>
                    <em title={appliedReceiptPath}>{compactPath(appliedReceiptPath)}</em>
                  </span>
                  <span>
                    <strong>AI target</strong>
                    <em>{createReceipt?.modelName || appliedHardwareRecipe?.modelProfile.modelName}</em>
                  </span>
                </div>
              ) : null}
              <div className="hardware-apply-actions">
                <button className="primary-action compact" type="button" onClick={onApplyHardwareRecipe} disabled={!planMatchesForm || !plan || applyRecipeBusy}>
                  {applyRecipeBusy ? <LoaderCircle className="spin-icon" size={15} /> : <Hammer size={15} />}
                  <span>{applyRecipeBusy ? "Applying" : appliedRecipeMatchesPlan ? "Reapply Recipe" : "Apply Recipe"}</span>
                </button>
                <button className="primary-action compact" type="button" onClick={onCreateOrUpdateAi} disabled={!appliedRecipeMatchesPlan || createAiBusy}>
                  {createAiBusy ? <LoaderCircle className="spin-icon" size={15} /> : <Rocket size={15} />}
                  <span>{createActionLabel}</span>
                </button>
                {guidedTest?.unlocked ? (
                  <button className="plain-button small" type="button" onClick={() => onRunGuidedTest(guidedTest.prompt, guidedTest.modelName)} disabled={chatBusy}>
                    {chatBusy ? <LoaderCircle className="spin-icon" size={15} /> : <MessageSquare size={15} />}
                    <span>{chatBusy ? "Testing" : guidedReceipt ? "Rerun Test" : "Run Test Prompt"}</span>
                  </button>
                ) : null}
              </div>
              {appliedRecipeMatchesPlan ? (
                <div className={`hardware-create-result ${createReceipt?.status || "pending"}`}>
                  <div>
                    <strong>{createReceipt?.ok ? "AI installed" : "Ollama target"}</strong>
                    <StatusPill status={createReceipt ? createReceiptTone(createReceipt.status) : "neutral"} label={createReceiptStatus} />
                  </div>
                  <p>{createReceiptSummary}</p>
                  <div className="hardware-test-facts">
                    <span>
                      <strong>Action</strong>
                      <em>{createReceipt?.action || "create"}</em>
                    </span>
                    <span>
                      <strong>Installed</strong>
                      <em>{createReceipt?.model.installedAfter ? "Yes" : "No"}</em>
                    </span>
                    <span>
                      <strong>Receipt</strong>
                      <em title={createReceiptPath}>{compactPath(createReceiptPath)}</em>
                    </span>
                  </div>
                </div>
              ) : null}
              {guidedTest?.unlocked ? (
                <div className="hardware-test-prompt">
                  <strong>Guided source-backed test</strong>
                  <p>{guidedTest.prompt}</p>
                  <em>{guidedTest.detail}</em>
                </div>
              ) : null}
              {guidedReceipt ? (
                <div className={`hardware-test-result ${guidedReceipt.status}`}>
                  <div>
                    <strong>Test receipt</strong>
                    <StatusPill status={guidedReceiptTone} label={guidedReceipt.status} />
                  </div>
                  <p>{guidedReceipt.summary}</p>
                  <div className="hardware-test-facts">
                    <span>
                      <strong>Cited</strong>
                      <em>
                        {guidedReceipt.verification.citedPaths.length}/{guidedReceipt.verification.requiredCitationCount}
                      </em>
                    </span>
                    <span>
                      <strong>Retrieval</strong>
                      <em>{guidedReceipt.verification.retrievalInsideScope ? "In scope" : "Review"}</em>
                    </span>
                    <span>
                      <strong>Receipt</strong>
                      <em title={guidedReceiptPath}>{compactPath(guidedReceiptPath)}</em>
                    </span>
                  </div>
                  <div className="hardware-test-checks">
                    {guidedReceipt.verification.checks.slice(0, 4).map((check) => (
                      <span key={check.id}>
                        <StatusPill status={receiptTone(check.status)} label={check.status} />
                        <em>{check.label}</em>
                      </span>
                    ))}
                  </div>
                  <blockquote>{guidedReceipt.answer.content || "No model answer was captured."}</blockquote>
                </div>
              ) : null}
            </div>
          </div>

          <div className="training-route-card" aria-label="Training route planner">
            <div className="builder-route-heading">
              <div>
                <span>{trainingRoutePlan ? formatStamp(trainingRoutePlan.createdAt) : "Draft"}</span>
                <h2>Training route planner</h2>
              </div>
              <StatusPill status={trainingRouteTone(selectedTrainingRoute?.status)} label={trainingRouteLabel(selectedTrainingRoute?.status)} />
            </div>
            <p>
              {selectedTrainingRoute
                ? trainingRoutePlan?.summary || selectedTrainingRoute.fit
                : "Create a build plan to classify the request into Profile, RAG, adapter, continued pretraining, or tiny from-scratch routes."}
            </p>
            {trainingRouteOptions.length ? (
              <div className="training-route-grid">
                {trainingRouteOptions.map((route) => (
                  <div className={`training-route-option ${route.id === selectedTrainingRoute?.id ? "is-selected" : ""}`} key={route.id}>
                    <div>
                      <strong>{route.label}</strong>
                      <StatusPill status={trainingRouteTone(route.status)} label={trainingRouteLabel(route.status)} />
                    </div>
                    <span>{route.fit}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {selectedTrainingRoute ? (
              <div className="training-route-detail">
                <div>
                  <strong>Requirements</strong>
                  {selectedTrainingRoute.requirements.slice(0, 4).map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
                <div>
                  <strong>Risks</strong>
                  {selectedTrainingRoute.risks.slice(0, 4).map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
                <div>
                  <strong>Outputs</strong>
                  {selectedTrainingRoute.expectedOutputs.slice(0, 4).map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
            ) : null}
            <div className={`adapter-builder-card ${adapterReceipt?.status || "pending"}`}>
              <div>
                <strong>{adapterReceipt ? adapterReceipt.adapter.name : "Adapter Builder"}</strong>
                <span>
                  {adapterReceipt
                    ? adapterReceipt.summary
                    : selectedTrainingRoute?.id === "lora-qlora-adapter"
                      ? "Generate the LoRA/QLoRA dataset copy, config, runner recipe, checkpoint folder, and receipt."
                      : "Adapter prep is available when you want to test the fine-tune route without overclaiming training."}
                </span>
              </div>
              <StatusPill status={adapterReceiptTone(adapterReceipt?.status)} label={adapterReceipt?.status || "Not built"} />
              {adapterReceipt ? (
                <div className="adapter-builder-facts">
                  <span>
                    <strong>Examples</strong>
                    <em>{adapterReceipt.dataset.examples.toLocaleString()}</em>
                  </span>
                  <span>
                    <strong>Method</strong>
                    <em>{adapterReceipt.adapter.method.toUpperCase()}</em>
                  </span>
                  <span>
                    <strong>Mode</strong>
                    <em>{adapterReceipt.runner.executionMode}</em>
                  </span>
                  <span>
                    <strong>Receipt</strong>
                    <em title={adapterReceiptPath}>{compactPath(adapterReceiptPath)}</em>
                  </span>
                </div>
              ) : null}
              {adapterReceipt ? (
                <div className={`adapter-readiness-mini ${currentAdapterReadiness?.status || "pending"}`}>
                  <div className="adapter-runner-head">
                    <div>
                      <strong>Readiness</strong>
                      <span>{currentAdapterReadiness?.summary || "Check the local training environment before attempting a real adapter run."}</span>
                    </div>
                    <StatusPill status={adapterReadinessTone(currentAdapterReadiness?.status)} label={currentAdapterReadiness?.status || "Not checked"} />
                  </div>
                  <div className="adapter-builder-facts">
                    <span>
                      <strong>Packages</strong>
                      <em>{currentAdapterReadiness?.packageStatus.ok ? "ready" : currentAdapterReadiness?.packageStatus.missingRequired?.join(", ") || "not checked"}</em>
                    </span>
                    <span>
                      <strong>CUDA</strong>
                      <em>{currentAdapterReadiness?.cuda.available ? `${currentAdapterReadiness.cuda.deviceCount} device` : currentAdapterReadiness ? "not ready" : "not checked"}</em>
                    </span>
                    <span>
                      <strong>Cache</strong>
                      <em title={currentAdapterReadiness?.cachePlan.root || ""}>{compactPath(currentAdapterReadiness?.cachePlan.root || "")}</em>
                    </span>
                    <span>
                      <strong>TF base</strong>
                      <em title={currentAdapterReadiness?.recommendedBaseModel.modelId || ""}>
                        {currentAdapterReadiness?.recommendedBaseModel.applied ? "applied" : currentAdapterReadiness?.recommendedBaseModel.label || "not applied"}
                      </em>
                    </span>
                  </div>
                </div>
              ) : null}
              {adapterReceipt ? (
                <div className={`adapter-operation-console ${currentAdapterOperation?.status || "idle"}`}>
                  <div className="adapter-runner-head">
                    <div>
                      <strong>Operations Console</strong>
                      <span>
                        {currentAdapterOperation?.summary ||
                          "Install training packages, warm the Transformers base model cache, and keep receipts before training."}
                      </span>
                    </div>
                    <StatusPill status={adapterOperationTone(currentAdapterOperation?.status)} label={adapterOperationLabel(currentAdapterOperation)} />
                  </div>
                  <div className="adapter-runner-meter" aria-label="Adapter operation progress">
                    <span style={{ width: `${adapterOperationProgress}%` }} />
                  </div>
                  <div className="adapter-builder-facts">
                    <span>
                      <strong>Operation</strong>
                      <em>{adapterOperationKindLabel(currentAdapterOperation?.kind)}</em>
                    </span>
                    <span>
                      <strong>Estimate</strong>
                      <em>{currentAdapterOperation?.estimates?.time || "not estimated"}</em>
                    </span>
                    <span>
                      <strong>Disk</strong>
                      <em>{currentAdapterOperation?.estimates?.disk || "not estimated"}</em>
                    </span>
                    <span>
                      <strong>Receipt</strong>
                      <em title={adapterOperationReceiptPath}>{compactPath(adapterOperationReceiptPath)}</em>
                    </span>
                  </div>
                  {currentAdapterOperation?.commands?.length ? (
                    <div className="adapter-operation-commands">
                      {currentAdapterOperation.commands.slice(0, 4).map((command) => (
                        <span key={command.id}>
                          <StatusPill status={adapterOperationTone(command.status)} label={command.status || "pending"} />
                          <em title={command.summary}>{command.label}</em>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {adapterOperationLog ? (
                    <pre className="adapter-operation-log" aria-label="Adapter operation log">
                      {adapterOperationLog}
                    </pre>
                  ) : null}
                  {adapterOperationHistoryForReceipt.length ? (
                    <div className="adapter-operation-history">
                      {adapterOperationHistoryForReceipt.map((job) => (
                        <span key={job.jobId}>
                          <StatusPill status={adapterOperationTone(job.status)} label={adapterOperationKindLabel(job.kind)} />
                          <em>{job.summary || adapterOperationLabel(job)}</em>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {adapterReceipt ? (
                <div className={`adapter-preflight-panel ${currentAdapterPreflight?.status || "pending"}`}>
                  <div className="adapter-runner-head">
                    <div>
                      <strong>Trainer Preflight</strong>
                      <span>
                        {currentAdapterPreflight?.summary ||
                          "Run a final guardrail check before the trainer starts. Real training stays locked until dependencies, cache, CUDA, base model, and dataset checks pass."}
                      </span>
                    </div>
                    <StatusPill status={adapterPreflightTone(currentAdapterPreflight?.status)} label={adapterPreflightLabel(currentAdapterPreflight)} />
                  </div>
                  <div className="adapter-builder-facts">
                    <span>
                      <strong>Will run</strong>
                      <em>{currentAdapterPreflight?.guard?.willRunMode || "not checked"}</em>
                    </span>
                    <span>
                      <strong>Real train</strong>
                      <em>{currentAdapterPreflight?.guard?.realTrainingAllowed ? "allowed" : "locked"}</em>
                    </span>
                    <span>
                      <strong>Next fix</strong>
                      <em>{adapterPreflightNextAction?.label || "Preflight"}</em>
                    </span>
                    <span>
                      <strong>Receipt</strong>
                      <em title={adapterPreflightReceiptPath}>{compactPath(adapterPreflightReceiptPath)}</em>
                    </span>
                  </div>
                  {currentAdapterPreflight?.checks?.length ? (
                    <div className="adapter-preflight-checks">
                      {currentAdapterPreflight.checks.slice(0, 6).map((check) => (
                        <span key={check.id}>
                          <StatusPill status={adapterPreflightTone(check.status)} label={check.status} />
                          <em title={check.detail}>{check.label}</em>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {adapterReceipt && currentAdapterFixLoop ? (
                <div className={`adapter-fix-loop-panel ${currentAdapterFixLoop.status || "pending"}`}>
                  <div className="adapter-runner-head">
                    <div>
                      <strong>Assisted Fix</strong>
                      <span>{currentAdapterFixLoop.summary || "Trainer fixes are being checked."}</span>
                    </div>
                    <StatusPill status={adapterFixLoopTone(currentAdapterFixLoop.status)} label={adapterFixLoopLabel(currentAdapterFixLoop)} />
                  </div>
                  <div className="adapter-builder-facts">
                    <span>
                      <strong>Latest</strong>
                      <em>{adapterFixLoopLatestAction?.label || "waiting"}</em>
                    </span>
                    <span>
                      <strong>Real train</strong>
                      <em>{currentAdapterFixLoop.trainingUnlock?.realTraining ? "unlocked" : "locked"}</em>
                    </span>
                    <span>
                      <strong>Cache root</strong>
                      <em title={currentAdapterFixLoop.cachePlan?.root || ""}>{compactPath(currentAdapterFixLoop.cachePlan?.root || "")}</em>
                    </span>
                    <span>
                      <strong>Receipt</strong>
                      <em title={adapterFixLoopReceiptPath}>{compactPath(adapterFixLoopReceiptPath)}</em>
                    </span>
                  </div>
                  {currentAdapterFixLoop.actions?.length ? (
                    <div className="adapter-preflight-checks">
                      {currentAdapterFixLoop.actions.slice(-6).map((action) => (
                        <span key={action.id}>
                          <StatusPill status={adapterFixLoopTone(action.status)} label={action.status} />
                          <em title={action.detail || action.summary}>{action.label}</em>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {adapterReceipt ? (
                <div className="adapter-runner-panel">
                  <div className="adapter-runner-head">
                    <div>
                      <strong>Trainer</strong>
                      <span>{currentAdapterRun?.summary || adapterReceipt.runner.blockedReasons[0] || "Ready to run the guarded local trainer."}</span>
                    </div>
                    <StatusPill status={adapterRunTone(currentAdapterRun?.status)} label={adapterRunLabel(currentAdapterRun)} />
                  </div>
                  <div className="adapter-runner-meter" aria-label="Adapter trainer progress">
                    <span style={{ width: `${adapterRunProgress}%` }} />
                  </div>
                  <div className="adapter-builder-facts">
                    <span>
                      <strong>Checkpoint</strong>
                      <em>{adapterCheckpoint?.trained ? "trained" : adapterCheckpoint?.dryRun ? "dry-run" : "waiting"}</em>
                    </span>
                    <span>
                      <strong>Run mode</strong>
                      <em>{currentAdapterRun?.mode || adapterReceipt.runner.executionMode}</em>
                    </span>
                    <span>
                      <strong>Promotion</strong>
                      <em>{currentAdapterPromotion?.status || "not promoted"}</em>
                    </span>
                    <span>
                      <strong>Run receipt</strong>
                      <em title={currentAdapterRun?.files.latestJson || ""}>{compactPath(currentAdapterRun?.files.latestJson || "")}</em>
                    </span>
                  </div>
                </div>
              ) : null}
              <div className="adapter-builder-actions">
                <button className="primary-action compact" type="button" onClick={onBuildAdapter} disabled={!planMatchesForm || !plan || adapterBusy}>
                  {adapterBusy ? <LoaderCircle className="spin-icon" size={15} /> : <Hammer size={15} />}
                  <span>{adapterActionLabel}</span>
                </button>
                {adapterReceipt ? (
                  <button className="plain-button small" type="button" onClick={onCheckAdapterReadiness} disabled={adapterReadinessBusy}>
                    {adapterReadinessBusy ? <LoaderCircle className="spin-icon" size={14} /> : <RefreshCw size={14} />}
                    <span>{adapterReadinessBusy ? "Checking" : "Check"}</span>
                  </button>
                ) : null}
                {adapterReceipt ? (
                  <button className="plain-button small" type="button" onClick={onInstallAdapterDeps} disabled={adapterDepsBusy || adapterOperationActive}>
                    {adapterDepsBusy ? <LoaderCircle className="spin-icon" size={14} /> : <Download size={14} />}
                    <span>{adapterDepsBusy ? "Installing" : "Install deps"}</span>
                  </button>
                ) : null}
                {adapterReceipt ? (
                  <button className="plain-button small" type="button" onClick={onWarmAdapterBaseCache} disabled={adapterCacheBusy || adapterOperationActive || !canWarmAdapterCache}>
                    {adapterCacheBusy ? <LoaderCircle className="spin-icon" size={14} /> : <HardDrive size={14} />}
                    <span>{adapterCacheBusy ? "Warming" : "Warm cache"}</span>
                  </button>
                ) : null}
                {adapterReceipt ? (
                  <button className="plain-button small" type="button" onClick={onApplyRecommendedAdapterBaseModel} disabled={adapterBaseModelBusy || currentAdapterReadiness?.recommendedBaseModel.applied}>
                    {adapterBaseModelBusy ? <LoaderCircle className="spin-icon" size={14} /> : <PackageCheck size={14} />}
                    <span>{adapterBaseModelBusy ? "Applying" : currentAdapterReadiness?.recommendedBaseModel.applied ? "Base set" : "Use base"}</span>
                  </button>
                ) : null}
                {currentAdapterOperation && adapterOperationActive ? (
                  <button className="plain-button small" type="button" onClick={() => onCancelAdapterOperation(currentAdapterOperation.jobId)} disabled={currentAdapterOperation.cancelRequested}>
                    <CircleStop size={14} />
                    <span>{currentAdapterOperation.cancelRequested ? "Canceling" : "Cancel op"}</span>
                  </button>
                ) : null}
                {currentAdapterOperation && !adapterOperationActive ? (
                  <button className="plain-button small" type="button" onClick={() => onRetryAdapterOperation(currentAdapterOperation.jobId)}>
                    <RefreshCw size={14} />
                    <span>Retry op</span>
                  </button>
                ) : null}
                {adapterReceipt ? (
                  <button className="plain-button small" type="button" onClick={onRunAdapterPreflight} disabled={adapterPreflightBusy || adapterOperationActive}>
                    {adapterPreflightBusy ? <LoaderCircle className="spin-icon" size={14} /> : <ListChecks size={14} />}
                    <span>{adapterPreflightBusy ? "Checking" : "Preflight"}</span>
                  </button>
                ) : null}
                {adapterReceipt ? (
                  <button className="plain-button small" type="button" onClick={onRunAdapterFixLoop} disabled={adapterFixLoopBusy || adapterOperationActive || adapterFixLoopActive}>
                    {adapterFixLoopBusy || adapterFixLoopActive ? <LoaderCircle className="spin-icon" size={14} /> : <Wand2 size={14} />}
                    <span>{adapterFixLoopBusy || adapterFixLoopActive ? "Fixing" : "Fix Trainer"}</span>
                  </button>
                ) : null}
                {adapterReceipt ? (
                  currentAdapterRun?.status === "running" ? (
                    <button className="plain-button small" type="button" onClick={() => onCancelAdapterTraining(currentAdapterRun.runId)}>
                      <CircleStop size={14} />
                      <span>Cancel</span>
                    </button>
                  ) : (
                    <button className="plain-button small" type="button" onClick={onRunAdapterTraining} disabled={adapterTrainingBusy || adapterOperationActive}>
                      {adapterTrainingBusy ? <LoaderCircle className="spin-icon" size={14} /> : <Play size={14} />}
                      <span>{adapterTrainingBusy ? "Starting" : adapterWillRunRealTraining ? "Start Real Run" : adapterCheckpoint?.trained ? "Rerun Dry-run" : "Run Dry-run"}</span>
                    </button>
                  )
                ) : null}
                {adapterReceipt ? (
                  <button className="plain-button small" type="button" onClick={onPromoteAdapter} disabled={!canPromoteAdapter || adapterPromoteBusy || currentAdapterPromotion?.ok}>
                    {adapterPromoteBusy ? <LoaderCircle className="spin-icon" size={14} /> : <Rocket size={14} />}
                    <span>{currentAdapterPromotion?.ok ? "Promoted" : adapterPromoteBusy ? "Promoting" : "Promote AI"}</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {fitCandidates.length ? (
            <div className="builder-model-fit" aria-label="Model fit estimator">
              <div className="builder-subheading">
                <BrainCircuit size={16} />
                <strong>Model fit</strong>
              </div>
              <p>{hardware?.modelFit?.summary}</p>
              <div className="fit-card-grid">
                {fitCandidates.map((candidate) => (
                  <div className="fit-card" key={candidate.id}>
                    <strong>{candidate.label}</strong>
                    <span>{candidate.detail}</span>
                    <div>
                      <StatusPill status={fitTone(candidate.localUse)} label={`Local ${candidate.localUse}`} />
                      <StatusPill status={fitTone(candidate.buildUse)} label={`Build ${candidate.buildUse}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="builder-route-card">
            <div className="builder-route-heading">
              <div>
                <span>{planMatchesForm ? formatStamp(plan?.createdAt) : "Draft"}</span>
                <h2>{planMatchesForm ? plan?.routeLabel || "No build plan yet" : "Create this build plan"}</h2>
              </div>
              <StatusPill status={planMatchesForm ? "pass" : "neutral"} label={planMatchesForm ? "Planned" : "Draft"} />
            </div>
            <p>{planMatchesForm ? plan?.routeReason || "Create a plan to see the best route this machine can honestly support." : "Save this template and source scope before starting the build run."}</p>
            <dl className="builder-estimates">
              <div>
                <dt>Hardware tier</dt>
                <dd>{planMatchesForm ? plan?.estimates.hardwareTier || hardware?.tier.label || "Checking" : hardware?.tier.label || "Checking"}</dd>
              </div>
              <div>
                <dt>Base model</dt>
                <dd>{planMatchesForm ? plan?.baseModelRecommendation.model || hardware?.ollama.selectedModel || "Not selected" : hardware?.ollama.selectedModel || "Not selected"}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>{planMatchesForm ? plan?.estimates.time || "Plan required" : "Plan required"}</dd>
              </div>
              <div>
                <dt>Disk</dt>
                <dd>{planMatchesForm ? plan?.estimates.disk || hardware?.disk.free || "Checking" : hardware?.disk.free || "Checking"}</dd>
              </div>
            </dl>
          </div>

          {checklistItems.length ? (
            <div className="builder-checklist-card">
              <div className="builder-subheading">
                <ListChecks size={16} />
                <strong>First-run checklist</strong>
              </div>
              <div className="builder-checklist-list">
                {checklistItems.map((item) => (
                  <div className="builder-checklist-item" key={item.label}>
                    <StatusPill status={stepStatus(item.status)} label={stepLabel(item.status)} />
                    <span>
                      <strong>{item.label}</strong>
                      <em>{item.detail}</em>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className={`builder-run-card ${activeRun?.status || "ready"}`} aria-live="polite">
            <div className="builder-run-heading">
              <div>
                <span>Build From Plan</span>
                <h2>{activeRun ? activeRun.plan?.routeLabel || activeRun.runId : "One-click local forge"}</h2>
              </div>
              <StatusPill status={runStatusTone(activeRun?.status)} label={runStatusLabel(activeRun?.status)} />
            </div>
            <p>
              {activeRun?.summary ||
                (plan
                  ? "Run the full chain: setup checks, source boundary, model profile, proof gates, dataset, recipe, and export pack."
                  : "Create a build plan first, then ModelForge can run the complete local chain for you.")}
            </p>
            {activeRun ? (
              <>
                <div className="builder-run-progress" aria-label={`${runProgress.complete} of ${runProgress.total} stages complete`}>
                  <span style={{ width: `${runProgress.percent}%` }} />
                </div>
                <div className="builder-run-meta">
                  <span>
                    <ListChecks size={14} />
                    {runProgress.complete}/{runProgress.total} stages
                  </span>
                  <span>
                    <Clock3 size={14} />
                    {formatStamp(activeRun.updatedAt || activeRun.startedAt)}
                  </span>
                </div>
                {activeStage ? (
                  <div className={`builder-run-focus ${activeStage.status}`}>
                    <strong>{activeStage.label}</strong>
                    <span>{activeStage.plainLanguage || activeStage.action}</span>
                    {activeStage.status === "fail" || activeStage.status === "canceled" ? <em>{activeStage.repairHint || activeRun.error}</em> : null}
                  </div>
                ) : null}
                <div className="builder-run-stages">
                  {activeRun.stages.map((stage) => (
                    <div className="builder-run-stage" key={stage.id}>
                      <StatusPill status={runStatusTone(stage.status)} label={runStatusLabel(stage.status)} />
                      <span>
                        <strong>{stage.label}</strong>
                        <em>{stage.summary || stage.action}</em>
                      </span>
                    </div>
                  ))}
                </div>
                {outputRows.length ? (
                  <details className="builder-run-output">
                    <summary>Receipts and outputs</summary>
                    <div>
                      {outputRows.map((row) => (
                        <span key={row.label} title={row.path}>
                          <strong>{row.label}</strong>
                          <em>{compactPath(row.path)}</em>
                        </span>
                      ))}
                    </div>
                  </details>
                ) : null}
                {pastRuns.length ? (
                  <details className="builder-run-history">
                    <summary>Previous builds</summary>
                    <div>
                      {pastRuns.map((run) => (
                        <span key={run.runId}>
                          <StatusPill status={runStatusTone(run.status)} label={runStatusLabel(run.status)} />
                          <strong>{run.plan?.blueprint?.aiType?.label || run.plan?.routeLabel || run.runId}</strong>
                          <em>{formatStamp(run.endedAt || run.updatedAt || run.startedAt)}</em>
                        </span>
                      ))}
                    </div>
                  </details>
                ) : null}
              </>
            ) : null}
          </div>

          {handoff ? (
            <div className="builder-handoff-card" aria-label="Build handoff">
              <div className="builder-handoff-heading">
                <div>
                  <span>Build handoff</span>
                  <h2>{handoff.title}</h2>
                </div>
                <StatusPill status="pass" label="Built" />
              </div>
              <p>{handoff.summary}</p>
              {handoff.hardwareFit ? (
                <div className="builder-handoff-fit">
                  <Cpu size={14} />
                  <span>{handoff.hardwareFit}</span>
                </div>
              ) : null}
              <div className="builder-handoff-artifacts">
                {handoff.builtArtifacts.map((artifact) => (
                  <button className="builder-handoff-artifact" key={artifact.label} type="button" onClick={() => goToPlanAction(artifact.workspace)} title={artifact.path || artifact.detail}>
                    <strong>{artifact.label}</strong>
                    <span>{artifact.value}</span>
                    <em>{artifact.detail}</em>
                  </button>
                ))}
              </div>
              <div className="builder-handoff-actions">
                {handoff.actions.map((action) => (
                  <button className={action.id === "test-ai" ? "primary-action compact" : "plain-button small"} key={action.id} type="button" onClick={() => goToPlanAction(action.workspace)} title={action.detail}>
                    {action.id === "test-ai" ? <Play size={15} /> : <ShieldCheck size={15} />}
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="builder-readiness">
            {readiness.map(({ label, value, tone, Icon }) => (
              <div className={tone} key={label}>
                <Icon size={15} />
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          <div className="builder-steps">
            <div className="builder-subheading">
              <BrainCircuit size={16} />
              <strong>Route steps</strong>
            </div>
            {plan?.steps?.length ? (
              plan.steps.map((step) => (
                <button className="builder-step" key={step.id} type="button" onClick={() => goToPlanAction(step.workspace)}>
                  {step.status === "pass" ? <CheckCircle2 size={15} /> : <Sparkles size={15} />}
                  <span>
                    <strong>{step.label}</strong>
                    <em>{step.detail}</em>
                  </span>
                  <StatusPill status={stepStatus(step.status)} label={stepLabel(step.status)} />
                </button>
              ))
            ) : (
              <div className="builder-empty-step">
                <Sparkles size={15} />
                <span>Create a build plan to turn this into ordered steps.</span>
              </div>
            )}
          </div>

          <div className="builder-action-row">
            <button className="plain-button small" type="button" onClick={() => onNavigate("setup")}>
              <ShieldCheck size={15} />
              <span>Setup</span>
            </button>
            <button className="plain-button small" type="button" onClick={onBuildDataset} disabled={datasetBusy}>
              <Database size={15} />
              <span>{datasetBusy ? "Building" : "Dataset"}</span>
            </button>
            <button className="plain-button small" type="button" onClick={onBuildRecipe} disabled={recipeBusy}>
              <Play size={15} />
              <span>{recipeBusy ? "Building" : "Recipe"}</span>
            </button>
          </div>

          <div className="builder-path-note" title={plan?.files.json || hardware?.disk.dataRoot || ""}>
            {compactPath(plan?.files.json || hardware?.disk.dataRoot)}
          </div>
        </aside>
      </div>
    </section>
  );
}
