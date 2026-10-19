import { motion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Globe from "../components/Globe";
import { Card, CardHeader, CountUp, Dot, Kbd, PageHeader, Segmented, Spark, Stat, useIsMobile } from "../components/ui";
import type { AppData } from "../lib/data";
import { CAUSE_LABELS, LANE_COLORS, STAGE_KEYS, STAGE_LABELS, fmtH, hours, riskColor } from "../lib/data";

const STAGE_COL = ["#5B8DB8", "#2952CC", "#7C5CC4", "#C2477A", "#C98200"];
const STAGE_CAUSES: Record<string, string[]> = {
  origin: ["rolled_over"],
  ocean: ["heavy_weather", "red_sea_diversion", "missed_connection"],
  port: ["port_congestion", "missed_berth_window", "labour_strike"],
  customs: ["weekend_holiday_hold", "docs_incomplete", "customs_inspection"],
  last_mile: ["missed_truck_appointment", "missed_rail_cutoff"],
};

export default function Overview({ data, onOpen }: { data: AppData; onOpen: (id: string) => void }) {
  const { summary, fleet, geo, shipments } = data;
  const phone = useIsMobile(639);
  const range = useMemo(() => {
    const lo = Math.min(...fleet.map((f) => hours(f.act.departed)));
    const hi = Math.max(...fleet.map((f) => hours(f.act.arrived)));
    return [lo, hi] as const;
  }, [fleet]);
  const [clock, setClock] = useState(() => hours(summary.config.split_date) + 24 * 20);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [lane, setLane] = useState<string | null>(null);
  const raf = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      setClock((c) => (c + dt * 24 * speed > range[1] ? range[0] : c + dt * 24 * speed));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, speed, range]);

  const atSea = fleet.filter((f) => clock >= hours(f.act.departed) && clock <= hours(f.act.arrived) && (!lane || f.lane === lane));
  const atSeaLate = atSea.filter((f) => f.delay_h > summary.config.late_threshold_h).length;
  const M = (c: number, m: string) => summary.metrics.find((r) => r.checkpoint === c && r.model === m)!;
  const arrived = M(2, "stage_chain"), sched = M(2, "schedule");
  const chainAt = (c: number) => M(c, "stage_chain");
  const attr = summary.attribution.find((a) => a.checkpoint === 1)!;
  const covAvg = [0, 1, 2, 3, 4].reduce((s, c) => s + (chainAt(c).coverage80 ?? 0), 0) / 5;

  const watch = useMemo(() => Object.values(shipments)
    .map((s) => ({ s, p: s.predictions[1] }))
    .sort((a, b) => b.p.p_late - a.p.p_late)
    .slice(0, 7), [shipments]);

  const share = summary.dataset.stage_share_late;
  const shareTot = STAGE_KEYS.reduce((a, k) => a + share[k], 0);
  const causes = summary.dataset.causes;
  const maxCause = Math.max(...Object.values(causes));
  const date = new Date(clock * 3.6e6);

  return (
    <div className="space-y-5">
      <PageHeader title="Network overview"
        sub={<>Predicts when each container will really arrive, how likely it is to be late, and which stage the delay comes from. Every number here is measured on shipments the models never saw.</>}
        right={<span className="hidden items-center gap-1.5 text-[12px] text-stone-500 md:flex"><Kbd>⌘K</Kbd> find a shipment</span>} />
      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-stone-100 px-4 py-3.5 sm:px-5 sm:py-4">
            <div>
              <h2 className="text-[16px] font-semibold tracking-tight text-stone-900">Network replay</h2>
              <p className="mt-0.5 text-[13px] text-stone-500">300 simulated moves on nine lanes, coloured by how late each one finally delivers.</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="sm:text-right">
                <div className="num text-[15px] font-medium text-stone-900">{date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })} <span className="text-stone-400">{date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC</span></div>
                <div className="mt-0.5 text-[12px] text-stone-500"><span className="num text-stone-800">{atSea.length}</span> at sea{lane ? ` on ${lane}` : ""} · <span className="num text-bad">{atSeaLate}</span> will deliver late</div>
              </div>
            </div>
          </div>
          <Globe geo={geo} fleet={fleet} clockH={clock} focusLane={lane} onPick={(id) => shipments[id] && onOpen(id)} height={phone ? 330 : 470} />
          <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:flex-wrap sm:px-5">
            {[null, ...Object.keys(geo.lanes)].map((l) => (
              <button key={l ?? "all"} onClick={() => setLane(l)} aria-pressed={lane === l}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition ${lane === l ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}>
                {l && <span className="h-1.5 w-1.5 rounded-full" style={{ background: LANE_COLORS[l] }} />}
                <span className={l ? "num" : ""}>{l ?? "All lanes"}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-2.5 text-[11.5px] text-stone-500 sm:px-5">
            <span className="flex items-center gap-1.5"><Dot color="#1F9D6B" />on time (≤24h)</span>
            <span className="flex items-center gap-1.5"><Dot color="#C98200" />1–3 days late</span>
            <span className="flex items-center gap-1.5"><Dot color="#D64545" />more than 3 days late</span>
            <span className="text-stone-400">Drag to rotate, click a ship to open it.</span>
          </div>
          <div className="flex items-center gap-3 border-t border-stone-100 px-4 py-3 sm:px-5">
            <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause replay" : "Play replay"}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-stone-900 text-white transition hover:bg-stone-700">
              {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
            </button>
            <input type="range" min={range[0]} max={range[1]} step={1} value={clock} aria-label="Network time"
              onChange={(e) => setClock(+e.target.value)} className="w-full"
              style={{ ["--p" as any]: `${((clock - range[0]) / (range[1] - range[0])) * 100}%` }} />
            <Segmented size="sm" value={speed} onChange={setSpeed} options={[{ value: 1, label: "1×" }, { value: 4, label: "4×" }, { value: 10, label: "10×" }]} />
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 self-start sm:gap-4">
          <Stat delay={0.05} label="ETA error at vessel arrival" accent="#2952CC"
            info="Mean absolute error of the final delivery-time forecast once the vessel has arrived, on 90 shipments the models never saw (temporal hold-out)."
            value={<><CountUp value={arrived.mae} decimals={1} />h</>}
            sub={<><span className="text-ok">−{((1 - arrived.mae / sched.mae) * 100).toFixed(0)}%</span> vs carrier schedule ({sched.mae.toFixed(1)}h)</>} />
          <Stat delay={0.1} label="Late-risk AUC" accent="#7C5CC4"
            info="How well P(late > 24h) ranks late vs on-time shipments, at vessel arrival."
            value={<CountUp value={arrived.auc ?? 0} decimals={2} />}
            sub={<>Brier {arrived.brier?.toFixed(3)} · at arrival</>} />
          <Stat delay={0.15} label="Root-cause stage found" accent="#1F9D6B"
            info="Late test shipments: how often the stage the model blames most is the stage that, in the simulator's ground truth, actually caused the most delay. Scored right after departure."
            value={<><CountUp value={attr.model * 100} />%</>}
            sub={<>vs {Math.round(attr.lane_baseline * 100)}% lane history · {Math.round(attr.chance * 100)}% chance</>} />
          <Stat delay={0.2} label="P10–P90 coverage" accent="#C98200"
            info="Share of test shipments whose actual delivery fell inside the 80% forecast interval, averaged over the five checkpoints. Above 80% means the intervals are conservative."
            value={<><CountUp value={covAvg * 100} />%</>}
            sub={<>target 80% · Monte-Carlo through the chain</>} />

          <Card delay={0.25} className="col-span-2 p-0">
            <CardHeader kicker="Ranked by risk right after departure" title="Most likely to be late" right={<span className="pt-1 text-[11px] text-stone-400">risk across checkpoints</span>} />
            <div className="mt-2 divide-y divide-stone-100 px-2 pb-2">
              {watch.map(({ s, p }, i) => (
                <motion.button key={s.id} onClick={() => onOpen(s.id)} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.05 }}
                  className="grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-stone-100">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[13px] font-medium text-stone-800"><span className="num">{s.id}</span><span className="h-1.5 w-1.5 rounded-full" style={{ background: LANE_COLORS[s.lane] }} /><span className="text-stone-500">{s.lane}</span></div>
                    <div className="truncate text-[11px] text-stone-500">{s.carrier} · {s.commodity}{!s.docs_complete ? " · docs incomplete" : ""}</div>
                  </div>
                  <span className="hidden sm:block"><Spark values={s.predictions.map((q) => q.p_late)} color={riskColor(p.p_late)} /></span>
                  <div className="num text-[12px] text-stone-700">{fmtH(p.delay_p50_h)}</div>
                  <div className="num w-12 rounded-md px-1.5 py-0.5 text-center text-[11px] font-semibold" style={{ color: riskColor(p.p_late), background: riskColor(p.p_late) + "18" }}>{Math.round(p.p_late * 100)}%</div>
                </motion.button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card delay={0.1} className="p-0">
          <CardHeader kicker="Ground truth from the simulator" title="Where delay is created, and why"
            info="Top: share of all delay hours in late shipments created at each stage. Below each stage: how many of the 300 journeys triggered each mechanism there. A shipment can trigger several." />
          <div className="p-4 pt-3 sm:p-5 sm:pt-3">
            <div className="flex h-2.5 overflow-hidden rounded-full">
              {STAGE_KEYS.map((k, i) => (
                <motion.div key={k} initial={{ width: 0 }} animate={{ width: `${(share[k] / shareTot) * 100}%` }} transition={{ duration: 0.9, delay: 0.15 + i * 0.06 }}
                  className="border-r-2 border-white last:border-0" style={{ background: STAGE_COL[i] }} />
              ))}
            </div>
            <div className="mt-4 grid gap-x-5 gap-y-5 sm:grid-cols-3 xl:grid-cols-5">
              {STAGE_KEYS.map((k, i) => (
                <div key={k}>
                  <div className="flex items-baseline justify-between border-b border-stone-100 pb-1.5">
                    <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-stone-800"><span className="h-2 w-2 rounded-sm" style={{ background: STAGE_COL[i] }} />{STAGE_LABELS[i]}</span>
                    <span className="num text-[13px] text-stone-900">{Math.round((share[k] / shareTot) * 100)}%</span>
                  </div>
                  <ul className="mt-2 space-y-2">
                    {STAGE_CAUSES[k].filter((c) => causes[c]).sort((x, y) => causes[y] - causes[x]).map((c) => (
                      <li key={c}>
                        <div className="flex justify-between text-[11.5px]"><span className="text-stone-600">{CAUSE_LABELS[c]}</span><span className="num text-stone-400">{causes[c]}</span></div>
                        <div className="mt-1 h-1 rounded-full bg-stone-100">
                          <motion.div className="h-full rounded-full" style={{ background: STAGE_COL[i] }} initial={{ width: 0 }} animate={{ width: `${(causes[c] / maxCause) * 100}%` }} transition={{ duration: 0.8, delay: 0.2 }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card delay={0.2} className="p-0">
          <CardHeader kicker="Dataset" title="Late rate by lane" info="Generated by a mechanistic simulator (eta/simulate.py). Training = first 70% of departures, test = the last 30% (Aug–Nov, peak season)." />
          <div className="grid grid-cols-2 gap-3 p-4 pt-4 sm:p-5 sm:pt-4">
            {[
              ["Late > 24h", `${(summary.dataset.late_rate * 100).toFixed(0)}%`],
              ["Median delay", fmtH(summary.dataset.median_delay)],
              ["P90 delay", fmtH(summary.dataset.p90_delay)],
              ["Train / test", `${summary.config.train} / ${summary.config.test}`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                <div className="text-[11.5px] text-stone-500">{k}</div>
                <div className="num mt-1 text-lg font-semibold text-stone-900">{v}</div>
              </div>
            ))}
            <div className="col-span-2 space-y-0.5">
              {summary.dataset.lanes.map((l) => (
                <button key={l.lane_id} onClick={() => { setLane(l.lane_id); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-[11px] hover:bg-stone-50" title="Show this lane on the globe">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: LANE_COLORS[l.lane_id] }} />
                  <span className="num w-16 text-stone-700">{l.lane_id}</span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-stone-100">
                    <motion.div className="h-full" style={{ background: LANE_COLORS[l.lane_id] }} initial={{ width: 0 }} animate={{ width: `${l.late_rate * 100}%` }} transition={{ duration: 1 }} />
                  </div>
                  <span className="num w-10 text-right text-stone-500">{Math.round(l.late_rate * 100)}%</span>
                </button>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
