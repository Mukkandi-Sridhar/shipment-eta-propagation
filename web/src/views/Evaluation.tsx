import { motion } from "framer-motion";
import { useState } from "react";
import { LineChart } from "../components/charts";
import { Card, CardHeader, PageHeader, Pill, Segmented } from "../components/ui";
import type { AppData } from "../lib/data";
import { CHECKPOINT_SHORT, LANE_COLORS } from "../lib/data";

const MODEL_COL: Record<string, string> = {
  schedule: "#A8A29E", carry_forward: "#8B8680", lane_history: "#C98200", direct_gbm: "#7C5CC4", stage_chain: "#2952CC",
};
const ORDER = ["schedule", "carry_forward", "lane_history", "direct_gbm", "stage_chain"];

export default function Evaluation({ data }: { data: AppData }) {
  const S = data.summary;
  const [metric, setMetric] = useState<"mae" | "within24" | "p90_err">("mae");
  const [lcCp, setLcCp] = useState(2);
  const [laneCp, setLaneCp] = useState(2);
  const get = (c: number, m: string) => S.metrics.find((r) => r.checkpoint === c && r.model === m)!;
  const mFmt = metric === "within24" ? (v: number) => `${Math.round(v * 100)}%` : (v: number) => `${v.toFixed(0)}h`;
  const series = ORDER.map((m) => ({
    key: m, label: S.model_labels[m], color: MODEL_COL[m], width: m === "stage_chain" ? 3 : 1.6, dashed: m === "schedule", dots: true,
    points: [0, 1, 2, 3, 4].map((c) => ({ x: c, y: (get(c, m) as any)[metric] * (metric === "within24" ? 100 : 1) })),
  }));
  const robust = S.robustness;
  const robSeries = ["carry_forward", "lane_history", "direct_gbm", "stage_chain"].map((m) => ({
    key: m, label: S.model_labels[m], color: MODEL_COL[m], dots: true, width: m === "stage_chain" ? 3 : 1.6,
    points: robust.map((r) => ({ x: r.rate * 100, y: r[m] })),
  }));
  const lc = S.learning_curve.filter((r) => r.checkpoint === lcCp);
  const lcSeries = ["lane_history", "direct_gbm", "stage_chain"].map((m) => ({
    key: m, label: S.model_labels[m], color: MODEL_COL[m], dots: true, width: m === "stage_chain" ? 3 : 1.6,
    points: lc.map((r) => ({ x: Math.log10(r.n), y: (r as any)[m] })),
  }));

  return (
    <div className="space-y-5">
      <PageHeader title="How accurate is it?" sub="Trained on January–August departures and tested on the 90 that followed, compared with four simpler methods. Weak spots are shown too, not just the wins." />
      <Card className="p-0" glow>
        <CardHeader kicker="Temporal hold-out · 90 unseen shipments (Aug–Nov departures)" title="Forecast accuracy as the journey unfolds"
          right={<Segmented size="sm" value={metric} onChange={setMetric} options={[{ value: "mae", label: "MAE" }, { value: "p90_err", label: "P90 error" }, { value: "within24", label: "Hit ±24h" }]} />}
          info="The models train on the first 70% of departures and are tested on the last 30%, the way they would be deployed. That test window includes peak season and a port strike the models barely saw, so this is a deliberately hard test." />
        <div className="grid gap-6 p-4 pt-3 sm:p-5 sm:pt-3 xl:grid-cols-[1.3fr_1fr]">
          <LineChart series={series} height={300} xTicks={[0, 1, 2, 3, 4]} xFormat={(v) => CHECKPOINT_SHORT[v]} yFormat={(v) => metric === "within24" ? `${v.toFixed(0)}%` : `${v.toFixed(0)}h`} xLabel="Prediction checkpoint" yLabel={metric === "within24" ? "Share within ±24h" : "Error (hours)"} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-[12px]">
              <thead>
                <tr className="text-[11.5px] text-stone-500">
                  <th className="pb-2 text-left font-medium">Model</th>
                  {CHECKPOINT_SHORT.map((c) => <th key={c} className="pb-2 text-right font-medium">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {ORDER.map((m) => {
                  const best = (c: number) => {
                    const vals = ORDER.map((o) => (get(c, o) as any)[metric]);
                    return metric === "within24" ? Math.max(...vals) : Math.min(...vals);
                  };
                  return (
                    <tr key={m} className={`border-t border-stone-200 ${m === "stage_chain" ? "bg-accent-600/[0.05]" : ""}`}>
                      <td className="py-2 pr-2"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: MODEL_COL[m] }} /><span className={m === "stage_chain" ? "font-semibold text-accent-700" : "text-stone-700"}>{S.model_labels[m]}</span></span></td>
                      {[0, 1, 2, 3, 4].map((c) => {
                        const v = (get(c, m) as any)[metric];
                        const isBest = v === best(c);
                        return <td key={c} className={`num py-2 text-right ${isBest ? "font-semibold text-ok" : "text-stone-500"}`}>{mFmt(v)}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-4 space-y-1.5 text-[11.5px] text-stone-500">
              <div className="text-[11.5px] text-stone-500">Stage-chain MAE gain, 95% bootstrap CI</div>
              {S.gain_vs_direct.map((g, i) => {
                const lane = S.gain_vs_lane[i];
                return (
                  <div key={g.checkpoint} className="grid grid-cols-[72px_1fr_1fr] gap-2">
                    <span className="text-stone-500">{CHECKPOINT_SHORT[g.checkpoint]}</span>
                    <span>vs lane <span className={`num ${lane.lo > 0 ? "text-ok" : "text-stone-700"}`}>{lane.gain > 0 ? "+" : ""}{lane.gain.toFixed(1)}h</span> <span className="num text-stone-400">[{lane.lo.toFixed(1)}, {lane.hi.toFixed(1)}]</span></span>
                    <span>vs GBM <span className={`num ${g.lo > 0 ? "text-ok" : g.hi < 0 ? "text-bad" : "text-stone-700"}`}>{g.gain > 0 ? "+" : ""}{g.gain.toFixed(1)}h</span> <span className="num text-stone-400">[{g.lo.toFixed(1)}, {g.hi.toFixed(1)}]</span></span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="p-0">
          <CardHeader kicker="Delay-risk classification" title="P(late > 24h) quality" info="AUC: ranking quality. Brier: probabilistic accuracy (lower is better). Coverage: share of actual outcomes inside the P10–P90 interval (target 80%)." />
          <div className="space-y-3 p-4 pt-4 sm:p-5 sm:pt-4">
            {[0, 1, 2, 3, 4].map((c) => {
              const r = get(c, "stage_chain"), d = get(c, "direct_gbm");
              return (
                <div key={c} className="grid grid-cols-[76px_1fr_1fr_1fr] items-center gap-2 text-[12px]">
                  <span className="text-stone-500">{CHECKPOINT_SHORT[c]}</span>
                  <Metric label="AUC" v={r.auc!} ref2={d.auc} fmt={(x) => x.toFixed(2)} />
                  <Metric label="Brier" v={r.brier!} ref2={d.brier} fmt={(x) => x.toFixed(3)} lowerBetter />
                  <Metric label="Cover" v={r.coverage80!} fmt={(x) => `${Math.round(x * 100)}%`} />
                </div>
              );
            })}
            <div className="text-[10.5px] text-stone-500">Small grey numbers = Direct GBM classifier. Coverage above 80% means the intervals are conservative; see the limitations in the report.</div>
          </div>
        </Card>
        <Card className="p-0">
          <CardHeader kicker="Calibration" title="Predicted vs observed late rate" info="Test shipments binned by predicted P(late). Points on the diagonal mean the probabilities can be trusted at face value." />
          <div className="p-4 pt-2"><Calibration data={data} /></div>
        </Card>
        <Card className="p-0">
          <CardHeader kicker="Explanation quality" title="Is the blamed stage the real culprit?" info="For late test shipments, among the stages still ahead: is the stage with the largest forecast overrun the stage with the largest true overrun? Ground truth comes from the simulator." />
          <div className="space-y-3 p-4 pt-4 sm:p-5 sm:pt-4">
            {S.attribution.map((a, i) => (
              <div key={a.checkpoint}>
                <div className="mb-1 flex justify-between text-[11.5px]"><span className="text-stone-500">{CHECKPOINT_SHORT[a.checkpoint]} <span className="text-stone-400">n={a.n}</span></span><span className="num font-semibold text-accent-700">{Math.round(a.model * 100)}%</span></div>
                <div className="relative h-2 rounded-full bg-stone-100">
                  <motion.div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent-700 to-accent-500" initial={{ width: 0 }} animate={{ width: `${a.model * 100}%` }} transition={{ duration: 0.9, delay: i * 0.08 }} />
                  <div className="absolute -top-0.5 h-3 w-0.5 rounded bg-amber-500" style={{ left: `${a.lane_baseline * 100}%` }} title="lane history" />
                  <div className="absolute -top-0.5 h-3 w-0.5 rounded bg-stone-500" style={{ left: `${a.chance * 100}%` }} title="chance" />
                </div>
              </div>
            ))}
            <div className="flex gap-4 text-[10.5px] text-stone-500"><span className="flex items-center gap-1"><span className="h-2.5 w-0.5 bg-amber-500" />lane's historically worst stage</span><span className="flex items-center gap-1"><span className="h-2.5 w-0.5 bg-stone-500" />random</span></div>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="p-0">
          <CardHeader kicker="Robustness" title="Missing milestone events" info="Extra milestone events (departure, arrival, discharge, release) are blanked at random in the test set, on top of the gaps already in the data. Average MAE over the in-transit checkpoints." />
          <div className="p-4 pt-2"><LineChart series={robSeries} height={240} xTicks={robust.map((r) => r.rate * 100)} xFormat={(v) => `${v.toFixed(0)}%`} yFormat={(v) => `${v.toFixed(0)}h`} xLabel="Share of events dropped" yLabel="MAE (h)" /></div>
        </Card>
        <Card className="p-0">
          <CardHeader kicker="Data scale" title="Learning curve" right={<Segmented size="sm" value={lcCp} onChange={setLcCp} options={[{ value: 0, label: "Booked" }, { value: 2, label: "Arrived" }]} />}
            info="The whole pipeline is re-run on larger simulated datasets (same generator, different seed) to show how much of the remaining error is a data-volume problem rather than a modelling one." />
          <div className="p-4 pt-2">
            {lc.length ? <LineChart key={lcCp} series={lcSeries} height={240} xTicks={lc.map((r) => Math.log10(r.n))} xFormat={(v) => `${Math.round(10 ** v)}`} yFormat={(v) => `${v.toFixed(0)}h`} xLabel="Shipments simulated" yLabel="MAE (h)" />
              : <div className="p-6 text-sm text-stone-500">Run <code>python -m eta.run</code> without <code>--fast</code>.</div>}
          </div>
        </Card>
        <Card className="p-0">
          <CardHeader kicker="Route variability" title="Error by lane" right={<Segmented size="sm" value={laneCp} onChange={setLaneCp} options={[{ value: 0, label: "Booked" }, { value: 2, label: "Arrived" }]} />}
            info="MAE per lane on the test set. Lanes with few test shipments (n) are noisy." />
          <div className="space-y-2 p-4 pt-4 sm:p-5 sm:pt-4">
            {S.per_lane.filter((r) => r.checkpoint === laneCp).sort((a, b) => a.stage_chain - b.stage_chain).map((r) => {
              const mx = Math.max(...S.per_lane.filter((q) => q.checkpoint === laneCp).flatMap((q) => [q.stage_chain, q.lane_history, q.direct_gbm]));
              return (
                <div key={r.lane_id} className="grid grid-cols-[86px_1fr_70px] items-center gap-2 text-[11px]">
                  <span className="num flex items-center gap-1.5 text-stone-700"><span className="h-1.5 w-1.5 rounded-full" style={{ background: LANE_COLORS[r.lane_id] }} />{r.lane_id}</span>
                  <div className="space-y-0.5">
                    <motion.div className="h-1.5 rounded-full bg-accent-600" initial={{ width: 0 }} animate={{ width: `${(r.stage_chain / mx) * 100}%` }} />
                    <motion.div className="h-1 rounded-full bg-amber-500/60" initial={{ width: 0 }} animate={{ width: `${(r.lane_history / mx) * 100}%` }} />
                  </div>
                  <span className="num text-right text-stone-500">{r.stage_chain.toFixed(0)}h <span className="text-stone-400">n{r.n}</span></span>
                </div>
              );
            })}
            <div className="flex gap-4 pt-1 text-[10.5px] text-stone-500"><span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded bg-accent-600" />Stage-chain</span><span className="flex items-center gap-1"><span className="h-1 w-3 rounded bg-amber-500/60" />Lane history</span></div>
          </div>
        </Card>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px]">
        <Pill color="#8B8680">Interval residual scale {S.config.resid_scale}</Pill>
        <Pill color="#8B8680">Late threshold {S.config.late_threshold_h}h</Pill>
        <Pill color="#8B8680">Seed {S.config.seed}</Pill>
      </div>
    </div>
  );
}

function Metric({ label, v, ref2, fmt, lowerBetter = false }: { label: string; v: number; ref2?: number; fmt: (x: number) => string; lowerBetter?: boolean }) {
  const better = ref2 == null ? null : lowerBetter ? v < ref2 : v > ref2;
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1">
      <div className="text-[11.5px] text-stone-400">{label}</div>
      <div className="num text-[12px]"><span className={better ? "text-ok" : "text-stone-800"}>{fmt(v)}</span>{ref2 != null && <span className="ml-1 text-[10px] text-stone-400">{fmt(ref2)}</span>}</div>
    </div>
  );
}

function Calibration({ data }: { data: AppData }) {
  const [cp, setCp] = useState(2);
  const pts = data.summary.calibration.filter((c) => c.checkpoint === cp);
  const W = 300, H = 230, m = 34;
  const sx = (v: number) => m + v * (W - m - 10), sy = (v: number) => H - m - v * (H - m - 10);
  return (
    <div>
      <div className="mb-2 flex justify-end"><Segmented size="sm" value={cp} onChange={setCp} options={[{ value: 0, label: "Booked" }, { value: 2, label: "Arrived" }]} /></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto h-[240px] w-full">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={sx(0)} x2={sx(1)} y1={sy(t)} y2={sy(t)} stroke="rgba(28,25,23,0.07)" />
            <text x={sx(0) - 6} y={sy(t)} dy="0.32em" textAnchor="end" fontSize={9} fill="rgba(87,83,78,.55)" className="num">{t * 100}%</text>
            <text x={sx(t)} y={H - m + 14} textAnchor="middle" fontSize={9} fill="rgba(87,83,78,.55)" className="num">{t * 100}%</text>
          </g>
        ))}
        <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke="rgba(28,25,23,.3)" strokeDasharray="4 4" />
        <motion.polyline key={cp} points={pts.map((p) => `${sx(p.predicted)},${sy(p.observed)}`).join(" ")} fill="none" stroke="#2952CC" strokeWidth={2} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9 }} />
        {pts.map((p) => (
          <motion.circle key={`${cp}-${p.bin}`} cx={sx(p.predicted)} cy={sy(p.observed)} r={3 + Math.sqrt(p.n)} fill="rgba(41,82,204,.25)" stroke="#2952CC" initial={{ scale: 0 }} animate={{ scale: 1 }} />
        ))}
        <text x={(sx(0) + sx(1)) / 2} y={H - 4} textAnchor="middle" fontSize={10} fill="rgba(87,83,78,.8)">Predicted P(late)</text>
        <text transform={`translate(9 ${(sy(0) + sy(1)) / 2}) rotate(-90)`} textAnchor="middle" fontSize={10} fill="rgba(87,83,78,.8)">Observed late rate</text>
      </svg>
    </div>
  );
}
