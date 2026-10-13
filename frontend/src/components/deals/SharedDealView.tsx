"use client";

import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Gauge, MessageCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import type { DealRating, DealShareOut } from "@/lib/types";

const pageCopy = {
  ru: { heading: "Персональный расчёт MileON", snapshot: "Расчёт зафиксирован", loading: "Загружаем расчёт...", missing: "Публичный расчёт не найден", source: "Исходное объявление", order: "Заказать этот автомобиль через MileON" },
  en: { heading: "MileON personal calculation", snapshot: "Calculation snapshot", loading: "Loading calculation...", missing: "Shared calculation not found", source: "Source listing", order: "Order this car with MileON" },
  ka: { heading: "MileON-ის პერსონალური გამოთვლა", snapshot: "გამოთვლის ფიქსირებული ვერსია", loading: "გამოთვლა იტვირთება...", missing: "საჯარო გამოთვლა ვერ მოიძებნა", source: "საწყისი განცხადება", order: "ამ ავტომობილის შეკვეთა MileON-ით" },
} as const;

const ratingClass: Record<DealRating, string> = {
  EXCELLENT: "bg-emerald-600 text-white",
  GOOD: "bg-green-600 text-white",
  FAIR: "bg-lime-600 text-white",
  WEAK: "bg-amber-500 text-white",
  BAD: "bg-red-600 text-white",
};

function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);
}

function contactUrl(message: string) {
  const base = process.env.NEXT_PUBLIC_MILEON_CONTACT_URL ?? "https://wa.me/995577115757";
  if (!base.includes("wa.me/")) return base;
  return `${base}${base.includes("?") ? "&" : "?"}text=${encodeURIComponent(message)}`;
}

export function SharedDealView({ publicId }: { publicId: string }) {
  const locale = useLocale();
  const text = pageCopy[locale as keyof typeof pageCopy] ?? pageCopy.en;
  const t = useTranslations("calculator.results");
  const query = useQuery({
    queryKey: ["shared-deal", publicId],
    queryFn: () => api.get<DealShareOut>(`/deals/${publicId}`).then((response) => response.data),
    retry: false,
  });

  if (query.isPending) return <div className="mx-auto max-w-3xl p-8 text-center text-muted-foreground">{text.loading}</div>;
  if (!query.data) return <div className="mx-auto max-w-3xl p-8 text-center text-muted-foreground">{text.missing}</div>;

  const share = query.data;
  const { request, result, vehicle } = share.snapshot;
  const deal = result.deal_assessment;
  const market = result.market_comparison;
  const title = [vehicle?.make ?? request.source_make, vehicle?.model ?? request.source_model, vehicle?.year ?? request.car_year].filter(Boolean).join(" ") || text.heading;
  const lead = `${text.order}: ${title}. ${t("total")}: ${fmt(result.total_cost_rub)}. Deal Score: ${deal?.score ?? "—"}/100. https://mileon.ge/${locale}/deal/${publicId}`;

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <div>
        <div className="text-sm font-medium text-muted-foreground">{text.heading}</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          {vehicle?.price_usd != null && <Badge variant="outline">${vehicle.price_usd.toLocaleString()}</Badge>}
          {vehicle?.mileage_km != null && <Badge variant="outline">{vehicle.mileage_km.toLocaleString()} km</Badge>}
          {vehicle?.vin && <Badge variant="outline" className="font-mono">{vehicle.vin}</Badge>}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("title")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Row label={t("carPrice")} value={fmt(result.car_price_rub)} />
          <Row label={t("customsFee")} value={fmt(result.customs_fee_rub)} />
          {result.customs_payment_kind === "AGGREGATE_PAYMENT" ? (
            <>
              <Row label={t("importDuty")} value={fmt(result.import_duty_rub)} />
              <Row label={t("excise")} value={fmt(result.excise_rub)} />
              <Row label={t("vat")} value={fmt(result.vat_rub)} />
            </>
          ) : <Row label={t("customsDuty")} value={fmt(result.customs_duty_rub)} />}
          <Row label={t("recyclingFee")} value={fmt(result.recycling_fee_rub)} />
          <Row label={t("customsTotal")} value={fmt(result.customs_total_rub)} bold />
          <Row label={t("logistics")} value={fmt(result.logistics_cost_rub)} />
          <Separator />
          <Row label={t("total")} value={fmt(result.total_cost_rub)} bold />
        </CardContent>
      </Card>

      {deal && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-semibold"><Gauge className="h-5 w-5" />{t("dealScore")}</div>
              <Badge className={ratingClass[deal.rating]}>{deal.score}/100 · {t(`dealRating.${deal.rating}`)}</Badge>
            </div>
            <Row label={t("rfReferencePrice")} value={fmt(deal.reference_price_rub)} />
            <Row label={deal.savings_rub >= 0 ? t("savings") : t("overpay")} value={`${fmt(Math.abs(deal.savings_rub))} (${Math.abs(deal.savings_percent).toFixed(1)}%)`} bold />
          </CardContent>
        </Card>
      )}

      {market?.status === "AVAILABLE" && (
        <Card>
          <CardHeader><CardTitle>{t("marketComparisonTitle")}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {market.similar_count != null && <Row label={t("marketSimilarCount")} value={String(market.similar_count)} />}
            {market.min_price_rub != null && <Row label={t("marketMinPrice")} value={fmt(market.min_price_rub)} />}
            {market.average_price_rub != null && <Row label={t("marketAveragePrice")} value={fmt(market.average_price_rub)} />}
            {market.market_midpoint_rub != null && <Row label={t("marketMidpointPrice")} value={fmt(market.market_midpoint_rub)} />}
            {market.max_price_rub != null && <Row label={t("marketMaxPrice")} value={fmt(market.max_price_rub)} />}
          </CardContent>
        </Card>
      )}

      <Card className="bg-primary/5">
        <CardContent className="space-y-3 pt-6">
          <div className="font-semibold">{t("ctaTitle")}</div>
          <p className="text-sm text-muted-foreground">{t("ctaDescription")}</p>
          <div className="flex flex-wrap gap-3">
            <a href={contactUrl(lead)} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <MessageCircle className="h-4 w-4" />{text.order}
            </a>
            {vehicle?.source_url && <a href={vehicle.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-medium"><ExternalLink className="h-4 w-4" />{text.source}</a>}
          </div>
        </CardContent>
      </Card>

      <div className="text-center text-xs text-muted-foreground">{text.snapshot}: {new Date(share.created_at).toLocaleString()} · {t("ruleVersion")}: {result.calculation_rule_version}</div>
    </main>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <div className={`flex justify-between gap-4 ${bold ? "font-semibold" : "text-sm"}`}><span className="text-muted-foreground">{label}</span><span className="text-right">{value}</span></div>;
}
