import type { Prediction } from "./data";

export interface WhatIfReq {
  shipment_id: string;
  checkpoint: number;
  extra_lateness_h: number;
  overrides: Partial<{ cong_dest_now: number; cong_origin_now: number; weather_now: number; docs_complete: boolean; new_importer: boolean; carrier_reliability: number }>;
}

const BASE = (import.meta as any).env?.VITE_API ?? "";

export async function whatIf(req: WhatIfReq, signal?: AbortSignal): Promise<Prediction> {
  const r = await fetch(`${BASE}/api/whatif`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req), signal });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

export async function apiAlive(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}
