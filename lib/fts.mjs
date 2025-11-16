const FTS_SEARCH_URL = "https://www.find-tender.service.gov.uk/api/latest/notice/submission/search";
const FTS_RELEASE_BASE_URL = "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages";
const DEFAULT_PAGE_SIZE = 50;
const DETAIL_CHUNK_SIZE = 5;
const OCDS_DEFAULT_STAGE = "tender";
const OCDS_MAX_LIMIT = 100;
export const FTS_AUTHORITY_KEYWORDS = ["nhs", "nhs trust", "nhs foundation trust", "national health service"];
const NHS_REGEX = /(^|\W)nhs(\W|$)/i;

export function containsAuthorityKeyword(value) {
  if (typeof value !== "string") return false;
  if (NHS_REGEX.test(value)) return true;
  const upper = value.toUpperCase();
  if (upper.includes("NHS")) return true;
  return FTS_AUTHORITY_KEYWORDS.some(keyword => upper.includes(keyword.toUpperCase()));
}

export async function searchFindATender({
  receivedFrom,
  receivedTo,
  keyword,
  noticeTypes = [],
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
  stage = OCDS_DEFAULT_STAGE,
  cursor,
  nhsOnly = true
} = {}) {
  const subscriptionKey = process.env.FTS_API_KEY;
  if (!subscriptionKey) {
    return searchFindATenderViaOcds({
      receivedFrom,
      receivedTo,
      pageSize,
      stage,
      cursor,
      nhsOnly
    });
  }

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (receivedFrom) params.set("receivedFrom", receivedFrom);
  if (receivedTo) params.set("receivedTo", receivedTo);
  if (noticeTypes.length) params.set("form", noticeTypes.join(","));
  params.set("status", "PUBLISHED");

  const url = `${FTS_SEARCH_URL}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Ocp-Apim-Subscription-Key": subscriptionKey
    }
  });

  if (!res.ok) throw new Error(`Find a Tender API ${res.status}`);

  const data = await res.json();
  const submissions = Array.isArray(data.content) ? data.content : [];

  const baseRecords = submissions.map(entry => {
    const submissionId = entry.submission_id || entry.submissionId;
    const reference = entry.no_doc_ext || entry.noDocExt || entry.ref_no_doc_ojs || entry.refNoDocOjs || null;
    return {
      id: submissionId,
      source: "FTS",
      link: submissionId ? `https://www.find-tender.service.gov.uk/Notice/${submissionId}` : null,
      publishedDate: entry.received_at || entry.receivedAt || null,
      noticeStatus: entry.status || null,
      noticeType: entry.form || entry.notice_type || entry.noticeType || null,
      noticeIdentifier: reference,
      parentId: entry.ref_submission_id || entry.refSubmissionId || null,
      lastNotifiableUpdate: entry.status_updated_at || entry.statusUpdatedAt || null
    };
  }).filter(record => record.id);

  const hits = [];
  for (let index = 0; index < baseRecords.length; index += DETAIL_CHUNK_SIZE) {
    const chunk = baseRecords.slice(index, index + DETAIL_CHUNK_SIZE);
    const enriched = await Promise.all(
      chunk.map(async base => {
        try {
          const releasePackage = await fetchReleasePackage(base.id);
          return mapReleasePackageToNotice(base, releasePackage);
        } catch (error) {
          console.error(`Failed to enrich FTS notice ${base.id}`, error);
          return normalizeNotice(base);
        }
      })
    );
    hits.push(...enriched.filter(Boolean));
  }

  const filteredHits = nhsOnly ? hits.filter(matchesPreferredAuthority) : hits;
  const total =
    data.totalElements ??
    data.total_elements ??
    data.total ??
    data.number_of_elements ??
    hits.length;

  return { hits: filteredHits, hitCount: nhsOnly ? filteredHits.length : total, nextCursor: null };
}

async function searchFindATenderViaOcds({
  receivedFrom,
  receivedTo,
  pageSize = DEFAULT_PAGE_SIZE,
  stage = OCDS_DEFAULT_STAGE,
  cursor,
  nhsOnly = true
} = {}) {
  const params = new URLSearchParams();
  const limit = Math.max(1, Math.min(Number(pageSize) || DEFAULT_PAGE_SIZE, OCDS_MAX_LIMIT));
  params.set("limit", String(limit));

  const normalisedStage = normaliseOcdsStage(stage);
  params.set("stages", normalisedStage);

  const fromIso = toOcdsIso(receivedFrom);
  const toIso = toOcdsIso(receivedTo);
  if (fromIso) params.set("updatedFrom", fromIso);
  if (toIso) params.set("updatedTo", toIso);
  if (cursor) params.set("cursor", cursor);

  const url = `${FTS_RELEASE_BASE_URL}?${params.toString()}`;
  const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`Find a Tender OCDS ${response.status}`);

  const pkg = await response.json();
  const releases = Array.isArray(pkg.releases) ? pkg.releases : [];
  const candidateReleases = nhsOnly ? releases.filter(releaseLooksNhs) : releases;

  const hits = candidateReleases
    .map(release => {
      const id = release?.id || release?.ocid;
      if (!id) return null;
      const base = {
        id,
        source: "FTS",
        link: `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(id)}`,
        publishedDate: release?.date || null,
        noticeStatus: "PUBLISHED",
        noticeType: Array.isArray(release?.tag) && release.tag.length ? release.tag.join(", ") : normalisedStage,
        noticeIdentifier: release?.id || release?.ocid || null,
        parentId: null,
        lastNotifiableUpdate: release?.date || null,
        organisationAddress: null
      };
      try {
        return mapReleasePackageToNotice(base, { releases: [release] });
      } catch (error) {
        console.error(`Failed to map OCDS release ${id}`, error);
        return normalizeNotice(base);
      }
    })
    .filter(Boolean);

  const filteredHits = nhsOnly ? hits.filter(matchesPreferredAuthority) : hits;
  const nextCursor = extractCursorFromLink(pkg?.links?.next);

  return { hits: filteredHits, hitCount: filteredHits.length, nextCursor };
}

async function fetchReleasePackage(noticeId) {
  const url = `${FTS_RELEASE_BASE_URL}/${encodeURIComponent(noticeId)}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) throw new Error(`Find a Tender release ${response.status}`);
  return response.json();
}

function mapReleasePackageToNotice(base, pkg) {
  const release = selectRelevantRelease(pkg, base.id);
  if (!release) {
    return normalizeNotice(base);
  }

  const tender = release.tender || {};
  const planning = release.planning || {};
  const budgets = extractBudgetValues(planning);
  const tenderValue = tender.value || budgets.primary || {};
  const periods = tender.tenderPeriod || {};
  const enquiryPeriod = tender.enquiryPeriod || {};
  const award = selectAward(release.awards);
  const contract = selectContract(release.contracts);
  const buyer = selectBuyer(release.parties);
  const supplierNames = extractSupplierNames(release.awards);

  const organisationAddress = formatAddress(buyer?.address);
  const cpvInfo = extractCpvInformation(tender);
  const regionalInfo = extractRegionalInformation(tender, buyer);
  const suitability = extractSuitabilityFlags(tender);
  const supplierFlags = extractSupplierFlags(release.awards);

  const noticeType = determineNoticeType(release, contract, tender, base.noticeType);
  const noticeStatus = determineNoticeStatus(tender, award, base.noticeStatus);

  const notice = {
    ...base,
    source: "FTS",
    link: base.link || (base.id ? `https://www.find-tender.service.gov.uk/Notice/${base.id}` : null),
    title: tender.title || release.title || null,
    description: tender.description || release.description || null,
    noticeType,
    noticeStatus,
    organisationName: buyer?.name || null,
    organisationAddress,
    noticeIdentifier: base.noticeIdentifier || release.id || null,
    cpvCodes: cpvInfo.primaryCode,
    cpvCodesExtended: cpvInfo.extendedCodes,
    cpvDescription: cpvInfo.primaryDescription,
    cpvDescriptionExpanded: cpvInfo.extendedDescriptions,
    valueLow: tenderValue.amount ?? tenderValue.minimumAmount ?? tenderValue.amountNet ?? null,
    valueHigh: tenderValue.maximumAmount ?? null,
    awardedValue: contract?.value?.amount ?? contract?.value?.amountGross ?? award?.value?.amount ?? null,
    awardedSupplier: supplierNames,
    publishedDate: release.date || base.publishedDate || null,
    deadlineDate: periods.endDate || enquiryPeriod.endDate || null,
    awardedDate: award?.date || contract?.dateSigned || null,
    approachMarketDate: periods.startDate || enquiryPeriod.startDate || null,
    start: contract?.period?.startDate || null,
    end: contract?.period?.endDate || null,
    postcode: buyer?.address?.postalCode || null,
    region: regionalInfo.regionCode,
    regionText: regionalInfo.regionText,
    coordinates: regionalInfo.coordinates,
    isSuitableForSme: suitability.sme,
    isSuitableForVco: suitability.vcse,
    awardedToSme: supplierFlags.awardedToSme,
    awardedToVcse: supplierFlags.awardedToVcse,
    lastNotifiableUpdate: release.date || base.lastNotifiableUpdate || null
  };

  return normalizeNotice(notice);
}

function normalizeNotice(raw) {
  return { ...raw };
}

function selectRelevantRelease(pkg, noticeId) {
  if (!pkg || !Array.isArray(pkg.releases) || pkg.releases.length === 0) return null;
  if (!noticeId) return pkg.releases[0];

  const byId = pkg.releases.find(release => release.id === noticeId);
  if (byId) return byId;

  const sorted = [...pkg.releases].sort((a, b) => {
    const dateA = Date.parse(a.date || "") || 0;
    const dateB = Date.parse(b.date || "") || 0;
    return dateB - dateA;
  });
  return sorted[0] || null;
}

function extractBudgetValues(planning) {
  if (!planning || typeof planning !== "object") return { primary: null };
  const budgeting = planning.budget || {};

  if (Array.isArray(budgeting.budgetBreakdown) && budgeting.budgetBreakdown.length > 0) {
    const first = budgeting.budgetBreakdown.find(item => item.amount);
    return { primary: first?.amount || null };
  }

  if (budgeting.amount) {
    return { primary: budgeting.amount };
  }

  return { primary: null };
}

function selectAward(awards) {
  if (!Array.isArray(awards)) return null;
  const active = awards.find(item => item.status && item.status.toLowerCase() === "active");
  return active || awards[0] || null;
}

function selectContract(contracts) {
  if (!Array.isArray(contracts)) return null;
  const active = contracts.find(item => item.status && item.status.toLowerCase() === "active");
  return active || contracts[0] || null;
}

function selectBuyer(parties) {
  if (!Array.isArray(parties)) return null;
  return (
    parties.find(party => Array.isArray(party.roles) && party.roles.some(role => role.toLowerCase() === "buyer")) ||
    null
  );
}

function extractSupplierNames(awards) {
  if (!Array.isArray(awards)) return null;
  const names = awards.flatMap(award => (Array.isArray(award.suppliers) ? award.suppliers : [])).map(supplier => supplier?.name).filter(Boolean);
  if (!names.length) return null;
  return Array.from(new Set(names)).join(", ");
}

function extractCpvInformation(tender) {
  const codes = new Set();
  const descriptions = new Set();

  const registerClassifier = classifier => {
    if (!classifier) return;
    if (classifier.id) codes.add(classifier.id);
    if (classifier.description) descriptions.add(classifier.description);
  };

  registerClassifier(tender.classification);

  if (Array.isArray(tender.items)) {
    tender.items.forEach(item => {
      registerClassifier(item.classification);
      const additional = Array.isArray(item.additionalClassifications)
        ? item.additionalClassifications
        : [];
      additional.forEach(registerClassifier);
    });
  }

  const [primaryCode, ...restCodes] = Array.from(codes);
  const [primaryDescription, ...restDescriptions] = Array.from(descriptions);

  return {
    primaryCode: primaryCode || null,
    extendedCodes: restCodes.length ? restCodes.join(" ") : null,
    primaryDescription: primaryDescription || null,
    extendedDescriptions: restDescriptions.length ? restDescriptions.join(" | ") : null
  };
}

function extractRegionalInformation(tender, buyer) {
  const locations = [];

  const addLocation = location => {
    if (!location || typeof location !== "object") return;
    if (location.description) locations.push({ text: location.description });
    if (location.address) {
      if (location.address.locality || location.address.region || location.address.description) {
        const parts = [location.address.locality, location.address.region, location.address.description]
          .filter(Boolean)
          .join(", ");
        if (parts) locations.push({ text: parts });
      }
      const coordString = formatCoordinates(location.address.coordinates);
      if (coordString) {
        locations.push({ coordinates: coordString });
      }
    }
    if (location.geometry && typeof location.geometry === "object") {
      const coordString = formatCoordinates(location.geometry.coordinates);
      if (coordString) {
        locations.push({ coordinates: coordString });
      }
    }
  };

  if (Array.isArray(tender.items)) {
    tender.items.forEach(item => {
      const deliveryAddresses = parseArray(item.deliveryAddresses);
      deliveryAddresses.forEach(address => {
        if (address.region) locations.push({ regionCode: address.region });
        if (address.description) locations.push({ text: address.description });
      });
      if (item.deliveryLocation) addLocation(item.deliveryLocation);
    });
  }

  const regionCode = locations.find(location => location.regionCode)?.regionCode || buyer?.address?.region || null;
  const coordinates = locations.find(location => location.coordinates)?.coordinates || null;
  const regionText = locations.find(location => location.text)?.text || buyer?.address?.countryName || null;

  return { regionCode, regionText, coordinates };
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function extractSuitabilityFlags(tender) {
  const result = { sme: null, vcse: null };
  if (!tender || typeof tender !== "object") return result;

  const flags = parseArray(tender.suitability);
  if (!flags.length) return result;

  const tokens = flags
    .map(flag => String(flag || "").toLowerCase())
    .filter(Boolean);

  if (tokens.find(token => token.includes("sme"))) result.sme = true;
  if (tokens.find(token => token.includes("vcse") || token.includes("voluntary"))) result.vcse = true;

  return result;
}

function formatCoordinates(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const [first, second] = value;
    if (first === undefined || second === undefined) return null;
    return `${first},${second}`;
  }
  if (typeof value === "object") {
    const latitude = value.latitude ?? value.lat ?? null;
    const longitude = value.longitude ?? value.lon ?? null;
    if (latitude !== null && longitude !== null) {
      return `${latitude},${longitude}`;
    }
  }
  return null;
}

function formatAddress(address) {
  if (!address || typeof address !== "object") return null;
  const parts = [
    address.streetAddress,
    address.locality,
    address.region,
    address.postalCode,
    address.countryName,
    address.description
  ]
    .map(part => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function extractSupplierFlags(awards) {
  if (!Array.isArray(awards)) return { awardedToSme: null, awardedToVcse: null };
  const scales = new Set(
    awards
      .flatMap(award => (Array.isArray(award.suppliers) ? award.suppliers : []))
      .map(supplier => supplier?.details?.scale)
      .filter(Boolean)
      .map(scale => String(scale).toLowerCase())
  );

  const awardedToSme = scales.size ? scales.has("sme") || scales.has("small") : null;
  const awardedToVcse = scales.size ? scales.has("vcse") || scales.has("thirdsector") : null;

  return { awardedToSme, awardedToVcse };
}

function determineNoticeType(release, contract, tender, fallback) {
  if (contract?.documents) {
    const doc = contract.documents.find(document => document.noticeType);
    if (doc?.noticeType) return doc.noticeType;
  }
  if (release?.tag && Array.isArray(release.tag) && release.tag.length) {
    return release.tag.join(", ");
  }
  if (tender?.procedureType) return tender.procedureType;
  return fallback || null;
}

function determineNoticeStatus(tender, award, fallback) {
  if (tender?.status) return tender.status;
  if (award?.status) return award.status;
  return fallback || null;
}

function toOcdsIso(value) {
  if (!value) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return `${text}T00:00:00`;
  }
  return text;
}

function normaliseOcdsStage(value) {
  if (!value) return OCDS_DEFAULT_STAGE;
  const token = String(value).toLowerCase();
  if (token === "tender" || token === "award" || token === "planning") return token;
  return OCDS_DEFAULT_STAGE;
}

function extractCursorFromLink(link) {
  if (!link) return null;
  try {
    const parsed = new URL(link);
    return parsed.searchParams.get("cursor");
  } catch {
    return null;
  }
}

function partyLooksNhs(party) {
  if (!party || typeof party !== "object") return false;
  if (containsAuthorityKeyword(party.name)) return true;
  if (containsAuthorityKeyword(party?.identifier?.legalName)) return true;

  const address = party.address || {};
  return (
    containsAuthorityKeyword(address?.streetAddress) ||
    containsAuthorityKeyword(address?.locality) ||
    containsAuthorityKeyword(address?.region) ||
    containsAuthorityKeyword(address?.postalCode) ||
    containsAuthorityKeyword(address?.countryName)
  );
}

function partyHasBuyerRole(party) {
  if (!party || typeof party !== "object") return false;
  const roles = Array.isArray(party.roles) ? party.roles : [];
  return roles.some(role =>
    /buyer|procuringentity|procuring_entity|contractingauthority|contracting_entity/i.test(String(role || ""))
  );
}

function releaseLooksNhs(release) {
  if (!release || typeof release !== "object") return false;

  if (containsAuthorityKeyword(release?.buyer?.name)) return true;
  if (containsAuthorityKeyword(release?.tender?.procuringEntity?.name)) return true;

  const parties = Array.isArray(release.parties) ? release.parties : [];

  if (release?.buyer?.id) {
    const buyerParty = parties.find(party => party?.id && party.id === release.buyer.id);
    if (partyLooksNhs(buyerParty)) return true;
  }

  if (release?.tender?.procuringEntity?.id) {
    const procuringParty = parties.find(party => party?.id && party.id === release.tender.procuringEntity.id);
    if (partyLooksNhs(procuringParty)) return true;
  }

  if (parties.some(party => partyHasBuyerRole(party) && partyLooksNhs(party))) {
    return true;
  }

  return parties.some(partyLooksNhs);
}

function matchesPreferredAuthority(notice) {
  if (!notice || typeof notice !== "object") return false;
  const haystacks = [
    notice.organisationName,
    notice.organisationAddress,
    notice.regionText,
    notice.region,
    notice.description,
    notice.title
  ];

  return haystacks.some(value => containsAuthorityKeyword(value));
}
