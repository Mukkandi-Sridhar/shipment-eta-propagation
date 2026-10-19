"""Stage-chain ETA model.

The journey is split into five stages (origin, ocean, port, customs, last
mile). One gradient-boosted model per stage predicts how many hours that
stage will run over (or under) its schedule, given

  * what is known *as of the prediction time* (congestion and weather feeds,
    seasonal norms, booking attributes), and
  * how late the shipment is when the stage starts (``lateness_in``).

At inference the stages are chained: the predicted lateness leaving stage k
is the ``lateness_in`` of stage k+1, so delay propagates (amplifies or is
absorbed) exactly the way the stage models learned it does. Monte-Carlo
sampling of out-of-fold residuals through the chain gives a delivery-time
distribution (P10/P50/P90) and P(late). TreeSHAP on each stage model,
summed along the chain, gives an additive explanation of the final delay.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import GroupKFold

from . import config as C
from .simulate import EPOCH, HOLIDAY_DAYS, MILESTONES, STAGES, _h

CHECKPOINTS = ["booked", "departed", "arrived", "discharged", "released"]
CHECKPOINT_LABELS = ["At booking", "Vessel departed", "Vessel arrived", "Container discharged", "Customs released"]
STAGE_LABELS = ["Origin port", "Ocean leg", "Destination port", "Customs", "Last mile"]

STATIC = ["transit_days", "has_hub", "rail", "inland_hours", "carrier_reliability", "vessel_teu",
          "commodity_base_h", "commodity_risk", "hazmat", "docs_complete", "new_importer",
          "customs_speed", "red_sea_surprise", "diversion_in_schedule", "season_sin", "season_cos"]
ASOF = ["cong_origin_now", "cong_hub_now", "cong_dest_now", "cong_dest_norm", "weather_now", "weather_norm"]
DYNAMIC = ["lateness_in", "horizon_h", "start_weekday", "start_hour", "holiday_near", "strike_known", "sched_stage_h"]
FEATURES = STATIC + ASOF + DYNAMIC

FACTOR_GROUPS = {
    "Upstream delay (propagated)": ["lateness_in"],
    "Destination port congestion": ["cong_dest_now", "cong_dest_norm"],
    "Origin / hub congestion": ["cong_origin_now", "cong_hub_now"],
    "Weather": ["weather_now", "weather_norm"],
    "Customs risk profile": ["commodity_base_h", "commodity_risk", "hazmat", "docs_complete", "new_importer", "customs_speed"],
    "Calendar & cut-offs": ["start_weekday", "start_hour", "holiday_near", "season_sin", "season_cos"],
    "Disruptions (Red Sea, strikes)": ["red_sea_surprise", "diversion_in_schedule", "strike_known"],
    "Carrier & vessel": ["carrier_reliability", "vessel_teu"],
    "Route structure & lead time": ["transit_days", "has_hub", "rail", "inland_hours", "sched_stage_h", "horizon_h"],
}
FEATURE_TO_GROUP = {f: g for g, fs in FACTOR_GROUPS.items() for f in fs}


# ---------------------------------------------------------------- features
def static_features(row: pd.Series) -> dict:
    lane = C.LANE_BY_ID[row.lane_id]
    cbase, crisk, _ = C.COMMODITIES[row.commodity]
    doy = ((row.sched_departed / 24) % 365) / 365
    return dict(
        transit_days=lane.transit_days, has_hub=float(bool(lane.hub)), rail=float(lane.inland_mode == "rail"),
        inland_hours=lane.inland_hours, carrier_reliability=row.carrier_reliability, vessel_teu=row.vessel_teu,
        commodity_base_h=cbase, commodity_risk=crisk, hazmat=float(row.hazmat),
        docs_complete=float(row.docs_complete), new_importer=float(row.new_importer),
        customs_speed=C.PORTS[lane.dest].customs_speed,
        red_sea_surprise=float(row.red_sea_diversion and not row.diversion_in_schedule),
        diversion_in_schedule=float(row.diversion_in_schedule),
        season_sin=np.sin(2 * np.pi * doy), season_cos=np.cos(2 * np.pi * doy),
    )


def _at(series: np.ndarray, hours) -> np.ndarray:
    d = np.clip(np.asarray(hours) // 24, 0, len(series) - 1).astype(int)
    return series[d]


def asof_features(row: pd.Series, now_h: float, env: dict, stage: int) -> dict:
    """Signals a planner could actually see at ``now_h`` (no future leakage)."""
    lane = C.LANE_BY_ID[row.lane_id]
    sched_end = row[f"sched_{MILESTONES[stage]}"]
    hub = lane.hub or lane.origin
    region_series = env["weather"][lane.sea_region]
    return dict(
        cong_origin_now=float(_at(env["util"][lane.origin], now_h)),
        cong_hub_now=float(_at(env["util"][hub], now_h)) if lane.hub else 0.0,
        cong_dest_now=float(_at(env["util"][lane.dest], now_h)),
        cong_dest_norm=float(_at(env["util_clim"][lane.dest], sched_end)),
        weather_now=float(_at(region_series, now_h)),
        weather_norm=float(np.mean(env["weather_clim"][lane.sea_region][
            int(row.sched_departed // 24): int(row.sched_arrived // 24) + 1])),
    )


def dynamic_features(row: pd.Series, stage: int, now_h: float, lateness_in: np.ndarray) -> dict:
    """Features that depend on *when* the stage starts (vectorised over samples)."""
    lane = C.LANE_BY_ID[row.lane_id]
    sched_start = row.sched_departed if stage == 0 else row[f"sched_{MILESTONES[stage - 1]}"]
    sched_end = row[f"sched_{MILESTONES[stage]}"]
    start = sched_start + lateness_in
    day = (start // 24).astype(int)
    hol = np.zeros_like(start)
    for k in range(4):
        hol = np.maximum(hol, np.isin(day + k, list(HOLIDAY_DAYS)).astype(float))
    strike = np.zeros_like(start)
    w = C.STRIKE_WINDOWS.get(lane.dest)
    if w and stage in (2, 3):
        s0, s1 = _h(w[0]), _h(w[1])
        announced = now_h >= s0 - 14 * 24
        strike = ((start + 72 >= s0) & (start <= s1 + 24) & announced).astype(float)
    return dict(
        lateness_in=lateness_in,
        horizon_h=np.maximum(start - now_h, 0),
        start_weekday=((EPOCH.weekday() + day) % 7).astype(float),
        start_hour=start % 24,
        holiday_near=hol,
        strike_known=strike,
        sched_stage_h=np.full_like(start, sched_end - sched_start),
    )


def checkpoint_time(row: pd.Series, c: int) -> float:
    return row.sched_departed - 48 if c == 0 else row[f"act_{MILESTONES[c - 1]}"]


def milestone_observed(row: pd.Series, k: int, mask: dict | None = None) -> bool:
    m = MILESTONES[k]
    if m == "delivered":
        return True
    miss = mask[m] if mask is not None else row.get(f"miss_{m}", False)
    return not bool(miss)


def feature_matrix(row, stage, now_h, lateness_in, env, static=None, asof=None, overrides=None) -> pd.DataFrame:
    lateness_in = np.atleast_1d(np.asarray(lateness_in, dtype=float))
    static = static if static is not None else static_features(row)
    asof = asof if asof is not None else asof_features(row, now_h, env, stage)
    feats = {**static, **asof}
    if overrides:
        feats.update({k: v for k, v in overrides.items() if k in feats})
    dyn = dynamic_features(row, stage, now_h, lateness_in)
    out = {k: np.full(len(lateness_in), v, dtype=float) for k, v in feats.items()}
    out.update(dyn)
    return pd.DataFrame(out)[FEATURES]


# ------------------------------------------------------------- training
def stage_training_rows(df: pd.DataFrame, env: dict) -> dict[int, pd.DataFrame]:
    """One row per (shipment, stage, checkpoint before that stage), teacher-forced."""
    per_stage = {j: [] for j in range(5)}
    for _, row in df.iterrows():
        static = static_features(row)
        for j in range(5):
            start_obs = j == 0 or milestone_observed(row, j - 1)
            if not (start_obs and milestone_observed(row, j)):
                continue  # need both ends of the stage to learn its duration
            lat_in = 0.0 if j == 0 else row[f"act_{MILESTONES[j - 1]}"] - row[f"sched_{MILESTONES[j - 1]}"]
            if j == 0:
                lat_in = 0.0
            for c in range(j + 1):
                now = checkpoint_time(row, c)
                X = feature_matrix(row, j, now, [lat_in], env, static=static)
                X["y"] = row[f"excess_{STAGES[j]}"]
                X["shipment_id"] = row.shipment_id
                X["checkpoint"] = c
                per_stage[j].append(X)
    return {j: pd.concat(v, ignore_index=True) for j, v in per_stage.items()}


def make_gbm(seed: int = 0) -> HistGradientBoostingRegressor:
    return HistGradientBoostingRegressor(max_iter=250, learning_rate=0.05, max_leaf_nodes=12,
                                         min_samples_leaf=8, l2_regularization=1.0, random_state=seed)


@dataclass
class StageChain:
    models: dict = field(default_factory=dict)
    residuals: dict = field(default_factory=dict)   # (stage, near) -> residual pool
    explainers: dict = field(default_factory=dict)
    base_values: dict = field(default_factory=dict)
    resid_scale: float = 1.0   # set by calibrate_intervals()

    def fit(self, df: pd.DataFrame, env: dict, seed: int = 0, oof: bool = True) -> "StageChain":
        rows = stage_training_rows(df, env)
        for j, R in rows.items():
            X, y = R[FEATURES], R["y"].values
            self.models[j] = make_gbm(seed).fit(X, y)
            if oof:
                pred = np.zeros(len(R))
                for tr, te in GroupKFold(n_splits=5).split(X, y, R["shipment_id"]):
                    pred[te] = make_gbm(seed).fit(X.iloc[tr], y[tr]).predict(X.iloc[te])
                res = y - pred
                near = R["horizon_h"].values < 24
                self.residuals[(j, True)] = res[near] if near.sum() > 20 else res
                self.residuals[(j, False)] = res[~near] if (~near).sum() > 20 else res
        return self

    def init_explainers(self):
        import shap
        for j, m in self.models.items():
            self.explainers[j] = shap.TreeExplainer(m)
            self.base_values[j] = float(np.atleast_1d(self.explainers[j].expected_value)[0])

    # ---------------------------------------------------------- inference
    def anchor(self, row, c, mask=None):
        obs = [k for k in range(c) if milestone_observed(row, k, mask)]
        a = max(obs) if obs else -1
        lat = 0.0 if a < 0 else row[f"act_{MILESTONES[a]}"] - row[f"sched_{MILESTONES[a]}"]
        return a, lat

    def predict(self, row, c, env, n_samples=0, mask=None, overrides=None, extra_lateness=0.0,
                rng=None, explain=False):
        """Predict final delay for ``row`` standing at checkpoint ``c``.

        Returns dict with deterministic per-stage excesses, optional MC samples and SHAP.
        """
        now = checkpoint_time(row, c)
        a, lat0 = self.anchor(row, c, mask)
        lat0 += extra_lateness
        static = static_features(row)
        if overrides:
            static.update({k: v for k, v in overrides.items() if k in static})
        out = {"anchor": a, "observed_lateness": lat0, "stage_excess": {}, "stage_shap": {},
               "knock_on": {}, "reference": {}, "now": now}
        # deterministic chain
        lat = np.array([lat0])
        for j in range(a + 1, 5):
            asof = asof_features(row, now, env, j)
            X = feature_matrix(row, j, now, lat, env, static=static, asof=asof, overrides=overrides)
            e = float(self.models[j].predict(X)[0])
            if explain:
                # knock-on = forecast at actual lateness - forecast had it arrived on time
                X0 = X.copy()
                X0["lateness_in"] = 0.0
                X0["horizon_h"] = np.maximum(X0["horizon_h"] - lat, 0)
                e0 = float(self.models[j].predict(X0)[0])
                out["knock_on"][j] = e - e0
                # attribute the on-time part with TreeSHAP; the on-time lateness term
                # joins the reference so that everything stays exactly additive
                sv = dict(zip(FEATURES, map(float, self.explainers[j].shap_values(X0)[0])))
                out["reference"][j] = self.base_values[j] + sv.pop("lateness_in")
                sv["lateness_in"] = e - e0
                out["stage_shap"][j] = sv
            out["stage_excess"][j] = e
            lat = lat + e
        out["delay_det"] = float(lat[0])
        # Monte-Carlo through the chain
        if n_samples:
            rng = rng or np.random.default_rng(0)
            lat = np.full(n_samples, lat0)
            for j in range(a + 1, 5):
                asof = asof_features(row, now, env, j)
                X = feature_matrix(row, j, now, lat, env, static=static, asof=asof, overrides=overrides)
                mu = self.models[j].predict(X)
                near = X["horizon_h"].values < 24
                pool_n, pool_f = self.residuals[(j, True)], self.residuals[(j, False)]
                eps = np.where(near, rng.choice(pool_n, n_samples), rng.choice(pool_f, n_samples))
                lat = lat + mu + self.resid_scale * eps
            out["samples"] = lat
        return out
