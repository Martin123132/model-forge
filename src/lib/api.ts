import type {
  ChatMessage,
  ChatResponse,
  EvalReport,
  ForgeRecipe,
  ModelExport,
  OllamaStatus,
  ProjectPayload,
  ProofBundle,
  RecipePackRun,
  ShareCard,
  SetupConfig,
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

export function getOllamaStatus() {
  return requestJson<OllamaStatus>("/api/ollama/status");
}

export function getToolStatus() {
  return requestJson<ToolStatus>("/api/tools/status");
}

export function getSetupState() {
  return requestJson<SetupState>("/api/setup");
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
