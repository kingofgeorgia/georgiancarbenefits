import { api } from "@/lib/api";
import type { BmwVariant } from "@/components/calculator/BmwVariantPicker";
import type { TeslaPowerVariant } from "@/components/calculator/TeslaPowerPicker";
import type { VehicleSpecification } from "@/lib/types";

export interface VehicleCatalogResponse {
  schema_version: number;
  updated_at: string;
  make_model_records: {
    make_id: number;
    make: string;
    model_id: number | null;
    model: string;
    group_title: string;
  }[];
  bmw_variants: BmwVariant[];
  tesla_power_variants: TeslaPowerVariant[];
  tesla_power_reference_rows: Record<string, string | number | null>[];
  vehicle_specifications: VehicleSpecification[];
  vehicle_specifications_version: string;
  learned_vehicle_observations: {
    make: string;
    model: string;
    year: number;
    engine_volume_cc: number;
    powertrain_kind: string;
    horse_power: number | null;
    electric_power_kw: number | null;
    status: "MATCH" | "CONFLICT" | "NO_POWER";
    power_options: number[];
    observation_count: number;
    latest_at: string;
  }[];
}

let catalogRequest: Promise<VehicleCatalogResponse> | undefined;

export function getVehicleCatalog(): Promise<VehicleCatalogResponse> {
  if (!catalogRequest) {
    catalogRequest = api.get<VehicleCatalogResponse>("/cars/catalog")
      .then(({ data }) => data)
      .catch((error: unknown) => {
        catalogRequest = undefined;
        throw error;
      });
  }
  return catalogRequest;
}
