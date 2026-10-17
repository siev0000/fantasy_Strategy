import unittest

from game_data_converter import CellValue, convert_sheet


class Reader:
    def __init__(self, rows):
        self.rows = rows

    def sheet_rows(self, name):
        for number, row in enumerate(self.rows, 1):
            yield number, {column: CellValue(value) for column, value in enumerate(row) if value is not None}


class EnemyFormationConverterTests(unittest.TestCase):
    header = ["ID", "出現地形", "種族名", "Lv_Min", "Lv_Max", "編成人数"]

    def convert(self, rows):
        return convert_sheet(Reader([self.header, *rows]), "出現敵", "出現敵.json")

    def test_single_and_army_stay_separate(self):
        result = self.convert([["wolf", "荒野", "ウルフ", 5, 15, 1],
                               ["wolf:軍隊3", "荒野", "ウルフ", 1, 10, 3]])
        self.assertFalse(result.errors)
        self.assertEqual([r["編成人数"] for r in result.records], [1, 3])

    def test_invalid_count_rejected(self):
        for count in [0, -1, 1.5, 100, True, "三体"]:
            with self.subTest(count=count):
                result = self.convert([["wolf", "荒野", "ウルフ", 1, 10, count]])
                self.assertTrue(any(e["type"] == "invalid_member_count" for e in result.errors))

    def test_legacy_missing_count_allowed(self):
        result = self.convert([["wolf", "荒野", "ウルフ", 5, 15, None]])
        self.assertFalse(result.errors)

    def test_same_id_still_rejected(self):
        result = self.convert([["wolf", "荒野", "ウルフ", 5, 15, 1],
                               ["wolf", "荒野", "ウルフ", 1, 10, 3]])
        self.assertTrue(any(e["type"] == "duplicate_key" for e in result.errors))


if __name__ == "__main__":
    unittest.main()
