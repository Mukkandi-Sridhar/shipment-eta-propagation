import { motion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Globe from "../components/Globe";
import { Bars } from "../components/charts";
import { Card, CardHeader, CountUp, Dot, Pill, Segmented, Stat } from "../components/ui";
import type { AppData } from "../lib/data";
import { CAUSE_LABELS, LANE_COLORS, STAGE_KEYS, STAGE_LABELS, fmtH, hours, riskColor } from "../lib/data";

export default function Overview({ data, onOpen }: { data: AppData; onOpen: (id: string) => void }) {
  const { summary, fleet, geo, shipments } = data;
  const range = useMemo(() => {
    const lo = Math.min(...fleet.map((f) => hours(f.act.departed)));
    const hi = Math.max(...fleet.map((f) => hours(f.act.arrived)));
    return [lo, hi] as const;
  }, [fleet]);
  const [clock, setClock] = useState(() => hours(summary.config.split_date) + 24 * 20);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
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

  const atSea = fleet.filter((f) => clock >= hours(f.act.departed) && clock <= hours(f.act.arrived));
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
  const causes = Object.entries(summary.dataset.causes).slice(0, 8);
  const date = new Date(clock * 3.6e6);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-100 px-5 py-4">
            <div>
              <h1 className="text-[17px] font-semibold tracking-tight text-stone-900">Network replay</h1>
              <p className="mt-0.5 text-[13px] text-stone-500">300 simulated container moves on nine lanes, coloured by how late each one finally delivers.</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="num text-[15px] font-medium text-stone-900">{date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })} <span className="text-stone-400">{date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC</span></div>
                <div className="mt-0.5 text-[12px] text-stone-500"><span className="num text-stone-800">{atSea.length}</span> at sea · <span className="num text-bad">{atSeaLate}</span> will deliver late</div>
              </div>
            </div>
          </div>
          <Globe geo={geo} fleet={fleet} clockH={clock} onPick={(id) => shipments[id] && onOpen(id)} height={500} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pb-2 text-[11.5px] text-stone-500">
            <span className="flex items-center gap-1.5"><Dot color="#1F9D6B" />on time (≤24h)</span>
            <span className="flex items-center gap-1.5"><Dot color="#C98200" />1–3 days late</span>
            <span className="flex items-center gap-1.5"><Dot color="#D64545" />more than 3 days late</span>
            <span className="text-stone-400">Drag to rotate, click a ship to open it.</span>
          </div>
          <div className="flex items-center gap-3 border-t border-stone-100 px-5 py-3">
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

        <div className="grid grid-cols-2 gap-4 self-start">
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
            <CardHeader kicker="Forecast right after departure" title="Most likely to be late" right={<span className="pt-1 text-[11px] text-stone-400">P(late)</span>} />
            <div className="mt-2 divide-y divide-stone-100 px-2 pb-2">
              {watch.map(({ s, p }, i) => (
                <motion.button key={s.id} onClick={() => onOpen(s.id)} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.05 }}
                  className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-stone-100">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[13px] font-medium text-stone-800"><span className="num">{s.id}</span><span className="h-1.5 w-1.5 rounded-full" style={{ background: LANE_COLORS[s.lane] }} /><span className="text-stone-500">{s.lane}</span></div>
                    <div className="truncate text-[11px] text-stone-500">{s.carrier} · {s.commodity}{!s.docs_complete ? " · docs incomplete" : ""}</div>
                  </div>
                  <div className="num text-[12px] text-stone-700">{fmtH(p.delay_p50_h)}</div>
                  <div className="num w-12 rounded-md px-1.5 py-0.5 text-center text-[11px] font-semibold" style={{ color: riskColor(p.p_late), background: riskColor(p.p_late) + "18" }}>{Math.round(p.p_late * 100)}%</div>
                </motion.button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card delay={0.1} className="p-0">
          <CardHeader kicker="Ground truth · late shipments" title="Where delay hours come from" info="Sum of positive stage overruns across all shipments delivered >24h late. In real networks, most door-to-door delay is created on land, not at sea." />
          <div className="p-5 pt-4">
            <div className="mb-4 flex h-3 overflow-hidden rounded-full">
              {STAGE_KEYS.map((k, i) => (
                <motion.div key={k} initial={{ width: 0 }} animate={{ width: `${(share[k] / shareTot) * 100}%` }} transition={{ duration: 1, delay: 0.2 + i * 0.08 }}
                  style={{ background: ["#5B8DB8", "#2952CC", "#7C5CC4", "#C2477A", "#C98200"][i] }} />
              ))}
            </div>
            <Bars items={STAGE_KEYS.map((k, i) => ({ key: k, label: STAGE_LABELS[i], value: (share[k] / shareTot) * 100, color: ["#5B8DB8", "#2952CC", "#7C5CC4", "#C2477A", "#C98200"][i] }))} max={50} format={(v) => `${v.toFixed(0)}%`} />
          </div>
        </Card>
        <Card delay={0.15} className="p-0">
          <CardHeader kicker="Simulator event log" title="Triggered delay mechanisms" info="How many of the 300 journeys hit each mechanism. A shipment can have several." />
          <div className="p-5 pt-4">
            <Bars items={causes.map(([k, v]) => ({ key: k, label: CAUSE_LABELS[k] ?? k, value: v as number, color: "#2952CC" }))} format={(v) => `${v}`} />
          </div>
        </Card>
        <Card delay={0.2} className="p-0">
          <CardHeader kicker="Dataset" title="300 synthetic journeys, 9 lanes" info="Generated by a mechanistic simulator (eta/simulate.py). Training = first 70% of departures, test = the last 30% (Aug–Nov, peak season)." />
          <div className="grid grid-cols-2 gap-3 p-5 pt-4">
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
            <div className="col-span-2 space-y-1.5">
              {summary.dataset.lanes.map((l) => (
                <div key={l.lane_id} className="flex items-center gap-2 text-[11px]">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: LANE_COLORS[l.lane_id] }} />
                  <span className="num w-16 text-stone-700">{l.lane_id}</span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-stone-100">
                    <motion.div className="h-full" style={{ background: LANE_COLORS[l.lane_id] }} initial={{ width: 0 }} animate={{ width: `${l.late_rate * 100}%` }} transition={{ duration: 1 }} />
                  </div>
                  <span className="num w-10 text-right text-stone-500">{Math.round(l.late_rate * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
