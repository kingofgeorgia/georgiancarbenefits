"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Car, ChevronDown, ExternalLink, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MyAutoCatalogEntry } from "@/lib/myauto-catalog";
import type { VehicleSpecification } from "@/lib/types";
import type { BmwVariant } from "@/components/calculator/BmwVariantPicker";
import { getVehicleCatalog, type VehicleCatalogResponse } from "@/lib/vehicle-catalog";

const normalize = (value: string) => value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const yearOf = (value: string) => Number(value.slice(0, 4));
const specialBmwGroups = new Set(["mseries", "iseries", "xseries", "zseries"]);

interface CatalogMake { name: string; }
interface CatalogModel { key: string; name: string; groupTitle: string; sourceNames: string[]; }
interface CatalogFilters { body: string; drive: string; displacementFrom: string; displacementTo: string; powerFrom: string; powerTo: string; yearFrom: string; yearTo: string; }
interface GenerationGroup { key: string; chassis: string; yearFrom: number; yearTo: number; entries: BmwVariant[]; }

function seriesLabel(value: string, locale: string) {
  const match = value.match(/^(\d+)er$/i);
  if (!match) return value;
  if (locale === "ru") return `${match[1]} серия`;
  if (locale === "ka") return `${match[1]} სერია`;
  return `${match[1]} Series`;
}

function buildModels(make: string, myAutoRows: MyAutoCatalogEntry[], bmwRows: BmwVariant[], specRows: VehicleSpecification[], learnedRows: VehicleCatalogResponse["learned_vehicle_observations"], locale: string) {
  const result = new Map<string, CatalogModel>();
  const isBmw = normalize(make) === "bmw";

  myAutoRows.filter((row) => normalize(row.make) === normalize(make) && row.modelId !== null).forEach((row) => {
    const mPerformanceSeries = isBmw ? row.model.match(/^M([1-8])\d{2}$/i)?.[1] : undefined;
    const familyTitle = mPerformanceSeries ? `${mPerformanceSeries}er` : row.groupTitle;
    const group = normalize(familyTitle);
    const asFamily = isBmw && Boolean(familyTitle) && !specialBmwGroups.has(group);
    const key = asFamily ? `family:${group}` : normalize(row.model);
    const name = asFamily ? seriesLabel(familyTitle, locale) : row.model;
    const existing = result.get(key);
    if (existing) {
      if (!existing.sourceNames.some((source) => normalize(source) === normalize(row.model))) existing.sourceNames.push(row.model);
      return;
    }
    result.set(key, { key, name, groupTitle: "", sourceNames: [row.model] });
  });

  if (isBmw) bmwRows.forEach((row) => {
    const key = normalize(row.model);
    const alreadyCovered = [...result.values()].some((model) => modelNameMatches(model, row.model));
    if (!alreadyCovered && !result.has(key)) result.set(key, { key, name: row.model, groupTitle: "", sourceNames: [row.model] });
  });
  specRows.filter((row) => normalize(row.make) === normalize(make)).forEach((row) => {
    const key = normalize(row.model);
    const alreadyCovered = [...result.values()].some((model) => modelNameMatches(model, row.model));
    if (!alreadyCovered && !result.has(key)) result.set(key, { key, name: row.model, groupTitle: "", sourceNames: [row.model] });
  });
  learnedRows.filter((row) => normalize(row.make) === normalize(make)).forEach((row) => {
    const key = normalize(row.model);
    if (![...result.values()].some((model) => modelNameMatches(model, row.model)) && !result.has(key)) {
      result.set(key, { key, name: row.model, groupTitle: "", sourceNames: [row.model] });
    }
  });

  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name, locale, { numeric: true, sensitivity: "base" }));
}

function modelNameMatches(model: CatalogModel, candidate: string) {
  const normalizedCandidate = normalize(candidate);
  return model.sourceNames.some((source) => {
    const normalizedSource = normalize(source);
    return normalizedSource === normalizedCandidate
      || (/^\d{3}$/.test(normalizedSource) && normalizedCandidate.startsWith(normalizedSource))
      || (/^[ximz]\d+$/.test(normalizedSource) && normalizedCandidate.startsWith(normalizedSource));
  });
}

function bodyCategory(body: string) {
  if (/gran coup[eé]/i.test(body)) return "gran-coupe";
  if (/sports activity coupe/i.test(body)) return "sports-activity-coupe";
  if (/convertible|cabrio/i.test(body)) return "convertible";
  if (/sedan/i.test(body)) return "sedan";
  if (/touring|wagon/i.test(body)) return "wagon";
  if (/hatch/i.test(body)) return "hatchback";
  if (/compact/i.test(body)) return "compact";
  if (/gran turismo/i.test(body)) return "gran-turismo";
  if (/roadster/i.test(body)) return "roadster";
  if (/sports activity vehicle/i.test(body)) return "sports-activity-vehicle";
  return normalize(body);
}

function driveCategory(drive: string) {
  if (/all[\s-]*wheel/i.test(drive) || normalize(drive) === "awd") return "awd";
  if (/rear[\s-]*wheel/i.test(drive) || normalize(drive) === "rwd") return "rwd";
  if (/front[\s-]*wheel/i.test(drive) || normalize(drive) === "fwd") return "fwd";
  return normalize(drive);
}

export function VehicleCatalogBrowser() {
  const t = useTranslations("vehicleCatalog");
  const locale = useLocale();
  const currentYear = new Date().getFullYear();
  const [myAutoRows, setMyAutoRows] = useState<MyAutoCatalogEntry[]>([]);
  const [bmwRows, setBmwRows] = useState<BmwVariant[]>([]);
  const [specRows, setSpecRows] = useState<VehicleSpecification[]>([]);
  const [learnedRows, setLearnedRows] = useState<VehicleCatalogResponse["learned_vehicle_observations"]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedMake, setSelectedMake] = useState("");
  const [selectedModelKey, setSelectedModelKey] = useState("");
  const [selectedGenerationKey, setSelectedGenerationKey] = useState("");
  const [selectedBodyStyle, setSelectedBodyStyle] = useState("");
  const [selectedTrimId, setSelectedTrimId] = useState("");
  const [activeTab, setActiveTab] = useState<"generations" | "specifications" | "learned">("generations");
  const [modelsExpanded, setModelsExpanded] = useState(false);
  const [filters, setFilters] = useState<CatalogFilters>({ body: "", drive: "", displacementFrom: "", displacementTo: "", powerFrom: "", powerTo: "", yearFrom: "", yearTo: "" });

  useEffect(() => {
    let active = true;
    getVehicleCatalog().then((data) => {
      if (!active) return;
      setMyAutoRows(data.make_model_records.map((row) => ({
        makeId: row.make_id,
        make: row.make,
        modelId: row.model_id,
        model: row.model,
        groupTitle: row.group_title,
      })));
      setBmwRows(data.bmw_variants);
      setSpecRows(data.vehicle_specifications);
      setLearnedRows(data.learned_vehicle_observations ?? []);
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setCatalogError(true);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const makeOptions = useMemo(() => {
    const names = new Map<string, string>();
    myAutoRows.forEach((row) => names.set(normalize(row.make), row.make));
    bmwRows.forEach((row) => names.set(normalize(row.make), row.make));
    specRows.forEach((row) => names.set(normalize(row.make), row.make));
    learnedRows.forEach((row) => names.set(normalize(row.make), row.make));
    return [...names.values()].map((name) => ({ name } satisfies CatalogMake))
      .sort((a, b) => a.name.localeCompare(b.name, locale, { sensitivity: "base" }));
  }, [bmwRows, learnedRows, locale, myAutoRows, specRows]);

  const modelOptions = useMemo(() => buildModels(selectedMake, myAutoRows, bmwRows, specRows, learnedRows, locale), [bmwRows, learnedRows, locale, myAutoRows, selectedMake, specRows]);
  const selectedModel = modelOptions.find((model) => model.key === selectedModelKey);
  const filteredMakes = makeOptions.filter((make) => !search || normalize(make.name).includes(normalize(search)));

  const allMakeVariants = useMemo(() => {
    if (normalize(selectedMake) === "bmw") return bmwRows;
    return [] as BmwVariant[];
  }, [bmwRows, selectedMake]);
  const makeSpecificationRows = useMemo(() => specRows.filter((row) => normalize(row.make) === normalize(selectedMake)), [selectedMake, specRows]);
  const bodyOptions = (() => {
    const options = new Map<string, string>();
    allMakeVariants.forEach((row) => {
      const category = bodyCategory(row.body);
      if (category && !options.has(category)) options.set(category, row.body);
    });
    return [...options.entries()].map(([value, body]) => ({ value, label: bodyLabel(body) })).sort((a, b) => a.label.localeCompare(b.label, locale));
  })();
  const driveOptions = useMemo(() => [...new Set([...allMakeVariants.map((row) => row.drive), ...makeSpecificationRows.map((row) => row.drive)].filter(Boolean).map(driveCategory))].sort(), [allMakeVariants, makeSpecificationRows]);
  const hasTechnicalSpecs = allMakeVariants.length > 0 || makeSpecificationRows.length > 0;

  const modelResults = useMemo(() => modelOptions.map((model) => ({
    model,
    bmw: normalize(selectedMake) === "bmw" ? bmwRows.filter((row) => modelNameMatches(model, row.model)) : [],
    specs: makeSpecificationRows.filter((row) => modelNameMatches(model, row.model)),
  })), [bmwRows, makeSpecificationRows, modelOptions, selectedMake]);

  const filteredModelResults = modelResults.filter(({ bmw, specs }) => {
    const hasFilters = Object.values(filters).some(Boolean);
    if (!hasFilters) return true;
    const rowMatches = (row: BmwVariant | VehicleSpecification) => {
      const isBmwRow = "production_from" in row;
      const body = isBmwRow ? row.body : "";
      const drive = row.drive;
      const displacement = isBmwRow ? (row.engine_cc ?? 0) / 1000 : row.engine_liters;
      const power = isBmwRow ? row.power_ps : row.horse_power;
      const yearFrom = isBmwRow ? yearOf(row.production_from) : row.year_from;
      const yearTo = isBmwRow ? yearOf(row.production_to) : row.year_to;
      return (!filters.body || bodyCategory(body) === filters.body)
        && (!filters.drive || driveCategory(drive) === filters.drive)
        && (!filters.displacementFrom || displacement >= Number(filters.displacementFrom))
        && (!filters.displacementTo || displacement <= Number(filters.displacementTo))
        && (!filters.powerFrom || power >= Number(filters.powerFrom))
        && (!filters.powerTo || power <= Number(filters.powerTo))
        && (!filters.yearFrom || yearTo >= Number(filters.yearFrom))
        && (!filters.yearTo || yearFrom <= Number(filters.yearTo));
    };
    return [...bmw, ...specs].some(rowMatches);
  }).filter(({ model }) => !search || normalize(`${model.name} ${model.groupTitle}`).includes(normalize(search)));

  const selectedBmwRows = useMemo(() => !selectedModel || normalize(selectedMake) !== "bmw" ? [] : bmwRows.filter((row) => modelNameMatches(selectedModel, row.model)), [bmwRows, selectedModel, selectedMake]);
  const selectedSpecRows = useMemo(() => !selectedModel ? [] : specRows.filter((row) => normalize(row.make) === normalize(selectedMake) && modelNameMatches(selectedModel, row.model)), [selectedModel, selectedMake, specRows]);
  const selectedLearnedRows = useMemo(() => !selectedModel ? [] : learnedRows.filter((row) => normalize(row.make) === normalize(selectedMake) && modelNameMatches(selectedModel, row.model)), [learnedRows, selectedMake, selectedModel]);
  const generationGroups = useMemo(() => {
    const groups = new Map<string, GenerationGroup>();
    selectedBmwRows.forEach((entry) => {
      const key = entry.chassis;
      const from = yearOf(entry.production_from);
      const to = Math.min(currentYear, yearOf(entry.production_to));
      const group = groups.get(key);
      if (group) {
        group.yearFrom = Math.min(group.yearFrom, from);
        group.yearTo = Math.max(group.yearTo, to);
        group.entries.push(entry);
      } else {
        groups.set(key, { key, chassis: entry.chassis, yearFrom: from, yearTo: to, entries: [entry] });
      }
    });
    return [...groups.values()].sort((a, b) => a.yearFrom - b.yearFrom || a.chassis.localeCompare(b.chassis));
  }, [currentYear, selectedBmwRows]);
  const selectedGeneration = generationGroups.find((generation) => generation.key === selectedGenerationKey);
  const selectedGenerationBodies = selectedGeneration ? [...new Set(selectedGeneration.entries.map((entry) => entry.body))].sort((a, b) => a.localeCompare(b, locale)) : [];
  const selectedGenerationTrims = useMemo(() => {
    if (!selectedGeneration) return [];
    const rows = selectedGeneration.entries.filter((entry) => !selectedBodyStyle || bodyCategory(entry.body) === selectedBodyStyle);
    const unique = new Map<string, BmwVariant>();
    rows.forEach((entry) => {
      const key = [entry.model, entry.version, entry.body, entry.engine_code, entry.engine_cc ?? "", entry.power_ps, entry.drive].map((value) => normalize(String(value ?? ""))).join("|");
      if (!unique.has(key)) unique.set(key, entry);
    });
    return [...unique.values()].sort((a, b) => a.model.localeCompare(b.model, locale, { numeric: true }) || a.power_ps - b.power_ps || a.version?.localeCompare(b.version ?? "") || a.id.localeCompare(b.id));
  }, [locale, selectedBodyStyle, selectedGeneration]);
  const selectedTrim = selectedGenerationTrims.find((entry) => entry.id === selectedTrimId);
  const generationYears = selectedBmwRows.length ? `${Math.min(...selectedBmwRows.map((row) => yearOf(row.production_from)))}–${Math.max(...selectedBmwRows.map((row) => Math.min(currentYear, yearOf(row.production_to))))}` : "";

  function resetFilters() {
    setFilters({ body: "", drive: "", displacementFrom: "", displacementTo: "", powerFrom: "", powerTo: "", yearFrom: "", yearTo: "" });
    setSearch("");
  }

  function chooseMake(make: string) {
    setSelectedMake(make);
    setSelectedModelKey("");
    setSelectedGenerationKey("");
    setSelectedBodyStyle("");
    setSelectedTrimId("");
    setSearch("");
    setModelsExpanded(false);
    resetFilters();
  }

  function resetToMakes() {
    setSelectedMake("");
    setSelectedModelKey("");
    setSelectedGenerationKey("");
    setSelectedBodyStyle("");
    setSelectedTrimId("");
    setSearch("");
    setModelsExpanded(false);
    resetFilters();
  }

  function resetToModels() {
    setSelectedModelKey("");
    setSelectedGenerationKey("");
    setSelectedBodyStyle("");
    setSelectedTrimId("");
    setActiveTab("generations");
    setSearch("");
  }

  function chooseModel(model: CatalogModel) {
    setSelectedModelKey(model.key);
    setSelectedGenerationKey("");
    setSelectedBodyStyle("");
    setSelectedTrimId("");
    setActiveTab("generations");
    setSearch("");
  }

  function setFilter<K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function bodyLabel(body: string) {
    const category = bodyCategory(body);
    if (category === "gran-coupe") return t("bodyGranCoupe");
    if (category === "sports-activity-coupe") return t("bodySportsActivityCoupe");
    if (category === "convertible") return t("bodyConvertible");
    if (category === "sedan") return t("bodySedan");
    if (category === "wagon") return t("bodyWagon");
    if (category === "hatchback") return t("bodyHatchback");
    if (category === "compact") return t("bodyCompact");
    if (category === "gran-turismo") return t("bodyGranTurismo");
    if (category === "roadster") return t("bodyRoadster");
    if (category === "sports-activity-vehicle") return t("bodySportsActivityVehicle");
    if (category === "coupe") return t("bodyCoupe");
    return body;
  }

  function driveLabel(drive: string) {
    if (/all[\s-]*wheel/i.test(drive)) return t("allDrive");
    if (/rear[\s-]*wheel/i.test(drive)) return t("rearDrive");
    if (/front[\s-]*wheel/i.test(drive)) return t("frontDrive");
    if (normalize(drive) === "awd") return t("allDrive");
    if (normalize(drive) === "rwd") return t("rearDrive");
    if (normalize(drive) === "fwd") return t("frontDrive");
    return drive;
  }

  function powertrainLabel(powertrain: string) {
    if (powertrain === "EV") return t("powertrain_EV");
    if (powertrain === "SERIES_HYBRID") return t("powertrain_SERIES_HYBRID");
    if (powertrain === "OTHER_HYBRID") return t("powertrain_OTHER_HYBRID");
    return t("powertrain_ICE");
  }

  function bmwCard(entry: BmwVariant) {
    return <Card key={entry.id} className="overflow-hidden">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h4 className="font-semibold">{entry.version || t("standardVersion")}</h4><p className="text-sm text-muted-foreground">{entry.engine_code} · {entry.market_region}</p></div>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">{t("reference")}</span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">{t("displacement")}</dt><dd className="font-medium">{entry.engine_cc ? `${entry.engine_cc.toLocaleString(locale)} cc` : t("notAvailable")}</dd></div>
          <div><dt className="text-muted-foreground">{t("power")}</dt><dd className="font-medium">{entry.power_ps.toLocaleString(locale)} PS · {entry.power_kw} kW</dd></div>
          <div><dt className="text-muted-foreground">{t("drive")}</dt><dd className="font-medium">{entry.drive}</dd></div>
        </dl>
        <a href={entry.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-4">{entry.source_title} <ExternalLink className="h-3.5 w-3.5" /></a>
      </CardContent>
    </Card>;
  }

  function generationCard(generation: GenerationGroup) {
    const uniqueEngines = new Set(generation.entries.map((entry) => entry.engine_code)).size;
    const powers = [...new Set(generation.entries.map((entry) => Math.round(entry.power_ps)))].sort((a, b) => a - b);
    const bodyStyles = [...new Set(generation.entries.map((entry) => entry.body))];
    const versions = new Set(generation.entries.map((entry) => [entry.model, entry.version, entry.engine_code, entry.engine_cc, entry.power_ps, entry.drive].join("|"))).size;
    const isSelected = selectedGenerationKey === generation.key;
    return <button key={generation.key} type="button" onClick={() => { setSelectedGenerationKey(isSelected ? "" : generation.key); setSelectedBodyStyle(""); setSelectedTrimId(""); }} className="group text-left">
      <Card className={`h-full overflow-hidden transition-colors ${isSelected ? "border-primary ring-1 ring-primary" : "group-hover:border-primary/50"}`}>
        <div className="relative flex h-40 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 via-zinc-100 to-stone-200">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_100%,rgba(15,23,42,0.12),transparent_55%)]" />
          <Car className="relative h-20 w-20 text-slate-500/70 transition-transform group-hover:scale-105" strokeWidth={1.2} />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1">{bodyStyles.slice(0, 3).map((body) => <span key={body} className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-700">{bodyLabel(body)}</span>)}</div>
          <span className="absolute bottom-3 right-3 rounded-full bg-slate-900/80 px-2.5 py-1 text-xs font-medium text-white">{t("chassisLabel")}: {generation.chassis}</span>
        </div>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2"><h3 className="text-lg font-semibold">{generation.yearFrom}–{generation.yearTo}</h3><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" /></div>
          <p className="text-sm text-muted-foreground">{t("generationSpecs", { engines: uniqueEngines, versions })}</p>
          <p className="text-sm">{t("generationPowerRange", { range: powers.length === 1 ? `${powers[0]} PS` : powers.length ? `${powers[0]}–${powers[powers.length - 1]} PS` : "—" })}</p>
        </CardContent>
      </Card>
    </button>;
  }

  const selectedTitle = selectedModel?.name ?? "";
  const filteredFeaturedNames = ["Audi", "BMW", "Chevrolet", "Ford", "Geely", "Haval", "Honda", "Hyundai", "Kia", "Mercedes-Benz", "Nissan", "Renault", "Skoda", "Tesla", "Toyota", "Volkswagen"];
  const featuredMakes = filteredFeaturedNames.map((name) => makeOptions.find((make) => normalize(make.name) === normalize(name))).filter((make): make is CatalogMake => Boolean(make));
  const visibleMakes = search ? filteredMakes : (modelsExpanded ? filteredMakes : featuredMakes);
  const modelList = filteredModelResults;

  return <section className="mx-auto w-full max-w-7xl space-y-7 pb-10">
    <div className="space-y-2">
      <p className="text-sm font-medium uppercase tracking-wide text-primary">{t("eyebrow")}</p>
      <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
      <p className="max-w-3xl text-muted-foreground">{t("subtitle")}</p>
    </div>

    <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
      <button type="button" onClick={resetToMakes} className={!selectedMake ? "font-semibold text-foreground" : "hover:text-foreground"}>{t("catalogCrumb")}</button>
      {selectedMake && <><ChevronDown className="h-3.5 w-3.5 -rotate-90" /><button type="button" onClick={resetToModels} className={!selectedModel ? "font-semibold text-foreground" : "hover:text-foreground"}>{selectedMake}</button></>}
      {selectedModel && <><ChevronDown className="h-3.5 w-3.5 -rotate-90" /><span className="font-semibold text-foreground">{selectedTitle}</span></>}
    </div>

    {(!selectedMake || !selectedModel) && <div className="relative max-w-2xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={!selectedMake ? t("searchMake") : t("searchModel")} aria-label={!selectedMake ? t("searchMake") : t("searchModel")} className="h-11 pl-9" />
    </div>}

    {loading && <p role="status" className="text-sm text-muted-foreground">{t("loading")}</p>}
    {catalogError && <p role="alert" className="text-sm text-red-600">{t("unavailable")}</p>}

    {!loading && !selectedMake && <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
        {visibleMakes.map((make) => <button key={normalize(make.name)} type="button" onClick={() => chooseMake(make.name)} className="flex min-h-9 items-center justify-between gap-2 border-b border-transparent px-1 py-2 text-left text-sm transition-colors hover:border-border hover:text-primary">
          <span className="font-medium">{make.name}</span>
        </button>)}
        {!search && <button type="button" onClick={() => setModelsExpanded((expanded) => !expanded)} className="flex min-h-9 items-center gap-2 px-1 py-2 text-left text-sm font-medium text-primary hover:underline">
          {modelsExpanded ? t("collapseMakes") : t("allMakes")} <ChevronDown className={`h-4 w-4 transition-transform ${modelsExpanded ? "rotate-180" : ""}`} />
        </button>}
      </div>
      {!filteredMakes.length && <p role="status" className="text-sm text-muted-foreground">{t("noMakes")}</p>}
    </div>}

    {!loading && selectedMake && !selectedModel && <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">{t("modelsHeading", { make: selectedMake })}</h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={modelsExpanded ? t("collapseModels") : t("showModels", { count: modelList.length })}
              title={modelsExpanded ? t("collapseModels") : t("showModels", { count: modelList.length })}
              aria-expanded={modelsExpanded}
              onClick={() => setModelsExpanded((expanded) => !expanded)}
              className="h-9 w-9 rounded-lg bg-zinc-100 p-0 text-zinc-900 shadow-sm hover:bg-zinc-200"
            >
              <ChevronDown className={`h-5 w-5 transition-transform ${modelsExpanded ? "rotate-180" : ""}`} strokeWidth={3} />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t("chooseModel")}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={resetToMakes}><ArrowLeft className="h-4 w-4" />{t("allMakes")}</Button>
      </div>

      {modelsExpanded && <div id="vehicle-catalog-model-list" className="space-y-3">
        <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">{t("modelsHeading", { make: selectedMake })}</h3><span className="text-sm text-muted-foreground">{modelList.length}</span></div>
        {modelList.length ? <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3 lg:grid-cols-4">
          {modelList.map(({ model, bmw, specs }) => {
            const years = [...bmw.map((row) => yearOf(row.production_from)), ...specs.map((row) => row.year_from)].filter((year) => year > 0);
            const yearSummary = years.length ? `${Math.min(...years)}–${Math.max(...[...bmw.map((row) => Math.min(currentYear, yearOf(row.production_to))), ...specs.map((row) => row.year_to)])}` : "";
            const versionCount = bmw.length + specs.length;
            return <button key={model.key} type="button" onClick={() => chooseModel(model)} className="group flex min-h-11 items-center justify-between gap-3 border-b border-border/60 px-1 py-2 text-left text-sm transition-colors hover:text-primary">
              <span className="min-w-0"><span className="block truncate font-medium">{model.name}</span>{model.groupTitle && <span className="block text-xs text-muted-foreground">{model.groupTitle}</span>}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{yearSummary || (versionCount ? t("versionsCount", { count: versionCount }) : "")}</span>
            </button>;
          })}
        </div> : <p role="status" className="text-sm text-muted-foreground">{t("noModels")}</p>}
      </div>}

      <Card className="border-0 bg-muted/40 shadow-none">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal className="h-4 w-4" />{t("filtersHeading")}</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1"><Label htmlFor="catalog-body">{t("body")}</Label><select id="catalog-body" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={filters.body} onChange={(event) => setFilter("body", event.target.value)} disabled={!bodyOptions.length}><option value="">{t("anyBody")}</option>{bodyOptions.map((body) => <option key={body.value} value={body.value}>{body.label}</option>)}</select></div>
            <div className="space-y-1"><Label htmlFor="catalog-drive">{t("drive")}</Label><select id="catalog-drive" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={filters.drive} onChange={(event) => setFilter("drive", event.target.value)} disabled={!driveOptions.length}><option value="">{t("anyDrive")}</option>{driveOptions.map((drive) => <option key={drive} value={drive}>{driveLabel(drive)}</option>)}</select></div>
            <div className="space-y-1"><Label>{t("displacementRange")}</Label><div className="grid grid-cols-2 gap-1"><Input aria-label={t("displacementFrom")} type="number" min="0" step="0.1" placeholder={t("from")} value={filters.displacementFrom} onChange={(event) => setFilter("displacementFrom", event.target.value)} disabled={!hasTechnicalSpecs} /><Input aria-label={t("displacementTo")} type="number" min="0" step="0.1" placeholder={t("to")} value={filters.displacementTo} onChange={(event) => setFilter("displacementTo", event.target.value)} disabled={!hasTechnicalSpecs} /></div></div>
            <div className="space-y-1"><Label>{t("powerRange")}</Label><div className="grid grid-cols-2 gap-1"><Input aria-label={t("powerFrom")} type="number" min="0" placeholder={t("from")} value={filters.powerFrom} onChange={(event) => setFilter("powerFrom", event.target.value)} disabled={!hasTechnicalSpecs} /><Input aria-label={t("powerTo")} type="number" min="0" placeholder={t("to")} value={filters.powerTo} onChange={(event) => setFilter("powerTo", event.target.value)} disabled={!hasTechnicalSpecs} /></div></div>
            <div className="space-y-1"><Label>{t("yearRange")}</Label><div className="grid grid-cols-2 gap-1"><Input aria-label={t("yearFrom")} type="number" min="1900" max={currentYear} placeholder={t("from")} value={filters.yearFrom} onChange={(event) => setFilter("yearFrom", event.target.value)} disabled={!hasTechnicalSpecs} /><Input aria-label={t("yearTo")} type="number" min="1900" max={currentYear} placeholder={t("to")} value={filters.yearTo} onChange={(event) => setFilter("yearTo", event.target.value)} disabled={!hasTechnicalSpecs} /></div></div>
            <div className="flex items-end justify-end sm:col-span-2 lg:col-span-3"><Button type="button" variant="outline" className="h-10" onClick={resetFilters}>{t("clearFilters")}</Button></div>
          </div>
          {!hasTechnicalSpecs && <p className="text-xs text-muted-foreground">{t("filtersCoverageNotice")}</p>}
        </CardContent>
      </Card>
    </div>}

    {!loading && selectedMake && selectedModel && <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2"><h2 className="text-3xl font-bold tracking-tight">{selectedMake} {selectedTitle}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">{selectedBmwRows.length ? t("modelSummary", { years: generationYears, count: generationGroups.length }) : t("coverageNotice")}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={resetToModels}><ArrowLeft className="h-4 w-4" />{t("backToModels")}</Button>
      </div>

      <div className="flex gap-5 border-b">
        <button type="button" onClick={() => { setActiveTab("generations"); setSelectedGenerationKey(""); }} className={`border-b-2 px-1 pb-3 text-sm font-medium ${activeTab === "generations" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t("generationsTab")}</button>
        <button type="button" onClick={() => { setActiveTab("specifications"); setSelectedGenerationKey(""); }} className={`border-b-2 px-1 pb-3 text-sm font-medium ${activeTab === "specifications" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t("specificationsTab")}</button>
        <button type="button" onClick={() => { setActiveTab("learned"); setSelectedGenerationKey(""); }} className={`border-b-2 px-1 pb-3 text-sm font-medium ${activeTab === "learned" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t("learnedTab")}</button>
      </div>

      {activeTab === "generations" && <div className="space-y-4">
        <div className="flex items-center justify-between gap-2"><h3 className="text-xl font-semibold">{selectedGeneration ? `${t("generationLabel")} ${selectedGeneration.chassis}` : t("generationHeading")}</h3>{selectedGeneration && <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedGenerationKey("")}><ArrowLeft className="h-4 w-4" />{t("backToGenerations")}</Button>}</div>
        {!selectedGeneration && generationGroups.length > 0 && <div className="grid gap-4 sm:grid-cols-2">{generationGroups.map(generationCard)}</div>}
        {selectedGeneration && <>
          <p className="text-sm text-muted-foreground">{t("chassisLabel")}: {selectedGeneration.chassis} · {selectedGeneration.yearFrom}–{selectedGeneration.yearTo}</p>
          <div className="flex flex-wrap gap-2" aria-label={t("body")}>
            <Button type="button" size="sm" variant={!selectedBodyStyle ? "default" : "outline"} onClick={() => { setSelectedBodyStyle(""); setSelectedTrimId(""); }}>{t("allBodies")}</Button>
            {selectedGenerationBodies.map((body) => {
              const category = bodyCategory(body);
              return <Button key={category} type="button" size="sm" variant={selectedBodyStyle === category ? "default" : "outline"} onClick={() => { setSelectedBodyStyle(category); setSelectedTrimId(""); }}>{bodyLabel(body)}</Button>;
            })}
          </div>
          <div className="space-y-3">
            <h4 className="text-lg font-semibold">{t("trimTitle")}</h4>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground"><tr>
                  <th className="px-4 py-3 font-medium">{t("trim")}</th><th className="px-4 py-3 font-medium">{t("engine")}</th><th className="px-4 py-3 font-medium">{t("displacement")}</th><th className="px-4 py-3 font-medium">{t("power")}</th><th className="px-4 py-3 font-medium">{t("drive")}</th>
                </tr></thead>
                <tbody className="divide-y">
                  {selectedGenerationTrims.map((entry) => <tr key={entry.id} className={selectedTrimId === entry.id ? "bg-primary/5" : "hover:bg-muted/30"}>
                    <td className="px-4 py-3"><button type="button" onClick={() => setSelectedTrimId(selectedTrimId === entry.id ? "" : entry.id)} className="font-semibold text-primary hover:underline">{entry.version || entry.model || t("standardVersion")}</button><span className="mt-0.5 block text-xs text-muted-foreground">{bodyLabel(entry.body)}</span></td>
                    <td className="px-4 py-3">{entry.engine_code || "—"}</td><td className="px-4 py-3">{entry.engine_cc ? `${(entry.engine_cc / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} L` : t("notAvailable")}</td><td className="px-4 py-3">{entry.power_ps.toLocaleString(locale)} PS</td><td className="px-4 py-3">{driveLabel(entry.drive)}</td>
                  </tr>)}
                  {!selectedGenerationTrims.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">{t("noTrims")}</td></tr>}
                </tbody>
              </table>
            </div>
            {selectedTrim && <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h5 className="font-semibold">{selectedTrim.version || selectedTrim.model || t("standardVersion")}</h5><p className="text-sm text-muted-foreground">{selectedTrim.engine_code} · {selectedTrim.engine_cc ? `${selectedTrim.engine_cc.toLocaleString(locale)} cc` : t("notAvailable")} · {selectedTrim.power_ps.toLocaleString(locale)} PS · {driveLabel(selectedTrim.drive)}</p></div><a href={selectedTrim.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-4">{selectedTrim.source_title} <ExternalLink className="h-3.5 w-3.5" /></a></CardContent></Card>}
          </div>
        </>}
        {!generationGroups.length && <Card><CardContent className="p-6"><p className="font-medium">{t("generationsComing")}</p><p className="mt-1 text-sm text-muted-foreground">{t("coverageNotice")}</p></CardContent></Card>}
      </div>}

      {activeTab === "specifications" && <div className="grid gap-4 lg:grid-cols-2">
        {selectedBmwRows.length ? selectedBmwRows.slice(0, 24).map(bmwCard) : selectedSpecRows.length ? selectedSpecRows.map((entry) => <Card key={entry.id}><CardContent className="space-y-2 p-4"><div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{entry.model} · {entry.modification}</h3><span className="text-xs text-emerald-700">{t("sourceVerified", { date: entry.verified_on })}</span></div><p className="text-sm text-muted-foreground">{entry.year_from}–{entry.year_to} · {entry.market}</p><p className="text-sm">{entry.fuel} · {entry.drive} · {entry.engine_cc ? `${entry.engine_cc.toLocaleString(locale)} cc` : `${entry.engine_liters} L`} · {entry.horse_power} PS</p><a href={entry.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline">{entry.source_title} <ExternalLink className="h-3.5 w-3.5" /></a></CardContent></Card>) : <Card className="lg:col-span-2"><CardContent className="p-6"><p className="font-medium">{t("specsComing")}</p><p className="mt-1 text-sm text-muted-foreground">{t("coverageNotice")}</p></CardContent></Card>}
      </div>}
      {activeTab === "learned" && <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("learnedDescription")}</p>
        {selectedLearnedRows.length ? <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground"><tr>
              <th className="px-4 py-3 font-medium">{t("year")}</th><th className="px-4 py-3 font-medium">{t("displacement")}</th><th className="px-4 py-3 font-medium">{t("powertrain")}</th><th className="px-4 py-3 font-medium">{t("power")}</th><th className="px-4 py-3 font-medium">{t("calculationCount")}</th><th className="px-4 py-3 font-medium">{t("lastSaved")}</th>
            </tr></thead>
            <tbody className="divide-y">{selectedLearnedRows.map((row) => {
              const isElectric = row.powertrain_kind === "EV" || row.powertrain_kind === "SERIES_HYBRID";
              const power = isElectric ? row.electric_power_kw : row.horse_power;
              const powerText = row.status === "CONFLICT"
                ? `${t("powerConflict")}: ${row.power_options.map((value) => `${value} ${isElectric ? "kW" : "hp"}`).join(" / ")}`
                : power !== null ? `${power} ${isElectric ? "kW" : "hp"}` : t("powerUnavailable");
              return <tr key={`${row.year}-${row.engine_volume_cc}-${row.powertrain_kind}`}>
                <td className="px-4 py-3">{row.year}</td><td className="px-4 py-3">{row.engine_volume_cc ? `${row.engine_volume_cc.toLocaleString(locale)} cc` : t("notAvailable")}</td><td className="px-4 py-3">{powertrainLabel(row.powertrain_kind)}</td><td className="px-4 py-3 font-medium">{powerText}</td><td className="px-4 py-3">{row.observation_count}</td><td className="px-4 py-3">{new Date(row.latest_at).toLocaleDateString(locale)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div> : <Card><CardContent className="p-6"><p className="font-medium">{t("noLearnedData")}</p><p className="mt-1 text-sm text-muted-foreground">{t("learnedDescription")}</p></CardContent></Card>}
      </div>}
      <p className="text-xs text-muted-foreground">{t("coverageNotice")}</p>
    </div>}
  </section>;
}
