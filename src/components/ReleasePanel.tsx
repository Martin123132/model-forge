import { AlertTriangle, CheckCircle2, Clipboard, Clock3, FileText, PackageCheck, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { writeClipboardText } from "../lib/clipboard";
import type { EvalGate, EvalReport, ProofBundle, ShareCard, SourceSummary } from "../lib/types";
import { StatusPill } from "./StatusPill";

type ReleasePanelProps = {
  evalReport?: EvalReport | null;
  proof?: ProofBundle | null;
  sources?: SourceSummary | null;
  shareCard?: ShareCard | null;
  evalBusy: boolean;
  shareBusy: boolean;
  onRunEval: () => void;
  onBuildShare: () => void;
};

type ReadinessTone = "pass" | "warn" | "fail" | "ready";

type ReadinessItem = {
  label: string;
  value: string;
  detail: string;
  tone: ReadinessTone;
};

export function ReleasePanel({ evalReport, proof, sources, shareCard, evalBusy, shareBusy, onRunEval, onBuildShare }: ReleasePanelProps) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const gates = evalReport?.gates || [];
  const gateSummary = useMemo(() => {
    return gates.reduce(
      (summary, gate) => {
        if (isPassingGate(gate)) summary.passing += 1;
        else if (isFailingGate(gate)) summary.failing += 1;
        else if (isWarningGate(gate)) summary.review += 1;
        else summary.pending += 1;
        return summary;
      },
      { passing: 0, review: 0, failing: 0, pending: 0 }
    );
  }, [gates]);
  const attentionGate = useMemo(() => gates.find(isFailingGate) || gates.find(isWarningGate) || gates.find(isPendingGate) || null, [gates]);
  const releasePosture = gateSummary.failing > 0 ? "blocked" : gateSummary.review > 0 || gateSummary.pending > 0 ? "review" : gates.length ? "ready" : "empty";
  const licenseGate = useMemo(() => gates.find((gate) => gate.id === "license-review") || null, [gates]);
  const licenseReview = evalReport?.licenseReview || null;
  const readiness = useMemo(() => {
    const proofSourceSummary = proof?.manifest?.sourceSummary || null;
    const proofExists = Boolean(proof?.path || evalReport?.proofPath);
    const proofFresh = Boolean(
      proofSourceSummary &&
        sources &&
        proofSourceSummary.totalFiles === sources.totalFiles &&
        proofSourceSummary.sampledFiles === sources.sampledFiles &&
        proofSourceSummary.totalSizeBytes === sources.totalSizeBytes
    );
    const evalFresh = Boolean(evalReport && proof?.path && evalReport.proofPath === proof.path && proofFresh);
    const shareReady = Boolean(shareCard?.text);
    const gateTone: ReadinessTone =
      gateSummary.failing > 0 ? "fail" : gateSummary.review > 0 || !evalFresh ? "warn" : gateSummary.pending > 0 || !gates.length ? "ready" : "pass";
    const postureTone: ReadinessTone = gateTone === "fail" ? "fail" : gateTone === "warn" || !shareReady ? "warn" : gateTone;
    const headline =
      postureTone === "fail"
        ? "Not release-ready yet"
        : postureTone === "warn"
          ? "Release review required"
          : "Release evidence ready";
    const detail =
      postureTone === "fail"
        ? "Fix failing gates before any public claim leaves the workspace."
        : postureTone === "warn"
          ? "Safe for local demos, but public release still needs the review item called out below."
          : "Gates, proof, and share copy are aligned for a measured public release.";
    const items: ReadinessItem[] = [
      {
        label: "Gate posture",
        value: gates.length ? `${gateSummary.passing}/${gates.length}` : "Pending",
        detail: gates.length
          ? evalFresh
            ? `${gateSummary.review} review, ${gateSummary.failing} failing`
            : "Re-run gates after refreshing proof."
          : "Run gates to score the release.",
        tone: gateTone
      },
      {
        label: "Proof bundle",
        value: proofFresh ? "Fresh" : proofExists ? "Stale" : "Missing",
        detail: proofFresh ? "Evidence matches the current source tree." : proofExists ? "Source inventory changed since this bundle." : "Build a proof bundle before sharing.",
        tone: proofFresh ? "pass" : proofExists ? "warn" : "ready"
      },
      {
        label: "License review",
        value: licenseReview ? `${licenseReview.coveragePercent}%` : licenseGate?.value || "Pending",
        detail: licenseReview?.blockers[0] || licenseGate?.detail || "Coverage has not been measured yet.",
        tone: licenseGate ? (isFailingGate(licenseGate) ? "fail" : isWarningGate(licenseGate) ? "warn" : "pass") : "ready"
      },
      {
        label: "Share card",
        value: shareReady ? "Built" : "Draft",
        detail: shareReady ? "Public summary is available to review." : "Build after the release posture is understood.",
        tone: shareReady ? "pass" : "ready"
      }
    ];
    return { headline, detail, tone: postureTone, items };
  }, [evalReport, gateSummary, gates.length, licenseGate, licenseReview, proof?.manifest?.sourceSummary, proof?.path, shareCard?.text, sources]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  function pillStatus(status: string) {
    if (status === "pass" || status === "warn" || status === "fail" || status === "ready") return status;
    return "neutral";
  }

  function attentionTone(gate: EvalGate) {
    if (isFailingGate(gate)) return "fail";
    if (isWarningGate(gate)) return "warn";
    return "ready";
  }

  function attentionLabel(gate: EvalGate) {
    if (isFailingGate(gate)) return "Blocking";
    if (isWarningGate(gate)) return "Review";
    return "Pending";
  }

  async function copyShareText() {
    if (!shareCard?.text) return;
    await writeClipboardText(shareCard.text);
    setCopied(true);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className="workbench-panel release-panel" aria-labelledby="release-panel-title">
      <div className="panel-title-row">
        <div>
          <h2 id="release-panel-title">Release Gates</h2>
          <span>{evalReport?.summary || "No eval run yet"}</span>
        </div>
        <button className="plain-button small" type="button" onClick={onRunEval} disabled={evalBusy}>
          <ShieldCheck size={15} />
          <span>{evalBusy ? "Running" : "Run Gates"}</span>
        </button>
      </div>

      {evalReport ? (
        <div className="release-summary-strip" aria-label="Release gate summary">
          <div className="release-summary-card pass">
            <CheckCircle2 size={15} />
            <span>Passing</span>
            <strong>
              {gateSummary.passing}/{gates.length}
            </strong>
          </div>
          <div className={`release-summary-card ${gateSummary.review ? "warn" : "neutral"}`}>
            <AlertTriangle size={15} />
            <span>Review</span>
            <strong>{gateSummary.review}</strong>
          </div>
          <div className={`release-summary-card ${gateSummary.failing ? "fail" : "neutral"}`}>
            <XCircle size={15} />
            <span>Failing</span>
            <strong>{gateSummary.failing}</strong>
          </div>
          <div className={`release-summary-card ${gateSummary.pending ? "ready" : "neutral"}`}>
            <Clock3 size={15} />
            <span>Pending</span>
            <strong>{gateSummary.pending}</strong>
          </div>
        </div>
      ) : null}

      {attentionGate ? (
        <div className={`release-attention-card ${attentionTone(attentionGate)}`} aria-live="polite">
          <div>
            <span>{releasePosture === "blocked" ? "Release blocked" : releasePosture === "review" ? "Needs review" : "Release check"}</span>
            <strong>{attentionGate.label}</strong>
            <p>{attentionGate.detail}</p>
          </div>
          <StatusPill status={pillStatus(attentionGate.status)} label={attentionLabel(attentionGate)} />
        </div>
      ) : null}

      <div className={`release-readiness-card ${readiness.tone}`} aria-label="Public release readiness">
        <div className="release-readiness-copy">
          <span>Public release posture</span>
          <strong>{readiness.headline}</strong>
          <p>{readiness.detail}</p>
        </div>
        <div className="release-readiness-items">
          {readiness.items.map((item) => (
            <div className={`release-readiness-item ${item.tone}`} key={item.label}>
              {item.label === "Proof bundle" ? <PackageCheck size={14} /> : item.label === "Share card" ? <FileText size={14} /> : item.tone === "pass" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              <div>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {licenseReview?.pendingFiles ? (
        <div className="license-review-queue" aria-label="License review queue">
          <div className="license-review-heading">
            <div>
              <span>License review queue</span>
              <strong>
                {licenseReview.pendingFiles.toLocaleString()} pending / {licenseReview.reviewedFiles.toLocaleString()} reviewed
              </strong>
            </div>
            <StatusPill status={licenseReview.projectLicenseReady ? "pass" : "warn"} label={licenseReview.projectLicenseReady ? "Project license set" : "Project license missing"} />
          </div>
          <div className="license-review-blockers">
            {licenseReview.blockers.slice(0, 3).map((blocker) => (
              <span key={blocker}>{blocker}</span>
            ))}
          </div>
          <div className="license-review-files">
            {licenseReview.queue.slice(0, 4).map((item) => (
              <span key={item.path} title={item.path}>
                <strong>{item.path}</strong>
                <em>{item.label}</em>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="release-gate-list">
        {gates.length ? (
          gates.map((gate) => (
            <div className="release-gate-row" key={gate.id}>
              <span className={`gate-dot ${gate.status}`} />
              <div>
                <strong>{gate.label}</strong>
                <span>{gate.detail}</span>
              </div>
              <StatusPill status={pillStatus(gate.status)} label={gate.value} />
            </div>
          ))
        ) : (
          <div className="empty-row">Run gates to create a release report.</div>
        )}
      </div>

      <div className="share-card-box">
        <div className="panel-title-row tight">
          <div>
            <h3>Share Card</h3>
            <span>{shareCard?.headline || "Public summary not built"}</span>
          </div>
          <div className="share-card-actions">
            <button className="plain-button small" type="button" onClick={copyShareText} disabled={!shareCard?.text}>
              <Clipboard size={15} />
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
            <button className="plain-button small" type="button" onClick={onBuildShare} disabled={shareBusy}>
              <Sparkles size={15} />
              <span>{shareBusy ? "Building" : shareCard ? "Refresh" : "Build"}</span>
            </button>
          </div>
        </div>
        <div className={`share-card-preview ${shareCard?.text ? "" : "is-empty"}`} aria-label="Share card text" aria-live="polite">
          {shareCard?.text || "A measured public card will appear here."}
        </div>
      </div>
    </section>
  );
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

function isPendingGate(gate: EvalGate) {
  return !isPassingGate(gate) && !isWarningGate(gate) && !isFailingGate(gate);
}
