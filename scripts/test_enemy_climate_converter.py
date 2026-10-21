import unittest
from game_data_converter import CellValue, convert_sheet


class Reader:
    def __init__(self, low, high):
        self.low, self.high = low, high

    def sheet_rows(self, _):
        yield 1, {i: CellValue(value=value) for i, value in enumerate(["ID", "最低気温", "最高気温"])}
        yield 2, {i: CellValue(value=value) for i, value in enumerate(["TEST", self.low, self.high])}


class EnemyClimateConverterTests(unittest.TestCase):
    def test_zero_and_blank(self):
        result = convert_sheet(Reader(0, None), "出現敵", "出現敵.json")
        self.assertFalse(result.errors)
        self.assertEqual(result.records[0]["最低気温"], 0)
        self.assertNotIn("最高気温", result.records[0])

    def test_invalid(self):
        for low, high in [(True, 5), ("寒い", 10), (30, 5)]:
            with self.subTest(low=low, high=high):
                self.assertTrue(convert_sheet(Reader(low, high), "出現敵", "出現敵.json").errors)

    def test_specialty_humidity(self):
        class HumidityReader:
            def sheet_rows(self, _):
                yield 1, {i: CellValue(value=value) for i, value in enumerate(["名前", "最低湿潤度", "最高湿潤度"])}
                yield 2, {i: CellValue(value=value) for i, value in enumerate(["試験", 50, 101])}

        result = convert_sheet(HumidityReader(), "特産品", "特産品.json")
        self.assertTrue(any(error["type"] == "invalid_climate_humidity" for error in result.errors))


if __name__ == "__main__":
    unittest.main()
