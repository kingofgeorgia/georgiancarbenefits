"use client";

import { useLocale } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type {
  CalculatorRequest,
  CalculatorResult,
  CarListing,
  DealShareCreate,
  DealShareCreated,
  VinDecodeResult,
} from "@/lib/types";

interface Props {
  request: CalculatorRequest;
  result: CalculatorResult;
  vehicle?: CarListing | null;
  vinVehicle?: VinDecodeResult | null;
}

const copy = {
  ru: { button: "Поделиться расчётом", creating: "Создаём ссылку...", copied: "Публичная ссылка скопирована", created: "Публичная ссылка создана", error: "Не удалось создать публичную ссылку" },
  en: { button: "Share calculation", creating: "Creating link...", copied: "Public link copied", created: "Public link created", error: "Could not create public link" },
  ka: { button: "გამოთვლის გაზიარება", creating: "ბმული იქმნება...", copied: "საჯარო ბმული დაკოპირდა", created: "საჯარო ბმული შეიქმნა", error: "საჯარო ბმულის შექმნა ვერ მოხერხდა" },
} as const;

export function ShareDealButton({ request, result, vehicle, vinVehicle }: Props) {
  const locale = useLocale();
  const text = copy[locale as keyof typeof copy] ?? copy.en;

  const mutation = useMutation({
    mutationFn: async () => {
      const snapshot: DealShareCreate = {
        request,
        result,
        vehicle: {
          make: vehicle?.make ?? vinVehicle?.make ?? request.source_make ?? null,
          model: vehicle?.model ?? vinVehicle?.model ?? request.source_model ?? null,
          year: vehicle?.year ?? vinVehicle?.model_year ?? request.car_year,
          mileage_km: vehicle?.mileage_km ?? request.mileage_km ?? null,
          price_usd: vehicle?.price_usd ?? request.car_price_usd,
          image_url: vehicle?.image_url ?? null,
          source_url: vehicle?.url ?? null,
          vin: vinVehicle?.vin ?? null,
        },
      };
      return api.post<DealShareCreated>("/deals/", snapshot).then((response) => response.data);
    },
    onSuccess: async (share) => {
      const url = `${window.location.origin}/${locale}/deal/${share.public_id}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success(text.copied);
      } catch {
        toast.success(text.created);
        window.open(url, "_blank", "noopener,noreferrer");
      }
    },
    onError: () => toast.error(text.error),
  });

  return (
    <Button type="button" variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
      {mutation.isPending ? <Copy className="mr-2 h-4 w-4 animate-pulse" /> : <Share2 className="mr-2 h-4 w-4" />}
      {mutation.isPending ? text.creating : text.button}
    </Button>
  );
}
