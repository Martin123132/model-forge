import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Database, FolderCog, HardDrive, LoaderCircle, Play, RefreshCw, Save, TerminalSquare } from "lucide-react";
import type { OllamaStatus, ProjectPayload, SetupCheck, SetupConfig, SetupState } from "../lib/types";
import { StatusPill } from "./StatusPill";

type SetupPanelProps = {
  setup: SetupState | null;
  project: ProjectPayload | null;
  ollama: OllamaStatus | null;
  saving: boolean;
  running: boolean;
  onRefresh: () => void;
  onSave: (config: SetupConfig) => void;
  onRun: (config: SetupConfig, createModel: boolean) => void;
};

function emptyConfig(): SetupConfig {
  return {
    sourceRoot: "",
    dataRoot: "",
    ollamaModels: "",
    pythonCommand: "",
    baseModel: "",
    targetModel: "modelforge-local:latest"
  };
}

function checkStatus(check?: SetupCheck) {
  const status = check?.status || "ready";
  if (status === "pass") return "pass";
  if (status === "fail" || status === "failed") return "fail";
  if (status === "warn" || status === "warning") return "warn";
  return "ready";
}

function CheckCard({ check }: { check: SetupCheck }) {
  const status = checkStatus(check);
  return (
    <article className={`setup-check-card ${status}`}>
      <CheckCircle2 size={16} />
      <div>
        <span>{check.label}</span>
        <strong>{check.value}</strong>
        <p>{check.detail}</p>
      </div>
    </article>
  );
}

export function SetupPanel({ setup, project, ollama, saving, running, onRefresh, onSave, onRun }: SetupPanelProps) {
  const [config, setConfig] = useState<SetupConfig>(emptyConfig);
  const [createModel, setCreateModel] = useState(false);

  useEffect(() => {
    if (setup?.config) {
      setConfig(setup.config);
    }
  }, [setup?.config]);

  const readiness = useMemo(() => setup?.checks || [], [setup?.checks]);
  const allReady = readiness.length > 0 && readiness.every((check) => checkStatus(check) === "pass");
  const sourceCount = setup?.summary.sources ?? project?.sources.totalFiles ?? 0;
  const proofFresh = setup?.summary.proofFresh;
  const evalFresh = setup?.summary.evalFresh;
  const recipeReady = setup?.summary.recipeReady;

  function updateConfig(key: keyof SetupConfig, value: string) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="workbench-panel setup-panel" aria-label="Project setup">
      <div className="panel-title-row setup-title-row">
        <div>
          <h2>Setup</h2>
          <span>{setup?.configured ? "Saved local project config" : "Unsaved local project config"}</span>
        </div>
        <div className="setup-title-actions">
          <button className="plain-button small" disabled={saving || running} type="button" onClick={onRefresh}>
            <RefreshCw size={14} />
            <span>Recheck</span>
          </button>
          <button className="plain-button small" disabled={saving || running} type="button" onClick={() => onSave(config)}>
            {saving ? <LoaderCircle className="spin-icon" size={14} /> : <Save size={14} />}
            <span>{saving ? "Saving" : "Save"}</span>
          </button>
        </div>
      </div>

      <div className="setup-summary-strip">
        <div>
          <FolderCog size={16} />
          <span>Sources</span>
          <strong>{sourceCount.toLocaleString()}</strong>
        </div>
        <div className={proofFresh ? "pass" : ""}>
          <HardDrive size={16} />
          <span>Proof</span>
          <strong>{proofFresh ? "Fresh" : "Needed"}</strong>
        </div>
        <div className={evalFresh ? "pass" : ""}>
          <Database size={16} />
          <span>Gates</span>
          <strong>{evalFresh ? "Fresh" : "Needed"}</strong>
        </div>
        <div className={recipeReady ? "pass" : ""}>
          <TerminalSquare size={16} />
          <span>Recipe</span>
          <strong>{recipeReady ? "Ready" : "Needed"}</strong>
        </div>
      </div>

      <div className="setup-body">
        <form className="setup-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            <span>Source folder</span>
            <input value={config.sourceRoot} onChange={(event) => updateConfig("sourceRoot", event.target.value)} />
          </label>
          <label>
            <span>Data root</span>
            <input value={config.dataRoot} onChange={(event) => updateConfig("dataRoot", event.target.value)} />
          </label>
          <label>
            <span>Ollama models</span>
            <input value={config.ollamaModels} onChange={(event) => updateConfig("ollamaModels", event.target.value)} />
          </label>
          <label>
            <span>Python command</span>
            <input value={config.pythonCommand} onChange={(event) => updateConfig("pythonCommand", event.target.value)} />
          </label>
          <label>
            <span>Base model</span>
            <select value={config.baseModel} onChange={(event) => updateConfig("baseModel", event.target.value)}>
              <option value="">Auto</option>
              {(ollama?.models || []).map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Target model</span>
            <input value={config.targetModel} onChange={(event) => updateConfig("targetModel", event.target.value)} />
          </label>
        </form>

        <div className="setup-run-card">
          <div className="setup-run-heading">
            <div>
              <span>First run</span>
              <strong>Proof, gates, share card, recipe</strong>
            </div>
            <StatusPill status={allReady ? "pass" : "warn"} label={allReady ? "Ready" : "Review"} />
          </div>
          <label className="checkbox-row">
            <input checked={createModel} type="checkbox" onChange={(event) => setCreateModel(event.target.checked)} />
            <span>Create Ollama target</span>
          </label>
          <button className="primary-action compact" disabled={running || saving} type="button" onClick={() => onRun(config, createModel)}>
            {running ? <LoaderCircle className="spin-icon" size={15} /> : <Play size={15} fill="currentColor" />}
            <span>{running ? "Running setup" : "Run first setup"}</span>
          </button>
        </div>
      </div>

      <div className="setup-check-grid">
        {readiness.map((check) => (
          <CheckCard check={check} key={check.id} />
        ))}
      </div>
    </section>
  );
}
