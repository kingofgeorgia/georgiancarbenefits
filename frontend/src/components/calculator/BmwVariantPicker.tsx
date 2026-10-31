"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getVehicleCatalog } from "@/lib/vehicle-catalog";

export interface BmwVariant {
  id: string;
  make: "BMW";
  model: string;
  version?: string;
  chassis: string;
  body: string;
  engine_code: string;
  engine_cc: number | null;
  power_kw: number;
  power_ps: number;
  drive: string;
  production_from: string;
  production_to: string;
  user_provided?: boolean;
  applicability_status?: "YEAR_SPECIFIED" | "YEAR_NOT_SPECIFIED";
  powertrain_kind?: "ICE" | "OTHER_HYBRID" | "EV" | "SERIES_HYBRID";
}

type Copy = {
  button: string;
  title: string;
  model: string;
  year: string;
  variant: string;
  choose: string;
  apply: string;
  close: string;
  loading: string;
  unavailable: string;
  empty: string;
  yearNotSpecifiedNotice: string;
  missingDisplacement: string;
  power: string;
  displacement: string;
  source: string;
  bodyCoupe: string;
  bodyConvertible: string;
  bodyGranCoupe: string;
  standardVersion: string;
  competitionVersion: string;
  horsepowerUnit: string;
  kilowattUnit: string;
  displacementUnit: string;
  rearDrive: string;
  allDrive: string;
  bodySelect: string;
};

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const yearOf = (value: string) => Number(value.slice(0, 4));

export function BmwVariantPicker({
  make,
  model,
  year,
  disabled,
  copy,
  autoOpen,
  onAutoOpenHandled,
  onApply,
}: {
  make: string;
  model: string;
  year: number;
  disabled: boolean;
  copy: Copy;
  autoOpen: boolean;
  onAutoOpenHandled: () => void;
  onApply: (variant: BmwVariant, year: number) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [variants, setVariants] = useState<BmwVariant[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedBodyKey, setSelectedBodyKey] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    getVehicleCatalog()
      .then((catalog) => {
        if (active) {
          setVariants(catalog.bmw_variants);
          setLoadState("ready");
        }
      })
      .catch(() => {
        if (active) setLoadState("error");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!autoOpen || loadState !== "ready") return;
    const normalizedModel = normalise(model);
    const exactModel = [...new Set(variants.map((entry) => entry.model))]
      .find((item) => normalise(item) === normalizedModel) ?? "";
    const hasYear = exactModel && variants.some((entry) => entry.model === exactModel
      && (entry.applicability_status === "YEAR_NOT_SPECIFIED"
        || (year >= yearOf(entry.production_from) && year <= yearOf(entry.production_to))));
    setSelectedModel(exactModel);
    setSelectedYear(hasYear ? String(year) : "");
    setSelectedBodyKey("");
    setSelectedId("");
    setOpen(true);
    onAutoOpenHandled();
  }, [autoOpen, loadState, model, onAutoOpenHandled, variants, year]);

  const modelOptions = useMemo(() => [...new Set(variants.map((entry) => entry.model))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })), [variants]);
  const modelVariants = useMemo(() => variants.filter((entry) => entry.model === selectedModel), [variants, selectedModel]);
  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    modelVariants.forEach((entry) => {
      if (entry.applicability_status === "YEAR_NOT_SPECIFIED") {
        for (let item = 1990; item <= new Date().getFullYear(); item += 1) years.add(item);
        return;
      }
      const start = yearOf(entry.production_from);
      const end = yearOf(entry.production_to);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;
      for (let item = Math.max(1990, start); item <= end; item += 1) years.add(item);
    });
    return [...years].sort((a, b) => b - a);
  }, [modelVariants]);
  const candidates = useMemo(() => modelVariants.filter((entry) => {
    const value = Number(selectedYear);
    const start = yearOf(entry.production_from);
    const end = yearOf(entry.production_to);
    return entry.applicability_status === "YEAR_NOT_SPECIFIED"
      ? Number.isInteger(value) && value >= 1990
      : value >= start && value <= end;
  }).sort((a, b) => {
    const bodyOrder = (body: string) => /gran coup[eé]/i.test(body) ? 0 : /coup[eé]/i.test(body) ? 1 : /convertible|cabrio/i.test(body) ? 2 : 3;
    return bodyOrder(a.body) - bodyOrder(b.body) || a.chassis.localeCompare(b.chassis) || a.power_ps - b.power_ps;
  }), [modelVariants, selectedYear]);
  const followsCalculatorSelection = Boolean(model && year >= 1990
    && normalise(selectedModel) === normalise(model)
    && selectedYear === String(year));
  const candidateGroups = useMemo(() => {
    const groups = new Map<string, BmwVariant[]>();
    candidates.forEach((entry) => {
      const key = `${entry.body}|${entry.chassis}`;
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    });
    return [...groups.entries()];
  }, [candidates]);
  const selected = candidates.find((entry) => entry.id === selectedId);

  function bodyLabel(body: string) {
    if (/gran coup[eé]/i.test(body)) return copy.bodyGranCoupe;
    if (/coup[eé]/i.test(body)) return copy.bodyCoupe;
    if (/convertible|cabrio/i.test(body)) return copy.bodyConvertible;
    return body;
  }

  function versionLabel(entry: BmwVariant) {
    if (/competition/i.test(entry.version ?? "")) return copy.competitionVersion;
    if (/standard/i.test(entry.version ?? "")) return copy.standardVersion;
    return entry.version || copy.standardVersion;
  }

  function driveLabel(drive: string) {
    if (/all[\s-]*wheel/i.test(drive)) return copy.allDrive;
    if (/rear[\s-]*wheel/i.test(drive)) return copy.rearDrive;
    return drive;
  }

  function openPicker() {
    const normalizedModel = normalise(model);
    const exactModel = modelOptions.find((item) => normalise(item) === normalizedModel);
    const hasYear = exactModel && variants.some((entry) => entry.model === exactModel
      && (entry.applicability_status === "YEAR_NOT_SPECIFIED"
        || (year >= yearOf(entry.production_from) && year <= yearOf(entry.production_to))));
    setSelectedModel(exactModel ?? "");
    setSelectedYear(hasYear ? String(year) : "");
    setSelectedBodyKey("");
    setSelectedId("");
    setOpen(true);
  }

  return <>
    <Button type="button" variant="outline" disabled={disabled || !make} onClick={openPicker}>
      {copy.button}
    </Button>
    <dialog
      ref={dialogRef}
      aria-labelledby="bmw-variant-title"
      className="m-auto max-h-[90vh] w-[min(44rem,calc(100vw-2rem))] rounded-xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/50"
      onCancel={(event) => { event.preventDefault(); setOpen(false); }}
      onClose={() => setOpen(false)}
    >
        <div className="flex items-start justify-between gap-4 border-b p-5">
        <div>
          <h2 id="bmw-variant-title" className="text-lg font-semibold">{copy.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">BMW {selectedModel || model || "—"} · {selectedYear || year || "—"}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" aria-label={copy.close} onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
      </div>
      <div className="max-h-[calc(90vh-5rem)] space-y-4 overflow-y-auto p-5">
        {loadState === "loading" && <p role="status" className="text-sm text-muted-foreground">{copy.loading}</p>}
        {loadState === "error" && <p role="alert" className="text-sm text-red-600">{copy.unavailable}</p>}
        {loadState === "ready" && <>
          {!followsCalculatorSelection && <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="bmw-variant-model">{copy.model}</Label>
              <select id="bmw-variant-model" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedModel} onChange={(event) => { setSelectedModel(event.target.value); setSelectedYear(""); setSelectedBodyKey(""); setSelectedId(""); }}>
                <option value="">{copy.choose}</option>
                {modelOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bmw-variant-year">{copy.year}</Label>
              <select id="bmw-variant-year" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedYear} disabled={!selectedModel} onChange={(event) => { setSelectedYear(event.target.value); setSelectedBodyKey(""); setSelectedId(""); }}>
                <option value="">{copy.choose}</option>
                {yearOptions.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
          </div>}
          {selectedYear && <div className="space-y-4">
            {candidateGroups.length ? <>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{copy.bodySelect}</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {candidateGroups.map(([key]) => {
                    const [body, chassis] = key.split("|");
                    const isSelected = key === selectedBodyKey;
                    return <button
                      key={key}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => { setSelectedBodyKey(key); setSelectedId(""); }}
                      className={`rounded-lg border p-3 text-left transition-colors ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/50 hover:bg-muted/30"}`}
                    >
                      <span className="block font-semibold">{bodyLabel(body)}</span>
                      <span className="block text-sm text-muted-foreground">{chassis}</span>
                    </button>;
                  })}
                </div>
              </fieldset>
              {selectedBodyKey && <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{copy.variant}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(candidateGroups.find(([key]) => key === selectedBodyKey)?.[1] ?? []).map((entry) => {
                    const isSelected = entry.id === selectedId;
                    return <button
                      key={entry.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedId(entry.id)}
                      className={`rounded-lg border p-3 text-left transition-colors ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/50 hover:bg-muted/30"}`}
                    >
                      <span className="block font-semibold">{versionLabel(entry)}</span>
                      <span className="mt-1 block text-sm">{copy.power}: {entry.power_ps.toLocaleString()} {copy.horsepowerUnit} · {entry.power_kw} {copy.kilowattUnit}</span>
                      <span className="block text-sm text-muted-foreground">{copy.displacement}: {entry.engine_cc ? `${entry.engine_cc.toLocaleString()} ${copy.displacementUnit}` : copy.missingDisplacement} · {driveLabel(entry.drive)}</span>
                    </button>;
                  })}
                </div>
              </fieldset>}
            </> : <p className="text-sm text-muted-foreground">{copy.empty}</p>}
          </div>}
          {selected && <div className="space-y-3 rounded-lg border bg-muted/20 p-3 text-sm">
            {selected.applicability_status === "YEAR_NOT_SPECIFIED" && <p className="text-xs text-amber-800">{copy.yearNotSpecifiedNotice}</p>}
            {!selected.engine_cc && <p className="text-xs text-amber-800">{copy.missingDisplacement}</p>}
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => { onApply(selected, Number(selectedYear)); setOpen(false); }}>
              <Check className="h-4 w-4" />{copy.apply}
            </Button>
          </div>}
        </>}
      </div>
    </dialog>
  </>;
}
