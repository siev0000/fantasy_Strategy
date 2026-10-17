import unittest

from game_data_converter import CellValue, convert_sheet


class Reader:
    def __init__(self, rows):
        self.rows = rows

    def sheet_rows(self, name):
        for number, row in enumerate(self.rows, 1):
            yield number, {column: CellValue(value) for column, value in enumerate(row) if value is not None}


class FusionConverterTests(unittest.TestCase):
    header = ["素材", "合成結果", "ボーナスクラス", "獲得スキル", "状態", "備考", None, None,
              "元種", "派生クラス", "派生結果", "状態", "備考"]

    def convert(self, rows):
        return convert_sheet(Reader([self.header, *rows]), "モンスター合成", "モンスター合成.json")

    def test_separate_tables_do_not_merge_duplicate_headers(self):
        result = self.convert([["ホース_1,デヴィル_1", "バイコーン", "幻獣", None, "確定", "合成側", None, None,
                                "ウルフ", "ムーンアニマル", "月ウルフ", "候補", "派生側"]])
        self.assertFalse(result.errors)
        self.assertFalse(result.warnings)
        self.assertEqual(result.records, [{"素材": "ホース_1,デヴィル_1", "合成結果": "バイコーン",
                                           "ボーナスクラス": "幻獣", "状態": "確定", "備考": "合成側"}])

    def test_side_only_rows_are_not_recipes(self):
        result = self.convert([[None] * 8 + ["ウルフ", "ムーンアニマル", "月ウルフ", "確定", "派生のみ"]])
        self.assertFalse(result.records)
        self.assertFalse(result.errors)

    def test_draft_status_is_preserved_not_promoted(self):
        result = self.convert([["ホース_1,エンジェル_1", "ユニコーン", None, None, "候補"]])
        self.assertEqual(result.records[0]["状態"], "候補")

    def test_duplicate_recipe_rejected(self):
        row = ["ホース_1,デヴィル_1", "バイコーン", None, None, "確定"]
        result = self.convert([row, row])
        self.assertIn("duplicate_key", [error["type"] for error in result.errors])

    def test_missing_result_is_not_exported(self):
        result = self.convert([["ホース_1", None, None, None, "未定"]])
        self.assertFalse(result.records)
        self.assertEqual(result.skipped_missing_key_rows, 1)

    def test_other_sheets_still_detect_conflicts(self):
        result = convert_sheet(Reader([["名前", "状態", "状態"], ["検査", "確定", "候補"]]), "別の表", "test.json")
        self.assertIn("duplicate_header_conflict", [error["type"] for error in result.errors])


if __name__ == "__main__":
    unittest.main()
