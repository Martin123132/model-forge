import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  CircleStop,
  Clock3,
  Cpu,
  Database,
  FileText,
  Gauge,
  HardDrive,
  ListChecks,
  LoaderCircle,
  PackageCheck,
  Play,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Wand2
} from "lucide-react";
import { useMemo, useState } from "react";
import type { BuilderPlan, BuilderPlanRequest, BuilderRun, DatasetForge, ForgeRecipe, HardwareProfile, SetupState, SourceSummary } from "../lib/types";
import { StatusPill } from "./StatusPill";
import type { WorkspaceView } from "./WorkspaceTabs";

type BuilderWizardProps = {
  hardware?: HardwareProfile | null;
  plan?: BuilderPlan | null;
  setup?: SetupState | null;
  sources?: SourceSummary | null;
  datasetForge?: DatasetForge | null;
  recipe?: ForgeRecipe | null;
  builderRun?: BuilderRun | null;
  builderRunHistory?: BuilderRun[];
  busy: boolean;
  builderRunBusy: boolean;
  hardwareBusy: boolean;
  datasetBusy: boolean;
  recipeBusy: boolean;
  onBuildPlan: (request: BuilderPlanRequest) => void;
  onStartBuild: () => void;
  onCancelBuild: (runId: string) => void;
  onRefreshHardware: () => void;
  onNavigate: (view: WorkspaceView) => void;
  onBuildDataset: () => void;
  onBuildRecipe: () => void;
};

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

function formatStamp(value?: string) {
  return value ? new Date(value).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "No plan yet";
}

function compactPath(path?: string) {
  if (!path) return "Not set";
  return path.replace(/^([A-Z]:\\Users\\[^\\]+\\Documents\\)/i, "~\\Documents\\");
}

export function BuilderWizard({
  hardware,
  plan,
  setup,
  sources,
  datasetForge,
  recipe,
  builderRun,
  builderRunHistory = [],
  busy,
  builderRunBusy,
  hardwareBusy,
  datasetBusy,
  recipeBusy,
  onBuildPlan,
  onStartBuild,
  onCancelBuild,
  onRefreshHardware,
  onNavigate,
  onBuildDataset,
  onBuildRecipe
}: BuilderWizardProps) {
  const [intent, setIntent] = useState(
    plan?.request.intent || "Build a practical local AI assistant that understands this project and can answer with source-backed evidence."
  );
  const [audience, setAudience] = useState(plan?.request.audience || "personal");
  const [personality, setPersonality] = useState(plan?.request.personality || "practical");
  const [buildMode, setBuildMode] = useState(plan?.request.buildMode || "auto");
  const [privacy, setPrivacy] = useState(plan?.request.privacy || "local-only");
  const [qualitySpeed, setQualitySpeed] = useState(plan?.request.qualitySpeed || "balanced");
  const [targetDevice, setTargetDevice] = useState(plan?.request.targetDevice || "this machine");
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

  function toggleDataType(id: string) {
    setDataTypes((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function submitPlan() {
    onBuildPlan({
      intent,
      audience,
      personality,
      privacy,
      qualitySpeed,
      buildMode,
      targetDevice,
      dataTypes
    });
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
          <button className="primary-action compact" type="button" onClick={submitPlan} disabled={busy || !intent.trim()}>
            {busy ? <LoaderCircle className="spin-icon" size={15} /> : <Wand2 size={15} />}
            <span>{busy ? "Creating" : "Create Build Plan"}</span>
          </button>
          {runIsActive && activeRun ? (
            <button className="danger-action compact" type="button" onClick={() => onCancelBuild(activeRun.runId)}>
              <CircleStop size={15} />
              <span>Cancel Build</span>
            </button>
          ) : (
            <button className="primary-action compact" type="button" onClick={onStartBuild} disabled={!plan || builderRunBusy}>
              {builderRunBusy ? <LoaderCircle className="spin-icon" size={15} /> : <Rocket size={15} />}
              <span>{builderRunBusy ? "Starting" : "Start Build"}</span>
            </button>
          )}
        </div>
      </div>

      <div className="builder-layout">
        <form className="builder-form" onSubmit={(event) => event.preventDefault()}>
          <label className="builder-field builder-field-wide">
            <span>What should this AI do?</span>
            <textarea aria-label="What should this AI do?" value={intent} onChange={(event) => setIntent(event.target.value)} rows={5} />
          </label>

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
                <span>{formatStamp(plan?.createdAt)}</span>
                <h2>{plan?.routeLabel || "No build plan yet"}</h2>
              </div>
              <StatusPill status={plan ? "pass" : "neutral"} label={plan ? "Planned" : "Draft"} />
            </div>
            <p>{plan?.routeReason || "Create a plan to see the best route this machine can honestly support."}</p>
            <dl className="builder-estimates">
              <div>
                <dt>Hardware tier</dt>
                <dd>{plan?.estimates.hardwareTier || hardware?.tier.label || "Checking"}</dd>
              </div>
              <div>
                <dt>Base model</dt>
                <dd>{plan?.baseModelRecommendation.model || hardware?.ollama.selectedModel || "Not selected"}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>{plan?.estimates.time || "Plan required"}</dd>
              </div>
              <div>
                <dt>Disk</dt>
                <dd>{plan?.estimates.disk || hardware?.disk.free || "Checking"}</dd>
              </div>
            </dl>
          </div>

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
                {activeRun.files?.receipt ? (
                  <div className="builder-path-note" title={activeRun.files.receipt}>
                    {compactPath(activeRun.files.receipt)}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

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
