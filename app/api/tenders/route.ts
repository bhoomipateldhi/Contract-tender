import { NextResponse } from "next/server";
import { fetchTenderReleases, fetchTenderReleasesForDate } from "@/lib/tender-finder";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    const updatedTo = url.searchParams.get("updatedTo") || undefined;
    const updatedFrom = url.searchParams.get("updatedFrom") || undefined;
    const limit = url.searchParams.get("limit") || undefined;
    const cursor = url.searchParams.get("cursor") || undefined;
    const stages = url.searchParams.getAll("stages");

    const releases = date
      ? await fetchTenderReleasesForDate(date)
      : await fetchTenderReleases({
          updatedFrom,
          updatedTo,
          limit,
          cursor,
          stages: stages.length ? stages : undefined
        });
    return NextResponse.json({ tenders: releases, count: releases.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
