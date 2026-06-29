import { Archive, CheckCircle2, Clipboard, Clock3, Download, FileJson, FileText, FolderOpen, PackageCheck, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { exportPackDownloadUrl } from "../lib/api";
import { writeClipboardText } from "../lib/clipboard";
import type { EvalGate, EvalReport, ExportPackSummary, ForgeRecipe, ModelExport, ProofBundle, Receipt, ShareCard, SourceSummary } from "../lib/types";
import { StatusPill } from "./StatusPill";

type ProofViewerProps = {
  proof?: ProofBundle | null;
  sources?: SourceSummary | null;
  evalReport?: EvalReport | null;
  shareCard?: ShareCard | null;
  recipe?: ForgeRecipe | null;
  exportPack?: ExportPackSummary | null;
  modelExport?: ModelExport | null;
  busy: boolean;
  recipeBusy: boolean;
  shareBusy: boolean;
  onBuild: () => void;
  onBuildRecipe: () => void;
  onBuildShare: () => void;
};

function receiptStatus(receipt: Receipt) {
  if (receipt.ok) return "pass";
  if (receipt.status === "skipped") return "warn";
  return "fail";
}

function normalizedGateStatus(gate: EvalGate) {
  return gate.status.toLowerCase();
}

function isPassingGate(gate: EvalGate) {
  return normalizedGateStatus(gate) === "pass" || normalizedGateStatus(gate) === "passed";
}

function isWarningGate(gate: EvalGate) {
  return normalizedGateStatus(gate) === "warn" || normalizedGateStatus(gate) === "warning";
}

function isFailingGate(gate: EvalGate) {
  return normalizedGateStatus(gate) === "fail" || normalizedGateStatus(gate) === "failed";
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

function compactPath(path?: string) {
  if (!path) return "Not built";
  return path.replace(/^([A-Z]:\\Users\\[^\\]+\\Documents\\)/i, "~\\Documents\\");
}

function pillStatus(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "passed") return "pass";
  if (normalized === "warning") return "warn";
  if (normalized === "failed") return "fail";
  if (normalized === "pass" || normalized === "warn" || normalized === "fail" || normalized === "ready") return normalized;
  return "neutral";
}

export function ProofViewer({
  proof,
  sources,
  evalReport,
  shareCard,
  recipe,
  exportPack,
  modelExport,
  busy,
  recipeBusy,
  shareBusy,
  onBuild,
  onBuildRecipe,
  onBuildShare
}: ProofViewerProps) {
  const [copyNotice, setCopyNotice] = useState("");
  const copyTimerRef = useRef<number | null>(null);
  const receipts = proof?.manifest?.receipts || [];
  const artifacts = proof?.manifest?.artifacts || [];
  const sourceSummary = proof?.manifest?.sourceSummary;
  const gates = evalReport?.gates || [];
  const licenseReview = evalReport?.licenseReview || null;
  const proofFresh = Boolean(
    proof &&
      sources &&
      sourceSummary &&
      sourceSummary.totalFiles === sources.totalFiles &&
      sourceSummary.sampledFiles === sources.sampledFiles &&
      sourceSummary.totalSizeBytes === sources.totalSizeBytes
  );
  const evalFresh = Boolean(proofFresh && evalReport?.proofPath && proof?.path && evalReport.proofPath === proof.path);
  const packFresh = Boolean(exportPack?.manifest?.freshness?.sourcesMatchProof && exportPack?.manifest?.freshness?.evalMatchesProof);
  const shareReady = Boolean(shareCard?.text);
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
  const gateSummary = useMemo(() => {
    return gates.reduce(
      (summary, gate) => {
        if (isPassingGate(gate)) summary.pass += 1;
        else if (isFailingGate(gate)) summary.fail += 1;
        else if (isWarningGate(gate)) summary.warn += 1;
        else summary.ready += 1;
        return summary;
      },
      { pass: 0, warn: 0, fail: 0, ready: 0 }
    );
  }, [gates]);
  const sampledSources = sourceSummary ? `${sourceSummary.sampledFiles.toLocaleString()}/${sourceSummary.totalFiles.toLocaleString()}` : "Waiting";
  const modelCardLines = (proof?.modelCard || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
  const sourceSummaryLines = (proof?.sourceSummary || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
  const exportArtifacts = exportPack?.copiedArtifacts || [];
  const downloadDisabled = !exportPack;
  const modelName = modelExport?.modelName || exportPack?.manifest?.targetModel || recipe?.targetModel || "No target";

  async function copyText(value: string, label: string) {
    if (!value) return;
    await writeClipboardText(value);
    setCopyNotice(`${label} copied`);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => setCopyNotice(""), 1600);
  }

  function downloadPack() {
    if (downloadDisabled) return;
    const anchor = document.createElement("a");
    anchor.href = exportPackDownloadUrl;
    anchor.download = exportPack.downloadName || "model-forge-export.json";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }

  return (
    <section className="workbench-panel proof-viewer" aria-labelledby="proof-viewer-title">
      <div className="panel-title-row proof-title-row">
        <div>
          <h2 id="proof-viewer-title">Proof Viewer</h2>
          <span>{proofFresh ? "Evidence matches current source tree" : proof ? "Proof needs refresh" : "No proof bundle"}</span>
        </div>
        <div className="proof-action-row">
          <button className="plain-button small" type="button" onClick={onBuild} disabled={busy}>
            <RefreshCw className={busy ? "spin-icon" : ""} size={15} />
            <span>{busy ? "Building" : "Rebuild Proof"}</span>
          </button>
          <button className="plain-button small" type="button" onClick={onBuildRecipe} disabled={recipeBusy}>
            <Archive size={15} />
            <span>{recipeBusy ? "Packing" : "Refresh Pack"}</span>
          </button>
          <button className="plain-button small" type="button" onClick={downloadPack} disabled={downloadDisabled}>
            <Download size={15} />
            <span>Download</span>
          </button>
        </div>
      </div>

      <div className="proof-readiness-band" aria-label="Proof readiness">
        <article className={proofFresh ? "pass" : proof ? "warn" : "ready"}>
          {proofFresh ? <CheckCircle2 size={16} /> : <TriangleAlert size={16} />}
          <span>Proof</span>
          <strong>{proofFresh ? "Fresh" : proof ? "Stale" : "Missing"}</strong>
          <p>{proofFresh ? "Hashes and receipts match the current source tree." : proof ? "Rebuild before sharing a claim." : "Build proof to start the audit trail."}</p>
        </article>
        <article className={evalFresh ? "pass" : evalReport ? "warn" : "ready"}>
          <ShieldCheck size={16} />
          <span>Gates</span>
          <strong>{evalReport?.summary || "Not run"}</strong>
          <p>{evalFresh ? "Eval report points at this proof bundle." : "Run gates after the latest proof build."}</p>
        </article>
        <article className={packFresh ? "pass" : exportPack ? "warn" : "ready"}>
          <Archive size={16} />
          <span>Export Pack</span>
          <strong>{exportPack ? `${exportPack.artifactCount} artifacts` : "Not built"}</strong>
          <p>{packFresh ? "Pack is aligned with proof and eval evidence." : exportPack ? "Refresh the pack after proof or gate changes." : "Build a recipe to create a pack."}</p>
        </article>
        <article className={shareReady ? "pass" : "ready"}>
          <FileText size={16} />
          <span>Share Card</span>
          <strong>{shareReady ? "Built" : "Draft"}</strong>
          <p>{shareReady ? shareCard?.headline : "Build a public summary after gates pass."}</p>
        </article>
      </div>

      <div className="proof-meta-grid proof-meta-grid-wide">
        <div>
          <span>Proof bundle</span>
          <strong title={proof?.path}>{compactPath(proof?.path)}</strong>
        </div>
        <div>
          <span>Export pack</span>
          <strong title={exportPack?.exportDir}>{compactPath(exportPack?.exportDir)}</strong>
        </div>
        <div>
          <span>Model target</span>
          <strong title={modelName}>{modelName}</strong>
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
        <div className={`proof-summary-card ${proofFresh ? "pass" : "warn"}`}>
          <FileJson size={15} />
          <span>Sources</span>
          <strong>{sampledSources}</strong>
        </div>
        <div className={`proof-summary-card ${gateSummary.fail ? "fail" : gateSummary.warn ? "warn" : gates.length ? "pass" : "neutral"}`}>
          <ShieldCheck size={15} />
          <span>Gates</span>
          <strong>
            {gateSummary.pass}/{gates.length || 0}
          </strong>
        </div>
        <div className={`proof-summary-card ${artifacts.length ? "ready" : "neutral"}`}>
          <Archive size={15} />
          <span>Artifacts</span>
          <strong>{artifacts.length.toLocaleString()}</strong>
        </div>
        <div className={`proof-summary-card ${licenseReview?.coveragePercent === 100 ? "pass" : licenseReview ? "warn" : "neutral"}`}>
          <FileText size={15} />
          <span>License</span>
          <strong>{licenseReview ? `${licenseReview.coveragePercent}%` : "Waiting"}</strong>
        </div>
        <div className={`proof-summary-card ${proof ? "pass" : "neutral"}`}>
          <Clock3 size={15} />
          <span>Built</span>
          <strong>{compactBuiltAt(proof?.builtAt)}</strong>
        </div>
      </div>

      <div className="proof-audit-grid">
        <section className="proof-audit-card">
          <div className="panel-title-row tight">
            <div>
              <h3>Receipts</h3>
              <span>{receipts.length ? `${receiptSummary.pass} passing, ${receiptSummary.warn} review` : "No receipts loaded"}</span>
            </div>
          </div>
          <div className="receipt-list compact">
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
        </section>

        <section className="proof-audit-card">
          <div className="panel-title-row tight">
            <div>
              <h3>Gate Results</h3>
              <span>{evalReport?.summary || "Run gates from Release or Setup"}</span>
            </div>
          </div>
          <div className="proof-gate-list">
            {gates.length ? (
              gates.map((gate) => (
                <div className="proof-gate-row" key={gate.id}>
                  <span className={`gate-dot ${pillStatus(gate.status)}`} />
                  <div>
                    <strong>{gate.label}</strong>
                    <span>{gate.detail}</span>
                  </div>
                  <StatusPill status={pillStatus(gate.status)} label={gate.value} />
                </div>
              ))
            ) : (
              <div className="empty-row">No eval report loaded.</div>
            )}
          </div>
        </section>

        <section className="proof-audit-card export-pack-card">
          <div className="panel-title-row tight">
            <div>
              <h3>Export Pack</h3>
              <span>{exportPack?.downloadName || "No downloadable pack"}</span>
            </div>
            <StatusPill status={packFresh ? "pass" : exportPack ? "warn" : "neutral"} label={packFresh ? "Fresh" : exportPack ? "Review" : "Missing"} />
          </div>
          <div className="export-pack-actions">
            <button className="plain-button small" type="button" disabled={!exportPack?.exportDir} onClick={() => copyText(exportPack?.exportDir || "", "Pack path")}>
              <Clipboard size={14} />
              <span>Copy Path</span>
            </button>
            <button className="plain-button small" type="button" disabled={!shareCard?.text} onClick={() => copyText(shareCard?.text || "", "Share card")}>
              <FileText size={14} />
              <span>Copy Share</span>
            </button>
            <button className="plain-button small" type="button" onClick={onBuildShare} disabled={shareBusy}>
              <RefreshCw className={shareBusy ? "spin-icon" : ""} size={14} />
              <span>{shareBusy ? "Building" : "Share Card"}</span>
            </button>
          </div>
          <div className="artifact-strip export-artifacts">
            {exportArtifacts.length ? (
              exportArtifacts.slice(0, 10).map((artifact) => (
                <span key={artifact} title={artifact}>
                  <FileText size={13} />
                  {artifact}
                </span>
              ))
            ) : (
              <span>No pack artifacts yet</span>
            )}
          </div>
          <em className="proof-copy-notice" aria-live="polite">
            {copyNotice}
          </em>
        </section>

        <section className="proof-audit-card evidence-preview-card">
          <div className="panel-title-row tight">
            <div>
              <h3>Evidence Preview</h3>
              <span>Model card and source summary</span>
            </div>
          </div>
          <div className="proof-preview-grid">
            <div className="model-card-preview">
              <div className="mini-heading">
                <FolderOpen size={15} />
                <span>Model card</span>
              </div>
              <pre>{modelCardLines.length ? modelCardLines.join("\n") : "Model card will appear after the next proof build."}</pre>
            </div>
            <div className="model-card-preview">
              <div className="mini-heading">
                <FileJson size={15} />
                <span>Source summary</span>
              </div>
              <pre>{sourceSummaryLines.length ? sourceSummaryLines.join("\n") : "Source summary will appear after the next proof build."}</pre>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
