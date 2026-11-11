import unittest

from cs_skill_json_converter import parse_data_field, row_to_skill, project_cs_row


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

    def test_poison_burn_and_curse_values(self):
        parsed, _, _ = parse_data_field("毒:30 燃焼:20 呪い:50")
        self.assertEqual(parsed["毒"], 30)
        self.assertEqual(parsed["燃焼"], 20)
        self.assertEqual(parsed["呪い"], 50)

    def test_trigger_name_has_no_time_suffix(self):
        parsed, _, _ = parse_data_field("発動:ターン開始 効果:回復 回復10")
        self.assertEqual(parsed["発動"], "ターン開始")
        self.assertEqual(parsed["回復"], 10)


if __name__ == "__main__":
    unittest.main()


class ReductionConverterTest(unittest.TestCase):
    def test_reduction_keys_and_legacy_input(self):
        for source in ("物理軽減+10 魔法軽減+20 遠隔軽減+30", "物理耐性+10 魔法耐性+20 射撃耐性+30"):
            data, duplicates, unparsed = parse_data_field(source)
            self.assertEqual(data, {"物理軽減":10, "魔法軽減":20, "遠隔軽減":30})
            self.assertFalse(duplicates)
            self.assertFalse(unparsed)

    def test_headers_with_mp_st_do_not_shift_skill_fields(self):
        names = ["Lv","スキル名","ルビ","系統","行動","HP消費","MP消費","ST消費","AP消費","データ","効果","効果説明","取得条件","出力確認","ダブり確認","アニメ"]
        headers = dict(enumerate(names,1))
        values = dict(enumerate([1,"列移動検証","","","A",0,99,88,20,"攻撃手段:素手 物理:50 物理軽減+10","","","",True,"","unarmed"],1))
        record, info = row_to_skill(5, project_cs_row(values,headers), {})
        self.assertEqual(record["AP消費"],20)
        self.assertEqual(record["物理"],50)
        self.assertEqual(record["物理軽減"],10)
        self.assertEqual(record["アニメ"],"unarmed")
        self.assertNotIn("MP消費",record)
        self.assertNotIn("ST消費",record)

    def test_missing_required_header_is_rejected(self):
        with self.assertRaises(ValueError):
            project_cs_row({}, {1:"Lv",2:"スキル名"})
