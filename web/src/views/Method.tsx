import { motion } from "framer-motion";
import { AlertTriangle, Boxes, Calculator, Database, GitBranch, Layers, Microscope, Workflow } from "lucide-react";
import { Card, CardHeader, PageHeader } from "../components/ui";

const STEPS = [
  { icon: Database, title: "Mechanistic simulator", body: "300 journeys on 9 lanes. Port utilisation and weather are daily time series shared by every ship in the same place at the same time, so delays are correlated the way real ones are." },
  { icon: Layers, title: "Five-stage decomposition", body: "Origin → ocean → port → customs → last mile. Stage overrun = actual duration − scheduled duration. The five overruns add up exactly to the delivery delay." },
  { icon: GitBranch, title: "Stage-chain model", body: "One gradient-boosted model per stage. Inputs: lateness entering the stage plus what is knowable at prediction time. Chaining them carries the delay downstream." },
  { icon: Calculator, title: "Monte-Carlo ETA", body: "400 sampled futures per forecast, with out-of-fold residuals injected at every stage, give P10/P50/P90 and P(late). Uncertainty compounds the way the delay does." },
  { icon: Microscope, title: "Additive explanation", body: "Observed delay + on-time reference + knock-on + factor SHAP = expected delay. Narratives are built only from these numbers." },
];

export default function Method() {
  return (
    <div className="space-y-5">
      <PageHeader title="Method" sub="How the data was generated, how ETA and delay are defined, how the model works, and what it cannot do." />
      <Card className="p-0" glow>
        <CardHeader kicker="System design" title={<span className="flex items-center gap-2"><Workflow size={15} className="text-accent-600" />From raw events to an explained ETA</span>} />
        <div className="grid gap-3 p-4 pt-4 sm:p-5 sm:pt-4 md:grid-cols-5">
          {STEPS.map((s, i) => (
            <motion.div key={s.title} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.1 }}
              className="relative rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-50 text-accent-600"><s.icon size={17} /></span>
                <span className="num text-[11px] text-stone-400">0{i + 1}</span>
              </div>
              <div className="text-[13px] font-semibold text-stone-900">{s.title}</div>
              <div className="mt-1.5 text-[12px] leading-relaxed text-stone-500">{s.body}</div>
              {i < STEPS.length - 1 && <div className="absolute -right-2.5 top-1/2 hidden h-px w-5 bg-stone-300 md:block" />}
            </motion.div>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-0">
          <CardHeader kicker="Definitions" title="How ETA and delay are measured" />
          <div className="space-y-3 p-4 pt-4 sm:p-5 sm:pt-4 text-[12.5px] leading-relaxed text-stone-700">
            <Def k="Promised delivery">Carrier schedule + planned port, customs and inland buffers, fixed at booking (for rail: the first ramp departure after the appointment).</Def>
            <Def k="Delivery delay">Actual proof-of-delivery − promised delivery, in hours. <span className="text-stone-500">Late</span> = delay &gt; 24h.</Def>
            <Def k="Stage overrun">(actual end − actual start) − (scheduled end − scheduled start). Overruns sum to the delivery delay.</Def>
            <Def k="Checkpoint">The moment a forecast is made: booking (48h before sailing), departure, arrival, discharge, customs release. Only information reported by then is used: congestion and weather <em>as observed then</em>, not as they turned out.</Def>
            <Def k="ETA">Promised delivery + P50 of the predicted delay, shown with its P10–P90 window.</Def>
            <Def k="Knock-on">Stage forecast at the actual entry lateness − forecast with entry lateness 0, all else equal. Positive = amplification, negative = absorption.</Def>
          </div>
        </Card>
        <Card className="p-0">
          <CardHeader kicker="Mechanisms in the simulator" title={<span className="flex items-center gap-2"><Boxes size={15} className="text-[#7C5CC4]" />Real logistics behaviour encoded</span>} />
          <div className="grid gap-2 p-4 pt-4 sm:p-5 sm:pt-4 text-[12px] text-stone-700 sm:grid-cols-2">
            {[
              ["Rollovers", "Congested origin + low-reliability carrier → cargo bumped to next week's sailing (+168h)."],
              ["Speed recovery", "Late vessels steam faster, recovering up to ~4.5% of the transit time."],
              ["Transshipment", "Miss the hub buffer → wait for the next connecting sailing (56–84h cadence)."],
              ["Berth queues", "Wait ∝ u/(1−u); a vessel more than 18h late loses its berth window and re-queues."],
              ["Customs", "Commodity risk, incomplete docs (+24–72h), inspections (+48–120h), Mon–Fri 08–18 releases only."],
              ["Last mile", "Pre-booked truck slots absorb early releases; missing one means re-booking in a congested market. Rail ramps depart Tue/Fri only."],
              ["Disruptions", "Red Sea / Cape diversions (+10 days, Mar–May), labour strikes at Hamburg and New York, US peak season, pre-Lunar-New-Year rush."],
              ["Data gaps", "3–20% of milestone events are missing, as with real EDI and AIS feeds."],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-stone-200 bg-stone-50 p-3"><div className="mb-0.5 text-[11.5px] font-semibold text-accent-700">{k}</div><div className="leading-relaxed text-stone-500">{v}</div></div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-0">
        <CardHeader kicker="Read before trusting the numbers" title={<span className="flex items-center gap-2"><AlertTriangle size={15} className="text-amber-300" />Assumptions and limitations</span>} />
        <div className="grid gap-x-8 gap-y-2 p-4 pt-4 sm:p-5 sm:pt-4 text-[12.5px] leading-relaxed text-stone-500 md:grid-cols-2">
          {[
            "The data is synthetic. The model recovers mechanisms I wrote into the simulator, so good scores show the method works, not that real-world accuracy is known.",
            "90 test shipments is small: lane-level numbers are noisy, and confidence intervals are reported for that reason.",
            "At booking there is little signal. Most delay comes from events that have not happened yet, so no model beats the schedule by much there.",
            "Stage models train on actual upstream lateness (teacher forcing) but receive predicted lateness at inference. The Monte-Carlo sampling partly compensates.",
            "Intervals use pooled residuals and come out conservative (>80% coverage). Conditional or conformal calibration per stage would tighten them.",
            "Knock-on and SHAP are associational explanations of the model, not causal proof. Here they can be checked against the simulator's true causes; in production they could not.",
            "When an event is missing, the chain restarts from the last reported milestone. It ignores the clock, so it does not use \"no arrival reported by now\" as evidence.",
            "Production next steps: real AIS and port-call feeds, carrier schedule APIs, per-lane recalibration, drift monitoring and a feedback loop from realised ETAs.",
          ].map((t, i) => (
            <div key={i} className="flex gap-2.5"><span className="num mt-0.5 text-[10px] text-amber-700">{String(i + 1).padStart(2, "0")}</span><span>{t}</span></div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Def({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-stone-200 pb-3 last:border-0 last:pb-0">
      <span className="text-[11.5px] font-semibold text-accent-700">{k}</span>
      <span>{children}</span>
    </div>
  );
}
