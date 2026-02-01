import { NextResponse } from "next/server";
import { fetchTenders } from "@/lib/tender-finder";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date") || undefined;
    const stages = url.searchParams.getAll("stages");
    const limit = url.searchParams.get("limit") || undefined;

    const releases = await fetchTenders({
      date,
      limit,
      stages: stages.length ? stages : undefined
    });
    return NextResponse.json({ tenders: releases, count: releases.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
