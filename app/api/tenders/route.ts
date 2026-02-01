import { NextResponse } from "next/server";
import { fetchTenders } from "@/lib/tender-finder";

type TenderRelease = {
  ocid?: string;
  id?: string;
  tender?: { title?: string; description?: string };
  buyer?: { name?: string };
  parties?: { name?: string; roles?: string[] }[];
  awards?: { suppliers?: { name?: string }[] }[];
};

function getSuppliers(release: TenderRelease) {
  const fromAwards =
    release.awards?.flatMap(award => award.suppliers || []).map(s => s?.name).filter(Boolean) || [];
  const fromParties =
    release.parties?.filter(party => party.roles?.includes("supplier")).map(p => p.name).filter(Boolean) || [];
  return Array.from(new Set([...fromAwards, ...fromParties]));
}

function getBuyer(release: TenderRelease) {
  const fromBuyer = release.buyer?.name;
  if (fromBuyer) return fromBuyer;
  const buyerParty = release.parties?.find(party => party.roles?.includes("buyer"));
  return buyerParty?.name || "";
}

function applyKeywordFilter(releases: TenderRelease[], keyword: string) {
  const token = keyword.trim().toLowerCase();
  if (!token) return releases;
  return releases.filter(release => {
    const blob = [
      release.tender?.title,
      release.tender?.description,
      getBuyer(release),
      getSuppliers(release).join(" "),
      release.ocid,
      release.id
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return blob.includes(token);
  });
}

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
    const filtered = applyKeywordFilter(releases, keyword);
    return NextResponse.json({ tenders: filtered, count: filtered.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
