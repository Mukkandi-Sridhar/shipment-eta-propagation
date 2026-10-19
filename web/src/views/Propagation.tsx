import * as d3 from "d3";
import { motion } from "framer-motion";
import { useState } from "react";
import { Heatmap, LineChart, Scatter } from "../components/charts";
import { Card, CardHeader, Pill } from "../components/ui";
import type { AppData } from "../lib/data";
import { LANE_COLORS, STAGE_KEYS, STAGE_LABELS } from "../lib/data";

const rnd = (a: number, b: number) => { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); };
const STAGE_COL = ["#60a5fa", "#22d3ee", "#a78bfa", "#f472b6", "#fbbf24"];

export default function Propagation({ data }: { data: AppData }) {
  const A = data.summary.analyses;
  const [hl, setHl] = useState<string | null>(null);
  const series = A.propagation_curves.map((c) => ({
    key: c.lane_id, label: c.lane_id, color: LANE_COLORS[c.lane_id],
    points: c.points.map((p) => ({ x: p.dep_late, y: p.final })),
  }));
  const groups = Object.keys(A.stage_importance[0].groups);
  const maxImp = Math.max(...A.stage_importance.flatMap((s) => Object.values(s.groups)));

  return (
    <div className="space-y-5">
      <Cascade data={data} />
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card className="p-0">
          <CardHeader kicker="Learned propagation curves" title="How a departure delay turns into a delivery delay, by lane"
            info="Each curve takes one real test shipment per lane, injects a departure delay (x) and re-runs the full stage chain. Above the dashed y = x line, delay is amplified downstream (missed connections, berth windows, cut-offs); below it, slack and speed recovery absorb it." />
          <div className="p-4 pt-2">
            <LineChart series={series} identity height={320} xLabel="Departure delay injected (h)" yLabel="Predicted delivery delay (h)" yFormat={(v) => `${v}`} highlight={hl} onHover={setHl} />
            <div className="mt-3 grid gap-2 text-[11.5px] text-slate-400 md:grid-cols-3">
              <Insight color="#fb7185" title="Amplification">Transshipment lanes jump once lateness eats the hub buffer, because the box waits for the next connecting sailing.</Insight>
              <Insight color="#34d399" title="Absorption">On long direct lanes, carriers steam faster and win back part of a small delay before arrival.</Insight>
              <Insight color="#fbbf24" title="Step effects">Late arrivals miss berth windows, weekend customs closures and fixed-day rail ramps, so the curves rise in steps rather than straight lines.</Insight>
            </div>
          </div>
        </Card>
        <Card className="p-0">
          <CardHeader kicker="Observed in the data" title="Departure lateness vs final delay" info="All 300 journeys. Points far above the dashed y = x line are delays created later in the journey; points below it had their delay absorbed." />
          <div className="p-4 pt-2">
            <Scatter points={A.propagation_empirical.map((p, i) => ({ x: p.dep_late, y: p.final, key: String(i), group: p.lane_id }))} colorOf={(g) => LANE_COLORS[g]} height={320}
              xLabel="Departure lateness (h)" yLabel="Delivery delay (h)" />
            <div className="mt-2 text-[11px] leading-relaxed text-slate-500">
              The vertical spread at x ≈ 0 is the core point: most door-to-door delay is created <span className="text-slate-300">after</span> the vessel leaves, at the port, in customs and on the last mile. A model that only carries forward vessel lateness misses it.
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-0">
          <CardHeader kicker="Stage interaction" title="Congestion × lateness → port-stage overrun"
            info="Port-stage model response with the other inputs held at their median. Being late hurts far more in a congested port: the vessel loses its berth window and queues behind on-time calls, a queue that grows like u/(1−u)." />
          <div className="p-4 pt-2">
            <Heatmap {...(A.port_surface as any)} xLabel={A.port_surface.x_label} yLabel={A.port_surface.y_label} zLabel={A.port_surface.z_label}
              scheme={d3.interpolateMagma} yFmt={(v: number) => `${Math.round(v * 100)}%`} xFmt={(v: number) => `${v}h`} height={300} />
          </div>
        </Card>
        <Card className="p-0">
          <CardHeader kicker="Calendar effect" title="When the container lands → customs overrun"
            info="Customs-stage model response by the weekday and hour the container becomes available. Releases happen only Mon–Fri, 08–18, so boxes landing on Friday evening wait out the weekend. The model learned this from the data; it was never told the rule." />
          <div className="p-4 pt-2">
            <Heatmap x={A.customs_surface.x as number[]} y={A.customs_surface.y} z={A.customs_surface.z} xLabel={A.customs_surface.x_label} yLabel={A.customs_surface.y_label} zLabel={A.customs_surface.z_label}
              scheme={d3.interpolateViridis} xFmt={(v: number) => `${String(v).padStart(2, "0")}:00`} height={300} />
          </div>
        </Card>
      </div>

      <Card className="p-0">
        <CardHeader kicker="Global explanation" title="Which factors matter at which stage" info="Mean absolute TreeSHAP contribution (hours) of each factor group in each stage model, on its training rows. The structure matches real operations: upstream lateness and congestion dominate at the port, the customs risk profile and calendar in customs, slot timing on the last mile." />
        <div className="overflow-x-auto p-5 pt-4">
          <table className="w-full min-w-[720px] border-separate border-spacing-1 text-[11.5px]">
            <thead>
              <tr>
                <th className="w-48" />
                {A.stage_importance.map((s, i) => <th key={s.stage} className="pb-2 font-medium" style={{ color: STAGE_COL[i] }}>{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {groups.map((g, gi) => (
                <tr key={g}>
                  <td className="pr-3 text-right text-slate-400">{g}</td>
                  {A.stage_importance.map((s, i) => {
                    const v = s.groups[g];
                    const t = v / maxImp;
                    return (
                      <td key={s.stage} className="p-0">
                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: (gi + i) * 0.015 }}
                          className="num grid h-9 place-items-center rounded-lg text-[11px]"
                          style={{ background: `rgba(34,211,238,${0.04 + t * 0.7})`, color: t > 0.45 ? "#04060c" : "rgba(226,232,240,.75)", boxShadow: t > 0.5 ? "0 0 18px rgba(34,211,238,.35)" : undefined }}>
                          {v.toFixed(1)}h
                        </motion.div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Insight({ color, title, children }: { color: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />{title}</div>
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

/** Animated "delay river": particles flow through the five stages; their density
 *  is the share of late-shipment delay hours created at that stage. */
function Cascade({ data }: { data: AppData }) {
  const share = data.summary.dataset.stage_share_late;
  const tot = STAGE_KEYS.reduce((a, k) => a + share[k], 0);
  const W = 1000, H = 190;
  const xs = STAGE_KEYS.map((_, i) => 90 + i * 185);
  return (
    <Card className="overflow-hidden p-0" glow>
      <CardHeader kicker="The delay cascade" title="Delay is created at every stage and carried downstream"
        right={<Pill color="#67e8f9">Ground truth · {Math.round(data.summary.dataset.late_rate * 100)}% of shipments late</Pill>}
        info="Particles enter at each stage in proportion to the delay hours actually created there, across all late shipments, then ride the chain to delivery. The stream thickens downstream because delay accumulates; that accumulation is what the stage-chain model predicts." />
      <div className="px-2 pb-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Animated flow of delay through the five shipment stages">
          <defs>
            <linearGradient id="river" x1="0" x2="1">
              {STAGE_COL.map((c, i) => <stop key={i} offset={`${i * 25}%`} stopColor={c} />)}
            </linearGradient>
            <filter id="blur"><feGaussianBlur stdDeviation="6" /></filter>
          </defs>
          {(() => {
            let cum = 0;
            const widths = STAGE_KEYS.map((k) => { cum += share[k] / tot; return 6 + cum * 46; });
            const top = (i: number) => H / 2 - widths[i] / 2, bot = (i: number) => H / 2 + widths[i] / 2;
            const d = `M ${xs[0] - 60} ${H / 2 - 3} ` + xs.map((x, i) => `L ${x} ${top(i)}`).join(" ") + ` L ${W - 20} ${top(4)} L ${W - 20} ${bot(4)} ` + xs.slice().reverse().map((x, ri) => `L ${x} ${bot(4 - ri)}`).join(" ") + ` L ${xs[0] - 60} ${H / 2 + 3} Z`;
            return (
              <>
                <path d={d} fill="url(#river)" opacity={0.18} filter="url(#blur)" />
                <path d={d} fill="url(#river)" opacity={0.22} />
                {STAGE_KEYS.map((k, i) => {
                  const n = Math.max(2, Math.round((share[k] / tot) * 26));
                  return Array.from({ length: n }).map((_, p) => {
                    const yOff = (rnd(i * 31 + p, 1) - 0.5) * widths[4] * 0.8;
                    const dur = 3.2 + rnd(i * 31 + p, 2) * 1.6;
                    return (
                      <motion.circle key={`${k}-${p}`} r={2.2} fill={STAGE_COL[i]} style={{ filter: `drop-shadow(0 0 4px ${STAGE_COL[i]})` }}
                        initial={{ cx: xs[i], cy: H / 2 + yOff * (widths[i] / widths[4]), opacity: 0 }}
                        animate={{ cx: [xs[i], W - 20], cy: [H / 2 + yOff * (widths[i] / widths[4]), H / 2 + yOff], opacity: [0, 1, 1, 0] }}
                        transition={{ duration: dur * (1 - i * 0.16), repeat: Infinity, delay: rnd(i * 31 + p, 3) * 3, ease: "linear" }} />
                    );
                  });
                })}
                {STAGE_KEYS.map((k, i) => (
                  <g key={k}>
                    <circle cx={xs[i]} cy={H / 2} r={20} fill="#04060c" stroke={STAGE_COL[i]} strokeWidth={1.5} />
                    <circle cx={xs[i]} cy={H / 2} r={20} fill={STAGE_COL[i]} opacity={0.12} />
                    <text x={xs[i]} y={H / 2} dy="0.35em" textAnchor="middle" fontSize={12} fontWeight={600} fill={STAGE_COL[i]} className="num">{Math.round((share[k] / tot) * 100)}%</text>
                    <text x={xs[i]} y={H / 2 - 34} textAnchor="middle" fontSize={12} fill="rgba(226,232,240,.85)">{STAGE_LABELS[i]}</text>
                  </g>
                ))}
                <text x={W - 24} y={H / 2 - 34} textAnchor="end" fontSize={12} fill="#fff">Delivery</text>
              </>
            );
          })()}
        </svg>
      </div>
    </Card>
  );
}
