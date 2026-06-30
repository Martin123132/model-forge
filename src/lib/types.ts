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
  sourceRules?: SourceRules;
  rows: SourceRow[];
};

export type SourceRules = {
  schema: string;
  includePatterns: string[];
  excludePatterns: string[];
  includedFiles: number;
  excludedFiles: number;
  scannedFiles: number;
  excludedPreview: Array<{
    path: string;
    language: string;
    size: string;
    sizeBytes: number;
    reason: string;
  }>;
};

export type SourceScopeRow = {
  path: string;
  language: string;
  size: string;
  sizeBytes: number;
  license: string;
  hashShort: string;
  reason: string;
};

export type SourceScopeOption = {
  schema?: string;
  id: string;
  label: string;
  detail: string;
  totalFiles: number;
  sampledFiles: number;
  includedFiles: number;
  excludedFiles: number;
  includedSizeBytes: number;
  includedSize: string;
  excludedSizeBytes: number;
  excludedSize: string;
  datasetCandidateFiles: number;
  includedPreview: SourceScopeRow[];
  excludedPreview: SourceScopeRow[];
  includedPaths?: SourceScopeRow[];
  excludedPaths?: SourceScopeRow[];
};

export type SourceScopePreview = {
  schema: string;
  selected: string;
  options: SourceScopeOption[];
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
  aiName: string;
  voice: string;
  intent: string;
  templateId: string;
  aiType: string;
  audience: string;
  personality: string;
  privacy: string;
  qualitySpeed: string;
  buildMode: string;
  hardwarePreference: string;
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

export type BuilderAiProfile = {
  schema: string;
  name: string;
  title: string;
  summary: string;
  audience: string;
  personality: string;
  voice: string;
  privacy: string;
  targetDevice: string;
  baseModel: string;
  route: string;
  buildMethod: string;
  knowledgeBoundary: string;
  sourceScope: string;
  answerRules: string[];
  outputs: Array<{
    label: string;
    detail: string;
    status: "ready" | "planned" | "blocked" | string;
    workspace: string;
  }>;
  doneWhen: string[];
};

export type BuilderStarterModelCard = {
  schema: string;
  cardId: string;
  createdAt: string;
  planId: string;
  aiName: string;
  role: string;
  voice: string;
  audience: string;
  summary: string;
  intendedUse: string[];
  notFor: string[];
  sourceBoundary: string;
  buildRoute: string;
  baseModel: string;
  hardwareFit: string;
  localBuildSettings?: {
    preference: string;
    modelClass: string;
    quantization: string;
    contextWindowTokens: number;
    gpuLayers: string;
    runner: string;
  } | null;
  answerRules: string[];
  releaseChecklist: string[];
  limitations: string[];
  files: {
    json: string;
    markdown: string;
    versionJson: string;
    versionMarkdown: string;
  };
};

export type BuilderHardwareRecipe = {
  schema: string;
  createdAt: string;
  preference: string;
  fitStatus: "comfortable" | "possible" | "tight" | "avoid" | string;
  summary: string;
  resources: {
    cpuThreads: string;
    ram: string;
    gpu: string;
    vram: string;
    diskFree: string;
    ollama: string;
  };
  recommended: {
    modelClass: string;
    baseModel: string;
    quantization: string;
    contextWindowTokens: number;
    gpuLayers: string;
    cpuThreads: number;
    batchSize: number;
    runner: string;
    storageBudget: string;
    buildRoute: string;
  };
  reasoning: string[];
  warnings: string[];
  nextSteps: string[];
};

export type TrainingRouteStatus = "recommended" | "possible" | "stretch" | "blocked" | "avoid" | string;

export type TrainingRouteOption = {
  id: string;
  label: string;
  status: TrainingRouteStatus;
  statusLabel: string;
  fit: string;
  why: string;
  localExecution: string;
  estimatedTime: string;
  estimatedDisk: string;
  runner: string;
  requirements: string[];
  risks: string[];
  expectedOutputs: string[];
  nextReceipts: string[];
  blockedReasons?: string[];
};

export type TrainingRoutePlan = {
  schema: string;
  routePlanId: string;
  createdAt: string;
  selectedRouteId: string;
  selectedRouteLabel: string;
  selectedStatus: TrainingRouteStatus;
  summary: string;
  recommendation: string;
  hardwareSignals: {
    summary: string;
    tier: string;
    canTrainAdapter: boolean;
    canRunQuantized: boolean;
    memoryGb: number;
    vramGb: number;
    ollamaReady: boolean;
  };
  dataSignals: {
    sourceScope: SourceScopeOption;
    sourceFiles: number;
    datasetCandidates: number;
    datasetReady: boolean;
    knowledgePackReady: boolean;
    summary: string;
  };
  intentSignals: Record<string, boolean>;
  baseModel: string;
  routes: TrainingRouteOption[];
};

export type BuilderAppliedHardwareRecipe = {
  schema: string;
  receiptId: string;
  createdAt: string;
  planId: string;
  ok: boolean;
  status: "applied" | "blocked" | "failed" | string;
  summary: string;
  aiName: string;
  route: string;
  hardwareRecipe: BuilderHardwareRecipe;
  baseModel: {
    requested: string;
    resolved: string;
    installedBefore: boolean;
    installedAfter: boolean;
    pulled: boolean;
    pullSummary: string;
  };
  modelProfile: {
    modelName: string;
    baseModel: string;
    profilePath: string;
    modelfilePath: string;
    promptPath: string;
  };
  testPrompt: {
    unlocked: boolean;
    prompt: string;
    modelName: string;
    expectedSources: string[];
    detail: string;
  };
  files: {
    latestJson: string;
    latestMarkdown: string;
    historyJson: string;
    historyMarkdown: string;
  };
};

export type BuilderGuidedTestReceipt = {
  schema: string;
  testId: string;
  createdAt: string;
  planId: string;
  appliedReceiptId: string;
  ok: boolean;
  status: "pass" | "warn" | "fail" | string;
  summary: string;
  aiName: string;
  route: string;
  modelName: string;
  requestedModelName: string;
  fallbackUsed: boolean;
  prompt: string;
  answer: {
    role: "assistant";
    content: string;
    createdAt: string;
    sources: KnowledgeSnippetSource[];
  };
  verification: {
    status: "pass" | "warn" | "fail" | string;
    checks: Array<{
      id: string;
      label: string;
      status: "pass" | "warn" | "fail" | string;
      detail: string;
    }>;
    sourceScope: SourceScopeOption;
    expectedSources: string[];
    expectedMatchedSources: string[];
    citedPaths: string[];
    retrievalSourcePaths: string[];
    outOfScopePaths: string[];
    retrievalInsideScope: boolean;
    answerCitesRequiredCount: boolean;
    requiredCitationCount: number;
  };
  chat: {
    transcriptPath: string;
    retrieval: {
      packId: string;
      queryKeywords: string[];
      sources: KnowledgeSnippetSource[];
    };
    error: string;
  };
  files: {
    latestJson: string;
    latestMarkdown: string;
    historyJson: string;
    historyMarkdown: string;
  };
};

export type AdapterPackageStatus = {
  schema: string;
  ok: boolean;
  pythonCommand: string;
  python: string;
  commandOk: boolean;
  packages: Record<string, { ok: boolean; required: boolean; version?: string }>;
  required: string[];
  optional: string[];
  missingRequired: string[];
  summary: string;
};

export type AdapterTrainingCuda = {
  checked: boolean;
  available: boolean;
  torchCudaVersion: string;
  deviceCount: number;
  devices: Array<{
    index: number;
    name: string;
    totalMemoryBytes: number;
  }>;
  summary: string;
};

export type AdapterTrainingCachePlan = {
  schema: string;
  root: string;
  preferredDrive: string;
  onPreferredDrive: boolean;
  dirs: Record<string, string>;
  env: Record<string, string>;
  summary: string;
};

export type AdapterTrainingReadiness = {
  schema: string;
  receiptId: string;
  createdAt: string;
  ok: boolean;
  status: "ready" | "needs-deps" | "needs-base-model" | "dry-run-only" | "blocked" | string;
  adapterBuildId: string;
  planId: string;
  adapterName: string;
  method: string;
  summary: string;
  python: {
    schema: string;
    ok: boolean;
    commandOk: boolean;
    pythonCommand: string;
    executable: string;
    version: string;
    versionInfo: number[];
    versionOk: boolean;
    implementation: string;
    platform: string;
    packages: Record<string, { ok: boolean; required: boolean; version?: string }>;
    cuda: AdapterTrainingCuda;
    stdoutTail: string;
    stderrTail: string;
    summary: string;
  };
  cuda: AdapterTrainingCuda;
  packageStatus: AdapterPackageStatus;
  cachePlan: AdapterTrainingCachePlan;
  hardware: Record<string, unknown>;
  dataset: {
    examples: number;
    jsonl: string;
    sourceScope?: SourceScopeOption | null;
  };
  recommendedBaseModel: {
    schema: string;
    modelId: string;
    label: string;
    family: string;
    minVramGb: number;
    estimatedDownloadGb: number;
    contextWindowTokens: number;
    reason: string;
    configuredModelId: string;
    applied: boolean;
    targetModules: string[];
    trustRemoteCode: boolean;
    cacheRoot: string;
    summary: string;
  };
  installPlan: {
    schema: string;
    createdAt: string;
    pythonCommand: string;
    missingRequired: string[];
    cachePlan: AdapterTrainingCachePlan;
    commands: Array<{
      id: string;
      label: string;
      required: boolean;
      command: string[];
      summary: string;
    }>;
    summary: string;
  };
  blockers: string[];
  warnings: string[];
  unlock: {
    realTraining: boolean;
    dryRun: boolean;
    reason: string;
  };
  nextActions: Array<{
    id: string;
    label: string;
    detail: string;
    workspace: string;
  }>;
  files: {
    latestJson: string;
    latestMarkdown: string;
    historyJson: string;
    historyMarkdown: string;
  };
};

export type AdapterDependencyInstallReceipt = {
  schema: string;
  receiptId: string;
  adapterBuildId: string;
  createdAt: string;
  endedAt: string;
  dryRun: boolean;
  ok: boolean;
  status: string;
  summary: string;
  cachePlan: AdapterTrainingCachePlan;
  before: AdapterTrainingReadiness;
  after: AdapterTrainingReadiness;
  commands: Array<{
    id: string;
    label: string;
    required: boolean;
    command: string[];
    summary: string;
    status: string;
    ok: boolean;
    stdoutTail: string;
    stderrTail: string;
    error: string;
  }>;
  files: {
    latestJson: string;
    latestMarkdown: string;
    historyJson: string;
    historyMarkdown: string;
  };
};

export type AdapterOperationJob = {
  schema: string;
  jobId: string;
  kind: "dependency-install" | "base-cache-warmup" | string;
  label: string;
  adapterBuildId: string;
  planId: string;
  adapterName: string;
  status: "queued" | "running" | "pass" | "fail" | "canceled" | string;
  ok: boolean;
  dryRun: boolean;
  retryOf: string;
  modelId: string;
  summary: string;
  estimates: {
    disk: string;
    time: string;
    detail: string;
  };
  readinessBefore?: AdapterTrainingReadiness | null;
  readinessAfter?: AdapterTrainingReadiness | null;
  progress: {
    currentStep: number;
    totalSteps: number;
    label: string;
    detail: string;
    event: string;
    updatedAt: string;
  };
  commands: Array<{
    id: string;
    label: string;
    required: boolean;
    command: string[];
    summary: string;
    status: string;
    ok: boolean;
    startedAt?: string;
    endedAt?: string;
    stdoutTail?: string;
    stderrTail?: string;
    error?: string;
    code?: number | string | null;
    signal?: string;
  }>;
  logs: {
    stdoutTail: string;
    stderrTail: string;
    combinedTail: string;
  };
  cancelRequested: boolean;
  startedAt: string;
  endedAt: string;
  updatedAt: string;
  receipt?: {
    schema: string;
    receiptId: string;
    jobId: string;
    kind: string;
    ok: boolean;
    status: string;
    summary: string;
    adapterBuildId: string;
    modelId: string;
    estimates: AdapterOperationJob["estimates"];
    readinessBefore?: AdapterTrainingReadiness | null;
    readinessAfter?: AdapterTrainingReadiness | null;
    commands: AdapterOperationJob["commands"];
    logs: AdapterOperationJob["logs"];
    startedAt: string;
    endedAt: string;
    files: AdapterOperationJob["files"];
    cacheReceipt?: Record<string, unknown> | null;
  } | null;
  files: {
    runDir: string;
    runJson: string;
    latestJson: string;
    latestKindJson: string;
    receiptJson: string;
    receiptMarkdown: string;
    latestReceiptJson: string;
    latestReceiptMarkdown: string;
    log: string;
    cacheWarmupScript: string;
  };
};

export type AdapterTrainerPreflightReceipt = {
  schema: string;
  preflightId: string;
  createdAt: string;
  ok: boolean;
  status: "ready" | "dry-run-guarded" | "dry-run-ready" | "blocked" | string;
  adapterBuildId: string;
  planId: string;
  adapterName: string;
  method: string;
  requestedMode: "train" | "dry-run" | string;
  recommendedMode: "train" | "dry-run" | string;
  summary: string;
  checks: Array<{
    id: string;
    label: string;
    status: "pass" | "warn" | "fail" | string;
    detail: string;
    actionId?: string;
    actionLabel?: string;
    blocking?: boolean;
    receiptPath?: string;
  }>;
  blockers: string[];
  warnings: string[];
  suggestedActions: Array<{
    id: string;
    label: string;
    detail: string;
    status: string;
    primary: boolean;
    workspace: string;
  }>;
  estimates: {
    disk: string;
    time: string;
    detail: string;
  };
  guard: {
    dryRunAllowed: boolean;
    realTrainingRequested: boolean;
    realTrainingAllowed: boolean;
    willRunMode: "train" | "dry-run" | string;
    reason: string;
  };
  readiness: AdapterTrainingReadiness;
  latestOperations: {
    dependencyInstall?: AdapterOperationJob | null;
    baseCacheWarmup?: AdapterOperationJob | null;
  };
  files: {
    latestJson: string;
    latestMarkdown: string;
    historyJson: string;
    historyMarkdown: string;
  };
};

export type AdapterBuilderReceipt = {
  schema: string;
  adapterBuildId: string;
  createdAt: string;
  planId: string;
  routePlanId: string;
  ok: boolean;
  status: "dry-run" | "ready" | "trained" | "blocked" | string;
  summary: string;
  aiName: string;
  trainingRoute?: {
    id: string;
    label: string;
    status: string;
    fit: string;
  } | null;
  adapter: {
    name: string;
    baseModel: string;
    transformersModelId?: string;
    method: string;
    trained: boolean;
    dryRun: boolean;
    checkpointDir: string;
    manifestPath: string;
    outputDir: string;
  };
  dataset: {
    datasetId: string;
    examples: number;
    estimatedTokens: number;
    sourceJsonl: string;
    adapterJsonl: string;
    manifest: string;
    sourceScope?: SourceScopeOption | null;
    splits: {
      train: number;
      validation: number;
    };
  };
  config: {
    schema: string;
    method: string;
    adapterName: string;
    baseModel: string;
    outputDir: string;
    checkpointDir: string;
    dataset: Record<string, unknown>;
    lora: {
      r: number;
      alpha: number;
      dropout: number;
      targetModules: string[];
    };
    trainer: {
      transformersModelId?: string;
      recommendedTransformersModelId?: string;
      transformersModelSource?: string;
      maxSteps: number;
      epochs: number;
      learningRate: number;
      microBatchSize: number;
      gradientAccumulation: number;
      cutoffLen: number;
      warmupRatio: number;
      precision: string;
      saveSteps: number;
      evalSteps: number;
    };
    hardware: Record<string, unknown>;
    guardrails: string[];
    files?: Record<string, string>;
  };
  runner: {
    executionMode: string;
    canTrainNow: boolean;
    packageStatus: AdapterPackageStatus;
    blockedReasons: string[];
    recipe: Record<string, unknown>;
    readiness?: AdapterTrainingReadiness;
    latestRunId?: string;
    latestRunStatus?: string;
    latestRunSummary?: string;
    checkpoint?: AdapterCheckpointDetection;
    promotionReceiptId?: string;
    promotedModelName?: string;
  };
  outputs: Array<{
    label: string;
    detail: string;
    path: string;
  }>;
  nextActions: Array<{
    id: string;
    label: string;
    detail: string;
    workspace: string;
  }>;
  files: {
    latestDir: string;
    historyDir: string;
    trainingDatasetJsonl: string;
    trainingDatasetManifest: string;
    trainingConfigJson: string;
    runnerScript?: string;
    runnerRecipeJson: string;
    runnerRecipeMarkdown: string;
    adapterManifestJson: string;
    receiptJson: string;
    receiptMarkdown: string;
    checkpointDir: string;
    historyTrainingDatasetJsonl: string;
    historyTrainingDatasetManifest: string;
    historyTrainingConfigJson: string;
    historyRunnerScript?: string;
    historyRunnerRecipeJson: string;
    historyRunnerRecipeMarkdown: string;
    historyAdapterManifestJson: string;
    historyReceiptJson: string;
    historyReceiptMarkdown: string;
    historyCheckpointDir: string;
    latestTrainingRunJson?: string;
    latestTrainingRunMarkdown?: string;
    latestTrainingRunLog?: string;
    latestTrainingCheckpointDir?: string;
    latestReadinessJson?: string;
    latestReadinessMarkdown?: string;
    latestPromotionReceiptJson?: string;
    latestPromotionReceiptMarkdown?: string;
    promotedModelfile?: string;
  };
};

export type AdapterCheckpointDetection = {
  schema: string;
  checkedAt: string;
  dir: string;
  detected: boolean;
  trained: boolean;
  dryRun: boolean;
  adapterModel: string;
  adapterConfig: string;
  trainingReceipt: string;
  dryRunManifest: string;
  files: string[];
  summary: string;
};

export type AdapterTrainingRun = {
  schema: string;
  runId: string;
  adapterBuildId: string;
  planId: string;
  adapterName: string;
  baseModel: string;
  method: string;
  ok: boolean;
  status: "running" | "pass" | "fail" | "canceled" | string;
  mode: "dry-run" | "train" | string;
  requestedMode: "dry-run" | "train" | string;
  canTrainNow: boolean;
  blockedReasons: string[];
  summary: string;
  command: string[];
  startedAt: string;
  endedAt: string;
  updatedAt: string;
  progress: {
    currentStep: number;
    totalSteps: number;
    label: string;
    detail: string;
    event: string;
    updatedAt: string;
  };
  checkpointDir: string;
  checkpoint: AdapterCheckpointDetection;
  readiness?: AdapterTrainingReadiness | null;
  preflight?: AdapterTrainerPreflightReceipt | null;
  receipt: {
    name: string;
    ok: boolean;
    status: string;
    command: string[];
    outputPath: string;
    summary: string;
    stdoutTail: string;
    stderrTail: string;
    error: string;
    startedAt: string;
    endedAt: string;
  };
  files: {
    runDir: string;
    runJson: string;
    latestJson: string;
    receiptMarkdown: string;
    latestReceiptMarkdown: string;
    log: string;
    trainingReceiptJson: string;
    checkpointDir: string;
  };
};

export type AdapterPromotionReceipt = {
  schema: string;
  receiptId: string;
  createdAt: string;
  adapterBuildId: string;
  trainingRunId: string;
  ok: boolean;
  status: "created" | "blocked" | "failed" | string;
  summary: string;
  adapterName: string;
  modelName: string;
  baseModel: string;
  checkpoint: AdapterCheckpointDetection;
  command: string[];
  ollama: {
    ok: boolean;
    installed: boolean;
    selectedModel: string;
    error: string;
  };
  receipt: Record<string, unknown>;
  files: {
    latestJson: string;
    latestMarkdown: string;
    historyJson: string;
    historyMarkdown: string;
    modelfile: string;
    historyModelfile: string;
  };
};

export type BuilderAiCreateReceipt = {
  schema: string;
  receiptId: string;
  createdAt: string;
  planId: string;
  appliedReceiptId: string;
  guidedTestId: string;
  ok: boolean;
  status: "created" | "updated" | "blocked" | "failed" | string;
  action: "create" | "update" | string;
  summary: string;
  aiName: string;
  route: string;
  modelName: string;
  baseModel: string;
  hardwareRecipe: BuilderHardwareRecipe;
  model: {
    modelName: string;
    baseModel: string;
    installedBefore: boolean;
    installedAfter: boolean;
    profilePath: string;
    modelfilePath: string;
    promptPath: string;
    createReceiptPath: string;
    createReceiptOk: boolean;
    createReceipt?: Receipt | null;
  };
  readiness: {
    ollamaReady: boolean;
    installed: boolean;
    canChat: boolean;
    label: string;
    detail: string;
  };
  nextActions: Array<{
    id: string;
    label: string;
    detail: string;
    workspace: string;
  }>;
  files: {
    latestJson: string;
    latestMarkdown: string;
    historyJson: string;
    historyMarkdown: string;
  };
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
    knowledgePackReady?: boolean;
    modelProfileReady: boolean;
    recipeReady: boolean;
    proofFresh: boolean;
    evalFresh: boolean;
  };
  recommendedRoute: string;
  routeLabel: string;
  routeReason: string;
  sourceScopePreview?: SourceScopePreview;
  aiProfile?: BuilderAiProfile;
  starterModelCard?: BuilderStarterModelCard;
  hardwareRecipe?: BuilderHardwareRecipe;
  trainingRoutePlan?: TrainingRoutePlan;
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
    trainingRouteJson?: string;
    trainingRouteMarkdown?: string;
    starterModelCardJson?: string;
    starterModelCardMarkdown?: string;
    versionDir: string;
    versionJson: string;
    versionMarkdown: string;
    versionTrainingRouteJson?: string;
    versionTrainingRouteMarkdown?: string;
    versionStarterModelCardJson?: string;
    versionStarterModelCardMarkdown?: string;
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

export type BuilderRunHandoff = {
  schema: string;
  createdAt: string;
  title: string;
  summary: string;
  hardwareFit: string;
  route: {
    label: string;
    reason: string;
    hardwareTier: string;
    baseModel: string;
  };
  builtArtifacts: Array<{
    label: string;
    value: string;
    detail: string;
    path: string;
    workspace: string;
  }>;
  actions: Array<{
    id: string;
    label: string;
    detail: string;
    workspace: string;
  }>;
  receipts: Record<string, string>;
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
  handoff?: BuilderRunHandoff | null;
  stages: BuilderRunStage[];
  outputs: {
    buildPlanPath: string;
    sourceInventoryPath: string;
    sourceScopeReceiptPath: string;
    modelProfilePath: string;
    proofPath: string;
    evalPath: string;
    sharePath: string;
    datasetPath: string;
    knowledgePackPath?: string;
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
  projectId?: string;
  projectName: string;
  sourceRoot: string;
  dataRoot: string;
  ollamaModels: string;
  pythonCommand: string;
  baseModel: string;
  targetModel: string;
  sourceIncludes: string;
  sourceExcludes: string;
};

export type ProjectRegistryEntry = {
  id: string;
  name: string;
  status: "active" | "archived" | string;
  active: boolean;
  sourceRoot: string;
  dataRoot: string;
  ollamaModels: string;
  pythonCommand: string;
  baseModel: string;
  targetModel: string;
  sourceIncludes: string;
  sourceExcludes: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  lastDataResetAt?: string;
  dataOnPreferredDrive: boolean;
  dataResetReady?: boolean;
  dataResetReason?: string;
  sourceRules: {
    includePatterns: string[];
    excludePatterns: string[];
    includeCount: number;
    excludeCount: number;
  };
};

export type ProjectDataReset = {
  schema: string;
  createdAt: string;
  projectId: string;
  projectName: string;
  dataRoot: string;
  summary: string;
  kept: string[];
  removed: Array<{
    name: string;
    type: string;
  }>;
  skipped: Array<{
    name: string;
    reason: string;
  }>;
  receiptPath: string;
};

export type ProjectRegistry = {
  schema: string;
  createdAt: string;
  updatedAt: string;
  activeProjectId: string;
  registryPath: string;
  recommended: {
    dataRoot: string;
    ollamaModels: string;
    preferredDrive: string;
  };
  summary: {
    total: number;
    active: number;
    archived: number;
  };
  projects: ProjectRegistryEntry[];
};

export type SetupCheck = {
  id: string;
  label: string;
  status: SetupCheckStatus;
  value: string;
  detail: string;
  fix: string;
};

export type SetupDoctorCheck = {
  id: string;
  label: string;
  status: SetupCheckStatus;
  value: string;
  detail: string;
  repairActionId?: string;
};

export type SetupDoctorAction = {
  id: string;
  label: string;
  kind: "apply-config" | "manual" | "server-action" | string;
  tone: "primary" | "warning" | "secondary" | string;
  detail: string;
  configPatch?: Partial<SetupConfig>;
  command?: string;
  busyLabel?: string;
  modelName?: string;
};

export type SetupDoctorRepair = {
  schema: string;
  actionId: string;
  modelName?: string;
  ok: boolean;
  dryRun?: boolean;
  command?: string[];
  processId?: number;
  beforeOk?: boolean;
  afterOk?: boolean;
  outputPath?: string;
  summary: string;
  error?: string;
  startedAt: string;
  endedAt: string;
  receipt?: {
    name: string;
    ok: boolean;
    status: string;
    command: string[];
    outputPath: string;
    summary: string;
    stdoutTail: string;
    stderrTail: string;
    error: string;
    startedAt: string;
    endedAt: string;
  };
};

export type SetupDoctor = {
  schema: string;
  createdAt: string;
  status: "ready" | "needs-attention" | "blocked" | string;
  title: string;
  summary: string;
  preferredDrive: string;
  recommended: {
    dataRoot: string;
    ollamaModels: string;
  };
  launch: {
    available: boolean;
    scriptPath: string;
    command: string;
  };
  hardwareSummary: {
    tier: string;
    cpu: string;
    ram: string;
    gpu: string;
    diskFree: string;
  };
  checks: SetupDoctorCheck[];
  actions: SetupDoctorAction[];
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
  doctor?: SetupDoctor;
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
  hardwareRecipe?: BuilderHardwareRecipe | null;
  appliedHardwareRecipePath?: string;
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

export type KnowledgeSnippetSource = {
  id: string;
  sourcePath: string;
  title: string;
  language: string;
  license: string;
  hashShort: string;
  chunkIndex: number;
  keywords: string[];
  textPreview: string;
  score?: number;
};

export type KnowledgePack = {
  schema: string;
  packId: string;
  status: "ready" | "empty" | string;
  createdAt: string;
  sourceRoot: string;
  dataRoot: string;
  requestedBy: string;
  sourceScope?: SourceScopeOption;
  summary: {
    totalSnippets: number;
    includedFiles: number;
    skippedFiles: number;
    totalTextBytes: number;
    estimatedTokens: number;
    estimatedSize: string;
    retrieval: string;
  };
  filters: {
    maxFiles: number;
    maxBytesPerFile: number;
    maxSnippetsPerFile: number;
    candidateLanguages: string[];
  };
  provenance: {
    proofPath: string;
    proofBuiltAt: string;
    evalPath: string;
    sourceFiles: number;
    sampledFiles: number;
    scopedFiles?: number;
    sourcesMatchProof: boolean;
    evalMatchesProof: boolean;
    licenseSignals?: LicenseSignals;
  };
  files: {
    dir: string;
    manifest: string;
    json: string;
    jsonl: string;
    readme: string;
    preview: string;
    sourceScopeReceipt?: string;
    sourceScopeJson?: string;
    versionDir?: string;
    versionManifest?: string;
    versionJson?: string;
    versionJsonl?: string;
    versionReadme?: string;
    versionPreview?: string;
    versionSourceScopeReceipt?: string;
    versionSourceScopeJson?: string;
  };
  snippetsPreview: KnowledgeSnippetSource[];
};

export type DatasetForge = {
  schema: string;
  datasetId: string;
  status: "ready" | "empty" | string;
  createdAt: string;
  sourceRoot: string;
  dataRoot: string;
  requestedBy: string;
  sourceScope?: SourceScopeOption;
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
    scopedFiles?: number;
    scopedDatasetCandidates?: number;
    sourcesMatchProof: boolean;
    evalMatchesProof: boolean;
    licenseSignals?: LicenseSignals;
  };
  splits: {
    train: number;
    validation: number;
  };
  knowledgePack?: {
    packId: string;
    status: string;
    snippets: number;
    estimatedTokens: number;
    manifest: string;
    jsonl: string;
  } | null;
  files: {
    dir: string;
    manifest: string;
    jsonl: string;
    readme: string;
    preview: string;
    sourceScopeReceipt?: string;
    sourceScopeJson?: string;
    versionDir?: string;
    versionManifest?: string;
    versionJsonl?: string;
    versionReadme?: string;
    versionPreview?: string;
    versionSourceScopeReceipt?: string;
    versionSourceScopeJson?: string;
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
    sourceScope?: SourceScopeOption | null;
    forgedExamples?: number;
    forgedTokens?: number;
    forgedPath?: string;
    knowledgePack?: {
      packId: string;
      snippets: number;
      estimatedTokens: number;
      jsonl: string;
    } | null;
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
    sourceScope?: SourceScopeOption | null;
    rows: number;
    tokens: number;
    estimatedSize: string;
    knowledgeSnippets?: number;
    knowledgeTokens?: number;
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
    knowledgePackPath?: string;
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
  sources?: KnowledgeSnippetSource[];
};

export type ChatResponse = {
  ok: boolean;
  modelName: string;
  requestedModelName?: string;
  fallbackUsed?: boolean;
  message: ChatMessage;
  retrieval?: {
    packId: string;
    queryKeywords: string[];
    sources: KnowledgeSnippetSource[];
  };
  transcriptPath: string;
};

export type ModelLibraryReceipt = {
  label: string;
  path: string;
  kind: "model" | "receipt" | "dataset" | "recipe" | "export" | "proof" | "eval" | "artifact" | string;
  exists: boolean;
};

export type ModelLibrarySource = {
  path: string;
  language: string;
  license: string;
  hashShort: string;
};

export type ModelLibraryAction = {
  id: string;
  label: string;
  kind: "builder-create" | "builder-test" | "chat" | "recipe" | string;
  workspace: string;
  detail: string;
};

export type ModelLibraryItem = {
  id: string;
  name: string;
  kind: "forged" | "base" | "recipe" | "ollama" | string;
  status: "created" | "profile" | "recipe" | "runnable" | "missing" | "ready" | "stale" | "draft" | string;
  statusLabel: string;
  modelName: string;
  baseModel: string;
  description: string;
  canChat: boolean;
  canRunPack: boolean;
  createdAt: string;
  metrics: Record<string, string | number | boolean>;
  receipts: ModelLibraryReceipt[];
  sources: ModelLibrarySource[];
  actions?: ModelLibraryAction[];
};

export type ModelLibrary = {
  schema: string;
  createdAt: string;
  summary: {
    total: number;
    created: number;
    runnable: number;
    recipes: number;
    knowledgeSnippets?: number;
    chatsReady: boolean;
    sourceFiles: number;
  };
  defaultPrompt: string;
  compare: {
    baseModel: string;
    forgedModel: string;
    canCompare: boolean;
    detail: string;
  };
  receipts: ModelLibraryReceipt[];
  items: ModelLibraryItem[];
  latestRun?: RecipePackRun | null;
  runHistory?: RecipePackRun[];
};

export type ChatCompareTurn = {
  ok: boolean;
  label: string;
  modelName: string;
  requestedModelName: string;
  fallbackUsed: boolean;
  message: ChatMessage;
  transcriptPath?: string;
  error: string;
};

export type ChatCompareResponse = {
  ok: boolean;
  schema: string;
  createdAt: string;
  prompt: string;
  base: ChatCompareTurn;
  forged: ChatCompareTurn;
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
  latestKnowledgePack?: KnowledgePack | null;
  latestRecipe?: ForgeRecipe | null;
  latestRecipeRun?: RecipePackRun | null;
  recipeRunHistory?: RecipePackRun[];
  recipeHistory?: ForgeRecipe[];
  latestBuildPlan?: BuilderPlan | null;
  latestBuilderRun?: BuilderRun | null;
  latestAppliedHardwareRecipe?: BuilderAppliedHardwareRecipe | null;
  latestGuidedBuilderTest?: BuilderGuidedTestReceipt | null;
  latestBuilderAiCreateReceipt?: BuilderAiCreateReceipt | null;
  latestTrainingRoutePlan?: TrainingRoutePlan | null;
  latestAdapterBuild?: AdapterBuilderReceipt | null;
  latestAdapterReadiness?: AdapterTrainingReadiness | null;
  latestAdapterOperationJob?: AdapterOperationJob | null;
  latestAdapterPreflight?: AdapterTrainerPreflightReceipt | null;
  latestAdapterTrainingRun?: AdapterTrainingRun | null;
  latestAdapterPromotion?: AdapterPromotionReceipt | null;
  adapterOperationHistory?: AdapterOperationJob[];
  adapterTrainingRunHistory?: AdapterTrainingRun[];
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
