import { animate, motion, useInView, useMotionValue, useTransform } from "framer-motion";
import { ReactNode, useEffect, useRef, useState } from "react";

/** true below the given breakpoint (default: Tailwind `lg`). */
export function useIsMobile(max = 1023) {
  const q = `(max-width: ${max}px)`;
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

export function Card({ children, className = "", delay = 0, glow = false }: { children: ReactNode; className?: string; delay?: number; glow?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delay * 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`glass glass-hover relative rounded-xl ${glow ? "ring-1 ring-accent-200" : ""} ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function CardHeader({ title, kicker, right, info }: { title: ReactNode; kicker?: string; right?: ReactNode; info?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pt-4 sm:flex-nowrap sm:px-5">
      <div className="min-w-0">
        {kicker && <div className="mb-0.5 text-[11.5px] text-stone-500">{kicker}</div>}
        <div className="flex items-center gap-2 text-[15px] font-semibold text-stone-900">
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
      <button aria-label="More info" aria-expanded={open} onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)}
        className="grid h-5 w-5 place-items-center rounded-full border border-stone-300 text-[9.5px] font-semibold normal-case text-stone-400 hover:border-accent-300 hover:text-accent-600 sm:h-4 sm:w-4 sm:text-[9px]">i</button>
      {open && (
        <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className="fixed inset-x-3 bottom-20 z-[60] rounded-lg border border-stone-200 bg-white p-3.5 text-[13px] font-normal normal-case leading-relaxed text-stone-700 shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-6 sm:w-64 sm:-translate-x-1/2 sm:p-3 sm:text-xs">
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

export function Pill({ children, color = "#2952CC", className = "" }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${className}`}
      style={{ borderColor: `${color}33`, background: `${color}0f`, color }}>
      {children}
    </span>
  );
}

export function Dot({ color, pulse = false }: { color: string; pulse?: boolean }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${pulse ? "pulse-dot" : ""}`} style={{ background: color }} />;
}

export function Segmented<T extends string | number>({ options, value, onChange, size = "md" }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; size?: "sm" | "md" }) {
  const id = useRef(`seg-${Math.random().toString(36).slice(2)}`).current;
  return (
    <div className="inline-flex rounded-lg border border-stone-200 bg-stone-100/70 p-0.5">
      {options.map((o) => (
        <button key={String(o.value)} onClick={() => onChange(o.value)}
          className={`relative rounded-md ${size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-1.5 text-xs"} font-medium transition-colors ${value === o.value ? "text-stone-900" : "text-stone-500 hover:text-stone-800"}`}>
          {value === o.value && <motion.span layoutId={id} className="absolute inset-0 rounded-md border border-stone-200 bg-white shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Gauge({ value, size = 132, label = "P(late)" }: { value: number; size?: number; label?: string }) {
  const r = size / 2 - 12;
  const c = Math.PI * r; // half circle
  const color = value >= 0.6 ? "#D64545" : value >= 0.3 ? "#C98200" : "#1F9D6B";
  return (
    <div className="relative" style={{ width: size, height: size / 2 + 20 }}>
      <svg width={size} height={size / 2 + 12} viewBox={`0 0 ${size} ${size / 2 + 12}`}>
        <path d={`M12 ${size / 2} A ${r} ${r} 0 0 1 ${size - 12} ${size / 2}`} fill="none" stroke="#EEECE7" strokeWidth={10} strokeLinecap="round" />
        <motion.path d={`M12 ${size / 2} A ${r} ${r} 0 0 1 ${size - 12} ${size / 2}`} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value) }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="num text-2xl font-semibold" style={{ color }}><CountUp value={value * 100} suffix="%" /></div>
        <div className="text-[11px] text-stone-500">{label}</div>
      </div>
    </div>
  );
}

/** Briefing lines; they appear one after another. */
export function Narrative({ lines }: { lines: string[] }) {
  return (
    <ol className="space-y-2.5">
      {lines.map((l, k) => (
        <motion.li key={l} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: k * 0.12, duration: 0.3 }}
          className="grid grid-cols-[18px_1fr] text-[13.5px] leading-relaxed text-stone-700">
          <span className="num pt-[3px] text-[11px] text-stone-400">{k + 1}</span>
          <span>{l}</span>
        </motion.li>
      ))}
    </ol>
  );
}

export function Stat({ label, value, sub, accent = "#2952CC", delay = 0, info }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string; delay?: number; info?: string }) {
  return (
    <Card delay={delay} className="p-3.5 sm:p-4">
      <div className="flex items-center gap-1.5 text-[12px] text-stone-500"><span className="h-2 w-2 rounded-sm" style={{ background: accent }} />{label}{info && <InfoTip text={info} />}</div>
      <div className="num mt-2.5 text-[24px] font-medium leading-none text-stone-900 sm:text-[28px]">{value}</div>
      {sub && <div className="mt-2 text-xs text-stone-500">{sub}</div>}
    </Card>
  );
}

/** Page title block: what this page is for, in one line. */
export function PageHeader({ title, sub, right }: { title: string; sub: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-5">
      <div className="max-w-3xl">
        <h1 className="text-[20px] font-semibold tracking-tight text-stone-900 sm:text-[24px]">{title}</h1>
        <p className="mt-1 text-[13.5px] leading-relaxed text-stone-500 sm:text-[14px]">{sub}</p>
      </div>
      {right}
    </div>
  );
}

/** Tiny line of a value across the five checkpoints. */
export function Spark({ values, color = "#2952CC", w = 64, h = 20, max = 1 }: { values: number[]; color?: string; w?: number; h?: number; max?: number }) {
  const n = values.length - 1;
  const pts = values.map((v, i) => `${(i / n) * (w - 4) + 2},${h - 2 - (Math.min(v, max) / max) * (h - 4)}`).join(" ");
  const last = pts.split(" ").pop()!.split(",");
  return (
    <svg width={w} height={h} aria-hidden className="shrink-0">
      <line x1={2} x2={w - 2} y1={h - 2 - 0.5 * (h - 4)} y2={h - 2 - 0.5 * (h - 4)} stroke="#E7E5E0" strokeDasharray="2 2" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={+last[0]} cy={+last[1]} r={2.2} fill={color} />
    </svg>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="num rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[10.5px] text-stone-500 shadow-[0_1px_0_#d6d3cd]">{children}</kbd>;
}
