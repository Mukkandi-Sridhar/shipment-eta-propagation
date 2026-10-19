import * as d3 from "d3";
import { AnimatePresence, motion } from "framer-motion";
import { ReactNode, useEffect, useRef, useState } from "react";

export function useWidth<T extends HTMLElement>(initial = 600) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const AX = "rgba(87,83,78,.55)";
const GRID = "rgba(28,25,23,0.07)";

export interface Series {
  key: string;
  label: string;
  color: string;
  points: { x: number; y: number }[];
  dashed?: boolean;
  width?: number;
  band?: { x: number; lo: number; hi: number }[];
  dots?: boolean;
}

export function LineChart({ series, height = 260, xLabel, yLabel, xTicks, xFormat = (v) => String(v), yFormat = (v) => d3.format("~s")(v), identity = false, yDomain, legend = true, highlight, onHover }: {
  series: Series[]; height?: number; xLabel?: string; yLabel?: string; xTicks?: number[]; xFormat?: (v: number) => string; yFormat?: (v: number) => string; identity?: boolean; yDomain?: [number, number]; legend?: boolean; highlight?: string | null; onHover?: (k: string | null) => void;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hx, setHx] = useState<number | null>(null);
  const m = { t: 12, r: 16, b: 38, l: 48 };
  const all = series.flatMap((s) => s.points);
  const bandAll = series.flatMap((s) => s.band ?? []);
  const xs = d3.extent(all, (p) => p.x) as [number, number];
  const ylo = Math.min(d3.min(all, (p) => p.y) ?? 0, d3.min(bandAll, (b) => b.lo) ?? Infinity, 0);
  const yhi = Math.max(d3.max(all, (p) => p.y) ?? 1, d3.max(bandAll, (b) => b.hi) ?? -Infinity);
  const x = d3.scaleLinear().domain(xs).range([m.l, w - m.r]);
  const y = d3.scaleLinear().domain(yDomain ?? [ylo, yhi * 1.05]).nice().range([height - m.b, m.t]);
  const line = d3.line<{ x: number; y: number }>().x((p) => x(p.x)).y((p) => y(p.y)).curve(d3.curveMonotoneX);
  const area = d3.area<{ x: number; lo: number; hi: number }>().x((p) => x(p.x)).y0((p) => y(p.lo)).y1((p) => y(p.hi)).curve(d3.curveMonotoneX);
  const ticks = xTicks ?? x.ticks(6);
  const nearest = hx == null ? null : ticks.length && xTicks ? xTicks.reduce((a, b) => (Math.abs(b - hx) < Math.abs(a - hx) ? b : a)) : Math.round(hx);
  return (
    <div ref={ref} className="relative w-full">
      <svg width={w} height={height} onMouseMove={(e) => { const r = (e.currentTarget as SVGElement).getBoundingClientRect(); setHx(x.invert(e.clientX - r.left)); }} onMouseLeave={() => setHx(null)}>
        {y.ticks(5).map((t) => (
          <g key={t}>
            <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={AX} className="num">{yFormat(t)}</text>
          </g>
        ))}
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={height - m.b + 16} textAnchor="middle" fontSize={10} fill={AX} className="num">{xFormat(t)}</text>
        ))}
        {xLabel && <text x={(m.l + w - m.r) / 2} y={height - 4} textAnchor="middle" fontSize={10.5} fill="rgba(87,83,78,.8)">{xLabel}</text>}
        {yLabel && <text transform={`translate(11 ${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={10.5} fill="rgba(87,83,78,.8)">{yLabel}</text>}
        {identity && <line x1={x(xs[0])} y1={y(xs[0])} x2={x(xs[1])} y2={y(xs[1])} stroke="rgba(28,25,23,.35)" strokeDasharray="4 5" />}
        {series.map((s) => s.band && (
          <motion.path key={s.key + "b"} d={area(s.band) ?? ""} fill={s.color} initial={{ opacity: 0 }} animate={{ opacity: highlight && highlight !== s.key ? 0.04 : 0.14 }} transition={{ duration: 0.8 }} />
        ))}
        {series.map((s, i) => {
          const dim = highlight && highlight !== s.key;
          return (
            <g key={s.key} onMouseEnter={() => onHover?.(s.key)} onMouseLeave={() => onHover?.(null)}>
              <motion.path d={line(s.points) ?? ""} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dashed ? "5 5" : undefined}
                initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: dim ? 0.15 : 1 }} transition={{ duration: 1.2, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
  />
              {s.dots && s.points.map((p, k) => (
                <motion.circle key={k} cx={x(p.x)} cy={y(p.y)} r={3} fill="#FFFFFF" stroke={s.color} strokeWidth={1.6} initial={{ scale: 0 }} animate={{ scale: 1, opacity: dim ? 0.2 : 1 }} transition={{ delay: 0.6 + k * 0.05 }} />
              ))}
            </g>
          );
        })}
        {nearest != null && nearest >= xs[0] && nearest <= xs[1] && (
          <line x1={x(nearest)} x2={x(nearest)} y1={m.t} y2={height - m.b} stroke="rgba(41,82,204,.35)" />
        )}
      </svg>
      {nearest != null && nearest >= xs[0] && nearest <= xs[1] && (
        <div className="pointer-events-none absolute top-2 z-10 min-w-[150px] rounded-xl border border-stone-200 bg-white p-2.5 text-[11px] shadow-lg"
          style={{ left: Math.min(x(nearest) + 12, w - 190) }}>
          <div className="mb-1 text-stone-500">{xLabel}: <span className="num text-stone-800">{xFormat(nearest)}</span></div>
          {series.map((s) => {
            const p = s.points.reduce((a, b) => (Math.abs(b.x - nearest) < Math.abs(a.x - nearest) ? b : a), s.points[0]);
            return p ? (
              <div key={s.key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-stone-700"><span className="h-1.5 w-3 rounded-full" style={{ background: s.color }} />{s.label}</span>
                <span className="num text-stone-900">{yFormat(p.y)}</span>
              </div>
            ) : null;
          })}
        </div>
      )}
      {legend && (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-1">
          {series.map((s) => (
            <button key={s.key} onMouseEnter={() => onHover?.(s.key)} onMouseLeave={() => onHover?.(null)} className="flex items-center gap-1.5 text-[11px] text-stone-500 hover:text-stone-800">
              <span className="h-[3px] w-4 rounded-full" style={{ background: s.color, opacity: s.dashed ? 0.6 : 1 }} />{s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Heatmap({ x, y, z, xLabel, yLabel, zLabel, height = 260, scheme = d3.interpolateInferno, xFmt = (v) => String(v), yFmt = (v) => String(v) }: {
  x: (number | string)[]; y: (number | string)[]; z: number[][]; xLabel: string; yLabel: string; zLabel: string; height?: number; scheme?: (t: number) => string; xFmt?: (v: any) => string; yFmt?: (v: any) => string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hv, setHv] = useState<{ i: number; j: number } | null>(null);
  const m = { t: 8, r: 70, b: 38, l: 56 };
  const flat = z.flat();
  const [lo, hi] = d3.extent(flat) as [number, number];
  const col = d3.scaleSequential(scheme).domain([lo, hi * 1.05]);
  const cw = (w - m.l - m.r) / x.length;
  const ch = (height - m.t - m.b) / y.length;
  return (
    <div ref={ref} className="relative w-full">
      <svg width={w} height={height}>
        {y.map((yy, j) => (
          <g key={j}>
            {x.map((xx, i) => (
              <motion.rect key={i} x={m.l + i * cw + 1} y={height - m.b - (j + 1) * ch + 1} width={cw - 2} height={ch - 2} rx={2}
                fill={col(z[j][i])} initial={{ opacity: 0 }} animate={{ opacity: hv && (hv.i !== i || hv.j !== j) ? 0.75 : 1 }} transition={{ delay: (i + j) * 0.012 }}
                onMouseEnter={() => setHv({ i, j })} onMouseLeave={() => setHv(null)} />
            ))}
            {j % Math.ceil(y.length / 7) === 0 && <text x={m.l - 8} y={height - m.b - (j + 0.5) * ch} dy="0.32em" textAnchor="end" fontSize={10} fill={AX} className="num">{yFmt(yy)}</text>}
          </g>
        ))}
        {x.map((xx, i) => i % Math.ceil(x.length / 7) === 0 && (
          <text key={i} x={m.l + (i + 0.5) * cw} y={height - m.b + 15} textAnchor="middle" fontSize={10} fill={AX} className="num">{xFmt(xx)}</text>
        ))}
        <text x={(m.l + w - m.r) / 2} y={height - 4} textAnchor="middle" fontSize={10.5} fill="rgba(87,83,78,.8)">{xLabel}</text>
        <text transform={`translate(11 ${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={10.5} fill="rgba(87,83,78,.8)">{yLabel}</text>
        <defs>
          <linearGradient id={`hm-${zLabel.length}`} x1="0" y1="1" x2="0" y2="0">
            {d3.range(0, 1.01, 0.1).map((t) => <stop key={t} offset={`${t * 100}%`} stopColor={scheme(t)} />)}
          </linearGradient>
        </defs>
        <rect x={w - m.r + 18} y={m.t} width={10} height={height - m.t - m.b} rx={4} fill={`url(#hm-${zLabel.length})`} />
        <text x={w - m.r + 34} y={m.t + 6} fontSize={10} fill={AX} className="num">{hi.toFixed(0)}h</text>
        <text x={w - m.r + 34} y={height - m.b} fontSize={10} fill={AX} className="num">{lo.toFixed(0)}h</text>
      </svg>
      {hv && (
        <div className="pointer-events-none absolute z-10 rounded-xl border border-stone-200 bg-white p-2.5 text-[11px] shadow-lg"
          style={{ left: Math.min(m.l + (hv.i + 1) * cw + 8, w - 170), top: Math.max(0, height - m.b - (hv.j + 1) * ch - 10) }}>
          <div className="text-stone-500">{xLabel}: <span className="num text-stone-800">{xFmt(x[hv.i])}</span></div>
          <div className="text-stone-500">{yLabel}: <span className="num text-stone-800">{yFmt(y[hv.j])}</span></div>
          <div className="mt-1 text-accent-600">{zLabel}: <span className="num">{z[hv.j][hv.i].toFixed(1)}h</span></div>
        </div>
      )}
    </div>
  );
}

export function DivergingBars({ items, format = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}h`, height = 26 }: { items: { label: ReactNode; value: number; color?: string; key: string; muted?: boolean }[]; format?: (v: number) => string; height?: number }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return (
    <div className="space-y-1.5">
      <AnimatePresence initial={false}>
        {items.map((it, k) => {
          const pct = (Math.abs(it.value) / max) * 50;
          const pos = it.value >= 0;
          const c = it.color ?? (pos ? "#D64545" : "#1F9D6B");
          return (
            <motion.div key={it.key} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: k * 0.03 }}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_52px] items-center gap-3" style={{ height }}>
              <div className={`truncate text-[12px] ${it.muted ? "text-stone-500" : "text-stone-700"}`}>{it.label}</div>
              <div className="relative h-full">
                <div className="absolute inset-y-1 left-1/2 w-px bg-stone-200" />
                <motion.div className="absolute inset-y-[5px] rounded-md" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  style={{ left: pos ? "50%" : undefined, right: pos ? undefined : "50%", background: c, opacity: 0.85 }} />
              </div>
              <div className="num text-right text-[12px]" style={{ color: c }}>{format(it.value)}</div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function Histogram({ start, step, counts, markers, height = 150, truth }: { start: number; step: number; counts: number[]; markers: { x: number; label: string; color: string }[]; height?: number; truth?: number | null }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const m = { t: 18, r: 10, b: 24, l: 10 };
  const lastNZ = counts.reduce((a, c, i) => (c > 0.002 ? i : a), 0);
  const firstNZ = counts.findIndex((c) => c > 0.002);
  const lo = start + Math.max(0, firstNZ - 2) * step;
  const hi = Math.max(start + (lastNZ + 3) * step, (truth ?? -1e9) + step * 2, ...markers.map((mk) => mk.x + step * 2));
  const x = d3.scaleLinear().domain([lo, hi]).range([m.l, w - m.r]);
  const y = d3.scaleLinear().domain([0, d3.max(counts) ?? 1]).range([height - m.b, m.t]);
  const bw = Math.max(1, x(start + step) - x(start) - 2);
  return (
    <div ref={ref} className="w-full">
      <svg width={w} height={height}>
        <defs>
          <linearGradient id="histg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2952CC" />
            <stop offset="100%" stopColor="#7C5CC4" stopOpacity={0.3} />
          </linearGradient>
        </defs>
        {counts.map((c, i) => {
          const xv = start + i * step;
          if (xv < lo || xv > hi) return null;
          return (
            <motion.rect key={i} x={x(xv) + 1} width={bw} rx={2} fill="#2952CC" fillOpacity={0.75}
              initial={{ y: height - m.b, height: 0 }} animate={{ y: y(c), height: height - m.b - y(c) }} transition={{ duration: 0.7, delay: i * 0.008, ease: [0.22, 1, 0.36, 1] }} />
          );
        })}
        <line x1={m.l} x2={w - m.r} y1={height - m.b} y2={height - m.b} stroke={GRID} />
        {x.ticks(6).map((t) => (
          <text key={t} x={x(t)} y={height - 6} textAnchor="middle" fontSize={9.5} fill={AX} className="num">{t > 0 ? "+" : ""}{t}h</text>
        ))}
        {markers.map((mk, i) => (
          <g key={mk.label}>
            <motion.line initial={{ opacity: 0 }} animate={{ opacity: 1, x1: x(mk.x), x2: x(mk.x) }} y1={m.t - 4} y2={height - m.b} stroke={mk.color} strokeWidth={1.3} strokeDasharray="3 3" />
            <motion.text animate={{ x: x(mk.x) + (i > 0 && Math.abs(x(mk.x) - x(markers[0].x)) < 44 ? (mk.x >= markers[0].x ? 22 : -22) : 0) }} y={m.t - 7} textAnchor="middle" fontSize={9.5} fill={mk.color} fontWeight={600}>{mk.label}</motion.text>
          </g>
        ))}
        {truth != null && (
          <motion.g initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
            <line x1={x(truth)} x2={x(truth)} y1={m.t} y2={height - m.b} stroke="#1C1917" strokeWidth={2} />
            <circle cx={x(truth)} cy={m.t} r={3.5} fill="#1C1917" />
          </motion.g>
        )}
      </svg>
    </div>
  );
}

export function Bars({ items, max, format = (v: number) => v.toFixed(0), color = "#2952CC" }: { items: { key: string; label: ReactNode; value: number; color?: string; sub?: ReactNode }[]; max?: number; format?: (v: number) => string; color?: string }) {
  const mx = max ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-2.5">
      {items.map((it, k) => (
        <div key={it.key}>
          <div className="mb-1 flex items-baseline justify-between text-[12px]">
            <span className="text-stone-700">{it.label}</span>
            <span className="num text-stone-500">{format(it.value)}{it.sub}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
            <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${(it.value / mx) * 100}%` }} transition={{ duration: 0.9, delay: k * 0.05, ease: [0.22, 1, 0.36, 1] }}
              style={{ background: it.color ?? color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Scatter({ points, height = 260, xLabel, yLabel, identity = true, colorOf }: { points: { x: number; y: number; key: string; group: string }[]; height?: number; xLabel: string; yLabel: string; identity?: boolean; colorOf: (g: string) => string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const m = { t: 10, r: 14, b: 38, l: 48 };
  const x = d3.scaleLinear().domain([0, Math.min(220, d3.max(points, (p) => p.x) ?? 1)]).nice().range([m.l, w - m.r]);
  const y = d3.scaleLinear().domain([Math.min(0, d3.min(points, (p) => p.y) ?? 0), d3.max(points, (p) => p.y) ?? 1]).nice().range([height - m.b, m.t]);
  return (
    <div ref={ref} className="w-full">
      <svg width={w} height={height}>
        {y.ticks(5).map((t) => (
          <g key={t}>
            <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={AX} className="num">{t}</text>
          </g>
        ))}
        {x.ticks(6).map((t) => <text key={t} x={x(t)} y={height - m.b + 16} textAnchor="middle" fontSize={10} fill={AX} className="num">{t}</text>)}
        <text x={(m.l + w - m.r) / 2} y={height - 4} textAnchor="middle" fontSize={10.5} fill="rgba(87,83,78,.8)">{xLabel}</text>
        <text transform={`translate(11 ${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={10.5} fill="rgba(87,83,78,.8)">{yLabel}</text>
        {identity && <line x1={x(0)} y1={y(0)} x2={x(x.domain()[1])} y2={y(x.domain()[1])} stroke="rgba(28,25,23,.35)" strokeDasharray="4 5" />}
        {points.filter((p) => p.x <= x.domain()[1]).map((p, i) => (
          <motion.circle key={p.key} cx={x(p.x)} cy={y(p.y)} r={3.2} fill={colorOf(p.group)} fillOpacity={0.7} stroke={colorOf(p.group)}
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2 + i * 0.002 }} />
        ))}
      </svg>
    </div>
  );
}
