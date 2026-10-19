import * as d3 from "d3";
import { useEffect, useMemo, useRef, useState } from "react";
import { feature } from "topojson-client";
import land110 from "world-atlas/land-110m.json";
import type { FleetItem, Geo } from "../lib/data";
import { LANE_COLORS, delayColor, fmtH, hours } from "../lib/data";

const LAND = feature(land110 as any, (land110 as any).objects.land) as any;

interface Props {
  geo: Geo;
  fleet: FleetItem[];
  clockH: number; // network time (hours since epoch)
  focusLane?: string | null;
  focusId?: string | null;
  onPick?: (id: string) => void;
  height?: number;
  autoRotate?: boolean;
  centerX?: number; // horizontal centre as a fraction of width (wide layouts)
}

type Ship = { id: string; lane: string; pos: [number, number]; color: string; delay: number; late: boolean; cape: boolean };

function densify(coords: [number, number][]) {
  const out: [number, number][] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const interp = d3.geoInterpolate(coords[i], coords[i + 1]);
    const dist = d3.geoDistance(coords[i], coords[i + 1]);
    const n = Math.max(2, Math.ceil(dist / 0.02));
    for (let k = 0; k < n; k++) out.push(interp(k / n) as [number, number]);
  }
  out.push(coords[coords.length - 1]);
  return out;
}

function pathAt(pts: [number, number][], cum: number[], t: number): [number, number] {
  const target = t * cum[cum.length - 1];
  let i = d3.bisectLeft(cum, target);
  i = Math.min(Math.max(i, 1), cum.length - 1);
  const f = (target - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return d3.geoInterpolate(pts[i - 1], pts[i])(f) as [number, number];
}

export default function Globe({ geo, fleet, clockH, focusLane, focusId, onPick, height = 520, autoRotate = true, centerX = 0.5 }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(800);
  const rot = useRef<[number, number, number]>([-70, -18, 0]);
  const target = useRef<[number, number] | null>(null);
  const drag = useRef<{ x: number; y: number; r: [number, number, number] } | null>(null);
  const shipsRef = useRef<Ship[]>([]);
  const [hover, setHover] = useState<{ x: number; y: number; ship: Ship } | null>(null);
  const idle = useRef(0);

  const routes = useMemo(() => {
    const r: Record<string, { pts: [number, number][]; cum: number[]; capePts: [number, number][]; capeCum: number[] }> = {};
    for (const [id, l] of Object.entries(geo.lanes)) {
      const pts = densify(l.coords);
      const capePts = densify(l.cape);
      const cumOf = (p: [number, number][]) => p.reduce<number[]>((a, _, i) => (i === 0 ? [0] : [...a, a[i - 1] + d3.geoDistance(p[i - 1], p[i])]), []);
      r[id] = { pts, cum: cumOf(pts), capePts, capeCum: cumOf(capePts) };
    }
    return r;
  }, [geo]);

  // ships at sea at clock time
  useEffect(() => {
    const ships: Ship[] = [];
    for (const s of fleet) {
      const dep = hours(s.act.departed), arr = hours(s.act.arrived);
      if (clockH < dep || clockH > arr) continue;
      const t = (clockH - dep) / (arr - dep);
      const r = routes[s.lane];
      const pos = s.cape ? pathAt(r.capePts, r.capeCum, t) : pathAt(r.pts, r.cum, t);
      ships.push({ id: s.id, lane: s.lane, pos, color: delayColor(s.delay_h), delay: s.delay_h, late: s.late, cape: s.cape });
    }
    shipsRef.current = ships;
  }, [clockH, fleet, routes]);

  useEffect(() => {
    if (!focusLane) return;
    const l = geo.lanes[focusLane];
    const o = geo.ports[l.origin], d = geo.ports[l.dest];
    const mid = d3.geoInterpolate([o.lon, o.lat], [d.lon, d.lat])(0.5);
    const c = d3.geoCentroid({ type: "LineString", coordinates: l.coords } as any);
    const pick = Math.abs(o.lon - d.lon) > 150 ? mid : c;
    target.current = [-pick[0], -Math.max(-40, Math.min(40, pick[1]))];
  }, [focusLane, geo]);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = canvas.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = w * dpr;
    cv.height = height * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const R = Math.min(w, height) * 0.46;
    const gx = w > 700 ? w * centerX : w / 2;
    const proj = d3.geoOrthographic().scale(R).translate([gx, height / 2]).clipAngle(90);
    const path = d3.geoPath(proj, ctx);
    const grat = d3.geoGraticule10();
    let raf = 0;
    let last = performance.now();
    const portList = Object.entries(geo.ports);

    const frame = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      idle.current += dt;
      if (target.current) {
        const [tl, tp] = target.current;
        const r = rot.current;
        let dl = ((tl - r[0] + 540) % 360) - 180;
        r[0] += dl * 0.06;
        r[1] += (tp - r[1]) * 0.06;
        if (Math.abs(dl) < 0.2 && Math.abs(tp - r[1]) < 0.2) target.current = null;
      } else if (autoRotate && !drag.current && idle.current > 2500) {
        rot.current[0] += dt * 0.004;
      }
      proj.rotate(rot.current);
      ctx.clearRect(0, 0, w, height);

      // atmosphere
      const cx = gx, cy = height / 2;
      const glow = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.25);
      glow.addColorStop(0, "rgba(34,211,238,0.22)");
      glow.addColorStop(1, "rgba(34,211,238,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.25, 0, Math.PI * 2);
      ctx.fill();
      // ocean
      const oc = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      oc.addColorStop(0, "#0d1a33");
      oc.addColorStop(1, "#050a16");
      ctx.fillStyle = oc;
      ctx.beginPath();
      path({ type: "Sphere" } as any);
      ctx.fill();
      ctx.strokeStyle = "rgba(103,232,249,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // graticule
      ctx.beginPath();
      path(grat);
      ctx.strokeStyle = "rgba(148,163,184,0.06)";
      ctx.lineWidth = 0.6;
      ctx.stroke();
      // land
      ctx.beginPath();
      path(LAND);
      ctx.fillStyle = "rgba(148,163,184,0.13)";
      ctx.fill();
      ctx.strokeStyle = "rgba(186,230,253,0.22)";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // lanes
      const tPulse = (now / 1000) % 1;
      for (const [id, r] of Object.entries(routes)) {
        const focused = focusLane === id;
        const dim = focusLane && !focused;
        const col = LANE_COLORS[id] ?? "#67e8f9";
        ctx.beginPath();
        path({ type: "LineString", coordinates: r.pts } as any);
        ctx.strokeStyle = col + (dim ? "22" : focused ? "ee" : "66");
        ctx.lineWidth = focused ? 2.2 : 1.1;
        ctx.setLineDash(focused ? [] : [3, 4]);
        ctx.lineDashOffset = -tPulse * 14;
        ctx.stroke();
        ctx.setLineDash([]);
        if (focused) {
          ctx.beginPath();
          path({ type: "LineString", coordinates: r.pts } as any);
          ctx.strokeStyle = col + "33";
          ctx.lineWidth = 8;
          ctx.stroke();
        }
      }

      // ports
      for (const [code, p] of portList) {
        const vis = d3.geoDistance([p.lon, p.lat], [-rot.current[0], -rot.current[1]]) < Math.PI / 2;
        if (!vis) continue;
        const [x, y] = proj([p.lon, p.lat])!;
        const pr = 3 + 6 * ((now / 1600 + code.length * 0.13) % 1);
        ctx.beginPath();
        ctx.arc(x, y, pr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(103,232,249,${0.5 * (1 - (pr - 3) / 6)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = "#e6fbff";
        ctx.fill();
        ctx.font = "500 10px Inter Variable, sans-serif";
        ctx.fillStyle = "rgba(226,232,240,0.7)";
        ctx.fillText(p.name, x + 6, y - 6);
      }

      // ships
      for (const s of shipsRef.current) {
        const vis = d3.geoDistance(s.pos, [-rot.current[0], -rot.current[1]]) < Math.PI / 2 - 0.02;
        if (!vis) continue;
        const [x, y] = proj(s.pos)!;
        const sel = s.id === focusId;
        const dim = focusLane && s.lane !== focusLane;
        ctx.globalAlpha = dim ? 0.25 : 1;
        const g = ctx.createRadialGradient(x, y, 0, x, y, sel ? 14 : 8);
        g.addColorStop(0, s.color + "cc");
        g.addColorStop(1, s.color + "00");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, sel ? 14 : 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, sel ? 4 : 2.6, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.fill();
        if (sel) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const hit = (ev: PointerEvent) => {
      const rect = cv.getBoundingClientRect();
      const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      let best: Ship | null = null, bd = 12;
      for (const s of shipsRef.current) {
        if (d3.geoDistance(s.pos, [-rot.current[0], -rot.current[1]]) > Math.PI / 2) continue;
        const [x, y] = proj(s.pos)!;
        const d = Math.hypot(x - mx, y - my);
        if (d < bd) { bd = d; best = s; }
      }
      return { best, mx, my };
    };
    const down = (e: PointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY, r: [...rot.current] as any };
      target.current = null;
      cv.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      idle.current = 0;
      if (drag.current) {
        const k = 0.28;
        rot.current = [drag.current.r[0] + (e.clientX - drag.current.x) * k, Math.max(-60, Math.min(60, drag.current.r[1] - (e.clientY - drag.current.y) * k)), 0];
        setHover(null);
        return;
      }
      const { best, mx, my } = hit(e);
      setHover(best ? { x: mx, y: my, ship: best } : null);
      cv.style.cursor = best ? "pointer" : "grab";
    };
    const up = (e: PointerEvent) => {
      const moved = drag.current && Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) > 4;
      drag.current = null;
      if (!moved) {
        const { best } = hit(e);
        if (best && onPick) onPick(best.id);
      }
    };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointerleave", () => setHover(null));
    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
    };
  }, [w, height, routes, geo, focusLane, focusId, onPick, autoRotate, centerX]);

  return (
    <div ref={wrap} className="relative w-full select-none" style={{ height }}>
      <canvas ref={canvas} style={{ width: w, height }} className="block touch-none" aria-label="Interactive globe of shipment lanes; drag to rotate" />
      {hover && (
        <div className="pointer-events-none absolute z-20 rounded-xl border border-white/10 bg-ink-850/95 px-3 py-2 text-xs shadow-2xl backdrop-blur"
          style={{ left: hover.x + 14, top: hover.y + 10 }}>
          <div className="num font-semibold text-slate-100">{hover.ship.id}</div>
          <div className="text-slate-400">{hover.ship.lane}{hover.ship.cape ? " · via Cape" : ""}</div>
          <div className="mt-1" style={{ color: hover.ship.color }}>Final delay {fmtH(hover.ship.delay)}</div>
        </div>
      )}
    </div>
  );
}
