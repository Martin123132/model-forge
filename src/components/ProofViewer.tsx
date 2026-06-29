import { Archive, Clock3, FileText, FolderOpen, PackageCheck, RefreshCw } from "lucide-react";
import type { ProofBundle, Receipt } from "../lib/types";
import { StatusPill } from "./StatusPill";

type ProofViewerProps = {
  proof?: ProofBundle | null;
  busy: boolean;
  onBuild: () => void;
};

function receiptStatus(receipt: Receipt) {
  if (receipt.ok) return "pass";
  if (receipt.status === "skipped") return "warn";
  return "fail";
}

function proofReceiptTone(summary: { pass: number; warn: number; fail: number }, total: number) {
  if (!total) return "neutral";
  if (summary.fail) return "fail";
  if (summary.warn) return "warn";
  return "pass";
}

function compactBuiltAt(value?: string) {
  if (!value) return "Waiting";
  return new Date(value).toLocaleString([], { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "short" });
}

export function ProofViewer({ proof, busy, onBuild }: ProofViewerProps) {
  const receipts = proof?.manifest?.receipts || [];
  const artifacts = proof?.manifest?.artifacts || [];
  const sourceSummary = proof?.manifest?.sourceSummary;
  const receiptSummary = receipts.reduce(
    (summary, receipt) => {
      const status = receiptStatus(receipt);
      if (status === "pass") summary.pass += 1;
      else if (status === "warn") summary.warn += 1;
      else summary.fail += 1;
      return summary;
    },
    { pass: 0, warn: 0, fail: 0 }
  );
  const receiptTone = proofReceiptTone(receiptSummary, receipts.length);
  const sampledSources = sourceSummary ? `${sourceSummary.sampledFiles.toLocaleString()}/${sourceSummary.totalFiles.toLocaleString()}` : "Waiting";
  const modelCardLines = (proof?.modelCard || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);

  return (
    <section className="workbench-panel proof-viewer" aria-labelledby="proof-viewer-title">
      <div className="panel-title-row">
        <div>
          <h2 id="proof-viewer-title">Proof Viewer</h2>
          <span>{proof ? "Latest bundle loaded" : "No proof bundle"}</span>
        </div>
        <button className="plain-button small" type="button" onClick={onBuild} disabled={busy}>
          <RefreshCw size={15} />
          <span>{busy ? "Building" : "Rebuild"}</span>
        </button>
      </div>

      <div className="proof-meta-grid">
        <div>
          <span>Bundle</span>
          <strong title={proof?.path}>{proof?.path || "Not built"}</strong>
        </div>
        <div>
          <span>Built</span>
          <strong>{proof?.builtAt ? new Date(proof.builtAt).toLocaleString() : "Waiting"}</strong>
        </div>
      </div>

      <div className="proof-summary-strip" aria-label="Proof bundle summary">
        <div className={`proof-summary-card ${receiptTone}`}>
          <PackageCheck size={15} />
          <span>Receipts</span>
          <strong>
            {receiptSummary.pass}/{receipts.length || 0}
          </strong>
        </div>
        <div className="proof-summary-card neutral">
          <FileText size={15} />
          <span>Sources</span>
          <strong>{sampledSources}</strong>
        </div>
        <div className={`proof-summary-card ${artifacts.length ? "ready" : "neutral"}`}>
          <Archive size={15} />
          <span>Artifacts</span>
          <strong>{artifacts.length.toLocaleString()}</strong>
        </div>
        <div className={`proof-summary-card ${proof ? "pass" : "neutral"}`}>
          <Clock3 size={15} />
          <span>Built</span>
          <strong>{compactBuiltAt(proof?.builtAt)}</strong>
        </div>
      </div>

      <div className="receipt-list">
        {receipts.length ? (
          receipts.map((receipt) => (
            <div className="receipt-row" key={receipt.name}>
              <PackageCheck size={16} />
              <div>
                <strong>{receipt.name.replaceAll("_", " ")}</strong>
                <span title={receipt.outputPath}>{receipt.summary}</span>
              </div>
              <StatusPill status={receiptStatus(receipt)} label={receipt.status} />
            </div>
          ))
        ) : (
          <div className="empty-row">Build a bundle to load receipts.</div>
        )}
      </div>

      <div className="artifact-strip">
        {artifacts.slice(0, 6).map((artifact) => (
          <span key={artifact}>
            <FileText size={13} />
            {artifact}
          </span>
        ))}
      </div>

      <div className="model-card-preview">
        <div className="mini-heading">
          <FolderOpen size={15} />
          <span>Model card</span>
        </div>
        <pre>{modelCardLines.length ? modelCardLines.join("\n") : "Model card will appear after the next proof build."}</pre>
      </div>
    </section>
  );
}
