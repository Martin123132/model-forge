import { Bot, FileSearch, PackageCheck, ShieldCheck } from "lucide-react";
import type { EvalReport, ModelExport, ProofBundle, SourceSummary } from "../lib/types";

export type WorkspaceView = "sources" | "proof" | "model" | "release";

type WorkspaceTabsProps = {
  active: WorkspaceView;
  sources?: SourceSummary | null;
  proof?: ProofBundle | null;
  modelExport?: ModelExport | null;
  evalReport?: EvalReport | null;
  onNavigate: (view: WorkspaceView) => void;
};

const tabs = [
  { id: "sources", label: "Sources", Icon: FileSearch },
  { id: "proof", label: "Proof", Icon: PackageCheck },
  { id: "model", label: "Model Lab", Icon: Bot },
  { id: "release", label: "Release", Icon: ShieldCheck }
] as const;

export function WorkspaceTabs({ active, sources, proof, modelExport, evalReport, onNavigate }: WorkspaceTabsProps) {
  function metaFor(id: WorkspaceView) {
    if (id === "sources") return `${sources?.totalFiles.toLocaleString() || "0"} files`;
    if (id === "proof") return proof ? "Bundle ready" : "Not built";
    if (id === "model") return modelExport?.created ? "Created" : modelExport ? "Profile" : "Waiting";
    return evalReport ? evalReport.summary.replace(" gates ", " ") : "No run";
  }

  return (
    <section className="workspace-switcher" aria-label="Workspace">
      <div className="workspace-switcher-heading">
        <h2>Workspace</h2>
        <span>{metaFor(active)}</span>
      </div>
      <div className="workspace-tabs" aria-label="Workspace sections" role="tablist">
        {tabs.map(({ id, label, Icon }) => (
          <button
            aria-selected={active === id}
            className={`workspace-tab ${active === id ? "is-active" : ""}`}
            data-workspace-tab={id}
            key={id}
            onClick={() => onNavigate(id)}
            role="tab"
            type="button"
          >
            <Icon size={16} />
            <b>{label}</b>
            <strong>{metaFor(id)}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}
