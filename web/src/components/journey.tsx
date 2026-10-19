import * as d3 from "d3";
import { motion } from "framer-motion";
import type { Prediction, ShipmentDetail } from "../lib/data";
import { fmtDate, fmtH, hours } from "../lib/data";
import { useWidth } from "./charts";

const STAGE_COL = ["#60a5fa", "#22d3ee", "#a78bfa", "#f472b6", "#fbbf24"];

/** Gantt of scheduled vs reported/forecast stage windows, with the ETA band. */
export function JourneyTimeline({ s, p, truth }: { s: ShipmentDetail; p: Prediction; truth: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const rowH = 34;
  const m = { t: 26, r: 18, b: 26, l: 112 };
  const H = m.t + rowH * 5 + m.b;
  const t0 = hours(p.stages[0].sched_start) - 24;
  const ends = p.stages.map((st) => (st.end ? hours(st.end) : hours(st.start)));
  const t1 = Math.max(hours(p.eta_p90), ...ends, truth ? hours(s.truth.delivered) : 0) + 24;
  const x = d3.scaleLinear().domain([t0, t1]).range([m.l, w - m.r]);
  const now = hours(p.now);
  const ticks = d3.range(Math.ceil(t0 / 24) * 24, t1, 24 * Math.max(1, Math.round((t1 - t0) / 24 / 8)));
  return (
    <div ref={ref} className="w-full">
      <svg width={w} height={H}>
        <defs>
          <pattern id="fc-stripe" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="rgba(255,255,255,0.0)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,.18)" strokeWidth="2" />
          </pattern>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={m.t - 6} y2={H - m.b} stroke="rgba(148,163,184,.07)" />
            <text x={x(t)} y={H - 8} textAnchor="middle" fontSize={9.5} fill="rgba(148,163,184,.55)" className="num">{fmtDate(new Date(t * 3.6e6).toISOString().slice(0, 16), false)}</text>
          </g>
        ))}
        {/* ETA band */}
        <motion.rect initial={false} animate={{ x: x(hours(p.eta_p10)), width: Math.max(2, x(hours(p.eta_p90)) - x(hours(p.eta_p10))) }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          y={m.t - 8} height={rowH * 5 + 8} fill="rgba(34,211,238,.07)" stroke="rgba(34,211,238,.25)" strokeDasharray="3 4" rx={6} />
        <motion.line initial={false} animate={{ x1: x(hours(p.eta_p50)), x2: x(hours(p.eta_p50)) }} transition={{ duration: 0.7 }} y1={m.t - 8} y2={m.t + rowH * 5} stroke="#22d3ee" strokeWidth={1.5} />
        <motion.text initial={false} animate={{ x: x(hours(p.eta_p50)) }} transition={{ duration: 0.7 }} y={m.t - 12} textAnchor="middle" fontSize={10} fill="#67e8f9" fontWeight={600}>ETA P50</motion.text>
        <line x1={x(hours(p.sched_delivery))} x2={x(hours(p.sched_delivery))} y1={m.t - 8} y2={m.t + rowH * 5} stroke="rgba(226,232,240,.5)" strokeDasharray="2 3" />
        <text x={x(hours(p.sched_delivery))} y={m.t - 12} textAnchor="end" dx={-4} fontSize={10} fill="rgba(226,232,240,.6)">Promise</text>
        {truth && (
          <g>
            <line x1={x(hours(s.truth.delivered))} x2={x(hours(s.truth.delivered))} y1={m.t - 8} y2={m.t + rowH * 5} stroke="#fff" strokeWidth={2} />
            <text x={x(hours(s.truth.delivered))} y={m.t + rowH * 5 + 12} textAnchor="middle" fontSize={10} fill="#fff" fontWeight={600}>Actual</text>
          </g>
        )}
        {p.checkpoint > 0 && (
          <g>
            <line x1={x(now)} x2={x(now)} y1={m.t - 8} y2={m.t + rowH * 5} stroke="#34d399" strokeWidth={1.2} />
            <circle cx={x(now)} cy={m.t - 8} r={3} fill="#34d399" className="pulse-dot" />
          </g>
        )}
        {p.stages.map((st, i) => {
          const y = m.t + i * rowH;
          const ss = hours(st.sched_start), se = hours(st.sched_end);
          const a0 = hours(st.start), a1 = st.end ? hours(st.end) : a0;
          const fc = st.status === "forecast" || st.status === "unreported";
          const minW = 3;
          return (
            <g key={st.stage}>
              <text x={12} y={y + rowH / 2} dy="0.32em" fontSize={11.5} fill="rgba(226,232,240,.85)">{st.label}</text>
              <rect x={x(ss)} y={y + 6} width={Math.max(minW, x(se) - x(ss))} height={rowH - 12} rx={5} fill="none" stroke="rgba(226,232,240,.22)" strokeDasharray="3 3" />
              {st.status !== "merged" && (
                <>
                  <motion.rect initial={false} animate={{ x: x(a0), width: Math.max(minW, x(a1) - x(a0)) }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    y={y + 9} height={rowH - 18} rx={4} fill={STAGE_COL[i]} fillOpacity={fc ? 0.35 : 0.9} style={{ filter: fc ? undefined : `drop-shadow(0 0 6px ${STAGE_COL[i]}88)` }} />
                  {fc && <motion.rect initial={false} animate={{ x: x(a0), width: Math.max(minW, x(a1) - x(a0)) }} transition={{ duration: 0.7 }} y={y + 9} height={rowH - 18} rx={4} fill="url(#fc-stripe)" />}
                </>
              )}
              {st.status === "merged" && <text x={x(ss) + 6} y={y + rowH / 2} dy="0.32em" fontSize={10} fill="rgba(251,191,36,.8)">no event received</text>}
              {st.excess_h != null && (
                <motion.text initial={false} animate={{ x: Math.max(x(a1), x(se)) + 6 }} transition={{ duration: 0.7 }} y={y + rowH / 2} dy="0.32em" fontSize={10.5} className="num"
                  fill={st.excess_h > 12 ? "#fb7185" : st.excess_h > 2 ? "#fbbf24" : "#34d399"}>{fmtH(st.excess_h)}{fc ? " ·fcst" : ""}</motion.text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-4 px-1 text-[10.5px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded border border-dashed border-slate-500" />Scheduled</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded bg-cyan-400" />Reported</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded bg-cyan-400/35" />Forecast</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded border border-dashed border-cyan-400/50 bg-cyan-400/10" />ETA P10–P90</span>
        {p.checkpoint > 0 && <span className="flex items-center gap-1.5"><span className="h-2.5 w-px bg-ok" />Now</span>}
      </div>
    </div>
  );
}

/** Waterfall from "on schedule" to the expected delay, splitting each forecast
 *  stage into new (local) delay vs knock-on from upstream lateness. */
export function DelayWaterfall({ p }: { p: Prediction }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  type Seg = { key: string; label: string; local: number; knock: number; kind: "obs" | "fc" | "total" };
  const reported = p.stages.filter((s) => s.status === "reported" || s.status === "merged");
  const obs = p.observed_lateness_h;
  const segs: Seg[] = [];
  if (reported.length) segs.push({ key: "obs", label: "Observed", local: obs, knock: 0, kind: "obs" });
  for (const st of p.stages) {
    if (st.status === "forecast" || st.status === "unreported") {
      segs.push({ key: st.stage, label: st.label.replace("Destination ", ""), local: st.local_h ?? st.excess_h ?? 0, knock: st.knock_on_h ?? 0, kind: "fc" });
    }
  }
  const total = segs.reduce((a, s) => a + s.local + s.knock, 0);
  segs.push({ key: "total", label: "Expected", local: total, knock: 0, kind: "total" });
  const H = 230, m = { t: 22, r: 8, b: 40, l: 40 };
  let run = 0;
  const bars = segs.map((s) => {
    if (s.kind === "total") return { ...s, y0: 0, y1: total, mid: total };
    const y0 = run;
    const mid = run + s.local;
    run = mid + s.knock;
    return { ...s, y0, y1: run, mid };
  });
  const ext = d3.extent(bars.flatMap((b) => [b.y0, b.y1, b.mid, 0])) as [number, number];
  const y = d3.scaleLinear().domain([Math.min(ext[0], 0) - 4, ext[1] + 6]).nice().range([H - m.b, m.t]);
  const x = d3.scaleBand().domain(bars.map((b) => b.key)).range([m.l, w - m.r]).padding(0.28);
  return (
    <div ref={ref} className="w-full">
      <svg width={w} height={H}>
        {y.ticks(5).map((t) => (
          <g key={t}>
            <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "rgba(226,232,240,.25)" : "rgba(148,163,184,.07)"} />
            <text x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={9.5} fill="rgba(148,163,184,.55)" className="num">{t}h</text>
          </g>
        ))}
        {bars.map((b, i) => {
          const bx = x(b.key)!, bw = x.bandwidth();
          const col = b.kind === "obs" ? "#94a3b8" : b.kind === "total" ? "#22d3ee" : "#a78bfa";
          const top = (a: number, c: number) => y(Math.max(a, c));
          const hgt = (a: number, c: number) => Math.max(1.5, Math.abs(y(a) - y(c)));
          return (
            <g key={b.key}>
              <motion.rect initial={false} animate={{ y: top(b.y0, b.mid), height: hgt(b.y0, b.mid) }} transition={{ duration: 0.7, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                x={bx} width={bw} rx={4} fill={col} fillOpacity={b.kind === "total" ? 0.9 : 0.75} style={{ filter: `drop-shadow(0 0 6px ${col}55)` }} />
              {b.kind === "fc" && Math.abs(b.knock) > 0.5 && (
                <motion.rect initial={false} animate={{ y: top(b.mid, b.y1), height: hgt(b.mid, b.y1) }} transition={{ duration: 0.7, delay: i * 0.05 + 0.1 }}
                  x={bx} width={bw} rx={4} fill={b.knock > 0 ? "#fb7185" : "#34d399"} fillOpacity={0.85} />
              )}
              {i < bars.length - 1 && b.kind !== "total" && (
                <line x1={bx + bw} x2={x(bars[i + 1].key)!} y1={y(b.y1)} y2={y(b.y1)} stroke="rgba(226,232,240,.25)" strokeDasharray="2 3" />
              )}
              <motion.text initial={false} animate={{ y: y(Math.max(b.y0, b.y1, b.mid)) - 6 }} x={bx + bw / 2} textAnchor="middle" fontSize={10} className="num" fill="rgba(226,232,240,.85)">
                {fmtH(b.kind === "total" ? total : b.local + b.knock)}
              </motion.text>
              <text x={bx + bw / 2} y={H - m.b + 14} textAnchor="middle" fontSize={10} fill="rgba(148,163,184,.75)">{b.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-4 px-1 text-[10.5px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-400" />Already happened</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-violet-400" />New delay at stage</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-bad" />Knock-on (amplified)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ok" />Absorbed by slack</span>
      </div>
    </div>
  );
}
