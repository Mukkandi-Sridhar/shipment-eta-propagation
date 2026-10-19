"""Static world definition for the shipment simulator.

Numbers are rough but grounded in public figures (Drewry / Sea-Intelligence
schedule-reliability reports, typical port dwell times, published transit
times). They are assumptions, not measurements; see docs/REPORT for the list.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Port:
    code: str
    name: str
    lat: float
    lon: float
    base_util: float      # mean berth/yard utilisation (0-1), drives queueing
    util_vol: float       # day-to-day volatility of utilisation
    customs_speed: float  # multiplier on clearance time (1 = average)


PORTS = {
    "CNSHA": Port("CNSHA", "Shanghai", 31.23, 121.47, 0.78, 0.05, 1.0),
    "CNYTN": Port("CNYTN", "Yantian", 22.57, 114.27, 0.74, 0.05, 1.0),
    "SGSIN": Port("SGSIN", "Singapore", 1.26, 103.84, 0.80, 0.04, 0.8),
    "KRPUS": Port("KRPUS", "Busan", 35.10, 129.04, 0.70, 0.04, 0.9),
    "INNSA": Port("INNSA", "Nhava Sheva", 18.95, 72.95, 0.76, 0.06, 1.3),
    "INMAA": Port("INMAA", "Chennai", 13.10, 80.30, 0.72, 0.06, 1.3),
    "VNSGN": Port("VNSGN", "Ho Chi Minh", 10.77, 106.70, 0.70, 0.05, 1.1),
    "LKCMB": Port("LKCMB", "Colombo", 6.95, 79.85, 0.79, 0.06, 1.0),
    "NLRTM": Port("NLRTM", "Rotterdam", 51.95, 4.14, 0.80, 0.05, 0.9),
    "DEHAM": Port("DEHAM", "Hamburg", 53.54, 9.97, 0.82, 0.06, 0.9),
    "USLAX": Port("USLAX", "Los Angeles", 33.74, -118.27, 0.83, 0.07, 1.0),
    "USNYC": Port("USNYC", "New York", 40.67, -74.04, 0.79, 0.05, 1.0),
    "AEJEA": Port("AEJEA", "Jebel Ali", 25.01, 55.06, 0.68, 0.04, 0.8),
}


@dataclass(frozen=True)
class Lane:
    lane_id: str
    origin: str
    dest: str
    hub: str | None           # transshipment hub, None for direct service
    transit_days: float       # scheduled port-to-port sea time (excl. hub dwell)
    sea_region: str           # weather region the voyage mostly crosses
    via_red_sea: bool         # exposed to Suez / Red Sea diversions
    inland_city: str
    inland_mode: str          # "truck" or "rail"
    inland_hours: float       # scheduled inland transit
    weight: float             # share of bookings


LANES = [
    Lane("SHA-RTM", "CNSHA", "NLRTM", None, 30, "indian_ocean", True, "Duisburg", "truck", 6, 1.3),
    Lane("YTN-LAX", "CNYTN", "USLAX", None, 16, "north_pacific", False, "Chicago", "rail", 96, 1.3),
    Lane("PUS-LAX", "KRPUS", "USLAX", None, 12, "north_pacific", False, "Phoenix", "truck", 10, 0.8),
    Lane("NSA-HAM", "INNSA", "DEHAM", None, 22, "arabian_sea", True, "Munich", "rail", 30, 1.0),
    Lane("MAA-RTM", "INMAA", "NLRTM", "LKCMB", 23, "arabian_sea", True, "Antwerp", "truck", 3, 0.9),
    Lane("SGN-RTM", "VNSGN", "NLRTM", "SGSIN", 27, "indian_ocean", True, "Duisburg", "truck", 6, 0.9),
    Lane("SIN-NYC", "SGSIN", "USNYC", None, 32, "indian_ocean", True, "Newark", "truck", 2, 0.8),
    Lane("NSA-JEA", "INNSA", "AEJEA", None, 5, "arabian_sea", False, "Dubai", "truck", 2, 1.0),
    Lane("NSA-NYC", "INNSA", "USNYC", "LKCMB", 28, "arabian_sea", True, "Philadelphia", "truck", 3, 0.7),
]
LANE_BY_ID = {lane.lane_id: lane for lane in LANES}

# Carrier schedule reliability: probability-ish factor, lower = more delays.
CARRIERS = {
    "Maersk": 0.62,
    "MSC": 0.52,
    "CMA CGM": 0.55,
    "COSCO": 0.50,
    "ONE": 0.58,
}

# Commodity -> (base clearance hours, inspection risk logit, hazmat)
COMMODITIES = {
    "electronics": (20, -0.6, False),
    "textiles": (24, -0.2, False),
    "machinery": (26, -0.4, False),
    "pharma": (36, 0.4, False),
    "food": (40, 0.8, False),
    "chemicals": (34, 0.6, True),
}

# Sailings per week out of a transshipment hub on the connecting service.
HUB_CONNECTION_INTERVAL_H = {"LKCMB": 84, "SGSIN": 56}
SCHEDULED_HUB_DWELL_H = 30

# Scheduled durations for port-side stages (what the booking promises).
SCHED_BERTH_WAIT_H = 20
SCHED_DISCHARGE_H = 30
SCHED_CUSTOMS_H = 54
SCHED_APPT_BUFFER_H = 24   # truck/rail appointment booked this long after planned release

# Rail ramps depart on fixed weekdays (Mon=0); trucks run any day.
RAIL_DEPARTURE_WEEKDAYS = (1, 4)

# External disruption windows (simulation year 2025).
RED_SEA_WINDOW = ("2025-03-01", "2025-05-31")   # carriers divert around the Cape
STRIKE_WINDOWS = {"DEHAM": ("2025-07-07", "2025-07-13"), "USNYC": ("2025-10-01", "2025-10-04")}
HOLIDAYS = ["2025-01-01", "2025-04-18", "2025-04-21", "2025-05-26", "2025-07-04",
            "2025-09-01", "2025-11-27", "2025-12-25", "2025-12-26"]

LATE_THRESHOLD_H = 24  # a shipment is "late" if delivered >24h after promised
