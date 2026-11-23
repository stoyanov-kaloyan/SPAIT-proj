#!/usr/bin/env python3

import csv
import shutil
import zipfile
from datetime import datetime, timedelta
from pathlib import Path

import xlrd


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MODEL = ROOT / "model"
CATEGORIES = {
    "reserves.xls": (1, "Резерват"),
    "national-parks.xls": (2, "Национален парк"),
    "natural-monuments.xls": (3, "Природна забележителност"),
    "managed-nature-reserves.xls": (4, "Поддържан резерват"),
    "natural-parks.xls": (5, "Природен парк"),
    "protected-sites.xls": (6, "Защитена местност"),
}


def excel_date(value):
    if not value:
        return ""
    try:
        number = float(value)
        date = datetime(1899, 12, 30) + timedelta(days=number)
        return date.strftime("%Y-%m-%d")
    except (TypeError, ValueError, OverflowError):
        return str(value).strip()


def clean(value):
    return str(value).replace("\r", "").strip() if value not in (None, "") else ""


def read_sheet(path):
    book = xlrd.open_workbook(path)
    sheet = book.sheet_by_index(0)
    headers = [clean(sheet.cell_value(0, column)) for column in range(sheet.ncols)]
    return [dict(zip(headers, [clean(sheet.cell_value(row, column)) for column in range(sheet.ncols)]))
            for row in range(1, sheet.nrows)]


def first_present(mapping, names):
    for name in names:
        if name in mapping and clean(mapping[name]):
            return clean(mapping[name])
    return ""


def write_csv(path, fieldnames, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def extract_archives():
    for zip_name in ("zpo_all.zip", "N2000_Bulgaria_SCI_SPA_05_2025.zip"):
        with zipfile.ZipFile(DATA / zip_name) as archive:
            archive.extractall(DATA)


def read_dbf(path, encoding="cp1251"):
    raw = path.read_bytes()
    count = int.from_bytes(raw[4:8], "little")
    header_length = int.from_bytes(raw[8:10], "little")
    record_length = int.from_bytes(raw[10:12], "little")
    fields = []
    position = 32
    while raw[position] != 0x0D:
        name = raw[position:position + 11].split(b"\0", 1)[0].decode("ascii").strip()
        length = raw[position + 16]
        fields.append((name, length))
        position += 32

    rows = []
    for index in range(count):
        start = header_length + index * record_length
        if raw[start] == 0x2A:
            continue
        row = {}
        offset = 1
        for name, length in fields:
            row[name] = raw[start + offset:start + offset + length].decode(encoding, errors="replace").strip()
            offset += length
        rows.append(row)
    return fields, rows


def build_protected_areas():
    enriched = {}
    for filename, (category_code, category_name) in CATEGORIES.items():
        for source in read_sheet(DATA / filename):
            registry_number = first_present(source, (
                "Код на ЗТ - № в ДР", "Код на ЗТ", "Код на ЗТ  - № в ДР",
                "№ по ред", "Код на ЗТ - № в ДР",
            ))
            name = first_present(source, ("Наименование на ЗТ", "Наименование", "Име на ЗТ"))
            if not registry_number or not name:
                continue
            registry_number = clean(registry_number).split(".", 1)[0]
            enriched[(str(category_code), registry_number)] = {
                "area_ha": first_present(source, ("Площ (ха)", "Площ-ха")),
                "purpose": first_present(source, ("Цел на обявяване", "Цели на обявяване")),
                "designation_order": first_present(source, ("Заповед №РД",)),
                "designation_date": excel_date(first_present(source, ("Дата на обявяване",))),
                "state_gazette": first_present(source, ("ДВ",)),
                "regions": first_present(source, ("Област",)),
                "municipalities": first_present(source, ("Община",)),
                "settlements": first_present(source, ("Населено място",)),
                "authority": first_present(source, ("РИОСВ",)),
            }

    fields, dbf_rows = read_dbf(DATA / "zpo_all" / "zpo_all.dbf")
    rows = []
    for source in dbf_rows:
        code = source.get("CODE1", "")
        code_parts = code.split("_")
        category_code = code_parts[1] if len(code_parts) == 3 else source.get("CATEGOR", "")
        registry_number = clean(str(int(float(source["PR_AR"])))) if source.get("PR_AR") else ""
        details = enriched.get((str(category_code), registry_number), {})
        category_name = source.get("C_TYPE", "")
        rows.append({
            "source_code": code,
            "registry_number": registry_number,
            "name_bg": source.get("NAME1", ""),
            "category_code": category_code,
            "category_name": category_name,
            "area_ha": details.get("area_ha", ""),
            "purpose": details.get("purpose", ""),
            "designation_order": details.get("designation_order", ""),
            "designation_date": details.get("designation_date", ""),
            "state_gazette": details.get("state_gazette", ""),
            "regions": details.get("regions", ""),
            "municipalities": details.get("municipalities", ""),
            "settlements": details.get("settlements", ""),
            "authority": details.get("authority", ""),
            "boundary_status": source.get("STATE1", ""),
            "source_url": f"https://pdbase.eea.government.bg/zpo/bg/area.jsp?NEM_Partition=1&areaID={registry_number}&categoryID={category_code}",
        })

    rows.sort(key=lambda row: (int(row["category_code"]) if str(row["category_code"]).isdigit() else 999,
                               int(row["registry_number"]) if row["registry_number"].isdigit() else 999999))
    write_csv(MODEL / "protected-areas.csv", [
        "source_code", "registry_number", "name_bg", "category_code", "category_name", "area_ha",
        "purpose", "designation_order", "designation_date", "state_gazette",
        "regions", "municipalities", "settlements", "authority", "boundary_status", "source_url",
    ], rows)
    return len(rows)


def build_effaced():
    rows = []
    for filename in ("natural-monuments-effaced.xls", "protected-sites-effaced.xls"):
        category_code = 3 if "natural-monuments" in filename else 6
        category_name = "Природна забележителност" if category_code == 3 else "Защитена местност"
        for source in read_sheet(DATA / filename):
            rows.append({
                "registry_number": first_present(source, ("Код на ЗТ",)),
                "name_bg": first_present(source, ("Име на ЗТ",)),
                "category_code": category_code,
                "category_name": category_name,
                "change_type": first_present(source, ("Тип промяна",)),
                "document_number": first_present(source, ("Документ №",)),
                "document_date": excel_date(first_present(source, ("Дата на документа",))),
                "state_gazette": first_present(source, ("ДВ",)),
            })
    write_csv(MODEL / "effaced-protected-areas.csv", [
        "registry_number", "name_bg", "category_code", "category_name",
        "change_type", "document_number", "document_date", "state_gazette",
    ], rows)
    return len(rows)


def build_trees():
    rows = []
    for source in read_sheet(DATA / "venerable-trees.xls"):
        rows.append({
            "number": first_present(source, ("№",)),
            "tree_species": first_present(source, ("Дървесен вид",)),
            "tree_count": first_present(source, ("Брой дървета",)),
            "document_type": first_present(source, ("Вид на документа",)),
            "document_number": first_present(source, ("Номер на документа",)),
            "document_date": first_present(source, ("Дата",)),
            "state_gazette": first_present(source, ("ДВ",)),
            "settlement": first_present(source, ("Населено място",)),
            "municipality": first_present(source, ("Община",)),
            "region": first_present(source, ("Област",)),
            "authority": first_present(source, ("РИОСВ",)),
            "age_years": first_present(source, ("Възраст, години",)),
        })
    write_csv(MODEL / "venerable-trees.csv", [
        "number", "tree_species", "tree_count", "document_type", "document_number",
        "document_date", "state_gazette", "settlement", "municipality", "region",
        "authority", "age_years",
    ], rows)
    return len(rows)


def build_natura():
    total = 0
    for dbf_path in sorted((DATA / "N2000_Bulgaria_SCI_SPA_05_2025").glob("*.dbf")):
        fields, records = read_dbf(dbf_path, "utf-8")
        fieldnames = [field[0] for field in fields]
        zone_type = "SPA" if "_Ptici_" in dbf_path.name else "SCI"
        output = []
        for record in records:
            output.append({**record, "zone_type": zone_type})
        write_csv(MODEL / f"natura2000-{zone_type.lower()}.csv", fieldnames + ["zone_type"], output)
        total += len(output)
    return total


def build_dictionary():
    rows = [
        {"dataset": "protected-areas.csv", "field": "source_code", "type": "text", "description": "Съставен GIS идентификатор"},
        {"dataset": "protected-areas.csv", "field": "registry_number", "type": "integer", "description": "Пореден номер в Държавния регистър"},
        {"dataset": "protected-areas.csv", "field": "name_bg", "type": "text", "description": "Официално наименование"},
        {"dataset": "protected-areas.csv", "field": "category_code", "type": "integer", "description": "Категория от 1 до 6"},
        {"dataset": "protected-areas.csv", "field": "category_name", "type": "text", "description": "Наименование на категорията"},
        {"dataset": "protected-areas.csv", "field": "area_ha", "type": "decimal", "description": "Площ в хектари от данните на Държавния регистър"},
        {"dataset": "protected-areas.csv", "field": "purpose", "type": "text", "description": "Цел на обявяване"},
        {"dataset": "protected-areas.csv", "field": "boundary_status", "type": "text", "description": "Статус на цифровите граници"},
        {"dataset": "protected-areas.csv", "field": "source_url", "type": "url", "description": "Официална връзка към записа в ИАОС"},
        {"dataset": "territory-map.json", "field": "features[].d", "type": "SVG path", "description": "Опростена пространствена граница"},
        {"dataset": "natura2000-sci.csv", "field": "SITECODE", "type": "text", "description": "Код на SCI зона от Натура 2000"},
        {"dataset": "natura2000-spa.csv", "field": "SITECODE", "type": "text", "description": "Код на SPA зона от Натура 2000"},
    ]
    write_csv(MODEL / "data-dictionary.csv", ["dataset", "field", "type", "description"], rows)


def main():
    MODEL.mkdir(parents=True, exist_ok=True)
    extract_archives()
    protected_count = build_protected_areas()
    effaced_count = build_effaced()
    trees_count = build_trees()
    natura_count = build_natura()
    build_dictionary()
    print(
        f"Created offline model: {protected_count} protected areas, "
        f"{effaced_count} effaced areas, {trees_count} venerable-tree records, "
        f"{natura_count} Natura 2000 records."
    )


if __name__ == "__main__":
    main()
