import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from xml.sax.saxutils import escape
import zipfile

from event_sheet_converter import HEADERS, compile_rows, main, numbered, read_rows


def row(**extra):
    return {"ID": "EVENT_A", "状態": "有効", "分類": "一般村", "イベント種別": "会話", "名前": "相談",
            "選択肢": "1. 聞く\n1-1. 詳しく聞く\n2. 終わる", "回答": "2. またどうぞ\n1-1. 詳細です", **extra}


def workbook(path, data, header_order=HEADERS):
    def column(index):
        result = ""
        while index:
            index, digit = divmod(index - 1, 26)
            result = chr(65 + digit) + result
        return result
    xml_rows = []
    for number, values in enumerate([list(header_order), *[[entry.get(key, "") for key in header_order] for entry in data]], 1):
        cells = []
        for index, value in enumerate(values, 1):
            ref = f"{column(index)}{number}"
            if isinstance(value, bool):
                cells.append(f'<c r="{ref}" t="b"><v>{int(value)}</v></c>')
            else:
                cells.append(f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{escape(str(value))}</t></is></c>')
        xml_rows.append(f'<row r="{number}">{"".join(cells)}</row>')
    ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("xl/workbook.xml", f'<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="イベント" sheetId="1" r:id="rId1"/></sheets></workbook>')
        archive.writestr("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
        archive.writestr("xl/worksheets/sheet1.xml", f'<worksheet xmlns="{ns}"><sheetData>{"".join(xml_rows)}</sheetData></worksheet>')


class EventSheetTests(unittest.TestCase):
    def compile(self, *data):
        return compile_rows(enumerate(data, 2), {"木材", "穀物", "金", "魂"})

    def test_village_plan_and_template(self):
        template=row(ID="TPL", イベント種別="依頼ひな型", 計画対象="不足資源", 数量上限=100, 報酬="1-1. 友好度_10")
        plan=row(ID="PLAN", イベント種別="村計画", 計画対象="墓地", 判定基準="死亡者あり",
                 工程="安全確保>資材確保>建設", 支援依頼ID="TPL", 優先度=60)
        output, report=self.compile(plan, template)
        self.assertFalse(report["エラー"])
        self.assertNotIn("イベント_一般村.json", output)
        self.assertEqual(output["村計画.json"][0]["工程"], ["安全確保", "資材確保", "建設"])
        self.assertEqual(output["村依頼ひな型.json"][0]["完了効果"][0]["設定"]["値"], 10)

    def test_village_plan_rejects_missing_template(self):
        _, report=self.compile(row(イベント種別="村計画", 計画対象="墓地", 判定基準="死亡者あり",
                                  工程="建設", 支援依頼ID="MISSING"))
        self.assertTrue(report["エラー"])

    def test_village_plan_does_not_enable_unsupported_drafts(self):
        output, report=self.compile(row(イベント種別="村計画", 状態="試作", 計画対象="旧所有地",
                                        判定基準="所有地喪失", 工程="奪還"))
        self.assertFalse(output)
        self.assertFalse(report["エラー"])
        self.assertEqual(len(report["除外"]), 1)

    def guardian(self, **extra):
        return row(ID="GUARDIAN_SUPPLY", 分類="守護者", イベント種別="依頼", 目標="木材_100", 再発生=False,
                   選択肢="1. 受注\n1-1. 報告\n1-2. 保留\n2. 辞退", 回答="1-1. ありがとう",
                   条件="1-1. 依頼受注済み", 消費="1-1. 木材_100", 報酬="1-1. 友好度_35",
                   効果="1. 依頼開始_GUARDIAN_SUPPLY\n1-1. 依頼完了_GUARDIAN_SUPPLY") | extra

    def test_guardian_goals_and_rewards(self):
        for goal, consume, radius, kind in (("木材_100", "1-1. 木材_100", "", "納品"),
                                          ("見張り_3", "", 3, "見張り"), ("周辺脅威_3", "", 8, "周辺討伐")):
            output, report = self.compile(self.guardian(目標=goal, 消費=consume, 対象範囲=radius))
            self.assertFalse(report["エラー"], report)
            event = output["イベント_守護者.json"][0]
            self.assertEqual(event["目標"][0]["タイプ"], kind)
            self.assertEqual(event["完了効果"], [{"タイプ": "守護者友好度変更", "設定": {"値": 35}}])
            self.assertFalse(event["再発生"])

    def test_guardian_does_not_silently_accept_unsupported_terms(self):
        for extra in ({"報酬": "1-1. 金_10"}, {"報酬": "1. 友好度_35"}, {"期限ターン": 5},
                      {"再発生": True}, {"再発生": 0}, {"発生条件": "種族_悪魔"}, {"条件": "1-1. 不明条件"},
                      {"消費": "1-1. 木材_99"}, {"目標": "魂_1", "消費": "1-1. 魂_1"},
                      {"目標": "見張り_3", "消費": "", "対象範囲": 0}, {"効果": "1. 契約開始_例"}):
            with self.subTest(extra=extra):
                self.assertTrue(self.compile(self.guardian(**extra))[1]["エラー"])

    def test_guardian_three_trials(self):
        resources = {"黒木", "特木", "青金鋼", "赤黒鋼", "宝石"}
        bundle = "/".join(f"{name}_10" for name in sorted(resources))
        for goal, consume, radius, kind in ((bundle, "1-1. " + bundle, "", "納品"),
                                           ("試練召喚_守護者配下_Lv30_数1", "", 3, "試練討伐"),
                                           ("村発展_施設3_数2", "", 16, "村発展")):
            output, report = compile_rows([(18, self.guardian(目標=goal, 消費=consume, 対象範囲=radius))], resources, stock_resources=resources)
            self.assertFalse(report["エラー"], report)
            goals = output["イベント_守護者.json"][0]["目標"]
            self.assertEqual(goals[0]["タイプ"], kind)
            self.assertEqual(len(goals), 5 if kind == "納品" else 1)

    def test_support_templates(self):
        for kind, goal in (("警備", "警備_3"), ("建設支援", "建設_1"), ("複合支援", "警備_3/建設_1")):
            output, report = self.compile(row(イベント種別="依頼ひな型", 計画対象=kind, 目標=goal, 対象範囲=1, 報酬="1-1. 友好度_10"))
            self.assertFalse(report["エラー"], report)
            self.assertEqual(len(output["村依頼ひな型.json"][0]["目標"]), 2 if kind == "複合支援" else 1)
        output, report = self.compile(row(イベント種別="依頼ひな型", 計画対象="継続支援", 周期=5, 猶予=3, 目標ターン=3, 数量上限=20))
        self.assertFalse(report["エラー"], report)
        self.assertEqual(output["村依頼ひな型.json"][0]["周期"], 5)

    def test_support_rejects_incomplete_or_unknown_terms(self):
        for fields in ({"計画対象":"複合支援", "目標":"警備_3", "対象範囲":1},
                       {"計画対象":"建設支援", "目標":"建設_2", "対象範囲":1},
                       {"計画対象":"警備", "目標":"不明_3", "対象範囲":1},
                       {"計画対象":"継続支援", "周期":0, "猶予":3, "目標ターン":3, "数量上限":20},
                       {"計画対象":"継続支援", "周期":5, "猶予":2, "目標ターン":3, "数量上限":20}):
            self.assertTrue(self.compile(row(イベント種別="依頼ひな型", **fields))[1]["エラー"])

    def test_guardian_trial_validation(self):
        for goal, consume in (("木材_5/木材_5", "1-1. 木材_5/木材_5"),
                              ("木材_5/穀物_10", "1-1. 木材_5"),
                              ("試練召喚_守護者配下_Lv0_数1", ""), ("試練召喚_守護者配下_Lv30_数6", ""),
                              ("村発展_施設0_数2", ""), ("村発展_施設3_数0", "")):
            self.assertTrue(self.compile(self.guardian(目標=goal, 消費=consume, 対象範囲=3))[1]["エラー"], goal)

    def test_number_matching_not_line_order(self):
        output, report = self.compile(row())
        self.assertFalse(report["エラー"])
        choices = output["イベント_一般村.json"][0]["選択肢"]
        self.assertEqual([choice["番号"] for choice in choices], ["1", "1-1", "2"])
        self.assertEqual(choices[1]["回答"], "詳細です")
        self.assertEqual(choices[1]["親番号"], "1")

    def test_runtime_output_does_not_replace_legacy_events(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime, source = root / "runtime", root / "source.xlsx"
            runtime.mkdir()
            legacy = runtime / "イベント_一般村.json"
            legacy.write_text('[{"ID":"LEGACY"}]', encoding="utf-8")
            workbook(source, [row()])
            args = ["--input", str(source), "--runtime", "--output-dir", str(root / "stage"), "--report", str(root / "report.json")]
            with patch("event_sheet_converter.RUNTIME_DIR", runtime), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(args), 0)
                self.assertEqual(json.loads((runtime / "イベント会話.json").read_text(encoding="utf-8"))[0]["ID"], "EVENT_A")
                workbook(source, [row(状態="参考")])
                self.assertEqual(main(args), 0)
                self.assertEqual(json.loads((runtime / "イベント会話.json").read_text(encoding="utf-8")), [])
            self.assertEqual(json.loads(legacy.read_text(encoding="utf-8")), [{"ID": "LEGACY"}])

    def test_unicode_separator_changes_only_number(self):
        self.assertEqual(numbered("1−1. 文中の−は維持", "回答"), {"1-1": "文中の−は維持"})
        with self.assertRaises(ValueError):
            numbered("1−1. A\n1-1. B", "回答")

    def test_invalid_numbered_input(self):
        for value in ("番号なし", "01. A", "0. A", "1. ", "1. A\n続き", 12):
            with self.subTest(value=value), self.assertRaises(ValueError):
                numbered(value, "選択肢")

    def test_references_and_ids(self):
        for bad in (row(選択肢="1-1. 孤立"), row(回答="3. 不明"), row(ID="../escape")):
            self.assertTrue(self.compile(bad)[1]["エラー"])
        self.assertTrue(self.compile(row(), row())[1]["エラー"])

    def test_reference_disabled_and_draft_excluded(self):
        data = [row(ID=f"E_{index}", 状態=status, 効果="1. 未確定契約_例") for index, status in enumerate(("参考", "試作", "無効", ""))]
        output, report = self.compile(*data)
        self.assertEqual(output, {})
        self.assertEqual(len(report["除外"]), 4)
        self.assertFalse(report["エラー"])

    def test_unknown_conditions_effects_and_resources_fail(self):
        for field, value in (("条件", "1. 不明条件"), ("効果", "1. 契約開始_例"), ("消費", "1. 不明資源_3"), ("報酬", "1. 金_-1"), ("消費", 1), ("条件", "1. 木材_0以上")):
            self.assertTrue(self.compile(row(**{field: value}))[1]["エラー"], field)

    def test_typed_terms_zero_false_and_multibyte_text(self):
        output, report = self.compile(row(説明="日本語の会話", 発生条件="一般村友好度_-20以上/種族_悪魔", 条件="1. 木材_10以上", 消費="1. 木材_10/穀物_5", 報酬="1. 友好度_10/魂_2", 効果="2. 会話終了", 再発生=False, 周期=0))
        self.assertFalse(report["エラー"])
        event = output["イベント_一般村.json"][0]
        self.assertIs(event["再発生"], False)
        self.assertEqual(event["周期"], 0)
        self.assertEqual(event["選択肢"][0]["消費"][0]["数量"], 10)
        self.assertEqual(event["発生条件"][0]["値"], -20)

    def test_reference_catalog_and_goal_validation(self):
        resources, targets = {"木材"}, {"悪魔", "ウルフ"}
        output, report = compile_rows([(2, row(発生条件="種族_悪魔", 目標="ウルフ_3"))], resources, targets)
        self.assertFalse(report["エラー"])
        self.assertEqual(output["イベント_一般村.json"][0]["目標"][0]["タイプ"], "討伐")
        for extra in ({"発生条件": "種族_不明"}, {"条件": "1. 不明討伐_3達成"}, {"目標": "不明_1"}, {"目標": "木材_0"}):
            self.assertTrue(compile_rows([(2, row(**extra))], resources, targets)[1]["エラー"])

    def test_xlsx_cli_staging_dryrun_and_no_write_on_error(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, output, report = root / "source.xlsx", root / "out", root / "report.json"
            workbook(source, [row(再発生=False)])
            self.assertEqual(read_rows(source)[0][1]["再発生"], False)
            args = ["--input", str(source), "--output-dir", str(output), "--report", str(report)]
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(main([*args, "--dry-run"]), 0)
                self.assertFalse(output.exists())
                self.assertEqual(main(args), 0)
                target = output / "イベント_一般村.json"
                saved = target.read_bytes()
                workbook(source, [row(報酬="1. 未知_2")])
                self.assertEqual(main(args), 2)
                self.assertEqual(target.read_bytes(), saved)
                workbook(source, [row(状態="参考")])
                self.assertEqual(main(args), 0)
                self.assertEqual(json.loads(target.read_text(encoding="utf-8")), [])

    def test_runtime_output_rejected(self):
        runtime = Path(__file__).resolve().parents[1] / "data/source/export/json"
        with contextlib.redirect_stderr(io.StringIO()), patch("event_sheet_converter.read_rows", side_effect=AssertionError("must not read")):
            self.assertEqual(main(["--input", "ignored.xlsx", "--output-dir", str(runtime)]), 2)
            self.assertEqual(main(["--input", "ignored.xlsx", "--report", str(runtime / "sub/report.json")]), 2)

    def test_reordered_columns(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "reordered.xlsx"
            order = ["名前", *[key for key in HEADERS if key not in {"ID", "名前"}], "ID"]
            workbook(path, [row()], order)
            result = read_rows(path)[0][1]
            self.assertEqual(result["ID"], "EVENT_A")
            self.assertEqual(result["名前"], "相談")
            self.assertFalse(compile_rows([(2, result)], {"木材"})[1]["エラー"])


if __name__ == "__main__":
    unittest.main()
