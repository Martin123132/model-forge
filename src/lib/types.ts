export type PipelineStatus = "complete" | "warning" | "ready" | "failed";

export type PipelineStep = {
  id: string;
  index: number;
  title: string;
  description: string;
  status: PipelineStatus;
  metric: string;
  detail: string;
};

export type SourceRow = {
  path: string;
  type: string;
  language: string;
  sizeBytes: number;
  size: string;
  license: string;
  added: string;
  hash: string;
  hashShort: string;
};

export type LicenseSignals = {
  packageLicense: string;
  projectLicensePath: string;
  projectLicenseReady: boolean;
};

export type LicenseReviewQueueItem = {
  path: string;
  label: string;
  language: string;
  size: string;
};

export type LicenseReview = {
  schema: string;
  createdAt: string;
  coveragePercent: number;
  reviewedFiles: number;
  pendingFiles: number;
  projectLicensePath: string;
  packageLicense: string;
  projectLicenseReady: boolean;
  blockers: string[];
  categoryCounts: Record<string, number>;
  queue: LicenseReviewQueueItem[];
};

export type SourceSummary = {
  root: string;
  totalFiles: number;
  sampledFiles: number;
  totalSizeBytes: number;
  totalSize: string;
  reviewedFiles: number;
  unreviewedFiles: number;
  licenseSignals?: LicenseSignals;
  licenseReview?: LicenseReview;
  rows: SourceRow[];
};

export type ModelInfo = {
  name: string;
  id: string;
  size: string;
  modified: string;
};

export type OllamaStatus = {
  ok: boolean;
  version: string;
  modelsRoot: string;
  models: ModelInfo[];
  selectedModel: string;
  error: string;
};

export type ToolAvailability = {
  ok: boolean;
  label: string;
  detail: string;
};

export type ToolStatus = {
  repomori: ToolAvailability;
  agentledger: ToolAvailability;
  ollama: ToolAvailability;
};

export type SetupCheckStatus = "pass" | "warn" | "fail" | "ready" | string;

export type SetupConfig = {
  sourceRoot: string;
  dataRoot: string;
  ollamaModels: string;
  pythonCommand: string;
  baseModel: string;
  targetModel: string;
};

export type SetupCheck = {
  id: string;
  label: string;
  status: SetupCheckStatus;
  value: string;
  detail: string;
  fix: string;
};

export type SetupState = {
  schema: string;
  configured: boolean;
  config: SetupConfig;
  defaults: {
    projectRoot: string;
    sourceRoot: string;
    dataRoot: string;
    pythonCommand: string;
  };
  summary: {
    sources: number;
    sampled: number;
    proofFresh: boolean;
    evalFresh: boolean;
    recipeReady: boolean;
  };
  checks: SetupCheck[];
};

export type Receipt = {
  name: string;
  ok: boolean;
  status: "ok" | "failed" | "skipped" | string;
  command: string[];
  outputPath: string;
  summary: string;
  stdoutTail: string;
  stderrTail: string;
  error: string;
  startedAt: string;
  endedAt: string;
};

export type ModelExport = {
  status: string;
  path: string;
  modelfilePath: string;
  promptPath: string;
  profilePath: string;
  modelName: string;
  baseModel: string;
  created: boolean;
  createReceipt?: Receipt | null;
  summary: string;
};

export type EvalGate = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail" | "ready" | string;
  value: string;
  detail: string;
};

export type EvalReport = {
  schema: string;
  createdAt: string;
  sourceRoot: string;
  proofPath: string;
  modelName: string;
  summary: string;
  licenseReview?: LicenseReview;
  gates: EvalGate[];
};

export type ShareCard = {
  schema: string;
  createdAt: string;
  tone: string;
  headline: string;
  text: string;
  modelName: string;
  proofPath: string;
  evalSummary: string;
  files: {
    markdown: string;
    json: string;
  };
};

export type ForgeRecipeStage = {
  id: string;
  label: string;
  status: string;
  action: string;
  artifact: string;
};

export type ForgeRecipeRunnerPlan = {
  id: string;
  label: string;
  status: string;
  output: string;
  command: string;
  purpose: string;
};

export type ForgeRecipeModelPlan = {
  schema: string;
  createdAt: string;
  intent: string;
  sourceBoundary: string;
  license: string;
  dataset: {
    rowEstimate: number;
    tokenEstimate: number;
    reviewedFiles: number;
    sampledFiles: number;
  };
  runnerPlans: ForgeRecipeRunnerPlan[];
  gates: Array<{
    id: string;
    status: string;
    value: string;
  }>;
};

export type ForgeRecipe = {
  schema: string;
  recipeId: string;
  status: "ready" | "stale" | "draft" | string;
  version?: {
    number: number;
    path: string;
  };
  createdAt: string;
  sourceRoot: string;
  dataRoot: string;
  baseModel: string;
  targetModel: string;
  dataset: {
    sourceFiles: number;
    sampledFiles: number;
    rows: number;
    tokens: number;
    estimatedSize: string;
    reviewedFiles: number;
    unreviewedFiles: number;
    licenseReviewedPercent: number;
  };
  tools: ToolStatus;
  stages: ForgeRecipeStage[];
  modelPlan?: ForgeRecipeModelPlan;
  gates: EvalGate[];
  freshness: {
    currentSourceFiles: number;
    proofSourceFiles: number;
    currentSampledFiles: number;
    proofSampledFiles: number;
    sourcesMatchProof: boolean;
    evalMatchesProof: boolean;
    proofBuiltAt: string;
    evalCreatedAt: string;
  };
  evidence: {
    proofPath: string;
    evalPath: string;
    sharePath: string;
    modelProfilePath: string;
    modelfilePath: string;
  };
  files: {
    json: string;
    markdown: string;
    versionJson?: string;
    versionMarkdown?: string;
    exportDir?: string;
    exportManifest?: string;
    exportReadme?: string;
  };
};

export type RecipePackRun = {
  schema: string;
  runId?: string;
  ok: boolean;
  status: "pass" | "fail" | "running" | "canceled" | string;
  recipeId: string;
  targetModel: string;
  exportDir: string;
  command: string[];
  receiptPath: string;
  runPath: string;
  exportRunPath?: string;
  summary: string;
  startedAt: string;
  endedAt?: string;
  updatedAt?: string;
  receipt?: Receipt | null;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  createdAt?: string;
};

export type ChatResponse = {
  ok: boolean;
  modelName: string;
  requestedModelName?: string;
  fallbackUsed?: boolean;
  message: ChatMessage;
  transcriptPath: string;
};

export type ProjectPayload = {
  name: string;
  status: string;
  sourceRoot: string;
  dataRoot: string;
  toolStatus: ToolStatus;
  latestModelExport?: ModelExport | null;
  latestProof?: ProofBundle | null;
  latestEval?: EvalReport | null;
  latestShare?: ShareCard | null;
  latestRecipe?: ForgeRecipe | null;
  latestRecipeRun?: RecipePackRun | null;
  recipeRunHistory?: RecipePackRun[];
  recipeHistory?: ForgeRecipe[];
  pipeline: PipelineStep[];
  sources: SourceSummary;
};

export type ProofBundle = {
  status: string;
  path: string;
  builtAt: string;
  size: string;
  modelCard?: string;
  sourceSummary?: string;
  manifest?: {
    receipts?: Receipt[];
    modelProfile?: ModelExport;
    artifacts?: string[];
    sourceSummary?: {
      totalFiles: number;
      sampledFiles: number;
      totalSizeBytes: number;
      reviewedFiles: number;
      unreviewedFiles: number;
    };
  };
};
