from __future__ import annotations

from typing import Literal, NotRequired, TypedDict

from app.calculation.tariffs import get_customs_2026, get_recycling_2026


PowertrainKind = Literal["ICE", "OTHER_HYBRID", "EV", "SERIES_HYBRID"]
AgeCategory = Literal["LE_3", "BETWEEN_3_AND_5", "GT_5"]
CustomsPaymentKind = Literal["UNIFIED_RATE", "AGGREGATE_PAYMENT"]
HP_TO_KW = 0.73549875
METRIC_HP_PER_KW = 1.3596216173


class PersonalImportInput(TypedDict):
    price: float
    currencyToRubRate: float
    eurToRubRate: float
    engineCc: int
    horsePower: NotRequired[float | None]
    electricPowerKw: NotRequired[float | None]
    ageYears: float
    isPersonalUse: bool
    powertrainKind: PowertrainKind | None


class OutputDetails(TypedDict):
    ageCategory: AgeCategory
    customsFeeMethod: str
    unifiedRateMethod: str
    utilFeeMethod: str
    powerKwUsed: float
    powerBasis: str
    powertrainKind: PowertrainKind
    customsPaymentKind: CustomsPaymentKind
    utilMatchedEngineRangeCc: str | None
    utilMatchedPowerRangeKw: str


class PersonalImportOutput(TypedDict):
    customsValueRub: float
    customsValueEur: float
    customsFee: float
    unifiedRate: float
    importDuty: float
    excise: float
    vat: float
    utilCoefficient: float
    utilFee: float
    total: float
    details: OutputDetails


def round2(value: float) -> float:
    return round((float(value) + float.fromhex("0x1p-52")) * 100) / 100


def _assert_positive(name: str, value: float) -> None:
    if value <= 0:
        raise ValueError(f"{name} must be a positive finite number")


def _assert_non_negative(name: str, value: float) -> None:
    if value < 0:
        raise ValueError(f"{name} must be a finite number >= 0")


def horsePowerToKw(horse_power: float) -> float:
    _assert_positive("horsePower", horse_power)
    return round2(horse_power * HP_TO_KW)


def kwToMetricHorsePower(power_kw: float) -> float:
    _assert_positive("powerKw", power_kw)
    return round2(power_kw * METRIC_HP_PER_KW)


def getAgeCategory(age_years: float) -> AgeCategory:
    _assert_non_negative("ageYears", age_years)
    if age_years <= 3:
        return "LE_3"
    if age_years <= 5:
        return "BETWEEN_3_AND_5"
    return "GT_5"


def _get_age_key_for_util(age_years: float) -> Literal["new", "used"]:
    return "new" if age_years <= 3 else "used"


def _matches_upper_bound(value: float, upper_bound: float | None) -> bool:
    return upper_bound is None or value <= float(upper_bound)


def determineCustomsFee2026(customs_value_rub: float) -> tuple[float, str]:
    _assert_positive("customsValueRub", customs_value_rub)
    for band in get_customs_2026()["customs_fees_rub"]:
        if _matches_upper_bound(customs_value_rub, band["max_customs_value_rub"]):
            fee = float(band["fee_rub"])
            upper = band["max_customs_value_rub"]
            label = f"customs value <= {upper} RUB" if upper is not None else "highest customs value band"
            return round2(fee), f"2026 customs fee: {label} => {round2(fee)} RUB"
    raise ValueError("No customs fee band matched")


def _select_engine_rate(bands: list[dict], engine_cc: int) -> dict:
    for band in bands:
        if _matches_upper_bound(engine_cc, band.get("max_engine_cc")):
            return band
    raise ValueError(f"No engine-rate band matched engineCc={engine_cc}")


def determineUnifiedRate(*, customs_value_rub: float, customs_value_eur: float, engine_cc: int, eur_to_rub_rate: float, age_category: AgeCategory) -> tuple[float, str]:
    _assert_positive("customsValueRub", customs_value_rub)
    _assert_positive("customsValueEur", customs_value_eur)
    _assert_positive("engineCc", float(engine_cc))
    _assert_positive("eurToRubRate", eur_to_rub_rate)
    tariff = get_customs_2026()["ice_personal_unified_rates"]
    if age_category == "LE_3":
        for band in tariff["le_3_years"]:
            if _matches_upper_bound(customs_value_eur, band["max_value_eur"]):
                percent_part = customs_value_rub * float(band["percent"])
                volume_part = engine_cc * float(band["min_eur_per_cc"]) * eur_to_rub_rate
                amount = round2(max(percent_part, volume_part))
                return amount, f"<=3 years: max({band['percent']} * customs value, {band['min_eur_per_cc']} EUR/cc * engine cc)"
        raise ValueError("No <=3-year customs value band matched")
    key = "between_3_and_5_years" if age_category == "BETWEEN_3_AND_5" else "gt_5_years"
    band = _select_engine_rate(tariff[key], engine_cc)
    euro_per_cc = float(band["eur_per_cc"])
    amount = round2(engine_cc * euro_per_cc * eur_to_rub_rate)
    label = "3-5 years" if age_category == "BETWEEN_3_AND_5" else ">5 years"
    return amount, f"{label}: {euro_per_cc} EUR/cc"


def _select_excise_rate_2026(horse_power: float) -> float:
    for band in get_customs_2026()["ev_personal_aggregate_payment"]["excise_rub_per_hp"]:
        if _matches_upper_bound(horse_power, band["max_hp"]):
            return float(band["rate"])
    raise ValueError(f"No 2026 excise band matched horsePower={horse_power}")


def determineEvAggregatePayment2026(*, customs_value_rub: float, power_kw: float) -> tuple[float, float, float, float, str]:
    _assert_positive("customsValueRub", customs_value_rub)
    _assert_positive("electricPowerKw", power_kw)
    rules = get_customs_2026()["ev_personal_aggregate_payment"]
    import_duty = round2(customs_value_rub * float(rules["import_duty_percent"]))
    horse_power = kwToMetricHorsePower(power_kw)
    excise_rate = _select_excise_rate_2026(horse_power)
    excise = round2(horse_power * excise_rate)
    vat_base = customs_value_rub + import_duty + excise
    vat = round2(vat_base * float(rules["vat_percent"]))
    aggregate = round2(import_duty + excise + vat)
    method = (
        "pure EV aggregate payment using maximum 30-minute traction power: "
        f"duty {rules['import_duty_percent'] * 100:g}% + excise {excise_rate:g} RUB/hp + "
        f"VAT {rules['vat_percent'] * 100:g}%"
    )
    return aggregate, import_duty, excise, vat, method


def _find_power_band(power_bands: list[dict], power_kw: float) -> dict:
    for band in power_bands:
        if _matches_upper_bound(power_kw, band.get("max_kw")):
            return band
    raise ValueError(f"No power band found for powerKw={power_kw}")


def _find_engine_band(engine_bands: list[dict], engine_cc: int) -> dict:
    for band in engine_bands:
        if _matches_upper_bound(engine_cc, band.get("max_engine_cc")):
            return band
    raise ValueError(f"No engine band found for engineCc={engine_cc}")


def resolveUtilCoefficient2026PersonalM1(*, powertrain_kind: PowertrainKind, age_years: float, power_kw: float, engine_cc: int) -> tuple[float, str, str | None, str]:
    _assert_non_negative("ageYears", age_years)
    _assert_positive("powerKw", power_kw)
    age_key = _get_age_key_for_util(age_years)
    data = get_recycling_2026()
    if powertrain_kind in ("EV", "SERIES_HYBRID"):
        power_band = _find_power_band(data["ev_or_series_hybrid_personal"], power_kw)
        coefficient = round2(float(power_band[age_key]))
        return coefficient, f"2026 personal-use M1 {powertrain_kind}: {power_band['label']}", None, power_band["label"]
    _assert_positive("engineCc", float(engine_cc))
    engine_band = _find_engine_band(data["ice_or_other_hybrid_personal"], engine_cc)
    power_band = _find_power_band(engine_band["power_bands"], power_kw)
    coefficient = round2(float(power_band[age_key]))
    return coefficient, f"2026 personal-use M1 {powertrain_kind}: {engine_band['label']}, {power_band['label']}", engine_band["label"], power_band["label"]


def calculatePersonalImportCustoms(input: PersonalImportInput) -> PersonalImportOutput:
    powertrain_kind = input.get("powertrainKind") or "ICE"
    _assert_positive("price", float(input["price"]))
    _assert_positive("currencyToRubRate", float(input["currencyToRubRate"]))
    _assert_positive("eurToRubRate", float(input["eurToRubRate"]))
    _assert_non_negative("ageYears", float(input["ageYears"]))
    engine_cc = int(input["engineCc"])
    if powertrain_kind == "EV":
        _assert_non_negative("engineCc", float(engine_cc))
    else:
        _assert_positive("engineCc", float(engine_cc))
    if input["isPersonalUse"] is not True:
        raise ValueError("This calculator supports only personal import by an individual (isPersonalUse must be true)")

    if powertrain_kind in ("EV", "SERIES_HYBRID"):
        electric_power_kw = input.get("electricPowerKw")
        if electric_power_kw is None:
            raise ValueError("electricPowerKw is required for EV and series-hybrid calculations")
        _assert_positive("electricPowerKw", float(electric_power_kw))
        power_kw_used = round2(float(electric_power_kw))
        power_basis = "MAX_30_MINUTE_ELECTRIC_POWER_KW"
    else:
        horse_power = input.get("horsePower")
        if horse_power is None:
            raise ValueError("horsePower is required for ICE and other-hybrid calculations")
        _assert_positive("horsePower", float(horse_power))
        power_kw_used = horsePowerToKw(float(horse_power))
        power_basis = "HORSEPOWER_CONVERTED_TO_KW"

    customs_value_rub = round2(float(input["price"]) * float(input["currencyToRubRate"]))
    customs_value_eur = round2(customs_value_rub / float(input["eurToRubRate"]))
    age_category = getAgeCategory(float(input["ageYears"]))
    customs_fee, customs_fee_method = determineCustomsFee2026(customs_value_rub)

    import_duty = excise = vat = 0.0
    if powertrain_kind == "EV":
        customs_payment_kind: CustomsPaymentKind = "AGGREGATE_PAYMENT"
        unified_rate, import_duty, excise, vat, unified_rate_method = determineEvAggregatePayment2026(
            customs_value_rub=customs_value_rub,
            power_kw=power_kw_used,
        )
    else:
        customs_payment_kind = "UNIFIED_RATE"
        unified_rate, unified_rate_method = determineUnifiedRate(
            customs_value_rub=customs_value_rub,
            customs_value_eur=customs_value_eur,
            engine_cc=engine_cc,
            eur_to_rub_rate=float(input["eurToRubRate"]),
            age_category=age_category,
        )

    util_coefficient, util_fee_method, matched_engine_range_cc, matched_power_range_kw = resolveUtilCoefficient2026PersonalM1(
        powertrain_kind=powertrain_kind,
        age_years=float(input["ageYears"]),
        power_kw=power_kw_used,
        engine_cc=engine_cc,
    )
    util_fee = round2(float(get_recycling_2026()["base_rate_rub"]) * util_coefficient)
    total = round2(customs_fee + unified_rate + util_fee)
    return {
        "customsValueRub": customs_value_rub,
        "customsValueEur": customs_value_eur,
        "customsFee": round2(customs_fee),
        "unifiedRate": round2(unified_rate),
        "importDuty": round2(import_duty),
        "excise": round2(excise),
        "vat": round2(vat),
        "utilCoefficient": util_coefficient,
        "utilFee": util_fee,
        "total": total,
        "details": {
            "ageCategory": age_category,
            "customsFeeMethod": customs_fee_method,
            "unifiedRateMethod": unified_rate_method,
            "utilFeeMethod": util_fee_method,
            "powerKwUsed": power_kw_used,
            "powerBasis": power_basis,
            "powertrainKind": powertrain_kind,
            "customsPaymentKind": customs_payment_kind,
            "utilMatchedEngineRangeCc": matched_engine_range_cc,
            "utilMatchedPowerRangeKw": matched_power_range_kw,
        },
    }
