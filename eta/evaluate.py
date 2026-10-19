"""Training + evaluation harness. Produces every number quoted in the report."""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, roc_auc_score

from . import config as C
from .baselines import DirectGBM, LaneHistory
from .model import StageChain
from .simulate import MILESTONES, STAGES, simulate

MODELS = ["schedule", "carry_forward", "lane_history", "direct_gbm", "stage_chain"]
MODEL_LABELS = {
    "schedule": "Carrier schedule",
    "carry_forward": "Carry-forward lateness",
    "lane_history": "Lane history",
    "direct_gbm": "Direct GBM",
    "stage_chain": "Stage-chain (ours)",
}


def temporal_split(df: pd.DataFrame, frac: float = 0.7):
    cut = int(len(df) * frac)  # df is sorted by scheduled departure
    return df.iloc[:cut].reset_index(drop=True), df.iloc[cut:].reset_index(drop=True)


def calibrate_intervals(train: pd.DataFrame, env: dict, target: float = 0.8, seed: int = 0) -> float:
    """Pick the residual scale whose P10-P90 coverage on a later slice of the
    training period is closest to 80% (temporal validation, no test data)."""
    fit, val = temporal_split(train, 0.75)
    ch = StageChain().fit(fit, env, oof=True)
    rng = np.random.default_rng(seed)
    best, best_gap = 1.0, 9.0
    outs = {k: [] for k in (0.6, 0.7, 0.8, 0.9, 1.0, 1.1)}
    for _, row in val.iterrows():
        for c in range(4):
            for k in outs:
                ch.resid_scale = k
                s = ch.predict(row, c, env, n_samples=200, rng=rng)["samples"]
                outs[k].append(np.quantile(s, 0.1) <= row.delay_h <= np.quantile(s, 0.9))
    for k, hits in outs.items():
        gap = abs(np.mean(hits) - target)
        if gap < best_gap:
            best, best_gap = k, gap
    return best


def train_all(train: pd.DataFrame, env: dict, oof: bool = True, calibrate: bool = False):
    chain = StageChain().fit(train, env, oof=oof)
    if calibrate:
        chain.resid_scale = calibrate_intervals(train, env)
    lane = LaneHistory().fit(train)
    direct = DirectGBM().fit(train, env, chain)
    return chain, lane, direct


def predict_rows(test, env, chain, lane, direct, n_samples=300, masks=None, checkpoints=range(5), seed=0):
    rng = np.random.default_rng(seed)
    recs = []
    for i, row in test.iterrows():
        mask = masks[i] if masks is not None else None
        for c in checkpoints:
            a, lat = chain.anchor(row, c, mask)
            out = chain.predict(row, c, env, n_samples=n_samples, mask=mask, rng=rng)
            rec = dict(shipment_id=row.shipment_id, lane_id=row.lane_id, checkpoint=c, y=row.delay_h,
                       anchor=a, schedule=0.0, carry_forward=lat,
                       lane_history=lane.predict(lat, a, row.lane_id))
            rec["direct_gbm"], rec["p_direct"] = direct.predict(row, c, env, (a, lat))
            if n_samples:
                s = out["samples"]
                rec.update(stage_chain=float(np.median(s)), p10=float(np.quantile(s, 0.1)),
                           p90=float(np.quantile(s, 0.9)), p_late=float((s > C.LATE_THRESHOLD_H).mean()),
                           chain_det=out["delay_det"])
            else:
                rec["stage_chain"] = out["delay_det"]
            pred_ex = {j: out["stage_excess"].get(j) for j in range(5)}
            rec.update({f"pred_ex_{j}": v for j, v in pred_ex.items()})
            recs.append(rec)
    return pd.DataFrame(recs)


def metrics_table(P: pd.DataFrame) -> list[dict]:
    out = []
    for c, g in P.groupby("checkpoint"):
        y = g["y"].values
        late = y > C.LATE_THRESHOLD_H
        for m in MODELS:
            err = np.abs(g[m].values - y)
            rec = dict(checkpoint=int(c), model=m, mae=float(err.mean()), rmse=float(np.sqrt((err ** 2).mean())),
                       within24=float((err <= 24).mean()), p90_err=float(np.quantile(err, 0.9)))
            if m == "stage_chain" and "p_late" in g and late.any() and (~late).any():
                rec.update(auc=float(roc_auc_score(late, g["p_late"])), brier=float(brier_score_loss(late, g["p_late"])),
                           coverage80=float(((y >= g["p10"]) & (y <= g["p90"])).mean()),
                           width80=float((g["p90"] - g["p10"]).mean()))
            if m == "direct_gbm" and late.any() and (~late).any():
                rec.update(auc=float(roc_auc_score(late, g["p_direct"])), brier=float(brier_score_loss(late, g["p_direct"])))
            out.append(rec)
    return out


def bootstrap_gain(P: pd.DataFrame, a="stage_chain", b="lane_history", n=2000, seed=0) -> list[dict]:
    """95% CI of MAE(b) - MAE(a), resampling shipments."""
    rng = np.random.default_rng(seed)
    out = []
    for c, g in P.groupby("checkpoint"):
        ea, eb = np.abs(g[a] - g.y).values, np.abs(g[b] - g.y).values
        idx = rng.integers(0, len(g), (n, len(g)))
        d = eb[idx].mean(1) - ea[idx].mean(1)
        out.append(dict(checkpoint=int(c), gain=float(eb.mean() - ea.mean()),
                        lo=float(np.quantile(d, 0.025)), hi=float(np.quantile(d, 0.975))))
    return out


def attribution_accuracy(P: pd.DataFrame, test: pd.DataFrame, lane: LaneHistory) -> list[dict]:
    """For late shipments: does the model point at the stage that truly caused most delay?

    Scored over the stages still in the future at each checkpoint, against the
    simulator's ground-truth stage excess. Baseline = the lane's historically
    worst stage.
    """
    t = test.set_index("shipment_id")
    out = []
    for c, g in P.groupby("checkpoint"):
        if c >= 4:
            continue
        hit = base = n = 0
        for _, r in g.iterrows():
            s = t.loc[r.shipment_id]
            if s.delay_h <= C.LATE_THRESHOLD_H:
                continue
            fut = list(range(int(r.anchor) + 1, 5))
            if len(fut) < 2:
                continue
            true_top = max(fut, key=lambda j: s[f"excess_{STAGES[j]}"])
            if s[f"excess_{STAGES[true_top]}"] <= 0:
                continue
            pred_top = max(fut, key=lambda j: r[f"pred_ex_{j}"])
            m = lane.stage_means(s.lane_id)
            base_top = max(fut, key=lambda j: m[f"excess_{STAGES[j]}"])
            hit += pred_top == true_top
            base += base_top == true_top
            n += 1
        out.append(dict(checkpoint=int(c), n=n, model=hit / max(n, 1), lane_baseline=base / max(n, 1),
                        chance=float(np.mean([1 / len(range(int(a) + 1, 5)) for a in g.anchor]))))
    return out


def missing_data_robustness(test, env, chain, lane, direct, rates=(0.0, 0.25, 0.5, 0.75), seed=11):
    rng = np.random.default_rng(seed)
    out = []
    for r in rates:
        masks = [{m: bool(rng.random() < r) for m in MILESTONES[:4]} for _ in range(len(test))]
        # Direct GBM reads the dataset's miss_ flags; give it the same view.
        t2 = test.copy()
        for m in MILESTONES[:4]:
            t2[f"miss_{m}"] = [mk[m] for mk in masks]
        P = predict_rows(t2, env, chain, lane, direct, n_samples=0, masks=masks, checkpoints=range(1, 5))
        rec = dict(rate=r)
        for m in ["carry_forward", "lane_history", "direct_gbm", "stage_chain"]:
            rec[m] = float(np.abs(P[m] - P.y).mean())
        out.append(rec)
    return out


def learning_curve(sizes=(100, 200, 300, 600, 1200, 2400), seed=7):
    """Same generator and seed (so the same ports/weather/disruptions), more shipments."""
    out = []
    for n in sizes:
        df, env = simulate(n=n, seed=seed)
        tr, te = temporal_split(df)
        chain, lane, direct = train_all(tr, env, oof=True)
        P = predict_rows(te, env, chain, lane, direct, n_samples=100, checkpoints=[0, 2])
        for c, g in P.groupby("checkpoint"):
            out.append(dict(n=n, checkpoint=int(c), stage_chain=float(np.abs(g.stage_chain - g.y).mean()),
                            lane_history=float(np.abs(g.lane_history - g.y).mean()),
                            direct_gbm=float(np.abs(g.direct_gbm - g.y).mean())))
    return out
