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
      items: filtered
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
      counts
    });
  } catch (e:any) {
    console.error("Error in POST /api/search:", e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
