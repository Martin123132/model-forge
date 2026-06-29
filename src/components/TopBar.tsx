import { Bot, Play, RefreshCw, TerminalSquare } from "lucide-react";
import type { OllamaStatus } from "../lib/types";

type TopBarProps = {
  projectName: string;
  ollama?: OllamaStatus | null;
  projectReady: boolean;
  loading: boolean;
  refreshing: boolean;
  running: boolean;
  onRun: () => void;
  onRefresh: () => void;
};

export function TopBar({ projectName, ollama, projectReady, loading, refreshing, running, onRun, onRefresh }: TopBarProps) {
  const selectedModel = loading ? "Checking" : ollama?.selectedModel || "No model";
  const ollamaLabel = loading ? "Checking" : ollama?.ok ? "Running" : "Unavailable";
  const dotClass = loading ? "idle" : ollama?.ok ? "good" : "bad";
  const runLabel = loading || !projectReady ? "Waiting" : running ? "Running" : "Run Pipeline";
  const shortRunLabel = loading || !projectReady ? "Wait" : running ? "Run" : "Run";

  return (
    <header className="topbar">
      <div className="project-select" aria-label="Current project">
        <TerminalSquare size={18} />
        <span>{projectName}</span>
      </div>

      <div className="topbar-spacer" />

      <div className="ollama-card" title={ollama?.modelsRoot || "OLLAMA_MODELS not set"}>
        <Bot size={19} />
        <div>
          <div className="topbar-label">Ollama</div>
          <div className="topbar-value">
            <span className={`mini-dot ${dotClass}`} />
            {ollamaLabel}
          </div>
        </div>
      </div>

      <div className="model-card" title={selectedModel}>
        <span>{selectedModel}</span>
      </div>

      <button className="primary-action" disabled={running || loading || !projectReady} type="button" onClick={onRun}>
        <Play size={16} fill="currentColor" />
        <span className="primary-action-full">{runLabel}</span>
        <span className="primary-action-short">{shortRunLabel}</span>
      </button>

      <button className="icon-button" type="button" aria-label="Refresh" disabled={refreshing} onClick={onRefresh}>
        <RefreshCw className={refreshing ? "spin-icon" : ""} size={16} />
      </button>

      <div className="avatar">D</div>
    </header>
  );
}
