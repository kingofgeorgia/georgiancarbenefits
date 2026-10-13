"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { CalculatorResult } from "@/lib/types";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);
}

interface Props {
  result: CalculatorResult;
}

export function CalculatorResults({ result }: Props) {
  const t = useTranslations("calculator.results");
  const hasSavings = result.savings_vs_rf_rub != null;
  const isProfit = hasSavings && result.savings_vs_rf_rub! > 0;
  const isAggregate = result.customs_payment_kind === "AGGREGATE_PAYMENT";

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
        <Row label={t("customsTotal")} value={fmt(result.customs_total_rub)} bold />
        <Row label={t("logistics")} value={fmt(result.logistics_cost_rub)} />
        <Separator />
        <Row label={t("total")} value={fmt(result.total_cost_rub)} bold />

        {hasSavings && (
          <div
            className={`flex items-center gap-2 mt-3 p-3 rounded-lg font-semibold ${
              isProfit ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {isProfit ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
            <span>
              {isProfit ? t("savings") : t("overpay")}: {fmt(Math.abs(result.savings_vs_rf_rub!))}
            </span>
            <Badge variant={isProfit ? "default" : "destructive"}>
              {isProfit ? t("profitable") : t("notProfitable")}
            </Badge>
          </div>
        )}

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
    <div className={`flex justify-between ${bold ? "font-semibold text-base" : "text-sm"}`}>
      <span className="text-gray-600">{label}</span>
      <span>{value}</span>
    </div>
  );
}
