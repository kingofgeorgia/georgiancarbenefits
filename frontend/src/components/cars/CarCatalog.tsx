"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import axios from "axios";
import Image from "next/image";
import { AlertTriangle, Car, ChevronDown, ExternalLink, ImageOff, Loader2, Search, Truck } from "lucide-react";
import { api, apiErrorMessage } from "@/lib/api";
import type { BudgetCandidate, BudgetCurrency, BudgetMode, BudgetSearchRequest, BudgetSearchResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass = "h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm";

export function CarCatalog({ active = true }: { active?: boolean }) {
  const t = useTranslations("budget");
  const tErr = useTranslations("errors");
  const locale = useLocale();
  const [mode, setMode] = useState<BudgetMode>("GEORGIA_PURCHASE");
  const [currency, setCurrency] = useState<BudgetCurrency>("USD");
  const [filters, setFilters] = useState({ budget: "", make: "", yearFrom: "", yearTo: "", mileage: "", logistics: "170000", registration: "" });
  const [submitted, setSubmitted] = useState<BudgetSearchRequest | null>(null);
  const [searchId, setSearchId] = useState(0);
  const [sort, setSort] = useState("price");
  const [formError, setFormError] = useState<string | null>(null);
  const makes = useQuery<{ man_id: number; title: string }[]>({
    queryKey: ["budget-makes"], queryFn: ({ signal }) => api.get("/cars/makes", { signal }).then((r) => r.data),
    staleTime: 3600000, retry: false, enabled: active,
  });
  const search = useInfiniteQuery({
    queryKey: ["budget-search", submitted, searchId], initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => api.post<BudgetSearchResult>("/cars/budget", { ...submitted, page: pageParam }, { signal }).then((r) => r.data),
    getNextPageParam: (last) => last.has_more ? last.next_page : undefined,
    enabled: submitted !== null, retry: false, staleTime: Infinity,
  });

  function clearResults() { setSubmitted(null); setFormError(null); }
  function changeFilter(name: keyof typeof filters, value: string) {
    clearResults(); setFilters((current) => ({ ...current, [name]: value }));
  }
  function changeMode(value: BudgetMode) {
    if (value === mode) return;
    clearResults(); setMode(value); setCurrency(value === "RUSSIA_TOTAL" ? "RUB" : "USD");
    setFilters((current) => ({ ...current, budget: "" }));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const number = (value: string) => value === "" ? null : Number(value);
    if (filters.yearFrom && filters.yearTo && Number(filters.yearFrom) > Number(filters.yearTo)) { setFormError(t("invalidYears")); return; }
    setFormError(null);
    setSubmitted({
      mode, budget_amount: Number(filters.budget), budget_currency: currency,
      make_id: number(filters.make), year_from: number(filters.yearFrom), year_to: number(filters.yearTo), mileage_km_to: number(filters.mileage),
      logistics_cost_rub: mode === "RUSSIA_TOTAL" ? Number(filters.logistics) : null,
      registration_cost_rub: mode === "RUSSIA_TOTAL" ? Number(filters.registration) : null,
    });
    setSearchId((value) => value + 1);
  }
  const pages = submitted ? search.data?.pages ?? [] : [];
  const unique = (items: BudgetCandidate[]) => [...new Map(items.map((item) => [item.car.car_id, item])).values()];
  const matches = unique(pages.flatMap((page) => page.matches)).sort((a, b) => {
    if (sort === "year") return b.car.year - a.car.year || a.cost_in_budget_currency! - b.cost_in_budget_currency!;
    if (sort === "mileage") return (a.car.mileage_km ?? Infinity) - (b.car.mileage_km ?? Infinity) || a.car.car_id - b.car.car_id;
    return a.cost_in_budget_currency! - b.cost_in_budget_currency! || b.car.year - a.car.year;
  });
  const pending = unique(pages.flatMap((page) => page.needs_details)).filter((item) => !matches.some((match) => match.car.car_id === item.car.car_id));
  const checked = pages.reduce((sum, page) => sum + page.checked_count, 0);
  const fmt = (value: number, code: BudgetCurrency = submitted?.budget_currency ?? currency) => new Intl.NumberFormat(locale, { style: "currency", currency: code, maximumFractionDigits: 2 }).format(value);
  const integer = (value: number) => new Intl.NumberFormat(locale).format(value);
  function errorMessage(error: unknown) {
    const code = axios.isAxiosError(error) ? error.response?.data?.detail?.code : null;
    if (code === "MYAUTO_UNAVAILABLE") return t("providerUnavailable");
    if (code === "RATES_UNAVAILABLE") return t("ratesUnavailable");
    if (axios.isAxiosError(error) && error.response?.status === 422) return t("invalidInput");
    return apiErrorMessage(error, tErr("generic"), { rateLimited: tErr("rateLimited"), payloadTooLarge: tErr("payloadTooLarge"), temporarilyUnavailable: tErr("temporarilyUnavailable") });
  }

  function candidate(item: BudgetCandidate) {
    const car = item.car, breakdown = item.breakdown;
    return <article key={car.car_id} data-testid={`budget-car-${car.car_id}`} className="min-w-0 overflow-hidden rounded-md border bg-card">
      <div className="relative aspect-[16/10] bg-muted">
        {car.image_url ? <Image src={car.image_url} alt={`${car.make} ${car.model}`} fill sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw" className="object-contain" unoptimized /> : <div className="flex h-full items-center justify-center text-muted-foreground"><ImageOff aria-label={t("noPhoto")} className="h-8 w-8" /></div>}
      </div>
      <div className="space-y-4 p-4">
        <div><h3 className="break-words text-base font-semibold">{car.make} {car.model}</h3><p className="text-sm text-muted-foreground">{car.year || t("unknownYear")} · {car.mileage_km != null ? `${integer(car.mileage_km)} ${t("km")}` : t("unknownMileage")}</p></div>
        <dl className="space-y-2 text-sm">
          <div className="flex flex-wrap justify-between gap-1"><dt>{t("purchasePrice")}</dt><dd className="font-medium">{fmt(car.price_usd, "USD")}</dd></div>
          {item.status === "WITHIN_BUDGET" ? <>
            <div className="flex flex-wrap justify-between gap-1 border-t pt-2"><dt className="font-medium">{submitted?.mode === "RUSSIA_TOTAL" ? t("russiaEstimate") : t("purchaseTotal")}</dt><dd className="font-semibold">{fmt(item.cost_in_budget_currency!)}</dd></div>
            <div className="flex flex-wrap justify-between gap-1 text-green-700"><dt>{t("remaining")}</dt><dd>{fmt(item.remaining_budget!)}</dd></div>
          </> : <div className="flex gap-2 text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><dt className="font-medium">{t("needsDetails")}</dt><dd>{t(`reason.${item.reason}`)}</dd></div></div>}
        </dl>
        {breakdown && <details className="border-t pt-3">
          <summary className="cursor-pointer text-sm font-medium">{t("breakdown")}</summary>
          <dl className="mt-3 space-y-2 text-sm">
            {([ ["purchaseRub", breakdown.purchase_rub], ["customsFee", breakdown.customs_fee_rub], ["customsDuty", breakdown.customs_duty_rub], ["recycling", breakdown.recycling_fee_rub], ["logistics", breakdown.logistics_cost_rub], ["registration", breakdown.registration_cost_rub] ] as const).map(([key, value]) => <div key={key} className="flex flex-wrap justify-between gap-1"><dt>{t(key)}</dt><dd>{fmt(value, "RUB")}</dd></div>)}
            {breakdown.vat_rub > 0 && <div className="text-muted-foreground">{t("includedTaxes", { duty: fmt(breakdown.import_duty_rub, "RUB"), excise: fmt(breakdown.excise_rub, "RUB"), vat: fmt(breakdown.vat_rub, "RUB") })}</div>}
            <div className="flex flex-wrap justify-between gap-1 border-t pt-2 font-semibold"><dt>{t("total")}</dt><dd>{fmt(breakdown.total_rub, "RUB")}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">{t("yearEstimate")}</p>
          {breakdown.minimum_total_rub !== breakdown.total_rub && <p className="mt-2 text-xs text-muted-foreground">{t("ageRange", { min: fmt(breakdown.minimum_total_rub, "RUB"), max: fmt(breakdown.total_rub, "RUB") })}</p>}
        </details>}
        <a href={car.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-primary underline underline-offset-4">{t("viewListing")}<ExternalLink className="h-4 w-4 shrink-0" /></a>
      </div>
    </article>;
  }

  return <section className="min-w-0 space-y-6" aria-label={t("title")}>
    <h1 className="text-2xl font-bold">{t("title")}</h1>
    <form onSubmit={submit} className="space-y-5 border-b pb-6">
      <fieldset className="min-w-0 space-y-2"><legend className="mb-2 text-sm font-medium">{t("scope")}</legend>
        <div className="grid grid-cols-2 overflow-hidden rounded-md border">
          {(["GEORGIA_PURCHASE", "RUSSIA_TOTAL"] as const).map((value) => <label key={value} className={`flex min-h-24 min-w-0 cursor-pointer items-center gap-2 p-3 text-xs font-medium leading-5 ${mode === value ? "bg-secondary" : "bg-background"} ${value === "RUSSIA_TOTAL" ? "border-l" : ""}`}>
            <input type="radio" name="budget_mode" value={value} checked={mode === value} onChange={() => changeMode(value)} className="shrink-0 accent-black" />
            <span className="min-w-0 break-words">{value === "GEORGIA_PURCHASE" ? <Car aria-hidden className="mb-1 h-4 w-4" /> : <Truck aria-hidden className="mb-1 h-4 w-4" />}{t(value === "GEORGIA_PURCHASE" ? "georgia" : "russia")}</span>
          </label>)}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="min-w-0 space-y-2"><Label htmlFor="budget-amount">{t("amount")}</Label><Input id="budget-amount" name="budget_amount" type="number" inputMode="decimal" required min="0.01" max="100000000000" step="0.01" value={filters.budget} onChange={(e) => changeFilter("budget", e.target.value)} /></div>
        <div className="min-w-0 space-y-2"><Label htmlFor="budget-currency">{t("currency")}</Label><select id="budget-currency" name="budget_currency" className={selectClass} value={currency} onChange={(e) => { clearResults(); setCurrency(e.target.value as BudgetCurrency); setFilters((f) => ({ ...f, budget: "" })); }}>{["USD", "RUB", "GEL"].map((code) => <option key={code} value={code}>{code}</option>)}</select></div>
        <div className="min-w-0 space-y-2"><Label htmlFor="budget-make">{t("make")}</Label><select id="budget-make" className={selectClass} value={filters.make} onChange={(e) => changeFilter("make", e.target.value)}><option value="">{t("anyMake")}</option>{makes.data?.map((make) => <option key={make.man_id} value={make.man_id}>{make.title}</option>)}</select></div>
        {([ ["yearFrom", "budget-year-from", "year_from", 1900, new Date().getFullYear()], ["yearTo", "budget-year-to", "year_to", 1900, new Date().getFullYear()], ["mileage", "budget-mileage", "mileage_km_to", 0, 10000000] ] as const).map(([key, id, name, min, max]) => <div key={key} className="min-w-0 space-y-2"><Label htmlFor={id}>{t(key === "mileage" ? "mileageTo" : key)}</Label><Input id={id} name={name} type="number" min={min} max={max} value={filters[key]} onChange={(e) => changeFilter(key, e.target.value)} /></div>)}
        {mode === "RUSSIA_TOTAL" && <>
          <div className="min-w-0 space-y-2"><Label htmlFor="budget-logistics">{t("logisticsInput")}</Label><Input id="budget-logistics" name="logistics_cost_rub" type="number" required min={0} max={100000000} step="0.01" value={filters.logistics} onChange={(e) => changeFilter("logistics", e.target.value)} /></div>
          <div className="min-w-0 space-y-2"><Label htmlFor="budget-registration">{t("registrationInput")}</Label><Input id="budget-registration" name="registration_cost_rub" type="number" required min={0} max={100000000} step="0.01" value={filters.registration} onChange={(e) => changeFilter("registration", e.target.value)} /></div>
        </>}
      </div>
      {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
      <Button type="submit" disabled={search.isFetching} className="min-h-10 max-w-full whitespace-normal text-center">{search.isFetching && !search.isFetchingNextPage ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Search className="h-4 w-4 shrink-0" />}{t("search")}</Button>
    </form>
    {submitted && search.isError && <p role="alert" className="text-sm text-red-600">{errorMessage(search.error)}</p>}
    {pages.length > 0 && <>
      <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-lg font-semibold">{t("matches", { count: matches.length })}</h2><p className="text-sm text-muted-foreground">{t("checked", { count: checked })}</p></div>
        <div className="min-w-0 space-y-1"><Label htmlFor="budget-sort">{t("sort")}</Label><select id="budget-sort" className={selectClass} value={sort} onChange={(e) => setSort(e.target.value)}><option value="price">{t("sortPrice")}</option><option value="year">{t("sortYear")}</option><option value="mileage">{t("sortMileage")}</option></select></div>
      </div>
      {matches.length === 0 && <p role="status" className="text-sm text-muted-foreground">{t("noMatches")}</p>}
      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">{matches.map(candidate)}</div>
      {pending.length > 0 && <section aria-label={t("needsDetails")} className="space-y-4 border-t pt-5"><h2 className="text-lg font-semibold">{t("needsDetails")}</h2><div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">{pending.map(candidate)}</div></section>}
      {search.hasNextPage && <Button variant="outline" onClick={() => void search.fetchNextPage()} disabled={search.isFetching} className="min-h-10 max-w-full whitespace-normal">{search.isFetchingNextPage ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <ChevronDown className="h-4 w-4 shrink-0" />}{t("loadMore")}</Button>}
      <div className="space-y-2 border-t pt-4 text-xs text-muted-foreground"><p>{submitted?.mode === "RUSSIA_TOTAL" ? t("russiaDisclaimer") : t("georgiaDisclaimer")}</p>{pages[0].rates && <p>{t("rates", { source: pages[0].rates.source, date: pages[0].rates.effective_date })}{pages[0].rates.is_stale ? ` · ${t("staleRates")}` : ""}</p>}</div>
    </>}
  </section>;
}
