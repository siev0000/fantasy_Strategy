import unittest

from cs_skill_json_converter import parse_data_field, row_to_skill


class SkillTriggerConverterTest(unittest.TestCase):
    def test_trigger_token_is_preserved(self):
        record, info = row_to_skill(4, {
            1: 1, 2: "流血の刃（検証）", 5: "P",
            8: "発動:被出血付与 条件:原因_攻撃 効果:反撃_出血値_切断 対象:攻撃者 判定:HP",
        }, {})
        self.assertIsNotNone(record, info)
        self.assertEqual(record["発動"], "被出血付与")
        self.assertEqual(record["効果"], "反撃_出血値_切断")
        self.assertEqual(record["対象"], "攻撃者")
        self.assertEqual(record["判定"], "HP")

    def test_trigger_name_has_no_time_suffix(self):
        parsed, _, _ = parse_data_field("発動:ターン開始 効果:回復 回復10")
        self.assertEqual(parsed["発動"], "ターン開始")
        self.assertEqual(parsed["回復"], 10)


if __name__ == "__main__":
    unittest.main()
