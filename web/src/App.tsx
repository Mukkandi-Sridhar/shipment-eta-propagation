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
  { key: "overview", label: "Command center", short: "Network", icon: Globe2 },
  { key: "shipment", label: "Shipment intelligence", short: "Shipment", icon: Route },
  { key: "propagation", label: "Propagation lab", short: "Propagation", icon: Waypoints },
  { key: "evaluation", label: "Evaluation", short: "Accuracy", icon: Gauge },
  { key: "method", label: "Method", short: "Method", icon: BookOpen },
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
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-[#F7F6F2]/95">
        <div className="mx-auto flex max-w-[1680px] items-end gap-6 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-2.5 py-3.5">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden>
              <rect x="1" y="1" width="22" height="22" rx="5" fill="#1C1917" />
              <path d="M5.5 15.5h4l2-4 2 6 2-4h3" stroke="#F7F6F2" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="truncate text-[15px] font-semibold tracking-tight text-stone-900">Aiqon <span className="font-normal text-stone-500"><span className="hidden sm:inline">/ ETA &amp; delay propagation</span><span className="sm:hidden">/ {TABS.find((t) => t.key === tab)?.label}</span></span></div>
          </div>
          <nav className="ml-auto hidden gap-1 sm:flex" aria-label="Sections">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} aria-current={tab === t.key ? "page" : undefined}
                className={`relative flex shrink-0 items-center gap-2 px-3 pb-3.5 pt-3 text-[13px] font-medium transition-colors ${tab === t.key ? "text-stone-900" : "text-stone-500 hover:text-stone-800"}`}>
                <t.icon size={15} className="lg:hidden" />
                <span className="hidden lg:inline">{t.label}</span>
                {tab === t.key && <motion.span layoutId="tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-stone-900" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* phone tab bar */}
      <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] sm:hidden">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} aria-current={tab === t.key ? "page" : undefined}
            className={`relative flex flex-col items-center gap-1 pb-2 pt-2.5 text-[10.5px] font-medium ${tab === t.key ? "text-stone-900" : "text-stone-400"}`}>
            {tab === t.key && <motion.span layoutId="mtab" className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-stone-900" />}
            <t.icon size={19} strokeWidth={tab === t.key ? 2.2 : 1.8} />
            {t.short}
          </button>
        ))}
      </nav>

      <main className="relative z-10 mx-auto max-w-[1680px] px-3 pb-28 pt-4 sm:px-4 sm:py-6 md:px-6">
        {error && <div className="rounded-xl border border-bad/30 bg-bad/5 p-5 text-sm text-bad">Could not load dashboard data ({error}). Run <code>python -m eta.run</code> first.</div>}
        {!data && !error && <Loader />}
        {data && (
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              {tab === "overview" && <Overview data={data} onOpen={open} />}
              {tab === "shipment" && id && <ShipmentView data={data} id={id} setId={setId} />}
              {tab === "propagation" && <Propagation data={data} />}
              {tab === "evaluation" && <Evaluation data={data} />}
              {tab === "method" && <Method />}
            </motion.div>
          </AnimatePresence>
        )}
        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 pt-5 text-[11px] text-stone-400">
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
        <motion.div className="h-8 w-8 rounded-full border-2 border-stone-200 border-t-stone-800" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }} />
        <div className="text-[13px] text-stone-500">Loading forecasts…</div>
      </div>
    </div>
  );
}
