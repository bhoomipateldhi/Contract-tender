"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type TenderRelease = {
  ocid?: string;
  id?: string;
  tag?: string[];
  date?: string;
  initiationType?: string;
  parties?: Party[];
  buyer?: { id?: string; name?: string };
  tender?: { id?: string; title?: string; description?: string; status?: string; procurementMethodDetails?: string };
  awards?: Award[];
  contracts?: Contract[];
};

type Party = {
  id?: string;
  name?: string;
  roles?: string[];
  address?: {
    streetAddress?: string;
    locality?: string;
    postalCode?: string;
    countryName?: string;
    region?: string;
  };
  contactPoint?: { email?: string };
};

type Award = {
  suppliers?: { id?: string; name?: string }[];
  items?: { additionalClassifications?: { id?: string; description?: string }[] }[];
};

type Contract = {
  period?: { startDate?: string; endDate?: string };
  value?: { amount?: number; amountGross?: number; currency?: string };
  dateSigned?: string;
  documents?: { url?: string }[];
};

type ApiResponse = { tenders?: TenderRelease[]; count?: number; error?: string };

function formatDate(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatMoney(value?: number, currency?: string) {
  if (value === undefined || value === null) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "GBP",
      maximumFractionDigits: 0
    }).format(value);
  } catch {
    return `${value} ${currency || ""}`.trim();
  }
}

function buildAddress(party?: Party) {
  if (!party?.address) return "—";
  const { streetAddress, locality, postalCode, countryName } = party.address;
  return [streetAddress, locality, postalCode, countryName].filter(Boolean).join(", ") || "—";
}

function getSuppliers(release: TenderRelease) {
  const fromAwards = release.awards?.flatMap(award => award.suppliers || []).map(s => s?.name).filter(Boolean) || [];
  const fromParties =
    release.parties?.filter(party => party.roles?.includes("supplier")).map(p => p.name).filter(Boolean) || [];
  const set = new Set([...fromAwards, ...fromParties]);
  return Array.from(set);
}

function getBuyer(release: TenderRelease) {
  const fromBuyer = release.buyer?.name;
  if (fromBuyer) return fromBuyer;
  const buyerParty = release.parties?.find(party => party.roles?.includes("buyer"));
  return buyerParty?.name || "—";
}

function getBuyerParty(release: TenderRelease) {
  if (release.buyer?.id) {
    const match = release.parties?.find(party => party.id === release.buyer?.id);
    if (match) return match;
  }
  return release.parties?.find(party => party.roles?.includes("buyer"));
}

function getNoticeUrl(release: TenderRelease) {
  return release.contracts?.flatMap(contract => contract.documents || []).map(doc => doc.url).find(Boolean) || null;
}

export default function TendersPage() {
  const [tenders, setTenders] = useState<TenderRelease[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedTo, setUpdatedTo] = useState("");
  const [limit, setLimit] = useState("100");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (updatedTo) params.set("updatedTo", updatedTo);
        if (limit) params.set("limit", limit);
        const url = `/api/tenders${params.toString() ? `?${params.toString()}` : ""}`;
        const res = await fetch(url);
        const data = (await res.json()) as ApiResponse;
        if (!res.ok) throw new Error(data.error || "Failed to load tenders");
        if (isMounted) setTenders(data.tenders || []);
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err.message : "Unexpected error");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchData();
    return () => {
      isMounted = false;
    };
  }, [updatedTo, limit]);

  const filtered = useMemo(() => {
    if (!query.trim()) return tenders;
    const token = query.toLowerCase();
    return tenders.filter(release => {
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
  }, [tenders, query]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>FTS Releases</Badge>
            <Badge>Live data</Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">NHS Tender Intelligence</h1>
          <p className="text-sm text-muted-foreground">
            Track the latest Find a Tender releases, highlight buyers and suppliers, and surface contract values at a
            glance.
          </p>
        </header>

        <Card className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium">Filters</p>
              <p className="text-xs text-muted-foreground">Updated tender releases</p>
            </div>
            <div className="grid w-full gap-3 md:grid-cols-3 lg:w-auto lg:grid-cols-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground">Updated To (ISO)</label>
                <Input
                  value={updatedTo}
                  onChange={event => setUpdatedTo(event.target.value)}
                  placeholder="2026-02-01T00:33:04Z"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground">Limit</label>
                <Input value={limit} onChange={event => setLimit(event.target.value)} placeholder="100" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground">Keyword</label>
                <Input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Search title, buyer, supplier"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground">Action</label>
                <Button
                  type="button"
                  onClick={() => {
                    setUpdatedTo(updatedTo.trim());
                    setLimit(limit.trim());
                  }}
                >
                  Refresh
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <section className="grid gap-4 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Total releases</p>
            <p className="text-2xl font-semibold">{tenders.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Filtered</p>
            <p className="text-2xl font-semibold">{filtered.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Latest update</p>
            <p className="text-sm">{formatDate(tenders[0]?.date)}</p>
          </Card>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Tender feed</h2>
            {isLoading ? <Badge>Loading</Badge> : null}
          </div>

          {error ? (
            <Card className="border-destructive/40 bg-destructive/10 p-4 text-destructive">{error}</Card>
          ) : null}

          {isLoading ? (
            <Card className="p-6 text-sm text-muted-foreground">Loading tenders…</Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {filtered.map((release, index) => {
                const buyer = getBuyer(release);
                const buyerParty = getBuyerParty(release);
                const suppliers = getSuppliers(release);
                const contract = release.contracts?.[0];
                const value = contract?.value?.amountGross ?? contract?.value?.amount;
                const url = getNoticeUrl(release);
                const tags = release.tag || [];

                return (
                  <Card key={`${release.ocid || "release"}-${index}`} className="p-6">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDate(release.date)}</span>
                      <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                      <span>{release.ocid || release.id}</span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold">
                      {release.tender?.title || "Untitled tender"}
                    </h3>
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                      {release.tender?.description || "No description provided."}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {tags.map(tag => (
                        <Badge key={tag}>{tag}</Badge>
                      ))}
                      {release.tender?.status ? <Badge>{release.tender.status}</Badge> : null}
                    </div>

                    <div className="mt-5 grid gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Buyer</p>
                        <p className="font-medium">{buyer}</p>
                        <p className="text-xs text-muted-foreground">{buildAddress(buyerParty)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Supplier</p>
                        <p className="font-medium">{suppliers.length ? suppliers.join(", ") : "—"}</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Contract value</p>
                          <p className="font-medium">{formatMoney(value, contract?.value?.currency)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Start</p>
                          <p className="text-sm">{formatDate(contract?.period?.startDate)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">End</p>
                          <p className="text-sm">{formatDate(contract?.period?.endDate)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{release.initiationType || "tender"}</span>
                      {url ? (
                        <a
                          href={url}
                          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          View notice
                        </a>
                      ) : null}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
