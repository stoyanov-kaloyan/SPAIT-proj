#!/usr/bin/env python3

import csv
import json
from collections import Counter
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm


ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "model"
OUTPUT = ROOT / "charts"
COLORS = ["#66896b", "#bd9b55", "#496f58", "#5b8882", "#7189a0", "#81779c"]


def read_csv(path):
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def configure_font():
    candidates = [
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for font_path in candidates:
        if Path(font_path).exists():
            fm.fontManager.addfont(font_path)
            plt.rcParams["font.family"] = fm.FontProperties(fname=font_path).get_name()
            break
    plt.rcParams["axes.unicode_minus"] = False
    plt.rcParams["figure.facecolor"] = "#f7f8f6"
    plt.rcParams["axes.facecolor"] = "#ffffff"


def save_bar_chart(labels, values, title, filename, horizontal=True):
    fig_height = max(4.2, 0.38 * len(labels) + 1.5)
    fig, ax = plt.subplots(figsize=(9.2, fig_height))
    bars = ax.barh(labels, values, color=COLORS[0]) if horizontal else ax.bar(labels, values, color=COLORS)
    if horizontal:
        ax.invert_yaxis()
        ax.bar_label(bars, fmt="%.0f", padding=4)
        ax.set_xlabel("Брой записи")
    else:
        ax.tick_params(axis="x", rotation=25)
        ax.bar_label(bars, fmt="%.0f", padding=4)
        ax.set_ylabel("Брой записи")
    ax.set_title(title, loc="left", fontsize=14, fontweight="bold", pad=12)
    ax.grid(axis="x" if horizontal else "y", alpha=0.18)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(OUTPUT / filename, dpi=160, bbox_inches="tight")
    plt.close(fig)


def save_histogram(values, title, filename, bins=30):
    fig, ax = plt.subplots(figsize=(9.2, 5.2))
    ax.hist(values, bins=bins, color=COLORS[0], edgecolor="#f7f8f6")
    ax.set_title(title, loc="left", fontsize=14, fontweight="bold", pad=12)
    ax.set_xlabel("Площ (хектара)")
    ax.set_ylabel("Брой защитени територии")
    ax.grid(axis="y", alpha=0.18)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(OUTPUT / filename, dpi=160, bbox_inches="tight")
    plt.close(fig)


def numeric(value):
    try:
        number = float(value)
        return number if number >= 0 else None
    except (TypeError, ValueError):
        return None


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    configure_font()

    protected = read_csv(MODEL / "protected-areas.csv")
    effaced = read_csv(MODEL / "effaced-protected-areas.csv")
    trees = read_csv(MODEL / "venerable-trees.csv")

    category_counts = Counter(row["category_name"] for row in protected)
    save_bar_chart(
        list(category_counts.keys()),
        list(category_counts.values()),
        "Брой защитени територии по категория",
        "categories-count.png",
    )

    status_counts = Counter(row["boundary_status"] or "Неуточнен" for row in protected)
    save_bar_chart(
        list(status_counts.keys()),
        list(status_counts.values()),
        "Статус на цифровите граници",
        "boundary-status.png",
    )

    areas = [area for row in protected if (area := numeric(row["area_ha"])) is not None]
    if areas:
        save_histogram(areas, "Разпределение на площите по локалния XLS източник", "area-distribution.png")

    natura_sci = read_csv(MODEL / "natura2000-sci.csv")
    natura_spa = read_csv(MODEL / "natura2000-spa.csv")
    save_bar_chart(
        ["SCI", "SPA"],
        [len(natura_sci), len(natura_spa)],
        "Брой записи на зони от Натура 2000",
        "natura2000-types.png",
        horizontal=False,
    )

    change_counts = Counter()
    for row in effaced:
        change = row["change_type"].strip()
        if change.startswith("Заличаване"):
            change_group = "Заличаване"
        elif change.startswith("Прекатегоризиране"):
            change_group = "Прекатегоризиране"
        elif change.startswith("В регистъра"):
            change_group = "Преместване в регистъра на вековните дървета"
        else:
            change_group = "Друга или неуточнена промяна"
        change_counts[change_group] += 1
    labels = [label for label, _ in change_counts.most_common(8)]
    values = [change_counts[label] for label in labels]
    save_bar_chart(labels, values, "Типове промени при заличени защитени територии", "effaced-change-types.png")

    tree_counts = Counter()
    for row in trees:
        species = row["tree_species"].strip()
        count = numeric(row["tree_count"])
        if species and species != "-" and count is not None:
            tree_counts[species] += count
    top_trees = tree_counts.most_common(12)
    save_bar_chart(
        [name for name, _ in reversed(top_trees)],
        [count for _, count in reversed(top_trees)],
        "Най-чести видове вековни дървета",
        "venerable-trees-top.png",
    )

    statistics = {
        "protected_areas": {
            "total": len(protected),
            "with_area": len(areas),
            "categories": dict(category_counts),
            "boundary_status": dict(status_counts),
            "area_ha": {
                "minimum": round(min(areas), 4) if areas else None,
                "maximum": round(max(areas), 4) if areas else None,
                "average": round(sum(areas) / len(areas), 4) if areas else None,
                "total": round(sum(areas), 4) if areas else None,
            },
        },
        "effaced_protected_areas": {
            "total": len(effaced),
            "change_types": dict(change_counts),
        },
        "venerable_trees": {
            "record_count": len(trees),
            "counted_trees": sum(tree_counts.values()),
            "top_species": dict(top_trees),
        },
        "natura2000": {
            "SCI": len(natura_sci),
            "SPA": len(natura_spa),
        },
    }
    (OUTPUT / "statistics.json").write_text(
        json.dumps(statistics, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print("Generated 6 charts and charts/statistics.json")


if __name__ == "__main__":
    main()
