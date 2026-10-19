import { AnimatePresence, motion } from "framer-motion";
import { CornerDownLeft, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AppData } from "../lib/data";
import { LANE_COLORS, fmtH, riskColor } from "../lib/data";

export interface PaletteView { key: string; label: string }

type Item = { kind: "view"; key: string; label: string } | { kind: "ship"; id: string; label: string; sub: string; p: number; d: number; lane: string };

/** ⌘K / Ctrl-K / "/" — jump to any page or test shipment. */
export default function CommandPalette({ data, views, open, setOpen, onView, onShip }: {
  data: AppData | null; views: PaletteView[]; open: boolean; setOpen: (o: boolean) => void; onView: (k: string) => void; onShip: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [setOpen]);
  useEffect(() => { if (open) { setQ(""); setSel(0); requestAnimationFrame(() => input.current?.focus()); } }, [open]);

  const items = useMemo<Item[]>(() => {
    const t = q.trim().toLowerCase();
    const v: Item[] = views.filter((x) => !t || x.label.toLowerCase().includes(t)).map((x) => ({ kind: "view", key: x.key, label: x.label }));
    const ships: Item[] = data ? Object.values(data.shipments)
      .filter((s) => !t || [s.id, s.lane, s.carrier, s.commodity, s.origin, s.dest, s.hub ?? "", s.inland_city,
        data.geo.ports[s.origin]?.name, data.geo.ports[s.dest]?.name, s.hub ? data.geo.ports[s.hub]?.name : ""].join(" ").toLowerCase().includes(t))
      .sort((a, b) => b.predictions[1].p_late - a.predictions[1].p_late)
      .slice(0, t ? 30 : 8)
      .map((s) => ({ kind: "ship", id: s.id, label: s.id, sub: `${s.lane} · ${s.carrier} · ${s.commodity}`, p: s.predictions[1].p_late, d: s.predictions[1].delay_p50_h, lane: s.lane })) : [];
    return [...v, ...ships];
  }, [q, data, views]);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" }); }, [sel]);

  const choose = (it: Item | undefined) => {
    if (!it) return;
    if (it.kind === "view") onView(it.key);
    else onShip(it.id);
    setOpen(false);
  };
  const firstShip = items.findIndex((i) => i.kind === "ship");

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center px-3 pt-[12vh]">
          <motion.div className="absolute inset-0 bg-stone-900/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
          <motion.div role="dialog" aria-label="Find a shipment or page" initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ duration: 0.15 }}
            className="relative w-full max-w-xl overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-stone-100 px-4">
              <Search size={16} className="text-stone-400" />
              <input ref={input} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Shipment id, lane, carrier, port, or a page…"
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
                  if (e.key === "Enter") choose(items[sel]);
                }}
                className="h-12 flex-1 bg-transparent text-[16px] text-stone-900 placeholder:text-stone-400 focus:outline-none sm:text-[14px]" />
              <kbd className="num hidden rounded border border-stone-200 px-1.5 text-[10.5px] text-stone-400 sm:block">esc</kbd>
            </div>
            <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
              {items.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-stone-500">Nothing matches “{q}”.</div>}
              {items.map((it, i) => (
                <div key={it.kind === "view" ? `v-${it.key}` : it.id}>
                  {(i === 0 && it.kind === "view") && <div className="px-3 pb-1 pt-2 text-[11px] text-stone-400">Pages</div>}
                  {i === firstShip && <div className="px-3 pb-1 pt-2 text-[11px] text-stone-400">{q ? "Shipments" : "Highest-risk shipments"}</div>}
                  <button data-i={i} onMouseMove={() => setSel(i)} onClick={() => choose(it)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${sel === i ? "bg-stone-100" : ""}`}>
                    {it.kind === "view" ? (
                      <span className="flex-1 text-[13.5px] text-stone-800">{it.label}</span>
                    ) : (
                      <>
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: LANE_COLORS[it.lane] }} />
                        <span className="min-w-0 flex-1">
                          <span className="num text-[13.5px] text-stone-900">{it.label}</span>
                          <span className="ml-2 truncate text-[12px] text-stone-500">{it.sub}</span>
                        </span>
                        <span className="num text-[12px] text-stone-500">{fmtH(it.d)}</span>
                        <span className="num w-10 text-right text-[12px] font-medium" style={{ color: riskColor(it.p) }}>{Math.round(it.p * 100)}%</span>
                      </>
                    )}
                    {sel === i && <CornerDownLeft size={13} className="hidden text-stone-400 sm:block" />}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
