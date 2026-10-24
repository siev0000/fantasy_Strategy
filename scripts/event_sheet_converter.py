#!/usr/bin/env python3
"""Validate numbered event cells and stage category JSON, without replacing runtime data."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

from game_data_converter import XlsxReader, atomic_write_json, is_blank

HEADERS = (
    "ID", "状態", "分類", "イベント種別", "名前", "説明", "発生タイミング", "発生条件",
    "選択肢", "回答", "条件", "消費", "報酬", "効果", "目標", "期限ターン", "再発生",
    "クールダウン", "周期", "猶予", "備考",
    "計画対象", "優先度", "判定基準", "工程", "支援依頼ID", "対象範囲", "数量上限", "目標ターン",
)
NUMBERED = ("選択肢", "回答", "条件", "消費", "報酬", "効果")
CATEGORIES = {name: f"イベント_{name}.json" for name in ("一般村", "洞窟", "探索", "都市", "外交", "国家", "守護者", "災害")}
RUNTIME_DIR = Path(__file__).resolve().parents[1] / "data/source/export/json"
PLAN_FILES = ("村計画.json", "村依頼ひな型.json")
LINE = re.compile(r"^([1-9][0-9]*(?:[-−－–][1-9][0-9]*)*)[.．]\s*(\S.*)$")


def numbered(value, label):
    if is_blank(value):
        return {}
    if not isinstance(value, str):
        raise ValueError(f"{label}: 番号付きの文字列が必要です")
    result = {}
    for line in value.splitlines():
        if not line.strip():
            continue
        match = LINE.fullmatch(line.strip())
        if not match:
            raise ValueError(f"{label}: 番号. 内容 の形式ではありません: {line}")
        key = re.sub(r"[−－–]", "-", match[1])
        if key in result:
            raise ValueError(f"{label}: 番号が重複しています: {key}")
        result[key] = match[2].strip()
    return result


def integer(value, label, minimum=0):
    if isinstance(value, bool) or not re.fullmatch(r"[0-9]+", str(value)):
        raise ValueError(f"{label}: {minimum}以上の整数が必要です")
    result = int(value)
    if result < minimum:
        raise ValueError(f"{label}: {minimum}以上の整数が必要です")
    return result


def tokens(value):
    if not value:
        return []
    if not isinstance(value, str):
        raise ValueError("条件・消費・報酬・効果は文字列で指定してください")
    parts = value.split("/")
    if any(not part.strip() for part in parts):
        raise ValueError("区切りの前後に空の項目があります")
    return [part.strip() for part in parts]


def stock_resources_from_repo(root):
    names = set()
    for row in json.loads((root / "都市基本データ.json").read_text(encoding="utf-8-sig")):
        if row.get("分類") in {"食料", "特殊資源", "木材", "石材", "金属", "貴金属", "宝石"}:
            names.add(row["データ分類"])
    return names


def resources_from_repo(root):
    names = stock_resources_from_repo(root) | {"金", "魂", "死体"}
    for row in json.loads((root / "特産品.json").read_text(encoding="utf-8-sig")):
        names.add(row["名前"])
    return names


def targets_from_repo(root):
    names = set()
    for filename, fields in (("クラス.json", ("名前",)), ("種族.json", ("名前", "種族", "key")), ("出現敵.json", ("名前", "種族", "クラス"))):
        for row in json.loads((root / filename).read_text(encoding="utf-8-sig")):
            for field in fields:
                if isinstance(row.get(field), str) and row[field].strip():
                    names.add(row[field].strip())
    return names


def amount_terms(value, resources, rewards=False, relation_type="一般村友好度変更"):
    result = []
    for term in tokens(value):
        match = re.fullmatch(r"(.+)_(-?[0-9]+)", term)
        if not match:
            raise ValueError(f"資源_数量 の形式ではありません: {term}")
        name, amount = match[1], int(match[2])
        if rewards and name == "友好度":
            if not -100 <= amount <= 100:
                raise ValueError("友好度は-100〜100で指定してください")
            result.append({"タイプ": relation_type, "設定": {"値": amount}})
        elif name in resources and amount > 0:
            result.append({"タイプ": "資源", "名前": name, "数量": amount})
        else:
            raise ValueError(f"不明な資源または不正な数量: {term}")
    return result


def conditions(value, resources, targets=None):
    result = []
    for term in tokens(value):
        if term == "依頼受注済み":
            result.append({"タイプ": "依頼受注済み"})
        elif match := re.fullmatch(r"(?:一般村)?友好度_(-?[0-9]+)(以上|以下)", term):
            number = int(match[1])
            if not -100 <= number <= 100:
                raise ValueError("友好度は-100〜100で指定してください")
            result.append({"タイプ": "一般村友好度", "比較": ">=" if match[2] == "以上" else "<=", "値": number})
        elif match := re.fullmatch(r"種族_(\S+)", term):
            if targets is not None and match[1] not in targets:
                raise ValueError(f"不明な種族: {match[1]}")
            result.append({"タイプ": "プレイヤー種族", "比較": "一致", "値": match[1]})
        elif match := re.fullmatch(r"(.+)_([0-9]+)以上", term):
            if match[1] not in resources:
                raise ValueError(f"不明な資源: {match[1]}")
            result.append({"タイプ": "資源保有", "名前": match[1], "数量": integer(match[2], "必要数", 1)})
        elif match := re.fullmatch(r"(.+)討伐_([0-9]+)達成", term):
            if targets is not None and match[1] not in targets:
                raise ValueError(f"不明な討伐対象: {match[1]}")
            result.append({"タイプ": "討伐達成", "対象": match[1], "数量": integer(match[2], "討伐数", 1)})
        else:
            raise ValueError(f"未対応の条件: {term}")
    return result


def effects(value):
    result = []
    for term in tokens(value):
        if term == "会話終了":
            result.append({"タイプ": "会話終了"})
        elif match := re.fullmatch(r"(依頼開始|依頼完了)_(\S+)", term):
            result.append({"タイプ": match[1], "設定": {"対象": match[2]}})
        else:
            raise ValueError(f"未対応の効果: {term}")
    return result


def guardian_record(row, cells, resources):
    """Compile only the guardian vocabulary that the runtime can actually execute."""
    event_id = row["ID"]
    if row.get("イベント種別") != "依頼" or not row.get("名前"):
        raise ValueError("守護者は名前のある依頼に対応します")
    for field in ("発生条件", "期限ターン", "クールダウン", "周期", "猶予", "計画対象", "優先度", "判定基準", "工程", "支援依頼ID", "数量上限", "目標ターン"):
        if not is_blank(row.get(field)):
            raise ValueError(f"守護者依頼では未対応の列: {field}")
    repeat = row.get("再発生")
    if not (is_blank(repeat) or repeat is False or isinstance(repeat, str) and repeat == "FALSE"):
        raise ValueError("守護者依頼は再発生FALSEのみ対応します")
    if set(cells["選択肢"]) != {"1", "1-1", "1-2", "2"}:
        raise ValueError("守護者依頼は1受注/1-1報告/1-2保留/2辞退の番号を使います")
    if cells["条件"] != {"1-1": "依頼受注済み"}:
        raise ValueError("守護者の条件は1-1. 依頼受注済みを指定してください")
    if cells["効果"] != {"1": f"依頼開始_{event_id}", "1-1": f"依頼完了_{event_id}"}:
        raise ValueError("守護者の受注/完了効果は自身のIDを参照してください")
    if set(cells["報酬"]) != {"1-1"}:
        raise ValueError("守護者の報酬は完了番号1-1だけに指定してください")
    rewards = amount_terms(cells["報酬"]["1-1"], resources, True, "守護者友好度変更")
    if len(rewards) != 1 or rewards[0]["タイプ"] != "守護者友好度変更":
        raise ValueError("守護者の報酬は友好度変更1項目に対応します")
    goal = re.fullmatch(r"(.+)_([0-9]+)", str(row.get("目標", "")))
    if not goal:
        raise ValueError("守護者の目標は資源/見張り/周辺脅威_数量で指定してください")
    target, amount = goal[1], integer(goal[2], "目標数", 1)
    if target in resources:
        kind = "納品"
        if cells["消費"] != {"1-1": f"{target}_{amount}"}:
            raise ValueError("守護者の納品消費は目標の資源・数量と一致させてください")
    elif target in {"見張り", "周辺脅威"}:
        kind = "見張り" if target == "見張り" else "周辺討伐"
        if cells["消費"]:
            raise ValueError("見張り/周辺討伐の消費は未対応です")
    else:
        raise ValueError(f"未対応の守護者目標: {target}")
    result = {key: row[key] for key in ("ID", "名前", "説明", "発生タイミング") if not is_blank(row.get(key))}
    result.update({"分類": "守護者", "イベント種別": "依頼", "再発生": False,
                   "目標": [{"タイプ": kind, "設定": {"対象": target, "数量": amount}}],
                   "完了効果": rewards,
                   "選択肢": [{"番号": key, "名前": label, "回答": cells["回答"].get(key, "")}
                            for key, label in cells["選択肢"].items()]})
    if kind != "納品":
        result["対象範囲"] = integer(row.get("対象範囲"), "対象範囲", 1)
    elif not is_blank(row.get("対象範囲")):
        raise ValueError("納品の対象範囲は指定しません")
    return result


def compile_rows(rows, resources, targets=None, stock_resources=None):
    output, report, seen = {}, {"有効": 0, "除外": [], "エラー": []}, set()
    for row_number, row in rows:
        if not any(not is_blank(v) for v in row.values()):
            continue
        try:
            event_id = str(row.get("ID", "")).strip()
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", event_id):
                raise ValueError("IDは英数字・_・-の固定識別子で指定してください")
            if event_id in seen:
                raise ValueError(f"ID重複: {event_id}")
            seen.add(event_id)
            cells = {field: numbered(row.get(field), field) for field in NUMBERED}
            choices = cells["選択肢"]
            for key in choices:
                if "-" in key and key.rsplit("-", 1)[0] not in choices:
                    raise ValueError(f"親番号がありません: {key}")
            for field in NUMBERED[1:]:
                unknown = cells[field].keys() - choices.keys()
                if unknown:
                    raise ValueError(f"{field}: 選択肢にない番号: {', '.join(sorted(unknown))}")
            status = str(row.get("状態", "")).strip()
            if status not in {"有効", "参考", "試作", "無効", ""}:
                raise ValueError(f"不明な状態: {status}")
            if status != "有効":
                report["除外"].append({"行": row_number, "ID": event_id, "状態": status or "未指定"})
                continue
            category = row.get("分類")
            if category not in CATEGORIES:
                raise ValueError(f"未対応の分類: {category}")
            if category == "守護者":
                supported = stock_resources if stock_resources is not None else resources - {"金", "魂", "死体"}
                output.setdefault(CATEGORIES[category], []).append(guardian_record(row, cells, supported))
                report["有効"] += 1
                continue
            if row.get("イベント種別") in {"村計画", "依頼ひな型"}:
                if category != "一般村" or not row.get("名前") or not row.get("計画対象"):
                    raise ValueError("村計画/ひな型には一般村分類・名前・計画対象が必要です")
                record = {key: row[key] for key in ("ID", "名前", "説明", "計画対象", "判定基準") if not is_blank(row.get(key))}
                for key in ("優先度", "対象範囲", "数量上限", "目標ターン", "期限ターン", "クールダウン"):
                    if not is_blank(row.get(key)):
                        record[key] = integer(row[key], key)
                if row["イベント種別"] == "村計画":
                    if row.get("判定基準") not in {"死亡者あり", "守備兵不在", "食料備蓄不足", "周辺脅威あり"}:
                        raise ValueError("未対応の計画判定基準")
                    record["工程"] = str(row.get("工程", "")).split(">")
                    if any(step not in {"安全確保", "資材確保", "建設", "訓練"} for step in record["工程"]):
                        raise ValueError("未対応の計画工程")
                    record["支援依頼ID"] = tokens(row.get("支援依頼ID"))
                    filename = PLAN_FILES[0]
                else:
                    if row["計画対象"] not in {"不足資源", "周辺脅威"}:
                        raise ValueError("未対応の依頼ひな型対象")
                    record["完了効果"] = amount_terms(cells["報酬"].get("1-1"), resources, True)
                    if any(effect["タイプ"] != "一般村友好度変更" for effect in record["完了効果"]):
                        raise ValueError("自動依頼の報酬は現在友好度変更に対応")
                    filename = PLAN_FILES[1]
                output.setdefault(filename, []).append(record)
                report["有効"] += 1
                continue
            if not choices or not row.get("名前") or row.get("イベント種別") not in {"依頼", "会話"}:
                raise ValueError("名前・選択肢が必要です。対応種別は依頼/会話です")
            record = {key: row[key] for key in ("ID", "分類", "イベント種別", "名前", "説明", "発生タイミング") if not is_blank(row.get(key))}
            record.update({"入力書式": "番号付きセルv1", "発生条件": conditions(row.get("発生条件"), resources, targets), "選択肢": []})
            for key, label in choices.items():
                node = {"番号": key, "名前": label, "回答": cells["回答"].get(key, ""),
                        "選択条件": conditions(cells["条件"].get(key), resources, targets),
                        "消費": amount_terms(cells["消費"].get(key), resources),
                        "報酬": amount_terms(cells["報酬"].get(key), resources, True),
                        "効果": effects(cells["効果"].get(key))}
                if "-" in key:
                    node["親番号"] = key.rsplit("-", 1)[0]
                record["選択肢"].append(node)
            for field in ("期限ターン", "クールダウン", "周期", "猶予"):
                if not is_blank(row.get(field)):
                    record[field] = integer(row[field], field)
            if not is_blank(row.get("再発生")):
                value = row["再発生"]
                if isinstance(value, bool):
                    record["再発生"] = value
                elif isinstance(value, str) and value.upper() in {"TRUE", "FALSE"}:
                    record["再発生"] = value.upper() == "TRUE"
                else:
                    raise ValueError("再発生はTRUE/FALSEで指定してください")
            if not is_blank(row.get("目標")):
                goal = re.fullmatch(r"(.+)_([0-9]+)", str(row["目標"]))
                if not goal or goal[1] not in resources and (targets is None or goal[1] not in targets):
                    raise ValueError("目標は既知の資源/討伐対象_数量で指定してください。複数目標は未対応です")
                record["目標"] = [{"タイプ": "納品" if goal[1] in resources else "討伐", "設定": {"対象": goal[1], "数量": integer(goal[2], "目標数", 1)}}]
            output.setdefault(CATEGORIES[category], []).append(record)
            report["有効"] += 1
        except (ValueError, TypeError) as exc:
            report["エラー"].append({"行": row_number, "ID": row.get("ID", ""), "内容": str(exc)})
    template_ids = {row["ID"] for row in output.get(PLAN_FILES[1], [])}
    for plan in output.get(PLAN_FILES[0], []):
        if set(plan["支援依頼ID"]) - template_ids:
            report["エラー"].append({"ID": plan["ID"], "内容": "有効な支援依頼ひな型がありません"})
    return output, report


def read_rows(path):
    with XlsxReader(path) as reader:
        rows = list(reader.sheet_rows("イベント"))
    if not rows or rows[0][0] != 1:
        raise ValueError("イベントシートの1行目にヘッダーが必要です")
    if any(cell.formula or isinstance(cell.value, dict) for cell in rows[0][1].values()):
        raise ValueError("ヘッダーには数式/エラー値を使えません")
    headers = {col: str(cell.value).strip() for col, cell in rows[0][1].items() if not is_blank(cell.value)}
    if len(set(headers.values())) != len(headers):
        raise ValueError("ヘッダーが重複しています")
    if set(headers.values()) - set(HEADERS) or not {"ID", "状態", "分類", "イベント種別", "名前", "選択肢"}.issubset(headers.values()):
        raise ValueError("イベントシートの列名が不正、または必須列がありません")
    result = []
    for number, cells in rows[1:]:
        for col, cell in cells.items():
            if cell.formula or isinstance(cell.value, dict):
                raise ValueError(f"イベント!行{number}: 数式/エラー値ではなく入力値を指定してください")
            if col not in headers and not is_blank(cell.value):
                raise ValueError(f"イベント!行{number}: ヘッダーのない列に値があります")
        result.append((number, {name: cells[col].value for col, name in headers.items() if col in cells}))
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("artifacts/event-sheet-json"))
    parser.add_argument("--report", type=Path, default=Path("artifacts/event-sheet-report.json"))
    parser.add_argument("--data-dir", type=Path, default=Path(__file__).resolve().parents[1] / "data/source/export/json")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--runtime", action="store_true", help="番号付きの有効行をイベント会話.jsonへ出力（旧イベントは維持）")
    args = parser.parse_args(argv)
    try:
        if args.input.suffix.lower() != ".xlsx":
            raise ValueError("入力は最新の@game_dataの.xlsxエクスポートを指定してください")
        runtime = RUNTIME_DIR
        if any(path == runtime.resolve() or runtime.resolve() in path.parents for path in (args.output_dir.resolve(), args.report.resolve())):
            raise ValueError("既存イベントの移行前のため実行時JSONフォルダには出力できません")
        output, report = compile_rows(read_rows(args.input), resources_from_repo(args.data_dir), targets_from_repo(args.data_dir), stock_resources_from_repo(args.data_dir))
        report.update({"入力": str(args.input), "出力先": str(args.output_dir), "検証のみ": args.dry_run, "ゲーム接続": "一般村の旧保存互換・村計画/ひな型、守護者の納品/見張り/周辺討伐に対応。他分類は後続" if args.runtime else "確認用", "出力ファイル": sorted(output)})
        atomic_write_json(args.report, report)
        if report["エラー"]:
            print(f"検証エラー{len(report['エラー'])}件。イベントJSONは更新しません。詳細: {args.report}", file=sys.stderr)
            return 2
        if not args.dry_run:
            if args.runtime:
                atomic_write_json(runtime / "イベント会話.json", [row for name, rows in output.items() if name not in PLAN_FILES for row in rows])
                for filename in PLAN_FILES:
                    atomic_write_json(runtime / filename, output.get(filename, []))
            # Write every supported category so removed/disabled rows cannot survive an old export.
            for filename in (*CATEGORIES.values(), *PLAN_FILES):
                atomic_write_json(args.output_dir / filename, output.get(filename, []))
        print(f"有効{report['有効']}件 / 除外{len(report['除外'])}件 / エラー0件。{report['ゲーム接続']}")
        return 0
    except (ValueError, KeyError, OSError, zipfile.BadZipFile, ET.ParseError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
