"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Link2, RotateCcw, ScanLine, X } from "lucide-react";
import { api, apiErrorMessage } from "@/lib/api";
import type { CalculatorRequest, CalculatorResult, CarListing, DealVehicleSnapshot, LearnedVehiclePowerLookup, PowertrainKind, VinDecodeResult } from "@/lib/types";
import { parseManufactureMonth } from "@/lib/manufacture-date";
import { BmwVariantPicker, type BmwVariant } from "./BmwVariantPicker";
import { CalculatorResults } from "./CalculatorResults";
import { CurrencyRatesWidget } from "./CurrencyRatesWidget";
import { ShareDealButton } from "./ShareDealButton";
import { ManufactureDateInput } from "./ManufactureDateInput";
import { TeslaPowerPicker, type TeslaPowerVariant } from "./TeslaPowerPicker";
import type { MyAutoCatalogEntry } from "@/lib/myauto-catalog";
import { getVehicleCatalog } from "@/lib/vehicle-catalog";

const currentYear = new Date().getFullYear();
const manufactureYears = Array.from({ length: currentYear - 1989 }, (_, index) => currentYear - index);

interface CalculationSnapshot {
  request: CalculatorRequest;
  vehicle: DealVehicleSnapshot;
}

const uiCopy = {
  ru: {
    myAutoLabel: "Ссылка или ID объявления MyAuto",
    myAutoPlaceholder: "https://www.myauto.ge/.../pr/123673764 или 123673764",
    myAutoError: "Не удалось загрузить авто. Проверьте ссылку или ID объявления.",
    vinCompare: { mismatch: "Данные NHTSA vPIC отличаются от объявления:", listing: "объявление", nhtsa: "NHTSA", year: "год", displacement: "объём", power: "мощность" },
    learnedPowerFilled: "Мощность подставлена из предыдущего расчёта для точного совпадения автомобиля.",
    learnedPowerConflict: "В предыдущих расчётах для этого точного совпадения указаны разные значения мощности. Введите значение по документам.",
    marketHint: "Если известны марка и модель, MileON может запросить официальную оценку похожих объявлений в РФ.",
    reset: "Сбросить расчёт",
    bmwPicker: { button: "Выбрать версию BMW", title: "Версия и комплектация BMW", model: "Модель из каталога", year: "Год", bodySelect: "Кузов", variant: "Комплектация", choose: "Выберите", apply: "Подставить характеристики", close: "Закрыть", loading: "Загружаем каталог BMW…", unavailable: "Не удалось загрузить каталог версий BMW.", empty: "Для этой модели и года версии не найдены.", yearNotSpecifiedNotice: "В исходной строке годы выпуска не указаны. Совпадение с выбранным годом проверьте по документам.", missingDisplacement: "Объём не подтверждён для этой версии; введите его по документам автомобиля.", power: "Мощность", displacement: "Объём", source: "Источник", bodyCoupe: "Купе", bodyConvertible: "Кабриолет", bodyGranCoupe: "Gran Coupe", standardVersion: "Стандартная версия", competitionVersion: "Пакет Competition", horsepowerUnit: "л.с.", kilowattUnit: "кВт", displacementUnit: "см³", rearDrive: "Задний привод", allDrive: "Полный привод" },
  },
  en: {
    myAutoLabel: "MyAuto listing link or ID",
    myAutoPlaceholder: "https://www.myauto.ge/.../pr/123673764 or 123673764",
    myAutoError: "Could not load the car. Check the listing link or ID.",
    vinCompare: { mismatch: "NHTSA vPIC data differs from the listing:", listing: "listing", nhtsa: "NHTSA", year: "year", displacement: "displacement", power: "power" },
    learnedPowerFilled: "Power was filled from a previous calculation with an exact vehicle match.",
    learnedPowerConflict: "Previous calculations contain different power values for this exact match. Enter the value from the vehicle documents.",
    marketHint: "When make and model are known, MileON can request an official appraisal of comparable listings in Russia.",
    reset: "Reset calculation",
    bmwPicker: { button: "Choose BMW version", title: "BMW version and trim", model: "Model from catalogue", year: "Year", bodySelect: "Body style", variant: "Trim", choose: "Choose", apply: "Apply specifications", close: "Close", loading: "Loading BMW catalogue…", unavailable: "Could not load BMW versions.", empty: "No versions found for this model and year.", yearNotSpecifiedNotice: "The source row does not specify production years. Check applicability to the selected year against vehicle documents.", missingDisplacement: "Displacement is not confirmed for this version; enter it from the vehicle documents.", power: "Power", displacement: "Displacement", source: "Source", bodyCoupe: "Coupe", bodyConvertible: "Convertible", bodyGranCoupe: "Gran Coupe", standardVersion: "Standard", competitionVersion: "Competition Package", horsepowerUnit: "PS", kilowattUnit: "kW", displacementUnit: "cc", rearDrive: "Rear-wheel drive", allDrive: "All-wheel drive" },
  },
  ka: {
    myAutoLabel: "MyAuto განცხადების ბმული ან ID",
    myAutoPlaceholder: "https://www.myauto.ge/.../pr/123673764 ან 123673764",
    myAutoError: "ავტომობილის ჩატვირთვა ვერ მოხერხდა. შეამოწმეთ განცხადების ბმული ან ID.",
    vinCompare: { mismatch: "NHTSA vPIC-ის მონაცემები განცხადების მონაცემებს არ ემთხვევა:", listing: "განცხადება", nhtsa: "NHTSA", year: "წელი", displacement: "მოცულობა", power: "სიმძლავრე" },
    learnedPowerFilled: "სიმძლავრე შევსებულია წინა გამოთვლიდან ზუსტად დამთხვევადი ავტომობილისთვის.",
    learnedPowerConflict: "ზუსტად დამთხვევადი ავტომობილის წინა გამოთვლებში სიმძლავრის სხვადასხვა მნიშვნელობაა. შეიყვანეთ მონაცემი ავტომობილის დოკუმენტებიდან.",
    marketHint: "თუ მარკა და მოდელი ცნობილია, MileON-ს შეუძლია მოითხოვოს რუსეთში მსგავსი განცხადებების ოფიციალური შეფასება.",
    reset: "გამოთვლის გასუფთავება",
    bmwPicker: { button: "BMW ვერსიის არჩევა", title: "BMW ვერსია და კომპლექტაცია", model: "კატალოგის მოდელი", year: "წელი", bodySelect: "ძარის ტიპი", variant: "კომპლექტაცია", choose: "აირჩიეთ", apply: "მონაცემების გამოყენება", close: "დახურვა", loading: "BMW კატალოგის ჩატვირთვა…", unavailable: "BMW ვერსიების კატალოგის ჩატვირთვა ვერ მოხერხდა.", empty: "ამ მოდელისა და წლის ვერსიები ვერ მოიძებნა.", yearNotSpecifiedNotice: "წყაროს ჩანაწერში გამოშვების წლები მითითებული არ არის. გადაამოწმეთ არჩეულ წელთან შესაბამისობა დოკუმენტებით.", missingDisplacement: "ამ ვერსიის მოცულობა დადასტურებული არ არის; შეიყვანეთ ავტომობილის დოკუმენტებიდან.", power: "სიმძლავრე", displacement: "მოცულობა", source: "წყარო", bodyCoupe: "კუპე", bodyConvertible: "კაბრიოლეტი", bodyGranCoupe: "Gran Coupe", standardVersion: "სტანდარტული ვერსია", competitionVersion: "Competition პაკეტი", horsepowerUnit: "PS", kilowattUnit: "kW", displacementUnit: "სმ³", rearDrive: "უკანა წამყვანი", allDrive: "სრული წამყვანი" },
  },
} as const;

export function Calculator() {
  const qc = useQueryClient();
  const t = useTranslations("calculator");
  const tErr = useTranslations("errors");
  const errorMessages = { rateLimited: tErr("rateLimited"), payloadTooLarge: tErr("payloadTooLarge"), temporarilyUnavailable: tErr("temporarilyUnavailable") };
  const locale = useLocale();
  const copy = uiCopy[locale as keyof typeof uiCopy] ?? uiCopy.en;
  const [carSource, setCarSource] = useState("");
  const [vin, setVin] = useState("");
  const [loadedCar, setLoadedCar] = useState<CarListing | null>(null);
  const [decodedVin, setDecodedVin] = useState<VinDecodeResult | null>(null);
  const [calculation, setCalculation] = useState<(CalculationSnapshot & { result: CalculatorResult }) | null>(null);
  const [catalogRows, setCatalogRows] = useState<MyAutoCatalogEntry[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<"loading" | "ready" | "error">("loading");
  const [learnedPowerLookupRevision, setLearnedPowerLookupRevision] = useState(0);
  const [selectedMakeId, setSelectedMakeId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [manualCatalogSelection, setManualCatalogSelection] = useState(false);
  const [correctedModel, setCorrectedModel] = useState<string | null>(null);
  const [selectedBmwVariant, setSelectedBmwVariant] = useState<BmwVariant | null>(null);
  const [pendingBmwPicker, setPendingBmwPicker] = useState(false);
  const [selectedTeslaVariant, setSelectedTeslaVariant] = useState<TeslaPowerVariant | null>(null);
  const [pendingTeslaPicker, setPendingTeslaPicker] = useState(false);

  useEffect(() => {
    let active = true;
    getVehicleCatalog()
      .then((catalog) => {
        const rows = catalog.make_model_records.map((row) => ({
          makeId: row.make_id,
          make: row.make,
          modelId: row.model_id,
          model: row.model,
          groupTitle: row.group_title,
        }));
        if (!rows.length) throw new Error("MyAuto catalog is empty");
        if (active) {
          setCatalogRows(rows);
          setCatalogStatus("ready");
        }
      })
      .catch(() => {
        if (active) setCatalogStatus("error");
      });
    return () => { active = false; };
  }, []);

  const makeOptions = useMemo(() => {
    const makes = new Map<number, string>();
    catalogRows.forEach((row) => makes.set(row.makeId, row.make));
    return [...makes].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title, locale));
  }, [catalogRows, locale]);

  const modelOptions = useMemo(() => catalogRows
    .filter((row) => row.makeId === Number(selectedMakeId) && row.modelId !== null)
    .sort((a, b) => a.model.localeCompare(b.model, locale) || a.groupTitle.localeCompare(b.groupTitle, locale)),
  [catalogRows, selectedMakeId, locale]);

  const selectedMake = makeOptions.find((make) => make.id === Number(selectedMakeId));
  const selectedModel = modelOptions.find((model) => model.modelId === Number(selectedModelId));
  const currentMakeName = selectedMake?.title ?? loadedCar?.make ?? decodedVin?.make ?? "";

  function selectCatalogVehicle(makeName?: string | null, modelName?: string | null) {
    const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const make = makeOptions.find((item) => normalize(item.title) === normalize(makeName ?? ""));
    setSelectedMakeId(make ? String(make.id) : "");
    const model = make && modelName
      ? catalogRows.find((item) => item.makeId === make.id && item.modelId !== null && normalize(item.model) === normalize(modelName))
      : undefined;
    setSelectedModelId(model?.modelId ? String(model.modelId) : "");
  }

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
      const isoDate = parseManufactureMonth(data.manufacture_date);
      if (!isoDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["manufacture_date"], message: t("manufactureDateFormatError") });
      } else if (Number(isoDate.slice(0, 4)) !== data.car_year) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["manufacture_date"], message: t("manufactureDateYearError") });
      } else if (new Date(`${isoDate}T00:00:00`) > new Date()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["manufacture_date"], message: t("manufactureDateFutureError") });
      }
    }
  });

  type FormData = z.infer<typeof schema>;
  const { register, control, handleSubmit, formState: { errors }, reset, setValue, getValues, watch } = useForm<FormData>({
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
  const vehicleYear = Number(watch("car_year"));
  const horsePowerValue = watch("horse_power");
  const electricPowerValue = watch("electric_power_kw");
  const engineVolumeValue = Number(watch("engine_volume_cc"));
  const autoMarketComparison = watch("auto_market_comparison");
  const usesElectricRegulatoryPower = powertrainKind === "EV" || powertrainKind === "SERIES_HYBRID";
  const modelForPicker = selectedModel?.model ?? loadedCar?.model ?? decodedVin?.model ?? "";
  const learnedMake = currentMakeName.trim();
  const learnedModel = (correctedModel ?? (manualCatalogSelection ? selectedModel?.model : loadedCar?.model ?? decodedVin?.model) ?? "").trim();
  const learnedPowerKey = [learnedMake, learnedModel, vehicleYear, engineVolumeValue, powertrainKind].join("|");
  const activePowerValue = usesElectricRegulatoryPower ? electricPowerValue : horsePowerValue;
  const activePowerIsMissing = activePowerValue == null || Number(activePowerValue) <= 0;
  const learnedEngineVolumeIsValid = powertrainKind === "EV" ? engineVolumeValue === 0 : engineVolumeValue > 0;
  const learnedPowerQuery = useQuery<LearnedVehiclePowerLookup>({
    queryKey: ["learned-power", learnedMake, learnedModel, vehicleYear, engineVolumeValue, powertrainKind, learnedPowerLookupRevision],
    queryFn: () => api.get<LearnedVehiclePowerLookup>("/cars/learned-power", {
      params: {
        make: learnedMake,
        model: learnedModel,
        car_year: vehicleYear,
        engine_volume_cc: engineVolumeValue,
        powertrain_kind: powertrainKind,
      },
    }).then((response) => response.data),
    enabled: Boolean(learnedMake && learnedModel && vehicleYear >= 1900 && learnedEngineVolumeIsValid
      && powertrainKind && activePowerIsMissing),
    // A successful calculation can add a matching observation seconds before
    // another listing is loaded. Do not reuse a recent NOT_FOUND result.
    staleTime: 0,
  });
  const handledLearnedPowerNotice = useRef<string | null>(null);

  useEffect(() => {
    const match = learnedPowerQuery.data;
    if (!match) return;
    if (match.status === "MATCH") {
      let filled = false;
      if (match.horse_power != null && (horsePowerValue == null || Number(horsePowerValue) <= 0) && !usesElectricRegulatoryPower) {
        setValue("horse_power", match.horse_power, { shouldValidate: true });
        filled = true;
      } else if (match.electric_power_kw != null && (electricPowerValue == null || Number(electricPowerValue) <= 0) && usesElectricRegulatoryPower) {
        setValue("electric_power_kw", match.electric_power_kw, { shouldValidate: true });
        filled = true;
      } else {
        return;
      }
      if (filled && handledLearnedPowerNotice.current !== learnedPowerKey) {
        toast.success(copy.learnedPowerFilled);
      }
      handledLearnedPowerNotice.current = learnedPowerKey;
    } else if (match.status === "CONFLICT" && handledLearnedPowerNotice.current !== learnedPowerKey) {
      handledLearnedPowerNotice.current = learnedPowerKey;
      toast.warning(copy.learnedPowerConflict);
    }
  }, [copy.learnedPowerConflict, copy.learnedPowerFilled, electricPowerValue, horsePowerValue, learnedPowerKey, learnedPowerQuery.data, setValue, usesElectricRegulatoryPower]);

  useEffect(() => {
    if (selectedTeslaVariant) {
      setValue("electric_power_kw", selectedTeslaVariant.power_kw, { shouldDirty: true, shouldValidate: true });
    }
  }, [selectedTeslaVariant, setValue]);

  async function applyLearnedPowerFromListing(car: CarListing) {
    const powertrain = car.powertrain_kind ?? "ICE";
    const usesElectricRegulatoryPower = powertrain === "EV" || powertrain === "SERIES_HYBRID";
    const listingPower = usesElectricRegulatoryPower ? car.electric_power_kw : car.horse_power;
    if (listingPower != null && listingPower > 0) return;
    const engineVolume = powertrain === "EV" ? 0 : car.engine_volume_cc;
    const make = car.make.trim();
    const model = car.model.trim();
    if (!make || !model || car.year < 1900 || (powertrain !== "EV" && engineVolume <= 0)) return;

    const powerKey = [make, model, car.year, engineVolume, powertrain].join("|");
    try {
      const { data: match } = await api.get<LearnedVehiclePowerLookup>("/cars/learned-power", {
        params: {
          make,
          model,
          car_year: car.year,
          engine_volume_cc: engineVolume,
          powertrain_kind: powertrain,
        },
      });

      if (match.status === "CONFLICT") {
        if (handledLearnedPowerNotice.current !== powerKey) toast.warning(copy.learnedPowerConflict);
        handledLearnedPowerNotice.current = powerKey;
        return;
      }
      if (match.status !== "MATCH") return;

      if (usesElectricRegulatoryPower) {
        const currentPower = getValues("electric_power_kw");
        if (match.electric_power_kw == null || (currentPower != null && Number(currentPower) > 0)) return;
        setValue("electric_power_kw", match.electric_power_kw, { shouldValidate: true });
      } else {
        const currentPower = getValues("horse_power");
        if (match.horse_power == null || (currentPower != null && Number(currentPower) > 0)) return;
        setValue("horse_power", match.horse_power, { shouldValidate: true });
      }

      if (handledLearnedPowerNotice.current !== powerKey) toast.success(copy.learnedPowerFilled);
      handledLearnedPowerNotice.current = powerKey;
    } catch {
      // Learned power is an optional helper; a lookup failure must not undo a loaded listing.
    }
  }

  useEffect(() => {
    if (currentMakeName.trim().toLowerCase() === "bmw" && modelForPicker && vehicleYear >= 2000
      && !usesElectricRegulatoryPower && (horsePowerValue == null || Number(horsePowerValue) <= 0)) {
      setPendingBmwPicker(true);
    }
  }, [currentMakeName, horsePowerValue, modelForPicker, usesElectricRegulatoryPower, vehicleYear]);

  const urlMutation = useMutation({
    mutationFn: (source: string) => api.post<CarListing>("/cars/from-url", { url: source }).then((r) => r.data),
    onSuccess: (car) => {
      handledLearnedPowerNotice.current = null;
      setLearnedPowerLookupRevision((revision) => revision + 1);
      setCalculation(null);
      setDecodedVin(null);
      setVin("");
      setLoadedCar(car);
      setCorrectedModel(null);
      setSelectedBmwVariant(null);
      setSelectedTeslaVariant(null);
      setPendingBmwPicker(false);
      setPendingTeslaPicker(car.make.trim().toLowerCase() === "tesla" && Boolean(car.year));
      setManualCatalogSelection(false);
      selectCatalogVehicle(car.make, car.model);
      setValue("car_price_usd", car.price_usd);
      setValue("engine_volume_cc", car.powertrain_kind === "EV" ? 0 : car.engine_volume_cc);
      setValue("car_year", car.year);
      setValue("manufacture_date", null);
      setValue("mileage_km", car.mileage_km ?? null);
      setValue("horse_power", car.powertrain_kind === "EV" || car.powertrain_kind === "SERIES_HYBRID" ? null : car.horse_power ?? null);
      setValue("electric_power_kw", car.electric_power_kw ?? null);
      setValue("powertrain_kind", car.powertrain_kind ?? "ICE");
      void applyLearnedPowerFromListing(car);
      toast.success(t("urlLoaded", { make: car.make, model: car.model, year: car.year }));
    },
    onError: (error) => toast.error(apiErrorMessage(error, copy.myAutoError, errorMessages)),
  });

  const vinMutation = useMutation({
    mutationFn: (value: string) => api.post<VinDecodeResult>("/cars/from-vin", { vin: value }).then((r) => r.data),
    onMutate: () => setDecodedVin(null),
    onSuccess: (vehicle) => {
      if (vehicle.status === "NOT_FOUND" || vehicle.status === "PROVIDER_ERROR") {
        setDecodedVin(null);
        toast.error(vehicle.error_text ?? t("vinDecodeError"));
        return;
      }

      handledLearnedPowerNotice.current = null;
      setLearnedPowerLookupRevision((revision) => revision + 1);
      setCalculation(null);
      setManualCatalogSelection(false);
      selectCatalogVehicle(vehicle.make, vehicle.model);
      const identity = (value: string | null | undefined) => (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const matchesListing = loadedCar && identity(loadedCar.make) === identity(vehicle.make)
        && identity(loadedCar.model) === identity(vehicle.model);
      if (loadedCar && !matchesListing) {
        setLoadedCar(null);
        setCarSource("");
        setValue("car_price_usd", 0);
        setValue("mileage_km", null);
      }

      const listingDifferences: string[] = [];
      if (matchesListing && loadedCar) {
        if (vehicle.model_year != null && loadedCar.year !== vehicle.model_year) {
          listingDifferences.push(`${copy.vinCompare.year}: ${copy.vinCompare.listing} ${loadedCar.year}, ${copy.vinCompare.nhtsa} ${vehicle.model_year}`);
        }
        if (vehicle.displacement_cc != null && vehicle.displacement_cc > 0
          && loadedCar.engine_volume_cc > 0 && loadedCar.engine_volume_cc !== vehicle.displacement_cc) {
          listingDifferences.push(`${copy.vinCompare.displacement}: ${copy.vinCompare.listing} ${loadedCar.engine_volume_cc} ${copy.bmwPicker.displacementUnit}, ${copy.vinCompare.nhtsa} ${vehicle.displacement_cc} ${copy.bmwPicker.displacementUnit}`);
        }
        if (vehicle.powertrain_kind !== "EV" && vehicle.powertrain_kind !== "SERIES_HYBRID"
          && vehicle.horse_power != null && loadedCar.horse_power != null
          && loadedCar.horse_power !== vehicle.horse_power) {
          listingDifferences.push(`${copy.vinCompare.power}: ${copy.vinCompare.listing} ${loadedCar.horse_power} ${copy.bmwPicker.horsepowerUnit}, ${copy.vinCompare.nhtsa} ${vehicle.horse_power} ${copy.bmwPicker.horsepowerUnit}`);
        }
      }

      setDecodedVin(vehicle);
      setCorrectedModel(null);
      setSelectedBmwVariant(null);
      setSelectedTeslaVariant(null);
      setPendingBmwPicker(false);
      setPendingTeslaPicker(vehicle.make?.trim().toLowerCase() === "tesla" && Boolean(vehicle.model_year));
      setVin(vehicle.vin);
      setValue("car_year", matchesListing && loadedCar ? loadedCar.year : vehicle.model_year ?? loadedCar?.year ?? 0);
      setValue("manufacture_date", null);
      const resolvedPowertrain = vehicle.powertrain_kind ?? (matchesListing ? loadedCar?.powertrain_kind : null) ?? "ICE";
      const listingEngineVolume = matchesListing && loadedCar && loadedCar.engine_volume_cc > 0
        ? loadedCar.engine_volume_cc
        : null;
      setValue("engine_volume_cc", resolvedPowertrain === "EV" ? 0 : listingEngineVolume ?? vehicle.displacement_cc ?? 0);
      setValue("powertrain_kind", resolvedPowertrain);
      if (resolvedPowertrain === "EV" || resolvedPowertrain === "SERIES_HYBRID") {
        setValue("horse_power", null);
        setValue("electric_power_kw", vehicle.electric_power_kw ?? (matchesListing ? loadedCar?.electric_power_kw : null) ?? null);
      } else {
        const listingHorsePower = matchesListing && loadedCar?.horse_power != null ? loadedCar.horse_power : null;
        setValue("horse_power", listingHorsePower ?? vehicle.horse_power ?? null);
        setValue("electric_power_kw", null);
      }

      if (listingDifferences.length) {
        toast.warning(`${copy.vinCompare.mismatch} ${listingDifferences.join("; ")}`);
      } else if (vehicle.status === "PARTIAL") {
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
    onSuccess: (result, snapshot) => {
      setCalculation({ ...snapshot, result });
      void qc.invalidateQueries({ queryKey: ["learned-power"] });
    },
    onError: (error) => toast.error(apiErrorMessage(error, tErr("generic"), errorMessages)),
  });

  const saveMutation = useMutation({
    mutationFn: (data: CalculatorRequest) => api.post("/history/", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["learned-power"] });
      toast.success(t("saved"));
    },
    onError: (error) => toast.error(apiErrorMessage(error, tErr("generic"), errorMessages)),
  });

  function resetCalculator() {
    handledLearnedPowerNotice.current = null;
    setLearnedPowerLookupRevision((revision) => revision + 1);
    setCarSource("");
    setVin("");
    setLoadedCar(null);
    setDecodedVin(null);
    setCalculation(null);
    setSelectedMakeId("");
    setSelectedModelId("");
    setManualCatalogSelection(false);
    setCorrectedModel(null);
    setSelectedBmwVariant(null);
    setSelectedTeslaVariant(null);
    setPendingBmwPicker(false);
    setPendingTeslaPicker(false);
    reset();
    urlMutation.reset();
    vinMutation.reset();
    calcMutation.reset();
    saveMutation.reset();
  }

  function onSubmit(data: FormData) {
    const electricRegulatoryPower = data.powertrain_kind === "EV" || data.powertrain_kind === "SERIES_HYBRID";
    const payload: CalculatorRequest = {
      ...data,
      manufacture_date: data.manufacture_date ? parseManufactureMonth(data.manufacture_date) : null,
      horse_power: electricRegulatoryPower ? null : data.horse_power ?? null,
      electric_power_kw: electricRegulatoryPower ? data.electric_power_kw ?? null : null,
      mileage_km: data.mileage_km ?? null,
      engine_volume_cc: data.powertrain_kind === "EV" ? 0 : data.engine_volume_cc,
      powertrain_kind: data.powertrain_kind as PowertrainKind,
      is_personal_use: true,
      source_make: manualCatalogSelection ? selectedMake?.title ?? null : loadedCar?.make ?? decodedVin?.make ?? null,
      source_model: correctedModel ?? (manualCatalogSelection ? selectedModel?.model ?? null : loadedCar?.model ?? decodedVin?.model ?? null),
      source_trim: selectedBmwVariant
        ? [selectedBmwVariant.version, selectedBmwVariant.chassis, selectedBmwVariant.engine_code].filter(Boolean).join(" · ")
        : selectedTeslaVariant?.version ?? ([decodedVin?.trim, decodedVin?.trim_secondary].filter(Boolean).join(" ") || null),
      source_url: loadedCar?.url ?? null,
      source_model_id: correctedModel ? null : manualCatalogSelection ? selectedModel?.modelId ?? null : loadedCar?.model_id ?? null,
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
                  {loadedCar.horse_power != null && (
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
                <div data-testid="vin-result" className={`space-y-2 rounded-md border p-2 text-sm ${decodedVin.status === "PARTIAL" ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{decodedVin.make} {decodedVin.model} {decodedVin.model_year}</span>
                    {decodedVin.series && <Badge variant="outline">{t("vinSeries")}: {decodedVin.series}</Badge>}
                    {decodedVin.displacement_l != null && decodedVin.powertrain_kind !== "EV" && <Badge variant="outline">{decodedVin.displacement_l.toFixed(1)} L</Badge>}
                    {decodedVin.horse_power != null && (
                      <Badge variant="outline">
                        {Math.round(decodedVin.horse_power)} hp{decodedVin.powertrain_kind === "EV" ? ` · ${t("referenceOnly")}` : ""}
                      </Badge>
                    )}
                    {decodedVin.fuel_type && <Badge variant="outline">{decodedVin.fuel_type}</Badge>}
                    <span className="text-xs text-muted-foreground ml-auto">{decodedVin.source}</span>
                    <button type="button" onClick={() => { setDecodedVin(null); setVin(""); }}><X className="h-4 w-4 text-gray-400 hover:text-gray-700" /></button>
                  </div>
                  {decodedVin.trim && (
                    <>
                      <dl data-testid="vin-trim" className="space-y-1 border-t pt-2">
                        <div className="min-w-0">
                          <dt className="text-xs text-muted-foreground">{t("vinTrim")}</dt>
                          <dd className="break-words font-medium" data-testid="vin-trim-value">{[decodedVin.trim, decodedVin.trim_secondary].filter(Boolean).join(" / ")}</dd>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <dt className="inline">{t("vinTrimSource")}: </dt>
                          <dd className="inline">{decodedVin.trim_source === "VIN_PATTERN" ? t("vinTrimFromPattern") : "NHTSA vPIC"}</dd>
                        </div>
                      </dl>
                      <p className="text-xs text-muted-foreground">{t("vinTrimHint")}</p>
                    </>
                  )}
                  {decodedVin.status === "PARTIAL" && (
                    <div className="flex gap-2 text-xs text-amber-900">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>{decodedVin.powertrain_kind === "EV" || decodedVin.powertrain_kind === "SERIES_HYBRID" ? t("electricPowerHint") : t("vinHint")}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid min-w-0 gap-4 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2 md:col-span-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="calculator-make">{t("vehicleMake")}</Label>
                <select
                  id="calculator-make"
                  className="flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={selectedMakeId}
                  disabled={catalogStatus !== "ready"}
                  onChange={(event) => {
                    const nextMakeId = event.target.value;
                    const nextMake = makeOptions.find((make) => String(make.id) === nextMakeId)?.title;
                    setSelectedMakeId(nextMakeId);
                    setSelectedModelId("");
                    setCorrectedModel(null);
                    setSelectedBmwVariant(null);
                    setSelectedTeslaVariant(null);
                    setPendingBmwPicker(false);
                    setPendingTeslaPicker(false);
                    setManualCatalogSelection(Boolean(event.target.value));
                    setCalculation(null);
                    if (nextMake?.trim().toLowerCase() === "bmw") {
                      setValue("horse_power", null);
                      setValue("electric_power_kw", null);
                      setValue("engine_volume_cc", 0);
                      setValue("powertrain_kind", "ICE");
                    } else if (nextMake?.trim().toLowerCase() === "tesla") {
                      setValue("horse_power", null);
                      setValue("electric_power_kw", null);
                      setValue("engine_volume_cc", 0);
                      setValue("powertrain_kind", "EV");
                    } else {
                      setValue("horse_power", null);
                      setValue("electric_power_kw", null);
                      setValue("engine_volume_cc", 0);
                      setValue("powertrain_kind", "ICE");
                    }
                  }}
                >
                  <option value="">{catalogStatus === "loading" ? t("catalogLoading") : t("chooseMake")}</option>
                  {makeOptions.map((make) => <option key={make.id} value={String(make.id)}>{make.title}</option>)}
                </select>
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="calculator-model">{t("vehicleModel")}</Label>
                <select
                  id="calculator-model"
                  className="flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={selectedModelId}
                  disabled={catalogStatus !== "ready" || !selectedMakeId || modelOptions.length === 0}
                  onChange={(event) => {
                    setSelectedModelId(event.target.value);
                    setCorrectedModel(null);
                    setSelectedBmwVariant(null);
                  setSelectedTeslaVariant(null);
                    const isBmw = currentMakeName.trim().toLowerCase() === "bmw";
                    const isTesla = currentMakeName.trim().toLowerCase() === "tesla";
                    setPendingBmwPicker(isBmw && Boolean(event.target.value));
                  setPendingTeslaPicker(isTesla && Boolean(event.target.value));
                    setCalculation(null);
                    if (isBmw) {
                      setValue("horse_power", null);
                      setValue("engine_volume_cc", 0);
                      setValue("powertrain_kind", "ICE");
                    } else if (isTesla) {
                      setValue("horse_power", null);
                      setValue("electric_power_kw", null);
                      setValue("engine_volume_cc", 0);
                      setValue("powertrain_kind", "EV");
                    }
                  }}
                >
                  <option value="">{selectedMakeId && modelOptions.length === 0 ? t("noModels") : t("chooseModel")}</option>
                  {modelOptions.map((model) => (
                    <option key={model.modelId} value={model.modelId!}>
                      {model.groupTitle && model.groupTitle !== model.model ? `${model.model} · ${model.groupTitle}` : model.model}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">{t("vehicleSelectionHint")}</p>
              {currentMakeName.trim().toLowerCase() === "bmw" && <div className="sm:col-span-2">
                <BmwVariantPicker
                  make={currentMakeName}
                  model={selectedModel?.model ?? loadedCar?.model ?? decodedVin?.model ?? ""}
                  year={vehicleYear}
                  disabled={calcMutation.isPending || urlMutation.isPending || vinMutation.isPending}
                  copy={copy.bmwPicker}
                  autoOpen={pendingBmwPicker}
                  onAutoOpenHandled={() => setPendingBmwPicker(false)}
                  onApply={(variant: BmwVariant, year: number) => {
                    setSelectedBmwVariant(variant);
                    setCorrectedModel(variant.model);
                    setValue("car_year", year, { shouldValidate: true });
                    setValue("engine_volume_cc", variant.engine_cc ?? 0, { shouldValidate: true });
                    setValue("horse_power", variant.power_ps, { shouldValidate: true });
                    setValue("electric_power_kw", null);
                    const isHybrid = /active\s*hybrid/i.test(variant.model) || /\b\d{2,3}e\b/i.test(variant.model);
                    setValue("powertrain_kind", variant.powertrain_kind ?? (isHybrid ? "OTHER_HYBRID" : "ICE"), { shouldValidate: true });
                    setValue("manufacture_date", null);
                    setCalculation(null);
                    toast.success(`${variant.model} ${year} · ${variant.chassis} · ${variant.engine_code}`);
                  }}
                />
                {selectedBmwVariant && <p className="mt-2 text-xs text-amber-800">
                  {selectedBmwVariant.model} · {/gran coup[eé]/i.test(selectedBmwVariant.body) ? copy.bmwPicker.bodyGranCoupe : /coup[eé]/i.test(selectedBmwVariant.body) ? copy.bmwPicker.bodyCoupe : /convertible|cabrio/i.test(selectedBmwVariant.body) ? copy.bmwPicker.bodyConvertible : selectedBmwVariant.body} ({selectedBmwVariant.chassis}) · {selectedBmwVariant.version === "Competition Package" ? copy.bmwPicker.competitionVersion : copy.bmwPicker.standardVersion}
                </p>}
              </div>}
              {currentMakeName.trim().toLowerCase() === "tesla" && <div className="sm:col-span-2">
                <TeslaPowerPicker
                  model={selectedModel?.model ?? loadedCar?.model ?? decodedVin?.model ?? ""}
                  year={vehicleYear}
                  disabled={calcMutation.isPending || urlMutation.isPending || vinMutation.isPending}
                  autoOpen={pendingTeslaPicker}
                  onAutoOpenHandled={() => setPendingTeslaPicker(false)}
                  onApply={(variant) => {
                    setSelectedTeslaVariant(variant);
                    setValue("electric_power_kw", variant.power_kw, { shouldValidate: true });
                    setValue("horse_power", null);
                    setValue("engine_volume_cc", 0);
                    setValue("powertrain_kind", "EV", { shouldValidate: true });
                    setCalculation(null);
                    toast.success(`${variant.version} ${vehicleYear} · ${variant.power_kw} kW`);
                  }}
                />
                {selectedTeslaVariant && <p className="mt-2 text-xs text-amber-800">{selectedTeslaVariant.version} · {selectedTeslaVariant.power_kw} kW · {selectedTeslaVariant.motor_codes}</p>}
              </div>}
              {catalogStatus === "error" && <p role="alert" className="text-xs text-red-600 sm:col-span-2">{t("catalogUnavailable")}</p>}
            </div>
            <div><Label>{t("carPriceUsd")}</Label><Input type="number" step="0.01" {...register("car_price_usd")} />{errors.car_price_usd && <p className="text-sm text-red-500">{errors.car_price_usd.message}</p>}</div>
            <div><Label>{t("engineVolume")}</Label><Input type="number" disabled={powertrainKind === "EV"} {...register("engine_volume_cc")} />{errors.engine_volume_cc && <p className="text-sm text-red-500">{errors.engine_volume_cc.message}</p>}</div>
            <div>
              <Label htmlFor="car-year">{t("carYear")}</Label>
              <select id="car-year" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" {...register("car_year", {
                onChange: (event) => {
                  const nextYear = Number(event.target.value);
                  const currentManufactureDate = watch("manufacture_date") ?? "";
                  const manufactureMonth = /^(0[1-9]|1[0-2])\/\d{4}$/.exec(currentManufactureDate)?.[1];
                  if (manufactureMonth) setValue("manufacture_date", `${manufactureMonth}/${nextYear}`, { shouldValidate: true });
                  if (!modelForPicker) return;
                  if (currentMakeName.trim().toLowerCase() === "bmw") {
                    setSelectedBmwVariant(null);
                    setValue("horse_power", null);
                    setValue("engine_volume_cc", 0);
                    setValue("powertrain_kind", "ICE");
                    setPendingBmwPicker(true);
                    setCalculation(null);
                  } else if (currentMakeName.trim().toLowerCase() === "tesla") {
                    setSelectedTeslaVariant(null);
                    setValue("electric_power_kw", null);
                    setValue("powertrain_kind", "EV");
                    setPendingTeslaPicker(true);
                    setCalculation(null);
                  }
                },
              })}>
                <option value="">{t("chooseYear")}</option>
                {manufactureYears.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
              {errors.car_year && <p className="text-sm text-red-500">{errors.car_year.message}</p>}
            </div>
            <div>
              <Label htmlFor="manufacture-date">{t("manufactureDate")}</Label>
              <Controller name="manufacture_date" control={control} render={({ field }) => (
                <ManufactureDateInput value={field.value} onChange={field.onChange} onYearChange={(year) => {
                  const currentDate = watch("manufacture_date") ?? "";
                  const month = /^(0[1-9]|1[0-2])\/\d{4}$/.exec(currentDate)?.[1];
                  if (month) setValue("manufacture_date", `${month}/${year}`, { shouldValidate: true });
                  setValue("car_year", year, { shouldValidate: true });
                  if (year !== vehicleYear && currentMakeName.trim().toLowerCase() === "tesla" && modelForPicker) {
                    setSelectedTeslaVariant(null);
                    setValue("electric_power_kw", null);
                    setValue("powertrain_kind", "EV");
                    setPendingTeslaPicker(true);
                  }
                }} onBlur={field.onBlur} inputRef={field.ref} vehicleYear={vehicleYear} error={errors.manufacture_date?.message} />
              )} />
              {errors.manufacture_date && <p id="manufacture-date-error" className="text-sm text-red-500">{errors.manufacture_date.message}</p>}
            </div>
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
