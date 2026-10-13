"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link2, X } from "lucide-react";
import { api } from "@/lib/api";
import type { CalculatorRequest, CalculatorResult, CarListing, PowertrainKind } from "@/lib/types";
import { CalculatorResults } from "./CalculatorResults";
import { CurrencyRatesWidget } from "./CurrencyRatesWidget";

const currentYear = new Date().getFullYear();

export function Calculator() {
  const t = useTranslations("calculator");
  const tErr = useTranslations("errors");
  const [carUrl, setCarUrl] = useState("");
  const [loadedCar, setLoadedCar] = useState<CarListing | null>(null);
  const lastPayloadRef = useRef<CalculatorRequest | null>(null);

  const schema = z.object({
    car_price_usd: z.coerce.number().positive(tErr("required")),
    engine_volume_cc: z.coerce.number().int().min(0),
    car_year: z.coerce.number().int().min(1990).max(currentYear),
    manufacture_date: z.preprocess(
      (value) => value === "" || value == null ? null : String(value),
      z.string().nullable().optional(),
    ),
    horse_power: z.coerce.number().positive(tErr("required")),
    powertrain_kind: z.enum(["ICE", "OTHER_HYBRID", "EV", "SERIES_HYBRID"]),
    logistics_cost_rub: z.coerce.number().min(0),
    rf_analog_price_rub: z.preprocess(
      (value) => value === "" || value == null ? null : Number(value),
      z.number().nullable().optional(),
    ),
    note: z.preprocess(
      (value) => value === "" ? null : value,
      z.string().nullable().optional(),
    ),
  }).superRefine((data, ctx) => {
    if (data.powertrain_kind !== "EV" && data.engine_volume_cc <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["engine_volume_cc"], message: tErr("required") });
    }
    if (data.manufacture_date) {
      const parsed = new Date(`${data.manufacture_date}T00:00:00`);
      if (Number.isNaN(parsed.getTime()) || parsed.getFullYear() !== data.car_year) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["manufacture_date"], message: t("manufactureDateYearError") });
      }
    }
  });

  type FormData = z.infer<typeof schema>;
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { logistics_cost_rub: 170000, powertrain_kind: "ICE", manufacture_date: null },
  });

  const powertrainKind = watch("powertrain_kind");

  const urlMutation = useMutation({
    mutationFn: (url: string) => api.post<CarListing>("/cars/from-url", { url }).then((r) => r.data),
    onSuccess: (car) => {
      setLoadedCar(car);
      setValue("car_price_usd", car.price_usd);
      setValue("engine_volume_cc", car.powertrain_kind === "EV" ? 0 : car.engine_volume_cc);
      setValue("car_year", car.year);
      setValue("manufacture_date", null);
      if (car.horse_power) setValue("horse_power", car.horse_power);
      setValue("powertrain_kind", car.powertrain_kind ?? "ICE");
      toast.success(`${car.make} ${car.model} ${car.year} — данные загружены`);
    },
    onError: () => toast.error("Не удалось загрузить авто. Проверьте ссылку."),
  });

  const calcMutation = useMutation({
    mutationFn: (data: CalculatorRequest) => api.post<CalculatorResult>("/calculator/total", data).then((r) => r.data),
    onError: () => toast.error(tErr("generic")),
  });

  const saveMutation = useMutation({
    mutationFn: (data: CalculatorRequest) => api.post("/history/", data),
    onSuccess: () => toast.success("Расчёт сохранён"),
    onError: () => toast.error(tErr("generic")),
  });

  function onSubmit(data: FormData) {
    const payload: CalculatorRequest = {
      ...data,
      manufacture_date: data.manufacture_date ?? null,
      engine_volume_cc: data.powertrain_kind === "EV" ? 0 : data.engine_volume_cc,
      powertrain_kind: data.powertrain_kind as PowertrainKind,
      is_personal_use: true,
      source_make: loadedCar?.make ?? null,
      source_model: loadedCar?.model ?? null,
      source_model_id: loadedCar?.model_id ?? null,
      rf_analog_price_rub: data.rf_analog_price_rub ?? null,
      note: data.note ?? null,
    };
    lastPayloadRef.current = payload;
    calcMutation.mutate(payload);
  }

  return (
    <div className="space-y-6">
      <CurrencyRatesWidget />
      <Card>
        <CardHeader><CardTitle>{t("title")}</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-5 space-y-2">
            <Label className="flex items-center gap-1"><Link2 className="h-4 w-4" /> {t("urlLabel")}</Label>
            <div className="flex gap-2">
              <Input placeholder={t("urlPlaceholder")} value={carUrl} onChange={(e) => setCarUrl(e.target.value)} className="flex-1" />
              <Button type="button" variant="secondary" disabled={!carUrl || urlMutation.isPending} onClick={() => urlMutation.mutate(carUrl)}>
                {urlMutation.isPending ? "..." : t("urlLoad")}
              </Button>
            </div>
            {loadedCar && (
              <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-md text-sm">
                <span className="text-green-800 font-medium">{loadedCar.make} {loadedCar.model} {loadedCar.year}</span>
                <Badge variant="outline">${loadedCar.price_usd.toLocaleString()}</Badge>
                {loadedCar.horse_power && <Badge variant="outline">{loadedCar.horse_power} hp</Badge>}
                <a href={loadedCar.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs ml-auto">myauto.ge ↗</a>
                <button type="button" onClick={() => { setLoadedCar(null); setCarUrl(""); }}><X className="h-4 w-4 text-gray-400 hover:text-gray-700" /></button>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>{t("carPriceUsd")}</Label><Input type="number" step="0.01" {...register("car_price_usd")} />{errors.car_price_usd && <p className="text-sm text-red-500">{errors.car_price_usd.message}</p>}</div>
            <div><Label>{t("engineVolume")}</Label><Input type="number" disabled={powertrainKind === "EV"} {...register("engine_volume_cc")} />{errors.engine_volume_cc && <p className="text-sm text-red-500">{errors.engine_volume_cc.message}</p>}</div>
            <div><Label>{t("carYear")}</Label><Input type="number" min={1990} max={currentYear} {...register("car_year")} />{errors.car_year && <p className="text-sm text-red-500">{errors.car_year.message}</p>}</div>
            <div>
              <Label>{t("manufactureDate")}</Label>
              <Input type="date" {...register("manufacture_date")} />
              <p className="text-xs text-muted-foreground mt-1">{t("manufactureDateHint")}</p>
              {errors.manufacture_date && <p className="text-sm text-red-500">{errors.manufacture_date.message}</p>}
            </div>
            <div><Label>{t("horsePower")}</Label><Input type="number" step="0.01" {...register("horse_power")} />{errors.horse_power && <p className="text-sm text-red-500">{errors.horse_power.message}</p>}</div>
            <div>
              <Label>{t("powertrainKind")}</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" {...register("powertrain_kind")}>
                <option value="ICE">{t("powertrain.ice")}</option>
                <option value="OTHER_HYBRID">{t("powertrain.hybrid")}</option>
                <option value="SERIES_HYBRID">{t("powertrain.seriesHybrid")}</option>
                <option value="EV">{t("powertrain.ev")}</option>
              </select>
            </div>
            <div><Label>{t("logisticsCost")}</Label><Input type="number" step="1000" {...register("logistics_cost_rub")} /></div>
            <div><Label>{t("rfAnalogPrice")}</Label><Input type="number" step="1000" {...register("rf_analog_price_rub")} /></div>
            <div><Label>{t("note")}</Label><Input {...register("note")} /></div>
            <div className="md:col-span-2 flex gap-3">
              <Button type="submit" disabled={calcMutation.isPending}>{calcMutation.isPending ? "..." : t("calculate")}</Button>
              {calcMutation.data && (
                <Button type="button" variant="outline" onClick={() => lastPayloadRef.current && saveMutation.mutate(lastPayloadRef.current)} disabled={saveMutation.isPending}>{t("saveToHistory")}</Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
      {calcMutation.data && <CalculatorResults result={calcMutation.data} />}
    </div>
  );
}
