export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface User {
  id: number;
  email: string;
}

export interface CurrencyRates {
  usd_to_rub: number;
  eur_to_rub: number;
  gel_to_rub: number;
  source: string;
  effective_date: string;
  fetched_at: string;
  is_stale: boolean;
}

export type PowertrainKind = "ICE" | "OTHER_HYBRID" | "EV" | "SERIES_HYBRID";
export type CustomsPaymentKind = "UNIFIED_RATE" | "AGGREGATE_PAYMENT";
export type DealRating = "EXCELLENT" | "GOOD" | "FAIR" | "WEAK" | "BAD";
export type MarketPosition = "UNDER_MARKET" | "AT_MARKET" | "OVER_MARKET";

export interface DealAssessment {
  reference_price_rub: number;
  savings_rub: number;
  savings_percent: number;
  score: number;
  rating: DealRating;
  market_position: MarketPosition;
}

export interface CalculatorRequest {
  car_price_usd: number;
  engine_volume_cc: number;
  car_year: number;
  manufacture_date?: string | null;
  horse_power: number;
  powertrain_kind?: PowertrainKind | null;
  is_personal_use?: boolean;
  source_make?: string | null;
  source_model?: string | null;
  source_model_id?: number | null;
  logistics_cost_rub: number;
  rf_analog_price_rub?: number | null;
  note?: string | null;
}

export interface CalculatorResult {
  car_price_rub: number;
  customs_fee_rub: number;
  customs_duty_rub: number;
  customs_payment_kind: CustomsPaymentKind;
  import_duty_rub: number;
  excise_rub: number;
  vat_rub: number;
  recycling_fee_rub: number;
  customs_total_rub: number;
  logistics_cost_rub: number;
  total_cost_rub: number;
  savings_vs_rf_rub?: number | null;
  deal_assessment?: DealAssessment | null;
  vehicle_age_years: number;
  age_is_estimated: boolean;
  age_estimation_method?: string | null;
  manufacture_date_used: string;
  calculation_date: string;
  calculation_rule_version: string;
  rates: CurrencyRates;
}

export interface CalculationOut extends CalculatorRequest {
  id: number;
  age_is_estimated: boolean;
  util_coefficient?: number | null;
  customs_fee_rub?: number | null;
  customs_duty_rub: number;
  customs_payment_kind?: CustomsPaymentKind | null;
  import_duty_rub?: number | null;
  excise_rub?: number | null;
  vat_rub?: number | null;
  recycling_fee_rub: number;
  customs_total_rub?: number | null;
  total_cost_rub: number;
  calculation_rule_version?: string | null;
  usd_to_rub: number;
  eur_to_rub: number;
  gel_to_rub: number;
  currency_source?: string | null;
  currency_effective_date?: string | null;
  created_at: string;
}

export interface CarListing {
  car_id: number;
  category_id?: number | null;
  make: string;
  model_id?: number | null;
  car_model?: string | null;
  model: string;
  year: number;
  price_usd: number;
  engine_volume_cc: number;
  horse_power?: number | null;
  horse_power_source?: string | null;
  fuel_type?: string | null;
  util_coefficient?: number | null;
  powertrain_kind?: PowertrainKind | null;
  mileage_km?: number | null;
  image_url?: string | null;
  image_urls?: string[];
  url: string;
  estimated_total_rub?: number | null;
  estimate_warning?: string | null;
}
