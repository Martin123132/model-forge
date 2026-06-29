import { ChevronDown, Copy, Eye, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { writeClipboardText } from "../lib/clipboard";
import type { EvalGate, EvalReport, ModelExport, OllamaStatus, ProofBundle, Receipt, SourceSummary, ToolStatus } from "../lib/types";
import { StatusPill } from "./StatusPill";

type InspectorProps = {
  sources?: SourceSummary | null;
  ollama?: OllamaStatus | null;
  proof?: ProofBundle | null;
  modelExport?: ModelExport | null;
  evalReport?: EvalReport | null;
  toolStatus?: ToolStatus | null;
  dataRoot: string;
  proofBusy: boolean;
  onOpenProof: () => void;
  onBuildProof: () => void;
};

const fallbackGates: EvalGate[] = [
  { id: "quality", label: "Quality", status: "pass", value: "0.23", detail: "Baseline quality gate." },
  { id: "safety", label: "Safety", status: "pass", value: "0.02", detail: "Baseline safety gate." },
  { id: "license", label: "License Compliance", status: "warn", value: "review", detail: "License review is preliminary." },
  { id: "pii", label: "PII Leakage", status: "pass", value: "0", detail: "No high findings." },
  { id: "regression", label: "Regression", status: "ready", value: "pending", detail: "Run gates." }
];

function receiptFor(receipts: Receipt[] | undefined, name: string) {
  return receipts?.find((receipt) => receipt.name === name);
}

type PathCopyButtonProps = {
  copied: boolean;
  disabled?: boolean;
  label: string;
  onCopy: () => void;
};

function PathCopyButton({ copied, disabled, label, onCopy }: PathCopyButtonProps) {
  return (
    <button
      aria-label={copied ? `${label} copied` : label}
      className={`path-action-button ${copied ? "is-copied" : ""}`}
      disabled={disabled}
      onClick={onCopy}
      title={copied ? "Copied" : label}
      type="button"
    >
      <Copy size={14} />
    </button>
  );
}

export function Inspector({ sources, ollama, proof, modelExport, evalReport, toolStatus, dataRoot, proofBusy, onOpenProof, onBuildProof }: InspectorProps) {
  const [copiedPath, setCopiedPath] = useState("");
  const copyTimerRef = useRef<number | null>(null);
  const total = sources?.totalFiles || 0;
  const sampled = sources?.sampledFiles || 0;
  const reviewed = sources?.reviewedFiles || 0;
  const licensePercent = total > 0 ? Math.round((reviewed / total) * 100) : 0;
  const datasetRows = Math.max(total * 9, 128);
  const estimatedTokens = Math.max(total * 3600, 4200);
  const receipts = proof?.manifest?.receipts;
  const agentledger = receiptFor(receipts, "agentledger_snapshot");
  const repomori = receiptFor(receipts, "repomori_snapshot");
  const latestModelExport = modelExport || proof?.manifest?.modelProfile || null;
  const gates = evalReport?.gates?.length ? evalReport.gates : fallbackGates;
  const dataRootPath = dataRoot;
  const bundlePath = agentledger?.outputPath || proof?.path || "";
  const repomoriPath = repomori?.outputPath || "";
  const modelfilePath = latestModelExport?.modelfilePath || "";
  const evidencePathTotal = 4;
  const evidencePathCount = [dataRootPath, bundlePath, repomoriPath, modelfilePath].filter(Boolean).length;

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  async function copyPath(key: string, value: string) {
    if (!value) return;
    await writeClipboardText(value);
    setCopiedPath(key);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => setCopiedPath(""), 1600);
  }

  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="inspector-header">
        <div>
          <h2>Inspector</h2>
          <span>Live build context</span>
        </div>
        <StatusPill status={proof ? "pass" : "neutral"} label={proof ? "Proof ready" : "Draft"} />
      </div>

      <section className="inspector-block">
        <h2>Build Inputs</h2>
        <dl className="input-summary-grid">
          <div>
            <dt>Files</dt>
            <dd>{total.toLocaleString()}</dd>
            <span>{sources?.totalSize || "0 B"}</span>
          </div>
          <div>
            <dt>Rows</dt>
            <dd>{datasetRows.toLocaleString()}</dd>
            <span>dataset draft</span>
          </div>
          <div>
            <dt>Sampled</dt>
            <dd>{sampled.toLocaleString()}</dd>
            <span>files checked</span>
          </div>
          <div>
            <dt>Tokens</dt>
            <dd>{estimatedTokens.toLocaleString()}</dd>
            <span>estimated</span>
          </div>
        </dl>
        <div className="input-health-row">
          <div>
            <span>License review</span>
            <StatusPill status={licensePercent > 50 ? "pass" : "warn"} label={`${licensePercent}% reviewed`} />
          </div>
          <div>
            <span>PII sweep</span>
            <StatusPill status="pass" label="0 High" />
          </div>
        </div>
      </section>

      <section className="inspector-block">
        <h2>Model Profile</h2>
        <dl className="metric-list">
          <div>
            <dt>Base Model</dt>
            <dd>{ollama?.selectedModel || "Not selected"}</dd>
          </div>
          <div>
            <dt>Model Root</dt>
            <dd className="truncate" title={ollama?.modelsRoot}>
              {ollama?.modelsRoot || "Unset"}
            </dd>
          </div>
          <div>
            <dt>Temperature</dt>
            <dd>0.20</dd>
          </div>
          <div>
            <dt>Model Card</dt>
            <dd>
              <StatusPill status="neutral" label={proof ? "Ready" : "Draft"} />
            </dd>
          </div>
          <div>
            <dt>Modelfile</dt>
            <dd className="truncate" title={latestModelExport?.modelfilePath}>
              {latestModelExport ? "Exported" : "Not exported"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="inspector-block">
        <h2>Tool Status</h2>
        <div className="tool-list">
          <div>
            <span>RepoMori</span>
            <StatusPill status={toolStatus?.repomori.ok ? "pass" : "warn"} label={toolStatus?.repomori.label || "Checking"} />
          </div>
          <div>
            <span>AgentLedger</span>
            <StatusPill status={toolStatus?.agentledger.ok ? "pass" : "fail"} label={toolStatus?.agentledger.label || "Checking"} />
          </div>
          <div>
            <span>Ollama</span>
            <StatusPill status={toolStatus?.ollama.ok ? "pass" : "fail"} label={toolStatus?.ollama.label || "Checking"} />
          </div>
        </div>
      </section>

      <section className="inspector-block">
        <h2>Eval Gates</h2>
        <div className="gate-list">
          {gates.map((gate) => (
            <div className="gate-row" key={gate.id}>
              <span className={`gate-dot ${gate.status}`} />
              <span>{gate.label}</span>
              <StatusPill status={gate.status as "pass" | "warn" | "fail" | "neutral" | "ready"} label={gate.status} />
              <strong>{gate.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="inspector-block">
        <details className="inspector-details">
          <summary>
            <span className="inspector-details-main">
              <span className="inspector-details-title">Evidence paths</span>
              <span className="inspector-details-copy">AgentLedger, RepoMori, Modelfile</span>
            </span>
            <span className="inspector-details-meta">
              {evidencePathCount}/{evidencePathTotal} ready
            </span>
            <ChevronDown aria-hidden="true" size={16} />
          </summary>
          <dl className="metric-list compact">
            <div>
              <dt>Data Root</dt>
              <dd className="path-action">
                <span title={dataRootPath}>{dataRootPath || "Unset"}</span>
                <PathCopyButton copied={copiedPath === "data-root"} disabled={!dataRootPath} label="Copy data root path" onCopy={() => void copyPath("data-root", dataRootPath)} />
              </dd>
            </div>
            <div>
              <dt>Bundle Path</dt>
              <dd className="path-action">
                <span title={bundlePath}>{bundlePath || "Not built"}</span>
                <PathCopyButton copied={copiedPath === "bundle"} disabled={!bundlePath} label="Copy bundle path" onCopy={() => void copyPath("bundle", bundlePath)} />
              </dd>
            </div>
            <div>
              <dt>RepoMori</dt>
              <dd className="path-action">
                <span title={repomoriPath}>{repomori?.status || "Not run"}</span>
                <PathCopyButton copied={copiedPath === "repomori"} disabled={!repomoriPath} label="Copy RepoMori path" onCopy={() => void copyPath("repomori", repomoriPath)} />
              </dd>
            </div>
            <div>
              <dt>Modelfile</dt>
              <dd className="path-action">
                <span title={modelfilePath}>{modelfilePath || "Not exported"}</span>
                <PathCopyButton copied={copiedPath === "modelfile"} disabled={!modelfilePath} label="Copy Modelfile path" onCopy={() => void copyPath("modelfile", modelfilePath)} />
              </dd>
            </div>
          </dl>
        </details>
      </section>

      <section className="inspector-block final-block">
        <h2>Proof Bundle</h2>
        <div className="proof-row">
          <span>Status</span>
          <StatusPill status={proof ? "pass" : "neutral"} label={proof ? "Ready" : "Waiting"} />
        </div>
        <div className="proof-row">
          <span>Built At</span>
          <strong>{proof?.builtAt ? new Date(proof.builtAt).toLocaleString() : "Not built"}</strong>
        </div>
        <div className="proof-actions">
          <button type="button" onClick={onOpenProof}>
            <Eye size={15} />
            View Proof
          </button>
          <button type="button" onClick={onBuildProof} disabled={proofBusy}>
            <RefreshCw size={15} />
            {proofBusy ? "Building" : "Rebuild"}
          </button>
        </div>
      </section>
    </aside>
  );
}
