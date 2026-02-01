const UK_FIND_TENDER_API = "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages";

export const TENDER_STAGES = [
  { value: "planning", label: "Planning" },
  { value: "tender", label: "Tender" },
  { value: "award", label: "Award" }
] as const;

type TenderRelease = {
  id?: string;
  ocid?: string;
  date?: string;
  [key: string]: unknown;
};

type FetchTendersParams = {
  date?: string;
  limit?: string | number;
  stages?: string[] | string;
};

type FetchTendersPageParams = {
  updatedTo?: string;
  limit?: string | number;
  stages?: string[] | string;
};

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
