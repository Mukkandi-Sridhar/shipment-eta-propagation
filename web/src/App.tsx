import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Gauge, Globe2, Route, Waypoints } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppData } from "./lib/data";
import Evaluation from "./views/Evaluation";
import Method from "./views/Method";
import Overview from "./views/Overview";
import Propagation from "./views/Propagation";
import ShipmentView from "./views/Shipment";

const TABS = [
  { key: "overview", label: "Command center", icon: Globe2 },
  { key: "shipment", label: "Shipment intelligence", icon: Route },
  { key: "propagation", label: "Propagation lab", icon: Waypoints },
  { key: "evaluation", label: "Evaluation", icon: Gauge },
  { key: "method", label: "Method", icon: BookOpen },
] as const;
type Tab = (typeof TABS)[number]["key"];

function readHash(): { tab: Tab; id?: string } {
  const [t, id] = window.location.hash.replace(/^#\/?/, "").split("/");
  return { tab: (TABS.find((x) => x.key === t)?.key ?? "overview") as Tab, id };
}

export default function App() {
  const { data, error } = useAppData();
  const [tab, setTab] = useState<Tab>(readHash().tab);
  const [id, setId] = useState<string | null>(readHash().id ?? null);

  useEffect(() => {
    const on = () => { const h = readHash(); setTab(h.tab); if (h.id) setId(h.id); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => {
    const h = `#/${tab}${tab === "shipment" && id ? `/${id}` : ""}`;
    if (window.location.hash !== h) history.replaceState(null, "", h);
  }, [tab, id]);
  useEffect(() => {
    if (data && (!id || !data.shipments[id])) {
      const first = Object.values(data.shipments).sort((a, b) => b.predictions[1].p_late - a.predictions[1].p_late)[0];
      setId(first.id);
    }
  }, [data]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [tab]);

  const open = (sid: string) => { setId(sid); setTab("shipment"); };

  return (
    <div className="relative min-h-screen">
      <div className="backdrop" />
      <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1680px] items-center gap-4 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-300 to-violet-500 shadow-[0_0_24px_rgba(34,211,238,.45)]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#04060c" strokeWidth={2.4} strokeLinecap="round"><path d="M4 15c3-6 13-6 16 0" /><circle cx="12" cy="15" r="2.2" fill="#04060c" /></svg>
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-semibold tracking-tight text-white">Aiqon <span className="hidden font-normal text-slate-400 sm:inline">ETA Intelligence</span></div>
              <div className="hidden text-[10.5px] text-slate-500 sm:block">Delay prediction & propagation</div>
            </div>
          </div>
          <nav className="ml-auto flex gap-1 overflow-x-auto rounded-2xl [scrollbar-width:none] border border-white/5 bg-white/[0.02] p-1" aria-label="Sections">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} aria-current={tab === t.key ? "page" : undefined}
                className={`relative flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] font-medium transition-colors ${tab === t.key ? "text-white" : "text-slate-400 hover:text-slate-200"}`}>
                {tab === t.key && <motion.span layoutId="tab" className="absolute inset-0 rounded-xl border border-cyan-300/25 bg-cyan-300/10 shadow-[0_0_24px_-6px_rgba(34,211,238,.5)]" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                <t.icon size={14} className="relative" />
                <span className="relative hidden lg:inline">{t.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1680px] px-4 py-6 md:px-6">
        {error && <div className="rounded-2xl border border-bad/30 bg-bad/10 p-5 text-sm text-bad">Could not load dashboard data ({error}). Run <code>python -m eta.run</code> first.</div>}
        {!data && !error && <Loader />}
        {data && (
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 10, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -6, filter: "blur(4px)" }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
              {tab === "overview" && <Overview data={data} onOpen={open} />}
              {tab === "shipment" && id && <ShipmentView data={data} id={id} setId={setId} />}
              {tab === "propagation" && <Propagation data={data} />}
              {tab === "evaluation" && <Evaluation data={data} />}
              {tab === "method" && <Method />}
            </motion.div>
          </AnimatePresence>
        )}
        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-5 text-[11px] text-slate-600">
          <span>Sridhar Mukkandi · Aiqon AI Internship take-home</span>
          <span>Synthetic data · stage-chain gradient boosting · Monte-Carlo ETA · TreeSHAP</span>
        </footer>
      </main>
    </div>
  );
}

function Loader() {
  return (
    <div className="grid h-[70vh] place-items-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-14 w-14">
          <motion.div className="absolute inset-0 rounded-full border-2 border-cyan-300/20 border-t-cyan-300" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} />
          <motion.div className="absolute inset-2 rounded-full border-2 border-violet-400/20 border-b-violet-400" animate={{ rotate: -360 }} transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }} />
        </div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Loading forecasts</div>
      </div>
    </div>
  );
}
