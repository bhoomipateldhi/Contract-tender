"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TENDER_STAGES } from "@/lib/tender-finder";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  if (!value) return "-";
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
  if (value === undefined || value === null) return "-";
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
  if (!party?.address) return "-";
  const { streetAddress, locality, postalCode, countryName } = party.address;
  return [streetAddress, locality, postalCode, countryName].filter(Boolean).join(", ") || "-";
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
  return buyerParty?.name || "-";
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
  const today = new Date().toISOString().slice(0, 10);
  const [tenders, setTenders] = useState<TenderRelease[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedTo, setUpdatedTo] = useState(today);
  const [stage, setStage] = useState("");
  const [query, setQuery] = useState("nhs");
  const [selected, setSelected] = useState<TenderRelease | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        const effectiveDate = updatedTo || today;
        if (effectiveDate) params.set("date", effectiveDate);
        params.set("limit", "100");
        if (stage) params.append("stages", stage);
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
  }, [updatedTo, stage]);

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

  const selectedBuyer = selected ? getBuyer(selected) : "-";
  const selectedBuyerParty = selected ? getBuyerParty(selected) : undefined;
  const selectedSuppliers = selected ? getSuppliers(selected) : [];
  const selectedContract = selected?.contracts?.[0];
  const selectedValue = selectedContract?.value?.amountGross ?? selectedContract?.value?.amount;
  const selectedUrl = selected ? getNoticeUrl(selected) : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-[#d9ded8] bg-transparent text-slate-700">FTS Releases</Badge>
            <Badge className="border-[#d9ded8] bg-transparent text-slate-700">Live data</Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">NHS Tender Intelligence</h1>
          <p className="text-sm text-muted-foreground">
            Track the latest Find a Tender releases, highlight buyers and suppliers, and surface contract values at a
            glance.
          </p>
        </header>

        <Card className="bg-[#e7ebe4] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium">Filters</p>
              <p className="text-xs text-muted-foreground">Updated tender releases</p>
            </div>
            <div className="grid w-full gap-3 md:grid-cols-2 lg:w-auto lg:grid-cols-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground">Updated To (Date)</label>
                <Input
                  type="date"
                  value={updatedTo}
                  onChange={event => setUpdatedTo(event.target.value)}
                  placeholder="2026-02-01"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground">Stage</label>
                <select
                  value={stage}
                  onChange={event => setStage(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none ring-offset-2 transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">All stages</option>
                  {TENDER_STAGES.map(item => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
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
                    setStage(stage.trim());
                  }}
                  className="bg-slate-900 text-white hover:bg-slate-800"
                >
                  Refresh
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Tender feed</h2>
            {isLoading ? <Badge className="border-[#d9ded8] bg-transparent text-slate-600">Loading</Badge> : null}
          </div>

          {error ? (
            <Card className="border-destructive/40 bg-destructive/10 p-4 text-destructive">{error}</Card>
          ) : null}

          {isLoading ? (
            <Card className="p-6 text-sm text-muted-foreground">Loading tenders...</Card>
          ) : (
            <Card className="bg-white p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((release, index) => {
                    const buyer = getBuyer(release);
                    const suppliers = getSuppliers(release);
                    const contract = release.contracts?.[0];
                    const value = contract?.value?.amountGross ?? contract?.value?.amount;
                    return (
                      <TableRow
                        key={`${release.ocid || "release"}-${index}`}
                        className="cursor-pointer"
                        onClick={() => setSelected(release)}
                      >
                        <TableCell className="whitespace-nowrap">{formatDate(release.date)}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <button type="button" className="text-left font-medium hover:underline">
                              {release.tender?.title || "Untitled tender"}
                            </button>
                            <div className="text-xs text-muted-foreground">{release.id || "-"}</div>
                          </div>
                        </TableCell>
                        <TableCell>{buyer}</TableCell>
                        <TableCell>{suppliers.length ? suppliers.join(", ") : "-"}</TableCell>
                        <TableCell>
                          {release.tender?.status ? <Badge>{release.tender.status}</Badge> : <span>-</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(value, contract?.value?.currency)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </section>
      </div>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={open => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.tender?.title || "Tender details"}</DialogTitle>
            <DialogDescription>{selected?.tender?.description || "No description provided."}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Buyer</p>
                <p className="font-medium">{selectedBuyer}</p>
                <p className="text-xs text-muted-foreground">{buildAddress(selectedBuyerParty)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Suppliers</p>
                <p className="font-medium">{selectedSuppliers.length ? selectedSuppliers.join(", ") : "-"}</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Release date</p>
                <p>{formatDate(selected?.date)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p>{selected?.tender?.status || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Contract value</p>
                <p>{formatMoney(selectedValue, selectedContract?.value?.currency)}</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Start</p>
                <p>{formatDate(selectedContract?.period?.startDate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">End</p>
                <p>{formatDate(selectedContract?.period?.endDate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Signed</p>
                <p>{formatDate(selectedContract?.dateSigned)}</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Identifiers</p>
                <p>{selected?.ocid || selected?.id || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Initiation type</p>
                <p>{selected?.initiationType || "-"}</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            {selectedUrl ? (
              <a
                href={selectedUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Open notice
              </a>
            ) : null}
            <Button onClick={() => setSelected(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
