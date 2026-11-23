from fractions import Fraction
from itertools import groupby

from src.constants.domain import ALGORITHM_VERSION, MIN_SAMPLES, Outcome


class InsufficientSamples(ValueError):
    pass


def percent(value):
    return float(value * 100)


def analyze(samples, parameters):
    """Compute the empirical distribution with unit dry grams as the weights."""
    if len(samples) < MIN_SAMPLES:
        raise InsufficientSamples(f"有效干样至少需要 {MIN_SAMPLES} 份，本次仅锁定 {len(samples)} 份。")

    threshold = Fraction(parameters["threshold_pct"]) / 100
    tail_share = Fraction(parameters["tail_pct"]) / 100
    exceed_cap = Fraction(parameters["exceed_cap_pct"]) / 100
    tail_cap = Fraction(parameters["tail_cap_pct"]) / 100
    total_g = sum(sample["dry_g"] for sample in samples)
    impurity_g = sum(sample["impurity_g"] for sample in samples)
    pairs = sorted(
        (Fraction(sample["impurity_g"], sample["dry_g"]), sample["code"], sample["dry_g"])
        for sample in samples
    )
    exceed_g = sum(dry_g for ratio, _, dry_g in pairs if ratio > threshold)
    cumulative_g = 0
    ecdf = []
    for ratio, group in groupby(pairs, key=lambda item: item[0]):
        entries = list(group)
        dry_g = sum(weight for _, _, weight in entries)
        cumulative_g += dry_g
        ecdf.append({
            "concentration_pct": percent(ratio), "group_g": dry_g,
            "cumulative_g": cumulative_g, "cumulative_pct": percent(Fraction(cumulative_g, total_g)),
            "sample_codes": [code for _, code, _ in entries],
        })

    tail_g = total_g * tail_share
    remaining_g = tail_g
    integrated = Fraction(0)
    contributions = []
    for ratio, code, dry_g in sorted(pairs, key=lambda item: (-item[0], item[1])):
        used_g = min(remaining_g, dry_g)
        integrated += used_g * ratio
        remaining_g -= used_g
        contributions.append({
            "code": code, "concentration_pct": percent(ratio), "dry_g": dry_g,
            "used_g": float(used_g), "impurity_equivalent_g": float(used_g * ratio),
        })
        if remaining_g == 0:
            break

    exceed_share = Fraction(exceed_g, total_g)
    tail_mean = integrated / tail_g
    triggers = []
    if exceed_share > exceed_cap:
        triggers.append("exceed_share")
    if tail_mean > tail_cap:
        triggers.append("tail_mean")

    return {
        "algorithm": ALGORITHM_VERSION,
        "sample_count": len(samples), "total_dry_g": total_g, "impurity_g": impurity_g,
        "weighted_mean_pct": percent(Fraction(impurity_g, total_g)),
        "exceed_g": exceed_g, "exceed_share_pct": percent(exceed_share),
        "tail_g": float(tail_g), "tail_mean_pct": percent(tail_mean),
        "ecdf": ecdf, "tail_contributions": contributions, "triggers": triggers,
        "recommendation": Outcome.REJECT if triggers else Outcome.ACCEPT,
    }
