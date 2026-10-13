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
import { AlertTriangle, Link2, ScanLine, X } from "lucide-react";
import { api } from "@/lib/api";
import type { CalculatorRequest, CalculatorResult, CarListing, PowertrainKind, VinDecodeResult } from "@/lib/types";
import { CalculatorResults } from "./CalculatorResults";
import { CurrencyRatesWidget } from "./CurrencyRatesWidget";
import { ShareDealButton } from "./ShareDealButton";

const currentYear = new Date().getFullYear();

export function Calculator() {
  const t = useTranslations("calculator");
  const tErr = useTranslations("errors");
  const [carUrl, setCarUrl] = useState("");
  const [vin, setVin] = useState("");
  const [loadedCar, setLoadedCar] = useState<CarListing | null>(null);
  const [decodedVin, setDecodedVin] = useState<VinDecodeResult | null>(null);
  const lastPayloadRef = useRef<CalculatorRequest | null>(null);

  const schema = z.object({
    car_price_usd: z.coerce.number().positive(tErr("required")),
    engine_volume_cc: z.coerce.number().int().min(0),
    car_year: z.coerce.number().int().min(1990).max(currentYear),
    manufacture_date: z.preprocess((value) => value === "" || value == null ? null : String(value), z.string().nullable().optional()),
    horse_power: z.coerce.number().positive(tErr("required")),
    mileage_km: z.preprocess((value) => value === "" || value == null ? null : Number(value), z.number().int().min(0).nullable().optional()),
    powertrain_kind: z.enum(["ICE", "OTHER_HYBRID", "EV", "SERIES_HYBRID"]),
    logistics_cost_rub: z.coerce.number().min(0),
    rf_analog_price_rub: z.preprocess((value) => value === "" || value == null ? null : Number(value), z.number().positive().nullable().optional()),
    auto_market_comparison: z.boolean(),
    note: z.preprocess((value) => value === "" ? null : value, z.string().nullable().optional()),
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
    defaultValues: { logistics_cost_rub: 170000, powertrain_kind: "ICE", manufacture_date: null, mileage_km: null, auto_market_comparison: true },
  });

  const powertrainKind = watch("powertrain_kind");
  const autoMarketComparison = watch("auto_market_comparison");

  const urlMutation = useMutation({
    mutationFn: (url: string) => api.post<CarListing>("/cars/from-url", { url }).then((r) => r.data),
    onSuccess: (car) => {
      setLoadedCar(car);
      setValue("car_price_usd", car.price_usd);
      setValue("engine_volume_cc", car.powertrain_kind === "EV" ? 0 : car.engine_volume_cc);
      setValue("car_year", car.year);
      setValue("manufacture_date", null);
      setValue("mileage_km", car.mileage_km ?? null);
      if (car.horse_power) setValue("horse_power", car.horse_power);
      setValue("powertrain_kind", car.powertrain_kind ?? "ICE");
      toast.success(t("urlLoaded", { make: car.make, model: car.model, year: car.year }));
    },
    onError: () => toast.error(t("urlLoadError")),
  });

  const vinMutation = useMutation({
    mutationFn: (value: string) => api.post<VinDecodeResult>("/cars/from-vin", { vin: value }).then((r) => r.data),
    onSuccess: (vehicle) => {
      if (vehicle.status === "NOT_FOUND" || vehicle.status === "PROVIDER_ERROR") {
        setDecodedVin(null);
        toast.error(vehicle.error_text ?? t("vinDecodeError"));
        return;
      }

      setDecodedVin(vehicle);
      if (vehicle.model_year) setValue("car_year", vehicle.model_year);
      if (vehicle.displacement_cc != null) setValue("engine_volume_cc", vehicle.displacement_cc);
      if (vehicle.horse_power != null) setValue("horse_power", vehicle.horse_power);
      if (vehicle.powertrain_kind) {
        setValue("powertrain_kind", vehicle.powertrain_kind);
        if (vehicle.powertrain_kind === "EV") setValue("engine_volume_cc", 0);
      }

      if (vehicle.status === "PARTIAL") {
        toast.warning(t("vinPartial"));
      } else {
        toast.success(t("vinLoaded", { vehicle: [vehicle.make, vehicle.model, vehicle.model_year].filter(Boolean).join(" ") }));
      }
    },
    onError: () => toast.error(t("vinDecodeError")),
  });

  const calcMutation = useMutation({
    mutationFn: (data: CalculatorRequest) => api.post<CalculatorResult>("/calculator/total", data).then((r) => r.data),
    onError: () => toast.error(tErr("generic")),
  });

  const saveMutation = useMutation({
    mutationFn: (data: CalculatorRequest) => api.post("/history/", data),
    onSuccess: () => toast.success(t("saved")),
    onError: () => toast.error(tErr("generic")),
  });

  function onSubmit(data: FormData) {
    const payload: CalculatorRequest = {
      ...data,
      manufacture_date: data.manufacture_date ?? null,
      mileage_km: data.mileage_km ?? null,
      engine_volume_cc: data.powertrain_kind === "EV" ? 0 : data.engine_volume_cc,
      powertrain_kind: data.powertrain_kind as PowertrainKind,
      is_personal_use: true,
      source_make: loadedCar?.make ?? decodedVin?.make ?? null,
      source_model: loadedCar?.model ?? decodedVin?.model ?? null,
      source_model_id: loadedCar?.model_id ?? null,
      rf_analog_price_rub: data.rf_analog_price_rub ?? null,
      auto_market_comparison: data.auto_market_comparison,
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
          <div className="mb-5 space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><Link2 className="h-4 w-4" /> {t("urlLabel")}</Label>
              <div className="flex gap-2">
                <Input placeholder={t("urlPlaceholder")} value={carUrl} onChange={(e) => setCarUrl(e.target.value)} className="flex-1" />
                <Button type="button" variant="secondary" disabled={!carUrl || urlMutation.isPending} onClick={() => urlMutation.mutate(carUrl)}>{urlMutation.isPending ? "..." : t("urlLoad")}</Button>
              </div>
              {loadedCar && (
                <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-md text-sm">
                  <span className="text-green-800 font-medium">{loadedCar.make} {loadedCar.model} {loadedCar.year}</span>
                  <Badge variant="outline">${loadedCar.price_usd.toLocaleString()}</Badge>
                  {loadedCar.horse_power && <Badge variant="outline">{loadedCar.horse_power} hp</Badge>}
                  {loadedCar.mileage_km != null && <Badge variant="outline">{loadedCar.mileage_km.toLocaleString()} km</Badge>}
                  <a href={loadedCar.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs ml-auto">myauto.ge ↗</a>
                  <button type="button" onClick={() => { setLoadedCar(null); setCarUrl(""); }}><X className="h-4 w-4 text-gray-400 hover:text-gray-700" /></button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1"><ScanLine className="h-4 w-4" /> {t("vinLabel")}</Label>
              <div className="flex gap-2">
                <Input maxLength={17} placeholder={t("vinPlaceholder")} value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} className="flex-1 font-mono" />
                <Button type="button" variant="secondary" disabled={vin.length !== 17 || vinMutation.isPending} onClick={() => vinMutation.mutate(vin)}>{vinMutation.isPending ? "..." : t("vinLoad")}</Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("vinHint")}</p>
              {decodedVin && (
                <div className={`space-y-2 rounded-md border p-2 text-sm ${decodedVin.status === "PARTIAL" ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{decodedVin.make} {decodedVin.model} {decodedVin.model_year}</span>
                    {decodedVin.trim && <Badge variant="outline">{decodedVin.trim}</Badge>}
                    {decodedVin.series && <Badge variant="outline">{decodedVin.series}</Badge>}
                    {decodedVin.displacement_l != null && decodedVin.powertrain_kind !== "EV" && <Badge variant="outline">{decodedVin.displacement_l.toFixed(1)} L</Badge>}
                    {decodedVin.horse_power != null && <Badge variant="outline">{Math.round(decodedVin.horse_power)} hp</Badge>}
                    {decodedVin.fuel_type && <Badge variant="outline">{decodedVin.fuel_type}</Badge>}
                    <span className="text-xs text-muted-foreground ml-auto">{decodedVin.source}</span>
                    <button type="button" onClick={() => { setDecodedVin(null); setVin(""); }}><X className="h-4 w-4 text-gray-400 hover:text-gray-700" /></button>
                  </div>
                  {decodedVin.status === "PARTIAL" && (
                    <div className="flex gap-2 text-xs text-amber-900">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>{t("vinPartialHint")}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>{t("carPriceUsd")}</Label><Input type="number" step="0.01" {...register("car_price_usd")} />{errors.car_price_usd && <p className="text-sm text-red-500">{errors.car_price_usd.message}</p>}</div>
            <div><Label>{t("engineVolume")}</Label><Input type="number" disabled={powertrainKind === "EV"} {...register("engine_volume_cc")} />{errors.engine_volume_cc && <p className="text-sm text-red-500">{errors.engine_volume_cc.message}</p>}</div>
            <div><Label>{t("carYear")}</Label><Input type="number" min={1990} max={currentYear} {...register("car_year")} />{errors.car_year && <p className="text-sm text-red-500">{errors.car_year.message}</p>}</div>
            <div><Label>{t("manufactureDate")}</Label><Input type="date" {...register("manufacture_date")} /><p className="text-xs text-muted-foreground mt-1">{t("manufactureDateHint")}</p>{errors.manufacture_date && <p className="text-sm text-red-500">{errors.manufacture_date.message}</p>}</div>
            <div><Label>{t("horsePower")}</Label><Input type="number" step="0.01" {...register("horse_power")} />{errors.horse_power && <p className="text-sm text-red-500">{errors.horse_power.message}</p>}</div>
            <div><Label>{t("mileage")}</Label><Input type="number" step="1000" {...register("mileage_km")} /><p className="text-xs text-muted-foreground mt-1">{t("mileageHint")}</p>{errors.mileage_km && <p className="text-sm text-red-500">{errors.mileage_km.message}</p>}</div>
            <div>
              <Label>{t("powertrainKind")}</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" {...register("powertrain_kind")}>
                <option value="ICE">{t("powertrain.ice")}</option><option value="OTHER_HYBRID">{t("powertrain.hybrid")}</option><option value="SERIES_HYBRID">{t("powertrain.seriesHybrid")}</option><option value="EV">{t("powertrain.ev")}</option>
              </select>
            </div>
            <div><Label>{t("logisticsCost")}</Label><Input type="number" step="1000" {...register("logistics_cost_rub")} /></div>
            <div className="md:col-span-2 rounded-lg border p-3 space-y-3">
              <label className="flex items-start gap-3 text-sm cursor-pointer">
                <input type="checkbox" className="mt-1 h-4 w-4" {...register("auto_market_comparison")} />
                <span><span className="font-medium">{t("autoMarketComparison")}</span><span className="block text-xs text-muted-foreground mt-1">{t("autoMarketComparisonHint")}</span></span>
              </label>
              <div><Label>{t("rfAnalogPrice")}</Label><Input type="number" step="1000" {...register("rf_analog_price_rub")} /><p className="text-xs text-muted-foreground mt-1">{autoMarketComparison ? t("rfAnalogPriceOverrideHint") : t("rfAnalogPriceHint")}</p>{errors.rf_analog_price_rub && <p className="text-sm text-red-500">{errors.rf_analog_price_rub.message}</p>}</div>
            </div>
            <div><Label>{t("note")}</Label><Input {...register("note")} /></div>
            <div className="md:col-span-2 flex gap-3">
              <Button type="submit" disabled={calcMutation.isPending}>{calcMutation.isPending ? "..." : t("calculate")}</Button>
              {calcMutation.data && <Button type="button" variant="outline" onClick={() => lastPayloadRef.current && saveMutation.mutate(lastPayloadRef.current)} disabled={saveMutation.isPending}>{t("saveToHistory")}</Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      {calcMutation.data && lastPayloadRef.current && (
        <>
          <CalculatorResults result={calcMutation.data} vehicle={loadedCar} />
          <div className="flex justify-end">
            <ShareDealButton request={lastPayloadRef.current} result={calcMutation.data} vehicle={loadedCar} vinVehicle={decodedVin} />
          </div>
        </>
      )}
    </div>
  );
}
