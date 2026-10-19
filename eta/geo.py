"""Sea-lane waypoints so routes follow real corridors instead of crossing land."""

from . import config as C

W = {
    "luzon": (21.0, 121.5), "taiwan_s": (22.0, 120.5), "east_china": (30.5, 123.5),
    "sg_strait": (1.2, 104.2), "malacca": (3.0, 100.5), "malacca_n": (6.0, 95.0), "vn_s": (8.0, 106.5),
    "lk_s": (5.6, 80.5), "arab": (14.0, 62.0), "aden": (12.2, 46.0), "bab": (12.6, 43.4),
    "red_mid": (20.0, 38.4), "suez_s": (29.5, 32.6), "port_said": (31.6, 32.3),
    "crete": (34.2, 24.0), "sicily": (37.0, 11.8), "gibraltar": (35.95, -5.8), "finisterre": (43.5, -10.0),
    "ushant": (48.6, -5.8), "dover": (51.0, 1.6), "elbe": (54.0, 8.0),
    "hormuz": (26.4, 56.6), "oman": (22.8, 60.5),
    "atl_mid": (37.0, -40.0), "ny_app": (40.2, -72.5),
    "pac_w": (33.5, 140.0), "pac_mid": (42.0, 180.0), "pac_e": (36.0, -135.0), "la_app": (33.5, -119.5),
    "korea_s": (34.0, 130.0),
    "chagos": (-8.0, 72.0), "madagascar": (-28.0, 45.0), "cape": (-35.5, 19.5), "namibia": (-20.0, 8.0),
    "gulf_guinea": (0.0, -8.0), "canaries": (28.0, -18.0),
}

SUEZ_EU = ["aden", "bab", "red_mid", "suez_s", "port_said", "crete", "sicily", "gibraltar", "finisterre", "ushant", "dover"]
CAPE_EU = ["chagos", "madagascar", "cape", "namibia", "gulf_guinea", "canaries", "finisterre", "ushant", "dover"]
SUEZ_US = ["aden", "bab", "red_mid", "suez_s", "port_said", "crete", "sicily", "gibraltar", "atl_mid", "ny_app"]

ROUTES = {
    "SHA-RTM": ["east_china", "taiwan_s", "vn_s", "sg_strait", "malacca", "malacca_n", "lk_s", "arab"] + SUEZ_EU,
    "YTN-LAX": ["luzon", "pac_w", "pac_mid", "pac_e", "la_app"],
    "PUS-LAX": ["korea_s", "pac_w", "pac_mid", "pac_e", "la_app"],
    "NSA-HAM": ["arab"] + SUEZ_EU + ["elbe"],
    "MAA-RTM": ["lk_s", "LKCMB", "lk_s", "arab"] + SUEZ_EU,
    "SGN-RTM": ["vn_s", "SGSIN", "sg_strait", "malacca", "malacca_n", "lk_s", "arab"] + SUEZ_EU,
    "SIN-NYC": ["sg_strait", "malacca", "malacca_n", "lk_s", "arab"] + SUEZ_US,
    "NSA-JEA": ["oman", "hormuz"],
    "NSA-NYC": ["lk_s", "LKCMB", "lk_s", "arab"] + SUEZ_US,
}
CAPE_ROUTES = {
    "SHA-RTM": ["east_china", "taiwan_s", "vn_s", "sg_strait", "malacca", "malacca_n", "lk_s"] + CAPE_EU,
    "NSA-HAM": ["lk_s"] + CAPE_EU + ["elbe"],
    "MAA-RTM": ["lk_s", "LKCMB", "lk_s"] + CAPE_EU,
    "SGN-RTM": ["vn_s", "SGSIN", "sg_strait", "malacca", "malacca_n", "lk_s"] + CAPE_EU,
    "SIN-NYC": ["sg_strait", "malacca", "malacca_n", "lk_s", "chagos", "madagascar", "cape", "namibia", "atl_mid", "ny_app"],
    "NSA-NYC": ["lk_s", "LKCMB", "lk_s", "chagos", "madagascar", "cape", "namibia", "atl_mid", "ny_app"],
}


def _pt(key):
    if key in C.PORTS:
        p = C.PORTS[key]
        return [p.lon, p.lat]
    lat, lon = W[key]
    return [lon, lat]


def route_coords(lane_id: str, cape: bool = False) -> list[list[float]]:
    lane = C.LANE_BY_ID[lane_id]
    mid = (CAPE_ROUTES if cape and lane_id in CAPE_ROUTES else ROUTES)[lane_id]
    return [_pt(lane.origin)] + [_pt(k) for k in mid] + [_pt(lane.dest)]
