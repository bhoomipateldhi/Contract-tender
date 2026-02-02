import { TenderRelease, FetchTendersParams, FetchTendersPageParams } from "./types";
export * from "./types";

const UK_FIND_TENDER_API = "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages";

export const TENDER_STAGES = [
  { value: "planning", label: "Planning" },
  { value: "tender", label: "Tender" },
  { value: "award", label: "Award" }
] as const;

export function getSuppliers(release: TenderRelease) {
  const fromAwards =
    release.awards?.flatMap(award => award.suppliers || []).map(s => s?.name).filter(Boolean) || [];
  const fromParties =
    release.parties?.filter(party => party.roles?.includes("supplier")).map(p => p.name).filter(Boolean) || [];
  return Array.from(new Set([...fromAwards, ...fromParties]));
}

export function getBuyer(release: TenderRelease) {
  const fromBuyer = release.buyer?.name;
  if (fromBuyer) return fromBuyer;
  const buyerParty = release.parties?.find(party => party.roles?.includes("buyer"));
  return buyerParty?.name || "";
}

export function applyKeywordFilter(releases: TenderRelease[], keyword: string) {
  const token = keyword.trim().toLowerCase();
  if (!token) return releases;
  return releases.filter(release => {
    const blob = [
      release.tender?.title,
      release.tender?.description,
      getBuyer(release),
      getSuppliers(release).join(" "),
      release.ocid,
      release.id
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return blob.includes(token);
  });
}

export async function fetchTenders(options: FetchTendersParams = {}): Promise<TenderRelease[]> {
  const date = options.date || new Date().toISOString().slice(0, 10);
  const maxPages = 50;
  const delayMs = 200;
  const stages = options.stages;

  const startIso = `${date}T00:00:00Z`;
  const endIso = `${date}T23:59:59Z`;
  let currentTo = endIso;
  const all: TenderRelease[] = [];
  const seen = new Set<string>();
  let page = 0;

  while (page < maxPages) {
    const releases = await fetchTendersPage({ updatedTo: currentTo, stages });
    if (!releases.length) break;

    for (const release of releases) {
      const key = release.id || release.ocid;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);

      const releaseDate = parseDateSafe(release.date);
      if (releaseDate !== null && releaseDate >= Date.parse(startIso) && releaseDate <= Date.parse(endIso)) {
        // Enrich with noticeType
        release.procurement_type = getNoticeType(release);
        all.push(release);
      }
    }

    const oldest = findOldestReleaseDate(releases);
    if (!oldest) break;

    if (Date.parse(oldest) < Date.parse(startIso)) break;

    const nextTo = subtractIsoMillis(oldest, 1);
    if (!nextTo || nextTo === currentTo) break;

    currentTo = nextTo;
    page += 1;
    await delay(delayMs);
  }

  return all;
}

// Based on https://www.find-tender.service.gov.uk/Home/NoticeTypes
// and user requested mapping:
// Pipeline: UK1
// Planning: UK2, UK3
// Tender: UK4
// Award: UK6
// Contract: UK7
// Termination: UK11, UK12
// Others can map to reasonably close buckets or be ignored/kept as code if preferred,
// but for this specific request we map to the user's specific buckets.

const NOTICE_TYPE_MAPPING: Record<string, string> = {
  // Procurement Act 2023 notice types
  "UK1": "pipeline-notice",
  "UK2": "preliminary-market-engagement-notice",
  "UK3": "planned-procurement-notice",
  "UK4": "tender-notice",
  "UK5": "transparency-notice",
  "UK6": "contract-award-notice",
  "UK7": "contract-details-notice",
  "UK10": "contract-change-notice",
  "UK11": "contract-termination-notice",
  "UK12": "procurement-termination-notice",
  "UK13": "dynamic-market-intention-notice",
  "UK14": "dynamic-market-establishment-notice",
  "UK15": "dynamic-market-modification-notice",
  "UK16": "dynamic-market-cessation-notice",
  
  // Legacy mappings (approximate)
  "F01": "prior-information-notice", // Approx UK1/UK3
  "F02": "contract-notice", // Approx UK4
  "F03": "contract-award-notice", // Approx UK6
  "F06": "contract-award-notice",
  "F20": "contract-modification-notice", // Approx UK10
  "F21": "social-and-other-specific-services-public-contracts", // Planning/Tender hybrid
};

export function getNoticeType(release: TenderRelease): string | undefined {
  let foundType: string | undefined;

  // Helper to find type in a list of documents
  const findInDocs = (docs?: { noticeType?: string }[]) => {
    return docs?.find(d => d.noticeType)?.noticeType;
  };

  // 1. Try to find explicit UK notice type in any documents section
  // Priority: Contracts -> Awards -> Tender -> Planning
  // usually the latest stage is what we want.
  
  if (release.contracts) {
    for (const contract of release.contracts) {
      const type = findInDocs(contract.documents);
      if (type) {
        foundType = type;
        break;
      }
    }
  }

  if (!foundType && release.awards) {
    for (const award of release.awards) {
      const type = findInDocs(award.documents);
      if (type) {
        foundType = type;
        break;
      }
    }
  }

  if (!foundType && release.tender) {
    foundType = findInDocs(release.tender.documents);
  }

  if (!foundType && release.planning) {
    foundType = findInDocs(release.planning.documents);
  }

  // 2. Map the found code to the user's label
  if (foundType) {
    const upper = foundType.toUpperCase();
    return NOTICE_TYPE_MAPPING[upper] || foundType;
  }

  // 3. Fallback to OCDS tags if no specific UK notice type found
  // This is explicit data provided by the API, so it is safe to use.
  if (release.tag && release.tag.length > 0) {
    // Priority map for tags (later stages override earlier ones)
    const TAG_MAPPING: Record<string, string> = {
      "planning": "planned-procurement-notice",
      "tender": "tender-notice",
      "award": "contract-award-notice",
      "contract": "contract-details-notice",
      "implementation": "contract-details-notice"
    };

    // Iterate through tags and find the most significant one
    // Usually the last tag is the most relevant, but let's be safe
    // Actually, taking the last one in the list is usually correct for OCDS
    const lastTag = release.tag[release.tag.length - 1];
    if (TAG_MAPPING[lastTag]) {
      return TAG_MAPPING[lastTag];
    }
  }

  return undefined;
}

async function fetchTendersPage(options: FetchTendersPageParams): Promise<TenderRelease[]> {
  const searchParams = new URLSearchParams();
  const safeLimit = options.limit ?? 100;
  if (options.updatedTo) searchParams.set("updatedTo", options.updatedTo);
  if (options.stages) {
    const values = Array.isArray(options.stages)
      ? options.stages
      : [String(options.stages).trim()];
    const stage = values.find(value => TENDER_STAGES.some(item => item.value === value));
    if (stage) searchParams.set("stages", stage);
  }
  searchParams.set("limit", String(safeLimit));
  const query = searchParams.toString();
  const url = query ? `${UK_FIND_TENDER_API}?${query}` : UK_FIND_TENDER_API;

  const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Find a Tender API ${response.status}`);
  }

  const data = (await response.json()) as { releases?: TenderRelease[] };
  return Array.isArray(data.releases) ? data.releases : [];
}

function findOldestReleaseDate(releases: TenderRelease[]): string | null {
  let oldest: string | null = null;
  let oldestTime = Number.POSITIVE_INFINITY;

  for (const release of releases) {
    const value = release?.date;
    if (!value) continue;
    const time = Date.parse(value);
    if (!Number.isFinite(time)) continue;
    if (time < oldestTime) {
      oldestTime = time;
      oldest = value;
    }
  }

  return oldest;
}

function subtractIsoMillis(isoValue: string, millis: number): string | null {
  const time = Date.parse(isoValue);
  if (!Number.isFinite(time)) return null;
  return new Date(time - millis).toISOString();
}

function parseDateSafe(value?: string): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
