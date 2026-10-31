"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getVehicleCatalog } from "@/lib/vehicle-catalog";

export interface TeslaPowerVariant {
  id: string;
  model: string;
  version: string;
  year_from: number;
  year_to: number;
  drive_type: string;
  motor_codes: string;
  power_kw: number;
  power_hp: number;
  notes: string;
}

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function TeslaPowerPicker({
  model,
  year,
  disabled,
  autoOpen,
  onAutoOpenHandled,
  onApply,
}: {
  model: string;
  year: number;
  disabled: boolean;
  autoOpen: boolean;
  onAutoOpenHandled: () => void;
  onApply: (variant: TeslaPowerVariant) => void;
}) {
  const t = useTranslations("calculator");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [variants, setVariants] = useState<TeslaPowerVariant[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [selectedId, setSelectedId] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    getVehicleCatalog()
      .then((catalog) => {
        if (active) {
          setVariants(catalog.tesla_power_variants);
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
    if (!autoOpen || loadState !== "ready" || year < 2000) return;
    setSelectedId("");
    setOpen(true);
    onAutoOpenHandled();
  }, [autoOpen, loadState, onAutoOpenHandled, year]);

  const candidates = useMemo(() => variants.filter((entry) =>
    normalise(entry.model) === normalise(model) && year >= entry.year_from && year <= entry.year_to,
  ).sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true, sensitivity: "base" })), [model, variants, year]);
  const selected = candidates.find((entry) => entry.id === selectedId);

  function openPicker() {
    setSelectedId("");
    setOpen(true);
  }

  return <>
    <Button type="button" variant="outline" disabled={disabled || !model || year < 2000} onClick={openPicker}>
      {t("teslaVariantButton")}
    </Button>
    <dialog
      ref={dialogRef}
      aria-labelledby="tesla-power-title"
      className="m-auto max-h-[90vh] w-[min(44rem,calc(100vw-2rem))] rounded-xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/50"
      onCancel={(event) => { event.preventDefault(); setOpen(false); }}
      onClose={() => setOpen(false)}
    >
      <div className="flex items-start justify-between gap-4 border-b p-5">
        <div>
          <h2 id="tesla-power-title" className="text-lg font-semibold">{t("teslaVariantTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Tesla {model || "—"} · {year || "—"}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" aria-label={t("teslaVariantClose")} onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
      </div>
      <div className="max-h-[calc(90vh-5rem)] space-y-4 overflow-y-auto p-5">
        {loadState === "loading" && <p role="status" className="text-sm text-muted-foreground">{t("teslaVariantLoading")}</p>}
        {loadState === "error" && <p role="alert" className="text-sm text-red-600">{t("teslaVariantUnavailable")}</p>}
        {loadState === "ready" && <>
          {!candidates.length ? <p className="text-sm text-muted-foreground">{t("teslaVariantEmpty")}</p> : <>
            <p className="text-sm text-muted-foreground">{t("teslaVariantSourceNote")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {candidates.map((entry) => <button
                key={entry.id}
                type="button"
                aria-pressed={entry.id === selectedId}
                onClick={() => setSelectedId(entry.id)}
                className={`rounded-lg border p-3 text-left transition-colors ${entry.id === selectedId ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/50 hover:bg-muted/30"}`}
              >
                <span className="block font-semibold">{entry.version}</span>
                <span className="mt-1 block text-sm">{t("teslaVariantPower")}: {entry.power_kw} kW · {entry.power_hp} hp</span>
                <span className="block text-sm text-muted-foreground">{t("teslaVariantDrive")}: {entry.drive_type} · {t("teslaVariantMotors")}: {entry.motor_codes}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{entry.notes}</span>
              </button>)}
            </div>
          </>}
          {selected && <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => { onApply(selected); setOpen(false); }}>
            <Check className="h-4 w-4" />{t("teslaVariantApply")}
          </Button>}
        </>}
      </div>
    </dialog>
  </>;
}
