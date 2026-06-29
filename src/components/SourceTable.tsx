import { Check, Copy, Filter, RefreshCw, Save, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { writeClipboardText } from "../lib/clipboard";
import type { SourceRow, SourceSummary } from "../lib/types";

type SourceTableProps = {
  sources?: SourceSummary | null;
  onRefresh: () => void;
  savingRules?: boolean;
  onSaveSourceRules?: (sourceIncludes: string, sourceExcludes: string) => void;
};

export function SourceTable({ sources, onRefresh, savingRules = false, onSaveSourceRules }: SourceTableProps) {
  const rows = sources?.rows || [];
  const rules = sources?.sourceRules;
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [licenseFilter, setLicenseFilter] = useState("all");
  const [includeText, setIncludeText] = useState("");
  const [excludeText, setExcludeText] = useState("");
  const [copiedHash, setCopiedHash] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [manualHash, setManualHash] = useState("");
  const copiedTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setIncludeText((rules?.includePatterns || []).join("\n"));
    setExcludeText((rules?.excludePatterns || []).join("\n"));
  }, [rules?.excludePatterns, rules?.includePatterns]);

  const typeOptions = useMemo(() => uniqueSorted(rows.map((row) => row.type)), [rows]);
  const licenseOptions = useMemo(() => uniqueSorted(rows.map((row) => row.license)), [rows]);
  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery =
        !needle ||
        row.path.toLowerCase().includes(needle) ||
        row.language.toLowerCase().includes(needle) ||
        row.hash.toLowerCase().includes(needle);
      const matchesType = typeFilter === "all" || row.type === typeFilter;
      const matchesLicense = licenseFilter === "all" || row.license === licenseFilter;
      return matchesQuery && matchesType && matchesLicense;
    });
  }, [licenseFilter, query, rows, typeFilter]);
  const hasActiveFilters = Boolean(query.trim()) || typeFilter !== "all" || licenseFilter !== "all";
  const savedIncludeText = (rules?.includePatterns || []).join("\n");
  const savedExcludeText = (rules?.excludePatterns || []).join("\n");
  const rulesChanged = includeText !== savedIncludeText || excludeText !== savedExcludeText;

  async function copyHash(row: SourceRow) {
    try {
      await writeClipboardText(row.hash);
      setCopiedHash(row.hash);
      setManualHash("");
      setCopyNotice("Hash copied");
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => setCopiedHash(""), 1400);
      noticeTimerRef.current = window.setTimeout(() => setCopyNotice(""), 1800);
    } catch {
      setCopiedHash("");
      setManualHash(row.hash);
      setCopyNotice("Copy unavailable - full hash shown");
    }
  }

  function clearFilters() {
    setQuery("");
    setTypeFilter("all");
    setLicenseFilter("all");
    setManualHash("");
  }

  function saveRules() {
    onSaveSourceRules?.(includeText, excludeText);
  }

  return (
    <section className="source-section" aria-labelledby="sources-title">
      <div className="source-header">
        <div>
          <h2 id="sources-title">Source Browser</h2>
          <span>{sources?.root || "Waiting for a source scan"}</span>
        </div>
        <button className="icon-button small" type="button" aria-label="Refresh sources" onClick={onRefresh}>
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="source-rules-panel" aria-label="Source include and exclude rules">
        <div className="source-rules-heading">
          <div>
            <Filter size={16} />
            <div>
              <strong>Source boundary</strong>
              <span>
                {rules ? `${rules.includedFiles.toLocaleString()} included, ${rules.excludedFiles.toLocaleString()} hidden by rules` : "Rules apply to the next scan"}
              </span>
            </div>
          </div>
          <button className="plain-button small" type="button" disabled={!onSaveSourceRules || savingRules || !rulesChanged} onClick={saveRules}>
            {savingRules ? <RefreshCw className="spin-icon" size={14} /> : <Save size={14} />}
            <span>{savingRules ? "Saving" : "Save rules"}</span>
          </button>
        </div>
        <div className="source-rules-grid">
          <label>
            <span>Include only</span>
            <textarea value={includeText} onChange={(event) => setIncludeText(event.target.value)} placeholder={"Optional patterns, one per line\nsrc/\ndocs/\n*.md"} />
          </label>
          <label>
            <span>Exclude</span>
            <textarea value={excludeText} onChange={(event) => setExcludeText(event.target.value)} placeholder={"Optional patterns, one per line\ndist/\n*.png\nsecrets"} />
          </label>
          <div className="source-rules-preview">
            <span>Hidden preview</span>
            {rules?.excludedPreview?.length ? (
              rules.excludedPreview.slice(0, 4).map((item) => (
                <strong key={`${item.path}-${item.reason}`} title={`${item.path} - ${item.reason}`}>
                  {item.path}
                </strong>
              ))
            ) : (
              <strong>No rule-hidden files</strong>
            )}
          </div>
        </div>
      </div>

      <div className="table-toolbar">
        <label className="search-box">
          <Search size={16} />
          <span className="sr-only">Filter sources</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search path, language, or hash..." />
        </label>
        <label className="source-filter-control">
          <span>Type</span>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">All</option>
            {typeOptions.map((type) => (
              <option value={type} key={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="source-filter-control">
          <span>License</span>
          <select value={licenseFilter} onChange={(event) => setLicenseFilter(event.target.value)}>
            <option value="all">All</option>
            {licenseOptions.map((license) => (
              <option value={license} key={license}>
                {license}
              </option>
            ))}
          </select>
        </label>
        <div className="table-count">
          {visibleRows.length.toLocaleString()} / {sources?.totalFiles.toLocaleString() || "0"}
        </div>
      </div>

      <div className="source-table-wrap">
        <table className="source-table">
          <thead>
            <tr>
              <th>Path</th>
              <th>Type</th>
              <th>Language</th>
              <th>Size</th>
              <th>License</th>
              <th>Added</th>
              <th>Hash (SHA-256)</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr data-source-row="true" key={row.path}>
                <td className="path-cell">{row.path}</td>
                <td>{row.type}</td>
                <td>{row.language}</td>
                <td>{row.size}</td>
                <td>
                  <span className={`license-chip ${isPendingLicense(row.license) ? "warn" : ""}`}>{row.license}</span>
                </td>
                <td>{row.added}</td>
                <td className="hash-cell">
                  <div className="hash-action-row">
                    <span>{row.hashShort}</span>
                    <button
                      className={copiedHash === row.hash ? "copy-hash-button copied" : "copy-hash-button"}
                      type="button"
                      aria-label={copiedHash === row.hash ? `Copied hash for ${row.path}` : `Copy hash for ${row.path}`}
                      onClick={() => void copyHash(row)}
                    >
                      {copiedHash === row.hash ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!visibleRows.length ? (
              <tr className="empty-table-row">
                <td className="empty-table-cell" colSpan={7}>
                  <span>No source files match the current filters.</span>
                  {hasActiveFilters ? (
                    <button className="link-button inline" type="button" onClick={clearFilters}>
                      Clear filters
                    </button>
                  ) : null}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="source-card-list" aria-label="Source files">
        {visibleRows.map((row) => (
          <article className="source-card" key={row.path}>
            <div className="source-card-top">
              <strong title={row.path}>{row.path}</strong>
              <button
                className={copiedHash === row.hash ? "copy-hash-button copied" : "copy-hash-button"}
                type="button"
                aria-label={copiedHash === row.hash ? `Copied hash for ${row.path}` : `Copy hash for ${row.path}`}
                onClick={() => void copyHash(row)}
              >
                {copiedHash === row.hash ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <div className="source-card-meta">
              <span>{row.type}</span>
              <span>{row.language}</span>
              <span>{row.size}</span>
              <span className={`license-chip ${isPendingLicense(row.license) ? "warn" : ""}`}>{row.license}</span>
            </div>
            <div className="source-card-hash">
              <span>SHA-256</span>
              <code>{row.hashShort}</code>
            </div>
          </article>
        ))}
        {!visibleRows.length ? (
          <div className="source-card-empty">
            <span>No source files match the current filters.</span>
            {hasActiveFilters ? (
              <button className="link-button inline" type="button" onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="table-footer">
        <span>
          Showing {visibleRows.length.toLocaleString()} of {sources?.totalFiles.toLocaleString() || "0"} files
        </span>
        <div className="table-footer-actions">
          <span className={copyNotice ? "copy-notice" : undefined}>
            {copyNotice || `${sources?.reviewedFiles.toLocaleString() || "0"} license-reviewed`}
          </span>
          {manualHash ? (
            <code className="manual-hash" title={manualHash}>
              {manualHash}
            </code>
          ) : null}
          {hasActiveFilters ? (
            <button className="link-button inline" type="button" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function isPendingLicense(label: string) {
  return /pending|missing|unreviewed/i.test(label);
}
