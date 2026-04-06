"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import type { CarListing } from "@/lib/types";
import Image from "next/image";

function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);
}

export function CarCatalog() {
  const t = useTranslations("catalog");

  const [filters, setFilters] = useState({
    make_id: "",
    year_from: "",
    year_to: "",
    price_usd_to: "",
    logistics_cost_rub: "80000",
    page: "1",
  });
  const [submitted, setSubmitted] = useState(false);

  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });

  const { data, isFetching } = useQuery<CarListing[]>({
    queryKey: ["cars", filters],
    queryFn: () => api.get(`/cars/search?${params}`).then((r) => r.data),
    enabled: submitted,
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFilters((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <Label>{t("yearFrom")}</Label>
              <Input name="year_from" type="number" onChange={handleChange} value={filters.year_from} />
            </div>
            <div>
              <Label>{t("yearTo")}</Label>
              <Input name="year_to" type="number" onChange={handleChange} value={filters.year_to} />
            </div>
            <div>
              <Label>{t("priceUsdTo")}</Label>
              <Input name="price_usd_to" type="number" onChange={handleChange} value={filters.price_usd_to} />
            </div>
            <div>
              <Label>{t("logisticsCost")}</Label>
              <Input name="logistics_cost_rub" type="number" onChange={handleChange} value={filters.logistics_cost_rub} />
            </div>
          </div>
          <Button className="mt-4" onClick={() => setSubmitted(true)} disabled={isFetching}>
            {isFetching ? "..." : t("search")}
          </Button>
        </CardContent>
      </Card>

      {data && data.length === 0 && (
        <p className="text-gray-500">{t("noResults")}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.map((car) => (
          <Card key={car.car_id} className="overflow-hidden">
            {car.image_url && (
              <div className="relative h-40 bg-gray-100">
                <Image
                  src={car.image_url}
                  alt={`${car.make} ${car.model}`}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            )}
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold">{car.make} {car.model}</p>
                  <p className="text-sm text-gray-500">{car.year} · {car.engine_volume_cc} сс</p>
                </div>
                <Badge variant="outline">${car.price_usd.toLocaleString()}</Badge>
              </div>
              {car.mileage_km != null && (
                <p className="text-xs text-gray-400">{t("mileage")}: {car.mileage_km.toLocaleString()} {t("km")}</p>
              )}
              {car.estimated_total_rub != null && (
                <p className="text-sm font-medium text-green-700">
                  {t("estimatedTotal")}: {fmt(car.estimated_total_rub)}
                </p>
              )}
              <a
                href={car.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                {t("viewOnMyauto")} <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
