import { NextResponse } from "next/server";
import { searchContractsFinder } from "@/lib/contractsfinder.mjs";
import { searchFindATender } from "@/lib/fts.mjs";
import { applyFilters, deriveProcurementStage } from "@/lib/filters.mjs";

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " "
};

// Schema definition for the API response items
const ITEM_SCHEMA = {
  id: { type: "string", description: "Unique notice identifier" },
  parentId: { type: "string | null", description: "Parent notice ID if this is an amendment or related notice" },
  source: { type: "string", enum: ["CF", "FTS"], description: "Data source: CF (ContractsFinder) or FTS (Find a Tender)" },
  title: { type: "string", description: "Notice title" },
  noticeIdentifier: { type: "string | null", description: "Official notice reference number", sources: ["CF"] },
  description: { type: "string | null", description: "Detailed description of the opportunity" },
  link: { type: "string", description: "URL to the full notice" },
  noticeType: { type: "string", description: "Type of notice (Contract, Opportunity, EarlyEngagement, FutureOpportunity)", sources: ["CF"] },
  noticeStatus: { type: "string", description: "Status of notice (Open, Awarded)", sources: ["CF"] },
  organisationName: { type: "string | null", description: "Contracting organisation name" },
  organisationAddress: { type: "string | null", description: "Contracting organisation address", sources: ["FTS"] },
  cpvCodes: { type: "string[]", description: "Common Procurement Vocabulary codes" },
  cpvCodesExtended: { type: "string[] | null", description: "Extended CPV codes", sources: ["CF"] },
  cpvDescription: { type: "string | null", description: "Description of primary CPV code" },
  cpvDescriptionExpanded: { type: "string | null", description: "Expanded CPV code descriptions" },
  valueLow: { type: "number | null", description: "Estimated minimum contract value" },
  valueHigh: { type: "number | null", description: "Estimated maximum contract value" },
  awardedValue: { type: "number | null", description: "Actual awarded contract value" },
  awardedSupplier: { type: "string | null", description: "Name of awarded supplier" },
  publishedDate: { type: "string", description: "ISO 8601 date when notice was published" },
  deadlineDate: { type: "string | null", description: "ISO 8601 date for submission deadline" },
  awardedDate: { type: "string | null", description: "ISO 8601 date when contract was awarded" },
  start: { type: "string | null", description: "ISO 8601 date for contract start" },
  end: { type: "string | null", description: "ISO 8601 date for contract end" },
  approachMarketDate: { type: "string | null", description: "ISO 8601 date for market approach", sources: ["CF"] },
  postcode: { type: "string | null", description: "Location postcode", sources: ["CF"] },
  region: { type: "string | null", description: "Region code", sources: ["CF"] },
  regionText: { type: "string | null", description: "Region name", sources: ["CF"] },
  coordinates: { type: "object | null", description: "Geographic coordinates {lat, lon}", sources: ["CF"] },
  isSuitableForSme: { type: "boolean | null", description: "Suitable for Small/Medium Enterprises", sources: ["CF"] },
  isSuitableForVco: { type: "boolean | null", description: "Suitable for Voluntary/Community Organisations", sources: ["CF"] },
  awardedToSme: { type: "boolean | null", description: "Awarded to SME", sources: ["CF"] },
  awardedToVcse: { type: "boolean | null", description: "Awarded to Voluntary/Community/Social Enterprise", sources: ["CF"] },
  lastNotifiableUpdate: { type: "string | null", description: "ISO 8601 date of last update", sources: ["CF"] },
  procurementStage: { type: "string | null", enum: ["Pipeline", "Planning", "Tender", "Award", "Contract", "Termination"], description: "Derived procurement stage" }
};

function decodeHtmlEntities(value?: string | null): string | null | undefined {
  if (value === null || value === undefined) return value;
  if (value === "") return "";

  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _;
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const codePoint = Number.parseInt(dec, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _;
    })
    .replace(/&([a-z]+);/gi, (_, name: string) => {
      const mapped = NAMED_HTML_ENTITIES[name.toLowerCase()];
      return mapped ?? `&${name};`;
    });
}

// Simple GET endpoint - GET /api/search?dateFrom=2024-01-01&dateTo=2024-12-31
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    
    // Only date range parameters
    const dateFrom = url.searchParams.get('dateFrom'); // YYYY-MM-DD
    const dateTo = url.searchParams.get('dateTo'); // YYYY-MM-DD
    
    // Fixed parameters - search both sources, all stages
    const keywords = ["technology","digital","cloud","cyber","analytics","software","IT","data"];
    const types = ["Contract","Opportunity","EarlyEngagement","FutureOpportunity"];
    const statuses = ["Open","Awarded"];
    const procurementStages = ["Pipeline","Planning","Tender","Award","Contract","Termination"];
    const sources = ["CF","FTS"];

    const normalisedSources = sources.map(String);
    const includeCF = true;
    const includeFTS = true;
    const keywordString = keywords.join(" ");

    const CF_PAGE_SIZE = 1000;
    const cf = includeCF
      ? await searchContractsFinder({
        keyword: keywordString,
        types,
        statuses,
        publishedFrom: dateFrom || null,
        publishedTo: dateTo || null
      }, CF_PAGE_SIZE)
      : { hits: [], hitCount: 0, maxHits: CF_PAGE_SIZE };

    const FTS_PAGE_SIZE = 100;
    const fts = includeFTS
      ? await searchFindATender({
        receivedFrom: dateFrom || undefined,
        receivedTo: dateTo || undefined,
        keyword: keywordString || undefined,
        page: 0,
        pageSize: FTS_PAGE_SIZE,
        nhsOnly: true
      })
      : { hits: [], hitCount: 0, nextCursor: null };

    const mappedCF = cf.hits.map(item => {
      const decodedTitle = decodeHtmlEntities(item.title);
      const decodedDescription = decodeHtmlEntities(item.description);
      const decodedOrganisation = decodeHtmlEntities(item.organisationName);
      const decodedCpvDescription = decodeHtmlEntities(item.cpvDescription);
      const decodedCpvDescriptionExpanded = decodeHtmlEntities(item.cpvDescriptionExpanded);
      const decodedAwardedSupplier = decodeHtmlEntities(item.awardedSupplier);

      const notice = {
        id: item.id,
        parentId: item.parentId ?? null,
        source: "CF",
        title: typeof decodedTitle === "string" ? decodedTitle : item.title,
        noticeIdentifier: item.noticeIdentifier ?? null,
        description: typeof decodedDescription === "string" ? decodedDescription : item.description ?? null,
        link: `https://www.contractsfinder.service.gov.uk/Notice/${item.id}`,
        noticeType: item.noticeType,
        noticeStatus: item.noticeStatus,
        organisationName: typeof decodedOrganisation === "string" ? decodedOrganisation : item.organisationName ?? null,
        organisationAddress: null,
        cpvCodes: item.cpvCodes,
        cpvCodesExtended: item.cpvCodesExtended ?? null,
        cpvDescription: typeof decodedCpvDescription === "string" ? decodedCpvDescription : item.cpvDescription ?? null,
        cpvDescriptionExpanded: typeof decodedCpvDescriptionExpanded === "string" ? decodedCpvDescriptionExpanded : item.cpvDescriptionExpanded ?? null,
        valueLow: item.valueLow,
        valueHigh: item.valueHigh,
        awardedValue: item.awardedValue,
        awardedSupplier: typeof decodedAwardedSupplier === "string" ? decodedAwardedSupplier : item.awardedSupplier ?? null,
        publishedDate: item.publishedDate,
        deadlineDate: item.deadlineDate,
        awardedDate: item.awardedDate,
        start: item.start ?? null,
        end: item.end ?? null,
        approachMarketDate: item.approachMarketDate ?? null,
        postcode: item.postcode ?? null,
        region: item.region ?? null,
        regionText: item.regionText ?? null,
        coordinates: item.coordinates ?? null,
        isSuitableForSme: item.isSuitableForSme ?? null,
        isSuitableForVco: item.isSuitableForVco ?? null,
        awardedToSme: item.awardedToSme ?? null,
        awardedToVcse: item.awardedToVcse ?? null,
        lastNotifiableUpdate: item.lastNotifableUpdate ?? item.lastNotifiableUpdate ?? null
      };
      const stageLabel = deriveProcurementStage(notice);
      return { ...notice, procurementStage: stageLabel || null };
    });

    const mappedFTS = fts.hits.map(item => {
      const decodedTitle = decodeHtmlEntities(item.title);
      const decodedDescription = decodeHtmlEntities(item.description);
      const decodedOrganisation = decodeHtmlEntities(item.organisationName);
      const decodedOrganisationAddress = decodeHtmlEntities(item.organisationAddress);
      const decodedSupplier = decodeHtmlEntities(item.awardedSupplier);
      const decodedCpvDescription = decodeHtmlEntities(item.cpvDescription);
      const decodedCpvDescriptionExpanded = decodeHtmlEntities(item.cpvDescriptionExpanded);

      const notice = {
        ...item,
        source: "FTS",
        title: typeof decodedTitle === "string" ? decodedTitle : item.title ?? "Find a Tender notice",
        description: typeof decodedDescription === "string" ? decodedDescription : item.description ?? null,
        organisationName: typeof decodedOrganisation === "string" ? decodedOrganisation : item.organisationName ?? null,
        organisationAddress: typeof decodedOrganisationAddress === "string" ? decodedOrganisationAddress : item.organisationAddress ?? null,
        awardedSupplier: typeof decodedSupplier === "string" ? decodedSupplier : item.awardedSupplier ?? null,
        cpvDescription: typeof decodedCpvDescription === "string" ? decodedCpvDescription : item.cpvDescription ?? null,
        cpvDescriptionExpanded: typeof decodedCpvDescriptionExpanded === "string" ? decodedCpvDescriptionExpanded : item.cpvDescriptionExpanded ?? null
      };
      const stageLabel = deriveProcurementStage(notice);
      return { ...notice, procurementStage: stageLabel || null };
    });
    
    const combined = [...mappedCF, ...mappedFTS];

    const filtered = applyFilters(combined, {
      keywords,
      types,
      statuses,
      procurementStages,
      dateFrom,
      dateTo,
      sources: normalisedSources
    });

    filtered.sort((a,b) => new Date(b.publishedDate||0).getTime() - new Date(a.publishedDate||0).getTime());
    
    // Return all results
    return NextResponse.json({
      success: true,
      count: filtered.length,
      items: filtered,
      schema: ITEM_SCHEMA
    });
  } catch (e:any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// POST endpoint for dynamic search
export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Extract parameters from POST body
    const keywords = body.keywords || [];
    const types = body.types || [];
    const statuses = body.statuses || [];
    const procurementStages = body.procurementStages || [];
    const dateFrom = body.dateFrom || null;
    const dateTo = body.dateTo || null;
    const sources = body.sources || ["CF", "FTS"];

    const normalisedSources = sources.map(String);
    const includeCF = normalisedSources.includes("CF");
    const includeFTS = normalisedSources.includes("FTS");
    const keywordString = keywords.join(" ");

    const CF_PAGE_SIZE = 1000;
    const cf = includeCF
      ? await searchContractsFinder({
        keyword: keywordString,
        types,
        statuses,
        publishedFrom: dateFrom,
        publishedTo: dateTo
      }, CF_PAGE_SIZE)
      : { hits: [], hitCount: 0, maxHits: CF_PAGE_SIZE };

    const FTS_PAGE_SIZE = 100;
    const fts = includeFTS
      ? await searchFindATender({
        receivedFrom: dateFrom || undefined,
        receivedTo: dateTo || undefined,
        keyword: keywordString || undefined,
        page: 0,
        pageSize: FTS_PAGE_SIZE,
        nhsOnly: true
      })
      : { hits: [], hitCount: 0, nextCursor: null };

    const mappedCF = cf.hits.map(item => {
      const decodedTitle = decodeHtmlEntities(item.title);
      const decodedDescription = decodeHtmlEntities(item.description);
      const decodedOrganisation = decodeHtmlEntities(item.organisationName);
      const decodedCpvDescription = decodeHtmlEntities(item.cpvDescription);
      const decodedCpvDescriptionExpanded = decodeHtmlEntities(item.cpvDescriptionExpanded);
      const decodedAwardedSupplier = decodeHtmlEntities(item.awardedSupplier);

      const notice = {
        id: item.id,
        parentId: item.parentId ?? null,
        source: "CF",
        title: typeof decodedTitle === "string" ? decodedTitle : item.title,
        noticeIdentifier: item.noticeIdentifier ?? null,
        description: typeof decodedDescription === "string" ? decodedDescription : item.description ?? null,
        link: `https://www.contractsfinder.service.gov.uk/Notice/${item.id}`,
        noticeType: item.noticeType,
        noticeStatus: item.noticeStatus,
        organisationName: typeof decodedOrganisation === "string" ? decodedOrganisation : item.organisationName ?? null,
        organisationAddress: null,
        cpvCodes: item.cpvCodes,
        cpvCodesExtended: item.cpvCodesExtended ?? null,
        cpvDescription: typeof decodedCpvDescription === "string" ? decodedCpvDescription : item.cpvDescription ?? null,
        cpvDescriptionExpanded: typeof decodedCpvDescriptionExpanded === "string" ? decodedCpvDescriptionExpanded : item.cpvDescriptionExpanded ?? null,
        valueLow: item.valueLow,
        valueHigh: item.valueHigh,
        awardedValue: item.awardedValue,
        awardedSupplier: typeof decodedAwardedSupplier === "string" ? decodedAwardedSupplier : item.awardedSupplier ?? null,
        publishedDate: item.publishedDate,
        deadlineDate: item.deadlineDate,
        awardedDate: item.awardedDate,
        start: item.start ?? null,
        end: item.end ?? null,
        approachMarketDate: item.approachMarketDate ?? null,
        postcode: item.postcode ?? null,
        region: item.region ?? null,
        regionText: item.regionText ?? null,
        coordinates: item.coordinates ?? null,
        isSuitableForSme: item.isSuitableForSme ?? null,
        isSuitableForVco: item.isSuitableForVco ?? null,
        awardedToSme: item.awardedToSme ?? null,
        awardedToVcse: item.awardedToVcse ?? null,
        lastNotifiableUpdate: item.lastNotifableUpdate ?? item.lastNotifiableUpdate ?? null
      };
      const stageLabel = deriveProcurementStage(notice);
      return { ...notice, procurementStage: stageLabel || null };
    });

    const mappedFTS = fts.hits.map(item => {
      const decodedTitle = decodeHtmlEntities(item.title);
      const decodedDescription = decodeHtmlEntities(item.description);
      const decodedOrganisation = decodeHtmlEntities(item.organisationName);
      const decodedOrganisationAddress = decodeHtmlEntities(item.organisationAddress);
      const decodedSupplier = decodeHtmlEntities(item.awardedSupplier);
      const decodedCpvDescription = decodeHtmlEntities(item.cpvDescription);
      const decodedCpvDescriptionExpanded = decodeHtmlEntities(item.cpvDescriptionExpanded);

      const notice = {
        ...item,
        source: "FTS",
        title: typeof decodedTitle === "string" ? decodedTitle : item.title ?? "Find a Tender notice",
        description: typeof decodedDescription === "string" ? decodedDescription : item.description ?? null,
        organisationName: typeof decodedOrganisation === "string" ? decodedOrganisation : item.organisationName ?? null,
        organisationAddress: typeof decodedOrganisationAddress === "string" ? decodedOrganisationAddress : item.organisationAddress ?? null,
        awardedSupplier: typeof decodedSupplier === "string" ? decodedSupplier : item.awardedSupplier ?? null,
        cpvDescription: typeof decodedCpvDescription === "string" ? decodedCpvDescription : item.cpvDescription ?? null,
        cpvDescriptionExpanded: typeof decodedCpvDescriptionExpanded === "string" ? decodedCpvDescriptionExpanded : item.cpvDescriptionExpanded ?? null
      };
      const stageLabel = deriveProcurementStage(notice);
      return { ...notice, procurementStage: stageLabel || null };
    });
    
    const combined = [...mappedCF, ...mappedFTS];

    const filtered = applyFilters(combined, {
      keywords,
      types,
      statuses,
      procurementStages,
      dateFrom,
      dateTo,
      sources: normalisedSources
    });

    filtered.sort((a,b) => new Date(b.publishedDate||0).getTime() - new Date(a.publishedDate||0).getTime());
    
    // Build counts object for source information
    const counts = {
      total: filtered.length,
      cf: {
        filtered: mappedCF.filter(n => filtered.includes(n)).length,
        retrieved: mappedCF.length,
        available: cf.hitCount,
        pageLimit: CF_PAGE_SIZE,
        pageSize: CF_PAGE_SIZE,
        active: true,
        requested: includeCF
      },
      fts: {
        filtered: mappedFTS.filter(n => filtered.includes(n)).length,
        retrieved: mappedFTS.length,
        available: fts.hitCount,
        pageLimit: FTS_PAGE_SIZE,
        pageSize: FTS_PAGE_SIZE,
        active: true,
        requested: includeFTS,
        nextCursor: fts.nextCursor || null
      }
    };
    
    // Return all results
    return NextResponse.json({
      success: true,
      count: filtered.length,
      items: filtered,
      counts,
      schema: ITEM_SCHEMA
    });
  } catch (e:any) {
    console.error("Error in POST /api/search:", e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
