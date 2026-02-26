import argparse
import json
import re
import zipfile
from datetime import datetime, timedelta
from pathlib import PurePosixPath
from xml.etree import ElementTree as ET


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"main": MAIN_NS}


def _text_from_si(node):
    texts = []
    for t in node.findall(".//main:t", NS):
        texts.append(t.text or "")
    return "".join(texts)


def _is_builtin_date_numfmt(numfmt_id):
    return numfmt_id in {14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47}


def _looks_like_date_format(code):
    lowered = code.lower()
    return bool(re.search(r"(y|m|d|h|s)", lowered))


def _excel_serial_to_iso(value):
    serial = float(value)
    base = datetime(1899, 12, 30)
    dt = base + timedelta(days=serial)
    if dt.time() == datetime.min.time():
        return dt.strftime("%Y-%m-%d")
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def _load_shared_strings(zf):
    path = "xl/sharedStrings.xml"
    if path not in zf.namelist():
        return []
    root = ET.fromstring(zf.read(path))
    strings = []
    for si in root.findall("main:si", NS):
        strings.append(_text_from_si(si))
    return strings


def _load_date_styles(zf):
    path = "xl/styles.xml"
    if path not in zf.namelist():
        return set()

    root = ET.fromstring(zf.read(path))
    custom_numfmts = {}
    num_fmts = root.find("main:numFmts", NS)
    if num_fmts is not None:
        for n in num_fmts.findall("main:numFmt", NS):
            numfmt_id = int(n.attrib.get("numFmtId", "0"))
            custom_numfmts[numfmt_id] = n.attrib.get("formatCode", "")

    date_style_indexes = set()
    cell_xfs = root.find("main:cellXfs", NS)
    if cell_xfs is None:
        return date_style_indexes

    for idx, xf in enumerate(cell_xfs.findall("main:xf", NS)):
        numfmt_id = int(xf.attrib.get("numFmtId", "0"))
        if _is_builtin_date_numfmt(numfmt_id):
            date_style_indexes.add(idx)
            continue
        if numfmt_id in custom_numfmts and _looks_like_date_format(custom_numfmts[numfmt_id]):
            date_style_indexes.add(idx)
    return date_style_indexes


def _sheet_targets(zf):
    wb = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))

    rel_map = {}
    for rel in rels.findall(f"{{{PKG_REL_NS}}}Relationship"):
        rel_map[rel.attrib["Id"]] = rel.attrib.get("Target", "")

    sheets = []
    for sheet in wb.findall("main:sheets/main:sheet", NS):
        name = sheet.attrib.get("name", "")
        rid = sheet.attrib.get(f"{{{REL_NS}}}id", "")
        target = rel_map.get(rid, "")
        if not target:
            continue
        normalized = str(PurePosixPath("xl") / PurePosixPath(target))
        normalized = normalized.replace("xl/../", "")
        sheets.append((name, normalized))
    return sheets


def _cell_value(cell, shared_strings, date_style_indexes):
    cell_type = cell.attrib.get("t")
    style_idx = int(cell.attrib.get("s", "0"))

    if cell_type == "inlineStr":
        inline = cell.find("main:is", NS)
        if inline is None:
            return ""
        return _text_from_si(inline)

    v = cell.find("main:v", NS)
    if v is None or v.text is None:
        return ""

    raw = v.text
    if cell_type == "s":
        try:
            return shared_strings[int(raw)]
        except (ValueError, IndexError):
            return ""

    if style_idx in date_style_indexes:
        try:
            return _excel_serial_to_iso(raw)
        except Exception:
            return raw

    return raw


def workbook_to_dict(path):
    with zipfile.ZipFile(path) as zf:
        shared_strings = _load_shared_strings(zf)
        date_style_indexes = _load_date_styles(zf)
        sheets = {}

        for name, target in _sheet_targets(zf):
            if target not in zf.namelist():
                continue

            root = ET.fromstring(zf.read(target))
            rows = root.findall("main:sheetData/main:row", NS)
            if not rows:
                sheets[name] = []
                continue

            header_row = rows[0]
            headers = [_cell_value(c, shared_strings, date_style_indexes).strip() for c in header_row.findall("main:c", NS)]
            normalized_headers = [h for h in headers if h]
            data_rows = []

            for row in rows[1:]:
                values = [_cell_value(c, shared_strings, date_style_indexes).strip() for c in row.findall("main:c", NS)]
                if not any(values):
                    continue
                row_obj = {}
                for idx, header in enumerate(normalized_headers):
                    row_obj[header] = values[idx] if idx < len(values) else ""
                data_rows.append(row_obj)

            sheets[name] = data_rows

        return sheets


def main():
    parser = argparse.ArgumentParser(description="Convert xlsx workbook to json by sheets")
    parser.add_argument("--input", required=True, help="Input .xlsx file")
    parser.add_argument("--output", required=True, help="Output .json file")
    args = parser.parse_args()

    result = {
        "source": args.input,
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "sheets": workbook_to_dict(args.input),
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"Written {args.output}")
    for key, rows in result["sheets"].items():
        print(f"- {key}: {len(rows)} rows")


if __name__ == "__main__":
    main()
