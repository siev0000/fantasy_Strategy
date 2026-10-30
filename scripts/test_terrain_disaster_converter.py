import unittest
from types import SimpleNamespace
from game_data_converter import validate_terrain_disasters, validate_dynamic_disasters


class TerrainDisasterValidation(unittest.TestCase):
    def test_facility_damage_multiplier(self):
        for value in (0, 1, 0.5):
            result = SimpleNamespace(records=[{"災害詳細設定": {"facilityDamageMultiplier": value}}], errors=[])
            validate_dynamic_disasters(result)
            self.assertEqual(result.errors, [])
        for value in (-1, "1", True, float('inf')):
            result = SimpleNamespace(records=[{"災害詳細設定": {"facilityDamageMultiplier": value}}], errors=[])
            validate_dynamic_disasters(result)
            self.assertTrue(result.errors)

    def test_wind_following(self):
        for detail in ({"followWind": True, "windTurnSteps": 1}, {"followWind": False, "windTurnSteps": 0}):
            result = SimpleNamespace(records=[{"災害詳細設定": detail}], errors=[])
            validate_dynamic_disasters(result)
            self.assertEqual(result.errors, [])
        for detail in ({"followWind": 1}, {"windTurnSteps": 4}, {"windTurnSteps": 1.5}, {"windTurnSteps": True}):
            result = SimpleNamespace(records=[{"災害詳細設定": detail}], errors=[])
            validate_dynamic_disasters(result)
            self.assertTrue(result.errors)

    def test_movement_impediment(self):
        good = {"power": 100, "reductionPerPower": .005, "edgeMultiplier": .5, "flightMultiplier": 2, "maximumReduction": .9}
        result = SimpleNamespace(records=[{"災害詳細設定": {"movementImpediment": good}}], errors=[])
        validate_dynamic_disasters(result)
        self.assertEqual(result.errors, [])
        for value in ({}, None, {**good, "power": -1}, {**good, "edgeMultiplier": 2}, {**good, "flightMultiplier": .5}, {**good, "maximumReduction": 1}, {**good, "power": True}, {**good, "reductionPerPower": float('nan')}):
            result = SimpleNamespace(records=[{"災害詳細設定": {"movementImpediment": value}}], errors=[])
            validate_dynamic_disasters(result)
            self.assertTrue(result.errors, value)

    def test_fog_penalty_flag(self):
        for value in (True, False):
            result = SimpleNamespace(records=[{"災害詳細設定": {"fogPenalty": value}}], errors=[])
            validate_dynamic_disasters(result)
            self.assertEqual(result.errors, [])
        for value in (1, "true", None):
            result = SimpleNamespace(records=[{"災害詳細設定": {"fogPenalty": value}}], errors=[])
            validate_dynamic_disasters(result)
            self.assertTrue(result.errors)

    def test_components_and_knockback(self):
        valid = {"damageComponents": [{"element": "打撃", "weight": 1}, {"element": "切断", "weight": 1}],
                 "knockback": {"resistanceKey": "怯み耐性", "powerPerTile": 50, "maximumDistance": 3}}
        result = SimpleNamespace(records=[{"災害詳細設定": valid}], errors=[])
        validate_dynamic_disasters(result)
        self.assertEqual(result.errors, [])
        with_direction = {**valid, "knockback": {**valid["knockback"], "direction": "random"}}
        result = SimpleNamespace(records=[{"災害詳細設定": with_direction}], errors=[])
        validate_dynamic_disasters(result)
        self.assertEqual(result.errors, [])
        for detail in ({"damageComponents": []}, {"damageComponents": [{"element": "打撃", "weight": -1}]},
                       {"knockback": {**valid["knockback"], "maximumDistance": 1.5}},
                       {"knockback": {**valid["knockback"], "powerPerTile": 0}},
                       {"knockback": {**valid["knockback"], "resistanceKey": "体勢"}},
                       {"knockback": {**valid["knockback"], "direction": "typo"}}):
            result = SimpleNamespace(records=[{"災害詳細設定": detail}], errors=[])
            validate_dynamic_disasters(result)
            self.assertTrue(result.errors, detail)

    def test_dynamic_disasters(self):
        for detail in ({"movement": "coast", "stepsPerTurn": 1, "maximumHeight": 1}, {}):
            result = SimpleNamespace(records=[{"災害詳細設定": detail}], errors=[])
            validate_dynamic_disasters(result)
            self.assertEqual(result.errors, [])
        for detail in ("{}", {"movement": "typo"}, {"stepsPerTurn": 50}, {"rangedAccuracyMultiplier": 2}, {"typo": 1}):
            result = SimpleNamespace(records=[{"災害詳細設定": detail}], errors=[])
            validate_dynamic_disasters(result)
            self.assertTrue(result.errors)

    def test_power_and_radius_settings(self):
        good = {"powerRange": {"minimum": 140, "maximum": 250, "humidityMinimum": 65, "humidityMaximum": 100}, "magicPower": 200, "maximumRadius": 4, "radiusGrowthPerTurn": 1, "radiusDecayPerTurn": 1}
        result = SimpleNamespace(records=[{"災害詳細設定": good}], errors=[])
        validate_dynamic_disasters(result)
        self.assertEqual(result.errors, [])
        for change in ({"powerRange": {}}, {"maximumRadius": 100}, {"radiusGrowthPerTurn": .5}, {"radiusDecayPerTurn": .5}, {"radiusDecayPerTurn": -1}, {"radiusDecayPerTurn": True}, {"radiusDecayPerTurn": 11}, {"powerRange": {**good["powerRange"], "humidityMaximum": 65}}):
            result = SimpleNamespace(records=[{"災害詳細設定": {**good, **change}}], errors=[])
            validate_dynamic_disasters(result)
            self.assertTrue(result.errors)

    def test_valid_and_invalid_definitions(self):
        row = {"ID": "test", "地形災害処理": "地形破壊", "発生方法": "攻撃",
               "攻撃発生属性": "物理/打撃", "威力軽減": 50, "地形耐久": 100,
               "地形被害倍率": 1, "高度低下": 1, "対象地形": "丘陵", "有効": True}
        result = SimpleNamespace(records=[row], errors=[])
        validate_terrain_disasters(result)
        self.assertEqual(result.errors, [])
        for key, value in (("地形耐久", 0), ("高度低下", 0.5), ("発生方法", "自然"),
                           ("地形災害処理", "typo"), ("威力軽減", "")):
            result = SimpleNamespace(records=[{**row, key: value}], errors=[])
            validate_terrain_disasters(result)
            self.assertTrue(result.errors, key)
        result = SimpleNamespace(records=[row, {**row, "ID": "duplicate"}], errors=[])
        validate_terrain_disasters(result)
        self.assertTrue(result.errors)


if __name__ == '__main__':
    unittest.main()
