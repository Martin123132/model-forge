import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, FolderCog, HardDrive, LoaderCircle, Play, RefreshCw, Save, TerminalSquare, Wrench } from "lucide-react";
import type { OllamaStatus, ProjectPayload, SetupCheck, SetupConfig, SetupDoctorAction, SetupDoctorCheck, SetupState } from "../lib/types";
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

function checkStatus(check?: { status?: string }) {
  const status = check?.status || "ready";
  if (status === "pass") return "pass";
  if (status === "fail" || status === "failed") return "fail";
  if (status === "warn" || status === "warning") return "warn";
  return "ready";
}

function doctorStatusTone(status = "") {
  if (status === "ready") return "pass";
  if (status === "blocked") return "fail";
  return "warn";
}

function DoctorCheckRow({ check }: { check: SetupDoctorCheck }) {
  const status = checkStatus(check);
  return (
    <div className={`setup-doctor-check ${status}`}>
      <CheckCircle2 size={15} />
      <span>{check.label}</span>
      <strong title={check.value}>{check.value}</strong>
      <p>{check.detail}</p>
    </div>
  );
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
        {status !== "pass" && check.fix ? <em>{check.fix}</em> : null}
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
  const doctor = setup?.doctor;

  function updateConfig(key: keyof SetupConfig, value: string) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  function applyDoctorAction(action: SetupDoctorAction) {
    if (action.kind !== "apply-config" || !action.configPatch) return;
    const repairedConfig = {
      ...config,
      ...action.configPatch
    };
    setConfig(repairedConfig);
    onSave(repairedConfig);
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

      {doctor ? (
        <section className={`setup-doctor setup-doctor-${doctor.status}`} aria-labelledby="first-run-doctor-title">
          <div className="setup-doctor-heading">
            <div>
              <span>First-run Doctor</span>
              <h3 id="first-run-doctor-title">{doctor.title}</h3>
              <p>{doctor.summary}</p>
            </div>
            <StatusPill status={doctorStatusTone(doctor.status)} label={doctor.status === "ready" ? "Ready" : doctor.status === "blocked" ? "Repair" : "Review"} />
          </div>

          <div className="setup-doctor-facts" aria-label="Machine summary">
            <div>
              <span>Preferred storage</span>
              <strong>{doctor.preferredDrive}</strong>
            </div>
            <div>
              <span>Disk free</span>
              <strong>{doctor.hardwareSummary.diskFree}</strong>
            </div>
            <div>
              <span>Hardware</span>
              <strong>{doctor.hardwareSummary.tier}</strong>
            </div>
            <div>
              <span>Launcher</span>
              <strong>{doctor.launch.available ? doctor.launch.command : "Missing"}</strong>
            </div>
          </div>

          {doctor.actions.length ? (
            <div className="setup-doctor-actions" aria-label="Repair actions">
              {doctor.actions.map((action) =>
                action.kind === "apply-config" ? (
                  <button
                    className={`setup-repair-button ${action.tone === "primary" ? "primary" : ""}`}
                    disabled={saving || running}
                    key={action.id}
                    type="button"
                    onClick={() => applyDoctorAction(action)}
                  >
                    <Wrench size={14} />
                    <span>{action.label}</span>
                  </button>
                ) : (
                  <div className="setup-repair-note" key={action.id}>
                    <AlertTriangle size={14} />
                    <div>
                      <strong>{action.label}</strong>
                      <span>{action.detail}</span>
                      {action.command ? <code>{action.command}</code> : null}
                    </div>
                  </div>
                )
              )}
            </div>
          ) : null}

          <div className="setup-doctor-checks">
            {doctor.checks.map((check) => (
              <DoctorCheckRow check={check} key={check.id} />
            ))}
          </div>
        </section>
      ) : null}

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
