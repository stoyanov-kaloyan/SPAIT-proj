"""Convert the supplied polygon shapefile into a compact interactive SVG dataset."""

import json
import math
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SHP = ROOT / "zpo_all" / "zpo_all.shp"
DBF = ROOT / "zpo_all" / "zpo_all.dbf"
OUT = Path(__file__).resolve().parents[1] / "src" / "territory-map.json"


def read_dbf(path):
    raw = path.read_bytes()
    count = struct.unpack_from("<I", raw, 4)[0]
    header_len, record_len = struct.unpack_from("<HH", raw, 8)
    fields, pos = [], 32
    while raw[pos] != 13:
        name = raw[pos : pos + 11].split(b"\0", 1)[0].decode("ascii").strip()
        fields.append((name, raw[pos + 16]))
        pos += 32
    names, records = [], []
    for i in range(count):
        record = raw[header_len + i * record_len : header_len + (i + 1) * record_len]
        offset, values = 1, {}
        for name, length in fields:
            values[name] = record[offset : offset + length].decode("cp1251", errors="replace").strip()
            offset += length
        names.append(values)
    return names


def simplify(points, tolerance):
    if len(points) <= 4:
        return points
    # Rings are closed. Simplify the open chain, then close it again.
    chain = points[:-1] if points[0] == points[-1] else points
    keep = {0, len(chain) - 1}
    stack = [(0, len(chain) - 1)]
    tol2 = tolerance * tolerance
    while stack:
        start, end = stack.pop()
        ax, ay = chain[start]
        bx, by = chain[end]
        dx, dy = bx - ax, by - ay
        denom = dx * dx + dy * dy
        best_i, best_d2 = None, tol2
        for i in range(start + 1, end):
            px, py = chain[i]
            if denom:
                t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / denom))
                qx, qy = ax + t * dx, ay + t * dy
            else:
                qx, qy = ax, ay
            d2 = (px - qx) ** 2 + (py - qy) ** 2
            if d2 > best_d2:
                best_i, best_d2 = i, d2
        if best_i is not None:
            keep.add(best_i)
            stack.extend(((start, best_i), (best_i, end)))
    result = [chain[i] for i in sorted(keep)]
    if result[0] != result[-1]:
        result.append(result[0])
    return result if len(result) >= 4 else points


def fmt(value):
    return f"{value:.0f}"


def main():
    dbf = read_dbf(DBF)
    raw = SHP.read_bytes()
    minx, miny, maxx, maxy = struct.unpack_from("<4d", raw, 36)
    width, height, margin = 1000, 680, 20
    scale_x = (width - margin * 2) / (maxx - minx)
    scale_y = (height - margin * 2) / (maxy - miny)

    def project(point):
        x, y = point
        return (margin + (x - minx) * scale_x, margin + (maxy - y) * scale_y)

    records, pos = [], 100
    while pos + 8 <= len(raw):
        content_bytes = struct.unpack_from(">i", raw, pos + 4)[0] * 2
        shape = raw[pos + 8 : pos + 8 + content_bytes]
        pos += 8 + content_bytes
        if len(shape) < 44:
            records.append(None)
            continue
        shape_type = struct.unpack_from("<i", shape, 0)[0]
        if shape_type == 0:
            records.append(None)
            continue
        part_count, point_count = struct.unpack_from("<ii", shape, 36)
        part_start = 44
        parts = struct.unpack_from(f"<{part_count}i", shape, part_start)
        points_start = part_start + part_count * 4
        coords = [struct.unpack_from("<2d", shape, points_start + i * 16) for i in range(point_count)]
        path = []
        for j, start in enumerate(parts):
            end = parts[j + 1] if j + 1 < len(parts) else point_count
            ring = simplify(coords[start:end], 65)
            if len(ring) < 4:
                continue
            path.append("M" + "L".join(f"{fmt(x)} {fmt(y)}" for x, y in map(project, ring)) + "Z")
        records.append("".join(path))

    features = []
    for attributes, path in zip(dbf, records):
        if not path:
            continue
        code = attributes.get("CODE1", "")
        category = code.split("_")[1] if len(code.split("_")) == 3 else attributes.get("CATEGOR", "")
        features.append({
            "id": code,
            "name": attributes.get("NAME1", ""),
            "category": attributes.get("C_TYPE", ""),
            "status": attributes.get("STATE1", ""),
            "d": path,
        })
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"viewBox": [0, 0, width, height], "features": features}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(features)} map features to {OUT} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
