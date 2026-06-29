import { Box, ChevronRight, Code2, Database, FileArchive, ShieldCheck } from "lucide-react";
import type { PipelineStep } from "../lib/types";
import { StatusPill } from "./StatusPill";
import type { WorkspaceView } from "./WorkspaceTabs";

const icons = [Code2, Database, Box, ShieldCheck, FileArchive];

type PipelineRailProps = {
  steps: PipelineStep[];
  onOpenWorkspace: (view: WorkspaceView) => void;
};

function workspaceForStep(stepId: string): WorkspaceView {
  if (stepId === "ollama-profile") return "model";
  if (stepId === "eval-gates") return "release";
  if (stepId === "proof-bundle") return "proof";
  return "sources";
}

export function PipelineRail({ steps, onOpenWorkspace }: PipelineRailProps) {
  return (
    <section className="pipeline-section" aria-labelledby="pipeline-title">
      <div className="section-heading-row">
        <h1 id="pipeline-title">Pipeline</h1>
        <div className="autosave">
          <span>Auto-save</span>
          <span className="mini-dot good" />
          <span>On</span>
        </div>
      </div>

      <div className="pipeline-list">
        {steps.map((step, index) => {
          const Icon = icons[index] || Box;
          const targetWorkspace = workspaceForStep(step.id);
          return (
            <button
              aria-label={`Open ${step.title}`}
              className="pipeline-row"
              key={step.id}
              onClick={() => onOpenWorkspace(targetWorkspace)}
              type="button"
            >
              <div className={`step-index step-${step.status}`}>
                <span>{step.index}</span>
              </div>
              <div className="step-icon">
                <Icon size={25} />
              </div>
              <div className="step-copy">
                <div className="step-title">{step.title}</div>
                <div className="step-description">{step.description}</div>
              </div>
              <StatusPill status={step.status} />
              <div className="step-metrics">
                <strong>{step.metric}</strong>
                <span>{step.detail}</span>
              </div>
              <div className="stage-affordance" aria-hidden="true">
                <ChevronRight size={16} />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
