"""Turn a stage-chain prediction into an explanation a planner can act on."""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import config as C
from .model import (CHECKPOINT_LABELS, CHECKPOINTS, FACTOR_GROUPS, FEATURE_TO_GROUP, STAGE_LABELS,
                    StageChain, asof_features, milestone_observed, static_features)
from .simulate import MILESTONES, STAGES, to_datetime

PROPAGATION_STORY = {
    1: ("misses the transshipment connection and waits for the next sailing", "is absorbed by the carrier speeding up on the sea leg"),
    2: ("loses its berth window and is re-queued behind on-time vessels", "is absorbed by berth-plan slack"),
    3: ("shifts the customs release into a weekend or holiday closure", "is offset because the later start avoids a closed customs window"),
    4: ("misses the booked truck appointment / rail cut-off", "is absorbed by slack before the booked pickup"),
}


def iso(h: float) -> str:
    return to_datetime(h).isoformat(timespec="minutes")


def explain(chain: StageChain, row: pd.Series, c: int, env: dict, n_samples: int = 400,
            overrides: dict | None = None, extra_lateness: float = 0.0, seed: int = 0,
            with_actions: bool = True) -> dict:
    rng = np.random.default_rng(seed)
    out = chain.predict(row, c, env, n_samples=n_samples, overrides=overrides,
                        extra_lateness=extra_lateness, rng=rng, explain=True)
    a, lat0, s = out["anchor"], out["observed_lateness"], out["samples"]
    sched_del = row.sched_delivered
    p10, p50, p90 = (float(np.quantile(s, q)) for q in (0.1, 0.5, 0.9))

    # stage timeline: reported milestones where we have them, forecasts otherwise
    stages, lat_prev = [], 0.0   # lateness at the last *reported* milestone
    lat_run = lat0              # lateness entering the next forecast stage
    for j in range(5):
        m = MILESTONES[j]
        s_start = row.sched_departed if j == 0 else row[f"sched_{MILESTONES[j - 1]}"]
        s_end = row[f"sched_{m}"]
        knock = None
        if j <= a and milestone_observed(row, j):
            lat_j = row[f"act_{m}"] - s_end
            ex, status = lat_j - lat_prev, "reported"
            start, end = s_start + lat_prev, row[f"act_{m}"]
            lat_prev = lat_j
        elif j <= a:   # happened, no event, folded into the next reported milestone
            ex, status, start, end = None, "merged", s_start + lat_prev, None
        else:
            ex = out["stage_excess"][j]
            status = "unreported" if j < c else "forecast"
            start, end = s_start + lat_run, s_end + lat_run + ex
            lat_run += ex
            knock = out["knock_on"].get(j)
        stages.append(dict(stage=STAGES[j], label=STAGE_LABELS[j], status=status,
                           sched_start=iso(s_start), sched_end=iso(s_end), start=iso(start),
                           end=None if end is None else iso(end),
                           excess_h=None if ex is None else round(float(ex), 1),
                           knock_on_h=None if knock is None else round(float(knock), 1),
                           local_h=None if knock is None else round(float(ex - knock), 1)))

    # additive factor attribution of the final delay (deterministic chain)
    groups = {g: 0.0 for g in FACTOR_GROUPS}
    per_stage_groups = {}
    for j, sv in out["stage_shap"].items():
        pg = {g: 0.0 for g in FACTOR_GROUPS}
        for f, v in sv.items():
            pg[FEATURE_TO_GROUP[f]] += v
            groups[FEATURE_TO_GROUP[f]] += v
        per_stage_groups[STAGES[j]] = {g: round(v, 1) for g, v in pg.items()}
    baseline = sum(out["reference"].values())
    factors = [dict(group="Delay already observed", hours=round(lat0, 1), kind="observed"),
               dict(group="On-time reference slippage", hours=round(baseline, 1), kind="baseline")]
    factors += [dict(group=g, hours=round(v, 1), kind="factor") for g, v in
                sorted(groups.items(), key=lambda kv: -abs(kv[1]))]

    narrative = _narrative(row, c, a, lat0, p50, p10, p90, float((s > C.LATE_THRESHOLD_H).mean()),
                           stages, groups, per_stage_groups)
    res = dict(
        checkpoint=c, checkpoint_key=CHECKPOINTS[c], checkpoint_label=CHECKPOINT_LABELS[c],
        now=iso(out["now"]), anchor=a, observed_lateness_h=round(lat0, 1),
        sched_delivery=iso(sched_del),
        eta_p10=iso(sched_del + p10), eta_p50=iso(sched_del + p50), eta_p90=iso(sched_del + p90),
        delay_p10_h=round(p10, 1), delay_p50_h=round(p50, 1), delay_p90_h=round(p90, 1),
        delay_mean_h=round(out["delay_det"], 1),
        p_late=round(float((s > C.LATE_THRESHOLD_H).mean()), 3),
        histogram=_hist(s), stages=stages, factors=factors, stage_factors=per_stage_groups,
        narrative=narrative,
        inputs=_inputs(row, out["now"], env, overrides),
    )
    if with_actions:
        res["actions"] = _actions(chain, row, c, env, p50, overrides, extra_lateness)
    return res


def _hist(s: np.ndarray, lo=-48, hi=480, step=12):
    edges = np.arange(lo, hi + step, step)
    h, _ = np.histogram(np.clip(s, lo, hi - 1e-6), edges)
    return dict(start=lo, step=step, counts=(h / len(s)).round(4).tolist())


def _narrative(row, c, a, lat0, p50, p10, p90, p_late, stages, groups, per_stage_groups):
    lines = []
    verdict = "on time" if p50 <= 6 else f"{p50:.0f}h late" if p50 < 72 else f"{p50 / 24:.1f} days late"
    lines.append(f"Expected to deliver {verdict} (80% range {p10:+.0f}h to {p90:+.0f}h); "
                 f"{p_late:.0%} chance of missing the promise by more than {C.LATE_THRESHOLD_H}h.")
    if a >= 0 and abs(lat0) > 6:
        lines.append(f"Already {lat0:+.0f}h vs plan at the last reported milestone ({stages[a]['label'].lower()}).")
    unrep = [s["label"] for s in stages if s["status"] in ("unreported", "merged")]
    if unrep:
        lines.append(f"No event received for {', '.join(unrep).lower()}; those stages are inferred, which widens the range.")
    fut = [(j, s) for j, s in enumerate(stages) if s["status"] in ("forecast", "unreported")]
    if fut:
        j, s = max(fut, key=lambda t: t[1]["excess_h"] or 0)
        if s["excess_h"] > 4:
            pg = per_stage_groups.get(s["stage"], {})
            drv = max(pg.items(), key=lambda kv: kv[1])[0] if pg else None
            lines.append(f"Most of the remaining risk sits in {s['label'].lower()} (+{s['excess_h']:.0f}h)"
                         + (f", driven mainly by {drv.lower()}." if drv else "."))
        kj = [(j, s) for j, s in fut if s["knock_on_h"] is not None and abs(s["knock_on_h"]) > 4 and j in PROPAGATION_STORY]
        if kj:
            j, s = max(kj, key=lambda t: abs(t[1]["knock_on_h"]))
            amp, absorb = PROPAGATION_STORY[j]
            if s["knock_on_h"] > 0:
                lines.append(f"Delay propagation: arriving late into {s['label'].lower()} adds a further "
                             f"{s['knock_on_h']:.0f}h because the shipment {amp}.")
            else:
                lines.append(f"Delay absorption: {-s['knock_on_h']:.0f}h of the upstream delay {absorb}.")
    top = [(g, v) for g, v in sorted(groups.items(), key=lambda kv: -kv[1]) if v > 3][:3]
    if top:
        lines.append("Top drivers: " + ", ".join(f"{g.lower()} (+{v:.0f}h)" for g, v in top) + ".")
    return lines


def _actions(chain, row, c, env, p50, overrides, extra_lateness):
    acts = []
    a = chain.anchor(row, c)[0]
    if not row.docs_complete and a < 3:
        ov = dict(overrides or {}, docs_complete=1.0)
        alt = explain(chain, row, c, env, n_samples=300, overrides=ov, extra_lateness=extra_lateness,
                      with_actions=False)
        acts.append(dict(title="Complete the customs document set now",
                         impact_h=round(alt["delay_p50_h"] - p50, 1),
                         detail="Incomplete documents add queries and raise inspection odds."))
    if p50 > C.LATE_THRESHOLD_H:
        acts.append(dict(title="Re-book the delivery appointment proactively",
                         impact_h=None, detail="Avoid the re-booking queue that follows a missed slot."))
        acts.append(dict(title="Notify the consignee of the revised ETA window",
                         impact_h=None, detail="Share the P10-P90 window, not a single date."))
    return acts


def _inputs(row, now, env, overrides):
    """Current values of the levers the what-if panel can move."""
    st, ao = static_features(row), asof_features(row, now, env, 4)
    v = dict(cong_dest_now=ao["cong_dest_now"], cong_origin_now=ao["cong_origin_now"],
             weather_now=ao["weather_now"], docs_complete=bool(st["docs_complete"]),
             new_importer=bool(st["new_importer"]), carrier_reliability=st["carrier_reliability"])
    for k, val in (overrides or {}).items():
        if k in v:
            v[k] = bool(val) if isinstance(v[k], bool) else round(float(val), 3)
    return v
