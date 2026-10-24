import unittest

from game_data_converter import CellValue, convert_sheet


class Reader:
    def __init__(self, rows):
        self.rows = rows

    def sheet_rows(self, _):
        headers = ["施設名", "前提施設", "改築元", "召喚補正前提施設"]
        for number, values in enumerate([headers, *self.rows], 1):
            yield number, {i: CellValue(value=value) for i, value in enumerate(values)}


class FacilityNameConverterTests(unittest.TestCase):
    def convert(self, rows):
        return convert_sheet(Reader(rows), "施設", "施設.json")

    def test_names_and_multiple_prerequisites(self):
        result = self.convert([["村"], ["墓地", "村"], ["教会", "村/墓地"],
                               ["祭壇I", "教会", None, "祭壇I/教会"], ["祭壇II", "祭壇I", "祭壇I"]])
        self.assertFalse(result.errors)
        self.assertEqual(result.records[2]["前提施設"], "村/墓地")
        self.assertTrue(all("施設ID" not in row for row in result.records))

    def test_duplicate_name(self):
        result = self.convert([["墓地"], ["墓地"]])
        self.assertTrue(any(error["type"] == "duplicate_key" for error in result.errors))

    def test_missing_reference_in_each_field(self):
        for column in (1, 2, 3):
            with self.subTest(column=column):
                row = ["墓地", None, None, None]
                row[column] = "存在しない施設"
                result = self.convert([row])
                self.assertTrue(any(error["type"] == "unknown_facility_reference" for error in result.errors))

    def test_cycle_and_self_dependency(self):
        for rows in ([["甲", "乙"], ["乙", None, "甲"]], [["甲", "甲"]]):
            result = self.convert(rows)
            self.assertTrue(any(error["type"] == "facility_dependency_cycle" for error in result.errors))

    def test_empty_and_separator_name(self):
        self.assertFalse(self.convert([["村", ""], [None]]).errors)
        result = self.convert([["村/町"]])
        self.assertTrue(any(error["type"] == "invalid_facility_name" for error in result.errors))


if __name__ == "__main__":
    unittest.main()
