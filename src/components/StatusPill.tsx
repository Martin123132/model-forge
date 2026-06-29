import type { PipelineStatus } from "../lib/types";

const labels: Record<PipelineStatus, string> = {
  complete: "Complete",
  warning: "Warnings",
  ready: "Ready",
  failed: "Failed"
};

type StatusPillProps = {
  status: PipelineStatus | "pass" | "warn" | "fail" | "neutral";
  label?: string;
};

export function StatusPill({ status, label }: StatusPillProps) {
  return <span className={`status-pill status-${status}`}>{label || labels[status as PipelineStatus] || status}</span>;
}
