import type {
  AdapterBuilderReceipt,
  AdapterDependencyInstallReceipt,
  AdapterOperationJob,
  AdapterPromotionReceipt,
  AdapterTrainingReadiness,
  AdapterTrainerFixLoopReceipt,
  AdapterTrainerPreflightReceipt,
  AdapterTrainingRun,
  BuilderAiCreateReceipt,
  BuilderAppliedHardwareRecipe,
  BuilderGuidedTestReceipt,
  BuilderPlan,
  BuilderPlanRequest,
  BuilderRun,
  ChatCompareResponse,
  ChatMessage,
  ChatResponse,
  DatasetForge,
  EvalReport,
  ExportPackSummary,
  ForgeRecipe,
  HardwareProfile,
  ModelExport,
  ModelLibrary,
  OllamaStatus,
  ProjectDataReset,
  ProjectRegistry,
  ProjectPayload,
  ProofBundle,
  RecipePackRun,
  ShareCard,
  SetupConfig,
  SetupDoctorRepair,
  SetupState,
  SourceSummary,
  ToolStatus
} from "./types";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function getProject() {
  return requestJson<ProjectPayload>("/api/project");
}

export function getSources() {
  return requestJson<SourceSummary>("/api/sources");
}

export function getLatestDatasetForge() {
  return requestJson<{ ok: boolean; dataset: DatasetForge | null }>("/api/dataset/latest");
}

export function buildDatasetForge(request?: Partial<BuilderPlanRequest>) {
  return requestJson<{ ok: boolean; dataset: DatasetForge; project: ProjectPayload }>("/api/dataset/build", {
    method: "POST",
    body: JSON.stringify({ requestedBy: "ModelForge UI", ...(request || {}) })
  });
}

export const datasetForgeDownloadUrl = "/api/dataset/download";

export function getOllamaStatus() {
  return requestJson<OllamaStatus>("/api/ollama/status");
}

export function getHardwareProfile() {
  return requestJson<HardwareProfile>("/api/hardware/profile");
}

export function getLatestBuilderPlan() {
  return requestJson<{ ok: boolean; plan: BuilderPlan | null }>("/api/builder/plan");
}

export function buildAiBuildPlan(request: BuilderPlanRequest) {
  return requestJson<{ ok: boolean; plan: BuilderPlan; project: ProjectPayload }>("/api/builder/plan", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function startBuilderRun(planId?: string, request?: BuilderPlanRequest) {
  return requestJson<{ ok: boolean; run: BuilderRun }>("/api/builder/run", {
    method: "POST",
    body: JSON.stringify({ planId, request })
  });
}

export function applyBuilderHardwareRecipe(planId?: string) {
  return requestJson<{
    ok: boolean;
    applied: BuilderAppliedHardwareRecipe;
    plan: BuilderPlan;
    modelExport: ModelExport | null;
    project: ProjectPayload;
    ollama: OllamaStatus;
  }>("/api/builder/hardware-recipe/apply", {
    method: "POST",
    body: JSON.stringify({ planId })
  });
}

export function runBuilderGuidedTest(planId?: string, prompt?: string, modelName?: string) {
  return requestJson<{
    ok: boolean;
    receipt: BuilderGuidedTestReceipt;
    applied: BuilderAppliedHardwareRecipe;
    plan: BuilderPlan;
    project: ProjectPayload;
  }>("/api/builder/guided-test/run", {
    method: "POST",
    body: JSON.stringify({ planId, prompt, modelName })
  });
}

export function createOrUpdateBuilderAi(planId?: string, modelName?: string) {
  return requestJson<{
    ok: boolean;
    receipt: BuilderAiCreateReceipt;
    applied: BuilderAppliedHardwareRecipe;
    guidedTest: BuilderGuidedTestReceipt | null;
    plan: BuilderPlan;
    modelExport: ModelExport | null;
    project: ProjectPayload;
    ollama: OllamaStatus;
  }>("/api/builder/ai/create-update", {
    method: "POST",
    body: JSON.stringify({ planId, modelName })
  });
}

export function buildBuilderAdapter(planId?: string, runTraining = false) {
  return requestJson<{
    ok: boolean;
    receipt: AdapterBuilderReceipt;
    dataset: DatasetForge;
    plan: BuilderPlan;
    project: ProjectPayload;
  }>("/api/builder/adapter/build", {
    method: "POST",
    body: JSON.stringify({ planId, runTraining, allowLongRun: false })
  });
}

export function checkAdapterTrainingReadiness(adapterBuildId?: string) {
  return requestJson<{
    ok: boolean;
    readiness: AdapterTrainingReadiness;
    project: ProjectPayload;
  }>("/api/builder/adapter/readiness/check", {
    method: "POST",
    body: JSON.stringify({ adapterBuildId })
  });
}

export function installAdapterTrainingDependencies(adapterBuildId?: string, dryRun = false) {
  return requestJson<{
    ok: boolean;
    receipt: AdapterDependencyInstallReceipt;
    readiness: AdapterTrainingReadiness;
    project: ProjectPayload;
  }>("/api/builder/adapter/readiness/install", {
    method: "POST",
    body: JSON.stringify({ adapterBuildId, dryRun })
  });
}

export function applyRecommendedAdapterBaseModel(adapterBuildId?: string, modelId?: string) {
  return requestJson<{
    ok: boolean;
    receipt: AdapterBuilderReceipt;
    readiness: AdapterTrainingReadiness;
    project: ProjectPayload;
  }>("/api/builder/adapter/readiness/apply-base-model", {
    method: "POST",
    body: JSON.stringify({ adapterBuildId, modelId })
  });
}

export function startAdapterDependencyInstallJob(adapterBuildId?: string, dryRun = false) {
  return requestJson<{
    ok: boolean;
    job: AdapterOperationJob;
    project: ProjectPayload;
  }>("/api/builder/adapter/operation/deps/start", {
    method: "POST",
    body: JSON.stringify({ adapterBuildId, dryRun })
  });
}

export function startAdapterBaseCacheWarmupJob(adapterBuildId?: string, modelId?: string, dryRun = false) {
  return requestJson<{
    ok: boolean;
    job: AdapterOperationJob;
    project: ProjectPayload;
  }>("/api/builder/adapter/operation/cache-warmup/start", {
    method: "POST",
    body: JSON.stringify({ adapterBuildId, modelId, dryRun })
  });
}

export function getAdapterOperationJob(jobId?: string) {
  const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
  return requestJson<{ ok: boolean; job: AdapterOperationJob | null }>(`/api/builder/adapter/operation/job${query}`);
}

export function getAdapterOperationJobs() {
  return requestJson<{ ok: boolean; jobs: AdapterOperationJob[] }>("/api/builder/adapter/operation/jobs");
}

export function cancelAdapterOperationJob(jobId: string) {
  return requestJson<{ ok: boolean; job: AdapterOperationJob | null }>("/api/builder/adapter/operation/cancel", {
    method: "POST",
    body: JSON.stringify({ jobId })
  });
}

export function retryAdapterOperationJob(jobId: string, adapterBuildId?: string, dryRun = false) {
  return requestJson<{
    ok: boolean;
    job: AdapterOperationJob;
    project: ProjectPayload;
  }>("/api/builder/adapter/operation/retry", {
    method: "POST",
    body: JSON.stringify({ jobId, adapterBuildId, dryRun })
  });
}

export function runAdapterTrainerPreflight(adapterBuildId?: string, runTraining = true) {
  return requestJson<{
    ok: boolean;
    preflight: AdapterTrainerPreflightReceipt;
    project: ProjectPayload;
  }>("/api/builder/adapter/training/preflight", {
    method: "POST",
    body: JSON.stringify({ adapterBuildId, runTraining, allowLongRun: runTraining })
  });
}

export function runAdapterTrainerFixLoop(adapterBuildId?: string, options?: {
  allowDependencyInstall?: boolean;
  allowCacheWarmup?: boolean;
  dryRun?: boolean;
  includeOptional?: boolean;
  startTraining?: boolean;
}) {
  return requestJson<{
    ok: boolean;
    fixLoop: AdapterTrainerFixLoopReceipt;
    project: ProjectPayload;
  }>("/api/builder/adapter/training/fix", {
    method: "POST",
    body: JSON.stringify({
      adapterBuildId,
      allowDependencyInstall: options?.allowDependencyInstall ?? true,
      allowCacheWarmup: options?.allowCacheWarmup ?? true,
      dryRun: options?.dryRun === true,
      includeOptional: options?.includeOptional === true,
      startTraining: options?.startTraining === true
    })
  });
}

export function getAdapterTrainerFixLoop(fixId?: string) {
  const query = fixId ? `?fixId=${encodeURIComponent(fixId)}` : "";
  return requestJson<{ ok: boolean; fixLoop: AdapterTrainerFixLoopReceipt | null }>(`/api/builder/adapter/training/fix${query}`);
}

export function startAdapterTrainingRun(adapterBuildId?: string, runTraining = true) {
  return requestJson<{
    ok: boolean;
    run: AdapterTrainingRun;
    project: ProjectPayload;
  }>("/api/builder/adapter/training/run", {
    method: "POST",
    body: JSON.stringify({ adapterBuildId, runTraining, allowLongRun: runTraining })
  });
}

export function getAdapterTrainingRun(runId?: string) {
  const query = runId ? `?runId=${encodeURIComponent(runId)}` : "";
  return requestJson<{ ok: boolean; run: AdapterTrainingRun | null }>(`/api/builder/adapter/training/run${query}`);
}

export function cancelAdapterTrainingRun(runId: string) {
  return requestJson<{ ok: boolean; run: AdapterTrainingRun | null }>("/api/builder/adapter/training/cancel", {
    method: "POST",
    body: JSON.stringify({ runId })
  });
}

export function promoteAdapterToOllama(adapterBuildId?: string, runId?: string, modelName?: string) {
  return requestJson<{
    ok: boolean;
    receipt: AdapterPromotionReceipt;
    adapter: AdapterBuilderReceipt | null;
    project: ProjectPayload;
    ollama: OllamaStatus;
  }>("/api/builder/adapter/promote", {
    method: "POST",
    body: JSON.stringify({ adapterBuildId, runId, modelName })
  });
}

export function getBuilderRun(runId?: string) {
  const query = runId ? `?runId=${encodeURIComponent(runId)}` : "";
  return requestJson<{ ok: boolean; run: BuilderRun | null }>(`/api/builder/run${query}`);
}

export function cancelBuilderRun(runId: string) {
  return requestJson<{ ok: boolean; run: BuilderRun | null }>("/api/builder/run/cancel", {
    method: "POST",
    body: JSON.stringify({ runId })
  });
}

export function getBuilderRunHistory() {
  return requestJson<{ ok: boolean; runs: BuilderRun[] }>("/api/builder/runs");
}

export function getToolStatus() {
  return requestJson<ToolStatus>("/api/tools/status");
}

export function getSetupState() {
  return requestJson<SetupState>("/api/setup");
}

export const diagnosticsDownloadUrl = "/api/diagnostics/download";

export function getProjectRegistry() {
  return requestJson<{ ok: boolean; registry: ProjectRegistry }>("/api/projects");
}

export function createProject(request: {
  name: string;
  sourceRoot: string;
  dataRoot?: string;
  targetModel?: string;
  baseModel?: string;
  ollamaModels?: string;
  pythonCommand?: string;
  sourceIncludes?: string;
  sourceExcludes?: string;
}) {
  return requestJson<{ ok: boolean; registry: ProjectRegistry; setup: SetupState; project: ProjectPayload }>("/api/projects", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function selectProject(projectId: string) {
  return requestJson<{ ok: boolean; registry: ProjectRegistry; setup: SetupState; project: ProjectPayload }>("/api/projects/select", {
    method: "POST",
    body: JSON.stringify({ projectId })
  });
}

export function archiveProject(projectId: string) {
  return requestJson<{ ok: boolean; registry: ProjectRegistry; setup: SetupState; project: ProjectPayload }>("/api/projects/archive", {
    method: "POST",
    body: JSON.stringify({ projectId })
  });
}

export function deleteProject(projectId: string) {
  return requestJson<{ ok: boolean; registry: ProjectRegistry; setup: SetupState; project: ProjectPayload }>("/api/projects/delete", {
    method: "POST",
    body: JSON.stringify({ projectId })
  });
}

export function resetProjectData(projectId: string) {
  return requestJson<{ ok: boolean; reset: ProjectDataReset; registry: ProjectRegistry; setup: SetupState; project: ProjectPayload }>("/api/projects/reset-data", {
    method: "POST",
    body: JSON.stringify({ projectId, confirmed: true })
  });
}

export function saveSetupConfig(config: SetupConfig) {
  return requestJson<{ ok: boolean; setup: SetupState; project: ProjectPayload }>("/api/setup/config", {
    method: "POST",
    body: JSON.stringify(config)
  });
}

export function runFirstSetup(config: SetupConfig, createModel: boolean) {
  return requestJson<{
    ok: boolean;
    setup: SetupState;
    project: ProjectPayload;
    results: {
      modelExport: ModelExport;
      proofBundle: ProofBundle;
      evalReport: EvalReport;
      shareCard: ShareCard;
      datasetForge: DatasetForge;
      recipe: ForgeRecipe;
    };
  }>("/api/setup/run", {
    method: "POST",
    body: JSON.stringify({
      config,
      baseModel: config.baseModel,
      modelName: config.targetModel,
      createModel
    })
  });
}

export function runSetupDoctorAction(actionId: string, modelName?: string) {
  return requestJson<{
    ok: boolean;
    error?: string;
    repair: SetupDoctorRepair;
    setup: SetupState;
    project: ProjectPayload;
    ollama: OllamaStatus;
  }>("/api/setup/doctor/action", {
    method: "POST",
    body: JSON.stringify({ actionId, modelName })
  });
}

export function runPipeline() {
  return requestJson<{ ok: boolean; runPath: string; project: ProjectPayload; run?: { modelProfile?: ModelExport } }>("/api/pipeline/run", {
    method: "POST",
    body: JSON.stringify({ action: "run-pipeline" })
  });
}

export function buildProofBundle() {
  return requestJson<{ ok: boolean; bundle: ProofBundle }>("/api/proof/build", {
    method: "POST",
    body: JSON.stringify({ requestedBy: "ModelForge UI" })
  });
}

export function getLatestProofBundle() {
  return requestJson<{ ok: boolean; bundle: ProofBundle | null }>("/api/proof/latest");
}

export function exportModelProfile() {
  return requestJson<{ ok: boolean; modelExport: ModelExport }>("/api/model/export", {
    method: "POST",
    body: JSON.stringify({ modelName: "modelforge-local:latest", create: false })
  });
}

export function createOllamaModel(modelName: string) {
  return requestJson<{ ok: boolean; modelExport: ModelExport; project: ProjectPayload }>("/api/model/create", {
    method: "POST",
    body: JSON.stringify({ modelName, create: true })
  });
}

export function sendChat(messages: ChatMessage[], modelName?: string) {
  return requestJson<ChatResponse>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ messages, modelName })
  });
}

export function getModelLibrary() {
  return requestJson<{ ok: boolean; library: ModelLibrary }>("/api/models/library");
}

export function compareModels(prompt: string, baseModel?: string, forgedModel?: string) {
  return requestJson<ChatCompareResponse>("/api/chat/compare", {
    method: "POST",
    body: JSON.stringify({ prompt, baseModel, forgedModel })
  });
}

export function runEvalGates() {
  return requestJson<{ ok: boolean; evalReport: EvalReport; project: ProjectPayload }>("/api/evals/run", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function getLatestEvalReport() {
  return requestJson<{ ok: boolean; evalReport: EvalReport | null }>("/api/evals/latest");
}

export function buildShareCard() {
  return requestJson<{ ok: boolean; shareCard: ShareCard; project: ProjectPayload }>("/api/share/build", {
    method: "POST",
    body: JSON.stringify({ tone: "public" })
  });
}

export function getLatestShareCard() {
  return requestJson<{ ok: boolean; shareCard: ShareCard | null }>("/api/share/latest");
}

export function buildForgeRecipe(modelName?: string, baseModel?: string) {
  return requestJson<{ ok: boolean; recipe: ForgeRecipe; project: ProjectPayload }>("/api/recipe/build", {
    method: "POST",
    body: JSON.stringify({ modelName, baseModel })
  });
}

export function getLatestForgeRecipe() {
  return requestJson<{ ok: boolean; recipe: ForgeRecipe | null }>("/api/recipe/latest");
}

export function getForgeRecipeHistory() {
  return requestJson<{ ok: boolean; recipes: ForgeRecipe[] }>("/api/recipes/history");
}

export function selectForgeRecipe(recipeId: string) {
  return requestJson<{ ok: boolean; recipe: ForgeRecipe; project: ProjectPayload }>("/api/recipe/select", {
    method: "POST",
    body: JSON.stringify({ recipeId })
  });
}

export function runRecipePack(recipeId: string, modelName?: string) {
  return requestJson<{ ok: boolean; run: RecipePackRun }>("/api/recipe/run", {
    method: "POST",
    body: JSON.stringify({ recipeId, modelName })
  });
}

export function getRecipePackRun(runId?: string) {
  const query = runId ? `?runId=${encodeURIComponent(runId)}` : "";
  return requestJson<{ ok: boolean; run: RecipePackRun | null }>(`/api/recipe/run${query}`);
}

export function cancelRecipePackRun(runId: string) {
  return requestJson<{ ok: boolean; run: RecipePackRun | null }>("/api/recipe/run/cancel", {
    method: "POST",
    body: JSON.stringify({ runId })
  });
}

export function getRecipeRunHistory() {
  return requestJson<{ ok: boolean; runs: RecipePackRun[] }>("/api/recipe/runs");
}

export function getLatestExportPack() {
  return requestJson<{ ok: boolean; pack: ExportPackSummary | null }>("/api/export/latest");
}

export const exportPackDownloadUrl = "/api/export/download";
