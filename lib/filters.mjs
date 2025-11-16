import { containsAuthorityKeyword } from "./fts.mjs";

const STAGE_LABELS = {
  pipeline: "Pipeline",
  planning: "Planning",
  tender: "Tender",
  award: "Award",
  contract: "Contract",
  termination: "Termination"
};

const STAGE_MATCHERS = [
  { token: "pipeline", patterns: ["pipeline", "futureopportunity"] },
  { token: "planning", patterns: ["planning", "preprocurement", "priorinformation", "earlyengagement"] },
  { token: "tender", patterns: ["tender", "contractnotice", "callforcompetition", "competition", "corrigendum", "voluntaryexantetransparencynotice"] },
  { token: "award", patterns: ["award", "contractaward"] },
  { token: "contract", patterns: ["contract", "implementation"] },
  { token: "termination", patterns: ["termination", "terminate", "cancel", "closed"] }
];

const TYPE_ALIAS = {
  contract: "contract",
  opportunity: "contract",
  pipeline: "pipeline",
  futureopportunity: "pipeline",
  preprocurement: "preprocurement",
  earlyengagement: "preprocurement"
};

export function applyFilters(
  notices,
  {
    keywords = [],
    types = [],
    statuses = [],
    procurementStages = [],
    dateFrom,
    dateTo,
    valueFrom,
    valueTo,
    sources = []
  } = {}
) {
  const kw = keywords.map(value => value.toLowerCase()).filter(Boolean);
  const typeSet = new Set(types.map(normaliseContractsFinderType).filter(Boolean));
  const statusSet = new Set(statuses.map(value => value.toLowerCase()).filter(Boolean));
  const stageSet = new Set(procurementStages.map(normaliseProcurementStageToken).filter(Boolean));
  const minValue = typeof valueFrom === "number" ? valueFrom : valueFrom ? Number(valueFrom) : null;
  const maxValue = typeof valueTo === "number" ? valueTo : valueTo ? Number(valueTo) : null;

  const fromTime = dateFrom ? normaliseDateStart(dateFrom) : null;
  const toTime = dateTo ? normaliseDateEnd(dateTo) : null;
  const sourceSet = new Set(
    sources
      .map(source => String(source || "").toUpperCase())
      .flatMap(value => {
        if (!value) return [];
        if (value === "FTS") return ["FTS", "TD"];
        if (value === "TD") return ["FTS", "TD"];
        return [value];
      })
  );

  return notices.filter(notice => {
    const noticeSource = String(notice.source || "").toUpperCase();
    const isContractsFinder = noticeSource === "CF" || noticeSource === "CONTRACTS FINDER";
    const isFindATender = noticeSource === "FTS" || noticeSource === "TD" || noticeSource === "FIND A TENDER";

    if (sourceSet.size && !sourceSet.has(noticeSource)) return false;

    const stageLabel = deriveProcurementStage(notice);
    if (stageSet.size) {
      const stageToken = normaliseProcurementStageToken(stageLabel);
      if (stageToken && !stageSet.has(stageToken)) return false;
    }

    if (typeSet.size && isContractsFinder) {
      const noteType = normaliseContractsFinderType(notice.noticeType || "");
      if (!noteType || !typeSet.has(noteType)) return false;
    }

    if (statusSet.size && isContractsFinder) {
      const noteStatus = normaliseToken(notice.noticeStatus || "");
      if (!noteStatus || !statusSet.has(noteStatus)) return false;
    }

    if (isFindATender && kw.length) {
      const blob = buildSearchableBlob(notice);
      if (!kw.some(token => blob.includes(token))) return false;
      if (!matchesAuthorityKeywords(notice)) return false;
    }

    if (fromTime || toTime) {
      let candidate = parseDateSafe(notice.publishedDate);
      if (candidate === null) {
        const fallbackDates = [notice.lastNotifiableUpdate, notice.awardedDate, notice.deadlineDate]
          .map(parseDateSafe)
          .filter(value => value !== null);
        candidate = fallbackDates.length ? fallbackDates[0] : null;
      }
      if (candidate === null) return false;
      if (fromTime && candidate < fromTime) return false;
      if (toTime && candidate > toTime) return false;
    }

    if (minValue !== null || maxValue !== null) {
      const numericValues = [notice.valueLow, notice.valueHigh, notice.awardedValue]
        .map(parseNumberSafe)
        .filter(value => value !== null);

      if (numericValues.length) {
        const withinRange = numericValues.some(current => {
          if (minValue !== null && current < minValue) return false;
          if (maxValue !== null && current > maxValue) return false;
          return true;
        });
        if (!withinRange) return false;
      }
    }

    return true;
  });
}

export function deriveProcurementStage(notice) {
  if (!notice || typeof notice !== "object") return "";

  const explicitToken = normaliseProcurementStageToken(notice.procurementStage);
  if (explicitToken) return STAGE_LABELS[explicitToken];

  const source = String(notice.source || "").toUpperCase();
  const typeToken = normaliseContractsFinderType(notice.noticeType || "");
  const statusToken = normaliseToken(notice.noticeStatus || "");

  if (source === "CF" || source === "CONTRACTS FINDER") {
    if (typeToken === "pipeline") return STAGE_LABELS.pipeline;
    if (typeToken === "preprocurement") return STAGE_LABELS.planning;
    if (statusToken === "open") return STAGE_LABELS.tender;
    if (statusToken === "awarded") {
      return hasContractTiming(notice) ? STAGE_LABELS.contract : STAGE_LABELS.award;
    }
    if (statusToken === "closed") return STAGE_LABELS.termination;
  }

  const candidates = collectStageCandidates(notice);
  if (typeToken) candidates.unshift(typeToken);
  if (statusToken) candidates.push(statusToken);

  const resolved = resolveStageToken(candidates);
  if (resolved) return STAGE_LABELS[resolved];

  if (source === "CF" || source === "CONTRACTS FINDER") {
    if (typeToken === "contract") return STAGE_LABELS.tender;
  }

  return "";
}

function buildSearchableBlob(notice) {
  return [
    notice.title || "",
    notice.description || "",
    notice.cpvCodes || "",
    notice.organisationName || "",
    notice.organisationAddress || "",
    notice.regionText || "",
    notice.region || "",
    notice.noticeIdentifier || ""
  ]
    .join(" ")
    .toLowerCase();
}

function collectStageCandidates(notice) {
  const values = [];
  const push = value => {
    if (value === null || value === undefined || value === "") return;
    if (Array.isArray(value)) {
      value.forEach(push);
      return;
    }
    const token = normaliseToken(value);
    if (token) values.push(token);
  };

  push(notice.procurementStage);
  push(notice.noticeStage);
  push(notice.stage);
  push(notice.stageName);
  push(notice.noticeType);
  push(notice.noticeStatus);
  push(notice.type);
  push(notice.status);
  push(notice.tags);

  if (notice.awardedDate || notice.awardedValue) push("award");
  if (hasContractTiming(notice)) push("contract");
  if (notice.end || notice.contractEnd || notice.contractEndDate || notice.terminationDate) push("termination");

  return values;
}

function resolveStageToken(values) {
  for (const { token, patterns } of STAGE_MATCHERS) {
    if (
      values.some(candidate =>
        patterns.some(pattern => candidate.includes(pattern))
      )
    ) {
      return token;
    }
  }
  return "";
}

function normaliseContractsFinderType(value) {
  const token = normaliseToken(value);
  if (!token) return "";
  return TYPE_ALIAS[token] || token;
}

function normaliseProcurementStageToken(value) {
  const token = normaliseToken(value);
  if (!token) return "";
  if (STAGE_LABELS[token]) return token;
  const resolved = resolveStageToken([token]);
  return resolved;
}

function parseDateSafe(value) {
  if (!value) return null;
  const millis = Date.parse(value);
  return Number.isNaN(millis) ? null : millis;
}

function parseNumberSafe(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
}

function normaliseDateStart(value) {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed)) {
    const fallback = Date.parse(value);
    return Number.isNaN(fallback) ? null : fallback;
  }
  return parsed;
}

function normaliseDateEnd(value) {
  const parsed = Date.parse(`${value}T23:59:59Z`);
  if (Number.isNaN(parsed)) {
    const fallback = Date.parse(value);
    return Number.isNaN(fallback) ? null : fallback;
  }
  return parsed;
}

function normaliseToken(value) {
  if (!value && value !== 0) return "";
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function matchesAuthorityKeywords(notice) {
  const haystacks = [
    notice.organisationName,
    notice.organisationAddress,
    notice.title,
    notice.description,
    notice.regionText,
    notice.region
  ];
  return haystacks.some(value => containsAuthorityKeyword(value));
}

function hasContractTiming(notice) {
  const fields = [
    notice.start,
    notice.contractStart,
    notice.contractStartDate,
    notice.contractPeriodStart,
    notice.contract?.period?.startDate
  ];
  return fields.some(value => Boolean(value));
}
