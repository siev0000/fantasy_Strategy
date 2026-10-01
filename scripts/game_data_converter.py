#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""@game_data の XLSX エクスポートをゲーム用 JSON へ変換する。

既存 JSON はマージしない。現在のスプレッドシート列だけから毎回再生成する。
空セルは省略し、0 / False は保持する。数式は XLSX 内の計算済み値を使用する。

例:
  python scripts/game_data_converter.py --input path/to/game_data.xlsx --dry-run
  python scripts/game_data_converter.py --input path/to/game_data.xlsx
  python scripts/game_data_converter.py --input path/to/game_data.xlsx --sheet 種族 --sheet クラス
  python scripts/game_data_converter.py --input path/to/game_data.xlsx --list
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import tempfile
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any, Iterable
import xml.etree.ElementTree as ET

VERSION = "1.1.0"
MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DOC_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
DEFAULT_OUTPUT_DIR = Path("data/source/export/json")
DEFAULT_REPORT = Path("artifacts/game-data-converter-report.json")

# 通常変換するシートだけを明示する。CS / 画面は対象外。スキル一覧はCS専用変換器で生成する。
SHEET_TO_JSON = {
    "クラス": "クラス.json",
    "種族": "種族.json",
    "勢力": "勢力.json",
    "説明": "説明.json",
    "範囲": "範囲.json",
    "効果": "効果.json",
    "地形": "地形.json",
    "出現敵": "出現敵.json",
    "災害": "災害.json",
    "都市基本データ": "都市基本データ.json",
    "都市": "都市.json",
    "外交姿勢": "外交姿勢.json",
    "組織": "組織.json",
    "体制": "体制.json",
    "施設": "施設.json",
    "研究": "研究.json",
    "付与": "付与.json",
    "消費量": "消費量.json",
    "装備": "装備.json",
    "勝利対象土地": "勝利対象土地.json",
}

# すべてのキー項目が入っている行だけ重複検査する。
UNIQUE_KEYS = {
    "種族": ("key",),
    "クラス": ("名前",),
    "勢力": ("種族",),
    "説明": ("技能名",),
    "範囲": ("範囲タイプ",),
    "効果": ("追加効果",),
    "地形": ("地形",),
    "出現敵": ("ID",),
    "災害": ("ID",),
    "都市": ("項目名",),
    "外交姿勢": ("項目カテゴリ", "項目名"),
    "組織": ("項目名",),
    "体制": ("項目カテゴリ", "項目名"),
    "研究": ("ID",),
    "付与": ("付与能力", "Lv"),
    "消費量": ("Lv", "種別"),
    "装備": ("装備名",),
    "勝利対象土地": ("ID",),
}


@dataclass
class CellValue:
    value: Any = None
    formula: str | None = None
    has_cached_value: bool = True


@dataclass
class SheetResult:
    sheet: str
    output: str
    records: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[dict[str, Any]] = field(default_factory=list)
    errors: list[dict[str, Any]] = field(default_factory=list)
    input_rows: int = 0
    skipped_blank_rows: int = 0
    skipped_repeated_header_rows: int = 0


class XlsxReader:
    def __init__(self, path: Path):
        self._zip = zipfile.ZipFile(path)
        self.shared_strings = self._read_shared_strings()
        self.sheet_targets = self._read_sheet_targets()

    def close(self):
        self._zip.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()

    def _read_shared_strings(self):
        name = "xl/sharedStrings.xml"
        if name not in self._zip.namelist():
            return []
        root = ET.fromstring(self._zip.read(name))
        return [
            "".join((t.text or "") for t in si.iter(f"{{{MAIN_NS}}}t"))
            for si in root.findall(f"{{{MAIN_NS}}}si")
        ]

    def _read_sheet_targets(self):
        wb = ET.fromstring(self._zip.read("xl/workbook.xml"))
        rel_xml = ET.fromstring(self._zip.read("xl/_rels/workbook.xml.rels"))
        rels = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rel_xml}
        sheets = wb.find(f"{{{MAIN_NS}}}sheets")
        out = {}
        if sheets is None:
            return out
        for sheet in sheets:
            rid = sheet.attrib[f"{{{DOC_REL_NS}}}id"]
            target = rels[rid]
            path = str(PurePosixPath("xl") / target)
            while "/../" in path:
                path = re.sub(r"[^/]+/\.\./", "", path, count=1)
            out[sheet.attrib["name"]] = path.lstrip("/")
        return out

    @staticmethod
    def _column_index(cell_ref: str):
        m = re.match(r"([A-Z]+)", cell_ref)
        if not m:
            raise ValueError(f"不正なセル参照: {cell_ref}")
        n = 0
        for ch in m.group(1):
            n = n * 26 + ord(ch) - 64
        return n - 1

    @staticmethod
    def _parse_number(raw: str):
        value = float(raw)
        if not math.isfinite(value):
            raise ValueError(f"有限値ではありません: {raw}")
        return int(value) if value.is_integer() else value

    def _decode_cell(self, cell):
        typ = cell.attrib.get("t")
        formula_node = cell.find(f"{{{MAIN_NS}}}f")
        value_node = cell.find(f"{{{MAIN_NS}}}v")
        inline_node = cell.find(f"{{{MAIN_NS}}}is")
        formula = formula_node.text if formula_node is not None else None
        has_cached = value_node is not None or inline_node is not None

        if inline_node is not None:
            value = "".join((t.text or "") for t in inline_node.iter(f"{{{MAIN_NS}}}t"))
            return CellValue(value, formula, has_cached)

        raw = value_node.text if value_node is not None else None
        if raw is None:
            return CellValue(None, formula, has_cached)
        if typ == "s":
            try:
                value = self.shared_strings[int(raw)]
            except (ValueError, IndexError) as exc:
                raise ValueError(f"sharedStrings参照が不正です: {raw}") from exc
        elif typ == "b":
            value = raw == "1"
        elif typ in ("str", "inlineStr"):
            value = raw
        elif typ == "e":
            value = {"__xlsx_error__": raw}
        else:
            value = self._parse_number(raw)
        return CellValue(value, formula, has_cached)

    def sheet_rows(self, sheet_name: str) -> Iterable[tuple[int, dict[int, CellValue]]]:
        target = self.sheet_targets.get(sheet_name)
        if target is None:
            raise KeyError(f"シートがありません: {sheet_name}")
        root = ET.fromstring(self._zip.read(target))
        data = root.find(f".//{{{MAIN_NS}}}sheetData")
        if data is None:
            return
        for row in data.findall(f"{{{MAIN_NS}}}row"):
            row_no = int(row.attrib.get("r", "0") or 0)
            cells = {}
            for cell in row.findall(f"{{{MAIN_NS}}}c"):
                cells[self._column_index(cell.attrib.get("r", ""))] = self._decode_cell(cell)
            yield row_no, cells


def is_blank(value):
    return value is None or (isinstance(value, str) and not value.strip())


def normalize_value(value):
    if not isinstance(value, str):
        return value
    text = value.strip()
    if not text:
        return None
    if (text.startswith("[") and text.endswith("]")) or (
        text.startswith("{") and text.endswith("}")
    ):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, (list, dict)):
                return parsed
        except json.JSONDecodeError:
            pass
    return text


def header_text(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def is_repeated_header_row(pairs):
    nonempty = [(h, v) for h, v in pairs if not is_blank(v)]
    return len(nonempty) >= 2 and all(str(v).strip() == h for h, v in nonempty)


def convert_sheet(reader, sheet_name, output_name, allow_missing_formula_cache=False):
    result = SheetResult(sheet_name, output_name)
    rows = list(reader.sheet_rows(sheet_name))
    if not rows:
        result.errors.append({"type": "empty_sheet", "message": "シートにデータがありません"})
        return result

    header_row_no, header_cells = rows[0]
    headers = {
        col: h
        for col, cell in header_cells.items()
        if (h := header_text(cell.value)) is not None
    }
    if not headers:
        result.errors.append(
            {"type": "missing_header", "row": header_row_no, "message": "1行目にヘッダーがありません"}
        )
        return result

    dup_headers = {k: v for k, v in Counter(headers.values()).items() if v > 1}
    if dup_headers:
        result.warnings.append(
            {
                "type": "duplicate_headers",
                "headers": dup_headers,
                "message": "同名列は行ごとに衝突検査して1項目へ統合します",
            }
        )

    for row_no, cells in rows[1:]:
        result.input_rows += 1
        grouped = defaultdict(list)
        for col, h in headers.items():
            grouped[h].append((col, cells.get(col, CellValue())))

        record = {}
        pairs = []
        for h, entries in grouped.items():
            values = []
            for col, cell in entries:
                if cell.formula and not cell.has_cached_value:
                    issue = {
                        "type": "formula_without_cached_value",
                        "row": row_no,
                        "column": col + 1,
                        "header": h,
                        "formula": cell.formula,
                    }
                    (result.warnings if allow_missing_formula_cache else result.errors).append(issue)

                raw = cell.value
                if isinstance(raw, dict) and "__xlsx_error__" in raw:
                    result.errors.append(
                        {
                            "type": "xlsx_formula_error",
                            "row": row_no,
                            "column": col + 1,
                            "header": h,
                            "error": raw["__xlsx_error__"],
                        }
                    )
                    continue

                value = normalize_value(raw)
                if not is_blank(value):
                    values.append((col, value))

            if not values:
                pairs.append((h, None))
                continue

            unique = []
            for _, value in values:
                if value not in unique:
                    unique.append(value)
            if len(unique) > 1:
                result.errors.append(
                    {
                        "type": "duplicate_header_conflict",
                        "row": row_no,
                        "header": h,
                        "values": [{"column": c + 1, "value": v} for c, v in values],
                        "message": "同名ヘッダーの複数列に異なる値があります",
                    }
                )
                continue

            record[h] = unique[0]
            pairs.append((h, unique[0]))

        if not record:
            result.skipped_blank_rows += 1
            continue
        if is_repeated_header_row(pairs):
            result.skipped_repeated_header_rows += 1
            continue
        result.records.append(record)

    key_fields = UNIQUE_KEYS.get(sheet_name)
    if key_fields:
        seen = {}
        for index, record in enumerate(result.records, start=1):
            if not all(k in record and not is_blank(record[k]) for k in key_fields):
                continue
            key = tuple(record[k] for k in key_fields)
            if key in seen:
                result.errors.append(
                    {
                        "type": "duplicate_key",
                        "key_fields": list(key_fields),
                        "key": list(key),
                        "record_index": index,
                        "first_record_index": seen[key],
                    }
                )
            else:
                seen[key] = index

    return result


def atomic_write_json(path: Path, data, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    body = (
        json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        if compact
        else json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    )
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(body)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def parse_args():
    p = argparse.ArgumentParser(description="@game_data XLSX をゲーム用 JSON へ変換します")
    p.add_argument("--input", type=Path, required=True, help="@game_data の .xlsx エクスポート")
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    p.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    p.add_argument("--sheet", action="append", default=[], help="変換するシート。複数指定可")
    p.add_argument("--dry-run", action="store_true", help="検証だけ行い JSON を更新しない")
    p.add_argument(
        "--allow-missing-formula-cache",
        action="store_true",
        help="診断用途のみ: 計算済み値がない数式セルをエラーではなく警告にする",
    )
    p.add_argument("--compact", action="store_true", help="JSON を1行形式で出力")
    p.add_argument("--list", action="store_true", help="シートと変換対象を表示")
    p.add_argument("--version", action="version", version=VERSION)
    return p.parse_args()


def main():
    args = parse_args()
    if not args.input.exists():
        print(f"ERROR: 入力ファイルがありません: {args.input}", file=sys.stderr)
        return 2
    if args.input.suffix.lower() != ".xlsx":
        print("ERROR: 入力は .xlsx を指定してください", file=sys.stderr)
        return 2

    try:
        with XlsxReader(args.input) as reader:
            workbook_sheets = list(reader.sheet_targets)
            if args.list:
                for name in workbook_sheets:
                    mark = f"-> {SHEET_TO_JSON[name]}" if name in SHEET_TO_JSON else "(対象外)"
                    print(f"{name}: {mark}")
                return 0

            selected = args.sheet or list(SHEET_TO_JSON)
            unknown = [s for s in selected if s not in SHEET_TO_JSON]
            if unknown:
                raise ValueError(f"変換対象に定義されていないシート: {', '.join(unknown)}")
            missing = [s for s in selected if s not in reader.sheet_targets]
            if missing:
                raise ValueError(f"XLSXに存在しないシート: {', '.join(missing)}")

            results = [
                convert_sheet(reader, s, SHEET_TO_JSON[s], args.allow_missing_formula_cache)
                for s in selected
            ]

        report = {
            "version": VERSION,
            "input": str(args.input),
            "output_dir": str(args.output_dir),
            "dry_run": bool(args.dry_run),
            "allow_missing_formula_cache": bool(args.allow_missing_formula_cache),
            "converted_sheets": selected,
            "excluded_workbook_sheets": [s for s in workbook_sheets if s not in SHEET_TO_JSON],
            "summary": {
                "sheets": len(results),
                "records": sum(len(r.records) for r in results),
                "warnings": sum(len(r.warnings) for r in results),
                "errors": sum(len(r.errors) for r in results),
            },
            "sheets": [
                {
                    "sheet": r.sheet,
                    "output": r.output,
                    "input_rows": r.input_rows,
                    "records": len(r.records),
                    "skipped_blank_rows": r.skipped_blank_rows,
                    "skipped_repeated_header_rows": r.skipped_repeated_header_rows,
                    "warnings": r.warnings,
                    "errors": r.errors,
                }
                for r in results
            ],
        }

        args.report.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_json(args.report, report)

        if report["summary"]["errors"]:
            print(
                f"ERROR: 検証エラー {report['summary']['errors']}件。JSONは更新していません。",
                file=sys.stderr,
            )
            print(f"レポート: {args.report}", file=sys.stderr)
            return 2

        if not args.dry_run:
            for result in results:
                atomic_write_json(
                    args.output_dir / result.output,
                    result.records,
                    args.compact,
                )

        mode = "検証のみ" if args.dry_run else "生成完了"
        print(f"{mode}: {len(results)}シート / {report['summary']['records']}レコード")
        print(f"警告: {report['summary']['warnings']}件 / エラー: 0件")
        print(f"レポート: {args.report}")
        if not args.dry_run:
            print(f"出力先: {args.output_dir}")
        return 0

    except (OSError, zipfile.BadZipFile, ET.ParseError, ValueError, KeyError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
