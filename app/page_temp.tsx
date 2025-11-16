'use client';
import React from 'react';

type Notice = {
  id?: string | number;
  title: string;
  noticeType?: string;
  noticeStatus?: string;
  source: string;
  organisationName?: string;
  cpvCodes?: string;
  procurementStage?: string | null;
  valueLow?: number | string | null;
  valueHigh?: number | string | null;
  awardedValue?: number | string | null;
  publishedDate?: string;
  deadlineDate?: string;
  awardedDate?: string;
  lastNotifiableUpdate?: string;
  link: string;
};

type SourceCounts = {
  filtered: number;
  retrieved: number;
  available: number;
  pageLimit?: number;
  pageSize?: number;
  active?: boolean;
  requested?: boolean;
};

type SearchCounts = {
  total: number;
  cf: SourceCounts;
  fts: SourceCounts;
};

const ALL_TYPES = ["Contract", "Opportunity", "EarlyEngagement", "FutureOpportunity"] as const;
const ALL_STATUSES = ["Open", "Closed", "Awarded"] as const;
const SOURCE_OPTIONS = [
  { value: "CF", label: "Contracts Finder" },
  { value: "FTS", label: "Find a Tender" }
] as const;
const DEFAULT_SOURCES = SOURCE_OPTIONS.map(option => option.value);
const PROCUREMENT_STAGE_OPTIONS = [
  { value: "Pipeline", label: "Pipeline" },
  { value: "Planning", label: "Planning" },
  { value: "Tender", label: "Tender" },
  { value: "Award", label: "Award" },
  { value: "Contract", label: "Contract" },
  { value: "Termination", label: "Termination" }
] as const;

const DEFAULT_KEYWORDS = "nhs,technology,digital,cloud,cyber,analytics,software,IT,data";
const DEFAULT_TYPES = [...ALL_TYPES];
const DEFAULT_STATUSES = ["Open", "Awarded"];
const DEFAULT_PROCUREMENT_STAGES = PROCUREMENT_STAGE_OPTIONS.map(option => option.value);

function parseCsv(value: string) {
  return value
    .split(/[,\n]+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function normaliseNumber(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = value.replace(/[^0-9.-]+/g, "");
  if (!cleaned) return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatCurrencyRange(valueLow?: number | string | null, valueHigh?: number | string | null, awarded?: number | string | null) {
  const formatter = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
  const low = normaliseNumber(valueLow);
  const high = normaliseNumber(valueHigh);
  const award = normaliseNumber(awarded);

  const render = (value: number | null) => (value === null ? null : formatter.format(value));

  const lowText = render(low);
  const highText = render(high);
  const awardedText = render(award);

  if (lowText && highText) return `${lowText} - ${highText}`;
  if (lowText) return lowText;
  if (highText) return highText;
  if (awardedText) return `Awarded ${awardedText}`;
  return "--";
}

function formatDate(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString();
}

function formatSourceSummary(counts?: SourceCounts) {
  if (!counts) return "";
  let summary = `${counts.filtered.toLocaleString()} shown`;
  if (counts.retrieved !== counts.filtered) {
    summary += ` / ${counts.retrieved.toLocaleString()} fetched`;
  }
  if (typeof counts.available === "number" && counts.available > counts.retrieved) {
    summary += ` (of ${counts.available.toLocaleString()} available)`;
  }
  return summary;
}

export default function Home() {
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<Notice[]>([]);
  const [resultCount, setResultCount] = React.useState(0);
  const [counts, setCounts] = React.useState<SearchCounts | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [keywords, setKeywords] = React.useState(DEFAULT_KEYWORDS);
  const [types, setTypes] = React.useState<string[]>(() => [...DEFAULT_TYPES]);
  const [statuses, setStatuses] = React.useState<string[]>(() => [...DEFAULT_STATUSES]);
  const [procurementStages, setProcurementStages] = React.useState<string[]>(() => [...DEFAULT_PROCUREMENT_STAGES]);
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [sources, setSources] = React.useState<string[]>(() => [...DEFAULT_SOURCES]);

  const requestCounterRef = React.useRef(0);

  const search = React.useCallback(
    async (signal?: AbortSignal) => {
      const currentRequestId = ++requestCounterRef.current;

      setLoading(true);
      setError(null);

      const payload = {
        keywords: parseCsv(keywords),
        types,
        statuses,
        procurementStages,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        sources
      };

      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Failed to retrieve notices.");
        }

        if (requestCounterRef.current === currentRequestId) {
          const itemsData = Array.isArray(data.items) ? data.items : [];
          setItems(itemsData);
          setResultCount(typeof data.count === "number" ? data.count : itemsData.length);
          setCounts(data.counts ?? null);
        }
      } catch (err) {
        const errorObject = err as Error;
        if ((errorObject as any)?.name === "AbortError") return;
        if (requestCounterRef.current === currentRequestId) {
          console.error(errorObject);
          setError(errorObject.message || "Unable to fetch notices. Please try again.");
          setCounts(null);
        }
      } finally {
        if (requestCounterRef.current === currentRequestId) {
          setLoading(false);
        }
      }
    },
    [keywords, types, statuses, procurementStages, dateFrom, dateTo, sources]
  );

  React.useEffect(() => {
    const controller = new AbortController();
    const debounce = setTimeout(() => {
      void search(controller.signal);
    }, 400);

    return () => {
      controller.abort();
      clearTimeout(debounce);
    };
  }, [search]);

  const toggleType = React.useCallback((value: string) => {
    setTypes(prev => (prev.includes(value) ? prev.filter(item => item !== value) : [...prev, value]));
  }, []);

  const toggleStatus = React.useCallback((value: string) => {
    setStatuses(prev => (prev.includes(value) ? prev.filter(item => item !== value) : [...prev, value]));
  }, []);

  const toggleProcurementStage = React.useCallback((value: string) => {
    setProcurementStages(prev =>
      prev.includes(value) ? prev.filter(item => item !== value) : [...prev, value]
    );
  }, []);

  const toggleSource = React.useCallback((value: string) => {
    setSources(prev => {
      const exists = prev.includes(value);
      if (exists) {
        const next = prev.filter(item => item !== value);
        return next.length ? next : [...DEFAULT_SOURCES];
      }
      return [...prev, value];
    });
  }, []);

  const resetFilters = React.useCallback(() => {
    setKeywords(DEFAULT_KEYWORDS);
    setTypes([...DEFAULT_TYPES]);
    setStatuses([...DEFAULT_STATUSES]);
    setProcurementStages([...DEFAULT_PROCUREMENT_STAGES]);
    setDateFrom("");
    setDateTo("");
    setSources([...DEFAULT_SOURCES]);
  }, []);

  const hasCustomFilters = React.useMemo(() => {
    if (keywords !== DEFAULT_KEYWORDS) return true;
    if (dateFrom !== "" || dateTo !== "") return true;

    if (types.length !== DEFAULT_TYPES.length) return true;
    const typeSet = new Set(types);
    if (DEFAULT_TYPES.some(type => !typeSet.has(type))) return true;

    if (statuses.length !== DEFAULT_STATUSES.length) return true;
    const statusSet = new Set(statuses);
    if (DEFAULT_STATUSES.some(status => !statusSet.has(status))) return true;

    if (procurementStages.length !== DEFAULT_PROCUREMENT_STAGES.length) return true;
    const stageSet = new Set(procurementStages);
    if (DEFAULT_PROCUREMENT_STAGES.some(stage => !stageSet.has(stage))) return true;

    const sourceSet = new Set(sources);
    if (sourceSet.size !== DEFAULT_SOURCES.length) return true;
    if (DEFAULT_SOURCES.some(source => !sourceSet.has(source))) return true;

    return false;
  }, [keywords, dateFrom, dateTo, types, statuses, procurementStages, sources]);

  const handleManualRefresh = React.useCallback(() => {
    void search();
  }, [search]);

  const handleExportExcel = React.useCallback(async () => {
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items, format: "excel" })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to export Excel.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "notices.xlsx";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      const errorObject = err as Error;
      console.error(errorObject);
      setError(errorObject.message || "Unable to export to Excel.");
    }
  }, [items]);

  const cfFilteredOut = counts ? Math.max(counts.cf.retrieved - counts.cf.filtered, 0) : 0;
  const ftsFilteredOut =
    counts && counts.fts.requested !== false && counts.fts.active !== false
      ? Math.max(counts.fts.retrieved - counts.fts.filtered, 0)
      : 0;
  const cfSummaryText = counts ? formatSourceSummary(counts.cf) : "";
  const ftsSummaryText = counts
    ? counts.fts.requested === false
      ? "disabled in filters"
      : counts.fts.active === false
        ? "API key not configured"
        : formatSourceSummary(counts.fts)
    : "";

  const handleExportJson = React.useCallback(async () => {
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items, format: "json" })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to export JSON.");
      }

      const data = await res.json();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "notices.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      const errorObject = err as Error;
      console.error(errorObject);
      setError(errorObject.message || "Unable to export JSON.");
    }
  }, [items]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px", color: "#111" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>NHS Procurement Alerts</h1>
        <p style={{ opacity: 0.75, margin: 0 }}>
          Search Contracts Finder and Find a Tender. Filters update automatically; adjust keywords, procurement stage, type, status, or date range to refine the feed.
        </p>
      </header>

      <section style={{ background: "#f5f7fb", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(15,23,42,0.08)", marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Keywords (CSV)</span>
            <input
              value={keywords}
              onChange={event => setKeywords(event.target.value)}
              placeholder="e.g. nhs, digital, cloud"
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Date from</span>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={event => setDateFrom(event.target.value)}
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Date to</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={event => setDateTo(event.target.value)}
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff" }}
            />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 20 }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Types</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {ALL_TYPES.map(type => (
                <label key={type} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                  <input type="checkbox" checked={types.includes(type)} onChange={() => toggleType(type)} />
                  {type}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Statuses</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {ALL_STATUSES.map(status => (
                <label key={status} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                  <input type="checkbox" checked={statuses.includes(status)} onChange={() => toggleStatus(status)} />
                  {status}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Sources</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {SOURCE_OPTIONS.map(option => (
                <label key={option.value} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={sources.includes(option.value)}
                    onChange={() => toggleSource(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Procurement stage</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {PROCUREMENT_STAGE_OPTIONS.map(option => (
                <label key={option.value} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={procurementStages.includes(option.value)}
                    onChange={() => toggleProcurementStage(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24, display: "flex", flexWrap: "wrap", gap: 12 }}>
          <button
            onClick={handleManualRefresh}
            disabled={loading}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: loading ? "#94a3b8" : "#2563eb",
              color: "#fff",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background 0.2s ease"
            }}
          >
            {loading ? "Searching..." : "Refresh Now"}
          </button>
          <button
            onClick={resetFilters}
            disabled={!hasCustomFilters}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: hasCustomFilters ? "#fff" : "#e2e8f0",
              color: "#1e293b",
              fontWeight: 500,
              cursor: hasCustomFilters ? "pointer" : "not-allowed"
            }}
          >
            Reset Filters
          </button>
          <button
            onClick={handleExportExcel}
            disabled={!items.length || loading}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: !items.length || loading ? "#e2e8f0" : "#fff",
              color: "#1e293b",
              fontWeight: 500,
              cursor: !items.length || loading ? "not-allowed" : "pointer"
            }}
          >
            Export Excel
          </button>
          <button
            onClick={handleExportJson}
            disabled={!items.length || loading}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: !items.length || loading ? "#e2e8f0" : "#fff",
              color: "#1e293b",
              fontWeight: 500,
              cursor: !items.length || loading ? "not-allowed" : "pointer"
            }}
          >
            Export JSON
          </button>
        </div>
      </section>

      {error && (
        <div style={{ background: "#fee2e2", border: "1px solid #fecaca", color: "#b91c1c", padding: "12px 16px", borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontWeight: 600 }}>
            {loading ? "Loading results..." : `${resultCount} result${resultCount === 1 ? "" : "s"}`}
          </div>
        </div>
        {counts ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              fontSize: 13,
              color: "#fff",
              marginBottom: 12,
              background: "#1e293b",
              borderRadius: 8,
              padding: "10px 14px"
            }}
          >
            <div>
              <strong>Contracts Finder:</strong>{" "}
              {cfSummaryText}
            </div>
            <div>
              <strong>Find a Tender:</strong>{" "}
              {ftsSummaryText}
            </div>
          </div>
        ) : null}
        {counts && (cfFilteredOut > 0 || ftsFilteredOut > 0) ? (
          <div
            style={{
              marginBottom: 12,
              fontSize: 12,
              color: "#b91c1c",
              background: "#fee2e2",
              border: "1px solid #fecaca",
              borderRadius: 6,
              padding: "8px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 4
            }}
          >
            {cfFilteredOut > 0 ? (
              <div>
                {cfFilteredOut} Contracts Finder notice{cfFilteredOut === 1 ? "" : "s"} were removed by the current keyword, procurement-stage, type, or status filters.
              </div>
            ) : null}
            {ftsFilteredOut > 0 ? (
              <div>
                {ftsFilteredOut} Find a Tender notice{ftsFilteredOut === 1 ? "" : "s"} were removed by the current keyword, procurement-stage, type, or status filters.
              </div>
            ) : null}
            <div>Clear the filter fields or adjust the values above to include them.</div>
          </div>
        ) : null}
        {counts && (
          (counts.cf.available > counts.cf.retrieved) ||
          (counts.fts.requested !== false &&
            counts.fts.active !== false &&
            counts.fts.available > counts.fts.retrieved)
        ) ? (
          <div style={{ marginBottom: 12, fontSize: 12, color: "#b45309", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 6, padding: "8px 12px" }}>
            Some sources returned more records than were fetched. Refine your filters to load the remaining notices.
          </div>
        ) : null}

        <div style={{ overflowX: "auto", background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(15,23,42,0.08)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 840 }}>
            <thead style={{ background: "#f1f5f9" }}>
              <tr>
                <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 600 }}>Title</th>
                <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 600, width: 120 }}>Type</th>
                <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 600, width: 120 }}>Status</th>
                <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 600, width: 220 }}>Organisation</th>
                <th style={{ textAlign: "right", padding: "12px 16px", fontWeight: 600, width: 160 }}>Value</th>
                <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 600, width: 120 }}>Published</th>
                <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 600, width: 120 }}>Deadline</th>
                <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 600, width: 100 }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "24px 16px", textAlign: "center", color: "#64748b" }}>
                    {loading ? "Searching notices..." : "No notices matched the current filters."}
                  </td>
                </tr>
              ) : (
                items.map((notice, index) => {
                  const key =
                    notice.id !== undefined
                      ? String(notice.id)
                      : notice.link
                      ? notice.link
                      : `row-${index}`;
                  return (
                    <tr key={key} style={{ borderTop: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "12px 16px", verticalAlign: "top" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <a href={notice.link} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontWeight: 600 }}>
                            {notice.title}
                          </a>
                          {notice.cpvCodes ? (
                            <span style={{ fontSize: 12, color: "#64748b" }}>{notice.cpvCodes}</span>
                          ) : null}
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px" }}>{notice.noticeType || "--"}</td>
                      <td style={{ padding: "12px 16px" }}>{notice.noticeStatus || "--"}</td>
                      <td style={{ padding: "12px 16px" }}>{notice.organisationName || "--"}</td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        {formatCurrencyRange(notice.valueLow, notice.valueHigh, notice.awardedValue)}
                      </td>
                      <td style={{ padding: "12px 16px" }}>{formatDate(notice.publishedDate)}</td>
                      <td style={{ padding: "12px 16px" }}>{formatDate(notice.deadlineDate)}</td>
                      <td style={{ padding: "12px 16px" }}>{notice.source || "--"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
