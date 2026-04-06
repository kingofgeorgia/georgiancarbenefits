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
}

export interface CalculatorRequest {
  car_price_usd: number;
  engine_volume_cc: number;
  car_year: number;
  logistics_cost_rub: number;
  rf_analog_price_rub?: number | null;
  note?: string | null;
}

export interface CalculatorResult {
  car_price_rub: number;
  customs_duty_rub: number;
  recycling_fee_rub: number;
  logistics_cost_rub: number;
  total_cost_rub: number;
  savings_vs_rf_rub?: number | null;
  rates: CurrencyRates;
}

export interface CalculationOut extends CalculatorRequest {
  id: number;
  customs_duty_rub: number;
  recycling_fee_rub: number;
  total_cost_rub: number;
  usd_to_rub: number;
  eur_to_rub: number;
  gel_to_rub: number;
  created_at: string;
}

export interface CarListing {
  car_id: number;
  make: string;
  model: string;
  year: number;
  price_usd: number;
  engine_volume_cc: number;
  mileage_km?: number | null;
  image_url?: string | null;
  url: string;
  estimated_total_rub?: number | null;
}
