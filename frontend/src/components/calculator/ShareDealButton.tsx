"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api, apiErrorMessage } from "@/lib/api";
import type {
  CalculatorRequest,
  CalculatorResult,
  DealShareCreate,
  DealShareCreated,
  DealVehicleSnapshot,
} from "@/lib/types";

interface Props {
  request: CalculatorRequest;
  result: CalculatorResult;
  vehicle: DealVehicleSnapshot;
}

const copy = {
  ru: { button: "Поделиться расчётом", creating: "Создаём ссылку...", copied: "Публичная ссылка скопирована", created: "Публичная ссылка создана", error: "Не удалось создать публичную ссылку" },
  en: { button: "Share calculation", creating: "Creating link...", copied: "Public link copied", created: "Public link created", error: "Could not create public link" },
  ka: { button: "გამოთვლის გაზიარება", creating: "ბმული იქმნება...", copied: "საჯარო ბმული დაკოპირდა", created: "საჯარო ბმული შეიქმნა", error: "საჯარო ბმულის შექმნა ვერ მოხერხდა" },
} as const;

export function ShareDealButton({ request, result, vehicle }: Props) {
  const locale = useLocale();
  const tErr = useTranslations("errors");
  const text = copy[locale as keyof typeof copy] ?? copy.en;
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const snapshot: DealShareCreate = {
        request,
        result,
        vehicle,
      };
      return api.post<DealShareCreated>("/deals/", snapshot).then((response) => response.data);
    },
    onSuccess: async (share) => {
      const url = `${window.location.origin}/${locale}/deal/${share.public_id}`;
      setFallbackUrl(null);
      try {
        await navigator.clipboard.writeText(url);
        toast.success(text.copied);
      } catch {
        setFallbackUrl(url);
        toast.success(text.created);
      }
    },
    onError: (error) => toast.error(apiErrorMessage(error, text.error, {
      rateLimited: tErr("rateLimited"), payloadTooLarge: tErr("payloadTooLarge"), temporarilyUnavailable: tErr("temporarilyUnavailable"),
    })),
  });

  return (
    <div className="flex min-w-0 max-w-full flex-col items-end gap-2">
      <Button type="button" variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? <Copy className="mr-2 h-4 w-4 animate-pulse" /> : <Share2 className="mr-2 h-4 w-4" />}
        {mutation.isPending ? text.creating : text.button}
      </Button>
      {fallbackUrl && (
        <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className="max-w-full break-all text-sm text-primary underline underline-offset-4">
          {fallbackUrl}
        </a>
      )}
    </div>
  );
}
