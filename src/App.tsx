import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bot, Database, HardDrive, LoaderCircle, RefreshCw } from "lucide-react";
import {
  buildAiBuildPlan,
  buildDatasetForge,
  buildForgeRecipe,
  buildProofBundle,
  buildShareCard,
  cancelBuilderRun,
  cancelRecipePackRun,
  compareModels,
  createOllamaModel,
  exportModelProfile,
  getBuilderRun,
  getRecipePackRun,
  getLatestExportPack,
  getHardwareProfile,
  getModelLibrary,
  getOllamaStatus,
  getProject,
  getSetupState,
  getSources,
  runFirstSetup,
  runEvalGates,
  runRecipePack,
  runPipeline,
  saveSetupConfig,
  selectForgeRecipe,
  sendChat,
  startBuilderRun
} from "./lib/api";
import type {
  BuilderPlan,
  BuilderPlanRequest,
  BuilderRun,
  ChatCompareResponse,
  ChatMessage,
  DatasetForge,
  EvalReport,
  ExportPackSummary,
  ForgeRecipe,
  HardwareProfile,
  ModelExport,
  ModelLibrary,
  OllamaStatus,
  PipelineStep,
  ProjectPayload,
  ProofBundle,
  RecipePackRun,
  ShareCard,
  SetupConfig,
  SetupState,
  SourceSummary
} from "./lib/types";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { PipelineRail } from "./components/PipelineRail";
import { SourceTable } from "./components/SourceTable";
import { Inspector } from "./components/Inspector";
import { ProofViewer } from "./components/ProofViewer";
import { ModelLab } from "./components/ModelLab";
import { ReleasePanel } from "./components/ReleasePanel";
import { SetupPanel } from "./components/SetupPanel";
import { BuilderWizard } from "./components/BuilderWizard";
import { WorkspaceTabs, type WorkspaceView } from "./components/WorkspaceTabs";
import { NextActionPanel, type NextAction } from "./components/NextActionPanel";

const fallbackPipeline: PipelineStep[] = [
  {
    id: "source-pack",
    index: 1,
    title: "Source Pack",
    description: "Connect repo or folder and collect files",
    status: "ready",
    metric: "Waiting",
    detail: "Scan source root"
  },
  {
    id: "dataset-draft",
    index: 2,
    title: "Dataset Draft",
    description: "Chunk, dedup, license scan, PII scan",
    status: "ready",
    metric: "Waiting",
    detail: "Build rows"
  },
  {
    id: "ollama-profile",
    index: 3,
    title: "Ollama Profile",
    description: "Model, system prompt, params, template",
    status: "ready",
    metric: "Waiting",
    detail: "Detect model"
  },
  {
    id: "eval-gates",
    index: 4,
    title: "Eval Gates",
    description: "Quality, safety, license, regression",
    status: "ready",
    metric: "Waiting",
    detail: "Run gates"
  },
  {
    id: "proof-bundle",
    index: 5,
    title: "Proof Bundle",
    description: "Assemble evidence bundle for distribution",
    status: "ready",
    metric: "Ready",
    detail: "Build on demand"
  }
];

type StartupPanelProps = {
  error: string;
  refreshing: boolean;
  onRetry: () => void;
};

function StartupPanel({ error, refreshing, onRetry }: StartupPanelProps) {
  const restoreItems = [
    { label: "Project state", Icon: Database },
    { label: "D-drive artifacts", Icon: HardDrive },
    { label: "Ollama status", Icon: Bot }
  ];

  return (
    <section className={`restore-panel ${error ? "is-error" : ""}`} aria-busy={!error || refreshing} aria-live="polite">
      <div className="restore-card">
        <div className="restore-mark">
          {error ? <AlertTriangle size={22} /> : <LoaderCircle className="spin-icon" size={24} />}
        </div>
        <div className="restore-copy">
          <h1>{error ? "Workspace needs attention" : "Restoring local forge"}</h1>
          <p>{error ? "The local API did not return project state." : "Reading project state before the cockpit opens."}</p>
        </div>
        <div className="restore-steps">
          {restoreItems.map(({ label, Icon }) => (
            <span key={label}>
              <Icon size={14} />
              {label}
            </span>
          ))}
        </div>
        {error ? (
          <button className="plain-button restore-retry" disabled={refreshing} type="button" onClick={onRetry}>
            <RefreshCw className={refreshing ? "spin-icon" : ""} size={14} />
            <span>{refreshing ? "Retrying" : "Retry"}</span>
          </button>
        ) : null}
      </div>
    </section>
  );
}

type GuidedActionKind = "run-pipeline" | "export-profile" | "build-dataset" | "run-eval" | "build-proof" | "open-builder" | "open-setup" | "open-sources" | "open-model" | "open-release" | "view-proof";
type GuidedAction = NextAction & {
  kind: GuidedActionKind;
};

function App() {
  const [project, setProject] = useState<ProjectPayload | null>(null);
  const [sources, setSources] = useState<SourceSummary | null>(null);
  const [ollama, setOllama] = useState<OllamaStatus | null>(null);
  const [proof, setProof] = useState<ProofBundle | null>(null);
  const [modelExport, setModelExport] = useState<ModelExport | null>(null);
  const [evalReport, setEvalReport] = useState<EvalReport | null>(null);
  const [shareCard, setShareCard] = useState<ShareCard | null>(null);
  const [datasetForge, setDatasetForge] = useState<DatasetForge | null>(null);
  const [forgeRecipe, setForgeRecipe] = useState<ForgeRecipe | null>(null);
  const [exportPack, setExportPack] = useState<ExportPackSummary | null>(null);
  const [hardwareProfile, setHardwareProfile] = useState<HardwareProfile | null>(null);
  const [buildPlan, setBuildPlan] = useState<BuilderPlan | null>(null);
  const [builderRun, setBuilderRun] = useState<BuilderRun | null>(null);
  const [builderRunHistory, setBuilderRunHistory] = useState<BuilderRun[]>([]);
  const [setupState, setSetupState] = useState<SetupState | null>(null);
  const [recipeRun, setRecipeRun] = useState<RecipePackRun | null>(null);
  const [recipeRunHistory, setRecipeRunHistory] = useState<RecipePackRun[]>([]);
  const [recipeHistory, setRecipeHistory] = useState<ForgeRecipe[]>([]);
  const [modelLibrary, setModelLibrary] = useState<ModelLibrary | null>(null);
  const [compareResult, setCompareResult] = useState<ChatCompareResponse | null>(null);
  const packRunMonitorRef = useRef<Set<string>>(new Set());
  const builderRunMonitorRef = useRef<Set<string>>(new Set());
  const focusedWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const previousWorkspaceRef = useRef<WorkspaceView | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceView>("builder");
  const [error, setError] = useState<string>("");
  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [modelBusy, setModelBusy] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [evalBusy, setEvalBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [datasetBusy, setDatasetBusy] = useState(false);
  const [recipeBusy, setRecipeBusy] = useState(false);
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupRunning, setSetupRunning] = useState(false);
  const [selectRecipeBusy, setSelectRecipeBusy] = useState(false);
  const [packRunBusy, setPackRunBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [compareBusy, setCompareBusy] = useState(false);
  const [builderBusy, setBuilderBusy] = useState(false);
  const [builderRunBusy, setBuilderRunBusy] = useState(false);
  const [hardwareBusy, setHardwareBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError("");
    setRefreshing(true);
    try {
      const [setupPayload, projectPayload, sourcePayload, ollamaPayload, exportPackPayload, hardwarePayload, modelLibraryPayload] = await Promise.all([
        getSetupState(),
        getProject(),
        getSources(),
        getOllamaStatus(),
        getLatestExportPack(),
        getHardwareProfile(),
        getModelLibrary()
      ]);
      setSetupState(setupPayload);
      setProject(projectPayload);
      setSources(sourcePayload);
      setOllama(ollamaPayload);
      setHardwareProfile(hardwarePayload);
      setBuildPlan(projectPayload.latestBuildPlan || null);
      setModelExport(projectPayload.latestModelExport || null);
      setProof(projectPayload.latestProof || null);
      setEvalReport(projectPayload.latestEval || null);
      setShareCard(projectPayload.latestShare || null);
      setDatasetForge(projectPayload.latestDataset || null);
      setForgeRecipe(projectPayload.latestRecipe || null);
      setExportPack(exportPackPayload.pack || null);
      setRecipeRun(projectPayload.latestRecipeRun || null);
      setRecipeRunHistory(projectPayload.recipeRunHistory || []);
      setRecipeHistory(projectPayload.recipeHistory || []);
      setBuilderRun(projectPayload.latestBuilderRun || null);
      setBuilderRunHistory(projectPayload.builderRunHistory || []);
      setModelLibrary(modelLibraryPayload.library);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      setBooting(false);
      setRefreshing(false);
    }
  }, []);

  const refreshModelLibrary = useCallback(async () => {
    const modelLibraryPayload = await getModelLibrary();
    setModelLibrary(modelLibraryPayload.library);
    return modelLibraryPayload.library;
  }, []);

  const handleRefreshHardware = useCallback(async () => {
    setHardwareBusy(true);
    setError("");
    try {
      setHardwareProfile(await getHardwareProfile());
    } catch (hardwareError) {
      setError(hardwareError instanceof Error ? hardwareError.message : String(hardwareError));
    } finally {
      setHardwareBusy(false);
    }
  }, []);

  const handleBuildPlan = useCallback(async (request: BuilderPlanRequest) => {
    setBuilderBusy(true);
    setError("");
    try {
      const result = await buildAiBuildPlan(request);
      setBuildPlan(result.plan);
      setHardwareProfile(result.plan.hardware);
      setProject(result.project);
      setSources(result.project.sources);
      setModelExport(result.project.latestModelExport || null);
      setProof(result.project.latestProof || null);
      setEvalReport(result.project.latestEval || null);
      setShareCard(result.project.latestShare || null);
      setDatasetForge(result.project.latestDataset || null);
      setForgeRecipe(result.project.latestRecipe || null);
      setRecipeRun(result.project.latestRecipeRun || null);
      setRecipeRunHistory(result.project.recipeRunHistory || []);
      setRecipeHistory(result.project.recipeHistory || []);
      setBuilderRun(result.project.latestBuilderRun || null);
      setBuilderRunHistory(result.project.builderRunHistory || []);
      setActiveWorkspace("builder");
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : String(planError));
    } finally {
      setBuilderBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setError("");
    try {
      const result = await runPipeline();
      setProject(result.project);
      setSources(result.project.sources);
      setModelExport(result.run?.modelProfile || result.project.latestModelExport || null);
      setProof(result.project.latestProof || null);
      setEvalReport(result.project.latestEval || null);
      setShareCard(result.project.latestShare || null);
      setDatasetForge(result.project.latestDataset || null);
      setForgeRecipe(result.project.latestRecipe || null);
      setExportPack((await getLatestExportPack()).pack || null);
      setRecipeRun(result.project.latestRecipeRun || null);
      setRecipeRunHistory(result.project.recipeRunHistory || []);
      setRecipeHistory(result.project.recipeHistory || []);
      setBuilderRun(result.project.latestBuilderRun || null);
      setBuilderRunHistory(result.project.builderRunHistory || []);
      await refreshModelLibrary();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setRunning(false);
    }
  }, [refreshModelLibrary]);

  const handleSaveSetup = useCallback(async (config: SetupConfig) => {
    setSetupSaving(true);
    setError("");
    try {
      const result = await saveSetupConfig(config);
      const [sourcePayload, ollamaPayload, exportPackPayload] = await Promise.all([getSources(), getOllamaStatus(), getLatestExportPack()]);
      setSetupState(result.setup);
      setProject(result.project);
      setSources(sourcePayload);
      setOllama(ollamaPayload);
      setModelExport(result.project.latestModelExport || null);
      setProof(result.project.latestProof || null);
      setEvalReport(result.project.latestEval || null);
      setShareCard(result.project.latestShare || null);
      setDatasetForge(result.project.latestDataset || null);
      setForgeRecipe(result.project.latestRecipe || null);
      setExportPack(exportPackPayload.pack || null);
      setRecipeRun(result.project.latestRecipeRun || null);
      setRecipeRunHistory(result.project.recipeRunHistory || []);
      setRecipeHistory(result.project.recipeHistory || []);
      setBuilderRun(result.project.latestBuilderRun || null);
      setBuilderRunHistory(result.project.builderRunHistory || []);
      await refreshModelLibrary();
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : String(setupError));
    } finally {
      setSetupSaving(false);
    }
  }, [refreshModelLibrary]);

  const handleRunFirstSetup = useCallback(async (config: SetupConfig, createModel: boolean) => {
    setSetupRunning(true);
    setError("");
    try {
      const result = await runFirstSetup(config, createModel);
      const [sourcePayload, ollamaPayload, exportPackPayload] = await Promise.all([getSources(), getOllamaStatus(), getLatestExportPack()]);
      setSetupState(result.setup);
      setProject(result.project);
      setSources(sourcePayload);
      setOllama(ollamaPayload);
      setModelExport(result.project.latestModelExport || result.results.modelExport || null);
      setProof(result.results.proofBundle || result.project.latestProof || null);
      setEvalReport(result.results.evalReport || result.project.latestEval || null);
      setShareCard(result.results.shareCard || result.project.latestShare || null);
      setDatasetForge(result.results.datasetForge || result.project.latestDataset || null);
      setForgeRecipe(result.results.recipe || result.project.latestRecipe || null);
      setExportPack(exportPackPayload.pack || null);
      setRecipeRun(result.project.latestRecipeRun || null);
      setRecipeRunHistory(result.project.recipeRunHistory || []);
      setRecipeHistory(result.project.recipeHistory || []);
      setBuilderRun(result.project.latestBuilderRun || null);
      setBuilderRunHistory(result.project.builderRunHistory || []);
      setActiveWorkspace("setup");
      await refreshModelLibrary();
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : String(setupError));
    } finally {
      setSetupRunning(false);
    }
  }, [refreshModelLibrary]);

  const handleBuildProof = useCallback(async () => {
    setProofBusy(true);
    setError("");
    try {
      const result = await buildProofBundle();
      setProof(result.bundle);
      setModelExport(result.bundle.manifest?.modelProfile || null);
      setExportPack((await getLatestExportPack()).pack || null);
      setActiveWorkspace("proof");
      await refreshModelLibrary();
    } catch (proofError) {
      setError(proofError instanceof Error ? proofError.message : String(proofError));
    } finally {
      setProofBusy(false);
    }
  }, [refreshModelLibrary]);

  const handleExportModel = useCallback(async () => {
    setModelBusy(true);
    setError("");
    try {
      const result = await exportModelProfile();
      setModelExport(result.modelExport);
      setActiveWorkspace("model");
      await refreshModelLibrary();
    } catch (modelError) {
      setError(modelError instanceof Error ? modelError.message : String(modelError));
    } finally {
      setModelBusy(false);
    }
  }, [refreshModelLibrary]);

  const handleCreateModel = useCallback(async (modelName: string) => {
    setCreateBusy(true);
    setError("");
    try {
      const result = await createOllamaModel(modelName);
      setProject(result.project);
      setSources(result.project.sources);
      setModelExport(result.modelExport);
      setEvalReport(result.project.latestEval || null);
      setShareCard(result.project.latestShare || null);
      setDatasetForge(result.project.latestDataset || null);
      setForgeRecipe(result.project.latestRecipe || null);
      setRecipeRun(result.project.latestRecipeRun || null);
      setRecipeRunHistory(result.project.recipeRunHistory || []);
      setRecipeHistory(result.project.recipeHistory || []);
      setBuilderRun(result.project.latestBuilderRun || null);
      setBuilderRunHistory(result.project.builderRunHistory || []);
      setOllama(await getOllamaStatus());
      setActiveWorkspace("model");
      await refreshModelLibrary();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setCreateBusy(false);
    }
  }, [refreshModelLibrary]);

  const handleRunEval = useCallback(async () => {
    setEvalBusy(true);
    setError("");
    try {
      const result = await runEvalGates();
      setEvalReport(result.evalReport);
      setProject(result.project);
      setSources(result.project.sources);
      setModelExport(result.project.latestModelExport || null);
      setProof(result.project.latestProof || null);
      setDatasetForge(result.project.latestDataset || null);
      setForgeRecipe(result.project.latestRecipe || null);
      setRecipeRun(result.project.latestRecipeRun || null);
      setRecipeRunHistory(result.project.recipeRunHistory || []);
      setRecipeHistory(result.project.recipeHistory || []);
      setBuilderRun(result.project.latestBuilderRun || null);
      setBuilderRunHistory(result.project.builderRunHistory || []);
      setActiveWorkspace("release");
      await refreshModelLibrary();
    } catch (evalError) {
      setError(evalError instanceof Error ? evalError.message : String(evalError));
    } finally {
      setEvalBusy(false);
    }
  }, [refreshModelLibrary]);

  const buildShareForWorkspace = useCallback(async (nextWorkspace: WorkspaceView) => {
    setShareBusy(true);
    setError("");
    try {
      const result = await buildShareCard();
      setShareCard(result.shareCard);
      setProject(result.project);
      setEvalReport(result.project.latestEval || null);
      setDatasetForge(result.project.latestDataset || null);
      setForgeRecipe(result.project.latestRecipe || null);
      setRecipeRun(result.project.latestRecipeRun || null);
      setRecipeRunHistory(result.project.recipeRunHistory || []);
      setRecipeHistory(result.project.recipeHistory || []);
      setBuilderRun(result.project.latestBuilderRun || null);
      setBuilderRunHistory(result.project.builderRunHistory || []);
      setActiveWorkspace(nextWorkspace);
      await refreshModelLibrary();
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : String(shareError));
    } finally {
      setShareBusy(false);
    }
  }, [refreshModelLibrary]);

  const handleBuildShare = useCallback(() => {
    void buildShareForWorkspace("release");
  }, [buildShareForWorkspace]);

  const handleBuildProofShare = useCallback(() => {
    void buildShareForWorkspace("proof");
  }, [buildShareForWorkspace]);

  const handleBuildDataset = useCallback(async () => {
    setDatasetBusy(true);
    setError("");
    try {
      const result = await buildDatasetForge(buildPlan?.request);
      setDatasetForge(result.dataset);
      setProject(result.project);
      setSources(result.project.sources);
      setModelExport(result.project.latestModelExport || null);
      setProof(result.project.latestProof || null);
      setEvalReport(result.project.latestEval || null);
      setShareCard(result.project.latestShare || null);
      setForgeRecipe(result.project.latestRecipe || null);
      setRecipeRun(result.project.latestRecipeRun || null);
      setRecipeRunHistory(result.project.recipeRunHistory || []);
      setRecipeHistory(result.project.recipeHistory || []);
      setBuilderRun(result.project.latestBuilderRun || null);
      setBuilderRunHistory(result.project.builderRunHistory || []);
      setActiveWorkspace("model");
      await refreshModelLibrary();
    } catch (datasetError) {
      setError(datasetError instanceof Error ? datasetError.message : String(datasetError));
    } finally {
      setDatasetBusy(false);
    }
  }, [buildPlan?.request, refreshModelLibrary]);

  const buildRecipeForWorkspace = useCallback(async (nextWorkspace: WorkspaceView) => {
    setRecipeBusy(true);
    setError("");
    try {
      const result = await buildForgeRecipe(modelExport?.modelName, modelExport?.baseModel || ollama?.selectedModel);
      const exportPackPayload = await getLatestExportPack();
      setForgeRecipe(result.recipe);
      setProject(result.project);
      setSources(result.project.sources);
      setModelExport(result.project.latestModelExport || modelExport);
      setProof(result.project.latestProof || null);
      setEvalReport(result.project.latestEval || null);
      setShareCard(result.project.latestShare || null);
      setDatasetForge(result.project.latestDataset || null);
      setRecipeRun(result.project.latestRecipeRun || null);
      setRecipeRunHistory(result.project.recipeRunHistory || []);
      setRecipeHistory(result.project.recipeHistory || []);
      setBuilderRun(result.project.latestBuilderRun || null);
      setBuilderRunHistory(result.project.builderRunHistory || []);
      setExportPack(exportPackPayload.pack || null);
      setActiveWorkspace(nextWorkspace);
      await refreshModelLibrary();
    } catch (recipeError) {
      setError(recipeError instanceof Error ? recipeError.message : String(recipeError));
    } finally {
      setRecipeBusy(false);
    }
  }, [modelExport, ollama?.selectedModel, refreshModelLibrary]);

  const handleBuildRecipe = useCallback(() => {
    void buildRecipeForWorkspace("model");
  }, [buildRecipeForWorkspace]);

  const handleBuildProofRecipe = useCallback(() => {
    void buildRecipeForWorkspace("proof");
  }, [buildRecipeForWorkspace]);

  const handleSelectRecipe = useCallback(async (recipeId: string) => {
    if (!recipeId || recipeId === forgeRecipe?.recipeId) return;
    setSelectRecipeBusy(true);
    setError("");
    try {
      const result = await selectForgeRecipe(recipeId);
      const exportPackPayload = await getLatestExportPack();
      setForgeRecipe(result.recipe);
      setProject(result.project);
      setSources(result.project.sources);
      setModelExport(result.project.latestModelExport || modelExport);
      setProof(result.project.latestProof || null);
      setEvalReport(result.project.latestEval || null);
      setShareCard(result.project.latestShare || null);
      setDatasetForge(result.project.latestDataset || null);
      setRecipeRun(result.project.latestRecipeRun || null);
      setRecipeRunHistory(result.project.recipeRunHistory || []);
      setRecipeHistory(result.project.recipeHistory || []);
      setBuilderRun(result.project.latestBuilderRun || null);
      setBuilderRunHistory(result.project.builderRunHistory || []);
      setExportPack(exportPackPayload.pack || null);
      setActiveWorkspace("model");
      await refreshModelLibrary();
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : String(selectError));
    } finally {
      setSelectRecipeBusy(false);
    }
  }, [forgeRecipe?.recipeId, modelExport, refreshModelLibrary]);

  const refreshAfterPackRun = useCallback(async (fallbackRun?: RecipePackRun | null) => {
    const [projectPayload, ollamaPayload, exportPackPayload, modelLibraryPayload] = await Promise.all([
      getProject(),
      getOllamaStatus(),
      getLatestExportPack(),
      getModelLibrary()
    ]);
    setProject(projectPayload);
    setSources(projectPayload.sources);
    setOllama(ollamaPayload);
    setModelExport(projectPayload.latestModelExport || null);
    setProof(projectPayload.latestProof || null);
    setEvalReport(projectPayload.latestEval || null);
    setShareCard(projectPayload.latestShare || null);
    setDatasetForge(projectPayload.latestDataset || null);
    setForgeRecipe(projectPayload.latestRecipe || null);
    setRecipeRun(projectPayload.latestRecipeRun || fallbackRun || null);
    setRecipeRunHistory(projectPayload.recipeRunHistory || []);
    setRecipeHistory(projectPayload.recipeHistory || []);
    setBuilderRun(projectPayload.latestBuilderRun || null);
    setBuilderRunHistory(projectPayload.builderRunHistory || []);
    setExportPack(exportPackPayload.pack || null);
    setModelLibrary(modelLibraryPayload.library);
  }, []);

  const monitorRecipePackRun = useCallback(async (runId: string) => {
    if (!runId || packRunMonitorRef.current.has(runId)) return;
    packRunMonitorRef.current.add(runId);
    try {
      for (let index = 0; index < 240; index += 1) {
        const result = await getRecipePackRun(runId);
        if (!result.run) break;
        const nextRun = result.run;
        setRecipeRun(nextRun);
        setRecipeRunHistory((history) => [nextRun, ...history.filter((run) => run.runId !== nextRun.runId)].slice(0, 8));
        if (nextRun.status !== "running") {
          setPackRunBusy(false);
          await refreshAfterPackRun(nextRun);
          break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
    } catch (pollError) {
      setError(pollError instanceof Error ? pollError.message : String(pollError));
      setPackRunBusy(false);
    } finally {
      packRunMonitorRef.current.delete(runId);
    }
  }, [refreshAfterPackRun]);

  const handleRunRecipePack = useCallback(async (recipeId: string, modelName?: string) => {
    setPackRunBusy(true);
    setError("");
    try {
      const result = await runRecipePack(recipeId, modelName);
      setRecipeRun(result.run);
      setRecipeRunHistory((history) => [result.run, ...history.filter((run) => run.runId !== result.run.runId)].slice(0, 8));
      setActiveWorkspace("model");
      if (result.run.runId) {
        void monitorRecipePackRun(result.run.runId);
      }
    } catch (packError) {
      setError(packError instanceof Error ? packError.message : String(packError));
      setPackRunBusy(false);
    }
  }, [monitorRecipePackRun]);

  const handleCancelRecipePack = useCallback(async (runId: string) => {
    if (!runId) return;
    try {
      const result = await cancelRecipePackRun(runId);
      if (result.run) {
        setRecipeRun(result.run);
        setRecipeRunHistory((history) => [result.run as RecipePackRun, ...history.filter((run) => run.runId !== result.run?.runId)].slice(0, 8));
      }
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : String(cancelError));
    }
  }, []);

  useEffect(() => {
    const runId = recipeRun?.runId;
    if (runId && recipeRun.status === "running") {
      void monitorRecipePackRun(runId);
    }
  }, [monitorRecipePackRun, recipeRun?.runId, recipeRun?.status]);

  const refreshAfterBuilderRun = useCallback(async (fallbackRun?: BuilderRun | null) => {
    const [projectPayload, ollamaPayload, exportPackPayload, hardwarePayload, modelLibraryPayload] = await Promise.all([
      getProject(),
      getOllamaStatus(),
      getLatestExportPack(),
      getHardwareProfile(),
      getModelLibrary()
    ]);
    setProject(projectPayload);
    setSources(projectPayload.sources);
    setOllama(ollamaPayload);
    setHardwareProfile(hardwarePayload);
    setBuildPlan(projectPayload.latestBuildPlan || null);
    setModelExport(projectPayload.latestModelExport || null);
    setProof(projectPayload.latestProof || null);
    setEvalReport(projectPayload.latestEval || null);
    setShareCard(projectPayload.latestShare || null);
    setDatasetForge(projectPayload.latestDataset || null);
    setForgeRecipe(projectPayload.latestRecipe || null);
    setRecipeRun(projectPayload.latestRecipeRun || null);
    setRecipeRunHistory(projectPayload.recipeRunHistory || []);
    setRecipeHistory(projectPayload.recipeHistory || []);
    setBuilderRun(projectPayload.latestBuilderRun || fallbackRun || null);
    setBuilderRunHistory(projectPayload.builderRunHistory || []);
    setExportPack(exportPackPayload.pack || null);
    setModelLibrary(modelLibraryPayload.library);
  }, []);

  const monitorBuilderRun = useCallback(async (runId: string) => {
    if (!runId || builderRunMonitorRef.current.has(runId)) return;
    builderRunMonitorRef.current.add(runId);
    try {
      for (let index = 0; index < 360; index += 1) {
        const result = await getBuilderRun(runId);
        if (!result.run) break;
        const nextRun = result.run;
        setBuilderRun(nextRun);
        setBuilderRunHistory((history) => [nextRun, ...history.filter((run) => run.runId !== nextRun.runId)].slice(0, 8));
        if (nextRun.status !== "running") {
          setBuilderRunBusy(false);
          await refreshAfterBuilderRun(nextRun);
          break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
    } catch (pollError) {
      setError(pollError instanceof Error ? pollError.message : String(pollError));
      setBuilderRunBusy(false);
    } finally {
      builderRunMonitorRef.current.delete(runId);
    }
  }, [refreshAfterBuilderRun]);

  const handleStartBuilderRun = useCallback(async () => {
    if (!buildPlan) return;
    setBuilderRunBusy(true);
    setError("");
    try {
      const result = await startBuilderRun(buildPlan.planId, buildPlan.request);
      setBuilderRun(result.run);
      setBuilderRunHistory((history) => [result.run, ...history.filter((run) => run.runId !== result.run.runId)].slice(0, 8));
      setActiveWorkspace("builder");
      if (result.run.runId) {
        void monitorBuilderRun(result.run.runId);
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
      setBuilderRunBusy(false);
    }
  }, [buildPlan, monitorBuilderRun]);

  const handleCancelBuilderRun = useCallback(async (runId: string) => {
    if (!runId) return;
    try {
      const result = await cancelBuilderRun(runId);
      if (result.run) {
        setBuilderRun(result.run);
        setBuilderRunHistory((history) => [result.run as BuilderRun, ...history.filter((run) => run.runId !== result.run?.runId)].slice(0, 8));
      }
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : String(cancelError));
    }
  }, []);

  useEffect(() => {
    const runId = builderRun?.runId;
    if (runId && builderRun.status === "running") {
      setBuilderRunBusy(true);
      void monitorBuilderRun(runId);
    }
  }, [builderRun?.runId, builderRun?.status, monitorBuilderRun]);

  const handleSendChat = useCallback(async (prompt: string, modelName: string) => {
    const nextMessages: ChatMessage[] = [...chatMessages, { role: "user", content: prompt, createdAt: new Date().toISOString() }];
    setChatMessages(nextMessages);
    setChatBusy(true);
    setError("");
    try {
      const result = await sendChat(nextMessages, modelName);
      setChatMessages([...nextMessages, result.message]);
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : String(chatError));
      setChatMessages(nextMessages);
    } finally {
      setChatBusy(false);
    }
  }, [chatMessages]);

  const handleCompareModels = useCallback(async (prompt: string, baseModel?: string, forgedModel?: string) => {
    setCompareBusy(true);
    setError("");
    try {
      const result = await compareModels(prompt, baseModel, forgedModel);
      setCompareResult(result);
      await refreshModelLibrary();
    } catch (compareError) {
      setError(compareError instanceof Error ? compareError.message : String(compareError));
    } finally {
      setCompareBusy(false);
    }
  }, [refreshModelLibrary]);

  const pipeline = useMemo(() => project?.pipeline || fallbackPipeline, [project]);
  const sourceRoot = project?.sourceRoot || "";
  const dataRoot = project?.dataRoot || "";
  const projectReady = Boolean(project);
  const restoring = !projectReady && (booting || refreshing);
  const projectName = project?.name || (restoring ? "Restoring workspace" : "Repo-Aware Local Model");

  useEffect(() => {
    if (!projectReady) return;
    const previousWorkspace = previousWorkspaceRef.current;
    previousWorkspaceRef.current = activeWorkspace;

    if (previousWorkspace === activeWorkspace) return;
    if (previousWorkspace === null && (activeWorkspace === "builder" || activeWorkspace === "sources" || activeWorkspace === "setup")) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const workspacePanel = focusedWorkspaceRef.current;
      if (!workspacePanel) return;
      const top = Math.max(0, window.scrollY + workspacePanel.getBoundingClientRect().top - 8);
      window.scrollTo({ top, behavior: "smooth" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeWorkspace, projectReady]);

  const guidedAction = useMemo<GuidedAction>(() => {
    const sourceCount = sources?.totalFiles || project?.sources.totalFiles || 0;
    const failedGate = evalReport?.gates.find((gate) => gate.status === "fail" || gate.status === "failed");
    const warningGate = evalReport?.gates.find((gate) => gate.status === "warn" || gate.status === "warning");

    if (!buildPlan) {
      return {
        kind: "open-builder",
        label: "Start here",
        title: "Describe the AI you want",
        detail: "Create a hardware-aware build plan before choosing source, dataset, recipe, or release steps.",
        actionLabel: "Open Builder",
        tone: "ready",
        busy: builderBusy
      };
    }

    if (setupState && !setupState.configured) {
      return {
        kind: "open-setup",
        label: "Start here",
        title: "Confirm local setup",
        detail: "Save the source folder, data root, Ollama model path, and first-run target before building evidence.",
        actionLabel: "Open Setup",
        tone: "ready"
      };
    }

    if (running) {
      return {
        kind: "run-pipeline",
        label: "In progress",
        title: "Pipeline is building local evidence",
        detail: "Keep this view open while the source pack, profile, gates, and proof records refresh.",
        actionLabel: "Running",
        tone: "running",
        busy: true
      };
    }

    if (builderRun?.status === "running") {
      return {
        kind: "open-builder",
        label: "Builder",
        title: "Build From Plan is running",
        detail: "Watch the source boundary, proof gates, dataset, recipe, and export stages from the Builder.",
        actionLabel: "Open Builder",
        meta: builderRun.plan?.routeLabel,
        tone: "running"
      };
    }

    if (recipeRun?.status === "running") {
      return {
        kind: "open-model",
        label: "Model Lab",
        title: "Recipe pack is running",
        detail: "Watch the Ollama create receipt and cancel the run from Model Lab if needed.",
        actionLabel: "Open Model Lab",
        meta: recipeRun.targetModel,
        tone: "running"
      };
    }

    if (!sourceCount) {
      return {
        kind: "run-pipeline",
        label: "Start here",
        title: "Scan the local source root",
        detail: "Build the source pack first so every model and proof artifact has a tracked boundary.",
        actionLabel: "Run Pipeline",
        tone: "ready"
      };
    }

    if (!modelExport) {
      return {
        kind: "export-profile",
        label: "Next best step",
        title: "Export the Ollama profile",
        detail: "Write the Modelfile, system prompt, and model profile before creating a local target.",
        actionLabel: "Export profile",
        tone: "ready",
        busy: modelBusy
      };
    }

    if (!datasetForge) {
      return {
        kind: "build-dataset",
        label: "Dataset Forge",
        title: "Build the training JSONL pack",
        detail: "Turn the source inventory into source-grounded examples before building the next export recipe.",
        actionLabel: "Build dataset",
        tone: "ready",
        busy: datasetBusy
      };
    }

    if (!modelExport.created) {
      return {
        kind: "open-model",
        label: "Local model",
        title: "Create the Ollama target",
        detail: "Review the profile, enable Ollama create, and produce the local model receipt.",
        actionLabel: "Open Model Lab",
        meta: modelExport.modelName,
        tone: "ready"
      };
    }

    if (!forgeRecipe) {
      return {
        kind: "open-model",
        label: "Export pack",
        title: "Build a reusable forge recipe",
        detail: "Create a versioned recipe so the model pack can be rerun and audited later.",
        actionLabel: "Open Model Lab",
        tone: "ready"
      };
    }

    if (!evalReport) {
      return {
        kind: "run-eval",
        label: "Release gates",
        title: "Run the local release checks",
        detail: "Generate the gate summary before deciding whether this pack is safe to share.",
        actionLabel: "Run gates",
        tone: "ready",
        busy: evalBusy
      };
    }

    if (failedGate) {
      return {
        kind: "open-release",
        label: "Needs attention",
        title: `Fix ${failedGate.label}`,
        detail: failedGate.detail || "A release gate failed and should be handled before publishing.",
        actionLabel: "Open Release",
        meta: failedGate.value,
        tone: "warning"
      };
    }

    if (warningGate) {
      return {
        kind: "open-release",
        label: "Release review",
        title: `Review ${warningGate.label}`,
        detail: warningGate.detail || "The pack is usable, but this warning should be understood before sharing.",
        actionLabel: "Open Release",
        meta: warningGate.value,
        tone: "warning"
      };
    }

    if (!proof) {
      return {
        kind: "build-proof",
        label: "Proof bundle",
        title: "Build the evidence bundle",
        detail: "Assemble model cards, source hashes, receipts, and release evidence into one local proof path.",
        actionLabel: "Build proof",
        tone: "ready",
        busy: proofBusy
      };
    }

    if (!shareCard) {
      return {
        kind: "open-release",
        label: "Share-ready",
        title: "Prepare the public proof card",
        detail: "Turn the proof bundle and gate summary into a short release note for the outside world.",
        actionLabel: "Open Release",
        tone: "success"
      };
    }

    return {
      kind: "view-proof",
      label: "Ready",
      title: "Proof bundle is ready to inspect",
      detail: "Open the proof viewer for the model card, receipts, source summary, and local evidence path.",
      actionLabel: "View Proof",
      meta: proof.size,
      tone: "success"
    };
  }, [buildPlan, builderBusy, builderRun, datasetBusy, datasetForge, evalBusy, evalReport, forgeRecipe, modelBusy, modelExport, proof, proofBusy, project?.sources.totalFiles, recipeRun, running, setupState, shareCard, sources?.totalFiles]);

  const handleGuidedAction = useCallback(() => {
    if (guidedAction.kind === "run-pipeline") {
      void handleRun();
      return;
    }
    if (guidedAction.kind === "export-profile") {
      void handleExportModel();
      return;
    }
    if (guidedAction.kind === "build-dataset") {
      void handleBuildDataset();
      return;
    }
    if (guidedAction.kind === "run-eval") {
      void handleRunEval();
      return;
    }
    if (guidedAction.kind === "build-proof") {
      void handleBuildProof();
      return;
    }
    if (guidedAction.kind === "open-builder") {
      setActiveWorkspace("builder");
      return;
    }
    if (guidedAction.kind === "open-setup") {
      setActiveWorkspace("setup");
      return;
    }
    if (guidedAction.kind === "open-sources") {
      setActiveWorkspace("sources");
      return;
    }
    if (guidedAction.kind === "open-model") {
      setActiveWorkspace("model");
      return;
    }
    if (guidedAction.kind === "open-release") {
      setActiveWorkspace("release");
      return;
    }
    setActiveWorkspace("proof");
  }, [guidedAction.kind, handleBuildDataset, handleBuildProof, handleExportModel, handleRun, handleRunEval]);

  return (
    <div className="app-shell">
      <Sidebar activeWorkspace={activeWorkspace} onNavigate={setActiveWorkspace} sourceRoot={sourceRoot} />
      <main className="main-shell">
        <TopBar
          projectName={projectName}
          ollama={ollama}
          projectReady={projectReady}
          loading={restoring}
          refreshing={refreshing}
          running={running}
          onRun={handleRun}
          onRefresh={refresh}
        />

        {error && projectReady ? (
          <div className="error-banner" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        {!projectReady ? (
          <StartupPanel error={error} refreshing={refreshing} onRetry={refresh} />
        ) : (
          <div className={`workspace-grid ${activeWorkspace === "builder" ? "workspace-grid-builder" : ""}`}>
            <div className="work-main">
              {activeWorkspace === "builder" ? null : (
                <>
                  <PipelineRail
                    steps={pipeline}
                    onOpenWorkspace={setActiveWorkspace}
                  />
                  <NextActionPanel action={guidedAction} onAction={handleGuidedAction} />
                </>
              )}
              <WorkspaceTabs
                active={activeWorkspace}
                setup={setupState}
                sources={sources || project?.sources}
                proof={proof}
                modelExport={modelExport}
                evalReport={evalReport}
                buildPlan={buildPlan}
                onNavigate={setActiveWorkspace}
              />
              <div className="focused-workspace" ref={focusedWorkspaceRef}>
                {activeWorkspace === "builder" ? (
                  <BuilderWizard
                    hardware={hardwareProfile}
                    plan={buildPlan}
                    setup={setupState}
                    sources={sources || project?.sources}
                    datasetForge={datasetForge}
                    recipe={forgeRecipe}
                    builderRun={builderRun}
                    builderRunHistory={builderRunHistory}
                    busy={builderBusy}
                    builderRunBusy={builderRunBusy || builderRun?.status === "running"}
                    hardwareBusy={hardwareBusy}
                    datasetBusy={datasetBusy}
                    recipeBusy={recipeBusy}
                    onBuildPlan={handleBuildPlan}
                    onStartBuild={handleStartBuilderRun}
                    onCancelBuild={handleCancelBuilderRun}
                    onRefreshHardware={handleRefreshHardware}
                    onNavigate={setActiveWorkspace}
                    onBuildDataset={handleBuildDataset}
                    onBuildRecipe={handleBuildRecipe}
                  />
                ) : null}
                {activeWorkspace === "setup" ? (
                  <SetupPanel
                    setup={setupState}
                    project={project}
                    ollama={ollama}
                    saving={setupSaving}
                    running={setupRunning}
                    onRefresh={refresh}
                    onSave={handleSaveSetup}
                    onRun={handleRunFirstSetup}
                  />
                ) : null}
                {activeWorkspace === "sources" ? <SourceTable sources={sources || project?.sources} onRefresh={refresh} /> : null}
                {activeWorkspace === "proof" ? (
                  <ProofViewer
                    proof={proof}
                    sources={sources || project?.sources}
                    evalReport={evalReport}
                    shareCard={shareCard}
                    recipe={forgeRecipe}
                    exportPack={exportPack}
                    modelExport={modelExport}
                    busy={proofBusy}
                    recipeBusy={recipeBusy}
                    shareBusy={shareBusy}
                    onBuild={handleBuildProof}
                    onBuildRecipe={handleBuildProofRecipe}
                    onBuildShare={handleBuildProofShare}
                  />
                ) : null}
                {activeWorkspace === "model" ? (
                  <ModelLab
                    ollama={ollama}
                    modelExport={modelExport}
                    datasetForge={datasetForge}
                    recipe={forgeRecipe}
                    recipeRun={recipeRun}
                    recipeRunHistory={recipeRunHistory}
                    recipeHistory={recipeHistory}
                    modelLibrary={modelLibrary}
                    compareResult={compareResult}
                    recipeBusy={recipeBusy}
                    datasetBusy={datasetBusy}
                    selectRecipeBusy={selectRecipeBusy}
                    packRunBusy={packRunBusy || recipeRun?.status === "running"}
                    createBusy={createBusy}
                    chatBusy={chatBusy}
                    compareBusy={compareBusy}
                    chatMessages={chatMessages}
                    onBuildDataset={handleBuildDataset}
                    onBuildRecipe={handleBuildRecipe}
                    onSelectRecipe={handleSelectRecipe}
                    onRunPack={handleRunRecipePack}
                    onCancelPack={handleCancelRecipePack}
                    onCreate={handleCreateModel}
                    onSend={handleSendChat}
                    onCompare={handleCompareModels}
                  />
                ) : null}
                {activeWorkspace === "release" ? (
                  <ReleasePanel
                    evalReport={evalReport}
                    proof={proof}
                    sources={sources || project?.sources}
                    shareCard={shareCard}
                    evalBusy={evalBusy}
                    shareBusy={shareBusy}
                    onRunEval={handleRunEval}
                    onBuildShare={handleBuildShare}
                  />
                ) : null}
              </div>
            </div>
            {activeWorkspace === "builder" ? null : (
              <Inspector
                sources={sources || project?.sources}
                ollama={ollama}
                proof={proof}
                modelExport={modelExport}
                evalReport={evalReport}
                toolStatus={project?.toolStatus}
                dataRoot={dataRoot}
                proofBusy={proofBusy}
                onOpenProof={() => setActiveWorkspace("proof")}
                onBuildProof={handleBuildProof}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
