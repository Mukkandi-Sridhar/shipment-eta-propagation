import { animate, motion, useInView, useMotionValue, useTransform } from "framer-motion";
import { ReactNode, useEffect, useRef, useState } from "react";

export function Card({ children, className = "", delay = 0, glow = false }: { children: ReactNode; className?: string; delay?: number; glow?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`glass glass-hover relative rounded-2xl ${glow ? "shadow-glow" : ""} ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function CardHeader({ title, kicker, right, info }: { title: ReactNode; kicker?: string; right?: ReactNode; info?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4">
      <div className="min-w-0">
        {kicker && <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300/70">{kicker}</div>}
        <div className="flex items-center gap-2 text-[15px] font-semibold text-slate-100">
          {title}
          {info && <InfoTip text={info} />}
        </div>
      </div>
      {right}
    </div>
  );
}

export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button aria-label="More info" onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        className="grid h-4 w-4 place-items-center rounded-full border border-white/15 text-[9px] font-bold text-slate-400 hover:text-cyan-300">i</button>
      {open && (
        <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className="absolute left-1/2 top-6 z-50 w-64 -translate-x-1/2 rounded-xl border border-white/10 bg-ink-850/95 p-3 text-xs font-normal leading-relaxed text-slate-300 shadow-2xl backdrop-blur">
          {text}
        </motion.span>
      )}
    </span>
  );
}

export function CountUp({ value, decimals = 0, prefix = "", suffix = "", className = "", duration = 1.1 }: { value: number; decimals?: number; prefix?: string; suffix?: string; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${prefix}${v.toFixed(decimals)}${suffix}`);
  const prev = useRef(0);
  useEffect(() => {
    if (!inView) return;
    mv.set(prev.current);
    const c = animate(mv, value, { duration, ease: [0.22, 1, 0.36, 1] });
    prev.current = value;
    return c.stop;
  }, [value, inView]);
  return <motion.span ref={ref} className={`num ${className}`}>{text}</motion.span>;
}

export function Pill({ children, color = "#67e8f9", className = "" }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}
      style={{ borderColor: `${color}40`, background: `${color}14`, color }}>
      {children}
    </span>
  );
}

export function Dot({ color, pulse = false }: { color: string; pulse?: boolean }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${pulse ? "pulse-dot" : ""}`} style={{ background: color, boxShadow: `0 0 8px ${color}` }} />;
}

export function Segmented<T extends string | number>({ options, value, onChange, size = "md" }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; size?: "sm" | "md" }) {
  const id = useRef(`seg-${Math.random().toString(36).slice(2)}`).current;
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
      {options.map((o) => (
        <button key={String(o.value)} onClick={() => onChange(o.value)}
          className={`relative rounded-lg ${size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-1.5 text-xs"} font-medium transition-colors ${value === o.value ? "text-ink-950" : "text-slate-400 hover:text-slate-200"}`}>
          {value === o.value && <motion.span layoutId={id} className="absolute inset-0 rounded-lg bg-cyan-300" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Gauge({ value, size = 132, label = "P(late)" }: { value: number; size?: number; label?: string }) {
  const r = size / 2 - 12;
  const c = Math.PI * r; // half circle
  const color = value >= 0.6 ? "#fb7185" : value >= 0.3 ? "#fbbf24" : "#34d399";
  return (
    <div className="relative" style={{ width: size, height: size / 2 + 20 }}>
      <svg width={size} height={size / 2 + 12} viewBox={`0 0 ${size} ${size / 2 + 12}`}>
        <defs>
          <linearGradient id="gaugeg" x1="0" x2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#fb7185" />
          </linearGradient>
        </defs>
        <path d={`M12 ${size / 2} A ${r} ${r} 0 0 1 ${size - 12} ${size / 2}`} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={10} strokeLinecap="round" />
        <motion.path d={`M12 ${size / 2} A ${r} ${r} 0 0 1 ${size - 12} ${size / 2}`} fill="none" stroke="url(#gaugeg)" strokeWidth={10} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value) }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 6px ${color}88)` }} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="num text-2xl font-semibold" style={{ color }}><CountUp value={value * 100} suffix="%" /></div>
        <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      </div>
    </div>
  );
}

export function Typewriter({ lines, speed = 12 }: { lines: string[]; speed?: number }) {
  const [shown, setShown] = useState(0);
  const total = lines.join("\u0000").length;
  useEffect(() => {
    setShown(0);
    let i = 0;
    const t = setInterval(() => {
      i += 3;
      setShown(i);
      if (i >= total) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [lines.join("|")]);
  let left = shown;
  return (
    <div className="space-y-2.5">
      {lines.map((l, k) => {
        const part = l.slice(0, Math.max(0, left));
        left -= l.length + 1;
        if (!part) return null;
        const typing = part.length < l.length;
        return (
          <div key={k} className="flex gap-2.5 text-[13px] leading-relaxed text-slate-300">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-cyan-300/80" />
            <span>
              {part}
              {typing && <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-cyan-300/80 pulse-dot" />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Stat({ label, value, sub, accent = "#67e8f9", delay = 0, info }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string; delay?: number; info?: string }) {
  return (
    <Card delay={delay} className="overflow-hidden p-4">
      <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-25 blur-2xl" style={{ background: accent }} />
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}{info && <InfoTip text={info} />}</div>
      <div className="mt-2 text-[28px] font-semibold leading-none text-slate-50">{value}</div>
      {sub && <div className="mt-2 text-xs text-slate-400">{sub}</div>}
    </Card>
  );
}
