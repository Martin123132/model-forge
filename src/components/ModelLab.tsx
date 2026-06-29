import { Bot, Copy, Database, Download, FileText, FolderOpen, Hammer, History, Lock, MessageSquare, Play, Send, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { datasetForgeDownloadUrl } from "../lib/api";
import { writeClipboardText } from "../lib/clipboard";
import type { ChatCompareResponse, ChatCompareTurn, ChatMessage, DatasetForge, ForgeRecipe, ModelExport, ModelLibrary, ModelLibraryItem, OllamaStatus, RecipePackRun } from "../lib/types";
import { StatusPill } from "./StatusPill";

type ModelLabProps = {
  ollama?: OllamaStatus | null;
  modelExport?: ModelExport | null;
  datasetForge?: DatasetForge | null;
  recipe?: ForgeRecipe | null;
  recipeRun?: RecipePackRun | null;
  recipeRunHistory?: RecipePackRun[];
  recipeHistory?: ForgeRecipe[];
  modelLibrary?: ModelLibrary | null;
  compareResult?: ChatCompareResponse | null;
  recipeBusy: boolean;
  datasetBusy: boolean;
  selectRecipeBusy: boolean;
  packRunBusy: boolean;
  createBusy: boolean;
  chatBusy: boolean;
  compareBusy: boolean;
  chatMessages: ChatMessage[];
  onBuildDataset: () => void;
  onBuildRecipe: () => void;
  onSelectRecipe: (recipeId: string) => void;
  onRunPack: (recipeId: string, modelName?: string) => void;
  onCancelPack: (runId: string) => void;
  onCreate: (modelName: string) => void;
  onSend: (prompt: string, modelName: string) => void;
  onCompare: (prompt: string, baseModel?: string, forgedModel?: string) => void;
};

function compactPath(path?: string) {
  if (!path) return "Not exported";
  return path.replace(/^([A-Z]:\\Users\\[^\\]+\\Documents\\)/i, "~\\Documents\\");
}

function recipeOptionLabel(recipe: ForgeRecipe) {
  const version = recipe.version?.number || 1;
  const status = recipe.status === "ready" ? "Fresh" : recipe.status === "stale" ? "Stale" : "Draft";
  const created = recipe.createdAt
    ? new Date(recipe.createdAt).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : recipe.recipeId;
  return `v${version} - ${status} - ${created}`;
}

function runnerCommandFor(recipe?: ForgeRecipe | null) {
  if (!recipe?.files.exportDir || !recipe.targetModel) return "";
  return `Set-Location -LiteralPath "${recipe.files.exportDir}"; ollama create "${recipe.targetModel}" -f ".\\ollama\\Modelfile"`;
}

function planTone(status?: string): "pass" | "warn" | "neutral" {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "ready" || normalized === "pass") return "pass";
  if (normalized === "pending" || normalized === "stale") return "warn";
  return "neutral";
}

function cleanRunOutput(part?: string) {
  const normalized = String(part || "")
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u2800-\u28ff]/g, "")
    .replace(/\r/g, "\n")
    .replace(/(?:gathering model components\s*){2,}/gi, "gathering model components\n")
    .replace(/success\s+gathering model components/gi, "success\ngathering model components")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  const seenProgress = new Set<string>();
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

function runOutputFor(run?: RecipePackRun | null) {
  return [run?.receipt?.stdoutTail, run?.receipt?.stderrTail, run?.receipt?.error]
    .map(cleanRunOutput)
    .filter(Boolean)
    .join("\n\n");
}

function runTitleFor(run?: RecipePackRun | null, busy = false) {
  if (busy || run?.status === "running") return "Running export pack";
  if (run?.status === "pass") return "Pack run passed";
  if (run?.status === "canceled") return "Pack run canceled";
  return "Pack run failed";
}

function runStamp(run: RecipePackRun) {
  const stamp = run.endedAt || run.updatedAt || run.startedAt;
  return stamp ? new Date(stamp).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "No timestamp";
}

function datasetStamp(dataset?: DatasetForge | null) {
  return dataset?.createdAt ? new Date(dataset.createdAt).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "Not built";
}

function libraryTone(item?: ModelLibraryItem | null): "pass" | "warn" | "neutral" {
  if (!item) return "neutral";
  const status = String(item.status || "").toLowerCase();
  if (["created", "runnable", "ready", "pass"].includes(status)) return "pass";
  if (["missing", "stale", "fail"].includes(status)) return "warn";
  return "neutral";
}

function libraryKindLabel(kind?: string) {
  if (kind === "forged") return "Forged AI";
  if (kind === "base") return "Base";
  if (kind === "recipe") return "Recipe";
  if (kind === "ollama") return "Ollama";
  return "AI";
}

function libraryMetric(value: unknown, fallback = "Waiting") {
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "boolean") return value ? "Yes" : "Review";
  return value ? String(value) : fallback;
}

function compareTurnTone(turn?: ChatCompareTurn | null): "pass" | "warn" | "neutral" {
  if (!turn) return "neutral";
  if (turn.ok && !turn.fallbackUsed) return "pass";
  return "warn";
}

export function ModelLab({
  ollama,
  modelExport,
  datasetForge,
  recipe,
  recipeRun,
  recipeRunHistory = [],
  recipeHistory = [],
  modelLibrary,
  compareResult,
  recipeBusy,
  datasetBusy,
  selectRecipeBusy,
  packRunBusy,
  createBusy,
  chatBusy,
  compareBusy,
  chatMessages,
  onBuildDataset,
  onBuildRecipe,
  onSelectRecipe,
  onRunPack,
  onCancelPack,
  onCreate,
  onSend,
  onCompare
}: ModelLabProps) {
  const [modelName, setModelName] = useState(modelExport?.modelName || "modelforge-local:latest");
  const [allowCreate, setAllowCreate] = useState(false);
  const [prompt, setPrompt] = useState("List the evidence you have before making claims about this workspace.");
  const [comparePrompt, setComparePrompt] = useState("");
  const [packNotice, setPackNotice] = useState("");
  const [manualPackText, setManualPackText] = useState("");
  const packNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (modelExport?.modelName) {
      setModelName(modelExport.modelName);
    }
  }, [modelExport?.modelName]);

  useEffect(() => {
    if (!comparePrompt && modelLibrary?.defaultPrompt) {
      setComparePrompt(modelLibrary.defaultPrompt);
    }
  }, [comparePrompt, modelLibrary?.defaultPrompt]);

  useEffect(() => {
    return () => {
      if (packNoticeTimerRef.current !== null) {
        window.clearTimeout(packNoticeTimerRef.current);
      }
    };
  }, []);

  const chatTarget = useMemo(
    () => (modelExport?.created ? modelExport.modelName : ollama?.selectedModel || modelName),
    [modelExport?.created, modelExport?.modelName, ollama?.selectedModel, modelName]
  );
  const libraryItems = useMemo(() => modelLibrary?.items.slice(0, 6) || [], [modelLibrary?.items]);
  const compareConfig = modelLibrary?.compare;
  const activeComparePrompt = comparePrompt;
  const compareDisabled =
    compareBusy ||
    !activeComparePrompt.trim() ||
    !compareConfig?.baseModel ||
    !compareConfig?.forgedModel ||
    !compareConfig.canCompare;
  const recipeStatus: "pass" | "warn" | "neutral" =
    recipe?.status === "ready" ? "pass" : recipe?.status === "stale" ? "warn" : "neutral";
  const recipeLabel = recipe?.status === "ready" ? "Fresh" : recipe?.status === "stale" ? "Stale" : "Draft";
  const recipeVersionLabel = recipe ? `v${recipe.version?.number || 1} - ${recipe.recipeId}` : "No recipe exported";
  const recipePackPath = recipe?.files.exportDir || recipe?.files.json;
  const runnerCommand = runnerCommandFor(recipe);
  const recipeRuns = useMemo(
    () => recipeRunHistory.filter((run) => run.recipeId === recipe?.recipeId).slice(0, 5),
    [recipe?.recipeId, recipeRunHistory]
  );
  const runnerPlans = recipe?.modelPlan?.runnerPlans || [];
  const readyRunnerPlans = runnerPlans.filter((plan) => planTone(plan.status) === "pass").length;
  const modelPlanLabel = runnerPlans.length ? `${readyRunnerPlans}/${runnerPlans.length} ready` : "No plan";
  const datasetReady = Boolean(datasetForge?.status === "ready" && datasetForge.summary.totalExamples > 0);
  const datasetFresh = Boolean(datasetForge?.provenance.sourcesMatchProof && datasetForge?.provenance.evalMatchesProof);
  const datasetStatus = datasetReady ? (datasetFresh ? "pass" : "warn") : "neutral";
  const datasetStatusLabel = datasetReady ? (datasetFresh ? "Fresh" : "Review") : "Not built";
  const datasetExampleLabel = datasetForge ? `${datasetForge.summary.totalExamples.toLocaleString()} examples` : "No dataset";
  const currentRecipeRun = recipeRun?.recipeId === recipe?.recipeId ? recipeRun : recipeRuns[0] || null;
  const currentRunStatus = packRunBusy ? "running" : currentRecipeRun?.status || "";
  const packRunState = currentRunStatus === "running" ? "running" : currentRunStatus === "pass" ? "pass" : currentRecipeRun ? "fail" : "";
  const packRunOutput = runOutputFor(currentRecipeRun);
  useEffect(() => {
    setManualPackText("");
    setPackNotice("");
  }, [recipePackPath, runnerCommand]);

  const recipeOptions = useMemo(() => {
    const byId = new Map<string, ForgeRecipe>();
    for (const item of recipe ? [recipe, ...recipeHistory] : recipeHistory) {
      byId.set(item.recipeId, item);
    }
    return Array.from(byId.values()).sort((a, b) => (b.version?.number || 0) - (a.version?.number || 0));
  }, [recipe, recipeHistory]);

  const createDisabled = createBusy || !allowCreate || !modelName.trim();
  const sendDisabled = chatBusy || !prompt.trim() || !chatTarget;
  const selectDisabled = selectRecipeBusy || recipeOptions.length < 2;
  const packRunDisabled = packRunBusy || !allowCreate || !recipe?.recipeId || !runnerCommand;
  const createStatus: "pass" | "warn" | "neutral" = modelExport?.created ? "pass" : allowCreate ? "warn" : "neutral";
  const createStatusLabel = modelExport?.created ? "Created" : allowCreate ? "Armed" : "Locked";
  const chatCountLabel = chatMessages.length ? `${chatMessages.length} message${chatMessages.length === 1 ? "" : "s"}` : "No run";
  const libraryReady = Boolean(modelLibrary?.summary.runnable);

  async function copyPackText(value: string, label: string) {
    if (!value) return;
    try {
      await writeClipboardText(value);
      setManualPackText("");
      setPackNotice(`${label} copied`);
      if (packNoticeTimerRef.current !== null) {
        window.clearTimeout(packNoticeTimerRef.current);
      }
      packNoticeTimerRef.current = window.setTimeout(() => setPackNotice(""), 1800);
    } catch {
      setManualPackText(value);
      setPackNotice(`${label} ready`);
    }
  }

  function downloadDataset() {
    if (!datasetForge) return;
    const anchor = document.createElement("a");
    anchor.href = datasetForgeDownloadUrl;
    anchor.download = `${datasetForge.datasetId}-dataset.jsonl`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }

  return (
    <section className="workbench-panel model-lab" aria-labelledby="model-lab-title">
      <div className="panel-title-row">
        <div>
          <h2 id="model-lab-title">Model Lab</h2>
          <span>{modelExport?.created ? "Created model target" : "Profile target"}</span>
        </div>
        <StatusPill status={modelExport?.created ? "pass" : "neutral"} label={modelExport?.created ? "Created" : "Gated"} />
      </div>

      <div className="model-library-section" aria-label="Your AIs">
        <div className="model-library-heading">
          <div className="model-library-title">
            <Bot size={17} />
            <div>
              <strong>Your AIs</strong>
              <span>{modelLibrary ? `${modelLibrary.summary.total} saved targets, ${modelLibrary.summary.runnable} chat-ready` : "Restoring local targets"}</span>
            </div>
          </div>
          <StatusPill status={libraryReady ? "pass" : "neutral"} label={libraryReady ? "Ready" : "Build"} />
        </div>

        <div className="model-library-summary">
          <div>
            <span>Runnable</span>
            <strong>{modelLibrary?.summary.runnable.toLocaleString() || "0"}</strong>
          </div>
          <div>
            <span>Recipes</span>
            <strong>{modelLibrary?.summary.recipes.toLocaleString() || "0"}</strong>
          </div>
          <div>
            <span>Sources</span>
            <strong>{modelLibrary?.summary.sourceFiles.toLocaleString() || "0"}</strong>
          </div>
          <div>
            <span>Receipts</span>
            <strong>{modelLibrary?.receipts.length.toLocaleString() || "0"}</strong>
          </div>
        </div>

        <div className="model-library-grid">
          {libraryItems.length ? (
            libraryItems.map((item) => (
              <article className={`model-library-card ${item.kind}`} key={item.id}>
                <div className="model-library-card-head">
                  <div>
                    <span>{libraryKindLabel(item.kind)}</span>
                    <strong title={item.name}>{item.name}</strong>
                  </div>
                  <StatusPill status={libraryTone(item)} label={item.statusLabel} />
                </div>
                <p>{item.description}</p>
                <div className="model-library-card-metrics">
                  <span>
                    <em>Chat</em>
                    <strong>{item.canChat ? "Yes" : "No"}</strong>
                  </span>
                  <span>
                    <em>Rows</em>
                    <strong>{libraryMetric(item.metrics.examples, "0")}</strong>
                  </span>
                  <span>
                    <em>Tokens</em>
                    <strong>{libraryMetric(item.metrics.tokens, "0")}</strong>
                  </span>
                </div>
                {item.receipts.length ? (
                  <div className="model-library-receipts">
                    {item.receipts.slice(0, 3).map((receipt) => (
                      <span key={`${item.id}-${receipt.label}-${receipt.path}`} title={receipt.path}>
                        <ShieldCheck size={12} />
                        <strong>{receipt.label}</strong>
                      </span>
                    ))}
                  </div>
                ) : null}
                {item.sources.length ? (
                  <div className="model-library-sources">
                    {item.sources.slice(0, 2).map((source) => (
                      <span key={`${item.id}-${source.path}`} title={`${source.path} / ${source.hashShort}`}>
                        {source.path}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <div className="empty-row model-library-empty">
              <Bot size={16} />
              <span>Build from plan to create the first local AI target.</span>
            </div>
          )}
        </div>
      </div>

      <div className="model-compare-section" aria-label="Test side by side">
        <div className="model-compare-heading">
          <div className="model-library-title">
            <MessageSquare size={17} />
            <div>
              <strong>Test side by side</strong>
              <span>{compareConfig?.detail || "Waiting for local targets"}</span>
            </div>
          </div>
          <StatusPill status={compareConfig?.canCompare ? "pass" : "neutral"} label={compareConfig?.canCompare ? "Ready" : "Needs model"} />
        </div>

        <div className="compare-target-grid">
          <div>
            <span>Base</span>
            <strong title={compareConfig?.baseModel}>{compareConfig?.baseModel || "No base model"}</strong>
          </div>
          <div>
            <span>Forged</span>
            <strong title={compareConfig?.forgedModel}>{compareConfig?.forgedModel || "No forged model"}</strong>
          </div>
        </div>

        <form
          className="compare-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!compareDisabled) {
              onCompare(activeComparePrompt.trim(), compareConfig?.baseModel, compareConfig?.forgedModel);
            }
          }}
        >
          <textarea
            value={activeComparePrompt}
            onChange={(event) => setComparePrompt(event.target.value)}
            placeholder="Ask both models the same thing..."
          />
          <button className="primary-action compact" type="submit" disabled={compareDisabled}>
            <MessageSquare size={15} />
            <span>{compareBusy ? "Testing" : "Compare"}</span>
          </button>
        </form>

        {compareResult ? (
          <div className="compare-result-grid" aria-live="polite">
            <article className={`compare-response-card ${compareTurnTone(compareResult.base)}`}>
              <div>
                <span>{compareResult.base.label}</span>
                <strong title={compareResult.base.requestedModelName}>{compareResult.base.modelName || compareResult.base.requestedModelName}</strong>
              </div>
              <StatusPill status={compareTurnTone(compareResult.base)} label={compareResult.base.fallbackUsed ? "Fallback" : compareResult.base.ok ? "Answered" : "Error"} />
              <p>{compareResult.base.ok ? compareResult.base.message.content : compareResult.base.error}</p>
            </article>
            <article className={`compare-response-card ${compareTurnTone(compareResult.forged)}`}>
              <div>
                <span>{compareResult.forged.label}</span>
                <strong title={compareResult.forged.requestedModelName}>{compareResult.forged.modelName || compareResult.forged.requestedModelName}</strong>
              </div>
              <StatusPill status={compareTurnTone(compareResult.forged)} label={compareResult.forged.fallbackUsed ? "Fallback" : compareResult.forged.ok ? "Answered" : "Error"} />
              <p>{compareResult.forged.ok ? compareResult.forged.message.content : compareResult.forged.error}</p>
            </article>
          </div>
        ) : null}
      </div>

      <div className="recipe-sheet">
        <div className="recipe-heading-row">
          <div className="recipe-title">
            <FileText size={16} />
            <div>
              <strong>Forge Recipe</strong>
              <span>{recipeVersionLabel}</span>
            </div>
          </div>
          <div className="recipe-actions">
            <StatusPill status={recipeStatus} label={recipeLabel} />
            <button className="plain-button small" type="button" onClick={onBuildRecipe} disabled={recipeBusy}>
              <FileText size={15} />
              <span>{recipeBusy ? "Building" : "Build"}</span>
            </button>
            <button
              className="plain-button small"
              type="button"
              onClick={() => recipe?.recipeId && onRunPack(recipe.recipeId, recipe.targetModel)}
              disabled={packRunDisabled}
              title={allowCreate ? "Run this export pack with Ollama" : "Enable Allow Ollama create before running this pack"}
            >
              <Play size={15} />
              <span>{packRunBusy ? "Running" : "Run Pack"}</span>
            </button>
          </div>
        </div>
        <label className="recipe-version-select">
          <span>Version</span>
          <select
            aria-label="Recipe version"
            disabled={selectDisabled}
            value={recipe?.recipeId || ""}
            onChange={(event) => onSelectRecipe(event.target.value)}
          >
            {recipeOptions.length ? (
              recipeOptions.map((option) => (
                <option key={option.recipeId} value={option.recipeId}>
                  {recipeOptionLabel(option)}
                </option>
              ))
            ) : (
              <option value="">No versions yet</option>
            )}
          </select>
        </label>
        <div className="recipe-metrics">
          <div>
            <span>Target</span>
            <strong title={recipe?.targetModel || chatTarget}>{recipe?.targetModel || chatTarget || "No model"}</strong>
          </div>
          <div>
            <span>Rows</span>
            <strong>{recipe?.dataset.rows.toLocaleString() || "Draft"}</strong>
          </div>
          <div>
            <span>Tokens</span>
            <strong>{recipe?.dataset.tokens.toLocaleString() || "Draft"}</strong>
          </div>
          <div>
            <span>Gates</span>
            <strong>{recipe?.gates.length ? `${recipe.gates.length} linked` : "Pending"}</strong>
          </div>
        </div>
        <div className="model-plan-strip" aria-label="Model-making plan">
          <div className="model-plan-heading">
            <div>
              <span>Model-making plan</span>
              <strong>{modelPlanLabel}</strong>
            </div>
            <StatusPill status={runnerPlans.length && readyRunnerPlans === runnerPlans.length ? "pass" : runnerPlans.length ? "warn" : "neutral"} label={runnerPlans.length ? "Planned" : "Draft"} />
          </div>
          <div className="model-plan-cards">
            {runnerPlans.length ? (
              runnerPlans.map((plan) => (
                <div className={`model-plan-card ${planTone(plan.status)}`} key={plan.id}>
                  <span>{plan.label}</span>
                  <strong>{plan.output}</strong>
                  <p>{plan.purpose}</p>
                </div>
              ))
            ) : (
              <div className="model-plan-card neutral">
                <span>Build recipe</span>
                <strong>Runner plan pending</strong>
                <p>Create a recipe to generate Ollama, adapter, and external-runner instructions.</p>
              </div>
            )}
          </div>
        </div>
        <div className="dataset-forge-strip" aria-label="Dataset Forge">
          <div className="dataset-forge-heading">
            <div className="dataset-forge-title">
              <Database size={16} />
              <div>
                <span>Dataset Forge</span>
                <strong>{datasetExampleLabel}</strong>
              </div>
            </div>
            <div className="dataset-forge-actions">
              <StatusPill status={datasetStatus} label={datasetStatusLabel} />
              <button className="plain-button small" type="button" onClick={onBuildDataset} disabled={datasetBusy}>
                <Database size={14} />
                <span>{datasetBusy ? "Building" : "Build JSONL"}</span>
              </button>
              <button className="plain-button small" type="button" onClick={downloadDataset} disabled={!datasetForge}>
                <Download size={14} />
                <span>Download</span>
              </button>
            </div>
          </div>
          <div className="dataset-forge-metrics">
            <div>
              <span>Tokens</span>
              <strong>{datasetForge ? datasetForge.summary.estimatedTokens.toLocaleString() : "Waiting"}</strong>
            </div>
            <div>
              <span>Size</span>
              <strong>{datasetForge?.summary.estimatedSize || "Waiting"}</strong>
            </div>
            <div>
              <span>License</span>
              <strong>{datasetForge ? `${datasetForge.summary.licenseReviewedPercent}%` : "Waiting"}</strong>
            </div>
            <div>
              <span>Scope</span>
              <strong>{datasetForge?.sourceScope ? `${datasetForge.sourceScope.includedFiles.toLocaleString()} in` : "Waiting"}</strong>
            </div>
            <div>
              <span>Built</span>
              <strong>{datasetStamp(datasetForge)}</strong>
            </div>
          </div>
          <div className="dataset-forge-path">
            <span>JSONL</span>
            <strong title={datasetForge?.files.jsonl}>{compactPath(datasetForge?.files.jsonl)}</strong>
          </div>
          <div className="dataset-preview-list">
            {datasetForge?.examplesPreview.length ? (
              datasetForge.examplesPreview.slice(0, 3).map((example) => (
                <article key={example.id}>
                  <span>{example.language}</span>
                  <strong title={example.sourcePath}>{example.sourcePath}</strong>
                  <p>{example.instruction}</p>
                </article>
              ))
            ) : (
              <div className="empty-row">
                <Database size={16} />
                <span>Build Dataset Forge to create source-grounded JSONL examples.</span>
              </div>
            )}
          </div>
        </div>
        <div className="recipe-path">
          <span>Export pack</span>
          <strong title={recipePackPath}>{compactPath(recipePackPath)}</strong>
          <details className="recipe-pack-menu">
            <summary aria-label="Export pack actions">
              <FolderOpen size={14} />
              <span>Pack</span>
            </summary>
            <div className="recipe-pack-panel">
              <button
                type="button"
                disabled={packRunDisabled}
                title={allowCreate ? "Run this export pack with Ollama" : "Enable Allow Ollama create before running this pack"}
                onClick={(event) => {
                  event.currentTarget.closest("details")?.removeAttribute("open");
                  if (recipe?.recipeId) {
                    onRunPack(recipe.recipeId, recipe.targetModel);
                  }
                }}
              >
                <Play size={14} />
                <span>{packRunBusy ? "Running pack" : "Run pack"}</span>
              </button>
              <button type="button" disabled={!runnerCommand} onClick={() => copyPackText(runnerCommand, "Command")}>
                <Copy size={14} />
                <span>Copy command</span>
              </button>
              <button type="button" disabled={!recipePackPath} onClick={() => copyPackText(recipePackPath || "", "Path")}>
                <FolderOpen size={14} />
                <span>Copy path</span>
              </button>
              {manualPackText ? (
                <textarea
                  aria-label="Manual copy value"
                  className="pack-manual-copy"
                  readOnly
                  value={manualPackText}
                  onFocus={(event) => event.currentTarget.select()}
                />
              ) : null}
            </div>
          </details>
          <em className="pack-copy-notice" aria-live="polite">
            {packNotice}
          </em>
        </div>
        {packRunState ? (
          <div className={`pack-run-card ${packRunState}`} aria-live="polite">
            <div className="pack-run-main">
              <Hammer size={14} />
              <div>
                <strong>{runTitleFor(currentRecipeRun, packRunBusy)}</strong>
                <span>{packRunBusy ? recipe?.targetModel || "Ollama create" : currentRecipeRun?.summary}</span>
              </div>
              {packRunBusy && currentRecipeRun?.runId ? (
                <button className="pack-run-cancel" type="button" onClick={() => onCancelPack(currentRecipeRun.runId || "")}>
                  <XCircle size={13} />
                  <span>Cancel</span>
                </button>
              ) : null}
            </div>
            {packRunOutput ? (
              <details className="pack-run-log">
                <summary>Log tail</summary>
                <pre>{packRunOutput}</pre>
              </details>
            ) : null}
            {recipeRuns.length > 1 ? (
              <details className="pack-run-history">
                <summary>
                  <History size={13} />
                  <span>Runs</span>
                </summary>
                <div>
                  {recipeRuns.map((run) => (
                    <span key={run.runId || `${run.recipeId}-${run.startedAt}`}>
                      <strong>{run.status}</strong>
                      <em>{runStamp(run)}</em>
                    </span>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="model-ops">
        <section className="model-op-section local-target-section" aria-labelledby="local-target-title">
          <div className="model-op-heading local-target-heading">
            <div className="model-op-title">
              <Hammer size={16} />
              <div>
                <strong id="local-target-title">Local Target</strong>
                <span>{modelName || "No target name"}</span>
              </div>
            </div>
            <StatusPill status={createStatus} label={createStatusLabel} />
          </div>
          <div className="create-model-box">
            <label>
              <span>Model name</span>
              <input value={modelName} onChange={(event) => setModelName(event.target.value)} />
            </label>
            <label className="checkbox-row">
              <input checked={allowCreate} onChange={(event) => setAllowCreate(event.target.checked)} type="checkbox" />
              <span>Allow Ollama create</span>
            </label>
            <button className="primary-action compact" type="button" onClick={() => onCreate(modelName.trim())} disabled={createDisabled}>
              <Hammer size={16} />
              <span>{createBusy ? "Creating" : "Create Model"}</span>
            </button>
          </div>
        </section>

        <section className="model-op-section smoke-prompt-section" aria-labelledby="smoke-prompt-title">
          <div className="model-op-heading smoke-prompt-heading">
            <div className="model-op-title">
              <MessageSquare size={16} />
              <div>
                <strong id="smoke-prompt-title">Smoke Prompt</strong>
                <span>{chatCountLabel}</span>
              </div>
            </div>
            <div className="chat-target">
              <Lock size={14} />
              <span>Chat target</span>
              <strong>{chatTarget || "No model"}</strong>
            </div>
          </div>

          <div className="chat-window" aria-live="polite">
            {chatMessages.length ? (
              chatMessages.map((message, index) => (
                <div className={`chat-bubble ${message.role}`} key={`${message.role}-${index}`}>
                  <span>{message.role}</span>
                  <p>{message.content}</p>
                </div>
              ))
            ) : (
              <div className="empty-row">
                <MessageSquare size={16} />
                <span>Send a local smoke prompt.</span>
              </div>
            )}
          </div>

          <form
            className="chat-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!sendDisabled) {
                onSend(prompt.trim(), chatTarget);
                setPrompt("");
              }
            }}
          >
            <input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask the forged/local model..." />
            <button className="icon-button small" type="submit" aria-label="Send chat prompt" disabled={sendDisabled}>
              <Send size={16} />
            </button>
          </form>
        </section>
      </div>
    </section>
  );
}
