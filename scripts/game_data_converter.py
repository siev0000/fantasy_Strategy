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
    "召喚モンスターリスト": "召喚モンスターリスト.json",
    "モンスター合成": "モンスター合成.json",
    "道具": "道具.json",
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
    "特産品": "特産品.json",
    "性格会話": "性格会話.json",
}

# Logical tables keep their runtime names even when the editing tabs are combined.
# Column bounds are zero-based and end-exclusive; each table starts on row 1.
MERGED_SHEET_TABLES = {
    "効果": ("用語辞書", 0, 2),
    "説明": ("用語辞書", 3, 5),
    "範囲": ("用語辞書", 6, 9),
    "体制": ("国家設定", 0, 25),
    "外交姿勢": ("国家設定", 26, 35),
    "組織": ("国家設定", 36, 40),
}

RACE_TABLE_COLUMNS = {
    "key":"種族", "name":"種族", "className":"能力クラス", "icon":"画像", "summary":"概要",
    "detail":"詳細", "traits":"特徴", "使用可":"使用可", "旧名称":"旧名称", "設定メモ":"設定メモ",
    "推奨クラス":"推奨クラス", "推奨都市特化":"推奨都市特化",
    **{key:key for key in ("マーカー文字", "マーカー色", "初期人数", "高さ", "ヒーロー", "軍隊", "土地")},
}
FACTION_TABLE_COLUMNS = {
    "種族":"種族", "カナ":"能力クラス", "使用可":"使用可", "旧名称":"旧名称",
    "推奨クラス":"推奨クラス", "推奨都市特化":"推奨都市特化",
    **{key:key for key in ("マーカー文字", "マーカー色", "初期人数", "高さ", "ヒーロー", "軍隊", "土地")},
}


def has_unified_race_table(reader):
    if "種族" not in getattr(reader, "sheet_targets", {}):
        return False
    first = next(iter(reader.sheet_rows("種族")), (0, {}))[1]
    return {"種族", "能力クラス", "使用可"}.issubset({cell.value for cell in first.values() if isinstance(cell.value, str)})


def projected_race_rows(reader, table_name):
    rows = iter(reader.sheet_rows("種族"))
    number, header = next(rows)
    source_columns = {str(cell.value).strip():col for col,cell in header.items() if isinstance(cell.value,str)}
    fields = RACE_TABLE_COLUMNS if table_name == "種族" else FACTION_TABLE_COLUMNS
    yield number, {i:CellValue(value=field) for i,field in enumerate(fields)}
    for number, cells in rows:
        yield number, {i:cells.get(source_columns.get(source),CellValue()) for i,source in enumerate(fields.values())}


def validate_unified_race_table(reader):
    if not has_unified_race_table(reader):
        return
    rows = iter(reader.sheet_rows("種族"))
    _, header = next(rows)
    columns = {str(cell.value).strip():col for col,cell in header.items() if isinstance(cell.value,str)}
    required = set(RACE_TABLE_COLUMNS.values()) - {"旧名称", "設定メモ", "推奨クラス", "推奨都市特化"}
    if not required.issubset(columns):
        raise ValueError(f"種族: 統合表の列が不足しています: {', '.join(sorted(required-columns.keys()))}")
    class_rows = {}
    if "クラス" in reader.sheet_targets:
        class_rows = {row.get("名前"):row for row in convert_sheet(reader,"クラス","クラス.json").records}
    city_names = {row.get("項目名") for row in convert_sheet(reader,"都市","都市.json").records
                  if row.get("レア度") == "通常" and row.get("影響タイプ") == "都市補正"} if "都市" in reader.sheet_targets else set()
    used = {}
    for number,cells in rows:
        record = {key:normalize_value(cells.get(col,CellValue()).value) for key,col in columns.items()}
        name = record.get("種族")
        if not name:
            if record.get("使用可") is True:
                raise ValueError(f"種族!行{number}: 使用可TRUEですが種族名がありません")
            continue
        if not isinstance(name,str) or name in used:
            raise ValueError(f"種族!行{number}: 種族名が不正または重複しています: {name}")
        aliases = record.get("旧名称")
        if is_blank(aliases):
            aliases = []
        if not isinstance(aliases,list) or any(not isinstance(value,str) or not value.strip() for value in aliases):
            raise ValueError(f"種族!行{number}: 旧名称は文字列のJSON配列で指定してください")
        for alias in {name,*aliases}:
            if alias in used:
                raise ValueError(f"種族!行{number}: 名称/旧名称が別種族と重複しています: {alias}")
            used[alias]=name
        if not isinstance(record.get("使用可"),bool):
            raise ValueError(f"種族!行{number}: 使用可はTRUE/FALSEで指定してください")
        for key, known in (("推奨クラス", class_rows), ("推奨都市特化", city_names)):
            value = record.get(key)
            if is_blank(value):
                continue
            if not isinstance(value, str):
                raise ValueError(f"種族!行{number}: {key}は/区切りの文字列で指定してください")
            names = [item.strip() for item in value.split("/")]
            if any(not item or item not in known for item in names) or len(set(names)) != len(names):
                raise ValueError(f"種族!行{number}: {key}に未登録名・空項目・重複があります: {value}")
        if not record["使用可"]:
            continue
        missing = [key for key in required if is_blank(record.get(key))]
        if missing:
            raise ValueError(f"種族!行{number}: 使用可TRUEですが未設定: {', '.join(sorted(missing))}")
        if record["能力クラス"] not in class_rows:
            raise ValueError(f"種族!行{number}: 未登録の能力クラス: {record['能力クラス']}")
        ability = class_rows[record["能力クラス"]]
        for key in ("HP","攻撃","防御","魔力","精神","命中","速度","SIZ"):
            value=ability.get(key)
            if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or value<0 or key=="HP" and value<=0:
                raise ValueError(f"種族!行{number}: 能力クラスの{key}が未設定または不正です")
        if not isinstance(record["特徴"],list) or not record["特徴"] or any(not isinstance(value,str) or not value.strip() for value in record["特徴"]):
            raise ValueError(f"種族!行{number}: 特徴は空でないJSON配列が必要です")
        for key in ("初期人数","高さ","ヒーロー","軍隊"):
            value=record[key]
            if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or value<0 or key=="初期人数" and value<=0:
                raise ValueError(f"種族!行{number}: {key}の数値が不正です")
        if any(not float(record[key]).is_integer() for key in ("初期人数","高さ")):
            raise ValueError(f"種族!行{number}: 初期人数/高さは整数が必要です")
        if not re.fullmatch(r"#[0-9a-fA-F]{6}",str(record["マーカー色"])):
            raise ValueError(f"種族!行{number}: マーカー色は#RRGGBBで指定してください")


def source_sheet_name(reader, table_name):
    if table_name == "勢力" and has_unified_race_table(reader):
        return "種族"
    merged = MERGED_SHEET_TABLES.get(table_name)
    return merged[0] if merged and merged[0] in getattr(reader, "sheet_targets", {}) else table_name


def logical_table_rows(reader, table_name):
    if table_name in {"種族","勢力"} and has_unified_race_table(reader):
        yield from projected_race_rows(reader,table_name)
        return
    source = source_sheet_name(reader, table_name)
    if source == table_name:
        yield from reader.sheet_rows(table_name)
        return
    _, first, end = MERGED_SHEET_TABLES[table_name]
    for number, cells in reader.sheet_rows(source):
        selected = {col-first: cell for col, cell in cells.items() if first <= col < end}
        if number == 1:
            headers = {str(cell.value).strip() for cell in selected.values() if cell.value is not None}
            if not set(UNIQUE_KEYS[table_name]).issubset(headers):
                raise ValueError(f"{source}: {table_name}表の必須ヘッダーがありません。統合表の列範囲を確認してください")
        if number == 1 or any(not is_blank(cell.value) or cell.formula for cell in selected.values()):
            yield number, selected


def expand_selected_tables(names):
    selected = []
    for name in names:
        tables = [table for table, spec in MERGED_SHEET_TABLES.items() if spec[0] == name]
        for table in tables or [name]:
            if table not in selected:
                selected.append(table)
    return selected

# すべてのキー項目が入っている行だけ重複検査する。
UNIQUE_KEYS = {
    "施設": ("施設名",),
    "召喚モンスターリスト": ("名称",),
    "性格会話": ("性格",),
    "モンスター合成": ("素材", "合成結果"),
    "道具": ("名前",),
    "特産品": ("名前",),
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
    skipped_missing_key_rows: int = 0


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
    rows = list(logical_table_rows(reader, sheet_name))
    if not rows:
        result.errors.append({"type": "empty_sheet", "message": "シートにデータがありません"})
        return result

    header_row_no, header_cells = rows[0]
    # This sheet has three independent tables separated by blank columns.
    # Only the left recipe table is runtime fusion data.
    if sheet_name == "モンスター合成":
        primary = {}
        for col in sorted(header_cells):
            if header_text(header_cells[col].value) is None:
                break
            if primary and col != max(primary) + 1:
                break
            primary[col] = header_cells[col]
        header_cells = primary
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
        # 一意キーがない行は、同じシート内の説明表・集計・区切りとしてJSONへ出力しない。
        required_keys = UNIQUE_KEYS.get(sheet_name, ())
        if required_keys and not all(key in record and not is_blank(record[key]) for key in required_keys):
            result.skipped_missing_key_rows += 1
            continue
        if sheet_name == "出現敵" and "編成人数" in record:
            count = record["編成人数"]
            if isinstance(count, bool) or not isinstance(count, (int, float)) or not float(count).is_integer() or not 1 <= count <= 99:
                result.errors.append({"type": "invalid_member_count", "row": row_no,
                                      "header": "編成人数", "value": count,
                                      "message": "編成人数は1〜99の整数で指定してください"})
        if sheet_name in ("出現敵", "特産品"):
            for header in ("最低気温", "最高気温", "最低湿潤度", "最高湿潤度"):
                if header in record and (isinstance(record[header], bool)
                        or not isinstance(record[header], (int, float)) or not math.isfinite(record[header])):
                    result.errors.append({"type": "invalid_spawn_temperature", "row": row_no,
                                          "header": header, "value": record[header], "message": "気候条件は数値または空欄で指定してください"})
            for low_key, high_key in (("最低気温", "最高気温"), ("最低湿潤度", "最高湿潤度")):
                low, high = record.get(low_key), record.get(high_key)
                if type(low) in (int, float) and type(high) in (int, float) and low > high:
                    result.errors.append({"type": "invalid_spawn_temperature_range", "row": row_no,
                                          "message": f"{low_key}は{high_key}以下にしてください"})
            for header in ("最低湿潤度", "最高湿潤度"):
                value = record.get(header)
                if type(value) in (int, float) and not 0 <= value <= 100:
                    result.errors.append({"type": "invalid_climate_humidity", "row": row_no, "header": header,
                                          "message": "湿潤度は0〜100にしてください"})
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

    if sheet_name == "災害":
        validate_terrain_disasters(result)
        validate_dynamic_disasters(result)
    if sheet_name == "都市基本データ":
        for record in result.records:
            if "維持食料" in record and type(record["維持食料"]) is not bool:
                result.errors.append({"type": "invalid_maintenance_food_flag", "name": record.get("データ分類")})
    if sheet_name == "施設":
        validate_facility_references(result)
        if any(record.get("固定産出資源") for record in result.records):
            resources = convert_sheet(reader, "都市基本データ", "都市基本データ.json")
            skills = {row.get("データ分類"): row.get("対応技能") for row in resources.records}
            for record in result.records:
                targets = [part.strip() for part in str(record.get("固定産出資源", "")).split("/") if part.strip()]
                for target in targets:
                    skill = skills.get(target)
                    value = record.get(skill) if skill else None
                    if skill not in ("農業", "林業", "漁業", "工業") or type(value) not in (int, float) or not math.isfinite(value) or value <= 0:
                        result.errors.append({"type": "invalid_facility_fixed_resource", "name": record.get("施設名"), "resource": target})
    if sheet_name == "特産品":
        for record in result.records:
            for key in ("収穫量加算", "固定収入"):
                value = record.get(key)
                if value is not None and (type(value) not in (int, float) or not math.isfinite(value) or value < 0):
                    result.errors.append({"type": "invalid_specialty_food_bonus", "name": record.get("名前"), "field": key})
            if (record.get("収穫量加算") or record.get("固定収入")) and record.get("収穫資源") not in ("穀物", "野菜", "肉", "魚"):
                result.errors.append({"type": "invalid_specialty_food_resource", "name": record.get("名前")})
    if sheet_name == "勝利対象土地":
        validate_guardian_landmarks(reader, result)
    return result


def validate_dynamic_disasters(result):
    for record in result.records:
        detail = record.get("災害詳細設定")
        if detail is None:
            continue
        def error(message):
            result.errors.append({"type": "invalid_disaster_details", "id": record.get("ID"), "message": message})
        if not isinstance(detail, dict):
            error("災害詳細設定はJSONオブジェクトで指定してください")
            continue
        numeric = ("stepsPerTurn", "minimumHeight", "maximumHeight", "rubbleDurability", "triggerRadius", "visionPenalty", "scoutPenalty", "weatherHumidity", "rangedAccuracyMultiplier", "maximumRadius", "radiusGrowthPerTurn", "radiusDecayPerTurn", "windTurnSteps", "magicPower", "facilityDamageMultiplier")
        allowed = set(numeric) | {"movement", "minimumClimateTemperature", "weather", "triggerDisaster", "powerRange", "damageComponents", "knockback", "fogPenalty", "movementImpediment", "followWind"}
        if set(detail) - allowed:
            error(f"未対応の災害詳細設定: {sorted(set(detail) - allowed)}")
        if "fogPenalty" in detail and type(detail["fogPenalty"]) is not bool:
            error("fogPenaltyは真偽値で指定してください")
        if "followWind" in detail and type(detail["followWind"]) is not bool:
            error("followWindは真偽値で指定してください")
        if "windTurnSteps" in detail and (type(detail["windTurnSteps"]) is not int or not 0 <= detail["windTurnSteps"] <= 3):
            error("windTurnStepsは0〜3の整数で指定してください")
        if "movementImpediment" in detail:
            effect = detail["movementImpediment"]
            keys = {"power", "reductionPerPower", "edgeMultiplier", "flightMultiplier", "maximumReduction"}
            if not isinstance(effect, dict) or set(effect) != keys or any(type(effect.get(key)) not in (int, float) or not math.isfinite(effect[key]) for key in keys):
                error("movementImpedimentは威力・換算率・外縁倍率・飛行倍率・最大低下率の5項目を持つ数値オブジェクトで指定してください")
            elif effect["power"] < 0 or effect["reductionPerPower"] < 0 or not 0 <= effect["edgeMultiplier"] <= 1 or effect["flightMultiplier"] < 1 or not 0 <= effect["maximumReduction"] < 1:
                error("movementImpedimentの値が範囲外です")
        for key in (*numeric, "minimumClimateTemperature"):
            if key not in detail:
                continue
            value = detail[key]
            if type(value) not in (int, float) or not math.isfinite(value) or key != "minimumClimateTemperature" and value < 0:
                error(f"{key}は有限の数値で指定してください")
            elif key == "rangedAccuracyMultiplier" and value > 1 or key == "weatherHumidity" and value > 100:
                error(f"{key}の値が範囲外です")
            elif key == "stepsPerTurn" and (not float(value).is_integer() or value > 10):
                error("stepsPerTurnは0〜10の整数で指定してください")
        if detail.get("movement") not in (None, "drift", "downhill", "coast"):
            error("movementはdrift/downhill/coastから指定してください")
        for key in ("maximumRadius", "radiusGrowthPerTurn", "radiusDecayPerTurn"):
            value = detail.get(key)
            if value is not None and (type(value) not in (int, float) or not float(value).is_integer() or not 0 <= value <= 10):
                error(f"{key}は0〜10の整数で指定してください")
        power_range = detail.get("powerRange")
        if power_range is not None:
            keys = {"minimum", "maximum", "humidityMinimum", "humidityMaximum"}
            if not isinstance(power_range, dict) or set(power_range) != keys or any(type(power_range.get(key)) not in (int, float) or not math.isfinite(power_range[key]) for key in keys):
                error("powerRangeは威力/湿度の上下限4項目を持つ数値オブジェクトで指定してください")
            elif not (0 <= power_range["minimum"] <= power_range["maximum"] and 0 <= power_range["humidityMinimum"] < power_range["humidityMaximum"] <= 100):
                error("powerRangeの威力または湿度の上下限が不正です")
        components = detail.get("damageComponents")
        if components is not None:
            if not isinstance(components, list) or not 1 <= len(components) <= 4:
                error("damageComponentsは1〜4件の属性/配分オブジェクト配列で指定してください")
            else:
                for component in components:
                    if (not isinstance(component, dict) or set(component) != {"element", "weight"}
                        or not isinstance(component.get("element"), str) or not component["element"].strip()
                        or type(component.get("weight")) not in (int, float)
                        or not math.isfinite(component["weight"]) or component["weight"] <= 0):
                        error("damageComponentsはelement文字列と正のweightを指定してください")
        knockback = detail.get("knockback")
        if knockback is not None:
            if (not isinstance(knockback, dict) or not {"resistanceKey", "powerPerTile", "maximumDistance"}.issubset(knockback)
                or set(knockback) - {"resistanceKey", "powerPerTile", "maximumDistance", "direction"}
                or knockback.get("direction", "away") not in ("away", "toward", "random")
                or not isinstance(knockback.get("resistanceKey"), str) or not knockback["resistanceKey"].endswith("耐性")
                or type(knockback.get("powerPerTile")) not in (int, float)
                or not math.isfinite(knockback["powerPerTile"]) or knockback["powerPerTile"] <= 0
                or type(knockback.get("maximumDistance")) is not int or not 0 <= knockback["maximumDistance"] <= 10):
                error("knockbackはresistanceKey耐性名・正のpowerPerTile・0〜10のmaximumDistanceを指定してください")
        for key in ("weather", "triggerDisaster"):
            if key in detail and not isinstance(detail[key], str):
                error(f"{key}は文字列で指定してください")


def validate_terrain_disasters(result):
    seen_terrain = set()
    seen_special = set()
    requirements = {
        "地形破壊": {"威力軽減": 0, "地形耐久": 1, "地形被害倍率": 0, "高度低下": 0},
        "落石": {"ダメージ威力": 0, "発生猶予ターン": 1},
        "瓦礫": {"威力軽減": 0, "地形耐久": 1, "地形被害倍率": 0, "撤去AP": 0},
    }
    for record in result.records:
        kind = record.get("地形災害処理")
        if not kind:
            continue
        def error(message):
            result.errors.append({"type": "invalid_terrain_disaster", "id": record.get("ID"), "message": message})
        if kind not in requirements:
            error("地形災害処理は地形破壊/落石/瓦礫から指定してください")
            continue
        if "攻撃" not in re.split(r"[、,，|/]", str(record.get("発生方法", ""))):
            error("地形災害の発生方法には攻撃が必要です")
        for header, minimum in requirements[kind].items():
            value = record.get(header)
            if type(value) not in (int, float) or not math.isfinite(value) or value < minimum:
                error(f"{header}は{minimum}以上の数値が必要です")
            elif header in ("高度低下", "発生猶予ターン") and not float(value).is_integer():
                error(f"{header}は整数が必要です")
        if kind != "落石" and not record.get("攻撃発生属性"):
            error("攻撃発生属性が必要です")
        if kind == "落石" and not record.get("ダメージ属性"):
            error("落石のダメージ属性が必要です")
        if record.get("有効") is False:
            continue
        if kind == "地形破壊":
            terrains = [name.strip() for name in re.split(r"[、,，|/]", str(record.get("対象地形", ""))) if name.strip()]
            if not terrains:
                error("地形破壊には対象地形が必要です")
            for terrain in terrains:
                if terrain in seen_terrain:
                    error(f"有効な地形破壊の対象地形が重複しています: {terrain}")
                seen_terrain.add(terrain)
        else:
            if kind in seen_special:
                error(f"有効な{kind}は1行のみ指定できます")
            seen_special.add(kind)


def validate_guardian_landmarks(reader, result):
    fields = ("守護者候補", "配下候補", "守護者Lv", "配下数", "配下Lv差", "配下Lv幅", "試練ID", "守護範囲")
    if not any(any(field in row for field in fields) for row in result.records):
        return
    classes = {row.get("名前") for row in convert_sheet(reader, "クラス", "クラス.json").records}
    event_rows = list(reader.sheet_rows("イベント"))
    names = {col:cell.value for col,cell in event_rows[0][1].items()}
    events = {row.get("ID") for _, cells in event_rows[1:] if (row := {names.get(col):cell.value for col,cell in cells.items()}).get("分類") == "守護者" and row.get("状態") == "有効"}
    for row in result.records:
        errors = []
        for key in fields:
            if key not in row:
                errors.append(f"未設定: {key}")
        for key in ("守護者候補", "配下候補"):
            candidates = row.get(key)
            if not isinstance(candidates, list) or key == "守護者候補" and not candidates:
                errors.append(f"{key}はJSON配列で指定")
                continue
            seen = set()
            for candidate in candidates:
                if not isinstance(candidate, dict) or candidate.get("race") not in classes or candidate.get("className") not in classes:
                    errors.append(f"{key}の種族/能力クラスが未登録")
                    continue
                identity = candidate.get("name") if key == "守護者候補" else (candidate["race"], candidate["className"])
                if not identity or identity in seen:
                    errors.append(f"{key}の識別名が空欄/重複")
                seen.add(identity)
                if key == "守護者候補" and not isinstance(candidate.get("unique"), bool):
                    errors.append("守護者候補のuniqueは真偽値で指定")
                if "trialIds" in candidate:
                    value = candidate["trialIds"]
                    if not isinstance(value, list) or len(value) != 3 or any(not isinstance(name, str) for name in value) or len(set(value)) != 3 or any(name not in events for name in value):
                        errors.append("候補固有trialIdsは有効な試練3件で指定")
        for key in fields[2:]:
            value = row.get(key)
            if key == "試練ID":
                if not isinstance(value, list) or len(value) != 3 or any(not isinstance(name, str) for name in value) or len(set(value)) != 3 or any(name not in events for name in value):
                    errors.append("試練IDは有効な守護者依頼3件を重複せず指定")
            elif isinstance(value, bool) or not isinstance(value, int) or value < (1 if key == "守護者Lv" else 0):
                errors.append(f"{key}は有効な整数で指定")
        result.errors.extend({"type":"guardian_definition", "ID":row.get("ID"), "message":message} for message in errors)


def validate_facility_references(result):
    """Facility names are keys; reject dangling references before replacing runtime data."""
    by_name = {row["施設名"]: row for row in result.records}
    edges = {}
    for row in result.records:
        name = row["施設名"]
        for field in ("味方通行AP増加率", "内壁幸福度低下", "内壁幸福度低下上限"):
            value = row.get(field)
            if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0):
                result.errors.append({"type": "invalid_wall_effect", "name": name, "header": field, "value": value})
        if "/" in str(name):
            result.errors.append({"type": "invalid_facility_name", "name": name,
                                  "message": "施設名に条件区切りの / は使えません"})
        edges[name] = []
        for field in ("前提施設", "改築元", "召喚補正前提施設"):
            for target in (part.strip() for part in str(row.get(field, "")).split("/")):
                if not target:
                    continue
                if target not in by_name:
                    result.errors.append({"type": "unknown_facility_reference", "name": name,
                                          "header": field, "value": target})
                elif field != "召喚補正前提施設":
                    edges[name].append(target)
    visited, visiting = set(), set()

    def visit(name):
        if name in visiting:
            result.errors.append({"type": "facility_dependency_cycle", "name": name})
            return
        if name in visited:
            return
        visiting.add(name)
        for target in edges.get(name, []):
            visit(target)
        visiting.remove(name)
        visited.add(name)

    for name in edges:
        visit(name)


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
                    tables = [table for table, spec in MERGED_SHEET_TABLES.items() if spec[0] == name]
                    if name == "種族" and has_unified_race_table(reader):
                        tables = ["種族","勢力"]
                    if tables:
                        mark = "-> " + ", ".join(SHEET_TO_JSON[table] for table in tables)
                    else:
                        mark = f"-> {SHEET_TO_JSON[name]}" if name in SHEET_TO_JSON else "(対象外)"
                    print(f"{name}: {mark}")
                return 0

            selected = expand_selected_tables(args.sheet or list(SHEET_TO_JSON))
            if has_unified_race_table(reader) and any(name in selected for name in ("種族","勢力")):
                selected = list(dict.fromkeys([*selected,"種族","勢力"]))
                validate_unified_race_table(reader)
            unknown = [s for s in selected if s not in SHEET_TO_JSON]
            if unknown:
                raise ValueError(f"変換対象に定義されていないシート: {', '.join(unknown)}")
            missing = [s for s in selected if source_sheet_name(reader, s) not in reader.sheet_targets]
            if missing:
                raise ValueError(f"XLSXに存在しないシート: {', '.join(missing)}")

            results = [
                convert_sheet(reader, s, SHEET_TO_JSON[s], args.allow_missing_formula_cache)
                for s in selected
            ]
            source_sheets = {s: source_sheet_name(reader, s) for s in selected}
            recognized_sources = {source_sheet_name(reader, table) for table in SHEET_TO_JSON}

        report = {
            "version": VERSION,
            "input": str(args.input),
            "output_dir": str(args.output_dir),
            "dry_run": bool(args.dry_run),
            "allow_missing_formula_cache": bool(args.allow_missing_formula_cache),
            "converted_sheets": selected,
            "source_sheets": source_sheets,
            "excluded_workbook_sheets": [s for s in workbook_sheets if s not in recognized_sources],
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
                    "skipped_missing_key_rows": r.skipped_missing_key_rows,
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
