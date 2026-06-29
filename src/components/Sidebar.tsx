import { Boxes, FileCheck2, Gauge, GitBranch, ShieldCheck, SlidersHorizontal } from "lucide-react";
import type { WorkspaceView } from "./WorkspaceTabs";

const navItems = [
  { label: "Setup", icon: SlidersHorizontal, view: "setup" },
  { label: "Sources", icon: FileCheck2, view: "sources" },
  { label: "Proof", icon: Gauge, view: "proof" },
  { label: "Model", icon: Boxes, view: "model" },
  { label: "Release", icon: ShieldCheck, view: "release" }
] satisfies Array<{ label: string; icon: typeof FileCheck2; view: WorkspaceView }>;

type SidebarProps = {
  activeWorkspace: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
  sourceRoot: string;
};

export function Sidebar({ activeWorkspace, onNavigate, sourceRoot }: SidebarProps) {
  const compactRoot = sourceRoot.replace(/^([A-Z]:\\Users\\[^\\]+\\Documents\\)/i, "~\\Documents\\");

  return (
    <aside className="sidebar">
      <div className="brand-row">
        <div className="brand-mark">M</div>
        <div>
          <div className="brand-name">ModelForge</div>
          <div className="brand-version">v0.1.0</div>
        </div>
      </div>

      <nav className="nav-list" aria-label="ModelForge sections">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              aria-current={activeWorkspace === item.view ? "page" : undefined}
              className={`nav-item ${activeWorkspace === item.view ? "is-active" : ""}`}
              key={item.label}
              onClick={() => onNavigate(item.view)}
              type="button"
            >
              <Icon size={18} strokeWidth={2} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="branch-chip">
          <GitBranch size={15} />
          <span>main</span>
        </div>
        <div className="commit-chip">
          <SlidersHorizontal size={15} />
          <span>local</span>
          <span className="healthy-dot" />
        </div>
        <div className="workspace-block">
          <div className="workspace-title">Workspace</div>
          <div className="workspace-path" title={sourceRoot}>
            {compactRoot}
          </div>
        </div>
        <div className="system-health">
          <span className="healthy-dot" />
          <span>Healthy</span>
        </div>
      </div>
    </aside>
  );
}
