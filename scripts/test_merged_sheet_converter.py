import unittest

from game_data_converter import CellValue, MERGED_SHEET_TABLES, convert_sheet, expand_selected_tables
from cs_skill_json_converter import load_effect_descriptions


class Reader:
    def __init__(self, tables):
        self.tables = tables
        self.sheet_targets = dict.fromkeys(tables)

    def sheet_rows(self, name):
        yield from self.tables[name]


def cells(values):
    return {i: CellValue(value=value) for i, value in values.items()}


class MergedSheetTests(unittest.TestCase):
    def test_dictionary_tables_do_not_leak(self):
        reader = Reader({'用語辞書': [
            (1, cells({0:'追加効果',1:'説明',3:'技能名',4:'説明',6:'範囲タイプ',7:'説明',8:'処理タイプ'})),
            (2, cells({0:'連鎖',1:'効果説明',3:'交渉',4:'技能説明',6:'単体',7:'範囲説明',8:'single'})),
            (3, cells({0:'燃焼',1:'燃える'}))]})
        for name, expected in [
            ('効果',[{'追加効果':'連鎖','説明':'効果説明'},{'追加効果':'燃焼','説明':'燃える'}]),
            ('説明',[{'技能名':'交渉','説明':'技能説明'}]),
            ('範囲',[{'範囲タイプ':'単体','説明':'範囲説明','処理タイプ':'single'}])]:
            with self.subTest(name=name):
                result = convert_sheet(reader, name, name+'.json')
                self.assertFalse(result.errors)
                self.assertEqual(result.records, expected)

    def test_nation_schema_zero_negative_and_save_keys(self):
        reader = Reader({'国家設定': [
            (1,cells({0:'項目カテゴリ',1:'項目名',2:'幸福度',26:'項目カテゴリ',27:'項目名',28:'幸福度',36:'項目名',37:'幸福度'})),
            (2,cells({0:'信仰',1:'光の神',2:0,26:'外交姿勢',27:'孤立主義',28:-0.15,36:'暗部',37:0}))]})
        for name, expected in [('体制',{'項目カテゴリ':'信仰','項目名':'光の神','幸福度':0}),
                               ('外交姿勢',{'項目カテゴリ':'外交姿勢','項目名':'孤立主義','幸福度':-0.15}),
                               ('組織',{'項目名':'暗部','幸福度':0})]:
            result=convert_sheet(reader,name,name+'.json')
            self.assertFalse(result.errors)
            self.assertEqual(result.records,[expected])

    def test_merged_source_wins_over_legacy_tab(self):
        reader=Reader({'用語辞書':[(1,cells({0:'追加効果',1:'説明'})),(2,cells({0:'新',1:'説明'}))],
                       '効果':[(1,cells({0:'追加効果'})),(2,cells({0:'旧'}))]})
        self.assertEqual(convert_sheet(reader,'効果','効果.json').records,[{'追加効果':'新','説明':'説明'}])

    def test_legacy_workbook_remains_readable(self):
        reader=Reader({'効果':[(1,cells({0:'追加効果',1:'説明'})),(2,cells({0:'連鎖',1:'旧説明'}))]})
        self.assertEqual(convert_sheet(reader,'効果','効果.json').records,[{'追加効果':'連鎖','説明':'旧説明'}])

    def test_invalid_header_is_an_error_not_an_empty_export(self):
        reader=Reader({'用語辞書':[(1,cells({3:'名前'})),(2,cells({3:'交渉'}))]})
        with self.assertRaisesRegex(ValueError,'必須ヘッダー'):
            convert_sheet(reader,'説明','説明.json')

    def test_duplicate_and_formula_cache_validation_still_run(self):
        reader=Reader({'用語辞書':[(1,cells({0:'追加効果',1:'説明'})),(2,cells({0:'連鎖'})),(3,cells({0:'連鎖'}))]})
        self.assertTrue(convert_sheet(reader,'効果','効果.json').errors)
        reader.tables['用語辞書'][2]=(3,{0:CellValue(value='燃焼'),1:CellValue(formula='1+1',has_cached_value=False)})
        self.assertTrue(convert_sheet(reader,'効果','効果.json').errors)

    def test_tab_alias_expansion(self):
        self.assertEqual(expand_selected_tables(['用語辞書','国家設定','効果']),list(MERGED_SHEET_TABLES))

    def test_skill_converter_uses_dictionary_effect_section_only(self):
        # The CS reader uses 1-based columns, unlike the normal converter.
        class SkillReader(Reader):
            def sheet_rows(self,name):
                for row, values in super().sheet_rows(name):
                    yield row,{col+1:cell.value for col,cell in values.items()}
        reader=SkillReader({'用語辞書':[(1,cells({0:'追加効果',1:'説明',3:'技能名',4:'説明'})),
                                          (2,cells({0:'連鎖',1:'効果説明',3:'交渉',4:'技能説明'}))]})
        self.assertEqual(load_effect_descriptions(reader,'効果'),{'連鎖':'効果説明'})


if __name__ == '__main__':
    unittest.main()
