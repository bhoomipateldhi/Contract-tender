'use client';
import React from 'react';

type Notice = {
  id?: string | number;
  parentId?: string | null;
  noticeIdentifier?: string | null;
  title: string;
  description?: string | null;
  noticeType?: string;
  noticeStatus?: string;
  source: string;
  organisationName?: string | null;
  organisationAddress?: string | null;
  cpvCodes?: string | null;
  cpvCodesExtended?: string | null;
  cpvDescription?: string | null;
  cpvDescriptionExpanded?: string | null;
  valueLow?: number | string | null;
  valueHigh?: number | string | null;
  awardedValue?: number | string | null;
  awardedSupplier?: string | null;
  publishedDate?: string;
  deadlineDate?: string;
  awardedDate?: string;
  approachMarketDate?: string | null;
  start?: string | null;
  end?: string | null;
  lastNotifiableUpdate?: string | null;
  postcode?: string | null;
  region?: string | null;
  regionText?: string | null;
  coordinates?: string | null;
  isSuitableForSme?: boolean | null;
  isSuitableForVco?: boolean | null;
  awardedToSme?: boolean | null;
  awardedToVcse?: boolean | null;
  procurementStage?: string | null;
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
  nextCursor?: string | null;
};

type SearchCounts = {
  total: number;
  cf: SourceCounts;
  fts: SourceCounts;
};

const ALL_TYPES = ["Contract", "Opportunity", "EarlyEngagement", "FutureOpportunity"] as const;
const ALL_STATUSES = ["Open", "Closed", "Awarded"] as const;
const DEFAULT_SOURCES = ["CF", "FTS"] as const;
const SOURCE_LABELS: Record<string, string> = {
  CF: "Contracts Finder",
  FTS: "Find a Tender"
};
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

const GBP_FORMATTER = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0
});

function formatCurrencyValue(value?: number | string | null) {
  const numeric = normaliseNumber(value);
  return numeric === null ? null : GBP_FORMATTER.format(numeric);
}

function formatCurrencyRange(valueLow?: number | string | null, valueHigh?: number | string | null, awarded?: number | string | null) {
  const lowText = formatCurrencyValue(valueLow);
  const highText = formatCurrencyValue(valueHigh);
  const awardedText = formatCurrencyValue(awarded);

  if (lowText && highText) return `${lowText} - ${highText}`;
  if (lowText) return lowText;
  if (highText) return highText;
  if (awardedText) return `Awarded ${awardedText}`;
  return "--";
}

function formatDate(value?: string | null) {
  if (!value || value.includes("0001-01-01")) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString();
}

function formatBoolean(value?: boolean | null) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "--";
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

function getNoticeRowId(notice: Notice, index: number) {
  if (notice.id !== undefined && notice.id !== null) return String(notice.id);
  if (notice.link) return notice.link;
  return `row-${index}`;
}

export default function Home() {
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<Notice[]>([]);
  const [selectedNoticeId, setSelectedNoticeId] = React.useState<string | null>(null);
  const [resultCount, setResultCount] = React.useState(0);
  const [counts, setCounts] = React.useState<SearchCounts | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Calculate default date range: last 7 days ending today
  const getDefaultDateTo = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };
  
  const getDefaultDateFrom = () => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);
    return weekAgo.toISOString().split('T')[0];
  };

  const [keywords, setKeywords] = React.useState(DEFAULT_KEYWORDS);
  const [types, setTypes] = React.useState<string[]>(() => [...DEFAULT_TYPES]);
  const [statuses, setStatuses] = React.useState<string[]>(() => [...DEFAULT_STATUSES]);
  const [procurementStages, setProcurementStages] = React.useState<string[]>(() => [...DEFAULT_PROCUREMENT_STAGES]);
  const [dateFrom, setDateFrom] = React.useState(() => getDefaultDateFrom());
  const [dateTo, setDateTo] = React.useState(() => getDefaultDateTo());
  const [sources, setSources] = React.useState<string[]>(() => [...DEFAULT_SOURCES]);
  const detailPanelRef = React.useRef<HTMLDivElement | null>(null);

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
          setSelectedNoticeId(null);
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

  const handleSelectNotice = React.useCallback((rowId: string) => {
    setSelectedNoticeId(prev => (prev === rowId ? null : rowId));
  }, []);

  const handleCloseDetails = React.useCallback(() => {
    setSelectedNoticeId(null);
  }, []);

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

  const selectedSourceOption = React.useMemo(() => {
    const hasCF = sources.includes("CF");
    const hasFTS = sources.includes("FTS");
    if (hasCF && hasFTS) return "ALL";
    if (hasFTS) return "FTS";
    return "CF";
  }, [sources]);

  const handleSourceSelect = React.useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value === "ALL") {
      setSources([...DEFAULT_SOURCES]);
    } else if (value === "FTS") {
      setSources(["FTS"]);
    } else {
      setSources(["CF"]);
    }
  }, []);

  const resetFilters = React.useCallback(() => {
    setKeywords(DEFAULT_KEYWORDS);
    setTypes([...DEFAULT_TYPES]);
    setStatuses([...DEFAULT_STATUSES]);
    setProcurementStages([...DEFAULT_PROCUREMENT_STAGES]);
    setDateFrom(getDefaultDateFrom());
    setDateTo(getDefaultDateTo());
    setSources([...DEFAULT_SOURCES]);
  }, []);

  const hasCustomFilters = React.useMemo(() => {
    if (keywords !== DEFAULT_KEYWORDS) return true;
    if (dateFrom !== getDefaultDateFrom() || dateTo !== getDefaultDateTo()) return true;

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

  const activeFilterChips = React.useMemo(() => {
    const chips: { key: string; label: string }[] = [];

    if (keywords !== DEFAULT_KEYWORDS) {
      const trimmed = keywords.trim();
      const display = trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
      chips.push({ key: "keywords", label: `Keywords: ${display || "(cleared)"}` });
    }

    if (dateFrom || dateTo) {
      if (dateFrom && dateTo) {
        chips.push({ key: "dateRange", label: `Dates: ${dateFrom} → ${dateTo}` });
      } else if (dateFrom) {
        chips.push({ key: "dateFrom", label: `From: ${dateFrom}` });
      } else if (dateTo) {
        chips.push({ key: "dateTo", label: `To: ${dateTo}` });
      }
    }

    const typeSet = new Set(types);
    const typesChanged =
      types.length !== DEFAULT_TYPES.length ||
      DEFAULT_TYPES.some(type => !typeSet.has(type));
    if (typesChanged) {
      chips.push({
        key: "types",
        label: `Types: ${types.length ? types.join(", ") : "None"}`
      });
    }

    const statusSet = new Set(statuses);
    const statusesChanged =
      statuses.length !== DEFAULT_STATUSES.length ||
      DEFAULT_STATUSES.some(status => !statusSet.has(status));
    if (statusesChanged) {
      chips.push({
        key: "statuses",
        label: `Statuses: ${statuses.length ? statuses.join(", ") : "None"}`
      });
    }

    const stageSet = new Set(procurementStages);
    const stagesChanged =
      procurementStages.length !== DEFAULT_PROCUREMENT_STAGES.length ||
      DEFAULT_PROCUREMENT_STAGES.some(stage => !stageSet.has(stage));
    if (stagesChanged) {
      chips.push({
        key: "stages",
        label: `Stages: ${procurementStages.length ? procurementStages.join(", ") : "None"}`
      });
    }

    const sourceSet = new Set(sources);
    const sourcesChanged =
      sourceSet.size !== DEFAULT_SOURCES.length ||
      DEFAULT_SOURCES.some(source => !sourceSet.has(source));
    if (sourcesChanged) {
      const formattedSources = sources.length
        ? sources.map(value => SOURCE_LABELS[value] || value).join(", ")
        : "None";
      chips.push({ key: "sources", label: `Sources: ${formattedSources}` });
    }

    return chips;
  }, [keywords, dateFrom, dateTo, types, statuses, procurementStages, sources]);

  const selectedNotice = React.useMemo(() => {
    if (!selectedNoticeId) return null;
    return items.find((notice, index) => getNoticeRowId(notice, index) === selectedNoticeId) ?? null;
  }, [items, selectedNoticeId]);

  React.useEffect(() => {
    if (selectedNoticeId && detailPanelRef.current) {
      detailPanelRef.current.focus({ preventScroll: true });
    }
  }, [selectedNoticeId]);

  React.useEffect(() => {
    if (!selectedNoticeId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedNoticeId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedNoticeId]);

  React.useEffect(() => {
    if (!selectedNoticeId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedNoticeId]);

  const selectedNoticeDetails = React.useMemo(() => {
    if (!selectedNotice) return null;

    const sourceLabel = selectedNotice.source === "FTS" ? "TD" : selectedNotice.source || "--";
    const externalSourceName = selectedNotice.source === "FTS" ? "Find a Tender" : "Contracts Finder";
    const regionParts = [selectedNotice.regionText, selectedNotice.region]
      .map(part => (typeof part === "string" ? part.trim() : ""))
      .filter((part, partIndex, arr) => part && arr.indexOf(part) === partIndex);
    const regionSummary = regionParts.length ? regionParts.join(" / ") : "--";
    const coordinatesValue =
      selectedNotice.coordinates && selectedNotice.coordinates !== "0,0" ? selectedNotice.coordinates : null;
    const estimatedValue = formatCurrencyRange(selectedNotice.valueLow, selectedNotice.valueHigh, null);
    const awardedValueFormatted = formatCurrencyValue(selectedNotice.awardedValue) ?? "--";

    const detailItems: { label: string; value: string }[] = [
      { label: "Notice ID", value: selectedNotice.id !== undefined ? String(selectedNotice.id) : "--" },
      { label: "Notice reference", value: selectedNotice.noticeIdentifier || "--" },
      { label: "Notice type", value: selectedNotice.noticeType || "--" },
      { label: "Notice status", value: selectedNotice.noticeStatus || "--" },
      { label: "Procurement stage", value: selectedNotice.procurementStage || "--" },
      { label: "Published", value: formatDate(selectedNotice.publishedDate) },
      { label: "Deadline", value: formatDate(selectedNotice.deadlineDate) },
      { label: "Organisation", value: selectedNotice.organisationName || "--" },
      { label: "Estimated value", value: estimatedValue },
      { label: "Source", value: sourceLabel }
    ];

    if (selectedNotice.parentId) detailItems.push({ label: "Parent notice ID", value: selectedNotice.parentId });
    if (selectedNotice.awardedDate)
      detailItems.push({ label: "Awarded date", value: formatDate(selectedNotice.awardedDate) });
    if (selectedNotice.approachMarketDate)
      detailItems.push({ label: "Approach to market", value: formatDate(selectedNotice.approachMarketDate) });
    if (selectedNotice.start) detailItems.push({ label: "Start date", value: formatDate(selectedNotice.start) });
    if (selectedNotice.end) detailItems.push({ label: "End date", value: formatDate(selectedNotice.end) });
    if (selectedNotice.lastNotifiableUpdate)
      detailItems.push({ label: "Last updated", value: formatDate(selectedNotice.lastNotifiableUpdate) });
    if (selectedNotice.organisationAddress)
      detailItems.push({ label: "Organisation address", value: selectedNotice.organisationAddress });
    if (selectedNotice.postcode) detailItems.push({ label: "Postcode", value: selectedNotice.postcode });
    if (regionSummary !== "--") detailItems.push({ label: "Region", value: regionSummary });
    if (awardedValueFormatted !== "--") detailItems.push({ label: "Awarded value", value: awardedValueFormatted });
    if (selectedNotice.awardedSupplier)
      detailItems.push({ label: "Awarded supplier", value: selectedNotice.awardedSupplier });
    if (typeof selectedNotice.isSuitableForSme === "boolean")
      detailItems.push({ label: "Suitable for SME?", value: formatBoolean(selectedNotice.isSuitableForSme) });
    if (typeof selectedNotice.isSuitableForVco === "boolean")
      detailItems.push({ label: "Suitable for VCSE?", value: formatBoolean(selectedNotice.isSuitableForVco) });
    if (typeof selectedNotice.awardedToSme === "boolean")
      detailItems.push({ label: "Awarded to SME?", value: formatBoolean(selectedNotice.awardedToSme) });
    if (typeof selectedNotice.awardedToVcse === "boolean")
      detailItems.push({ label: "Awarded to VCSE?", value: formatBoolean(selectedNotice.awardedToVcse) });
    if (selectedNotice.cpvCodes) detailItems.push({ label: "CPV codes", value: selectedNotice.cpvCodes });
    if (selectedNotice.cpvCodesExtended)
      detailItems.push({ label: "CPV codes (extended)", value: selectedNotice.cpvCodesExtended });
    if (selectedNotice.cpvDescription)
      detailItems.push({ label: "CPV description", value: selectedNotice.cpvDescription });
    if (selectedNotice.cpvDescriptionExpanded)
      detailItems.push({ label: "CPV description (extended)", value: selectedNotice.cpvDescriptionExpanded });
    if (coordinatesValue) detailItems.push({ label: "Coordinates", value: coordinatesValue });

    const description =
      typeof selectedNotice.description === "string" && selectedNotice.description.trim().length > 0
        ? selectedNotice.description.trim()
        : null;

    const stageLabel = selectedNotice.procurementStage || "--";

    return {
      detailItems,
      description,
      externalSourceName,
      sourceLabel,
      stageLabel
    };
  }, [selectedNotice]);

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
  const cfSummaryText = counts
    ? counts.cf.requested === false
      ? "disabled in source filters"
      : formatSourceSummary(counts.cf)
    : "";
  const ftsSummaryText = counts
    ? counts.fts.requested === false
      ? "disabled in source filters"
      : counts.fts.active === false
        ? "API key not configured"
        : formatSourceSummary(counts.fts)
    : "";

  const handleExportCsv = React.useCallback(async () => {
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items, format: "csv" })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to export CSV.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "opportunities.csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      const errorObject = err as Error;
      console.error(errorObject);
      setError(errorObject.message || "Unable to export CSV.");
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
            <select
              value={selectedSourceOption}
              onChange={handleSourceSelect}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", color: "#111" }}
            >
              <option value="ALL">Contracts Finder + Find a Tender</option>
              <option value="CF">Contracts Finder only</option>
              <option value="FTS">Find a Tender only</option>
            </select>
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
            onClick={handleExportCsv}
            disabled={!items.length || loading}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "1px solid #10b981",
              background: !items.length || loading ? "#e2e8f0" : "#10b981",
              color: !items.length || loading ? "#94a3b8" : "#fff",
              fontWeight: 500,
              cursor: !items.length || loading ? "not-allowed" : "pointer"
            }}
          >
            Export CSV (Template)
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
        {counts && counts.fts.requested !== false && counts.fts.active === false ? (
          <div style={{ marginBottom: 12, fontSize: 12, color: "#b91c1c" }}>
            Find a Tender data requires an FTS API key; no tender notices were retrieved.
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
          (counts.cf.requested !== false && counts.cf.available > counts.cf.retrieved) ||
          (counts.fts.requested !== false &&
            counts.fts.active !== false &&
            counts.fts.available > counts.fts.retrieved)
        ) ? (
          <div style={{ marginBottom: 12, fontSize: 12, color: "#b45309", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 6, padding: "8px 12px" }}>
            Some sources returned more records than were fetched. Refine your filters to load the remaining notices.
          </div>
        ) : null}

        {activeFilterChips.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {activeFilterChips.map(chip => (
              <span
                key={chip.key}
                style={{
                  background: "#e2e8f0",
                  color: "#0f172a",
                  padding: "6px 12px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: 0.2
                }}
              >
                {chip.label}
              </span>
            ))}
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
                  const rowId = getNoticeRowId(notice, index);
                  const sourceLabel = notice.source === "FTS" ? "TD" : notice.source || "--";
                  const isFtsNotice = notice.source === "FTS";
                  const isSelected = selectedNoticeId === rowId;
                  const rowBackground = isSelected ? "#dbeafe" : isFtsNotice ? "#fff7ed" : "transparent";

                  return (
                    <tr key={rowId} style={{ borderTop: "1px solid #e2e8f0", background: rowBackground }}>
                      <td style={{ padding: "12px 16px", verticalAlign: "top" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <a href={notice.link} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontWeight: 600 }}>
                              {notice.title || "Untitled notice"}
                            </a>
                            {notice.cpvCodes ? (
                              <span style={{ fontSize: 12, color: "#64748b" }}>{notice.cpvCodes}</span>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSelectNotice(rowId)}
                            aria-pressed={isSelected}
                            style={{
                              alignSelf: "flex-start",
                              fontSize: 13,
                              fontWeight: 600,
                              color: isSelected ? "#1d4ed8" : "#1f2937",
                              background: "transparent",
                              border: "none",
                              padding: 0,
                              textDecoration: "underline",
                              cursor: "pointer"
                            }}
                          >
                            {isSelected ? "Hide details" : "View more"}
                          </button>
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
                      <td style={{ padding: "12px 16px" }}>{sourceLabel}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {selectedNotice && selectedNoticeDetails ? (
          <div
            role="presentation"
            onClick={handleCloseDetails}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.35)",
              backdropFilter: "blur(2px)",
              zIndex: 1000,
              display: "flex",
              justifyContent: "flex-end"
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={`notice-panel-title-${selectedNoticeId ?? "current"}`}
              ref={detailPanelRef}
              tabIndex={-1}
              onClick={event => event.stopPropagation()}
              style={{
                width: "min(440px, 90vw)",
                height: "100%",
                background: "#fff",
                boxShadow: "-8px 0 24px rgba(15,23,42,0.18)",
                padding: "24px 24px 32px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 20,
                overflowY: "auto"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#2563eb" }}>
                      {selectedNoticeDetails.stageLabel}
                    </span>
                    <span style={{ fontSize: 12, color: "#64748b" }}>{selectedNoticeDetails.sourceLabel}</span>
                  </div>
                  <a
                    id={`notice-panel-title-${selectedNoticeId ?? "current"}`}
                    href={selectedNotice.link}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#1f2937", fontWeight: 700, fontSize: 18, lineHeight: 1.3 }}
                  >
                    {selectedNotice.title || "Untitled notice"}
                  </a>
                  {selectedNotice.organisationName ? (
                    <span style={{ fontSize: 13, color: "#475569" }}>{selectedNotice.organisationName}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleCloseDetails}
                  aria-label="Close details"
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#475569",
                    fontSize: 20,
                    fontWeight: 600,
                    cursor: "pointer",
                    lineHeight: 1
                  }}
                >
                  X
                </button>
              </div>
              {selectedNoticeDetails.description ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
                    Description
                  </span>
                  <div style={{ fontSize: 14, lineHeight: 1.5, color: "#0f172a", whiteSpace: "pre-line" }}>
                    {selectedNoticeDetails.description}
                  </div>
                </div>
              ) : null}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                {selectedNoticeDetails.detailItems.map(item => (
                  <div key={item.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700 }}>
                      {item.label}
                    </span>
                    <span style={{ fontSize: 14, color: "#0f172a" }}>{item.value}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                <a
                  href={selectedNotice.link}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#2563eb", fontWeight: 600, textDecoration: "none" }}
                >
                  View full notice on {selectedNoticeDetails.externalSourceName}
                </a>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>Opens in a new tab</span>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
