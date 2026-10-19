"""End-to-end: simulate -> train -> evaluate -> export data for the dashboard.

    python -m eta.run            # full run (~2-3 min)
    python -m eta.run --fast     # skip learning curve
"""

from __future__ import annotations

import argparse
import json
import pickle
import time
import warnings
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

from . import config as C
from .evaluate import (MODEL_LABELS, attribution_accuracy, bootstrap_gain, learning_curve, metrics_table,
                       missing_data_robustness, predict_rows, temporal_split, train_all)
from .explain import explain, iso
from .geo import route_coords
from .model import CHECKPOINT_LABELS, FACTOR_GROUPS, FEATURES, FEATURE_TO_GROUP, STAGE_LABELS, stage_training_rows
from .simulate import MILESTONES, STAGES, simulate, to_datetime

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parent.parent
DATA, ART, WEB = ROOT / "data", ROOT / "artifacts", ROOT / "web" / "public" / "data"


def clean(o):
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return None if not np.isfinite(o) else round(float(o), 4)
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, np.bool_):
        return bool(o)
    return o


def dump(obj, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(clean(obj), separators=(",", ":")))


def export_dataset(df: pd.DataFrame, env: dict):
    DATA.mkdir(exist_ok=True)
    out = df.copy()
    for col in [c for c in df.columns if c.startswith(("sched_", "act_"))]:
        out[col] = [None if pd.isna(v) else to_datetime(v).isoformat(timespec="minutes") for v in df[col]]
    # what an operator's feed would show: missing events blanked out
    for m in ["departed", "arrived", "berthed", "discharged", "released", "pickup", "hub_arrived", "hub_departed"]:
        out[f"reported_{m}"] = np.where(df[f"miss_{m}"], None, out[f"act_{m}"])
    out.to_csv(DATA / "shipments.csv", index=False)
    days = pd.date_range("2025-01-01", periods=len(next(iter(env["util"].values()))), freq="D")
    e = pd.DataFrame({"date": days.date})
    for k, v in env["util"].items():
        e[f"util_{k}"] = v.round(4)
    for k, v in env["weather"].items():
        e[f"weather_{k}"] = v.round(4)
    e.to_csv(DATA / "environment.csv", index=False)


def global_analyses(chain, train, test, env):
    # 1. propagation curves: final delay vs departure lateness, per lane
    curves = []
    for lane_id in C.LANE_BY_ID:
        cand = test[test.lane_id == lane_id]
        if cand.empty:
            cand = train[train.lane_id == lane_id]
        row = cand.iloc[len(cand) // 2]
        a, lat0 = chain.anchor(row, 1, mask={m: False for m in MILESTONES[:4]})
        pts = []
        for L in range(0, 200, 8):
            o = chain.predict(row, 1, env, mask={m: False for m in MILESTONES[:4]}, extra_lateness=L - lat0)
            pts.append(dict(dep_late=L, final=o["delay_det"]))
        curves.append(dict(lane_id=lane_id, points=pts))
    empirical = [dict(lane_id=r.lane_id, dep_late=r.act_departed - r.sched_departed, final=r.delay_h)
                 for _, r in pd.concat([train, test]).iterrows()]

    # 2. interaction surfaces from the stage models
    rows = stage_training_rows(train, env)
    port_med = rows[2][FEATURES].median()
    cong = np.round(np.linspace(0.62, 0.95, 12), 3)
    late = np.arange(0, 97, 8)
    grid = []
    for u in cong:
        X = pd.DataFrame([port_med] * len(late))
        X["cong_dest_now"], X["lateness_in"], X["horizon_h"] = u, late, 0
        grid.append(chain.models[2].predict(X[FEATURES]).round(1).tolist())
    port_surface = dict(x=late.tolist(), y=cong.tolist(), z=grid, x_label="Arrival lateness (h)",
                        y_label="Destination utilisation", z_label="Port-stage overrun (h)")

    cus_med = rows[3][FEATURES].median()
    hours = np.arange(0, 24, 2)
    cgrid = []
    for wd in range(7):
        X = pd.DataFrame([cus_med] * len(hours))
        X["start_weekday"], X["start_hour"], X["horizon_h"], X["holiday_near"] = wd, hours, 0, 0
        cgrid.append(chain.models[3].predict(X[FEATURES]).round(1).tolist())
    customs_surface = dict(x=hours.tolist(), y=["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], z=cgrid,
                           x_label="Hour container becomes available", y_label="Weekday", z_label="Customs overrun (h)")

    # 3. which factors matter in which stage (mean |SHAP|, hours)
    importance = []
    for j in range(5):
        X = rows[j][FEATURES]
        sv = np.abs(chain.explainers[j].shap_values(X)).mean(0)
        g = {k: 0.0 for k in FACTOR_GROUPS}
        for f, v in zip(FEATURES, sv):
            g[FEATURE_TO_GROUP[f]] += float(v)
        importance.append(dict(stage=STAGES[j], label=STAGE_LABELS[j], groups=g))
    return dict(propagation_curves=curves, propagation_empirical=empirical, port_surface=port_surface,
                customs_surface=customs_surface, stage_importance=importance)


def main(fast: bool = False, n: int = 300, seed: int = 7):
    t0 = time.time()
    df, env = simulate(n=n, seed=seed)
    export_dataset(df, env)
    train, test = temporal_split(df)
    print(f"[{time.time() - t0:5.1f}s] simulated {len(df)} shipments; train {len(train)} / test {len(test)}")

    chain, lane, direct = train_all(train, env, calibrate=True)
    chain.init_explainers()
    print(f"           interval residual scale = {chain.resid_scale}")
    ART.mkdir(exist_ok=True)
    with open(ART / "models.pkl", "wb") as f:
        pickle.dump(dict(chain=chain, lane=lane, direct=direct, env=env, seed=seed, n=n), f)
    print(f"[{time.time() - t0:5.1f}s] trained")

    P = predict_rows(test, env, chain, lane, direct, n_samples=400)
    metrics = metrics_table(P)
    gains = bootstrap_gain(P)
    gains_direct = bootstrap_gain(P, b="direct_gbm")
    attr = attribution_accuracy(P, test, lane)
    print(f"[{time.time() - t0:5.1f}s] evaluated")
    robust = missing_data_robustness(test, env, chain, lane, direct)
    print(f"[{time.time() - t0:5.1f}s] robustness")
    lc = [] if fast else learning_curve()
    print(f"[{time.time() - t0:5.1f}s] learning curve")

    per_lane = []
    for (lane_id, c), g in P[P.checkpoint.isin([0, 2])].groupby(["lane_id", "checkpoint"]):
        per_lane.append(dict(lane_id=lane_id, checkpoint=int(c), n=len(g),
                             stage_chain=float(np.abs(g.stage_chain - g.y).mean()),
                             lane_history=float(np.abs(g.lane_history - g.y).mean()),
                             direct_gbm=float(np.abs(g.direct_gbm - g.y).mean())))
    calib = []
    for c in (0, 2):
        g = P[P.checkpoint == c]
        bins = np.clip((g.p_late * 5).astype(int), 0, 4)
        for b, gb in g.groupby(bins):
            calib.append(dict(checkpoint=c, bin=int(b), predicted=float(gb.p_late.mean()),
                              observed=float((gb.y > C.LATE_THRESHOLD_H).mean()), n=len(gb)))

    causes = Counter(c for cs in df.causes for c in cs.split("|") if c)
    late_df = df[df.late]
    hist_edges = np.arange(-24, 504, 24)
    summary = dict(
        generated=pd.Timestamp.now().isoformat(timespec="seconds"),
        config=dict(n=n, seed=seed, resid_scale=chain.resid_scale, late_threshold_h=C.LATE_THRESHOLD_H, train=len(train), test=len(test),
                    split_date=iso(test.sched_departed.min())),
        model_labels=MODEL_LABELS, checkpoint_labels=CHECKPOINT_LABELS, stage_labels=STAGE_LABELS,
        metrics=metrics, gain_vs_lane=gains, gain_vs_direct=gains_direct, attribution=attr,
        robustness=robust, learning_curve=lc, per_lane=per_lane, calibration=calib,
        dataset=dict(
            late_rate=float(df.late.mean()), median_delay=float(df.delay_h.median()),
            mean_delay=float(df.delay_h.mean()), p90_delay=float(df.delay_h.quantile(0.9)),
            causes=dict(causes.most_common()),
            delay_hist=dict(start=-24, step=24, counts=np.histogram(df.delay_h.clip(-24, 479), hist_edges)[0].tolist()),
            stage_share_late={s: float(late_df[f"excess_{s}"].clip(lower=0).sum()) for s in STAGES},
            missing_rates={m: float(df[f"miss_{m}"].mean()) for m in ["departed", "arrived", "discharged", "released"]},
            lanes=[dict(lane_id=l, n=int((df.lane_id == l).sum()),
                        median_delay=float(df[df.lane_id == l].delay_h.median()),
                        late_rate=float(df[df.lane_id == l].late.mean())) for l in C.LANE_BY_ID],
        ),
        analyses=global_analyses(chain, train, test, env),
    )
    dump(summary, WEB / "summary.json")

    geo = dict(
        ports={k: dict(name=p.name, lat=p.lat, lon=p.lon) for k, p in C.PORTS.items()},
        lanes={l.lane_id: dict(origin=l.origin, dest=l.dest, hub=l.hub, inland_city=l.inland_city,
                               inland_mode=l.inland_mode, transit_days=l.transit_days,
                               coords=route_coords(l.lane_id), cape=route_coords(l.lane_id, cape=True))
               for l in C.LANES},
    )
    dump(geo, WEB / "geo.json")

    # every shipment: light record for the network view
    test_ids = set(test.shipment_id)
    fleet = []
    for _, r in df.iterrows():
        fleet.append(dict(
            id=r.shipment_id, lane=r.lane_id, carrier=r.carrier, commodity=r.commodity, split="test" if r.shipment_id in test_ids else "train",
            sched={m: iso(r[f"sched_{m}"]) for m in ["departed"] + MILESTONES[1:]},
            act={m: iso(r[f"act_{m}"]) for m in ["departed"] + MILESTONES[1:]},
            delay_h=round(r.delay_h, 1), late=bool(r.late), causes=[c for c in r.causes.split("|") if c],
            cape=bool(r.red_sea_diversion),
        ))
    dump(fleet, WEB / "fleet.json")

    # test shipments: full explanations at every checkpoint
    details = {}
    for _, r in test.iterrows():
        details[r.shipment_id] = dict(
            id=r.shipment_id, lane=r.lane_id, origin=r.origin, dest=r.dest, hub=r.hub or None,
            carrier=r.carrier, carrier_reliability=r.carrier_reliability, commodity=r.commodity,
            docs_complete=bool(r.docs_complete), new_importer=bool(r.new_importer), vessel_teu=int(r.vessel_teu),
            inland_city=r.inland_city, inland_mode=r.inland_mode, red_sea_diversion=bool(r.red_sea_diversion),
            truth=dict(delay_h=round(r.delay_h, 1), late=bool(r.late), causes=[c for c in r.causes.split("|") if c],
                       excess={s: round(r[f"excess_{s}"], 1) for s in STAGES},
                       delivered=iso(r.act_delivered)),
            milestones=[dict(key=m, sched=iso(r[f"sched_{m}"]), act=iso(r[f"act_{m}"]),
                             reported=not bool(r.get(f"miss_{m}", False))) for m in MILESTONES],
            predictions=[explain(chain, r, c, env, n_samples=400) for c in range(5)],
        )
    dump(details, WEB / "shipments.json")
    print(f"[{time.time() - t0:5.1f}s] exported dashboard data -> {WEB}")

    M = pd.DataFrame(metrics)
    print(M.pivot(index="model", columns="checkpoint", values="mae").round(1))
    print(M[M.model == "stage_chain"][["checkpoint", "auc", "brier", "coverage80", "within24"]].round(3))
    print(pd.DataFrame(attr).round(2))
    print(pd.DataFrame(robust).round(1))
    if lc:
        print(pd.DataFrame(lc).round(1))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--fast", action="store_true")
    ap.add_argument("--n", type=int, default=300)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    main(fast=a.fast, n=a.n, seed=a.seed)
