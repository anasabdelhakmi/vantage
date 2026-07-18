"""
RESTOCK TOOL  --  "the supply manager"

Job: decide how much of each medicine the clinic should reorder. The twist
(and the whole point of the project) is that it does NOT just look at past
usage -- it multiplies baseline demand by a forward-looking outbreak forecast
from Oxylabs. So it orders AHEAD of an outbreak, not after the clinic runs out.

The agent (Kimi) calls run_restock(...) as a tool.
"""

import os
import sys
from dataclasses import dataclass
from typing import Dict, List

# Allow running this file directly (python tools/restock.py) by putting the
# project root on the path. Not needed when running via main.py.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from signals.oxylabs import forecast_multipliers


# Baseline monthly usage per medicine (units), and which disease drives it.
# In a real deployment this comes from the clinic's own history.
BASELINE_USAGE: Dict[str, Dict] = {
    "paracetamol":       {"monthly": 200, "driver": "dengue"},
    "rehydration_salts": {"monthly": 150, "driver": "gastro"},
    "antimalarials":     {"monthly": 40,  "driver": "malaria"},
    "cough_syrup":       {"monthly": 80,  "driver": "flu"},
}


@dataclass
class RestockLine:
    medicine: str
    baseline: int
    multiplier: float
    recommended_order: int
    reason: str


def run_restock(current_stock: Dict[str, int] = None, region: str = "all") -> List[RestockLine]:
    """
    Main entry point the agent calls.

    current_stock: optional dict like {"paracetamol": 50}. If given, the
                   recommendation subtracts what's already on the shelf.
    region:        which region's outbreak signals to use.

    Returns a list of RestockLine (one per medicine).
    """
    current_stock = current_stock or {}
    multipliers = forecast_multipliers(region)

    lines: List[RestockLine] = []
    for med, info in BASELINE_USAGE.items():
        baseline = info["monthly"]
        driver = info["driver"]
        mult = multipliers.get(driver, 1.0)

        forecast_demand = round(baseline * mult)
        on_hand = current_stock.get(med, 0)
        order = max(0, forecast_demand - on_hand)

        if mult > 1.0:
            reason = (f"{driver} trending up (x{mult}) — ordering ahead of demand")
        elif mult < 1.0:
            reason = (f"{driver} easing (x{mult}) — ordering less to avoid waste")
        else:
            reason = f"{driver} steady — normal reorder"

        lines.append(RestockLine(
            medicine=med,
            baseline=baseline,
            multiplier=mult,
            recommended_order=order,
            reason=reason,
        ))
    return lines


if __name__ == "__main__":
    for line in run_restock({"paracetamol": 30}):
        print(f"{line.medicine:18} order {line.recommended_order:4}  ({line.reason})")
