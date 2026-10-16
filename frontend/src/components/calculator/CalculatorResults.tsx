"use client";

import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { CalculatorResult, DealVehicleSnapshot, DealRating, MarketComparisonStatus } from "@/lib/types";
import { formatManufactureMonth } from "@/lib/manufacture-date";
import {
  AlertTriangle,
  BarChart3,
  Gauge,
  MessageCircle,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

const METRIC_HP_PER_KW = 1.3596216173;

const dromCopy = {
  ru: {
    medianPrice: "Медианная цена",
    mileageFiltered: "Deal Score использует медиану объявлений Drom с похожим пробегом после удаления крайних ценовых выбросов.",
    medianReference: "Deal Score использует медиану объявлений Drom того же года после удаления крайних ценовых выбросов.",
    referenceSource: "Drom",
    status: {
      NOT_CONFIGURED: "Автоматическое сравнение через Drom подготовлено, но разрешённый API-доступ ещё не подтверждён на сервере.",
      MISSING_VEHICLE_DATA: "Для автоматического сравнения нужны марка и модель автомобиля.",
      VEHICLE_NOT_FOUND: "Для этой марки или модели ещё не настроены идентификаторы Drom.",
      INSUFFICIENT_DATA: "Для этого автомобиля недостаточно подходящих объявлений Drom для надёжной оценки.",
      AUTH_ERROR: "Drom отклонил авторизацию. Проверьте разрешённый API-доступ и параметры интеграции.",
      PROVIDER_ERROR: "Сервис рыночной оценки Drom временно недоступен. Таможенный расчёт при этом остаётся действительным.",
      AVAILABLE: "Рыночная оценка доступна.",
    },
  },
  en: {
    medianPrice: "Median price",
    mileageFiltered: "Deal Score uses the median of Drom listings with similar mileage after trimming extreme price outliers.",
    medianReference: "Deal Score uses the median of same-year Drom listings after trimming extreme price outliers.",
    referenceSource: "Drom",
    status: {
      NOT_CONFIGURED: "Automatic Drom comparison is prepared, but authorized API access has not yet been confirmed on the server.",
      MISSING_VEHICLE_DATA: "Make and model are required for automatic comparison.",
      VEHICLE_NOT_FOUND: "Drom identifiers are not configured yet for this make or model.",
      INSUFFICIENT_DATA: "There are not enough suitable Drom listings for a reliable appraisal.",
      AUTH_ERROR: "Drom rejected authorization. Check authorized API access and integration parameters.",
      PROVIDER_ERROR: "The Drom market service is temporarily unavailable. The customs calculation remains available.",
      AVAILABLE: "Market appraisal is available.",
    },
  },
  ka: {
    medianPrice: "მედიანური ფასი",
    mileageFiltered: "Deal Score იყენებს მსგავსი გარბენის მქონე Drom-ის განცხადებების მედიანას, უკიდურესი ფასების გამორიცხვის შემდეგ.",
    medianReference: "Deal Score იყენებს იმავე წლის Drom-ის განცხადებების მედიანას, უკიდურესი ფასების გამორიცხვის შემდეგ.",
    referenceSource: "Drom",
    status: {
      NOT_CONFIGURED: "Drom-თან ავტომატური შედარება მომზადებულია, მაგრამ სერვერზე ავტორიზებული API-წვდომა ჯერ არ არის დადასტურებული.",
      MISSING_VEHICLE_DATA: "ავტომატური შედარებისთვის საჭიროა ავტომობილის მარკა და მოდელი.",
      VEHICLE_NOT_FOUND: "ამ მარკის ან მოდელისთვის Drom-ის იდენტიფიკატორები ჯერ არ არის გამართული.",
      INSUFFICIENT_DATA: "საიმედო შეფასებისთვის Drom-ზე საკმარისი შესაბამისი განცხადება ვერ მოიძებნა.",
      AUTH_ERROR: "Drom-მა ავტორიზაცია უარყო. შეამოწმეთ ავტორიზებული API-წვდომა და ინტეგრაციის პარამეტრები.",
      PROVIDER_ERROR: "Drom-ის საბაზრო შეფასების სერვისი დროებით მიუწვდომელია. საბაჟო გამოთვლა კვლავ ხელმისაწვდომია.",
      AVAILABLE: "საბაზრო შეფასება ხელმისაწვდომია.",
    },
  },
} as const;

function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtNumber(n: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits }).format(n);
}

function fmtKm(n: number) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n)} km`;
}

interface Props {
  result: CalculatorResult;
  vehicle?: DealVehicleSnapshot | null;
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
  const locale = useLocale();
  const drom = dromCopy[locale as keyof typeof dromCopy] ?? dromCopy.en;
  const deal = result.deal_assessment;
  const market = result.market_comparison;
  const isDrom = market?.source === "drom.ru";
  const hasSavings = result.savings_vs_rf_rub != null;
  const isProfit = hasSavings && result.savings_vs_rf_rub! > 0;
  const isAggregate = result.customs_payment_kind === "AGGREGATE_PAYMENT";
  const vehicleLabel = vehicle?.make || vehicle?.model
    ? [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ")
    : t("ctaGenericVehicle");
  const leadMessage = t("ctaMessage", {
    vehicle: vehicleLabel,
    total: fmt(result.total_cost_rub),
    score: deal?.score ?? "—",
    sourceUrl: vehicle?.source_url ?? "—",
  }) + (vehicle?.vin ? ` VIN: ${vehicle.vin}.` : "");
  const contactUrl = buildContactUrl(leadMessage);
  const powerBasisLabel = result.power_basis === "MAX_30_MINUTE_ELECTRIC_POWER_KW"
    ? t("powerBasis30Minute")
    : t("powerBasisHorsepower");
  const powerKw = result.power_kw_used ?? null;
  const excisePowerHp = isAggregate && powerKw != null ? powerKw * METRIC_HP_PER_KW : null;
  const vatBaseRub = result.car_price_rub + result.import_duty_rub + result.excise_rub;
  const vatRatePercent = isAggregate && result.vat_rub > 0 && vatBaseRub > 0
    ? (result.vat_rub / vatBaseRub) * 100
    : null;

  const marketStatusText = (status: MarketComparisonStatus) => (
    isDrom ? drom.status[status] : t(`marketStatus.${status}`)
  );

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
            <Row
              label={excisePowerHp != null && powerKw != null
                ? t("exciseWithPower", { hp: fmtNumber(excisePowerHp), kw: fmtNumber(powerKw) })
                : t("excise")}
              value={fmt(result.excise_rub)}
            />
            <Row
              label={vatRatePercent != null
                ? t("vatWithRate", { rate: fmtNumber(vatRatePercent) })
                : t("vat")}
              value={fmt(result.vat_rub)}
            />
            <Row label={t("aggregatePayment")} value={fmt(result.customs_duty_rub)} bold />
          </>
        ) : (
          <Row label={t("customsDuty")} value={fmt(result.customs_duty_rub)} />
        )}

        <Row label={t("recyclingFee")} value={fmt(result.recycling_fee_rub)} />
        {powerKw != null && result.power_basis && (
          <Row
            label={t("powerUsed")}
            value={`${fmtNumber(powerKw)} kW · ${powerBasisLabel}`}
          />
        )}
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
                  {market.median_price_rub != null && <Row label={isDrom ? drom.medianPrice : t("marketMidpointPrice")} value={fmt(market.median_price_rub)} />}
                  {market.average_price_rub != null && <Row label={t("marketAveragePrice")} value={fmt(market.average_price_rub)} />}
                  {market.market_midpoint_rub != null && <Row label={t("marketMidpointPrice")} value={fmt(market.market_midpoint_rub)} />}
                  {market.max_price_rub != null && <Row label={t("marketMaxPrice")} value={fmt(market.max_price_rub)} />}
                </div>

                {market.reference_kind === "MEDIAN_LISTING_PRICE" ? (
                  <p className="text-xs text-muted-foreground">
                    {market.is_mileage_adjusted ? drom.mileageFiltered : drom.medianReference}
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {market.is_mileage_adjusted ? t("marketMileageAdjusted") : t("marketMileageNotAdjusted")}
                    </p>
                    {market.median_price_rub == null && (
                      <p className="text-xs text-muted-foreground">{t("marketMedianUnavailable")}</p>
                    )}
                  </>
                )}

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
                <span>{marketStatusText(market.status)}</span>
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
                  value={
                    result.deal_reference_source === "MANUAL"
                      ? t("dealReferenceManual")
                      : result.deal_reference_source === "DROM"
                        ? drom.referenceSource
                        : t("dealReferenceAuto")
                  }
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

        <div className="mt-6 rounded-2xl border-2 border-primary/30 bg-primary/10 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary p-2 text-primary-foreground">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="text-lg font-bold tracking-tight">{t("ctaTitle")}</div>
              <p className="mt-2 text-sm font-medium text-foreground/80">{t("ctaDescription")}</p>
              <a
                href={contactUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md sm:w-auto"
              >
                <MessageCircle className="h-5 w-5" />
                {t("ctaButton")}
              </a>
            </div>
          </div>
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
          <div>{t("manufactureDateUsed")}: {formatManufactureMonth(result.manufacture_date_used)}</div>
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
