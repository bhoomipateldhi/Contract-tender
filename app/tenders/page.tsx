"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  OPPORTUNITY_TYPES,
  getSuppliers,
  getBuyer
} from "@/lib/tender-finder";
import {
  TenderRelease,
  Party,
  Award,
  Contract
} from "@/lib/tender-finder/types";
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
    return `${value} ${currency || ""} `.trim();
  }
}

function buildAddress(party?: Party) {
  if (!party?.address) return "-";
  const { streetAddress, locality, postalCode, countryName } = party.address;
  return [streetAddress, locality, postalCode, countryName].filter(Boolean).join(", ") || "-";
}

function getBuyerParty(release: TenderRelease) {
  if (release.buyer?.id) {
    const match = release.parties?.find(party => party.id === release.buyer?.id);
    if (match) return match;
  }
  return release.parties?.find(party => party.roles?.includes("buyer"));
}

function getNoticeUrl(release: TenderRelease) {
  const fromContracts =
    release.contracts?.flatMap(contract => contract.documents || []).map(doc => doc.url).find(Boolean);
  if (fromContracts) return fromContracts;

  const fromPlanning = release.planning?.documents?.map(doc => doc.url).find(Boolean);
  if (fromPlanning) return fromPlanning;

  // Sometimes documents are attached directly to tender (though less common in OCDS for notices, but possible)
  // Check if type definition supports it? Currently TenderRelease type for 'tender' doesn't show documents array in types.ts
  // But let's check the type definition I imported.

  return null;
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
                <label className="text-xs text-muted-foreground">Notice Types</label>
                <select
                  value={stage}
                  onChange={event => setStage(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none ring-offset-2 transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">All notice types</option>
                  {OPPORTUNITY_TYPES.map(item => (
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
                        key={`${release.ocid || "release"} -${index} `}
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
                          {release.opportunity_type ? (
                            <Badge>{release.opportunity_type}</Badge>
                          ) : (
                            <span>-</span>
                          )}
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
        <DialogContent className="max-h-[95vh] w-full max-w-4xl flex flex-col overflow-hidden p-0 gap-0">
          <DialogHeader className="p-6">
            <DialogTitle>{selected?.tender?.title || "Tender details"}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="grid gap-8 pb-12">
              {/* General Info / Metadata (Outside sections) */}
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 bg-slate-50/50 p-4 rounded-lg border border-slate-100">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Release Date</p>
                  <p className="text-sm font-medium">{formatDate(selected?.date)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Notice Type</p>
                  <p className="text-sm font-medium capitalize">{selected?.opportunity_type?.replace(/-/g, ' ') || "-"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Status</p>
                  <Badge className="text-[10px] uppercase bg-white border-slate-200 text-slate-900 shadow-sm">{selected?.tender?.status || "Unknown"}</Badge>
                </div>
                {(selectedValue !== undefined || selectedContract?.value?.currency) && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Value</p>
                    <p className="text-sm font-bold text-slate-900">{formatMoney(selectedValue, selectedContract?.value?.currency)}</p>
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">OCID</p>
                  <code className="text-[10px] bg-white px-2 py-0.5 rounded border block truncate font-mono text-slate-600 shadow-sm">{selected?.ocid || "-"}</code>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Internal ID</p>
                  <code className="text-[10px] bg-white px-2 py-0.5 rounded border block truncate font-mono text-slate-600 shadow-sm">{selected?.id || "-"}</code>
                </div>
              </div>

              {/* TENDER SECTION */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900 flex items-center gap-2">
                  <span className="h-1 w-4 bg-slate-900 rounded-full" />
                  Tender
                </h3>
                <div className="grid gap-6 pl-6 border-l border-slate-100">
                  {(selected?.tender?.description || selected?.description) && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Description</p>
                      <DialogDescription
                        className="text-sm text-foreground leading-relaxed whitespace-pre-wrap pt-1"
                        dangerouslySetInnerHTML={{ __html: selected?.tender?.description || selected?.description || "" }}
                      />
                    </div>
                  )}

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Procurement Method</p>
                      <p className="text-sm capitalize font-medium">{selected?.tender?.procurementMethod || selected?.tender?.procurementMethodDetails || "-"}</p>
                      {selected?.tender?.procurementMethodRationale && (
                        <div className="mt-2 p-2 bg-slate-50 rounded border border-slate-100 italic">
                          <p className="text-[10px] text-slate-600 leading-relaxed font-medium" dangerouslySetInnerHTML={{ __html: selected.tender.procurementMethodRationale }} />
                        </div>
                      )}
                      {selected?.tender?.procurementMethodRationaleClassifications && selected.tender.procurementMethodRationaleClassifications.length > 0 && (
                        <ul className="mt-1 space-y-1">
                          {selected.tender.procurementMethodRationaleClassifications.map((c, ci) => (
                            <li key={ci} className="text-[9px] text-slate-500">• {c.description} ({c.id})</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Procurement Context</p>
                      <p className="text-sm capitalize font-medium">{selected?.tender?.mainProcurementCategory || "-"}</p>
                      <div className="space-y-1.5 mt-2">
                        {selected?.tender?.legalBasis && (
                          <div className="flex items-center gap-2">
                            <Badge className="text-[8px] py-0 px-1 bg-white border border-slate-200 text-slate-400 uppercase font-black tracking-tighter shadow-none">Legal Basis</Badge>
                            <span className="text-[10px] text-slate-600 font-medium">{selected.tender.legalBasis.id}</span>
                          </div>
                        )}
                        {selected?.tender?.coveredBy && selected.tender.coveredBy.length > 0 && (
                          <div className="flex items-center gap-2">
                            <Badge className="text-[8px] py-0 px-1 bg-white border border-slate-200 text-slate-400 uppercase font-black tracking-tighter shadow-none">Agreement</Badge>
                            <span className="text-[10px] text-slate-600 font-medium">{selected.tender.coveredBy.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Framework & DPS details */}
                  {(selected?.tender?.techniques?.hasFrameworkAgreement || selected?.tender?.techniques?.hasDynamicPurchasingSystem) && (
                    <div className="p-3 bg-slate-900 rounded-xl text-white space-y-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Procurement Technique</p>
                      <div className="flex flex-wrap gap-4">
                        {selected.tender.techniques?.hasFrameworkAgreement && (
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                              Framework Agreement
                            </p>
                            {selected.tender.techniques.frameworkAgreement?.type && (
                              <p className="text-[10px] text-slate-400 ml-3.5 capitalize">{selected.tender.techniques.frameworkAgreement.type}</p>
                            )}
                          </div>
                        )}
                        {selected.tender.techniques?.hasDynamicPurchasingSystem && (
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold flex items-center gap-2 text-purple-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                              Dynamic Market (DPS)
                            </p>
                            {selected.tender.techniques.dynamicPurchasingSystem?.status && (
                              <p className="text-[10px] text-slate-400 ml-3.5 uppercase tracking-tighter font-black">{selected.tender.techniques.dynamicPurchasingSystem.status}</p>
                            )}
                          </div>
                        )}
                      </div>
                      {selected.tender.techniques?.frameworkAgreement?.buyerCategories && (
                        <p className="text-[9px] text-slate-400 border-t border-slate-800 pt-2 ml-1">
                          Available to: <span className="text-white font-medium">{selected.tender.techniques.frameworkAgreement.buyerCategories}</span>
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {/* CPV Codes nested in Tender */}
                    {(() => {
                      const cpvs = new Set<string>();
                      if (selected?.tender?.classification) {
                        cpvs.add(`${selected.tender.classification.id}: ${selected.tender.classification.description}`);
                      }
                      selected?.tender?.items?.forEach(item => {
                        if (item.classification) cpvs.add(`${item.classification.id}: ${item.classification.description}`);
                        item.additionalClassifications?.forEach(c => cpvs.add(`${c.id}: ${c.description}`));
                      });
                      return cpvs.size > 0 && (
                        <div className="space-y-2 sm:col-span-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Classifications (CPV)</p>
                          <ul className="grid gap-1 px-1">
                            {Array.from(cpvs).map((cpv, i) => (
                              <li key={i} className="flex items-start gap-2 text-[10px] text-slate-600 leading-normal">
                                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                                <span>{cpv}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}

                    {/* Participation Fees */}
                    {selected?.tender?.participationFees && selected.tender.participationFees.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Participation Fees</p>
                        <ul className="space-y-1">
                          {selected.tender.participationFees.map((fee, fi) => (
                            <li key={fi} className="text-[10px] text-slate-600 font-medium flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rotate-45 bg-amber-400 shrink-0" />
                              {fee.description}
                              {fee.relativeValue && <span className="text-slate-400 italic">({fee.relativeValue.proportion * 100}% of {fee.relativeValue.monetaryValue})</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Submission details */}
                  {(selected?.tender?.submissionMethodDetails || selected?.tender?.submissionTerms) && (
                    <div className="grid gap-4 bg-slate-50/50 p-4 rounded-xl border border-dashed border-slate-200">
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Submission Requirements</p>
                        {selected.tender.submissionTerms?.languages && (
                          <p className="text-[10px] font-medium text-slate-700">Acceptable Languages: <span className="font-bold text-slate-900 uppercase">{selected.tender.submissionTerms.languages.join(', ')}</span></p>
                        )}
                        {selected.tender.submissionMethodDetails && (
                          <div className="text-[11px] text-slate-600 leading-relaxed font-medium" dangerouslySetInnerHTML={{ __html: selected.tender.submissionMethodDetails }} />
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 pt-2">
                    {selected?.tender?.tenderPeriod?.endDate && (
                      <div className="p-3 bg-red-50 rounded-xl border border-red-100/50 space-y-1">
                        <p className="text-[9px] font-black uppercase tracking-[0.1em] text-red-400">Tender Deadline</p>
                        <p className="text-sm font-black text-red-600">{formatDate(selected.tender.tenderPeriod.endDate)}</p>
                      </div>
                    )}
                    {selected?.tender?.enquiryPeriod?.endDate && (
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                        <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Enquiry Deadline</p>
                        <p className="text-sm font-bold text-slate-700">{formatDate(selected.tender.enquiryPeriod.endDate)}</p>
                      </div>
                    )}
                    {selected?.tender?.awardPeriod?.endDate && (
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                        <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Estimated Award</p>
                        <p className="text-sm font-bold text-slate-700">{formatDate(selected.tender.awardPeriod.endDate)}</p>
                      </div>
                    )}
                    {selected?.tender?.communication?.futureNoticeDate && (
                      <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 space-y-1">
                        <p className="text-[9px] font-black uppercase tracking-[0.1em] text-blue-400">Next Planned Notice</p>
                        <p className="text-sm font-bold text-blue-700">{formatDate(selected.tender.communication.futureNoticeDate)}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* BUYER SECTION */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900 flex items-center gap-2">
                  <span className="h-1 w-4 bg-slate-900 rounded-full" />
                  Buyer
                </h3>
                <div className="grid gap-4 pl-6 border-l border-slate-100">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-900">{selectedBuyer}</p>
                    {selectedBuyerParty && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{buildAddress(selectedBuyerParty)}</p>
                    )}
                    {selectedBuyerParty?.details?.url && (
                      <a href={selectedBuyerParty.details.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[10px] text-blue-600 hover:underline mt-1 font-medium bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                        Official Site
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* PARTIES SECTION */}
              {selected?.parties && selected.parties.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900 flex items-center gap-2">
                    <span className="h-1 w-4 bg-slate-900 rounded-full" />
                    Parties
                  </h3>
                  <div className="grid gap-3 pl-6 border-l border-slate-100 sm:grid-cols-2">
                    {selected.parties.map((p, i) => (
                      <div key={i} className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm space-y-2">
                        <div>
                          <p className="font-bold text-sm text-slate-900">{p.name || p.id}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {p.roles?.map((role, ri) => (
                              <Badge key={ri} className="text-[8px] py-0 px-1 bg-slate-100 border-transparent text-slate-600 uppercase font-bold">{role}</Badge>
                            ))}
                          </div>
                        </div>
                        {p.address && <p className="text-[10px] text-slate-500 leading-normal">{buildAddress(p)}</p>}
                        {p.contactPoint?.email && (
                          <p className="text-[10px] text-blue-600 truncate font-medium">{p.contactPoint.email}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* LOTS SECTION */}
              {selected?.tender?.lots && selected.tender.lots.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900 flex items-center gap-2">
                    <span className="h-1 w-4 bg-slate-900 rounded-full" />
                    Lots ({selected.tender.lots.length})
                  </h3>
                  <div className="grid gap-3 pl-6 border-l border-slate-100 sm:grid-cols-2">
                    {selected.tender.lots.map((lot, i) => (
                      <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col gap-3">
                        <div className="flex justify-between items-start gap-2">
                          <p className="text-xs font-black text-slate-900">{lot.title || `Lot ${lot.id}`}</p>
                          <div className="flex gap-1">
                            {lot.status && <Badge className="text-[8px] py-0 px-1 bg-white border-slate-200 uppercase font-black text-slate-500 shadow-sm">{lot.status}</Badge>}
                            {lot.suitability?.sme && <Badge className="text-[8px] py-0 px-1 bg-green-50 border-green-100 uppercase font-black text-green-600 shadow-sm">SME</Badge>}
                          </div>
                        </div>
                        {lot.description && <p className="text-[10px] text-muted-foreground leading-relaxed italic" dangerouslySetInnerHTML={{ __html: lot.description }} />}

                        {(lot.contractPeriod || lot.renewal || lot.options) && (
                          <div className="space-y-2 py-2 border-y border-slate-200/50">
                            {lot.contractPeriod && (
                              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <span className="h-1 w-1 rounded-full bg-slate-400" />
                                Duration: {lot.contractPeriod.durationInDays} days {lot.contractPeriod.maxExtentDate && <span className="text-slate-400 font-normal">(Extends to {formatDate(lot.contractPeriod.maxExtentDate)})</span>}
                              </p>
                            )}
                            {lot.renewal?.description && (
                              <div className="flex items-start gap-1.5">
                                <span className="h-1 w-1 mt-1.5 rounded-full bg-blue-400" />
                                <p className="text-[9px] text-blue-600 font-semibold uppercase">Renewal: <span className="text-slate-500 font-medium normal-case">{lot.renewal.description}</span></p>
                              </div>
                            )}
                            {lot.options?.description && (
                              <div className="flex items-start gap-1.5">
                                <span className="h-1 w-1 mt-1.5 rounded-full bg-purple-400" />
                                <p className="text-[9px] text-purple-600 font-semibold uppercase">Options: <span className="text-slate-500 font-medium normal-case">{lot.options.description}</span></p>
                              </div>
                            )}
                          </div>
                        )}

                        {lot.awardCriteria?.criteria && (
                          <div className="space-y-1.5">
                            <p className="text-[9px] font-black uppercase tracking-tighter text-slate-400">Award Criteria</p>
                            <div className="grid gap-1">
                              {lot.awardCriteria.criteria.map((crit, ci) => (
                                <div key={ci} className="flex justify-between items-center text-[10px] bg-white p-1.5 rounded border border-slate-100">
                                  <span className="font-medium text-slate-700 truncate mr-2">{crit.name || crit.type}</span>
                                  {crit.numbers?.[0]?.number && (
                                    <span className="font-black text-slate-900 bg-slate-50 px-1.5 rounded">{crit.numbers[0].number}{crit.numbers[0].weight === 'percentageExact' ? '%' : ''}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {lot.selectionCriteria?.criteria && (
                          <div className="space-y-1.5">
                            <p className="text-[9px] font-black uppercase tracking-tighter text-slate-400">Selection Criteria</p>
                            <div className="space-y-1">
                              {lot.selectionCriteria.criteria.map((crit, ci) => (
                                <div key={ci} className="text-[9px] text-slate-600 pl-2 border-l border-slate-200">
                                  <p className="font-bold uppercase text-[8px] text-slate-400">{crit.type}</p>
                                  <p className="line-clamp-2">{crit.description}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AWARDS SECTION */}
              {selected?.awards && selected.awards.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900 flex items-center gap-2">
                    <span className="h-1 w-4 bg-slate-900 rounded-full" />
                    Awards ({selected.awards.length})
                  </h3>
                  <div className="grid gap-3 pl-6 border-l border-slate-100">
                    {selected.awards.map((award, i) => (
                      <div key={i} className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm space-y-3">
                        <div className="flex justify-between items-start gap-2">
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Award Status</p>
                            <Badge className="text-[10px] uppercase bg-slate-100 border-transparent text-slate-900 font-bold">{award.status || "Unknown"}</Badge>
                          </div>
                          {award.date && (
                            <div className="text-right">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Award Date</p>
                              <p className="text-xs font-medium text-slate-700">{formatDate(award.date)}</p>
                            </div>
                          )}
                        </div>

                        {award.suppliers && award.suppliers.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Awarded Suppliers</p>
                            <div className="flex flex-wrap gap-2">
                              {award.suppliers.map((s, si) => (
                                <div key={si} className="text-[11px] font-bold text-slate-900 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 flex items-center gap-2">
                                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]" />
                                  {s.name}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {award.value && (
                          <div className="pt-2 border-t border-slate-100 flex justify-between items-end">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Award Value</p>
                              <p className="text-sm font-black text-slate-900">{formatMoney(award.value.amount, award.value.currency)}</p>
                            </div>
                            {award.items?.[0]?.description && (
                              <p className="text-[10px] text-slate-500 font-medium italic truncate max-w-[200px]">{award.items[0].description}</p>
                            )}
                          </div>
                        )}

                        {(award.items?.some(it => it.classification || it.additionalClassifications?.length)) && (
                          <div className="space-y-1.5 pt-2 border-t border-slate-50">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Awarded Classifications</p>
                            <ul className="grid gap-1 px-1">
                              {award.items.flatMap((item, ii) => {
                                const itemCpvs = [];
                                if (item.classification) itemCpvs.push(`${item.classification.id}: ${item.classification.description}`);
                                item.additionalClassifications?.forEach(c => itemCpvs.push(`${c.id}: ${c.description}`));
                                return itemCpvs.map((cpv, ci) => (
                                  <li key={`${ii}-${ci}`} className="flex items-start gap-2 text-[10px] text-slate-600 leading-normal">
                                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                                    {cpv}
                                  </li>
                                ));
                              })}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CONTRACTS SECTION */}
              {selected?.contracts && selected.contracts.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900 flex items-center gap-2">
                    <span className="h-1 w-4 bg-slate-900 rounded-full" />
                    Contracts ({selected.contracts.length})
                  </h3>
                  <div className="grid gap-4 pl-6 border-l border-slate-100">
                    {selected.contracts.map((contract, i) => (
                      <div key={i} className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
                        <div className="flex justify-between items-start gap-3">
                          <div className="space-y-1 min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Contract Reference</p>
                            <p className="text-sm font-black text-slate-900 truncate">{contract.title || contract.id || `Contract ${i + 1}`}</p>
                          </div>
                          {contract.status && (
                            <div className="flex gap-2">
                              {contract.aboveThreshold && (
                                <Badge className="text-[10px] uppercase bg-amber-50 border-amber-100 text-amber-600 font-black shadow-none">
                                  Above Threshold
                                </Badge>
                              )}
                              <Badge className="text-[10px] uppercase bg-blue-50 border-blue-100 text-blue-600 font-black shadow-none">
                                {contract.status}
                              </Badge>
                            </div>
                          )}
                        </div>

                        <div className="grid gap-6 sm:grid-cols-3 pt-2 border-t border-slate-50">
                          {contract.period?.startDate && (
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Start Date</p>
                              <p className="text-xs font-semibold text-slate-700">{formatDate(contract.period.startDate)}</p>
                            </div>
                          )}
                          {contract.period?.endDate && (
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">End Date</p>
                              <p className="text-xs font-semibold text-slate-700">{formatDate(contract.period.endDate)}</p>
                            </div>
                          )}
                          {contract.dateSigned && (
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Signed Date</p>
                              <p className="text-xs font-semibold text-slate-700">{formatDate(contract.dateSigned)}</p>
                            </div>
                          )}
                        </div>

                        {contract.value && (
                          <div className="p-3 bg-slate-50 rounded-xl flex justify-between items-center">
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-tight text-slate-400">Contract Value</p>
                              <p className="text-sm font-black text-slate-900">{formatMoney(contract.value.amount, contract.value.currency)}</p>
                            </div>
                            {contract.value.amountGross && (
                              <div className="text-right">
                                <p className="text-[9px] font-black uppercase tracking-tight text-slate-400 text-right">Gross Amount</p>
                                <p className="text-xs font-bold text-slate-500">{formatMoney(contract.value.amountGross, contract.value.currency)}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {contract.documents && contract.documents.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Contract Documents</p>
                            <div className="grid gap-2">
                              {contract.documents.map((doc, di) => (
                                <a
                                  key={di}
                                  href={doc.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl group hover:border-slate-900 transition-all hover:shadow-md"
                                >
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-[11px] font-bold text-slate-900 group-hover:underline underline-offset-2 truncate">{doc.description || doc.documentType || "Contract Document"}</span>
                                    <span className="text-[9px] uppercase font-black text-slate-400 mt-0.5">{doc.documentType} {doc.noticeType ? `(${doc.noticeType})` : ""} • {doc.format || "FILE"}</span>
                                  </div>
                                  <span className="text-[9px] font-bold text-slate-400 ml-4 shrink-0">{doc.datePublished ? formatDate(doc.datePublished) : ""}</span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* DOCUMENTS SECTION */}
              {(() => {
                const docs = [
                  ...(selected?.planning?.documents || []),
                  ...(selected?.tender?.documents || []),
                  ...(selected?.awards?.flatMap(a => a.documents || []) || [])
                  // Contract documents move to Contract section
                ];
                return docs.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900 flex items-center gap-2">
                      <span className="h-1 w-4 bg-slate-900 rounded-full" />
                      Documents
                    </h3>
                    <div className="grid gap-2 pl-6 border-l border-slate-100">
                      {docs.map((doc, i) => (
                        <a
                          key={i}
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg group hover:border-slate-900 transition-colors"
                        >
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-900 group-hover:underline underline-offset-2">{doc.description || doc.documentType || "Untitled Document"}</span>
                            <span className="text-[9px] uppercase font-black text-slate-400 mt-0.5">{doc.documentType} {doc.noticeType ? `(${doc.noticeType})` : ""} • {doc.format || "FILE"}</span>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400">{doc.datePublished ? formatDate(doc.datePublished) : ""}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* OTHERS (Not in specific sections) */}
              <div className="space-y-6 pt-4 border-t border-slate-200">
                {/* Contract specifics moved to Contracts section */}

                {/* Milestones & Bids */}
                {(selected?.planning?.milestones || selected?.bids?.statistics) && (
                  <div className="grid gap-8 sm:grid-cols-2">
                    {selected?.planning?.milestones && (
                      <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Milestones</p>
                        <div className="space-y-2">
                          {selected.planning.milestones.map((m, i) => (
                            <div key={i} className="text-[10px] border-l-2 border-slate-900 pl-3 py-1 bg-slate-50/50 rounded-r-md">
                              <p className="font-bold text-slate-900">{m.type || "Milestone"}: <span className="font-normal text-slate-400 uppercase text-[9px]">{m.status}</span></p>
                              <p className="text-slate-500 mt-0.5 leading-relaxed">{m.description}</p>
                              <p className="text-[9px] font-black text-slate-400 mt-1 uppercase">Due: {formatDate(m.dueDate)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {selected?.bids?.statistics && (
                      <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Submission Statistics</p>
                        <div className="grid gap-2">
                          {selected.bids.statistics.map((s, i) => (
                            <div key={i} className="flex justify-between items-center text-[11px] bg-slate-900 p-2.5 rounded-lg text-white">
                              <span className="capitalize font-medium text-slate-300">{s.measure}</span>
                              <span className="font-black text-lg">{s.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Amendments & Recurrence */}
                {(selectedContract?.amendments || selected?.tender?.amendments || selected?.tender?.hasRecurrence) && (
                  <div className="grid gap-8">
                    {/* Tender level amendments */}
                    {selected?.tender?.amendments && selected.tender.amendments.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-amber-600">Tender Amendments</p>
                        <div className="grid gap-2">
                          {selected.tender.amendments.map((a, i) => (
                            <div key={i} className="bg-amber-50/50 p-4 rounded-xl border border-amber-100/50">
                              <p className="text-xs font-bold text-amber-900">{a.description}</p>
                              {a.rationale && <p className="text-[10px] text-amber-700/80 mt-1.5 leading-relaxed italic">{a.rationale}</p>}
                              {a.date && <p className="text-[9px] font-black text-amber-400 mt-1 uppercase">Published: {formatDate(a.date)}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Contract level amendments */}
                    {selectedContract?.amendments && (
                      <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-amber-600">Contract Amendments</p>
                        <div className="grid gap-2">
                          {selectedContract.amendments.map((a, i) => (
                            <div key={i} className="bg-amber-50/50 p-4 rounded-xl border border-amber-100/50">
                              <p className="text-xs font-bold text-amber-900">{a.description}</p>
                              {a.rationale && <p className="text-[10px] text-amber-700/80 mt-1.5 leading-relaxed italic">{a.rationale}</p>}
                              {a.date && <p className="text-[9px] font-black text-amber-400 mt-1 uppercase">Date: {formatDate(a.date)}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Agreed Metrics */}
                    {selectedContract?.agreedMetrics && (
                      <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-blue-600">Agreed Metrics</p>
                        <div className="grid gap-2">
                          {selectedContract.agreedMetrics.map((m, i) => (
                            <div key={i} className="bg-blue-50/50 p-3 rounded-xl border border-blue-100/50 flex items-start gap-3">
                              <span className="h-4 w-4 rounded-full bg-blue-600 text-[10px] font-black text-white flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                              <p className="text-xs font-medium text-blue-900 leading-relaxed">{m.title}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selected?.tender?.hasRecurrence && (
                      <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Recurring Procurement</p>
                        <p className="text-xs text-indigo-900 font-medium">This notice has been flagged for future recurrence.</p>
                        {selected.tender.recurrence?.dates?.[0]?.startDate && (
                          <p className="text-[10px] font-bold text-indigo-600 uppercase mt-1">Est. Next Notice: {formatDate(selected.tender.recurrence.dates[0].startDate)}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="p-6">
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
