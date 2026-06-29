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

type BuilderBlueprint = NonNullable<BuilderPlan["blueprint"]>;

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
    intent: "Build a local coding helper that can explain this repo, answer implementation questions, point to source files, and suggest safe next changes with evidence.",
    aiType: "coding-helper",
    audience: "personal",
    personality: "operator",
    privacy: "local-only",
    qualitySpeed: "balanced",
    buildMode: "auto",
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
    intent: "Build a patient tutor that turns the project docs and notes into clear lessons, practice prompts, and source-backed explanations for non-developers.",
    aiType: "learning-tutor",
    audience: "team",
    personality: "teacher",
    privacy: "local-only",
    qualitySpeed: "quality",
    buildMode: "dataset",
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
    intent: "Build a support assistant that answers common questions from approved local knowledge, refuses unsupported claims, and keeps answers concise enough for public use.",
    aiType: "support-bot",
    audience: "public",
    personality: "practical",
    privacy: "shareable",
    qualitySpeed: "balanced",
    buildMode: "portable",
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
    intent: "Build a research bot that gathers evidence from local research material, compares competing claims, and clearly separates sourced facts from open questions.",
    aiType: "research-bot",
    audience: "team",
    personality: "practical",
    privacy: "local-only",
    qualitySpeed: "quality",
    buildMode: "dataset",
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
    intent: "Build a game NPC assistant that uses local lore, rules, and character notes to answer in character while keeping world facts consistent.",
    aiType: "game-npc",
    audience: "personal",
    personality: "creative",
    privacy: "local-only",
    qualitySpeed: "balanced",
    buildMode: "dataset",
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

function optionLabel(options: Array<{ id: string; label: string }>, id?: string) {
  return options.find((option) => option.id === id)?.label || options[0]?.label || "Auto";
}

function createDraftBlueprint({
  templateId,
  aiType,
  audience,
  personality,
  privacy,
  buildMode,
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
    route: buildMode === "auto" ? "ModelForge will choose the practical route." : `Preferred route: ${optionLabel(purposeOptions, buildMode)}.`,
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
    saved.intent === current.intent &&
    saved.templateId === current.templateId &&
    saved.aiType === current.aiType &&
    saved.audience === current.audience &&
    saved.personality === current.personality &&
    saved.privacy === current.privacy &&
    saved.qualitySpeed === current.qualitySpeed &&
    saved.buildMode === current.buildMode &&
    saved.targetDevice === current.targetDevice &&
    saved.knowledgeSource === current.knowledgeSource &&
    saved.sourceScope === current.sourceScope &&
    saved.boundaryMode === current.boundaryMode &&
    sameStringList(saved.dataTypes, current.dataTypes)
  );
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
  const [templateId, setTemplateId] = useState(plan?.request.templateId || "custom");
  const [aiType, setAiType] = useState(plan?.request.aiType || "coding-helper");
  const [audience, setAudience] = useState(plan?.request.audience || "personal");
  const [personality, setPersonality] = useState(plan?.request.personality || "practical");
  const [buildMode, setBuildMode] = useState(plan?.request.buildMode || "auto");
  const [privacy, setPrivacy] = useState(plan?.request.privacy || "local-only");
  const [qualitySpeed, setQualitySpeed] = useState(plan?.request.qualitySpeed || "balanced");
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
  const sourceCount = sources?.totalFiles || 0;
  const currentRequest = useMemo<BuilderPlanRequest>(
    () => ({
      intent,
      templateId,
      aiType,
      audience,
      personality,
      privacy,
      qualitySpeed,
      buildMode,
      targetDevice,
      knowledgeSource,
      sourceScope,
      boundaryMode,
      dataTypes
    }),
    [aiType, audience, boundaryMode, buildMode, dataTypes, intent, knowledgeSource, personality, privacy, qualitySpeed, sourceScope, targetDevice, templateId]
  );
  const planMatchesForm = requestMatchesPlan(plan?.request, currentRequest);
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
        targetDevice,
        knowledgeSource,
        sourceScope,
        boundaryMode,
        hardware,
        sourceCount
      }),
    [aiType, audience, boundaryMode, buildMode, hardware, knowledgeSource, personality, plan?.blueprint, planMatchesForm, privacy, sourceCount, sourceScope, targetDevice, templateId]
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
        { label: "Dataset", path: activeRun.outputs.datasetPath },
        { label: "Recipe", path: activeRun.outputs.recipePath },
        { label: "Pack receipt", path: activeRun.outputs.packRunReceiptPath },
        { label: "Run receipt", path: activeRun.files.receipt }
      ].filter((row) => row.path)
    : [];
  const pastRuns = builderRunHistory.filter((run) => run.runId !== activeRun?.runId).slice(0, 4);
  const checklistItems = blueprint.firstRunChecklist || [];

  function applyTemplate(template: (typeof templateOptions)[number]) {
    setTemplateId(template.id);
    setIntent(template.intent);
    setAiType(template.aiType);
    setAudience(template.audience);
    setPersonality(template.personality);
    setPrivacy(template.privacy);
    setQualitySpeed(template.qualitySpeed);
    setBuildMode(template.buildMode);
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
            <button className="primary-action compact" type="button" onClick={onStartBuild} disabled={!plan || !planMatchesForm || builderRunBusy}>
              {builderRunBusy ? <LoaderCircle className="spin-icon" size={15} /> : <Rocket size={15} />}
              <span>{builderRunBusy ? "Starting" : plan && !planMatchesForm ? "Plan Changed" : "Start Build"}</span>
            </button>
          )}
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
              {sourceScopeOptions.map((option) => (
                <button
                  aria-pressed={sourceScope === option.id}
                  className={sourceScope === option.id ? "is-selected" : ""}
                  data-source-scope-id={option.id}
                  key={option.id}
                  type="button"
                  onClick={() => setSourceScope(option.id)}
                >
                  <strong>{option.label}</strong>
                  <small>{option.detail}</small>
                </button>
              ))}
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
