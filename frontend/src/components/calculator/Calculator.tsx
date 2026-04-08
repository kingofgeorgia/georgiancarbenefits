"use client";

import { useState } from "react";
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
import type { CalculatorRequest, CalculatorResult, CarListing } from "@/lib/types";
import { CalculatorResults } from "./CalculatorResults";
import { CurrencyRatesWidget } from "./CurrencyRatesWidget";

const currentYear = new Date().getFullYear();

export function Calculator() {
  const t = useTranslations("calculator");
  const tErr = useTranslations("errors");

  const [carUrl, setCarUrl] = useState("");
  const [loadedCar, setLoadedCar] = useState<CarListing | null>(null);

  const urlMutation = useMutation({
    mutationFn: (url: string) =>
      api.post<CarListing>("/cars/from-url", { url }).then((r) => r.data),
    onSuccess: (car) => {
      setLoadedCar(car);
      setValue("car_price_usd", car.price_usd);
      setValue("engine_volume_cc", car.engine_volume_cc);
      setValue("car_year", car.year);
      toast.success(`${car.make} ${car.model} ${car.year} — данные загружены`);
    },
    onError: () => toast.error("Не удалось загрузить авто. Проверьте ссылку."),
  });

  const schema = z.object({
    car_price_usd: z.coerce.number().positive(tErr("required")),
    engine_volume_cc: z.coerce.number().int().positive(tErr("required")),
    car_year: z.coerce
      .number()
      .int()
      .min(1990)
      .max(currentYear),
    logistics_cost_rub: z.coerce.number().min(0),
    rf_analog_price_rub: z.coerce.number().optional().nullable(),
    note: z.string().optional().nullable(),
  });

  type FormData = z.infer<typeof schema>;

  const { register, handleSubmit, formState: { errors }, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { logistics_cost_rub: 80000 },
  });

  const calcMutation = useMutation({
    mutationFn: (data: CalculatorRequest) =>
      api.post<CalculatorResult>("/calculator/total", data).then((r) => r.data),
    onError: () => toast.error(tErr("generic")),
  });

  const saveMutation = useMutation({
    mutationFn: (data: CalculatorRequest) =>
      api.post("/history/", data),
    onSuccess: () => toast.success("Расчёт сохранён"),
    onError: () => toast.error(tErr("generic")),
  });

  let lastPayload: CalculatorRequest | null = null;

  function onSubmit(data: FormData) {
    const payload: CalculatorRequest = {
      ...data,
      rf_analog_price_rub: data.rf_analog_price_rub ?? null,
      note: data.note ?? null,
    };
    lastPayload = payload;
    calcMutation.mutate(payload);
  }

  return (
    <div className="space-y-6">
      <CurrencyRatesWidget />

      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* URL input for myauto.ge */}
          <div className="mb-5 space-y-2">
            <Label className="flex items-center gap-1">
              <Link2 className="h-4 w-4" /> {t("urlLabel")}
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder={t("urlPlaceholder")}
                value={carUrl}
                onChange={(e) => setCarUrl(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={!carUrl || urlMutation.isPending}
                onClick={() => urlMutation.mutate(carUrl)}
              >
                {urlMutation.isPending ? "..." : t("urlLoad")}
              </Button>
            </div>
            {loadedCar && (
              <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-md text-sm">
                <span className="text-green-800 font-medium">
                  {loadedCar.make} {loadedCar.model} {loadedCar.year}
                </span>
                <Badge variant="outline">${loadedCar.price_usd.toLocaleString()}</Badge>
                <a href={loadedCar.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs ml-auto">
                  myauto.ge ↗
                </a>
                <button type="button" onClick={() => { setLoadedCar(null); setCarUrl(""); }}>
                  <X className="h-4 w-4 text-gray-400 hover:text-gray-700" />
                </button>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{t("carPriceUsd")}</Label>
              <Input type="number" step="0.01" {...register("car_price_usd")} />
              {errors.car_price_usd && <p className="text-sm text-red-500">{errors.car_price_usd.message}</p>}
            </div>
            <div>
              <Label>{t("engineVolume")}</Label>
              <Input type="number" {...register("engine_volume_cc")} />
              {errors.engine_volume_cc && <p className="text-sm text-red-500">{errors.engine_volume_cc.message}</p>}
            </div>
            <div>
              <Label>{t("carYear")}</Label>
              <Input type="number" min={1990} max={currentYear} {...register("car_year")} />
              {errors.car_year && <p className="text-sm text-red-500">{errors.car_year.message}</p>}
            </div>
            <div>
              <Label>{t("logisticsCost")}</Label>
              <Input type="number" step="1000" {...register("logistics_cost_rub")} />
            </div>
            <div>
              <Label>{t("rfAnalogPrice")}</Label>
              <Input type="number" step="1000" {...register("rf_analog_price_rub")} />
            </div>
            <div>
              <Label>{t("note")}</Label>
              <Input {...register("note")} />
            </div>
            <div className="md:col-span-2 flex gap-3">
              <Button type="submit" disabled={calcMutation.isPending}>
                {calcMutation.isPending ? "..." : t("calculate")}
              </Button>
              {calcMutation.data && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => lastPayload && saveMutation.mutate(lastPayload)}
                  disabled={saveMutation.isPending}
                >
                  {t("saveToHistory")}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {calcMutation.data && <CalculatorResults result={calcMutation.data} />}
    </div>
  );
}
