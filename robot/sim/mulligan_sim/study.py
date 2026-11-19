"""The study behind RESULTS.md. Regenerate everything with:

    uv run python -m mulligan_sim.study          # full study (a few minutes on 10 cores)
    uv run python -m mulligan_sim.study --quick  # smaller samples, for a smoke test

Writes results/*.json, results/summary.md (the tables) and plots/*.png.
"""

import argparse
import json
import os
from multiprocessing import Pool
from pathlib import Path

import numpy as np

from . import params as P
from .metrics import lateral_metrics
from .runner import LABELS, simulate
from .scenarios import generate, standard_ten

ROOT = Path(__file__).resolve().parent.parent
PLOTS = ROOT / "plots"
RESULTS = ROOT / "results"

MAIN = ["odometry", "odo_gyro", "uwb1", "uwb2"]
ALL = MAIN + ["uwb2_wide"]
MC_SEED0 = 1000
DIST_BINS = np.arange(0.0, 71.0, 1.0)  # metres travelled

# Fixed categorical order (validated: dataviz palette slots 1-5), never cycled.
COLOURS = {
    "odometry": "#2a78d6",
    "odo_gyro": "#eb6834",
    "uwb1": "#1baf7a",
    "uwb2": "#eda100",
    "uwb2_wide": "#e87ba4",
}
STYLES = {"odometry": "-", "odo_gyro": "--", "uwb1": "-.", "uwb2": "-", "uwb2_wide": ":"}
INK, INK2, GRID, SURFACE = "#0b0b0b", "#52514e", "#e4e3df", "#fcfcfb"


# --- Accuracy: no lane limit, all estimators side by side -----------------------------

def _accuracy_run(seed: int) -> dict:
    sc = generate(seed)
    log = simulate(sc, ALL)
    travelled = np.concatenate([[0.0], np.cumsum(np.hypot(np.diff(log.x), np.diff(log.y)))])
    idx = np.searchsorted(travelled, DIST_BINS)
    valid = idx < len(travelled)
    out = {"seed": seed, "ground": sc.ground.name, "completed": log.completed, "est": {}}
    for name in ALL:
        m = lateral_metrics(log, name)
        err = np.abs(log.est[name][1] - log.y)
        growth = np.full(len(DIST_BINS), np.nan)
        growth[valid] = err[idx[valid]]
        out["est"][name] = {**m.__dict__, "growth": growth.tolist()}
    return out


def accuracy(n_mc: int, pool: Pool) -> dict:
    ten = []
    for sc in standard_ten():
        log = simulate(sc, ALL)
        ten.append({
            "seed": sc.seed, "ground": sc.ground.name, "completed": log.completed,
            "far_x": float(log.x[log.far_index()]),
            "est": {n: lateral_metrics(log, n).__dict__ for n in ALL},
        })
    mc = pool.map(_accuracy_run, range(MC_SEED0, MC_SEED0 + n_mc))
    return {"ten": ten, "mc": mc}


# --- Plots -------------------------------------------------------------------------

def _style_axes(ax) -> None:
    ax.set_facecolor(SURFACE)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(INK2)
    ax.tick_params(colors=INK2, labelsize=9)
    ax.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)


def _figure(w: float, h: float):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(w, h), dpi=150)
    fig.patch.set_facecolor(SURFACE)
    _style_axes(ax)
    return plt, fig, ax


def plot_far_error(acc: dict) -> None:
    plt, fig, ax = _figure(8, 3.6)
    names = ALL[::-1]
    for row, name in enumerate(names):
        mc = np.abs([r["est"][name]["far_error_m"] for r in acc["mc"]])
        ten = np.abs([r["est"][name]["far_error_m"] for r in acc["ten"]])
        p50, p95 = np.percentile(mc, [50, 95])
        ax.plot([np.percentile(mc, 5), p95], [row, row], color=COLOURS[name], linewidth=2, solid_capstyle="round")
        ax.plot([p50], [row], "o", color=COLOURS[name], markersize=8, markeredgecolor=SURFACE, markeredgewidth=2)
        ax.plot(ten, [row + 0.28] * len(ten), "|", color=INK2, markersize=7)
        ax.annotate(f"95%: {p95:.2f} m", (p95, row), xytext=(6, -3), textcoords="offset points",
                    fontsize=8.5, color=INK)
    ax.axvline(P.LANE_HALF_WIDTH_M, color=INK2, linewidth=1, linestyle=(0, (4, 3)))
    ax.text(P.LANE_HALF_WIDTH_M * 1.05, len(names) - 0.45, "half a lane, 1.5 m", fontsize=8, color=INK2)
    ax.set_xscale("log")
    ax.set_xlim(0.003, 40)
    ax.set_yticks(range(len(names)), [LABELS[n] for n in names], fontsize=9, color=INK)
    ax.set_ylim(-0.6, len(names) - 0.2)
    ax.set_xlabel("Sideways error at the furthest point out (m, log scale)", fontsize=9, color=INK)
    ax.set_title("Sideways error at 30 m\nBar: 5-95% of the Monte-Carlo runs, dot: median, ticks: the ten standard runs",
                 fontsize=9.5, color=INK, loc="left")
    fig.tight_layout()
    fig.savefig(PLOTS / "lateral_error_at_30m.png", facecolor=SURFACE)
    plt.close(fig)


def plot_error_growth(acc: dict) -> None:
    plt, fig, ax = _figure(8, 4.2)
    for name in ALL:
        g = np.array([r["est"][name]["growth"] for r in acc["mc"]], dtype=float)
        enough = np.sum(~np.isnan(g), axis=0) >= 0.8 * len(g)
        p95 = np.nanpercentile(np.where(np.isnan(g), np.nan, g), 95, axis=0)
        ax.plot(DIST_BINS[enough], np.maximum(p95[enough], 1e-3), STYLES[name], color=COLOURS[name],
                linewidth=2, label=LABELS[name])
    ax.axhline(P.LANE_HALF_WIDTH_M, color=INK2, linewidth=1, linestyle=(0, (4, 3)))
    ax.text(58, P.LANE_HALF_WIDTH_M * 1.12, "half a lane", fontsize=8, color=INK2, ha="right")
    ax.set_yscale("log")
    ax.set_ylim(0.01, 30)
    ax.set_xlabel("Distance driven since leaving the dock (m): out to 30 m, then home", fontsize=9, color=INK)
    ax.set_ylabel("95th percentile sideways error (m)", fontsize=9, color=INK)
    ax.set_title("How the sideways error grows over a run", fontsize=10, color=INK, loc="left")
    ax.legend(fontsize=8.5, frameon=False, loc="lower right", ncol=2)
    fig.tight_layout()
    fig.savefig(PLOTS / "error_growth.png", facecolor=SURFACE)
    plt.close(fig)


def plot_example_run(seed: int = 3) -> None:
    sc = standard_ten()[seed]
    log = simulate(sc, ALL)
    plt, fig, ax = _figure(9, 3.8)
    ax.axhspan(-P.LANE_HALF_WIDTH_M, P.LANE_HALF_WIDTH_M, color="#f0efec", zorder=0)
    ax.plot(log.x, log.y, color=INK, linewidth=2.2, label="Where it really went")
    for name in ALL:
        ex, ey, _ = log.est[name]
        ax.plot(ex, ey, STYLES[name], color=COLOURS[name], linewidth=1.6, label=LABELS[name])
    balls = [g for g in sc.goals if g.kind == "ball"]
    ax.plot([b.x for b in balls], [b.y for b in balls], "o", color=SURFACE, markeredgecolor=INK,
            markersize=8, label="Balls")
    ax.set_xlim(-1, 32)
    ax.set_ylim(-4, 4)
    ax.set_xlabel("Out from the dock (m)", fontsize=9, color=INK)
    ax.set_ylabel("Sideways (m)", fontsize=9, color=INK)
    ax.set_title(f"Standard run {seed} ({sc.ground.name} grass): what each estimator believes. "
                 "Shaded: the robot's own 3 m lane", fontsize=9.5, color=INK, loc="left")
    ax.legend(fontsize=7.5, frameon=False, ncol=3, loc="lower left")
    fig.tight_layout()
    fig.savefig(PLOTS / "example_run.png", facecolor=SURFACE)
    plt.close(fig)


# --- Tables ------------------------------------------------------------------------

def _pct(values, q) -> float:
    return float(np.percentile(np.abs(values), q))


def accuracy_tables(acc: dict) -> str:
    lines = ["### Ten standard runs: sideways error at the furthest point out (m)", ""]
    lines.append("| Run | Grass | " + " | ".join(LABELS[n] for n in ALL) + " |")
    lines.append("| --- | --- | " + " | ".join("---:" for _ in ALL) + " |")
    for r in acc["ten"]:
        lines.append(f"| {r['seed']} | {r['ground']} | " +
                     " | ".join(f"{r['est'][n]['far_error_m']:+.2f}" for n in ALL) + " |")
    lines.append("| **95th pct of the ten, abs** | | " +
                 " | ".join(f"**{_pct([r['est'][n]['far_error_m'] for r in acc['ten']], 95):.2f}**" for n in ALL) + " |")
    lines.append("")

    mc = acc["mc"]
    lines.append(f"### Monte Carlo, {len(mc)} runs (seeds {MC_SEED0}-{MC_SEED0 + len(mc) - 1}, half dry, half wet)")
    lines.append("")
    lines.append("| Estimator | At 30 m, median | At 30 m, 95th pct | At 30 m, 95th pct wet | Back at dock, 95th pct | Worst in run, 95th pct |")
    lines.append("| --- | ---: | ---: | ---: | ---: | ---: |")
    for n in ALL:
        far = [r["est"][n]["far_error_m"] for r in mc]
        wet = [r["est"][n]["far_error_m"] for r in mc if r["ground"] == "wet"]
        home = [r["est"][n]["home_error_m"] for r in mc]
        worst = [r["est"][n]["max_error_m"] for r in mc]
        lines.append(f"| {LABELS[n]} | {_pct(far, 50):.2f} | {_pct(far, 95):.2f} | {_pct(wet, 95):.2f} | "
                     f"{_pct(home, 95):.2f} | {_pct(worst, 95):.2f} |")
    lines.append("")

    lines.append("### Believing it's inside the lane while actually outside (no lane limit)")
    lines.append("")
    lines.append("*Time fooled*: of the time the robot's centre was truly outside its 3 m lane, the share during which "
                 "the estimator said it was inside. *Fooled by 25 cm+*: runs in which the robot got more than 0.25 m "
                 "outside while still believing it was inside, out of the runs that left the lane. *Depth, 95th pct*: "
                 "over the runs that left the lane, how far outside it got while believing it was inside. "
                 "*False alarms*: the share of time truly inside but believed outside.")
    lines.append("")
    lines.append("| Estimator | Ten runs: time fooled | Ten runs: fooled by 25 cm+ | Monte Carlo: time fooled | Monte Carlo: fooled by 25 cm+ | Monte Carlo: depth, 95th pct (m) | Monte Carlo: false alarms |")
    lines.append("| --- | ---: | ---: | ---: | ---: | ---: | ---: |")
    for n in ALL:
        def rates(rows):
            out = sum(r["est"][n]["outside_samples"] for r in rows)
            fooled = sum(r["est"][n]["fooled_samples"] for r in rows)
            left = [r for r in rows if r["est"][n]["outside_samples"] > 0]
            deep = sum(1 for r in left if r["est"][n]["fooled_depth_m"] > 0.25)
            depth95 = _pct([r["est"][n]["fooled_depth_m"] for r in left], 95) if left else float("nan")
            inside = sum(r["est"][n]["inside_samples"] for r in rows)
            alarms = sum(r["est"][n]["false_alarm_samples"] for r in rows)
            return fooled / out, deep, len(left), depth95, alarms / inside
        t_rate, t_deep, t_left, _, _ = rates(acc["ten"])
        m_rate, m_deep, m_left, m_depth, m_alarm = rates(mc)
        lines.append(f"| {LABELS[n]} | {100 * t_rate:.0f}% | {t_deep} of {t_left} | {100 * m_rate:.1f}% | "
                     f"{m_deep} of {m_left} | {m_depth:.2f} | {100 * m_alarm:.1f}% |")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="small samples for a smoke test")
    ap.add_argument("--skip-margins", action="store_true")
    args = ap.parse_args()
    PLOTS.mkdir(exist_ok=True)
    RESULTS.mkdir(exist_ok=True)
    n_mc = 40 if args.quick else 500

    with Pool(os.cpu_count()) as pool:
        acc = accuracy(n_mc, pool)
        (RESULTS / "accuracy.json").write_text(json.dumps(
            {"ten": acc["ten"], "mc": [{**r, "est": {n: {k: v for k, v in e.items() if k != "growth"}
                                                      for n, e in r["est"].items()}} for r in acc["mc"]]},
            indent=1))
        plot_far_error(acc)
        plot_error_growth(acc)
        plot_example_run()
        summary = ["# Simulation tables", "", "Generated by `uv run python -m mulligan_sim.study`. Do not edit by hand.", "",
                   accuracy_tables(acc)]
        if not args.skip_margins and "margins" in globals():
            summary.append(globals()["margins"](pool, args.quick))
    (RESULTS / "summary.md").write_text("\n".join(summary))
    print("\n".join(summary))


if __name__ == "__main__":
    main()
