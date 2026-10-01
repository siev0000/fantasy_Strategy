#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CSシート -> スキル一覧.json 変換器

対象:
  game_data.xlsx の「CS」シート

既定出力:
  スキル一覧.json
  スキル一覧.report.json

特徴:
- 外部ライブラリ不要（Python標準ライブラリだけで .xlsx を読む）
- CSの A:N のうちゲーム用項目を直接読む
- H列「データ」を key:value / key+value / key-value 形式で展開
- 効果時間3t / 射程8m / 炸裂1 などのコロン無し表記にも対応
- I列「効果」は「追加効果」として保持し、「効果」シートA:Bから説明を補完
- 同名スキルは先頭行を採用。後続重複は report.json に記録
- 空欄はJSONから除外
- CSの「出力確認」列が TRUE の行だけを出力

使い方:
  python cs_skill_json_converter.py game_data.xlsx

出力先指定:
  python cs_skill_json_converter.py game_data.xlsx -o スキル一覧.json

同名重複をエラーにしたい場合:
  python cs_skill_json_converter.py game_data.xlsx --duplicates error

同名重複も全部残したい場合:
  python cs_skill_json_converter.py game_data.xlsx --duplicates all
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple
from xml.etree import ElementTree as ET
from zipfile import ZipFile

VERSION = "1.1"
DEFAULT_OUTPUT = Path("スキル一覧.json")

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

ACTION_ALIASES = {
    "Ａ": "A", "Ｐ": "P", "Ｑ": "Q", "Ｓ": "S",
    "a": "A", "p": "P", "q": "Q", "s": "S",
}
VALID_ACTIONS = {"A", "P", "Q", "S"}

# 「key<値>」のようにコロンを省略して書かれている既存表記。
# 長いキーを先に判定する。
BARE_PREFIX_KEYS = sorted({
    "クールタイム", "待機時間", "効果時間", "追加行動", "攻撃追加回数",
    "攻撃回数", "ノックバック", "消費増加", "移動速度", "物理貫通",
    "魔法貫通", "物理軽減", "魔法軽減", "物理ガード", "魔法ガード",
    "Cr率耐性", "Cr威力耐性", "Cr耐性", "Cr率", "Cr威力",
    "射撃耐性", "切断耐性", "貫通耐性", "打撃耐性", "炎耐性", "氷耐性",
    "雷耐性", "毒耐性", "光耐性", "闇耐性", "精神耐性", "盲目耐性",
    "怯み耐性", "出血耐性", "拘束耐性", "幻覚耐性", "疲労耐性", "支配耐性",
    "全威力", "威力", "ガード", "物理", "魔法", "射撃", "切断", "貫通",
    "打撃", "炎", "氷", "雷", "毒", "光", "闇", "精神攻撃", "盲目",
    "怯み", "出血", "拘束", "幻覚", "疲労", "回復", "HP", "MP", "ST",
    "攻撃", "防御", "魔力", "魔防", "精神", "速度", "命中", "SIZ",
    "指揮", "威圧", "看破", "知覚", "早業", "技術", "隠密", "索敵",
    "軽業", "農業", "林業", "漁業", "工業", "統治", "交渉", "魔術", "信仰",
    "射程", "範囲", "炸裂", "対象", "効果", "判定", "追加威力", "条件系統",
    "攻撃手段", "条件", "特殊", "溜め", "CT", "移動", "全力",
}, key=len, reverse=True)


def _col_to_num(ref: str) -> int:
    m = re.match(r"([A-Z]+)", ref)
    if not m:
        raise ValueError(f"不正なセル参照: {ref}")
    n = 0
    for ch in m.group(1):
        n = n * 26 + ord(ch) - 64
    return n


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _is_true_flag(value: Any) -> bool:
    """Excel/文字列の TRUE を出力対象として扱う。"""
    if value is True:
        return True
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value == 1
    return _clean_text(value).upper() == "TRUE"


def _find_header_column(
    xlsx: "XlsxReader",
    sheet_name: str,
    header_name: str,
    search_rows: int = 10,
) -> Tuple[int, int]:
    """先頭付近から指定ヘッダーを探し、(行番号, 列番号) を返す。"""
    for row_no, row in xlsx.sheet_rows(sheet_name):
        if row_no > search_rows:
            break
        for col_no, value in row.items():
            if _clean_text(value) == header_name:
                return row_no, col_no
    raise ValueError(
        f"シート '{sheet_name}' の先頭{search_rows}行以内に"
        f"ヘッダー '{header_name}' がありません"
    )


def _json_scalar(raw: Any) -> Any:
    """数値は数値化。%, t, m, 倍加など単位・意味を持つ文字列はそのまま保持。"""
    if raw is None:
        return None
    if isinstance(raw, (int, float, bool)):
        return raw
    s = str(raw).strip()
    if not s:
        return ""
    # +10 / -2 / 3.5 は数値にする。% や m / t / 倍 は文字列のまま。
    if re.fullmatch(r"[+-]?\d+(?:\.\d+)?", s):
        f = float(s)
        return int(f) if f.is_integer() else f
    return s


def _split_tokens(text: str) -> List[str]:
    """空白区切り。丸括弧内の空白は一塊として扱う。"""
    text = str(text or "").strip()
    if not text:
        return []
    tokens: List[str] = []
    buf: List[str] = []
    depth = 0
    for ch in text:
        if ch in "（(":
            depth += 1
            buf.append(ch)
        elif ch in "）)":
            depth = max(0, depth - 1)
            buf.append(ch)
        elif ch.isspace() and depth == 0:
            if buf:
                tokens.append("".join(buf))
                buf = []
        else:
            buf.append(ch)
    if buf:
        tokens.append("".join(buf))
    return tokens


def _set_value(out: Dict[str, Any], key: str, value: Any, duplicates: List[dict], token: str) -> None:
    key = key.strip()
    if not key:
        return
    value = _json_scalar(value)
    if value in (None, ""):
        return
    if key not in out:
        out[key] = value
        return
    # 同じキーが複数回ある場合は、勝手に合算・上書きしない。
    if out[key] != value:
        duplicates.append({"field": key, "kept": out[key], "ignored": value, "token": token})


def parse_data_field(data: str) -> Tuple[Dict[str, Any], List[dict], List[str]]:
    parsed: Dict[str, Any] = {}
    duplicate_fields: List[dict] = []
    unparsed: List[str] = []

    for token in _split_tokens(data):
        token = token.strip()
        if not token:
            continue

        # 注釈だけのトークンは詳細本文に残っているため、展開しない。
        if (token.startswith("(") and token.endswith(")")) or (token.startswith("（") and token.endswith("）")):
            unparsed.append(token)
            continue

        # key:value
        m = re.match(r"^([^:\s]+):(.+)$", token)
        if m:
            _set_value(parsed, m.group(1), m.group(2), duplicate_fields, token)
            continue

        # key+10 / key-15% / key+3.5
        m = re.match(r"^(.+?)([+-])((?:\d|\.)[^\s]*)$", token)
        if m:
            _set_value(parsed, m.group(1), m.group(2) + m.group(3), duplicate_fields, token)
            continue

        # 効果時間3t / 射程8m / 炸裂1 / CT3t など
        matched = False
        for key in BARE_PREFIX_KEYS:
            if token.startswith(key) and len(token) > len(key):
                rest = token[len(key):]
                # 日本語単語そのものを誤分解しにくくするため、値っぽい開始だけ許可。
                if re.match(r"^[0-9.+\-%]", rest):
                    _set_value(parsed, key, rest, duplicate_fields, token)
                    matched = True
                    break
        if matched:
            continue

        unparsed.append(token)

    return parsed, duplicate_fields, unparsed


class XlsxReader:
    """Python標準ライブラリだけで必要セルを読む簡易 .xlsx reader。"""

    def __init__(self, path: Path):
        self.path = Path(path)
        self.z = ZipFile(self.path)
        self.shared_strings = self._load_shared_strings()
        self.sheet_targets = self._load_sheet_targets()

    def close(self) -> None:
        self.z.close()

    def __enter__(self) -> "XlsxReader":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def _load_shared_strings(self) -> List[str]:
        if "xl/sharedStrings.xml" not in self.z.namelist():
            return []
        root = ET.fromstring(self.z.read("xl/sharedStrings.xml"))
        result = []
        for si in root.findall(f"{{{MAIN_NS}}}si"):
            result.append("".join((t.text or "") for t in si.iter(f"{{{MAIN_NS}}}t")))
        return result

    def _load_sheet_targets(self) -> Dict[str, str]:
        wb = ET.fromstring(self.z.read("xl/workbook.xml"))
        rels = ET.fromstring(self.z.read("xl/_rels/workbook.xml.rels"))
        relmap = {r.attrib["Id"]: r.attrib["Target"] for r in rels}
        result: Dict[str, str] = {}
        sheets = wb.find(f"{{{MAIN_NS}}}sheets")
        if sheets is None:
            return result
        for s in sheets:
            rid = s.attrib[f"{{{REL_NS}}}id"]
            target = relmap[rid]
            if not target.startswith("xl/"):
                target = "xl/" + target.lstrip("/")
            result[s.attrib["name"]] = target
        return result

    def sheet_rows(self, sheet_name: str) -> Iterable[Tuple[int, Dict[int, Any]]]:
        if sheet_name not in self.sheet_targets:
            raise KeyError(f"シート '{sheet_name}' がありません")
        root = ET.fromstring(self.z.read(self.sheet_targets[sheet_name]))
        sheet_data = root.find(f"{{{MAIN_NS}}}sheetData")
        if sheet_data is None:
            return
        for row in sheet_data:
            row_no = int(row.attrib.get("r", "0") or 0)
            values: Dict[int, Any] = {}
            for cell in row.findall(f"{{{MAIN_NS}}}c"):
                ref = cell.attrib.get("r", "")
                if not ref:
                    continue
                col = _col_to_num(ref)
                typ = cell.attrib.get("t")
                v = cell.find(f"{{{MAIN_NS}}}v")
                raw = None if v is None else v.text

                if typ == "s" and raw is not None:
                    try:
                        value = self.shared_strings[int(raw)]
                    except (ValueError, IndexError):
                        value = raw
                elif typ == "inlineStr":
                    inline = cell.find(f"{{{MAIN_NS}}}is")
                    value = "" if inline is None else "".join(
                        (t.text or "") for t in inline.iter(f"{{{MAIN_NS}}}t")
                    )
                elif typ == "b":
                    value = raw == "1"
                elif raw is None:
                    value = None
                else:
                    # 数値セルは数値型へ寄せる。文字列式のキャッシュはそのまま。
                    if typ in ("str", "e"):
                        value = raw
                    else:
                        try:
                            num = float(raw)
                            value = int(num) if num.is_integer() else num
                        except ValueError:
                            value = raw
                values[col] = value
            yield row_no, values


def load_effect_descriptions(xlsx: XlsxReader, sheet_name: str) -> Dict[str, str]:
    result: Dict[str, str] = {}
    if sheet_name not in xlsx.sheet_targets:
        return result
    for row_no, row in xlsx.sheet_rows(sheet_name):
        if row_no == 1:
            continue
        name = _clean_text(row.get(1))
        desc = _clean_text(row.get(2))
        if name and desc and name not in result:
            result[name] = desc
    return result


def normalize_action(value: Any) -> str:
    s = _clean_text(value)
    return ACTION_ALIASES.get(s, s.upper())


def compact_record(record: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for key, value in record.items():
        if value is None:
            continue
        if isinstance(value, str):
            value = value.strip()
            if not value:
                continue
        if isinstance(value, list) and not value:
            continue
        if isinstance(value, dict) and not value:
            continue
        out[key] = value
    return out


def row_to_skill(
    row_no: int,
    row: Dict[int, Any],
    effect_descriptions: Dict[str, str],
) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
    # CS: A Lv / B スキル名 / C ルビ / D 系統 / E 行動 / F HP / G AP /
    #     H データ / I 効果 / J 効果説明 / K 取得条件 / N アニメ
    name = _clean_text(row.get(2))
    action = normalize_action(row.get(5))
    info: Dict[str, Any] = {"row": row_no, "name": name, "warnings": []}

    if not name:
        info["skipped"] = "名前なし"
        return None, info
    if action not in VALID_ACTIONS:
        info["skipped"] = f"行動がA/P/Q/Sではない: {action or '(空欄)'}"
        return None, info

    detail = _clean_text(row.get(8))
    parsed, duplicate_fields, unparsed = parse_data_field(detail)

    record: Dict[str, Any] = {
        "名前": name,
        "ルビ": _clean_text(row.get(3)),
        "系統": _clean_text(row.get(4)),
        "行動": action,
        "Lv": _json_scalar(row.get(1)),
        "HP消費": _json_scalar(row.get(6)),
        "AP消費": _json_scalar(row.get(7)),
        "アニメ": _clean_text(row.get(14)),
        "詳細": detail,
        "取得条件": _clean_text(row.get(11)),
    }

    # H列の展開結果を追加。直接列と同名でも、直接列を優先する。
    for key, value in parsed.items():
        if key not in record or record[key] in (None, ""):
            record[key] = value
        elif record[key] != value:
            info["warnings"].append({
                "direct_field_conflict": {"field": key, "direct": record[key], "data": value}
            })

    # CS I列は機械処理用の「効果:～」と衝突させず別名で保持する。
    added_effect = _clean_text(row.get(9))
    if added_effect:
        record["追加効果"] = added_effect
        desc = effect_descriptions.get(added_effect) or _clean_text(row.get(10))
        if desc:
            record["効果説明"] = desc
        elif added_effect:
            info["warnings"].append({"effect_description_missing": added_effect})

    if duplicate_fields:
        info["warnings"].append({"duplicate_data_fields": duplicate_fields})
    if unparsed:
        info["warnings"].append({"unparsed_tokens": unparsed})

    return compact_record(record), info


def _records_equal(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
    # Lvの違いも定義差として扱う。
    return a == b


def convert(
    input_path: Path,
    output_path: Path,
    cs_sheet: str = "CS",
    effect_sheet: str = "効果",
    duplicate_mode: str = "first",
) -> Dict[str, Any]:
    records: List[Dict[str, Any]] = []
    infos: List[Dict[str, Any]] = []
    by_name: Dict[str, List[Tuple[int, Dict[str, Any]]]] = defaultdict(list)

    with XlsxReader(input_path) as xlsx:
        effects = load_effect_descriptions(xlsx, effect_sheet)
        output_check_header_row, output_check_col = _find_header_column(
            xlsx, cs_sheet, "出力確認"
        )

        for row_no, row in xlsx.sheet_rows(cs_sheet):
            if row_no <= max(3, output_check_header_row):
                continue

            output_check = row.get(output_check_col)
            if not _is_true_flag(output_check):
                infos.append({
                    "row": row_no,
                    "name": _clean_text(row.get(2)),
                    "warnings": [],
                    "skipped": "出力確認がTRUEではない",
                    "output_check": _clean_text(output_check),
                })
                continue

            rec, info = row_to_skill(row_no, row, effects)
            infos.append(info)
            if rec is None:
                continue
            by_name[rec["名前"]].append((row_no, rec))

    duplicates_report: List[Dict[str, Any]] = []
    for name, items in by_name.items():
        if len(items) == 1:
            records.append(items[0][1])
            continue

        first_row, first_rec = items[0]
        conflicts = []
        identical_rows = []
        for row_no, rec in items[1:]:
            if _records_equal(first_rec, rec):
                identical_rows.append(row_no)
            else:
                conflicts.append({"row": row_no, "record": rec})

        duplicates_report.append({
            "name": name,
            "kept_row": first_row,
            "identical_duplicate_rows": identical_rows,
            "conflicting_duplicates": conflicts,
        })

        if duplicate_mode == "error" and conflicts:
            raise ValueError(
                f"同名スキル '{name}' に内容違いの重複があります: "
                f"先頭行{first_row}, 後続={[x['row'] for x in conflicts]}"
            )
        if duplicate_mode == "all":
            records.extend(rec for _, rec in items)
        else:
            records.append(first_rec)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(records, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    report = {
        "converter_version": VERSION,
        "input": str(input_path),
        "sheet": cs_sheet,
        "output": str(output_path),
        "duplicate_mode": duplicate_mode,
        "output_check_column": "出力確認",
        "output_check_header_row": output_check_header_row,
        "output_check_column_number": output_check_col,
        "skill_count": len(records),
        "unique_skill_names": len(by_name),
        "duplicate_name_count": sum(1 for v in by_name.values() if len(v) > 1),
        "warning_row_count": sum(1 for i in infos if i.get("warnings")),
        "duplicates": duplicates_report,
        "rows": infos,
    }
    report_path = output_path.with_suffix(".report.json")
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return report


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="game_data.xlsx のCSシートからスキル一覧.jsonを生成")
    p.add_argument("input", nargs="?", default="game_data.xlsx", help="入力xlsx (既定: game_data.xlsx)")
    p.add_argument("-o", "--output", default=str(DEFAULT_OUTPUT), help="出力JSON (既定: スキル一覧.json)")
    p.add_argument("--sheet", default="CS", help="CSシート名 (既定: CS)")
    p.add_argument("--effect-sheet", default="効果", help="効果説明シート名 (既定: 効果)")
    p.add_argument(
        "--duplicates", choices=("first", "error", "all"), default="first",
        help="同名重複: first=先頭採用, error=内容差があれば停止, all=全部出力",
    )
    return p


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    input_path = Path(args.input)
    output_path = Path(args.output)
    if not input_path.exists():
        print(f"ERROR: 入力ファイルがありません: {input_path}", file=sys.stderr)
        return 2
    try:
        report = convert(
            input_path=input_path,
            output_path=output_path,
            cs_sheet=args.sheet,
            effect_sheet=args.effect_sheet,
            duplicate_mode=args.duplicates,
        )
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(f"生成完了: {output_path}")
    print(f"スキル数: {report['skill_count']} / ユニーク名: {report['unique_skill_names']}")
    print(f"同名重複: {report['duplicate_name_count']}件")
    print(f"警告行: {report['warning_row_count']}件")
    print(f"レポート: {output_path.with_suffix('.report.json')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
