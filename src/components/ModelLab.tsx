import { Copy, Database, Download, FileText, FolderOpen, Hammer, History, Lock, MessageSquare, Play, Send, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { datasetForgeDownloadUrl } from "../lib/api";
import { writeClipboardText } from "../lib/clipboard";
import type { ChatMessage, DatasetForge, ForgeRecipe, ModelExport, OllamaStatus, RecipePackRun } from "../lib/types";
import { StatusPill } from "./StatusPill";

type ModelLabProps = {
  ollama?: OllamaStatus | null;
  modelExport?: ModelExport | null;
  datasetForge?: DatasetForge | null;
  recipe?: ForgeRecipe | null;
  recipeRun?: RecipePackRun | null;
  recipeRunHistory?: RecipePackRun[];
  recipeHistory?: ForgeRecipe[];
  recipeBusy: boolean;
  datasetBusy: boolean;
  selectRecipeBusy: boolean;
  packRunBusy: boolean;
  createBusy: boolean;
  chatBusy: boolean;
  chatMessages: ChatMessage[];
  onBuildDataset: () => void;
  onBuildRecipe: () => void;
  onSelectRecipe: (recipeId: string) => void;
  onRunPack: (recipeId: string, modelName?: string) => void;
  onCancelPack: (runId: string) => void;
  onCreate: (modelName: string) => void;
  onSend: (prompt: string, modelName: string) => void;
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

export function ModelLab({
  ollama,
  modelExport,
  datasetForge,
  recipe,
  recipeRun,
  recipeRunHistory = [],
  recipeHistory = [],
  recipeBusy,
  datasetBusy,
  selectRecipeBusy,
  packRunBusy,
  createBusy,
  chatBusy,
  chatMessages,
  onBuildDataset,
  onBuildRecipe,
  onSelectRecipe,
  onRunPack,
  onCancelPack,
  onCreate,
  onSend
}: ModelLabProps) {
  const [modelName, setModelName] = useState(modelExport?.modelName || "modelforge-local:latest");
  const [allowCreate, setAllowCreate] = useState(false);
  const [prompt, setPrompt] = useState("List the evidence you have before making claims about this workspace.");
  const [packNotice, setPackNotice] = useState("");
  const [manualPackText, setManualPackText] = useState("");
  const packNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (modelExport?.modelName) {
      setModelName(modelExport.modelName);
    }
  }, [modelExport?.modelName]);

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
