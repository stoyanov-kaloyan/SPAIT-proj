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


def save_area_class_chart(class_counts, title, filename):
    labels = list(class_counts.keys())
    values = list(class_counts.values())
    fig, ax = plt.subplots(figsize=(9.2, 5.2))
    bars = ax.bar(labels, values, color=COLORS)
    ax.set_title(title, loc="left", fontsize=14, fontweight="bold", pad=12)
    ax.set_xlabel("Площен клас")
    ax.set_ylabel("Брой защитени територии")
    ax.tick_params(axis="x", rotation=20)
    ax.bar_label(bars, fmt="%.0f", padding=4)
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
    area_classes = {
        "до 10 ха": 0,
        "10–50 ха": 0,
        "50–100 ха": 0,
        "100–500 ха": 0,
        "500–1000 ха": 0,
        "1000–5000 ха": 0,
        "над 5000 ха": 0,
    }
    for area in areas:
        if area < 10:
            area_classes["до 10 ха"] += 1
        elif area < 50:
            area_classes["10–50 ха"] += 1
        elif area < 100:
            area_classes["50–100 ха"] += 1
        elif area < 500:
            area_classes["100–500 ха"] += 1
        elif area < 1000:
            area_classes["500–1000 ха"] += 1
        elif area < 5000:
            area_classes["1000–5000 ха"] += 1
        else:
            area_classes["над 5000 ха"] += 1
    save_area_class_chart(
        area_classes,
        "Защитени територии по площен клас",
        "area-classes.png",
    )

    protected_with_area = [
        (row["name_bg"], numeric(row["area_ha"]))
        for row in protected
        if numeric(row["area_ha"]) is not None
    ]
    top_areas = sorted(protected_with_area, key=lambda item: item[1], reverse=True)[:15]
    save_bar_chart(
        [name for name, _ in reversed(top_areas)],
        [area for _, area in reversed(top_areas)],
        "Най-големи защитени територии по площ",
        "top-areas.png",
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

    region_counts = Counter(row["regions"].split("\n")[0].strip()
                            for row in protected
                            if row["regions"].strip())
    top_regions = region_counts.most_common(15)
    save_bar_chart(
        [name for name, _ in reversed(top_regions)],
        [count for _, count in reversed(top_regions)],
        "Защитени територии по област",
        "regions-count.png",
    )

    authority_counts = Counter(row["authority"].strip()
                               for row in protected
                               if row["authority"].strip())
    top_authorities = authority_counts.most_common(15)
    save_bar_chart(
        [name for name, _ in reversed(top_authorities)],
        [count for _, count in reversed(top_authorities)],
        "Защитени територии по отговорен орган",
        "authorities-count.png",
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
            "area_classes": area_classes,
            "top_areas": [
                {"name": name, "area_ha": round(area, 4)}
                for name, area in top_areas
            ],
            "top_regions": dict(top_regions),
            "top_authorities": dict(top_authorities),
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
    }
    (OUTPUT / "statistics.json").write_text(
        json.dumps(statistics, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print("Generated Bulgarian-registry charts and charts/statistics.json")


if __name__ == "__main__":
    main()
