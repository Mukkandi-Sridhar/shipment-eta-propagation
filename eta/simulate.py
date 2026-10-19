"""Causal simulator of container shipment journeys.

Every shipment walks through the same physical process a real ocean+inland
move does, and each stage's duration is generated from mechanisms rather
than from independent noise:

  origin    vessel cut-off / departure: congestion-driven rollovers (+1 week)
  ocean     sea time + weather; carriers speed up to recover small delays;
            transshipment connections are missed when lateness eats the buffer
  port      berth queue (M/M/1-style u/(1-u) growth) and discharge; a vessel
            that misses its berth window is re-queued behind on-time vessels
  customs   commodity risk, document quality, inspections, and releases only
            during working hours (weekend / holiday holds)
  last mile pre-booked truck appointment or fixed-day rail departures; ready
            early -> slack absorbs, ready late -> wait for the next slot

Because the generator records every timestamp and every triggered cause,
we know the true stage-by-stage delay decomposition for each shipment and
can score the model's explanations, not just its ETAs.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import config as C

EPOCH = pd.Timestamp("2025-01-01")
N_DAYS = 520  # environment series length (covers deliveries spilling into 2026)
STAGES = ["origin", "ocean", "port", "customs", "last_mile"]
# milestone k is the END of stage k
MILESTONES = ["departed", "arrived", "discharged", "released", "delivered"]


def _day_of_year(day_idx: np.ndarray) -> np.ndarray:
    return (np.asarray(day_idx) % 365) / 365.0


def build_environment(rng: np.random.Generator) -> dict:
    """Daily port utilisation and sea-region weather severity."""
    days = np.arange(N_DAYS)
    doy = _day_of_year(days)
    util, util_clim = {}, {}
    for code, p in C.PORTS.items():
        season = np.zeros(N_DAYS)
        if code in ("USLAX", "USNYC"):           # US import peak season Aug-Oct
            season += 0.06 * np.exp(-((doy - 0.70) / 0.08) ** 2)
        if code.startswith("CN") or code in ("VNSGN", "KRPUS"):  # pre-Lunar-New-Year rush
            season += 0.09 * np.exp(-((doy - 0.06) / 0.03) ** 2)
        if code in ("NLRTM", "DEHAM"):           # summer holidays + diverted bunching
            season += 0.04 * np.exp(-((doy - 0.55) / 0.07) ** 2)
        x = np.zeros(N_DAYS)
        for t in range(1, N_DAYS):
            x[t] = 0.92 * x[t - 1] + rng.normal(0, p.util_vol * 0.45)
        util[code] = np.clip(p.base_util + season + x, 0.45, 0.965)
        util_clim[code] = np.clip(p.base_util + season, 0.45, 0.965)  # the "known seasonal norm"

    regions = {
        # (monsoon / storm seasonal centre, width, amplitude, base)
        "arabian_sea": [(0.55, 0.09, 0.55)],     # SW monsoon Jun-Sep
        "indian_ocean": [(0.55, 0.10, 0.35)],
        "north_pacific": [(0.02, 0.08, 0.40), (0.68, 0.07, 0.35)],  # winter + typhoon
    }
    weather, weather_clim = {}, {}
    for reg, bumps in regions.items():
        s = np.full(N_DAYS, 0.12)
        for c, w, a in bumps:
            s += a * (np.exp(-((doy - c) / w) ** 2) + np.exp(-((doy - c - 1) / w) ** 2))
        x = np.zeros(N_DAYS)
        for t in range(1, N_DAYS):
            x[t] = 0.85 * x[t - 1] + rng.normal(0, 0.06)
        storms = (rng.random(N_DAYS) < 0.015).astype(float)
        storms = np.convolve(storms, np.ones(4), mode="same") * 0.35
        weather[reg] = np.clip(s + x + storms, 0, 1)
        weather_clim[reg] = np.clip(s, 0, 1)
    return {"util": util, "weather": weather, "util_clim": util_clim, "weather_clim": weather_clim}


def env_at(series: np.ndarray, hours: float) -> float:
    d = int(np.clip(hours // 24, 0, len(series) - 1))
    return float(series[d])


def env_mean(series: np.ndarray, h0: float, h1: float) -> float:
    d0 = int(np.clip(h0 // 24, 0, len(series) - 1))
    d1 = int(np.clip(h1 // 24, d0 + 1, len(series)))
    return float(series[d0:d1].mean())


def _h(date: str) -> float:
    return (pd.Timestamp(date) - EPOCH).total_seconds() / 3600


HOLIDAY_DAYS = {int(_h(d) // 24) for d in C.HOLIDAYS}


def is_working(hours: float) -> bool:
    day = int(hours // 24)
    wd = (EPOCH.weekday() + day) % 7
    hod = hours % 24
    return wd < 5 and day not in HOLIDAY_DAYS and 8 <= hod < 18


def next_working(hours: float) -> float:
    """Snap a release time forward to the next customs working window."""
    t = hours
    for _ in range(24 * 10):
        if is_working(t):
            return t
        t = np.floor(t) + 1
    return t


def next_rail_departure(hours: float) -> float:
    """Rail ramps depart 20:00 on fixed weekdays."""
    day = int(hours // 24)
    for k in range(0, 15):
        d = day + k
        wd = (EPOCH.weekday() + d) % 7
        dep = d * 24 + 20
        if wd in C.RAIL_DEPARTURE_WEEKDAYS and dep >= hours:
            return float(dep)
    return hours


def _sigmoid(x: float) -> float:
    return 1 / (1 + np.exp(-x))


def queue_factor(u: float) -> float:
    return u / (1 - u)


def simulate(n: int = 300, seed: int = 7, missing_rate: float = 1.0) -> tuple[pd.DataFrame, dict]:
    rng = np.random.default_rng(seed)
    env = build_environment(rng)
    util, weather = env["util"], env["weather"]
    lanes = C.LANES
    lane_p = np.array([l.weight for l in lanes]) / sum(l.weight for l in lanes)
    carriers = list(C.CARRIERS)
    commodities = list(C.COMMODITIES)
    rs0, rs1 = _h(C.RED_SEA_WINDOW[0]), _h(C.RED_SEA_WINDOW[1])

    rows = []
    for i in range(n):
        lane = lanes[rng.choice(len(lanes), p=lane_p)]
        carrier = carriers[rng.integers(len(carriers))]
        rel = C.CARRIERS[carrier]
        commodity = commodities[rng.integers(len(commodities))]
        cbase, crisk, hazmat = C.COMMODITIES[commodity]
        docs_complete = rng.random() > 0.14
        new_importer = rng.random() < 0.15
        teu = int(rng.uniform(4000, 9000) if lane.transit_days < 10 else rng.uniform(9000, 20000))
        std = rng.uniform(_h("2025-01-04"), _h("2025-11-25"))
        std = np.floor(std / 24) * 24 + rng.choice([6, 12, 18, 22])
        causes: list[str] = []

        # ---------- scheduled plan (what the booking promises) ----------
        transit_h = lane.transit_days * 24
        red_sea_div = lane.via_red_sea and rs0 <= std <= rs1 and rng.random() < 0.85
        # Diversion is announced by carriers, so the *schedule* is re-issued only for
        # bookings made after the first month; earlier bookings get surprised.
        div_in_schedule = red_sea_div and std > rs0 + 30 * 24
        div_h = 240.0 if red_sea_div else 0.0
        sched_transit = transit_h + (div_h if div_in_schedule else 0)
        hub_dwell_sched = C.SCHEDULED_HUB_DWELL_H if lane.hub else 0
        s_dep = std
        s_arr = s_dep + sched_transit + hub_dwell_sched
        s_dis = s_arr + C.SCHED_BERTH_WAIT_H + C.SCHED_DISCHARGE_H
        s_rel = s_dis + C.SCHED_CUSTOMS_H
        appt = s_rel + C.SCHED_APPT_BUFFER_H
        if lane.inland_mode == "rail":
            s_pick = next_rail_departure(appt + 12)
        else:
            s_pick = appt
        s_del = s_pick + lane.inland_hours

        # ---------- origin ----------
        u_o = env_at(util[lane.origin], std)
        w_o = env_at(weather[lane.sea_region], std)
        p_roll = _sigmoid(-3.4 + 12 * (u_o - 0.78) + 3.0 * (0.58 - rel))
        rolled = rng.random() < p_roll
        dep_delay = rng.gamma(1.6, 3.2 * (1 + 5 * max(0, u_o - 0.72)) * (1.7 - rel)) + 14 * w_o * rng.random()
        atd = std + dep_delay + (168 if rolled else 0)
        if rolled:
            causes.append("rolled_over")

        # ---------- ocean (incl. transshipment) ----------
        def sea_leg(t0: float, hours: float, extra: float) -> tuple[float, float]:
            w = env_mean(weather[lane.sea_region], t0, t0 + hours)
            wx = 24 * (hours / 24) * 0.07 * w * rng.lognormal(0, 0.35)
            return hours * (1 + rng.normal(0, 0.015)) + wx + extra, wx

        hub_arr = hub_dep = np.nan
        conn_missed = False
        if lane.hub:
            leg1 = 0.3 * transit_h
            t_leg1, wx1 = sea_leg(atd, leg1, 0)
            hub_arr = atd + t_leg1
            u_h = env_at(util[lane.hub], hub_arr)
            ready = hub_arr + 14 + 30 * max(0, u_h - 0.75) * rng.random()
            sched_conn = s_dep + leg1 + hub_dwell_sched
            interval = C.HUB_CONNECTION_INTERVAL_H[lane.hub]
            conn_dep = sched_conn + rng.gamma(1.4, 5 * (1 + 4 * max(0, u_h - 0.75)))
            k = 0
            while ready > conn_dep:
                k += 1
                conn_dep = sched_conn + k * interval + rng.gamma(1.4, 5)
            conn_missed = k > 0
            if conn_missed:
                causes.append("missed_connection")
            hub_dep = conn_dep
            leg2 = transit_h - leg1
            t_leg2, wx2 = sea_leg(hub_dep, leg2, div_h)
            ata = hub_dep + t_leg2
            wx = wx1 + wx2
        else:
            t_sea, wx = sea_leg(atd, transit_h, div_h)
            ata = atd + t_sea
        if wx > 0.05 * transit_h:
            causes.append("heavy_weather")
        if red_sea_div and not div_in_schedule:
            causes.append("red_sea_diversion")
        # schedule recovery: vessel steams faster when late (bounded by lane length)
        late_vessel = ata - s_arr
        if late_vessel > 0:
            recover = min(0.55 * late_vessel, 0.045 * transit_h * (0.6 + rel))
            if rolled:  # rolled cargo sails on a later vessel that is itself on schedule
                recover = min(recover, max(0, late_vessel - 168))
            ata -= recover

        # ---------- port: berth + discharge ----------
        u_d = env_at(util[lane.dest], ata)
        late_arr = ata - s_arr
        berth_wait = 5.5 * queue_factor(u_d) * rng.lognormal(0, 0.35)
        if late_arr > 18:  # lost berth window -> re-queued behind scheduled calls
            berth_wait = berth_wait * 1.7 + 10
            causes.append("missed_berth_window")
        strike = C.STRIKE_WINDOWS.get(lane.dest)
        if strike and _h(strike[0]) <= ata + berth_wait <= _h(strike[1]) + 24:
            berth_wait += _h(strike[1]) + 24 - (ata + berth_wait) + 20
            causes.append("labour_strike")
        atb = ata + berth_wait
        discharge = teu / 1000 * 2.1 * (1 + 1.2 * max(0, u_d - 0.75)) * rng.lognormal(0, 0.15)
        dis = atb + discharge
        if berth_wait > 40:
            causes.append("port_congestion")

        # ---------- customs ----------
        u_now = env_at(util[lane.dest], dis)
        p_insp = _sigmoid(-2.3 + crisk + 1.3 * (not docs_complete) + 1.0 * new_importer)
        clear = cbase * C.PORTS[lane.dest].customs_speed * (1 + 1.5 * max(0, u_now - 0.75)) * rng.lognormal(0, 0.25)
        if not docs_complete:
            clear += rng.uniform(24, 72)
            causes.append("docs_incomplete")
        if rng.random() < p_insp:
            clear += rng.uniform(48, 120)
            causes.append("customs_inspection")
        rel_raw = dis + clear
        rel_t = next_working(rel_raw)
        if rel_t - rel_raw > 12:
            causes.append("weekend_holiday_hold")

        # ---------- last mile ----------
        if lane.inland_mode == "rail":
            ready = rel_t + 12 * rng.lognormal(0, 0.2)
            pick = next_rail_departure(max(ready, s_pick))
            if pick > s_pick + 1:
                causes.append("missed_rail_cutoff")
            transit = lane.inland_hours * (1 + abs(rng.normal(0, 0.06))) + rng.gamma(1.2, 4)
        else:
            if rel_t <= appt:
                pick = appt  # early release waits for the booked slot: slack absorbs
            else:
                rebook = 6 + 7.5 * queue_factor(u_now) * rng.lognormal(0, 0.3)
                pick = rel_t + rebook
                hod = pick % 24
                if hod < 6 or hod >= 20:  # trucks dispatched 06-20
                    pick = np.floor(pick / 24) * 24 + (30 if hod >= 20 else 6)
                if pick - appt > 6:
                    causes.append("missed_truck_appointment")
            transit = lane.inland_hours * rng.lognormal(0, 0.12) + rng.uniform(0, 3)
        deliv = pick + transit

        rows.append(dict(
            shipment_id=f"SHP-{1000 + i}",
            lane_id=lane.lane_id, origin=lane.origin, dest=lane.dest, hub=lane.hub or "",
            inland_city=lane.inland_city, inland_mode=lane.inland_mode,
            carrier=carrier, carrier_reliability=rel, commodity=commodity, hazmat=hazmat,
            docs_complete=docs_complete, new_importer=new_importer, vessel_teu=teu,
            red_sea_diversion=red_sea_div, diversion_in_schedule=div_in_schedule,
            rolled_over=rolled, missed_connection=conn_missed,
            sched_departed=s_dep, sched_arrived=s_arr, sched_discharged=s_dis,
            sched_released=s_rel, sched_delivered=s_del, sched_pickup=s_pick,
            sched_hub_arrived=(s_dep + 0.3 * transit_h) if lane.hub else np.nan,
            act_departed=atd, act_hub_arrived=hub_arr, act_hub_departed=hub_dep,
            act_arrived=ata, act_berthed=atb, act_discharged=dis,
            act_released=rel_t, act_pickup=pick, act_delivered=deliv,
            weather_ocean_h=wx, berth_wait_h=berth_wait,
            causes="|".join(causes),
        ))

    df = pd.DataFrame(rows).sort_values("sched_departed").reset_index(drop=True)
    df["delay_h"] = df["act_delivered"] - df["sched_delivered"]
    df["late"] = df["delay_h"] > C.LATE_THRESHOLD_H

    # Stage-level ground truth: excess duration of each stage vs its schedule.
    prev_a, prev_s = df["sched_departed"].copy(), df["sched_departed"].copy()
    for stage, m in zip(STAGES, MILESTONES):
        df[f"excess_{stage}"] = (df[f"act_{m}"] - prev_a) - (df[f"sched_{m}"] - prev_s)
        prev_a, prev_s = df[f"act_{m}"], df[f"sched_{m}"]

    # Missing event feeds (EDI / AIS gaps). Final delivery (POD) is always known.
    miss_p = {"departed": 0.03, "arrived": 0.05, "berthed": 0.20, "discharged": 0.15,
              "released": 0.08, "pickup": 0.10, "hub_arrived": 0.15, "hub_departed": 0.15}
    for m, p in miss_p.items():
        df[f"miss_{m}"] = rng.random(len(df)) < p * missing_rate
    return df, env


def to_datetime(hours: float) -> pd.Timestamp:
    return EPOCH + pd.Timedelta(hours=float(hours))
