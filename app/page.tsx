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
        chips.push({ key: "dateRange", label: `Dates: ${dateFrom} â†’ ${dateTo}` });
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
    <div className="mx-auto max-w-[1200px] px-4 py-6">
      <header className="mb-5">
        <h1 className="mb-2 text-[28px]">NHS Procurement Alerts</h1>
        <p className="m-0 opacity-75">
          Search Contracts Finder and Find a Tender. Filters update automatically; adjust keywords, procurement stage, type, status, or date range to refine the feed.
        </p>
      </header>

      <section className="mb-6 rounded-xl bg-[#f5f7fb] p-5 shadow-[0_1px_3px_rgba(15,23,42,0.08)] text-[#111]">
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">Keywords (CSV)</span>
            <input
              value={keywords}
              onChange={event => setKeywords(event.target.value)}
              placeholder="e.g. nhs, digital, cloud"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">Date from</span>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={event => setDateFrom(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">Date to</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={event => setDateTo(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5"
            />
          </label>
        </div>

        <div className="mt-5 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          <div>
            <div className="mb-2 font-semibold">Types</div>
            <div className="flex flex-wrap gap-3">
              {ALL_TYPES.map(type => (
                <label key={type} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={types.includes(type)} onChange={() => toggleType(type)} />
                  {type}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 font-semibold">Statuses</div>
            <div className="flex flex-wrap gap-3">
              {ALL_STATUSES.map(status => (
                <label key={status} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={statuses.includes(status)} onChange={() => toggleStatus(status)} />
                  {status}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 font-semibold">Sources</div>
            <select
              value={selectedSourceOption}
              onChange={handleSourceSelect}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[#111]"
            >
              <option value="ALL">Contracts Finder + Find a Tender</option>
              <option value="CF">Contracts Finder only</option>
              <option value="FTS">Find a Tender only</option>
            </select>
          </div>
          <div>
            <div className="mb-2 font-semibold">Procurement stage</div>
            <div className="flex flex-wrap gap-3">
              {PROCUREMENT_STAGE_OPTIONS.map(option => (
                <label key={option.value} className="flex items-center gap-1.5 text-sm">
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

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={handleManualRefresh}
            disabled={loading}
            className={`rounded-lg px-[18px] py-[10px] font-semibold text-white transition-colors ${
              loading ? "cursor-not-allowed bg-slate-400" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loading ? "Searching..." : "Refresh Now"}
          </button>
          <button
            onClick={resetFilters}
            disabled={!hasCustomFilters}
            className={`rounded-lg border px-[18px] py-[10px] font-medium text-slate-800 transition-colors ${
              hasCustomFilters
                ? "cursor-pointer border-slate-300 bg-white hover:bg-slate-50"
                : "cursor-not-allowed border-slate-300 bg-slate-200"
            }`}
          >
            Reset Filters
          </button>
          <button
            onClick={handleExportExcel}
            disabled={!items.length || loading}
            className={`rounded-lg border px-[18px] py-[10px] font-medium text-slate-800 transition-colors ${
              !items.length || loading
                ? "cursor-not-allowed border-slate-300 bg-slate-200"
                : "cursor-pointer border-slate-300 bg-white hover:bg-slate-50"
            }`}
          >
            Export Excel
          </button>
          <button
            onClick={handleExportCsv}
            disabled={!items.length || loading}
            className={`rounded-lg border px-[18px] py-[10px] font-medium transition-colors ${
              !items.length || loading
                ? "cursor-not-allowed border-emerald-500 bg-slate-200 text-slate-400"
                : "cursor-pointer border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600"
            }`}
          >
            Export CSV (Template)
          </button>
        </div>
      </section>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-100 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold">
            {loading ? "Loading results..." : `${resultCount} result${resultCount === 1 ? "" : "s"}`}
          </div>
        </div>
        {counts ? (
          <div className="mb-3 flex flex-wrap gap-4 rounded-lg bg-slate-800 px-3.5 py-2.5 text-[13px] text-white">
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
          <div className="mb-3 text-xs text-red-700">
            Find a Tender data requires an FTS API key; no tender notices were retrieved.
          </div>
        ) : null}
        {counts && (cfFilteredOut > 0 || ftsFilteredOut > 0) ? (
          <div className="mb-3 flex flex-col gap-1 rounded-md border border-red-200 bg-red-100 px-3 py-2 text-xs text-red-700">
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
          <div className="mb-3 rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-xs text-amber-700">
            Some sources returned more records than were fetched. Refine your filters to load the remaining notices.
          </div>
        ) : null}

        {activeFilterChips.length ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {activeFilterChips.map(chip => (
              <span
                key={chip.key}
                className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-semibold tracking-[0.2px] text-slate-900"
              >
                {chip.label}
              </span>
            ))}
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-xl bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)] text-[#111]">
          <table className="w-full min-w-[840px] border-collapse">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Title</th>
                <th className="w-[120px] px-4 py-3 text-left font-semibold">Type</th>
                <th className="w-[120px] px-4 py-3 text-left font-semibold">Status</th>
                <th className="w-[220px] px-4 py-3 text-left font-semibold">Organisation</th>
                <th className="w-[160px] px-4 py-3 text-right font-semibold">Value</th>
                <th className="w-[120px] px-4 py-3 text-left font-semibold">Published</th>
                <th className="w-[120px] px-4 py-3 text-left font-semibold">Deadline</th>
                <th className="w-[100px] px-4 py-3 text-left font-semibold">Source</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                    {loading ? "Searching notices..." : "No notices matched the current filters."}
                  </td>
                </tr>
              ) : (
                items.map((notice, index) => {
                  const rowId = getNoticeRowId(notice, index);
                  const sourceLabel = notice.source === "FTS" ? "TD" : notice.source || "--";
                  const isFtsNotice = notice.source === "FTS";
                  const isSelected = selectedNoticeId === rowId;
                  const rowClassName = `border-t border-slate-200 ${
                    isSelected ? "bg-blue-100" : isFtsNotice ? "bg-orange-50" : "bg-transparent"
                  }`;

                  return (
                    <tr key={rowId} className={rowClassName}>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col gap-1">
                            <a href={notice.link} target="_blank" rel="noreferrer" className="font-semibold text-blue-600">
                              {notice.title || "Untitled notice"}
                            </a>
                            {notice.cpvCodes ? (
                              <span className="text-xs text-slate-500">{notice.cpvCodes}</span>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSelectNotice(rowId)}
                            aria-pressed={isSelected}
                            className={`self-start text-[13px] font-semibold underline transition-colors ${
                              isSelected ? "text-blue-700" : "text-slate-800"
                            }`}
                          >
                            {isSelected ? "Hide details" : "View more"}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">{notice.noticeType || "--"}</td>
                      <td className="px-4 py-3">{notice.noticeStatus || "--"}</td>
                      <td className="px-4 py-3">{notice.organisationName || "--"}</td>
                      <td className="px-4 py-3 text-right">
                        {formatCurrencyRange(notice.valueLow, notice.valueHigh, notice.awardedValue)}
                      </td>
                      <td className="px-4 py-3">{formatDate(notice.publishedDate)}</td>
                      <td className="px-4 py-3">{formatDate(notice.deadlineDate)}</td>
                      <td className="px-4 py-3">{sourceLabel}</td>
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
            className="fixed inset-0 z-[1000] flex justify-end bg-slate-900/35 backdrop-blur-sm"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={`notice-panel-title-${selectedNoticeId ?? "current"}`}
              ref={detailPanelRef}
              tabIndex={-1}
              onClick={event => event.stopPropagation()}
              className="flex h-full w-[min(440px,90vw)] flex-col gap-5 overflow-y-auto bg-white px-6 pb-8 pt-6 shadow-[-8px_0_24px_rgba(15,23,42,0.18)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.4px] text-blue-600">
                      {selectedNoticeDetails.stageLabel}
                    </span>
                    <span className="text-xs text-slate-500">{selectedNoticeDetails.sourceLabel}</span>
                  </div>
                  <a
                    id={`notice-panel-title-${selectedNoticeId ?? "current"}`}
                    href={selectedNotice.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[18px] font-bold leading-[1.3] text-slate-800"
                  >
                    {selectedNotice.title || "Untitled notice"}
                  </a>
                  {selectedNotice.organisationName ? (
                    <span className="text-[13px] text-slate-600">{selectedNotice.organisationName}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleCloseDetails}
                  aria-label="Close details"
                  className="text-xl font-semibold leading-none text-slate-600 transition-colors hover:text-slate-800"
                >
                  X
                </button>
              </div>
              {selectedNoticeDetails.description ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.4px] text-slate-500">
                    Description
                  </span>
                  <div className="whitespace-pre-line text-sm leading-6 text-slate-900">
                    {selectedNoticeDetails.description}
                  </div>
                </div>
              ) : null}
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
                {selectedNoticeDetails.detailItems.map(item => (
                  <div key={item.label} className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-slate-500">
                      {item.label}
                    </span>
                    <span className="text-sm text-slate-900">{item.value}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={selectedNotice.link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 font-semibold text-blue-600 hover:underline"
                >
                  View full notice on {selectedNoticeDetails.externalSourceName}
                </a>
                <span className="text-xs text-slate-400">Opens in a new tab</span>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

