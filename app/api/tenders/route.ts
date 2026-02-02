import { NextResponse } from "next/server";
import { fetchTenders, applyKeywordFilter } from "@/lib/tender-finder";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date") || undefined;
    const stages = url.searchParams.getAll("stages");
    const limit = url.searchParams.get("limit") || undefined;
    const keyword = url.searchParams.get("keyword") || "nhs";

    const releases = await fetchTenders({
      date,
      limit,
      stages: stages.length ? stages : undefined
    });
    
    // The releases from fetchTenders already contain noticeType.
    // Logic for filtering has been moved to server-side helper.
    const filtered = applyKeywordFilter(releases, keyword);
    
    return NextResponse.json({ tenders: filtered, count: filtered.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
