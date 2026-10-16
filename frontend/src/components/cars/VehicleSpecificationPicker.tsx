"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, apiErrorMessage } from "@/lib/api";
import type { VehicleSpecification, VehicleSpecificationCatalog } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { VehiclePowerReference } from "./VehiclePowerReference";

const selectClass = "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm";

export function VehicleSpecificationPicker({ onApply, disabled }: { onApply: (entry: VehicleSpecification, year: number) => void; disabled: boolean }) {
  const t = useTranslations("specifications");
  const tErr = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState({ make: "", model: "", year: "", entry: "" });
  const catalog = useQuery({
    queryKey: ["vehicle-specifications"], enabled: open, retry: false, staleTime: 3600000,
    queryFn: ({ signal }) => api.get<VehicleSpecificationCatalog>("/cars/specifications", { signal }).then((response) => response.data),
  });
  const items = catalog.data?.items ?? [];
  const makes = [...new Set(items.map((entry) => entry.make))].sort();
  const models = [...new Set(items.filter((entry) => entry.make === filters.make).map((entry) => entry.model))].sort();
  const modelEntries = items.filter((entry) => entry.make === filters.make && entry.model === filters.model);
  const years = [...new Set(modelEntries.flatMap((entry) => Array.from({ length: entry.year_to - entry.year_from + 1 }, (_, index) => entry.year_from + index)))].sort((a, b) => b - a);
  const candidates = modelEntries.filter((entry) => Number(filters.year) >= entry.year_from && Number(filters.year) <= entry.year_to);
  const selected = candidates.find((entry) => entry.id === filters.entry);

  return <details className="min-w-0 border-y py-3" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-sm font-medium"><BookOpen aria-hidden className="mr-2 inline h-4 w-4" />{t("title")}</summary>
    <div className="mt-4 min-w-0 space-y-4" role="region" aria-label={t("title")}>
      {catalog.isFetching && <Loader2 aria-label={t("loading")} className="h-4 w-4 animate-spin" />}
      {catalog.isError && <div role="alert" className="space-y-2 text-sm text-red-600"><p>{apiErrorMessage(catalog.error, tErr("generic"), { rateLimited: tErr("rateLimited"), payloadTooLarge: tErr("payloadTooLarge"), temporarilyUnavailable: tErr("temporarilyUnavailable") })}</p><Button type="button" variant="outline" size="sm" onClick={() => void catalog.refetch()}>{t("retry")}</Button></div>}
      {catalog.data && <>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1"><Label htmlFor="spec-make">{t("make")}</Label><select id="spec-make" className={selectClass} disabled={disabled} value={filters.make} onChange={(event) => setFilters({ make: event.target.value, model: "", year: "", entry: "" })}><option value="">{t("choose")}</option>{makes.map((make) => <option key={make}>{make}</option>)}</select></div>
          <div className="min-w-0 space-y-1"><Label htmlFor="spec-model">{t("model")}</Label><select id="spec-model" className={selectClass} disabled={disabled || !filters.make} value={filters.model} onChange={(event) => setFilters((current) => ({ ...current, model: event.target.value, year: "", entry: "" }))}><option value="">{t("choose")}</option>{models.map((model) => <option key={model}>{model}</option>)}</select></div>
          <div className="min-w-0 space-y-1"><Label htmlFor="spec-year">{t("year")}</Label><select id="spec-year" className={selectClass} disabled={disabled || !filters.model} value={filters.year} onChange={(event) => setFilters((current) => ({ ...current, year: event.target.value, entry: "" }))}><option value="">{t("choose")}</option>{years.map((year) => <option key={year}>{year}</option>)}</select></div>
          <div className="min-w-0 space-y-1"><Label htmlFor="spec-entry">{t("modification")}</Label><select id="spec-entry" className={selectClass} disabled={disabled || !filters.year} value={filters.entry} onChange={(event) => setFilters((current) => ({ ...current, entry: event.target.value }))}><option value="">{t("choose")}</option>{candidates.map((entry) => <option key={entry.id} value={entry.id}>{entry.modification} · {entry.market}</option>)}</select></div>
        </div>
        {selected && <div className="min-w-0 space-y-3">
          <p className="break-words text-sm font-medium">{selected.make} {selected.model} {selected.modification} · {filters.year} · {selected.market}</p>
          <VehiclePowerReference entry={selected} />
          <Button type="button" variant="secondary" className="h-auto min-h-10 max-w-full whitespace-normal" disabled={disabled} onClick={() => onApply(selected, Number(filters.year))}><Check aria-hidden className="h-4 w-4 shrink-0" />{t("apply")}</Button>
        </div>}
        <p className="text-xs text-muted-foreground">{t("coverage", { count: items.length, version: catalog.data.version })}</p>
      </>}
    </div>
  </details>;
}
