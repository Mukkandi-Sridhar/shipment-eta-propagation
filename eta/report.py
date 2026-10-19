"""Build docs/report.html (+ figures) from the exported results, then print to PDF.

    python -m eta.report          # needs web/public/data/summary.json from `python -m eta.run`
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
S = json.loads((ROOT / "web/public/data/summary.json").read_text())
CP = ["Booked", "Departed", "Arrived", "Discharged", "Released"]
MODELS = ["schedule", "carry_forward", "lane_history", "direct_gbm", "stage_chain"]
COL = {"schedule": "#94a3b8", "carry_forward": "#64748b", "lane_history": "#d97706", "direct_gbm": "#7c3aed", "stage_chain": "#0891b2"}
LANE_COL = {"SHA-RTM": "#0891b2", "YTN-LAX": "#7c3aed", "PUS-LAX": "#db2777", "NSA-HAM": "#059669", "MAA-RTM": "#d97706",
            "SGN-RTM": "#2563eb", "SIN-NYC": "#ea580c", "NSA-JEA": "#0d9488", "NSA-NYC": "#c026d3"}

plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 8, "axes.spines.top": False, "axes.spines.right": False,
                     "axes.edgecolor": "#cbd5e1", "axes.labelcolor": "#334155", "xtick.color": "#475569", "ytick.color": "#475569",
                     "axes.grid": True, "grid.color": "#e2e8f0", "grid.linewidth": 0.6})


def m(c, model, key="mae"):
    return next(r for r in S["metrics"] if r["checkpoint"] == c and r["model"] == model)[key]


def fig_accuracy():
    fig, ax = plt.subplots(1, 3, figsize=(7.2, 2.15), gridspec_kw={"width_ratios": [1.25, 1, 1]})
    for k in MODELS:
        ax[0].plot(range(5), [m(c, k) for c in range(5)], marker="o", ms=3, lw=2.2 if k == "stage_chain" else 1.2,
                   color=COL[k], label=S["model_labels"][k], ls="--" if k == "schedule" else "-")
    ax[0].set_xticks(range(5), CP, rotation=20)
    ax[0].set_ylabel("MAE (h)")
    ax[0].set_title("(a) Delivery-time error by checkpoint", fontsize=8, loc="left")
    ax[0].legend(fontsize=6, frameon=False, loc="lower left")
    rob = S["robustness"]
    for k in ["carry_forward", "lane_history", "direct_gbm", "stage_chain"]:
        ax[1].plot([r["rate"] * 100 for r in rob], [r[k] for r in rob], marker="o", ms=3, color=COL[k], lw=2.2 if k == "stage_chain" else 1.2)
    ax[1].set_xlabel("extra milestone events dropped (%)")
    ax[1].set_ylabel("MAE in transit (h)")
    ax[1].set_title("(b) Missing-data robustness", fontsize=8, loc="left")
    lc = [r for r in S["learning_curve"] if r["checkpoint"] == 2]
    for k in ["lane_history", "direct_gbm", "stage_chain"]:
        ax[2].plot([r["n"] for r in lc], [r[k] for r in lc], marker="o", ms=3, color=COL[k], lw=2.2 if k == "stage_chain" else 1.2)
    ax[2].set_xscale("log")
    ax[2].set_xlabel("shipments simulated")
    ax[2].set_ylabel("MAE at arrival (h)")
    ax[2].set_title("(c) Learning curve", fontsize=8, loc="left")
    fig.tight_layout()
    fig.savefig(DOCS / "fig_accuracy.svg")
    plt.close(fig)


def fig_propagation():
    A = S["analyses"]
    fig, ax = plt.subplots(1, 3, figsize=(7.2, 2.25), gridspec_kw={"width_ratios": [1.2, 1, 1]})
    for c in A["propagation_curves"]:
        ax[0].plot([p["dep_late"] for p in c["points"]], [p["final"] for p in c["points"]], color=LANE_COL[c["lane_id"]], lw=1.3, label=c["lane_id"])
    ax[0].plot([0, 192], [0, 192], color="#334155", ls=":", lw=1)
    ax[0].set_xlabel("departure delay injected (h)")
    ax[0].set_ylabel("predicted delivery delay (h)")
    ax[0].set_title("(a) Learned propagation, by lane", fontsize=8, loc="left")
    ax[0].legend(fontsize=5.5, ncol=2, frameon=False)
    for i, (key, title, cmap) in enumerate([("port_surface", "(b) Port overrun (h)", "magma"),
                                             ("customs_surface", "(c) Customs overrun (h)", "viridis")]):
        sf = A[key]
        z = np.array(sf["z"])
        im = ax[i + 1].imshow(z, origin="lower", aspect="auto", cmap=cmap)
        ax[i + 1].set_title(title, fontsize=8, loc="left")
        ax[i + 1].grid(False)
        xs = sf["x"]
        ax[i + 1].set_xticks(range(0, len(xs), 3), [str(v) for v in xs[::3]])
        ys = sf["y"]
        step = 2 if len(ys) > 7 else 1
        ax[i + 1].set_yticks(range(0, len(ys), step), [f"{v:.2f}" if isinstance(v, float) else str(v) for v in ys[::step]])
        ax[i + 1].set_xlabel(sf["x_label"])
        ax[i + 1].set_ylabel(sf["y_label"])
        cb = fig.colorbar(im, ax=ax[i + 1], fraction=0.046, pad=0.02)
        cb.ax.tick_params(labelsize=6)
    fig.tight_layout()
    fig.savefig(DOCS / "fig_propagation.svg")
    plt.close(fig)


def table_rows():
    rows = []
    for k in MODELS:
        cells = []
        for c in range(5):
            v = m(c, k)
            best = min(m(c, o) for o in MODELS)
            cells.append(f"<td class='{'best' if abs(v - best) < 1e-9 else ''}'>{v:.1f}</td>")
        cls = " class='ours'" if k == "stage_chain" else ""
        rows.append(f"<tr{cls}><td class='l'>{S['model_labels'][k]}</td>{''.join(cells)}</tr>")
    return "\n".join(rows)


def build():
    DOCS.mkdir(exist_ok=True)
    fig_accuracy()
    fig_propagation()
    d = S["dataset"]
    g_lane = {g["checkpoint"]: g for g in S["gain_vs_lane"]}
    g_dir = {g["checkpoint"]: g for g in S["gain_vs_direct"]}
    att = {a["checkpoint"]: a for a in S["attribution"]}
    rob = {r["rate"]: r for r in S["robustness"]}
    share = d["stage_share_late"]
    tot = sum(share.values())
    shares = {k: 100 * v / tot for k, v in share.items()}
    cov = [m(c, "stage_chain", "coverage80") for c in range(5)]
    html = TEMPLATE.format(
        n=S["config"]["n"], train=S["config"]["train"], test=S["config"]["test"],
        late=100 * d["late_rate"], med=d["median_delay"], p90=d["p90_delay"],
        sh_origin=shares["origin"], sh_ocean=shares["ocean"], sh_port=shares["port"], sh_customs=shares["customs"], sh_last=shares["last_mile"],
        table=table_rows(),
        mae2=m(2, "stage_chain"), sched2=m(2, "schedule"), imp2=100 * (1 - m(2, "stage_chain") / m(2, "schedule")),
        mae4=m(4, "stage_chain"), sched4=m(4, "schedule"), dir4=m(4, "direct_gbm"),
        mae0=m(0, "stage_chain"), dir0=m(0, "direct_gbm"), sched0=m(0, "schedule"),
        gl2=g_lane[2]["gain"], gl2lo=g_lane[2]["lo"], gl2hi=g_lane[2]["hi"],
        gd2=g_dir[2]["gain"], gd2lo=g_dir[2]["lo"], gd2hi=g_dir[2]["hi"],
        gd0=g_dir[0]["gain"], gd0lo=g_dir[0]["lo"], gd0hi=g_dir[0]["hi"],
        auc0=m(0, "stage_chain", "auc"), auc2=m(2, "stage_chain", "auc"), auc4=m(4, "stage_chain", "auc"),
        bri2=m(2, "stage_chain", "brier"), dauc2=m(2, "direct_gbm", "auc"), dbri2=m(2, "direct_gbm", "brier"),
        covlo=100 * min(cov), covhi=100 * max(cov), w24=100 * m(2, "stage_chain", "within24"),
        a1=100 * att[1]["model"], a1l=100 * att[1]["lane_baseline"], a1c=100 * att[1]["chance"], a1n=att[1]["n"],
        a3=100 * att[3]["model"], a3l=100 * att[3]["lane_baseline"], a3c=100 * att[3]["chance"],
        r0c=rob[0.0]["stage_chain"], r75c=rob[0.75]["stage_chain"], r0d=rob[0.0]["direct_gbm"], r75d=rob[0.75]["direct_gbm"],
        r75cf=rob[0.75]["carry_forward"],
        scale=S["config"]["resid_scale"],
    )
    (DOCS / "report.html").write_text(html)
    chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    if Path(chrome).exists():
        subprocess.run([chrome, "--headless", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=3000",
                        f"--print-to-pdf={DOCS / 'Report.pdf'}", (DOCS / "report.html").as_uri()], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("wrote docs/Report.pdf")


TEMPLATE = r"""<!doctype html><html><head><meta charset="utf-8"><title>Predicting Shipment ETA and Delay Propagation</title>
<style>
@page {{ size: A4; margin: 13mm 14mm 13mm 14mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #0f172a; font-size: 9.1pt; line-height: 1.38; margin: 0; }}
h1 {{ font-size: 16pt; margin: 0 0 2px; letter-spacing: -0.01em; }}
h2 {{ font-size: 10.2pt; margin: 10px 0 3px; color: #0e7490; text-transform: uppercase; letter-spacing: .06em; }}
p {{ margin: 0 0 5px; text-align: justify; }}
.sub {{ color: #475569; font-size: 8.6pt; margin-bottom: 6px; }}
.sub a {{ color: #0e7490; text-decoration: none; }}
.tldr {{ background: #ecfeff; border-left: 3px solid #0891b2; padding: 6px 9px; margin: 6px 0 4px; font-size: 8.8pt; }}
ul {{ margin: 2px 0 5px 15px; padding: 0; }} li {{ margin: 1px 0; }}
table {{ border-collapse: collapse; width: 100%; font-size: 8.2pt; margin: 4px 0 4px; }}
th, td {{ padding: 2.5px 6px; border-bottom: 1px solid #e2e8f0; text-align: right; }}
th {{ color: #475569; font-weight: 600; border-bottom: 1px solid #94a3b8; }}
td.l, th.l {{ text-align: left; }}
tr.ours td {{ background: #ecfeff; font-weight: 600; }}
td.best {{ color: #047857; font-weight: 700; }}
.fig {{ width: 100%; margin: 3px 0 1px; }}
.cap {{ font-size: 7.6pt; color: #475569; margin: 0 0 6px; }}
.cols {{ display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }}
code {{ font-family: Menlo, monospace; font-size: 8pt; background: #f1f5f9; padding: 0 3px; border-radius: 3px; }}
.k {{ font-weight: 600; }}
.pb {{ break-before: page; }}
</style></head><body>
<h1>Predicting Shipment ETA and Delay Propagation</h1>
<div class="sub">Sridhar Mukkandi · Aiqon AI Internship, Round 2 take-home · Live dashboard: <a href="https://mukkandi-sridhar.github.io/shipment-eta-propagation/">mukkandi-sridhar.github.io/shipment-eta-propagation</a> · Code: <a href="https://github.com/Mukkandi-Sridhar/shipment-eta-propagation">github.com/Mukkandi-Sridhar/shipment-eta-propagation</a> · All numbers are generated by <code>python -m eta.run</code> and inserted into this report automatically.</div>
<div class="tldr"><b>Summary.</b> I model a shipment as a chain of five stages (origin, ocean, destination port, customs, last mile) and learn one gradient-boosted model per stage that predicts the stage's overrun from (i) how late the shipment enters the stage and (ii) what is observable at prediction time. Chaining the stage models makes delay <i>propagate</i>: it is amplified when it breaks a buffer (missed berth window, transshipment connection, cut-off) and absorbed when slack exists. Monte-Carlo sampling through the chain gives an ETA window (P10–P90) and P(late). Explanations are exactly additive: observed delay + on-time reference + knock-on + factor SHAP = forecast. On a temporal hold-out the stage-chain cuts ETA error from {sched2:.1f}h (carrier schedule) to <b>{mae2:.1f}h</b> once the vessel has arrived, and from {sched4:.1f}h to <b>{mae4:.1f}h</b> after customs release. The stage it blames is the true root-cause stage {a1:.0f}% of the time, against {a1l:.0f}% for lane history.</div>

<h2>1 · Problem framing and definitions</h2>
<p><span class="k">Promised delivery</span> is the carrier schedule plus the planned port, customs and inland buffers, fixed at booking. <span class="k">Delivery delay</span> = actual proof-of-delivery − promised delivery (hours), and a shipment is <span class="k">late</span> if the delay exceeds 24h. The journey has five milestones (departed, arrived, discharged, released, delivered). The <span class="k">overrun of stage k</span> is its actual duration minus its scheduled duration, so the five overruns sum <i>exactly</i> to the delivery delay. That identity drives the design: predicting ETA becomes predicting the overruns of the stages still ahead, given how late the shipment is now. <span class="k">ETA</span> = promised delivery + P50 of the predicted delay, reported with a P10–P90 window. Forecasts are issued at five <span class="k">checkpoints</span>: at booking (48h before sailing), then at each milestone up to customs release. They use only information reported by that time: congestion and weather <i>as observed then</i>, plus seasonal norms, never the realised future values. This rules out the usual leakage in ETA demos.</p>

<h2>2 · Data: a mechanistic simulator (synthetic, with ground truth)</h2>
<p>Public AIS datasets have vessel positions but not door-to-door milestones, customs events or root causes, so I built a simulator (<code>eta/simulate.py</code>) whose stage durations come from logistics <i>mechanisms</i> rather than independent noise. This also makes explanations testable. There are {n} shipments on 9 lanes (Asia–Europe, trans-Pacific, India–Middle East, 2 lanes with transshipment at Colombo and Singapore; rail or truck for the last mile). Daily port utilisation and sea-region weather are shared AR(1) time series with seasonality (US peak season, the pre-Lunar-New-Year rush, the SW monsoon, typhoons), so ships calling the same port in the same week share congestion. How delay is introduced:</p>
<ul>
<li><b>Origin:</b> rollover to next week's sailing (+168h), with probability rising with origin utilisation and falling with carrier reliability; departure slippage scales with congestion.</li>
<li><b>Ocean:</b> weather adds sea time. Late vessels steam faster and recover up to ~4.5% of transit (<i>absorption</i>). At a hub, a box that misses its connection waits for the next sailing, 56–84h later (<i>amplification</i>). A Red Sea / Cape diversion adds +240h in Mar–May; it is in the schedule only for bookings made after the first month.</li>
<li><b>Port:</b> berth wait ∝ u/(1−u) (M/M/1-style). A vessel more than 18h late loses its berth window and re-queues (wait ×1.7 + 10h): the <i>congestion × lateness interaction</i>. Discharge time scales with vessel size and yard congestion. Strikes hit Hamburg and New York.</li>
<li><b>Customs:</b> base time by commodity × port speed × congestion; incomplete documents add 24–72h; an inspection, more likely for risky commodities, incomplete docs or new importers, adds 48–120h; releases happen only Mon–Fri 08–18 outside holidays.</li>
<li><b>Last mile:</b> pre-booked truck slots absorb early releases; a missed slot means re-booking in a congested market. Rail ramps depart only Tue/Fri at 20:00, a fixed-day cut-off that turns hours of lateness into days.</li>
</ul>
<p><b>Ground truth</b> = the simulated actual timestamps, plus the per-stage overruns and a log of triggered mechanisms. <b>Missing data:</b> 3–20% of milestone events are blanked, as in real EDI/AIS feeds; delivery is always reported. Result: {late:.0f}% of shipments are late, median delay {med:.0f}h, P90 {p90:.0f}h. That is roughly in line with published door-to-door reliability, though not calibrated to it. Of the delay hours in late shipments, {sh_origin:.0f}% arise at origin, {sh_ocean:.0f}% at sea, {sh_port:.0f}% at the port, {sh_customs:.0f}% in customs and {sh_last:.0f}% on the last mile. Most delay is created <i>after</i> the vessel leaves, so tracking the vessel alone is not enough.</p>

<h2>3 · Features</h2>
<p>Each stage model sees: <b>(a) propagation state:</b> <code>lateness_in</code> (hours late entering the stage) and the forecast horizon; <b>(b) timing interactions</b> computed from the <i>predicted</i> stage start: weekday, hour, holiday and announced-strike overlap. Shifting lateness changes these, so the chain captures "+10h late pushes discharge into Friday night and customs into Monday" without any hand-coded rule; <b>(c) as-of conditions:</b> origin/hub/destination utilisation now, the seasonal norm at the scheduled arrival, current and climatological lane weather; <b>(d) shipment attributes:</b> carrier reliability, vessel size, commodity base time and inspection risk, document completeness, new importer, hazmat, transshipment, inland mode, diversion flags. Trees learn interactions such as congestion × lateness directly (Fig. 2b).</p>

<h2>4 · Models</h2>
<p><b>Stage-chain (proposed).</b> Five <code>HistGradientBoostingRegressor</code>s, one per stage, each trained on rows (shipment × every checkpoint before that stage), so a model learns how much a signal observed <i>h</i> hours ahead is worth. At inference the predicted lateness out of stage k becomes <code>lateness_in</code> of stage k+1. For uncertainty, 400 Monte-Carlo paths add out-of-fold residuals at each stage (pooled by horizon) and push them through the remaining stages, so uncertainty propagates non-linearly along with the delay. The residual scale ({scale}) is chosen on a later slice of the <i>training</i> period. When a milestone event is missing, the chain restarts from the last reported milestone and forecasts the unreported stages. <b>Baselines:</b> carrier schedule (delay = 0); carry-forward (last observed lateness); lane history (last lateness + the lane's median remaining overrun); <b>Direct GBM</b>, a single model mapping (shipment, checkpoint) features straight to final delay (absolute loss) plus a classifier for P(late). The direct model has the same information but no stage structure. It isolates the value of modelling propagation explicitly.</p>
<p><b>Explanations.</b> For each remaining stage: <i>knock-on</i> = forecast at the actual entry lateness − forecast had the shipment entered on time (positive = amplified, negative = absorbed). The on-time forecast is split with TreeSHAP into factor groups (destination congestion, customs risk, calendar, weather, carrier, disruptions…). Summed along the chain, observed delay + on-time reference + Σ knock-on + Σ factor contributions equals the forecast exactly (checked in code). The narrative and recommended actions are templated from these numbers, not generated by an LLM, so they cannot invent causes. One action, completing customs documents, is a re-run counterfactual with its estimated hours saved.</p>

<h2>5 · Evaluation</h2>
<p><b>Design.</b> Temporal split: the first {train} departures (Jan–Aug) train, the last {test} (Aug–Nov) test, as in deployment. The test window contains US peak season and a New York strike the models barely saw, so it is a hard test. Metrics: MAE of delivery time (h), share within ±24h, AUC and Brier for P(late &gt; 24h), P10–P90 coverage, and a 95% bootstrap CI on MAE differences (resampling shipments).</p>
<table><tr><th class="l">MAE (h) at checkpoint →</th><th>Booked</th><th>Departed</th><th>Arrived</th><th>Discharged</th><th>Released</th></tr>
{table}</table>
<img class="fig" src="fig_accuracy.svg"/>
<div class="cap">Figure 1. (a) Delivery-time MAE on the hold-out. (b) MAE averaged over in-transit checkpoints as extra milestone events are dropped. (c) Full pipeline re-run on larger simulated datasets (same world and seed, more shipments; 100 Monte-Carlo paths).</div>
<ul>
<li><b>Accuracy improves as the journey unfolds.</b> The stage-chain is best from the arrival checkpoint on: {mae2:.1f}h vs {sched2:.1f}h for the schedule (−{imp2:.0f}%) and {mae4:.1f}h vs {dir4:.1f}h for the Direct GBM after release. The gain over lane history at arrival is {gl2:+.1f}h [95% CI {gl2lo:.1f}, {gl2hi:.1f}]; over the Direct GBM it is {gd2:+.1f}h [{gd2lo:.1f}, {gd2hi:.1f}]. ±24h hit-rate at arrival: {w24:.0f}%.</li>
<li><b>At booking nothing works well</b> ({mae0:.1f}h chain, {dir0:.1f}h direct, {sched0:.1f}h schedule; difference CI [{gd0lo:.1f}, {gd0hi:.1f}]). Most delay comes from inspections, berth queues and missed slots that have not happened yet. A booking-time ETA should be treated as a risk score (AUC {auc0:.2f}) rather than a date.</li>
<li><b>Risk:</b> AUC {auc2:.2f} and Brier {bri2:.3f} at arrival (Direct GBM classifier: {dauc2:.2f} / {dbri2:.3f}), rising to {auc4:.2f} after release. P10–P90 coverage is {covlo:.0f}–{covhi:.0f}%. The intervals are honest but conservative (target 80%).</li>
<li><b>Explanations are checked against ground truth.</b> For late shipments, the stage with the largest forecast overrun is the stage with the largest <i>true</i> overrun {a1:.0f}% of the time after departure (n={a1n}; lane-history {a1l:.0f}%, chance {a1c:.0f}%) and {a3:.0f}% after discharge (lane {a3l:.0f}%, chance {a3c:.0f}%).</li>
<li><b>Missing data:</b> with 75% of events dropped, chain MAE goes {r0c:.1f}→{r75c:.1f}h, Direct GBM {r0d:.1f}→{r75d:.1f}h, carry-forward {r75cf:.1f}h. The direct model degrades more gracefully, partly because the evaluation clock coincides with the (unreported) event and the direct model reads the clock (see limitations). The chain ignores it, so this comparison is biased in the direct model's favour.</li>
<li><b>Data volume</b> (Fig. 1c): error at arrival does <i>not</i> keep falling with more shipments. Most of what remains is noise about events that have not happened yet. The chain beats lane history at every size, but with 2,400 shipments the Direct GBM catches up: a flexible model given enough data learns propagation implicitly. The chain's advantages are data efficiency at realistic history sizes and, more importantly, a structure that supports stage-level explanations and what-if re-forecasting.</li>
</ul>
<img class="fig" src="fig_propagation.svg"/>
<div class="cap">Figure 2. (a) One test shipment per lane, with departure delay injected and the chain re-run. Above y = x, delay is amplified downstream: transshipment lanes jump once the hub buffer is exhausted, and rail lanes step at ramp cut-offs. Below it, delay is absorbed on long direct lanes. (b) Port-stage response: lateness costs far more in a congested port. (c) Customs response: Friday-evening and weekend arrivals wait for Monday. The model learned (b) and (c) from data; it was never given the rules.</div>

<h2>6 · Assumptions and limitations</h2>
<ul>
<li><b>Synthetic data.</b> The model recovers mechanisms that I wrote, so the scores show the method can learn propagation, not real-world accuracy. Parameters are plausible, not fitted. Correlated shocks beyond port and region (e.g. carrier-wide blank sailings) are not simulated.</li>
<li><b>Exposure bias.</b> Stage models train on actual upstream lateness but receive predicted lateness at inference. Monte-Carlo sampling partly compensates; scheduled sampling or joint training would be the next step.</li>
<li><b>Intervals</b> use pooled residuals (not conditioned on lane or regime) and over-cover. Per-stage conformal calibration would tighten them.</li>
<li><b>Missing events.</b> The chain does not reason about absence (e.g. "no arrival reported 20h after ETA"); adding clock-aware censoring is straightforward. The robustness evaluation lets clock-reading models time unreported events, which flatters the Direct GBM.</li>
<li><b>Explanations</b> are model attributions plus counterfactuals, not causal identification. They score well here because ground truth exists; in production they need operational validation.</li>
<li><b>Path to production:</b> AIS and port-call feeds for ocean and berth stages, carrier schedule APIs, customs EDI. Retrain per lane cluster and monitor drift and calibration. Close the loop by scoring every realised ETA.</li>
</ul>
<h2>7 · Deliverables</h2>
<p><b>Repository</b>: simulator, models, evaluation (<code>eta/</code>), FastAPI what-if service (<code>api/</code>) and a React dashboard (<code>web/</code>) with a network globe replay, per-shipment forecasts with checkpoint replay, delay waterfall (new vs knock-on delay), factor attribution, briefing text, forecast convergence, a live what-if simulator, a ground-truth comparison, a propagation lab and the evaluation suite. <code>make setup data serve</code> reproduces everything.</p>
</body></html>"""

if __name__ == "__main__":
    build()
