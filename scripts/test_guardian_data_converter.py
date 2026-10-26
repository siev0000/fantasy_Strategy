import unittest
from types import SimpleNamespace
from unittest.mock import patch
from game_data_converter import validate_guardian_landmarks


class GuardianDataTests(unittest.TestCase):
    def check(self, **changes):
        row = {"ID":"land", "守護者候補":[{"name":"白虎", "race":"タイガー", "className":"神獣", "unique":True}],
               "配下候補":[{"race":"タイガー", "className":"タイガー"}], "守護者Lv":40, "配下数":2,
               "配下Lv差":20, "配下Lv幅":5, "守護範囲":3, "試練ID":["A", "B", "C"], **changes}
        cells = lambda values:{index:SimpleNamespace(value=value) for index,value in enumerate(values)}
        reader = SimpleNamespace(sheet_rows=lambda name:iter([(1,cells(["ID","分類","状態"])),
            *[(index+2,cells([name,"守護者","有効"])) for index,name in enumerate(["A","B","C"])]]))
        result = SimpleNamespace(records=[row], errors=[])
        with patch("game_data_converter.convert_sheet", return_value=SimpleNamespace(records=[{"名前":name} for name in ["タイガー","神獣"]])):
            validate_guardian_landmarks(reader, result)
        return result.errors

    def test_valid(self):
        self.assertEqual(self.check(), [])

    def test_class_references(self):
        self.assertTrue(self.check(配下候補=[{"race":"未登録", "className":"タイガー"}]))

    def test_trials(self):
        self.assertTrue(self.check(試練ID=["A","B","UNKNOWN"]))
        self.assertTrue(self.check(試練ID=["A","A","B"]))
        self.assertTrue(self.check(守護者候補=[{"name":"白虎", "race":"タイガー", "className":"神獣", "unique":True, "trialIds":["A","B","UNKNOWN"]}]))

    def test_numeric_and_unique(self):
        self.assertTrue(self.check(配下数=-1))
        self.assertTrue(self.check(守護者Lv=True))
        self.assertTrue(self.check(守護者候補=[{"name":"白虎", "race":"タイガー", "className":"神獣", "unique":"true"}]))


if __name__ == "__main__":
    unittest.main()
