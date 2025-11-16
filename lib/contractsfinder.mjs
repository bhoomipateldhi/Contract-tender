const CF_ENDPOINT = process.env.CF_API_URL || "https://www.contractsfinder.service.gov.uk/api/rest/2/search_notices/json";
const CF_MAX_PAGE_SIZE = 1000;

export async function searchContractsFinder(criteria = {}, size = CF_MAX_PAGE_SIZE) {
  const safeSize = Math.min(Math.max(Number(size) || 0, 1), CF_MAX_PAGE_SIZE);
  const body = {
    searchCriteria: {
      types: criteria.types || [],
      statuses: criteria.statuses || [],
      keyword: criteria.keyword || null,
      cpvCodes: criteria.cpvCodes || null,
      valueFrom: criteria.valueFrom ?? null,
      valueTo: criteria.valueTo ?? null,
      publishedFrom: criteria.publishedFrom ?? null,
      publishedTo: criteria.publishedTo ?? null,
      awardedFrom: criteria.awardedFrom ?? null,
      awardedTo: criteria.awardedTo ?? null,
      regions: criteria.regions || null
    },
    size: safeSize
  };
  const res = await fetch(CF_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Contracts Finder API ${res.status}`);
  const json = await res.json();
  const hits = (json.noticeList || []).map(h => ({
    ...h.item,
    link: `https://www.contractsfinder.service.gov.uk/Notice/${h.item.id}`
  }));
  return { hits, hitCount: json.hitCount ?? hits.length, maxHits: json.maxHits ?? safeSize };
}
