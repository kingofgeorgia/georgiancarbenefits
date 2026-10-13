"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { CalculatorResult, CarListing, DealRating } from "@/lib/types";
import {
  AlertTriangle,
  BarChart3,
  Gauge,
  MessageCircle,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtKm(n: number) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n)} km`;
}

interface Props {
  result: CalculatorResult;
  vehicle?: CarListing | null;
}

const ratingClass: Record<DealRating, string> = {
  EXCELLENT: "bg-emerald-600 text-white",
  GOOD: "bg-green-600 text-white",
  FAIR: "bg-lime-600 text-white",
  WEAK: "bg-amber-500 text-white",
  BAD: "bg-red-600 text-white",
};

function buildContactUrl(message: string) {
  const base = process.env.NEXT_PUBLIC_MILEON_CONTACT_URL ?? "https://wa.me/995577115757";
  if (!base.includes("wa.me/")) return base;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}text=${encodeURIComponent(message)}`;
}

export function CalculatorResults({ result, vehicle }: Props) {
  const t = useTranslations("calculator.results");
  const deal = result.deal_assessment;
  const market = result.market_comparison;
  const hasSavings = result.savings_vs_rf_rub != null;
  const isProfit = hasSavings && result.savings_vs_rf_rub! > 0;
  const isAggregate = result.customs_payment_kind === "AGGREGATE_PAYMENT";
  const vehicleLabel = vehicle ? `${vehicle.make} ${vehicle.model} ${vehicle.year}` : t("ctaGenericVehicle");
  const leadMessage = t("ctaMessage", {
    vehicle: vehicleLabel,
    total: fmt(result.total_cost_rub),
    score: deal?.score ?? "—",
    sourceUrl: vehicle?.url ?? "—",
  });
  const contactUrl = buildContactUrl(leadMessage);
  const powerBasisLabel = result.power_basis === "MAX_30_MINUTE_ELECTRIC_POWER_KW"
    ? t("powerBasis30Minute")
    : t("powerBasisHorsepower");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {result.age_is_estimated && (
          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{t("ageEstimated")}</span>
          </div>
        )}

        <Row label={t("carPrice")} value={fmt(result.car_price_rub)} />
        <Row label={t("customsFee")} value={fmt(result.customs_fee_rub)} />

        {isAggregate ? (
          <>
            <Row label={t("importDuty")} value={fmt(result.import_duty_rub)} />
            <Row label={t("excise")} value={fmt(result.excise_rub)} />
            <Row label={t("vat")} value={fmt(result.vat_rub)} />
            <Row label={t("aggregatePayment")} value={fmt(result.customs_duty_rub)} bold />
          </>
        ) : (
          <Row label={t("customsDuty")} value={fmt(result.customs_duty_rub)} />
        )}

        <Row label={t("recyclingFee")} value={fmt(result.recycling_fee_rub)} />
        <Row
          label={t("powerUsed")}
          value={`${result.power_kw_used.toFixed(2)} kW · ${powerBasisLabel}`}
        />
        <Row label={t("customsTotal")} value={fmt(result.customs_total_rub)} bold />
        <Row label={t("logistics")} value={fmt(result.logistics_cost_rub)} />
        <Separator />
        <Row label={t("total")} value={fmt(result.total_cost_rub)} bold />

        {market && (
          <div className="mt-5 space-y-3 rounded-xl border bg-blue-50/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold">
                <BarChart3 className="h-5 w-5" />
                <span>{t("marketComparisonTitle")}</span>
              </div>
              <Badge variant="outline">{market.source}</Badge>
            </div>

            {market.status === "AVAILABLE" ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  {market.similar_count != null && <Row label={t("marketSimilarCount")} value={String(market.similar_count)} />}
                  {market.average_mileage_km != null && <Row label={t("marketAverageMileage")} value={fmtKm(market.average_mileage_km)} />}
                  {market.min_price_rub != null && <Row label={t("marketMinPrice")} value={fmt(market.min_price_rub)} />}
                  {market.average_price_rub != null && <Row label={t("marketAveragePrice")} value={fmt(market.average_price_rub)} />}
                  {market.market_midpoint_rub != null && <Row label={t("marketMidpointPrice")} value={fmt(market.market_midpoint_rub)} />}
                  {market.max_price_rub != null && <Row label={t("marketMaxPrice")} value={fmt(market.max_price_rub)} />}
                </div>
                <p className="text-xs text-muted-foreground">
                  {market.is_mileage_adjusted ? t("marketMileageAdjusted") : t("marketMileageNotAdjusted")}
                </p>
                <p className="text-xs text-muted-foreground">{t("marketMedianUnavailable")}</p>
                {market.removed_params.length > 0 && (
                  <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{t("marketRemovedParams", { params: market.removed_params.join(", ") })}</span>
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  {t("marketCheckedAt")}: {new Date(market.checked_at).toLocaleString()}
                </div>
              </>
            ) : (
              <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{t(`marketStatus.${market.status}`)}</span>
              </div>
            )}
          </div>
        )}

        {deal ? (
          <div className="mt-5 space-y-4 rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-semibold">
                <Gauge className="h-5 w-5" />
                <span>{t("dealScore")}</span>
              </div>
              <Badge className={ratingClass[deal.rating]}>
                {deal.score}/100 · {t(`dealRating.${deal.rating}`)}
              </Badge>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-foreground transition-all"
                style={{ width: `${deal.score}%` }}
                aria-label={`${t("dealScore")}: ${deal.score}/100`}
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Row label={t("rfReferencePrice")} value={fmt(deal.reference_price_rub)} />
              <Row
                label={t("marketPosition")}
                value={t(`marketPositionValue.${deal.market_position}`)}
              />
              {result.deal_reference_source && (
                <Row
                  label={t("dealReferenceSource")}
                  value={result.deal_reference_source === "MANUAL" ? t("dealReferenceManual") : t("dealReferenceAuto")}
                />
              )}
            </div>

            <div
              className={`flex items-center gap-2 rounded-lg p-3 font-semibold ${
                isProfit ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}
            >
              {isProfit ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
              <span>
                {isProfit ? t("savings") : t("overpay")}: {fmt(Math.abs(deal.savings_rub))}
                {` (${Math.abs(deal.savings_percent).toFixed(1)}%)`}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            {t("dealScoreHint")}
          </div>
        )}

        <div className="mt-5 rounded-xl border bg-primary/5 p-4">
          <div className="font-semibold">{t("ctaTitle")}</div>
          <p className="mt-1 text-sm text-muted-foreground">{t("ctaDescription")}</p>
          <a
            href={contactUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <MessageCircle className="h-4 w-4" />
            {t("ctaButton")}
          </a>
        </div>

        <div className="mt-4 space-y-1 text-xs text-gray-500">
          <div className="flex gap-4 flex-wrap">
            <span>USD = {result.rates.usd_to_rub.toFixed(2)} ₽</span>
            <span>EUR = {result.rates.eur_to_rub.toFixed(2)} ₽</span>
            <span>GEL = {result.rates.gel_to_rub.toFixed(2)} ₽</span>
          </div>
          <div>
            {t("rateSource")}: {result.rates.source}, {result.rates.effective_date}
            {result.rates.is_stale ? ` · ${t("staleRate")}` : ""}
          </div>
          <div>{t("manufactureDateUsed")}: {result.manufacture_date_used}</div>
          <div>{t("ruleVersion")}: {result.calculation_rule_version}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-semibold text-base" : "text-sm"}`}>
      <span className="text-gray-600">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
