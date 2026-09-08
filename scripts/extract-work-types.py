#!/usr/bin/env python3
"""
Хавсралт-2 (Ажлын төрөл, тоо хэмжээ) → lib/mock/work-types.json

Excel дэх 47 ажлын төрлийг уншиж, тус бүрийг ямар байршлын түвшинд хянахыг
онооно. Түвшин нь Excel-д байхгүй — энэ бол хүний шийдвэр, тиймээс доор
LEVELS хүснэгтэд гараар тодорхойлсон. Захиалагчтай тохирсны дараа энд засна.

  block — барилга бүхэлдээ нэг удаа (газар шороо, дээвэр, тохижилт)
  floor — давхар бүрт (угсралт, өрлөг, фасад, цахилгаан)
  unit  — айл бүрт (шал, замаска, цонх, хаалга)

Ажиллуулах:
    python3 scripts/extract-work-types.py "Хавсралт_2_Ажлын_төрөл,_тоо_хэмжээ.xlsx"
"""
import json
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl хэрэгтэй:  pip install openpyxl")

# Мөрийн дугаар (Excel-ийн № багана) → байршлын түвшин.
LEVELS = {
    1: "block", 2: "block", 3: "floor", 4: "block", 5: "block",
    6: "floor", 7: "floor", 8: "floor", 9: "unit", 10: "unit",
    11: "floor", 12: "floor", 13: "floor", 14: "floor", 15: "floor",
    16: "floor", 17: "unit", 18: "unit", 19: "floor", 20: "floor",
    21: "unit", 22: "unit", 23: "floor", 24: "unit", 25: "unit",
    26: "unit", 27: "unit", 28: "unit", 29: "unit", 30: "unit",
    31: "unit", 32: "unit", 33: "unit", 34: "floor", 35: "unit",
    36: "unit", 37: "unit", 38: "unit", 39: "block", 40: "floor",
    41: "block", 42: "block", 43: "unit", 44: "block", 45: "block",
    46: "block", 47: "block",
}

# Тоо хэмжээ бөглөгдөөгүй 30 ажлын төрөлд ашиглах ойролцоо утга.
# Зөвхөн mock-д зориулсан — жинхэнэ тоог захиалагчаас авна.
FALLBACK_QTY = {"block": 650.0, "floor": 648.0, "unit": 43.6}


def main() -> None:
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "Хавсралт-2.xlsx")
    if not src.exists():
        sys.exit(f"Файл олдсонгүй: {src}")

    ws = openpyxl.load_workbook(src, data_only=True)["Ажлын тоо хэмжээ нийт"]

    out, group = [], None
    for row in ws.iter_rows(min_row=4, values_only=True):
        if not isinstance(row[0], int):
            continue
        no = row[0]
        # Бүлгийн нэр зөвхөн эхний мөрд бичигдсэн тул сүүлийнхийг үргэлжлүүлнэ.
        group = (row[1] or group or "Бусад").strip()
        name = (row[3] or row[2] or "").strip()
        if not name:
            continue
        level = LEVELS.get(no, "floor")
        qty = next((c for c in row[7:] if isinstance(c, (int, float)) and c), None)

        out.append({
            "no": no,
            "group": group,
            "name": name,
            "unit": (row[6] or "м2").strip(),
            "level": level,
            "plannedQty": round(float(qty), 2) if qty else FALLBACK_QTY[level],
            "estimated": qty is None,
        })

    dest = Path("lib/mock/work-types.json")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    by_level = {lv: sum(1 for w in out if w["level"] == lv) for lv in ("block", "floor", "unit")}
    print(f"{dest} — {len(out)} ажлын төрөл")
    print(f"  block={by_level['block']}  floor={by_level['floor']}  unit={by_level['unit']}")
    print(f"  тоо хэмжээ таамагласан: {sum(1 for w in out if w['estimated'])}")


if __name__ == "__main__":
    main()
