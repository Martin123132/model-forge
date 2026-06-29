import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, LoaderCircle } from "lucide-react";

export type NextActionTone = "ready" | "warning" | "success" | "running";

export type NextAction = {
  title: string;
  detail: string;
  label: string;
  actionLabel: string;
  meta?: string;
  tone: NextActionTone;
  busy?: boolean;
  disabled?: boolean;
};

type NextActionPanelProps = {
  action: NextAction;
  onAction: () => void;
};

function iconFor(tone: NextActionTone, busy?: boolean) {
  if (busy || tone === "running") return <LoaderCircle className="spin-icon" size={18} />;
  if (tone === "warning") return <AlertTriangle size={18} />;
  if (tone === "success") return <CheckCircle2 size={18} />;
  return <CircleDot size={18} />;
}

export function NextActionPanel({ action, onAction }: NextActionPanelProps) {
  return (
    <section className={`next-action next-action-${action.tone}`} aria-label="Recommended next action">
      <div className="next-action-icon">{iconFor(action.tone, action.busy)}</div>
      <div className="next-action-copy">
        <span>{action.label}</span>
        <strong>{action.title}</strong>
        <p>{action.detail}</p>
      </div>
      {action.meta ? <em>{action.meta}</em> : null}
      <button className="plain-button next-action-button" disabled={action.disabled || action.busy} type="button" onClick={onAction}>
        <span>{action.busy ? "Working" : action.actionLabel}</span>
        <ArrowRight size={14} />
      </button>
    </section>
  );
}
