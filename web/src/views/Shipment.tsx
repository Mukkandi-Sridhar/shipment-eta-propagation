import { AnimatePresence, motion } from "framer-motion";
import { Anchor, ArrowRight, Eye, EyeOff, FileWarning, Pause, Play, RotateCcw, Search, Ship, Train, Truck, UserPlus, Wand2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DelayWaterfall, JourneyTimeline } from "../components/journey";
import { DivergingBars, Histogram, LineChart } from "../components/charts";
import { Card, CardHeader, CountUp, Gauge, Pill, Segmented, Narrative } from "../components/ui";
import { apiAlive, whatIf } from "../lib/api";
import type { AppData, Prediction, ShipmentDetail } from "../lib/data";
import { CAUSE_LABELS, CHECKPOINT_SHORT, LANE_COLORS, STAGE_KEYS, STAGE_LABELS, fmtDate, fmtH, riskColor } from "../lib/data";

export default function ShipmentView({ data, id, setId }: { data: AppData; id: string; setId: (id: string) => void }) {
  const s = data.shipments[id];
  const [cp, setCp] = useState(1);
  const [reveal, setReveal] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [scenario, setScenario] = useState<Prediction | null>(null);
  useEffect(() => { setScenario(null); }, [id, cp]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setCp((c) => { if (c >= 4) { setPlaying(false); return 4; } return c + 1; }), 2600);
    return () => clearInterval(t);
  }, [playing]);

  const base = s.predictions[cp];
  const p = scenario ?? base;

  return (
    <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
      <ShipmentList data={data} id={id} setId={(v) => { setId(v); setReveal(false); }} cp={cp} />
      <div className="min-w-0 space-y-5">
        <Header s={s} />
        <Card className="p-4" delay={0.05}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CheckpointStepper cp={cp} setCp={(c) => { setPlaying(false); setCp(c); }} s={s} />
            <div className="flex items-center gap-2">
              <button onClick={() => { if (cp >= 4) setCp(0); setPlaying((v) => !v); }}
                className="flex items-center gap-2 rounded-xl border border-accent-200 bg-accent-50 px-3 py-2 text-xs font-medium text-accent-700 transition hover:bg-accent-100">
                {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? "Pause" : "Replay journey"}
              </button>
              <button onClick={() => setReveal((v) => !v)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${reveal ? "border-stone-500 bg-stone-200 text-stone-900" : "border-stone-200 text-stone-500 hover:text-stone-800"}`}>
                {reveal ? <Eye size={13} /> : <EyeOff size={13} />} {reveal ? "Actual shown" : "Reveal actual"}
              </button>
            </div>
          </div>
        </Card>

        <div className="grid gap-5 2xl:grid-cols-[1.05fr_1fr]">
          <EtaCard s={s} p={p} reveal={reveal} scenario={!!scenario} />
          <Card delay={0.1} className="p-0">
            <CardHeader kicker={scenario ? "What-if scenario" : p.checkpoint_label} title="Why this forecast"
              info="Generated from the model's own numbers (stage forecasts, knock-on counterfactuals, SHAP factor sums), so every sentence traces back to a quantity on this page. Template-based, not an LLM, so it cannot invent causes." />
            <div className="p-5 pt-4">
              <Narrative lines={p.narrative} />
              {p.actions && p.actions.length > 0 && (
                <div className="mt-5 space-y-2">
                  <div className="text-[11.5px] text-stone-500">Recommended actions</div>
                  {p.actions.map((a) => (
                    <motion.div key={a.title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
                      <Wand2 size={14} className="mt-0.5 shrink-0 text-accent-600" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-medium text-stone-800">{a.title}</div>
                        <div className="text-[11px] text-stone-500">{a.detail}</div>
                      </div>
                      {a.impact_h != null && <span className="num shrink-0 rounded-md bg-ok/10 px-2 py-0.5 text-[11px] font-semibold text-ok">{fmtH(a.impact_h)}</span>}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        <Card delay={0.15} className="p-0">
          <CardHeader kicker="Stage timeline" title="Planned vs reported vs forecast" info="Dashed outlines are the carrier's planned stage windows. Solid bars are reported milestones; striped bars are the chain's forecast for the remaining stages. The shaded column is the 80% delivery window." />
          <div className="p-4 pt-3"><JourneyTimeline s={s} p={p} truth={reveal} /></div>
        </Card>

        <div className="grid gap-5 2xl:grid-cols-2">
          <Card delay={0.2} className="p-0">
            <CardHeader kicker="Delay propagation" title="How the delay builds up, stage by stage"
              info="Each forecast stage is split into new delay created there and knock-on: the extra (or saved) time caused only by entering the stage late. Knock-on = stage forecast at the actual lateness minus the forecast if the shipment had arrived on time, with all else equal." />
            <div className="p-4 pt-3"><DelayWaterfall p={p} /></div>
          </Card>
          <Card delay={0.25} className="p-0">
            <CardHeader kicker="Attribution" title="What is driving the forecast"
              info="Interventional TreeSHAP for every remaining stage model, measured against shipments that arrive at that stage on time, then summed along the chain and grouped into business factors. Observed + reference + factors = expected delay." />
            <div className="p-5 pt-4">
              <DivergingBars items={p.factors.filter((f) => f.kind !== "factor" || Math.abs(f.hours) >= 0.5).map((f) => ({
                key: f.group, label: f.group, value: f.hours, muted: f.kind !== "factor",
                color: f.kind === "observed" ? "#8B8680" : f.kind === "baseline" ? "#A8A29E" : undefined,
              }))} />
              <div className="mt-3 flex items-center justify-between border-t border-stone-200 pt-3 text-[12px]">
                <span className="text-stone-500">Expected delay (sum)</span>
                <span className="num font-semibold text-accent-600">{fmtH(p.delay_mean_h)}</span>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid gap-5 2xl:grid-cols-[1fr_1.1fr]">
          <Convergence s={s} reveal={reveal} cp={cp} />
          <WhatIf s={s} cp={cp} base={base} scenario={scenario} setScenario={setScenario} />
        </div>

        <AnimatePresence>{reveal && <TruthCard s={s} p={base} />}</AnimatePresence>
      </div>
    </div>
  );
}

function Header({ s }: { s: ShipmentDetail }) {
  const ports = [s.origin, s.hub, s.dest].filter(Boolean) as string[];
  const names: Record<string, string> = { CNSHA: "Shanghai", CNYTN: "Yantian", SGSIN: "Singapore", KRPUS: "Busan", INNSA: "Nhava Sheva", INMAA: "Chennai", VNSGN: "Ho Chi Minh", LKCMB: "Colombo", NLRTM: "Rotterdam", DEHAM: "Hamburg", USLAX: "Los Angeles", USNYC: "New York", AEJEA: "Jebel Ali" };
  return (
    <Card className="overflow-hidden p-5">
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <motion.h2 key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="num text-2xl font-semibold text-stone-900">{s.id}</motion.h2>
            <Pill color={LANE_COLORS[s.lane]}>{s.lane}</Pill>
            {s.red_sea_diversion && <Pill color="#D64545">Red Sea diversion</Pill>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-stone-700">
            {ports.map((c, i) => (
              <span key={c} className="flex items-center gap-2">
                <span className="flex items-center gap-1.5"><Anchor size={12} className="text-accent-600" />{names[c] ?? c}{c === s.hub && <span className="text-[10px] text-stone-500">(hub)</span>}</span>
                {i < ports.length - 1 && <ArrowRight size={12} className="text-stone-400" />}
              </span>
            ))}
            <ArrowRight size={12} className="text-stone-400" />
            <span className="flex items-center gap-1.5">{s.inland_mode === "rail" ? <Train size={12} className="text-amber-700" /> : <Truck size={12} className="text-amber-700" />}{s.inland_city}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <Pill color="#8B8680"><Ship size={11} />{s.carrier} · rel {Math.round(s.carrier_reliability * 100)}%</Pill>
          <Pill color="#8B8680">{s.commodity}</Pill>
          <Pill color="#8B8680">{(s.vessel_teu / 1000).toFixed(1)}k TEU</Pill>
          {!s.docs_complete && <Pill color="#C98200"><FileWarning size={11} />Docs incomplete</Pill>}
          {s.new_importer && <Pill color="#C98200"><UserPlus size={11} />New importer</Pill>}
        </div>
      </div>
    </Card>
  );
}

function CheckpointStepper({ cp, setCp, s }: { cp: number; setCp: (c: number) => void; s: ShipmentDetail }) {
  return (
    <div className="flex items-center">
      {CHECKPOINT_SHORT.map((l, i) => {
        const done = i <= cp;
        const missing = i > 0 && !s.milestones[i - 1].reported;
        return (
          <div key={l} className="flex items-center">
            <button onClick={() => setCp(i)} className="group flex flex-col items-center gap-1.5 px-1" aria-label={`Checkpoint ${l}`}>
              <span className={`relative grid h-7 w-7 place-items-center rounded-full border text-[11px] font-semibold transition ${i === cp ? "border-accent-600 bg-accent-600 text-white" : done ? "border-accent-200 bg-accent-50 text-accent-700" : "border-stone-300 text-stone-500 group-hover:border-stone-400"}`}>
                {i + 1}
                {missing && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" title="Milestone event not received" />}
              </span>
              <span className={`text-[10.5px] ${i === cp ? "text-accent-700" : "text-stone-500"}`}>{l}</span>
            </button>
            {i < 4 && (
              <div className="relative mx-1 mb-5 h-px w-8 bg-stone-200 sm:w-12">
                <motion.div className="absolute inset-y-0 left-0 bg-accent-600" initial={false} animate={{ width: i < cp ? "100%" : "0%" }} transition={{ duration: 0.5 }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EtaCard({ s, p, reveal, scenario }: { s: ShipmentDetail; p: Prediction; reveal: boolean; scenario: boolean }) {
  const col = riskColor(p.p_late);
  return (
    <Card delay={0.08} className="overflow-hidden p-0" glow={scenario}>
      <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full opacity-20 blur-3xl" style={{ background: col }} />
      <CardHeader kicker={scenario ? "What-if scenario" : `Forecast · ${p.checkpoint_label}`} title="Estimated delivery"
        info="ETA = promised delivery + predicted delay. P50 is the median of 400 Monte-Carlo journeys, each sampling residual errors stage by stage, so uncertainty propagates down the chain along with the delay." />
      <div className="grid gap-4 p-5 pt-3 md:grid-cols-[1fr_auto]">
        <div>
          <motion.div key={p.eta_p50} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="num text-[38px] font-semibold leading-none tracking-tight text-stone-900">
            {fmtDate(p.eta_p50)}
          </motion.div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="num font-semibold" style={{ color: col }}><CountUp value={p.delay_p50_h} decimals={0} prefix={p.delay_p50_h > 0 ? "+" : ""} suffix="h" /></span>
            <span className="text-stone-500">vs promise {fmtDate(p.sched_delivery)}</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[["P10", p.eta_p10, p.delay_p10_h], ["P50", p.eta_p50, p.delay_p50_h], ["P90", p.eta_p90, p.delay_p90_h]].map(([k, d, h]) => (
              <div key={k as string} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                <div className="text-[11.5px] text-stone-500">{k}</div>
                <div className="num text-[12px] text-stone-800">{fmtDate(d as string)}</div>
                <div className="num text-[11px] text-stone-500">{fmtH(h as number)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center">
          <Gauge value={p.p_late} label={`P(late > 24h)`} />
        </div>
      </div>
      <div className="px-4 pb-4">
        <Histogram {...p.histogram} truth={reveal ? s.truth.delay_h : null}
          markers={[{ x: 0, label: "Promise", color: "rgba(28,25,23,.7)" }, { x: p.delay_p50_h, label: "P50", color: "#2952CC" }]} />
        <div className="px-1 text-[10.5px] text-stone-500">Distribution of delivery delay across simulated futures{reveal ? " · white line = what actually happened" : ""}</div>
      </div>
    </Card>
  );
}

function Convergence({ s, reveal, cp }: { s: ShipmentDetail; reveal: boolean; cp: number }) {
  const pts = s.predictions.map((p, i) => ({ x: i, y: p.delay_p50_h }));
  const band = s.predictions.map((p, i) => ({ x: i, lo: p.delay_p10_h, hi: p.delay_p90_h }));
  const series = [
    { key: "p50", label: "Forecast P50 (band = P10–P90)", color: "#2952CC", points: pts, band, dots: true },
    ...(reveal ? [{ key: "truth", label: "Actual delay", color: "#1C1917", points: pts.map((q) => ({ x: q.x, y: s.truth.delay_h })), dashed: true, width: 1.5 }] : []),
  ];
  return (
    <Card delay={0.3} className="p-0">
      <CardHeader kicker="Forecast convergence" title="How the ETA tightens as milestones arrive" info="Each point is the forecast at one checkpoint. The band should narrow and close in on the actual outcome as more of the journey is observed." />
      <div className="p-4 pt-2">
        <LineChart key={String(reveal)} series={series} height={230} xTicks={[0, 1, 2, 3, 4]} xFormat={(v) => CHECKPOINT_SHORT[v]} yFormat={(v) => `${v}h`} xLabel="Checkpoint" yLabel="Delay vs promise" />
        <div className="mt-1 text-[10.5px] text-stone-500">Current checkpoint: <span className="text-accent-600">{CHECKPOINT_SHORT[cp]}</span></div>
      </div>
    </Card>
  );
}

function WhatIf({ s, cp, base, scenario, setScenario }: { s: ShipmentDetail; cp: number; base: Prediction; scenario: Prediction | null; setScenario: (p: Prediction | null) => void }) {
  const inp = (base as any).inputs ?? {};
  const [alive, setAlive] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState({ cong: inp.cong_dest_now ?? 0.8, weather: inp.weather_now ?? 0.3, extra: 0, docs: !!inp.docs_complete, rel: inp.carrier_reliability ?? 0.55 });
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => { apiAlive().then(setAlive); }, []);
  useEffect(() => { setV({ cong: inp.cong_dest_now ?? 0.8, weather: inp.weather_now ?? 0.3, extra: 0, docs: !!inp.docs_complete, rel: inp.carrier_reliability ?? 0.55 }); }, [s.id, cp]);
  const dirty = Math.abs(v.cong - inp.cong_dest_now) > 0.004 || Math.abs(v.weather - inp.weather_now) > 0.004 || v.extra !== 0 || v.docs !== !!inp.docs_complete || Math.abs(v.rel - inp.carrier_reliability) > 0.004;
  useEffect(() => {
    if (!alive) return;
    if (!dirty) { setScenario(null); return; }
    const t = setTimeout(() => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      setBusy(true);
      whatIf({ shipment_id: s.id, checkpoint: cp, extra_lateness_h: v.extra, overrides: { cong_dest_now: v.cong, weather_now: v.weather, docs_complete: v.docs, carrier_reliability: v.rel } }, ctrl.current.signal)
        .then(setScenario).catch(() => {}).finally(() => setBusy(false));
    }, 220);
    return () => clearTimeout(t);
  }, [v, alive]);

  const d50 = scenario ? scenario.delay_p50_h - base.delay_p50_h : 0;
  const dp = scenario ? scenario.p_late - base.p_late : 0;
  const slider = (label: string, val: number, min: number, max: number, step: number, set: (x: number) => void, fmt: (x: number) => string, hint: string) => (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
        <span className="text-stone-700">{label}<span className="ml-2 text-[10.5px] text-stone-500">{hint}</span></span>
        <span className="num text-accent-700">{fmt(val)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => set(+e.target.value)} className="w-full" disabled={!alive}
        style={{ ["--p" as any]: `${((val - min) / (max - min)) * 100}%` }} />
    </label>
  );
  return (
    <Card delay={0.35} className="p-0" glow={!!scenario}>
      <CardHeader kicker="Change the inputs, re-run the chain" title="What if…"
        right={<div className="flex items-center gap-2">
          {busy && <span className="h-1 w-10 rounded-full shimmer" />}
          <button onClick={() => setV({ cong: inp.cong_dest_now, weather: inp.weather_now, extra: 0, docs: !!inp.docs_complete, rel: inp.carrier_reliability })} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-stone-500 hover:bg-stone-100 hover:text-stone-800"><RotateCcw size={11} />Reset</button>
        </div>}
        info="Changes the inputs the model sees at this checkpoint and re-runs the whole stage chain live, so the effects propagate downstream. Runs on the FastAPI backend." />
      <div className="space-y-4 p-5 pt-4">
        {alive === false && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
            Live re-forecasting needs the model API. Run <code className="num rounded bg-stone-100 px-1.5 py-0.5">make serve</code> and open the dashboard from <code className="num">localhost:8000</code>.
          </div>
        )}
        {slider("Extra upstream delay", v.extra, 0, 168, 6, (x) => setV({ ...v, extra: x }), (x) => `+${x}h`, "a late vessel or a rollover")}
        {slider("Destination port utilisation", v.cong, 0.55, 0.96, 0.01, (x) => setV({ ...v, cong: x }), (x) => `${Math.round(x * 100)}%`, `now ${Math.round(inp.cong_dest_now * 100)}%`)}
        {slider("Weather severity on lane", v.weather, 0, 1, 0.02, (x) => setV({ ...v, weather: x }), (x) => x.toFixed(2), `now ${inp.weather_now?.toFixed(2)}`)}
        {slider("Carrier reliability", v.rel, 0.4, 0.8, 0.01, (x) => setV({ ...v, rel: x }), (x) => `${Math.round(x * 100)}%`, s.carrier)}
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-stone-700">Customs documents complete</span>
          <Segmented size="sm" value={v.docs ? "y" : "n"} onChange={(x) => alive && setV({ ...v, docs: x === "y" })} options={[{ value: "y", label: "Complete" }, { value: "n", label: "Incomplete" }]} />
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-stone-200 pt-4">
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
            <div className="text-[11.5px] text-stone-500">Δ ETA (P50)</div>
            <div className="num mt-1 text-xl font-semibold" style={{ color: d50 > 0.5 ? "#D64545" : d50 < -0.5 ? "#1F9D6B" : "#8B8680" }}>{scenario ? fmtH(d50) : "—"}</div>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
            <div className="text-[11.5px] text-stone-500">Δ P(late)</div>
            <div className="num mt-1 text-xl font-semibold" style={{ color: dp > 0.01 ? "#D64545" : dp < -0.01 ? "#1F9D6B" : "#8B8680" }}>{scenario ? `${dp > 0 ? "+" : ""}${Math.round(dp * 100)} pts` : "—"}</div>
          </div>
        </div>
        {scenario && (
          <div className="space-y-1.5">
            {STAGE_KEYS.map((k, i) => {
              const a = base.stages[i].excess_h ?? 0, b = scenario.stages[i].excess_h ?? 0;
              if (base.stages[i].status === "reported") return null;
              return (
                <div key={k} className="grid grid-cols-[110px_1fr_56px] items-center gap-2 text-[11px]">
                  <span className="text-stone-500">{STAGE_LABELS[i]}</span>
                  <div className="relative h-2 rounded-full bg-stone-100">
                    <motion.div className="absolute inset-y-0 left-0 rounded-full bg-stone-500/60" animate={{ width: `${Math.min(100, Math.max(0, a) / 1.5)}%` }} />
                    <motion.div className="absolute inset-y-0 left-0 rounded-full bg-[#7C5CC4]" animate={{ width: `${Math.min(100, Math.max(0, b) / 1.5)}%` }} style={{ mixBlendMode: "screen" }} />
                  </div>
                  <span className="num text-right" style={{ color: b - a > 0.5 ? "#D64545" : b - a < -0.5 ? "#1F9D6B" : "#8B8680" }}>{fmtH(b - a)}</span>
                </div>
              );
            })}
            <div className="pt-1 text-[10.5px] text-stone-500">Grey = base forecast, violet = scenario (per-stage overrun). The rest of the page now shows the scenario.</div>
          </div>
        )}
      </div>
    </Card>
  );
}

function TruthCard({ s, p }: { s: ShipmentDetail; p: Prediction }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
      <Card className="p-0">
        <CardHeader kicker="Ground truth from the simulator" title="Did the explanation point at the right place?"
          info="The simulator logs every mechanism it triggered and the true overrun of each stage. Compare those with the model's forecast at the selected checkpoint." />
        <div className="grid gap-6 p-5 pt-4 lg:grid-cols-[260px_1fr]">
          <div>
            <div className="text-[11.5px] text-stone-500">Actual delivery</div>
            <div className="num mt-1 text-2xl font-semibold text-stone-900">{fmtDate(s.truth.delivered)}</div>
            <div className="num text-sm" style={{ color: s.truth.delay_h > 24 ? "#D64545" : "#1F9D6B" }}>{fmtH(s.truth.delay_h)} vs promise · forecast {fmtH(p.delay_p50_h)}</div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {s.truth.causes.length ? s.truth.causes.map((c) => <Pill key={c} color="#D64545">{CAUSE_LABELS[c] ?? c}</Pill>) : <Pill color="#1F9D6B">No disruptions triggered</Pill>}
            </div>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-[120px_1fr_1fr] gap-3 text-[11.5px] text-stone-500"><span>Stage</span><span>Actual overrun</span><span>Forecast at {CHECKPOINT_SHORT[p.checkpoint]}</span></div>
            {STAGE_KEYS.map((k, i) => {
              const act = s.truth.excess[k];
              const st = p.stages[i];
              const max = Math.max(24, ...STAGE_KEYS.map((q) => Math.abs(s.truth.excess[q])), ...p.stages.map((q) => Math.abs(q.excess_h ?? 0)));
              const bar = (val: number, col: string) => (
                <div className="relative h-5 rounded bg-stone-100">
                  <motion.div className="absolute inset-y-0 left-0 rounded" initial={{ width: 0 }} animate={{ width: `${(Math.max(0, val) / max) * 100}%` }} style={{ background: col }} />
                  <span className="num absolute inset-y-0 right-2 flex items-center text-[10.5px] text-stone-700">{fmtH(val)}</span>
                </div>
              );
              return (
                <div key={k} className="grid grid-cols-[120px_1fr_1fr] items-center gap-3 text-[12px]">
                  <span className="text-stone-700">{STAGE_LABELS[i]}</span>
                  {bar(act, "rgba(255,255,255,.5)")}
                  {st.status === "reported" ? <span className="text-[11px] text-stone-500">already reported</span> : st.excess_h == null ? <span className="text-[11px] text-amber-700">merged</span> : bar(st.excess_h, "rgba(124,92,196,.7)")}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function ShipmentList({ data, id, setId, cp }: { data: AppData; id: string; setId: (id: string) => void; cp: number }) {
  const [q, setQ] = useState("");
  const [risk, setRisk] = useState<"all" | "high" | "low">("all");
  const list = useMemo(() => Object.values(data.shipments)
    .filter((s) => !q || `${s.id} ${s.lane} ${s.carrier} ${s.commodity}`.toLowerCase().includes(q.toLowerCase()))
    .filter((s) => risk === "all" || (risk === "high" ? s.predictions[cp].p_late >= 0.5 : s.predictions[cp].p_late < 0.5))
    .sort((a, b) => b.predictions[cp].p_late - a.predictions[cp].p_late), [data, q, risk, cp]);
  return (
    <Card className="flex max-h-[calc(100vh-120px)] flex-col p-0 xl:sticky xl:top-[88px]">
      <div className="space-y-3 p-4">
        <div className="text-[11.5px] text-accent-600">Test shipments · unseen in training</div>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search id, lane, carrier…" aria-label="Search shipments"
            className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2 pl-8 pr-3 text-[12.5px] text-stone-800 placeholder:text-stone-400 focus:border-accent-300 focus:outline-none" />
        </div>
        <Segmented size="sm" value={risk} onChange={setRisk} options={[{ value: "all", label: `All` }, { value: "high", label: "At risk" }, { value: "low", label: "On track" }]} />
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {list.map((s) => {
          const p = s.predictions[cp];
          const sel = s.id === id;
          return (
            <button key={s.id} onClick={() => setId(s.id)}
              className={`relative w-full rounded-xl px-3 py-2.5 text-left transition ${sel ? "bg-accent-50" : "hover:bg-stone-100"}`}>
              {sel && <motion.span layoutId="sel-ship" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent-600" />}
              <div className="flex items-center justify-between gap-2">
                <span className="num text-[12.5px] font-medium text-stone-800">{s.id}</span>
                <span className="num text-[11px] font-semibold" style={{ color: riskColor(p.p_late) }}>{Math.round(p.p_late * 100)}%</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-stone-500">
                <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: LANE_COLORS[s.lane] }} />{s.lane} · {s.carrier}</span>
                <span className="num">{fmtH(p.delay_p50_h)}</span>
              </div>
              <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full" style={{ width: `${p.p_late * 100}%`, background: riskColor(p.p_late) }} />
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
