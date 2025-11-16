import { NextResponse } from "next/server";
import { searchFindATender } from "@/lib/fts.mjs";

const DEFAULT_STAGE = "tender";
const DEFAULT_LIMIT = 50;

type RequestBody = {
  dateFrom?: string;
  dateTo?: string;
  stage?: string;
  limit?: number;
  cursor?: string;
  nhsOnly?: boolean;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody | undefined;
    const { dateFrom, dateTo, stage = DEFAULT_STAGE, limit = DEFAULT_LIMIT, cursor, nhsOnly = true } = body || {};

    const pageSize = Math.min(100, Math.max(1, Number(limit) || DEFAULT_LIMIT));

    const result = await searchFindATender({
      receivedFrom: dateFrom || undefined,
      receivedTo: dateTo || undefined,
      pageSize,
      stage,
      cursor,
      nhsOnly
    });

    const items = result.hits.map(hit => {
      const link =
        hit.link ||
        (hit.id ? `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(String(hit.id))}` : "https://www.find-tender.service.gov.uk/Notice/Search");

      return {
        id: hit.id ?? hit.noticeIdentifier ?? null,
        title: hit.title || "Untitled notice",
        description: hit.description || "",
        link,
        publishedDate: hit.publishedDate ?? hit.lastNotifiableUpdate ?? null,
        noticeType: hit.noticeType || stage,
        noticeStatus: hit.noticeStatus || "PUBLISHED",
        organisationName: hit.organisationName || "",
        organisationAddress: hit.organisationAddress || null,
        cpvCodes: hit.cpvCodes || "",
        valueLow: hit.valueLow ?? null,
        valueHigh: hit.valueHigh ?? null,
        awardedValue: hit.awardedValue ?? null,
        source: "FTS"
      };
    });

    return NextResponse.json({
      items,
      count: items.length,
      nextCursor: result.nextCursor ?? null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
