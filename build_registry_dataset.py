#!/usr/bin/env python3
"""Build an open CSV model of Bulgaria's protected-territories register.

The script uses only Python's standard library.  It reads the DBF attributes of
the official shapefile and, unless --no-fetch is supplied, enriches every row
from the corresponding public EEA register page.  Raw HTML is cached so a run
can be resumed without downloading completed pages again.
"""

from __future__ import annotations

import argparse
import csv
import html
import re
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DBF = ROOT / "zpo_all" / "zpo_all.dbf"
OUT = ROOT / "protected_territories.csv"
CACHE = ROOT / "data" / "cache" / "registry_pages"
BASE_URL = (
    "https://pdbase.eea.government.bg/zpo/bg/area.jsp"
    "?NEM_Partition=1&areaID={number}&categoryID={category}"
)


def read_dbf(path: Path) -> list[dict[str, str]]:
    raw = path.read_bytes()
    count = int.from_bytes(raw[4:8], "little")
    header_len = int.from_bytes(raw[8:10], "little")
    record_len = int.from_bytes(raw[10:12], "little")
    fields: list[tuple[str, int, int]] = []
    pos, offset = 32, 1
    while raw[pos] != 0x0D:
        name = raw[pos : pos + 11].split(b"\0", 1)[0].decode("ascii").strip()
        length = raw[pos + 16]
        fields.append((name, offset, length))
        offset += length
        pos += 32

    rows: list[dict[str, str]] = []
    for i in range(count):
        start = header_len + i * record_len
        if raw[start] == 0x2A:  # deleted DBF record
            continue
        row = {}
        for name, offset, length in fields:
            row[name] = raw[start + offset : start + offset + length].decode(
                "cp1251", errors="replace"
            ).strip()
        rows.append(row)
    return rows


def html_to_text(document: str) -> str:
    document = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", document)
    document = re.sub(r"(?i)<br\s*/?>|</(?:p|div|li|tr|h[1-6])>", "\n", document)
    document = re.sub(r"(?s)<[^>]+>", " ", document)
    document = html.unescape(document).replace("\xa0", " ")
    lines = [re.sub(r"\s+", " ", line).strip() for line in document.splitlines()]
    return "\n".join(line for line in lines if line)


def section(text: str, start: str, ends: list[str]) -> str:
    match = re.search(re.escape(start), text, re.I)
    if not match:
        return ""
    tail = text[match.end() :]
    positions = []
    for end in ends:
        found = re.search(re.escape(end), tail, re.I)
        if found:
            positions.append(found.start())
    value = tail[: min(positions)] if positions else tail
    return re.sub(r"\s+", " ", value).strip(" :;-\n")


def parse_page(document: str) -> dict[str, str]:
    text = html_to_text(document)
    area = re.search(r"Площ:\s*([0-9]+(?:[.,][0-9]+)?)\s*хектара", text, re.I)
    designation = section(
        text,
        "Документи за обявяване:",
        ["Документи за промяна:", "План за управление", "Цели на обявяване:"],
    )
    order = re.search(
        r"(?:Заповед\s+No\.?|Заповед\s+№)\s*([^\s]+)\s+от\s+"
        r"(\d{2}\.\d{2}\.\d{4})\s*г?\.,?\s*бр\.\s*(\d+)\/(\d{4})",
        designation,
        re.I,
    )
    boundaries = [
        "Документи за промяна:",
        "План за управление",
        "Цели на обявяване:",
        "Предмет на опазване",
        "Режим на дейности:",
        "Припокриване",
    ]
    return {
        "area_ha": area.group(1).replace(",", ".") if area else "",
        "location": section(
            text,
            "Местоположение:",
            ["Попада на територията", "Документи за обявяване:"],
        ),
        "responsible_authority": section(
            text,
            "Попада на територията на следните Регионални инспекции по околната среда и водите (РИОСВ)/ Дирекции на Национални паркове:",
            ["Документи за обявяване:"],
        ),
        "designation_documents": designation,
        "designation_order_number": order.group(1) if order else "",
        "designation_order_date": order.group(2) if order else "",
        "state_gazette_issue": order.group(3) if order else "",
        "state_gazette_year": order.group(4) if order else "",
        "change_documents": section(
            text,
            "Документи за промяна:",
            ["План за управление", "Цели на обявяване:", "Предмет на опазване"],
        ),
        "designation_purpose": section(
            text,
            "Цели на обявяване:",
            ["Предмет на опазване", "Режим на дейности:", "Припокриване"],
        ),
        "protected_subject": section(
            text,
            "Предмет на опазване (видове и местообитания):",
            ["Режим на дейности:", "Припокриване"],
        ),
        "restrictions": section(
            text,
            "Режим на дейности:",
            ["Припокриване (частично или пълно):"],
        ),
        "overlaps": section(text, "Припокриване (частично или пълно):", []),
    }


def fetch(url: str, cache_file: Path, timeout: int) -> str:
    if cache_file.exists():
        return cache_file.read_text(encoding="utf-8")
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "SPAIT-university-register-model/1.0"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read()
        charset = response.headers.get_content_charset() or "utf-8"
    document = raw.decode(charset, errors="replace")
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(document, encoding="utf-8")
    return document


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-fetch", action="store_true", help="only convert DBF")
    parser.add_argument("--delay", type=float, default=0.20)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--limit", type=int, default=0, help="fetch only first N rows")
    parser.add_argument("--output", type=Path, default=OUT)
    args = parser.parse_args()

    output_rows = []
    failures = []
    for index, source in enumerate(read_dbf(DBF), 1):
        number = str(int(float(source["PR_AR"])))
        source_category = str(int(float(source["CATEGOR"])))
        code_parts = source["CODE1"].split("_")
        # CODE1 and C_TYPE agree in the source data; CATEGOR is wrong in three
        # records.  Preserve the raw category but use CODE1 for the public URL.
        category = code_parts[1] if len(code_parts) == 3 else source_category
        url = BASE_URL.format(number=number, category=category)
        row = {
            "source_code": source["CODE1"],
            "registry_number": number,
            "name_bg": source["NAME1"],
            "category_code": category,
            "source_category_code": source_category,
            "category_code_consistent": str(category == source_category).lower(),
            "category_name": source["C_TYPE"],
            "boundary_status": source["STATE1"],
            "partition_code": source["PARTIT"],
            "source_file": source["FILEMANE"],
            "metadata_id": source["METAFILE1"],
            "map_url": source["MAP_URL"],
            "source_url": url,
            "fetch_status": "not_requested" if args.no_fetch else "pending",
        }
        should_fetch = not args.no_fetch and (not args.limit or index <= args.limit)
        if should_fetch:
            try:
                document = fetch(url, CACHE / f"{category}_{number}.html", args.timeout)
                row.update(parse_page(document))
                row["fetch_status"] = "ok"
                time.sleep(args.delay)
            except Exception as exc:  # retain base record and make failure auditable
                row["fetch_status"] = f"error: {type(exc).__name__}: {exc}"
                failures.append((category, number, str(exc)))
        elif not args.no_fetch:
            row["fetch_status"] = "not_fetched_limit"
        output_rows.append(row)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8-sig", newline="") as handle:
        fieldnames = list(dict.fromkeys(key for row in output_rows for key in row))
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(output_rows)
    print(f"Wrote {len(output_rows)} records to {args.output}")
    if failures:
        print(f"Fetch failures: {len(failures)} (safe to rerun; successful pages are cached)")


if __name__ == "__main__":
    main()
