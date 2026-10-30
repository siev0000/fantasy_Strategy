import unittest
from types import SimpleNamespace
from game_data_converter import validate_facility_references


class WallEffectsTest(unittest.TestCase):
    def test_nonnegative_numeric_fields(self):
        for field in ("味方通行AP増加率", "内壁幸福度低下", "内壁幸福度低下上限"):
            for value in (-1, True, "25%", float("nan"), float("inf")):
                result = SimpleNamespace(records=[{"施設名": "防壁", field: value}], errors=[])
                validate_facility_references(result)
                self.assertTrue(any(error["type"] == "invalid_wall_effect" for error in result.errors))
            for value in (0, 1, 0.5, 25):
                result = SimpleNamespace(records=[{"施設名": "防壁", field: value}], errors=[])
                validate_facility_references(result)
                self.assertEqual(result.errors, [])


if __name__ == "__main__":
    unittest.main()
