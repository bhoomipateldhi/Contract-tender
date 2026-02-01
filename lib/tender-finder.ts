const UK_FIND_TENDER_API = "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages";

export async function fetchTenderReleases(updatedTo?: string, limit?: string | number): Promise<unknown[]> {
  const params = new URLSearchParams();
  const safeLimit = limit ?? 100;
  if (updatedTo) params.set("updatedTo", updatedTo);
  params.set("limit", String(safeLimit));
  const query = params.toString();
  const url = query ? `${UK_FIND_TENDER_API}?${query}` : UK_FIND_TENDER_API;

  const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Find a Tender API ${response.status}`);
  }

  const data = (await response.json()) as { releases?: unknown[] };
  return Array.isArray(data.releases) ? data.releases : [];
}
