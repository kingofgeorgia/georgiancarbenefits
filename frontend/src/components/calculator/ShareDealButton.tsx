"use client";

import { useLocale, useTranslations } from "next-intl";
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

export function ShareDealButton({ request, result, vehicle, vinVehicle }: Props) {
  const t = useTranslations("calculator.share");
  const locale = useLocale();

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
        toast.success(t("copied"));
      } catch {
        toast.success(t("created"));
        window.open(url, "_blank", "noopener,noreferrer");
      }
    },
    onError: () => toast.error(t("error")),
  });

  return (
    <Button type="button" variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
      {mutation.isPending ? <Copy className="mr-2 h-4 w-4 animate-pulse" /> : <Share2 className="mr-2 h-4 w-4" />}
      {mutation.isPending ? t("creating") : t("button")}
    </Button>
  );
}
