#!/usr/bin/env python3

import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SHP = DATA / "zpo_all" / "zpo_all.shp"
DBF = DATA / "zpo_all" / "zpo_all.dbf"
OUT = ROOT / "model" / "territory-map.json"


def read_dbf(path):
    raw = path.read_bytes()
    count = int.from_bytes(raw[4:8], "little")
    header_length, record_length = struct.unpack_from("<HH", raw, 8)
    fields = []
    position = 32
    while raw[position] != 0x0D:
        name = raw[position:position + 11].split(b"\0", 1)[0].decode("ascii").strip()
        fields.append((name, raw[position + 16]))
        position += 32
    records = []
    for index in range(count):
        record = raw[header_length + index * record_length:header_length + (index + 1) * record_length]
        offset = 1
        values = {}
        for name, length in fields:
            values[name] = record[offset:offset + length].decode("cp1251", errors="replace").strip()
            offset += length
        records.append(values)
    return records


def simplify(points, tolerance):
    if len(points) <= 4:
        return points
    chain = points[:-1] if points[0] == points[-1] else points
    keep = {0, len(chain) - 1}
    stack = [(0, len(chain) - 1)]
    tolerance_squared = tolerance * tolerance
    while stack:
        start, end = stack.pop()
        ax, ay = chain[start]
        bx, by = chain[end]
        dx, dy = bx - ax, by - ay
        denominator = dx * dx + dy * dy
        best_index = None
        best_distance = tolerance_squared
        for index in range(start + 1, end):
            px, py = chain[index]
            if denominator:
                t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / denominator))
                qx, qy = ax + t * dx, ay + t * dy
            else:
                qx, qy = ax, ay
            distance = (px - qx) ** 2 + (py - qy) ** 2
            if distance > best_distance:
                best_index, best_distance = index, distance
        if best_index is not None:
            keep.add(best_index)
            stack.extend(((start, best_index), (best_index, end)))
    result = [chain[index] for index in sorted(keep)]
    if result and result[0] != result[-1]:
        result.append(result[0])
    return result if len(result) >= 4 else points


def main():
    attributes = read_dbf(DBF)
    raw = SHP.read_bytes()
    min_x, min_y, max_x, max_y = struct.unpack_from("<4d", raw, 36)
    width, height, margin = 1000, 680, 20
    scale_x = (width - 2 * margin) / (max_x - min_x)
    scale_y = (height - 2 * margin) / (max_y - min_y)

    def project(point):
        x, y = point
        return margin + (x - min_x) * scale_x, margin + (max_y - y) * scale_y

    paths = []
    position = 100
    while position + 8 <= len(raw):
        content_bytes = struct.unpack_from(">i", raw, position + 4)[0] * 2
        shape = raw[position + 8:position + 8 + content_bytes]
        position += 8 + content_bytes
        if len(shape) < 44:
            paths.append(None)
            continue
        shape_type = struct.unpack_from("<i", shape, 0)[0]
        if shape_type == 0:
            paths.append(None)
            continue
        part_count, point_count = struct.unpack_from("<ii", shape, 36)
        parts = struct.unpack_from(f"<{part_count}i", shape, 44)
        points_start = 44 + part_count * 4
        coordinates = [struct.unpack_from("<2d", shape, points_start + index * 16)
                       for index in range(point_count)]
        path_parts = []
        for part_index, start in enumerate(parts):
            end = parts[part_index + 1] if part_index + 1 < len(parts) else point_count
            ring = simplify(coordinates[start:end], 65)
            if len(ring) < 4:
                continue
            projected = [project(point) for point in ring]
            path_parts.append("M" + "L".join(
                f"{x:.0f} {y:.0f}" for x, y in projected
            ) + "Z")
        paths.append("".join(path_parts) or None)

    features = []
    for record, path in zip(attributes, paths):
        if not path:
            continue
        code = record.get("CODE1", "")
        code_parts = code.split("_")
        category = code_parts[1] if len(code_parts) == 3 else record.get("CATEGOR", "")
        features.append({
            "id": code,
            "name": record.get("NAME1", ""),
            "category": record.get("C_TYPE", ""),
            "status": record.get("STATE1", ""),
            "d": path,
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "viewBox": [0, 0, width, height],
        "features": features,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(features)} map features to {OUT}")


if __name__ == "__main__":
    main()
