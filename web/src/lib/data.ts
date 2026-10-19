import { useEffect, useState } from "react";

export type StageKey = "origin" | "ocean" | "port" | "customs" | "last_mile";
export const STAGE_KEYS: StageKey[] = ["origin", "ocean", "port", "customs", "last_mile"];
export const STAGE_LABELS = ["Origin port", "Ocean leg", "Destination port", "Customs", "Last mile"];
export const CHECKPOINT_LABELS = ["At booking", "Vessel departed", "Vessel arrived", "Container discharged", "Customs released"];
export const CHECKPOINT_SHORT = ["Booked", "Departed", "Arrived", "Discharged", "Released"];

export interface StagePred {
  stage: StageKey;
  label: string;
  status: "reported" | "merged" | "unreported" | "forecast";
  sched_start: string;
  sched_end: string;
  start: string;
  end: string | null;
  excess_h: number | null;
  knock_on_h: number | null;
  local_h: number | null;
}

export interface Factor {
  group: string;
  hours: number;
  kind: "observed" | "baseline" | "factor";
}

export interface Prediction {
  checkpoint: number;
  checkpoint_label: string;
  now: string;
  anchor: number;
  observed_lateness_h: number;
  sched_delivery: string;
  eta_p10: string;
  eta_p50: string;
  eta_p90: string;
  delay_p10_h: number;
  delay_p50_h: number;
  delay_p90_h: number;
  delay_mean_h: number;
  p_late: number;
  histogram: { start: number; step: number; counts: number[] };
  stages: StagePred[];
  factors: Factor[];
  stage_factors: Record<string, Record<string, number>>;
  narrative: string[];
  actions?: { title: string; impact_h: number | null; detail: string }[];
}

export interface ShipmentDetail {
  id: string;
  lane: string;
  origin: string;
  dest: string;
  hub: string | null;
  carrier: string;
  carrier_reliability: number;
  commodity: string;
  docs_complete: boolean;
  new_importer: boolean;
  vessel_teu: number;
  inland_city: string;
  inland_mode: string;
  red_sea_diversion: boolean;
  truth: { delay_h: number; late: boolean; causes: string[]; excess: Record<StageKey, number>; delivered: string };
  milestones: { key: string; sched: string; act: string; reported: boolean }[];
  predictions: Prediction[];
}

export interface FleetItem {
  id: string;
  lane: string;
  carrier: string;
  commodity: string;
  split: "train" | "test";
  sched: Record<string, string>;
  act: Record<string, string>;
  delay_h: number;
  late: boolean;
  causes: string[];
  cape: boolean;
}

export interface Geo {
  ports: Record<string, { name: string; lat: number; lon: number }>;
  lanes: Record<string, { origin: string; dest: string; hub: string | null; inland_city: string; inland_mode: string; transit_days: number; coords: [number, number][]; cape: [number, number][] }>;
}

export interface MetricRow {
  checkpoint: number;
  model: string;
  mae: number;
  rmse: number;
  within24: number;
  p90_err: number;
  auc?: number;
  brier?: number;
  coverage80?: number;
  width80?: number;
}

export interface Surface { x: number[] | string[]; y: (number | string)[]; z: number[][]; x_label: string; y_label: string; z_label: string }

export interface Summary {
  config: { n: number; seed: number; late_threshold_h: number; train: number; test: number; split_date: string; resid_scale: number };
  model_labels: Record<string, string>;
  metrics: MetricRow[];
  gain_vs_lane: { checkpoint: number; gain: number; lo: number; hi: number }[];
  gain_vs_direct: { checkpoint: number; gain: number; lo: number; hi: number }[];
  attribution: { checkpoint: number; n: number; model: number; lane_baseline: number; chance: number }[];
  robustness: Record<string, number>[];
  learning_curve: { n: number; checkpoint: number; stage_chain: number; lane_history: number; direct_gbm: number }[];
  per_lane: { lane_id: string; checkpoint: number; n: number; stage_chain: number; lane_history: number; direct_gbm: number }[];
  calibration: { checkpoint: number; bin: number; predicted: number; observed: number; n: number }[];
  dataset: {
    late_rate: number;
    median_delay: number;
    mean_delay: number;
    p90_delay: number;
    causes: Record<string, number>;
    delay_hist: { start: number; step: number; counts: number[] };
    stage_share_late: Record<StageKey, number>;
    missing_rates: Record<string, number>;
    lanes: { lane_id: string; n: number; median_delay: number; late_rate: number }[];
  };
  analyses: {
    propagation_curves: { lane_id: string; points: { dep_late: number; final: number }[] }[];
    propagation_empirical: { lane_id: string; dep_late: number; final: number }[];
    port_surface: Surface;
    customs_surface: Surface;
    stage_importance: { stage: StageKey; label: string; groups: Record<string, number> }[];
  };
}

export interface AppData {
  summary: Summary;
  geo: Geo;
  fleet: FleetItem[];
  shipments: Record<string, ShipmentDetail>;
}

export function useAppData() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const get = (f: string) => fetch(`./data/${f}`).then((r) => {
      if (!r.ok) throw new Error(`${f}: ${r.status}`);
      return r.json();
    });
    Promise.all([get("summary.json"), get("geo.json"), get("fleet.json"), get("shipments.json")])
      .then(([summary, geo, fleet, shipments]) => setData({ summary, geo, fleet, shipments }))
      .catch((e) => setError(String(e)));
  }, []);
  return { data, error };
}

// ---------------------------------------------------------------- format
export const hours = (iso: string) => new Date(iso + "Z").getTime() / 3.6e6;

export function fmtDate(iso: string, withTime = true) {
  const d = new Date(iso + "Z");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  if (withTime) Object.assign(opts, { hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toLocaleString("en-GB", opts);
}

export function fmtH(h: number | null | undefined, sign = true) {
  if (h == null || Number.isNaN(h)) return "—";
  const s = sign && h > 0 ? "+" : h < 0 ? "−" : "";
  const a = Math.abs(h);
  if (a >= 72) return `${s}${(a / 24).toFixed(1)}d`;
  return `${s}${a.toFixed(0)}h`;
}

export const riskColor = (p: number) => (p >= 0.6 ? "#fb7185" : p >= 0.3 ? "#fbbf24" : "#34d399");
export const delayColor = (h: number) => (h > 72 ? "#fb7185" : h > 24 ? "#fbbf24" : "#34d399");

export const CAUSE_LABELS: Record<string, string> = {
  rolled_over: "Rolled to next sailing",
  missed_connection: "Missed transshipment",
  heavy_weather: "Heavy weather",
  red_sea_diversion: "Red Sea diversion",
  missed_berth_window: "Missed berth window",
  port_congestion: "Port congestion",
  labour_strike: "Labour strike",
  docs_incomplete: "Incomplete documents",
  customs_inspection: "Customs inspection",
  weekend_holiday_hold: "Weekend / holiday hold",
  missed_truck_appointment: "Missed truck slot",
  missed_rail_cutoff: "Missed rail cut-off",
};

export const LANE_COLORS: Record<string, string> = {
  "SHA-RTM": "#22d3ee",
  "YTN-LAX": "#a78bfa",
  "PUS-LAX": "#f472b6",
  "NSA-HAM": "#34d399",
  "MAA-RTM": "#fbbf24",
  "SGN-RTM": "#60a5fa",
  "SIN-NYC": "#fb923c",
  "NSA-JEA": "#2dd4bf",
  "NSA-NYC": "#e879f9",
};
