"""Reference predictors the stage chain has to beat."""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor

from . import config as C
from .model import ASOF, STATIC, StageChain, asof_features, checkpoint_time, static_features
from .simulate import MILESTONES, STAGES

# No checkpoint index: with missing event feeds the model must not be told which
# milestone just happened, only what was reported and what the clock says.
DIRECT_FEATURES = STATIC + ASOF + ["anchor_lateness", "anchor_stage", "sched_remaining_h"]


class LaneHistory:
    """Observed lateness so far + the lane's median remaining-stage slippage."""

    def fit(self, df: pd.DataFrame):
        cols = [f"excess_{s}" for s in STAGES]
        self.means = df.groupby("lane_id")[cols].mean()
        self.global_means = df[cols].mean()
        # median of the *sum* of remaining stages (MAE-optimal, robust to tails)
        self.remaining = {}
        for lane_id, g in list(df.groupby("lane_id")) + [("*", df)]:
            ex = g[cols].values
            self.remaining[lane_id] = [float(np.median(ex[:, a + 1:].sum(1))) for a in range(-1, 5)]
        return self

    def stage_means(self, lane_id):
        return self.means.loc[lane_id] if lane_id in self.means.index else self.global_means

    def predict(self, lat0: float, anchor: int, lane_id: str) -> float:
        rem = self.remaining.get(lane_id, self.remaining["*"])
        return lat0 + rem[anchor + 1]


def direct_row(row, c, env, chain_anchor):
    a, lat = chain_anchor
    now = checkpoint_time(row, c)
    f = {**static_features(row), **asof_features(row, now, env, 4)}
    f.update(anchor_lateness=lat, anchor_stage=a, sched_remaining_h=row.sched_delivered - now)
    return f


class DirectGBM:
    """One pooled model: (shipment, checkpoint) -> final delay. No stage structure."""

    def fit(self, df, env, chain: StageChain):
        rows, y = [], []
        for _, r in df.iterrows():
            for c in range(5):
                rows.append(direct_row(r, c, env, chain.anchor(r, c)))
                y.append(r.delay_h)
        X = pd.DataFrame(rows)[DIRECT_FEATURES]
        y = np.array(y)
        params = dict(max_iter=300, learning_rate=0.05, max_leaf_nodes=12, min_samples_leaf=8,
                      l2_regularization=1.0, random_state=0)
        self.reg = HistGradientBoostingRegressor(loss="absolute_error", **params).fit(X, y)
        self.clf = HistGradientBoostingClassifier(**params).fit(X, y > C.LATE_THRESHOLD_H)
        self.X_train = X
        return self

    def predict(self, row, c, env, anchor):
        X = pd.DataFrame([direct_row(row, c, env, anchor)])[DIRECT_FEATURES]
        return float(self.reg.predict(X)[0]), float(self.clf.predict_proba(X)[0, 1])
