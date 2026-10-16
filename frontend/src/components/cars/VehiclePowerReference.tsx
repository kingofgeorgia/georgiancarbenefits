"use client";

import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import type { VehicleSpecification } from "@/lib/types";

export function VehiclePowerReference({ entry }: { entry: VehicleSpecification }) {
  const t = useTranslations("specifications");
  return <div className="min-w-0 space-y-1 text-xs text-muted-foreground" data-testid="power-reference">
    <p>{t("referencePower", { power: entry.horse_power })} · {entry.power_value} {t(`unit.${entry.power_unit}`)} · {entry.market}</p>
    <a href={entry.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-start gap-1 break-words underline underline-offset-2"><span className="min-w-0 break-words">{entry.source_title}</span><ExternalLink aria-hidden className="mt-0.5 h-3 w-3 shrink-0" /></a>
    <p>{t("verified", { date: entry.verified_on })}</p>
    {entry.powertrain_kind !== "ICE" && <p className="text-amber-800">{t("referenceWarning")}</p>}
    {entry.engine_cc === null && <p>{t("exactEngineMissing")}</p>}
  </div>;
}
