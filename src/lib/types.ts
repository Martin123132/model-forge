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

export type HardwareProfile = {
  schema: string;
  createdAt: string;
  platform: {
    os: string;
    arch: string;
    release: string;
  };
  cpu: {
    model: string;
    cores: number;
    threads: number;
  };
  memory: {
    totalBytes: number;
    total: string;
    freeBytes: number;
    free: string;
  };
  disk: {
    dataRoot: string;
    root: string;
    freeBytes: number;
    free: string;
    usedBytes: number;
    used: string;
    source: string;
  };
  gpu: {
    detected: boolean;
    source: string;
    totalVramMb: number;
    totalVram: string;
    devices: Array<{
      name: string;
      memoryMb: number;
      memory: string;
      driverVersion: string;
      source: string;
    }>;
  };
  ollama: {
    ok: boolean;
    version: string;
    selectedModel: string;
    modelCount: number;
    modelsRoot: string;
  };
  tier: {
    id: string;
    label: string;
    detail: string;
    canTrainAdapter: boolean;
    canRunQuantized: boolean;
  };
  modelFit?: {
    schema: string;
    createdAt: string;
    summary: string;
    candidates: Array<{
      id: string;
      label: string;
      localUse: "comfortable" | "possible" | "tight" | "avoid" | string;
      buildUse: "comfortable" | "possible" | "tight" | "avoid" | string;
      detail: string;
    }>;
  };
};

export type BuilderPlanRequest = {
  intent: string;
  templateId: string;
  aiType: string;
  audience: string;
  personality: string;
  privacy: string;
  qualitySpeed: string;
  buildMode: string;
  targetDevice: string;
  knowledgeSource: string;
  sourceScope: string;
  boundaryMode: string;
  dataTypes: string[];
};

export type BuilderPlanStep = {
  id: string;
  label: string;
  status: "pass" | "ready" | "warn" | "blocked" | string;
  action: string;
  detail: string;
  workspace: string;
};

export type BuilderPlan = {
  schema: string;
  planId: string;
  createdAt: string;
  intent: string;
  request: BuilderPlanRequest;
  sourceRoot: string;
  dataRoot: string;
  hardware: HardwareProfile;
  artifacts: {
    setupConfigured: boolean;
    sourceReady: boolean;
    datasetReady: boolean;
    modelProfileReady: boolean;
    recipeReady: boolean;
    proofFresh: boolean;
    evalFresh: boolean;
  };
  recommendedRoute: string;
  routeLabel: string;
  routeReason: string;
  blueprint?: {
    schema: string;
    title: string;
    summary: string;
    aiType: {
      id: string;
      label: string;
      capability: string;
    };
    userPromise: string;
    starterTemplate: string;
    knowledge: string;
    sourceScope: string;
    boundaries: string;
    route: string;
    hardwareFit: string;
    firstBuild: string;
    releasePosture: string;
    capabilities: Array<{
      label: string;
      detail: string;
    }>;
    firstRunChecklist: Array<{
      label: string;
      status: "pass" | "ready" | "warn" | "blocked" | string;
      detail: string;
    }>;
    watchouts: string[];
  };
  baseModelRecommendation: {
    label: string;
    model: string;
    reason: string;
  };
  estimates: {
    time: string;
    disk: string;
    hardwareTier: string;
  };
  steps: BuilderPlanStep[];
  limitations: string[];
  nextActions: Array<{
    id: string;
    label: string;
    workspace: string;
  }>;
  files: {
    dir: string;
    json: string;
    markdown: string;
    versionDir: string;
    versionJson: string;
    versionMarkdown: string;
  };
};

export type BuilderRunStage = {
  id: string;
  label: string;
  action: string;
  plainLanguage: string;
  repairHint: string;
  status: "ready" | "running" | "pass" | "fail" | "canceled" | string;
  summary: string;
  artifact: string;
  startedAt: string;
  endedAt: string;
  error: string;
};

export type BuilderRun = {
  schema: string;
  runId: string;
  planId: string;
  ok: boolean;
  status: "running" | "pass" | "fail" | "canceled" | string;
  summary: string;
  error: string;
  startedAt: string;
  updatedAt: string;
  endedAt: string;
  sourceRoot: string;
  dataRoot: string;
  plan: BuilderPlan;
  stages: BuilderRunStage[];
  outputs: {
    buildPlanPath: string;
    sourceInventoryPath: string;
    modelProfilePath: string;
    proofPath: string;
    evalPath: string;
    sharePath: string;
    datasetPath: string;
    recipePath: string;
    exportDir: string;
    packRunId: string;
    packRunReceiptPath: string;
    finalPlanPath: string;
  };
  files: {
    dir: string;
    json: string;
    receipt: string;
  };
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

export type ExportPackSummary = {
  schema: string;
  recipeId: string;
  recipeStatus: string;
  exportDir: string;
  manifestPath: string;
  readmePath: string;
  artifactCount: number;
  copiedArtifacts: string[];
  downloadName: string;
  readme: string;
  manifest: {
    schema: string;
    createdAt: string;
    recipeId: string;
    recipeStatus: string;
    targetModel: string;
    baseModel: string;
    publicPositioning: string;
    copiedArtifacts: string[];
    runner?: {
      kind: string;
      createCommand: string[];
      smokePrompt: string;
    };
    freshness?: {
      sourcesMatchProof: boolean;
      evalMatchesProof: boolean;
    };
  };
};

export type DatasetForgePreview = {
  id: string;
  sourcePath: string;
  language: string;
  license: string;
  hashShort: string;
  instruction: string;
  inputPreview: string;
  outputPreview: string;
};

export type DatasetForge = {
  schema: string;
  datasetId: string;
  status: "ready" | "empty" | string;
  createdAt: string;
  sourceRoot: string;
  dataRoot: string;
  requestedBy: string;
  summary: {
    totalExamples: number;
    includedFiles: number;
    skippedFiles: number;
    totalInputBytes: number;
    totalOutputBytes: number;
    estimatedTokens: number;
    estimatedSize: string;
    licenseReviewedPercent: number;
  };
  filters: {
    maxFiles: number;
    maxBytesPerFile: number;
    candidateLanguages: string[];
  };
  provenance: {
    proofPath: string;
    proofBuiltAt: string;
    evalPath: string;
    sourceFiles: number;
    sampledFiles: number;
    sourcesMatchProof: boolean;
    evalMatchesProof: boolean;
    licenseSignals?: LicenseSignals;
  };
  splits: {
    train: number;
    validation: number;
  };
  files: {
    dir: string;
    manifest: string;
    jsonl: string;
    readme: string;
    preview: string;
    versionDir?: string;
    versionManifest?: string;
    versionJsonl?: string;
    versionReadme?: string;
    versionPreview?: string;
  };
  examplesPreview: DatasetForgePreview[];
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
    forgedExamples?: number;
    forgedTokens?: number;
    forgedPath?: string;
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
    datasetPath?: string;
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
  latestDataset?: DatasetForge | null;
  latestRecipe?: ForgeRecipe | null;
  latestRecipeRun?: RecipePackRun | null;
  recipeRunHistory?: RecipePackRun[];
  recipeHistory?: ForgeRecipe[];
  latestBuildPlan?: BuilderPlan | null;
  latestBuilderRun?: BuilderRun | null;
  builderRunHistory?: BuilderRun[];
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
