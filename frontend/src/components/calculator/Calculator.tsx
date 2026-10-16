"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocale, useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Link2, RotateCcw, ScanLine, X } from "lucide-react";
import { api, apiErrorMessage } from "@/lib/api";
import type { CalculatorRequest, CalculatorResult, CarListing, DealVehicleSnapshot, PowertrainKind, VehicleSpecification, VinDecodeResult } from "@/lib/types";
import { VehicleSpecificationPicker } from "@/components/cars/VehicleSpecificationPicker";
import { VehiclePowerReference } from "@/components/cars/VehiclePowerReference";
import { CalculatorResults } from "./CalculatorResults";
import { CurrencyRatesWidget } from "./CurrencyRatesWidget";
import { ShareDealButton } from "./ShareDealButton";

const currentYear = new Date().getFullYear();

interface CalculationSnapshot {
  request: CalculatorRequest;
  vehicle: DealVehicleSnapshot;
}

const uiCopy = {
  ru: {
    myAutoLabel: "Ссылка или ID объявления MyAuto",
    myAutoPlaceholder: "https://www.myauto.ge/.../pr/123673764 или 123673764",
    myAutoError: "Не удалось загрузить авто. Проверьте ссылку или ID объявления.",
    marketHint: "Если известны марка и модель, MileON может запросить официальную оценку похожих объявлений в РФ.",
    reset: "Сбросить расчёт",
  },
  en: {
    myAutoLabel: "MyAuto listing link or ID",
    myAutoPlaceholder: "https://www.myauto.ge/.../pr/123673764 or 123673764",
    myAutoError: "Could not load the car. Check the listing link or ID.",
    marketHint: "When make and model are known, MileON can request an official appraisal of comparable listings in Russia.",
    reset: "Reset calculation",
  },
  ka: {
    myAutoLabel: "MyAuto განცხადების ბმული ან ID",
    myAutoPlaceholder: "https://www.myauto.ge/.../pr/123673764 ან 123673764",
    myAutoError: "ავტომობილის ჩატვირთვა ვერ მოხერხდა. შეამოწმეთ განცხადების ბმული ან ID.",
    marketHint: "თუ მარკა და მოდელი ცნობილია, MileON-ს შეუძლია მოითხოვოს რუსეთში მსგავსი განცხადებების ოფიციალური შეფასება.",
    reset: "გამოთვლის გასუფთავება",
  },
} as const;

export function Calculator() {
  const t = useTranslations("calculator");
  const tErr = useTranslations("errors");
  const errorMessages = { rateLimited: tErr("rateLimited"), payloadTooLarge: tErr("payloadTooLarge"), temporarilyUnavailable: tErr("temporarilyUnavailable") };
  const locale = useLocale();
  const copy = uiCopy[locale as keyof typeof uiCopy] ?? uiCopy.en;
  const [carSource, setCarSource] = useState("");
  const [vin, setVin] = useState("");
  const [loadedCar, setLoadedCar] = useState<CarListing | null>(null);
  const [decodedVin, setDecodedVin] = useState<VinDecodeResult | null>(null);
  const [catalogSelection, setCatalogSelection] = useState<{ entry: VehicleSpecification; year: number } | null>(null);
  const [catalogResetKey, setCatalogResetKey] = useState(0);
  const [calculation, setCalculation] = useState<(CalculationSnapshot & { result: CalculatorResult }) | null>(null);

  const optionalPositiveNumber = z.preprocess(
    (value) => value === "" || value == null ? null : Number(value),
    z.number().positive(tErr("required")).nullable(),
  );

  const schema = z.object({
    car_price_usd: z.coerce.number().positive(tErr("required")),
    engine_volume_cc: z.coerce.number().int().min(0),
    car_year: z.coerce.number().int().min(1990).max(currentYear),
    manufacture_date: z.preprocess((value) => value === "" || value == null ? null : String(value), z.string().nullable().optional()),
    horse_power: optionalPositiveNumber,
    electric_power_kw: optionalPositiveNumber,
    mileage_km: z.preprocess((value) => value === "" || value == null ? null : Number(value), z.number().int().min(0).nullable().optional()),
    powertrain_kind: z.enum(["ICE", "OTHER_HYBRID", "EV", "SERIES_HYBRID"]),
    logistics_cost_rub: z.coerce.number().min(0),
    rf_analog_price_rub: z.preprocess((value) => value === "" || value == null ? null : Number(value), z.number().positive().nullable().optional()),
    auto_market_comparison: z.boolean(),
    note: z.preprocess((value) => value === "" ? null : value, z.string().nullable().optional()),
  }).superRefine((data, ctx) => {
    const usesElectricRegulatoryPower = data.powertrain_kind === "EV" || data.powertrain_kind === "SERIES_HYBRID";
    if (data.powertrain_kind !== "EV" && data.engine_volume_cc <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["engine_volume_cc"], message: tErr("required") });
    }
    if (usesElectricRegulatoryPower && data.electric_power_kw == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["electric_power_kw"], message: tErr("required") });
    }
    if (!usesElectricRegulatoryPower && data.horse_power == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["horse_power"], message: tErr("required") });
    }
    if (data.manufacture_date) {
      const parsed = new Date(`${data.manufacture_date}-01T00:00:00`);
      if (Number.isNaN(parsed.getTime()) || parsed.getFullYear() !== data.car_year) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["manufacture_date"], message: t("manufactureDateYearError") });
      }
    }
  });

  type FormData = z.infer<typeof schema>;
  const { register, handleSubmit, formState: { errors }, reset, setValue, getValues, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      logistics_cost_rub: 170000,
      powertrain_kind: "ICE",
      manufacture_date: null,
      horse_power: null,
      electric_power_kw: null,
      mileage_km: null,
      rf_analog_price_rub: null,
      auto_market_comparison: false,
      note: null,
    },
  });

  const powertrainKind = watch("powertrain_kind");
  const autoMarketComparison = watch("auto_market_comparison");
  const usesElectricRegulatoryPower = powertrainKind === "EV" || powertrainKind === "SERIES_HYBRID";
  const reference = catalogSelection?.entry;
  const appliedReference = reference && Number(watch("car_year")) === catalogSelection?.year
    && powertrainKind === reference.powertrain_kind
    && (reference.powertrain_kind !== "ICE" || Number(watch("horse_power")) === reference.horse_power)
    && (reference.engine_cc === null
      ? !Number(watch("engine_volume_cc")) || Math.abs(Number(watch("engine_volume_cc")) / 1000 - reference.engine_liters) <= 0.1
      : Number(watch("engine_volume_cc")) === reference.engine_cc)
    ? reference : null;

  const urlMutation = useMutation({
    mutationFn: (source: string) => api.post<CarListing>("/cars/from-url", { url: source }).then((r) => r.data),
    onSuccess: (car) => {
      setCalculation(null);
      setDecodedVin(null);
      setVin("");
      setLoadedCar(car);
      setCatalogSelection(car.power_reference ? { entry: car.power_reference, year: car.year } : null);
      setValue("car_price_usd", car.price_usd);
      setValue("engine_volume_cc", car.powertrain_kind === "EV" ? 0 : car.engine_volume_cc);
      setValue("car_year", car.year);
      setValue("manufacture_date", null);
      setValue("mileage_km", car.mileage_km ?? null);
      setValue("horse_power", car.powertrain_kind === "EV" || car.powertrain_kind === "SERIES_HYBRID" ? null : car.horse_power ?? null);
      setValue("electric_power_kw", car.electric_power_kw ?? null);
      setValue("powertrain_kind", car.powertrain_kind ?? "ICE");
      toast.success(t("urlLoaded", { make: car.make, model: car.model, year: car.year }));
    },
    onError: (error) => toast.error(apiErrorMessage(error, copy.myAutoError, errorMessages)),
  });

  const vinMutation = useMutation({
    mutationFn: (value: string) => api.post<VinDecodeResult>("/cars/from-vin", { vin: value }).then((r) => r.data),
    onSuccess: (vehicle) => {
      if (vehicle.status === "NOT_FOUND" || vehicle.status === "PROVIDER_ERROR") {
        setDecodedVin(null);
        toast.error(vehicle.error_text ?? t("vinDecodeError"));
        return;
      }

      setCalculation(null);
      const identity = (value: string | null | undefined) => (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const matchesListing = loadedCar && identity(loadedCar.make) === identity(vehicle.make)
        && identity(loadedCar.model) === identity(vehicle.model) && loadedCar.year === vehicle.model_year;
      if (loadedCar && !matchesListing) {
        setLoadedCar(null);
        setCarSource("");
        setValue("car_price_usd", 0);
        setValue("mileage_km", null);
      }
      setDecodedVin(vehicle);
      setCatalogSelection(vehicle.power_reference && vehicle.model_year ? { entry: vehicle.power_reference, year: vehicle.model_year } : null);
      setVin(vehicle.vin);
      setValue("car_year", vehicle.model_year ?? 0);
      setValue("manufacture_date", null);
      setValue("engine_volume_cc", vehicle.powertrain_kind === "EV" ? 0 : vehicle.displacement_cc ?? 0);
      setValue("powertrain_kind", vehicle.powertrain_kind ?? "ICE");
      if (vehicle.powertrain_kind === "EV" || vehicle.powertrain_kind === "SERIES_HYBRID") {
        setValue("horse_power", null);
        setValue("electric_power_kw", vehicle.electric_power_kw ?? null);
      } else {
        setValue("horse_power", vehicle.horse_power ?? null);
        setValue("electric_power_kw", null);
      }

      if (vehicle.status === "PARTIAL") {
        toast.warning(vehicle.powertrain_kind === "EV" || vehicle.powertrain_kind === "SERIES_HYBRID" ? t("electricPowerHint") : t("vinHint"));
      } else {
        toast.success(t("vinLoaded", { vehicle: [vehicle.make, vehicle.model, vehicle.model_year].filter(Boolean).join(" ") }));
      }
    },
    onError: (error) => toast.error(apiErrorMessage(error, t("vinDecodeError"), errorMessages)),
  });

  const calcMutation = useMutation({
    mutationFn: (snapshot: CalculationSnapshot) => api.post<CalculatorResult>("/calculator/total", snapshot.request).then((r) => r.data),
    onMutate: () => setCalculation(null),
    onSuccess: (result, snapshot) => setCalculation({ ...snapshot, result }),
    onError: (error) => toast.error(apiErrorMessage(error, tErr("generic"), errorMessages)),
  });

  const saveMutation = useMutation({
    mutationFn: (data: CalculatorRequest) => api.post("/history/", data),
    onSuccess: () => toast.success(t("saved")),
    onError: (error) => toast.error(apiErrorMessage(error, tErr("generic"), errorMessages)),
  });

  function resetCalculator() {
    setCarSource("");
    setVin("");
    setLoadedCar(null);
    setDecodedVin(null);
    setCatalogSelection(null);
    setCatalogResetKey((value) => value + 1);
    setCalculation(null);
    reset();
    urlMutation.reset();
    vinMutation.reset();
    calcMutation.reset();
    saveMutation.reset();
  }

  function applySpecification(entry: VehicleSpecification, year: number) {
    const identity = (value: string | null | undefined) => (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const source = loadedCar ? { make: loadedCar.make, model: loadedCar.model, year: loadedCar.year, kind: loadedCar.powertrain_kind, engine: loadedCar.engine_volume_cc } : decodedVin ? { make: decodedVin.make, model: decodedVin.model, year: decodedVin.model_year, kind: decodedVin.powertrain_kind, engine: decodedVin.displacement_cc } : catalogSelection ? { make: catalogSelection.entry.make, model: catalogSelection.entry.model, year: catalogSelection.year, kind: catalogSelection.entry.powertrain_kind, engine: Number(getValues("engine_volume_cc")) || null } : null;
    const sameVehicle = source && identity(source.make) === identity(entry.make) && identity(source.model) === identity(entry.model) && source.year === year
      && source.kind === entry.powertrain_kind && source.engine != null && Math.abs(source.engine / 1000 - entry.engine_liters) <= 0.1;
    if (source && !sameVehicle) {
      setLoadedCar(null); setDecodedVin(null); setCarSource(""); setVin("");
      setValue("car_price_usd", 0); setValue("mileage_km", null);
    }
    const currentEngine = Number(getValues("engine_volume_cc")) || 0;
    const compatibleEngine = (!source || sameVehicle) && Math.abs(currentEngine / 1000 - entry.engine_liters) <= 0.1;
    setValue("engine_volume_cc", entry.engine_cc ?? (compatibleEngine ? currentEngine : 0));
    setValue("car_year", year);
    setValue("manufacture_date", null);
    setValue("powertrain_kind", entry.powertrain_kind);
    setValue("horse_power", entry.powertrain_kind === "ICE" ? entry.horse_power : null);
    setValue("electric_power_kw", null);
    setCatalogSelection({ entry, year });
    setCalculation(null);
  }

  function onSubmit(data: FormData) {
    const electricRegulatoryPower = data.powertrain_kind === "EV" || data.powertrain_kind === "SERIES_HYBRID";
    const payload: CalculatorRequest = {
      ...data,
      manufacture_date: data.manufacture_date ? `${data.manufacture_date}-01` : null,
      horse_power: electricRegulatoryPower ? null : data.horse_power ?? null,
      electric_power_kw: electricRegulatoryPower ? data.electric_power_kw ?? null : null,
      mileage_km: data.mileage_km ?? null,
      engine_volume_cc: data.powertrain_kind === "EV" ? 0 : data.engine_volume_cc,
      powertrain_kind: data.powertrain_kind as PowertrainKind,
      is_personal_use: true,
      source_make: catalogSelection?.entry.make ?? loadedCar?.make ?? decodedVin?.make ?? null,
      source_model: catalogSelection?.entry.model ?? loadedCar?.model ?? decodedVin?.model ?? null,
      source_model_id: loadedCar?.model_id ?? null,
      rf_analog_price_rub: data.auto_market_comparison ? data.rf_analog_price_rub ?? null : null,
      auto_market_comparison: data.auto_market_comparison,
      note: data.note ?? null,
    };
    calcMutation.mutate({
      request: payload,
      vehicle: {
        make: payload.source_make,
        model: payload.source_model,
        year: payload.car_year,
        mileage_km: payload.mileage_km,
        price_usd: payload.car_price_usd,
        image_url: loadedCar?.image_url ?? null,
        source_url: loadedCar?.url ?? null,
        vin: decodedVin?.vin ?? null,
      },
    });
  }

  const resetDisabled = urlMutation.isPending || vinMutation.isPending || calcMutation.isPending || saveMutation.isPending;

  return (
    <div className="space-y-6">
      <CurrencyRatesWidget />
      <Card>
        <CardHeader><CardTitle>{t("title")}</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-5 space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><Link2 className="h-4 w-4" /> {copy.myAutoLabel}</Label>
              <div className="flex gap-2">
                <Input
                  placeholder={copy.myAutoPlaceholder}
                  value={carSource}
                  maxLength={2048}
                  onChange={(e) => setCarSource(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!carSource.trim() || urlMutation.isPending || vinMutation.isPending || calcMutation.isPending}
                  onClick={() => urlMutation.mutate(carSource.trim())}
                >
                  {urlMutation.isPending ? "..." : t("urlLoad")}
                </Button>
              </div>
              {loadedCar && (
                <div className="flex flex-wrap items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-md text-sm">
                  <span className="text-green-800 font-medium">{loadedCar.make} {loadedCar.model} {loadedCar.year}</span>
                  <Badge variant="outline">${loadedCar.price_usd.toLocaleString()}</Badge>
                  {!catalogSelection && loadedCar.horse_power && (
                    <Badge variant="outline">
                      {loadedCar.horse_power} hp{loadedCar.powertrain_kind === "EV" ? ` · ${t("referenceOnly")}` : ""}
                    </Badge>
                  )}
                  {loadedCar.mileage_km != null && <Badge variant="outline">{loadedCar.mileage_km.toLocaleString()} km</Badge>}
                  <a href={loadedCar.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs ml-auto">myauto.ge ↗</a>
                  <button type="button" onClick={() => { setLoadedCar(null); setCarSource(""); }}><X className="h-4 w-4 text-gray-400 hover:text-gray-700" /></button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1"><ScanLine className="h-4 w-4" /> {t("vinLabel")}</Label>
              <div className="flex gap-2">
                <Input maxLength={17} placeholder={t("vinPlaceholder")} value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} className="flex-1 font-mono" />
                <Button type="button" variant="secondary" disabled={vin.length !== 17 || vinMutation.isPending || urlMutation.isPending || calcMutation.isPending} onClick={() => vinMutation.mutate(vin)}>{vinMutation.isPending ? "..." : t("vinLoad")}</Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("vinHint")}</p>
              {decodedVin && (
                <div className={`space-y-2 rounded-md border p-2 text-sm ${decodedVin.status === "PARTIAL" ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{decodedVin.make} {decodedVin.model} {decodedVin.model_year}</span>
                    {decodedVin.trim && <Badge variant="outline">{decodedVin.trim}</Badge>}
                    {decodedVin.series && <Badge variant="outline">{decodedVin.series}</Badge>}
                    {decodedVin.displacement_l != null && decodedVin.powertrain_kind !== "EV" && <Badge variant="outline">{decodedVin.displacement_l.toFixed(1)} L</Badge>}
                    {!catalogSelection && decodedVin.horse_power != null && (
                      <Badge variant="outline">
                        {Math.round(decodedVin.horse_power)} hp{decodedVin.powertrain_kind === "EV" ? ` · ${t("referenceOnly")}` : ""}
                      </Badge>
                    )}
                    {decodedVin.fuel_type && <Badge variant="outline">{decodedVin.fuel_type}</Badge>}
                    <span className="text-xs text-muted-foreground ml-auto">{decodedVin.source}</span>
                    <button type="button" onClick={() => { setDecodedVin(null); setVin(""); }}><X className="h-4 w-4 text-gray-400 hover:text-gray-700" /></button>
                  </div>
                  {decodedVin.status === "PARTIAL" && (
                    <div className="flex gap-2 text-xs text-amber-900">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>{decodedVin.powertrain_kind === "EV" || decodedVin.powertrain_kind === "SERIES_HYBRID" ? t("electricPowerHint") : t("vinHint")}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <VehicleSpecificationPicker key={`${catalogResetKey}:${loadedCar?.car_id ?? decodedVin?.vin ?? "manual"}`} disabled={resetDisabled} onApply={applySpecification} />
            {appliedReference && <div data-testid="applied-specification"><VehiclePowerReference entry={appliedReference} /></div>}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} onChange={(event) => {
            if (catalogSelection && ["horse_power", "electric_power_kw", "engine_volume_cc", "car_year", "powertrain_kind"].includes(event.target.name)) setCalculation(null);
            if (["car_year", "powertrain_kind"].includes(event.target.name)) setCatalogSelection(null);
          }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>{t("carPriceUsd")}</Label><Input type="number" step="0.01" {...register("car_price_usd")} />{errors.car_price_usd && <p className="text-sm text-red-500">{errors.car_price_usd.message}</p>}</div>
            <div><Label>{t("engineVolume")}</Label><Input type="number" disabled={powertrainKind === "EV"} {...register("engine_volume_cc")} />{errors.engine_volume_cc && <p className="text-sm text-red-500">{errors.engine_volume_cc.message}</p>}</div>
            <div><Label>{t("carYear")}</Label><Input type="number" min={1990} max={currentYear} {...register("car_year")} />{errors.car_year && <p className="text-sm text-red-500">{errors.car_year.message}</p>}</div>
            <div><Label>{t("manufactureDate")}</Label><Input type="month" {...register("manufacture_date")} /><p className="text-xs text-muted-foreground mt-1">{t("manufactureDateHint")}</p>{errors.manufacture_date && <p className="text-sm text-red-500">{errors.manufacture_date.message}</p>}</div>
            {usesElectricRegulatoryPower ? (
              <div>
                <Label>{t("electricPowerKw")}</Label>
                <Input type="number" step="0.01" {...register("electric_power_kw")} />
                <p className="text-xs text-muted-foreground mt-1">{t("electricPowerHint")}</p>
                {errors.electric_power_kw && <p className="text-sm text-red-500">{errors.electric_power_kw.message}</p>}
              </div>
            ) : (
              <div><Label>{t("horsePower")}</Label><Input type="number" step="0.01" {...register("horse_power")} />{errors.horse_power && <p className="text-sm text-red-500">{errors.horse_power.message}</p>}</div>
            )}
            <div><Label>{t("mileage")}</Label><Input type="number" step="1" {...register("mileage_km")} /><p className="text-xs text-muted-foreground mt-1">{t("mileageHint")}</p>{errors.mileage_km && <p className="text-sm text-red-500">{errors.mileage_km.message}</p>}</div>
            <div>
              <Label>{t("powertrainKind")}</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" {...register("powertrain_kind")}>
                <option value="ICE">{t("powertrain.ice")}</option><option value="OTHER_HYBRID">{t("powertrain.hybrid")}</option><option value="SERIES_HYBRID">{t("powertrain.seriesHybrid")}</option><option value="EV">{t("powertrain.ev")}</option>
              </select>
            </div>
            <div><Label>{t("logisticsCost")}</Label><Input type="number" step="1000" {...register("logistics_cost_rub")} /></div>

            <div className="md:col-span-2 space-y-3">
              <label className="flex items-center gap-3 text-sm cursor-pointer">
                <input type="checkbox" className="h-4 w-4" {...register("auto_market_comparison")} />
                <span className="font-medium">{t("autoMarketComparison")}</span>
              </label>
              {autoMarketComparison && (
                <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                  <p className="text-xs text-muted-foreground">{copy.marketHint}</p>
                  <div>
                    <Label>{t("rfAnalogPrice")}</Label>
                    <Input type="number" step="1000" {...register("rf_analog_price_rub")} />
                    <p className="text-xs text-muted-foreground mt-1">{t("rfAnalogPriceOverrideHint")}</p>
                    {errors.rf_analog_price_rub && <p className="text-sm text-red-500">{errors.rf_analog_price_rub.message}</p>}
                  </div>
                </div>
              )}
            </div>

            <div><Label>{t("note")}</Label><Input maxLength={2000} {...register("note")} /></div>
            <div className="md:col-span-2 flex flex-wrap gap-3">
              <Button type="submit" disabled={calcMutation.isPending || urlMutation.isPending || vinMutation.isPending}>{calcMutation.isPending ? "..." : t("calculate")}</Button>
              <Button type="button" variant="outline" onClick={resetCalculator} disabled={resetDisabled}>
                <RotateCcw className="mr-2 h-4 w-4" />
                {copy.reset}
              </Button>
              {calculation && <Button type="button" variant="outline" onClick={() => saveMutation.mutate(calculation.request)} disabled={saveMutation.isPending}>{t("saveToHistory")}</Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      {calculation && (
        <>
          <CalculatorResults result={calculation.result} vehicle={calculation.vehicle} />
          <div className="flex justify-end">
            <ShareDealButton request={calculation.request} result={calculation.result} vehicle={calculation.vehicle} />
          </div>
        </>
      )}
    </div>
  );
}
