import unittest
import tempfile
import contextlib
import io
from pathlib import Path
from unittest.mock import patch
from game_data_converter import CellValue, RACE_TABLE_COLUMNS, convert_sheet, validate_unified_race_table, source_sheet_name, main


HEADERS=list(dict.fromkeys(RACE_TABLE_COLUMNS.values()))


class Reader:
    def __init__(self, records):
        self.records=records
        self.sheet_targets={'種族':None,'クラス':None}

    def sheet_rows(self,name):
        if name=='クラス':
            fields=['名前','HP','攻撃','防御','魔力','精神','命中','速度','SIZ']
            yield 1,{i:CellValue(value=key) for i,key in enumerate(fields)}
            yield 2,{i:CellValue(value=value) for i,value in enumerate(['ヒューマン',75,70,70,25,70,70,70,100])}
            return
        yield 1,{i:CellValue(value=h) for i,h in enumerate(HEADERS)}
        for number,record in enumerate(self.records,2):
            yield number,{i:CellValue(value=record.get(h)) for i,h in enumerate(HEADERS)}


def ready(**extra):
    return {'種族':'只人','能力クラス':'ヒューマン','使用可':True,'旧名称':'["人間"]',
            '画像':'/image.webp','概要':'概要','詳細':'詳細','特徴':'["万能"]',
            'マーカー文字':'只','マーカー色':'#3e5d84','初期人数':50,'高さ':0,'ヒーロー':1,'軍隊':0.15,'土地':'平地',**extra}


class UnifiedRaceTests(unittest.TestCase):
    def test_single_source_projects_both_tables(self):
        reader=Reader([ready()]);validate_unified_race_table(reader)
        race=convert_sheet(reader,'種族','種族.json').records[0]
        faction=convert_sheet(reader,'勢力','勢力.json').records[0]
        self.assertEqual(source_sheet_name(reader,'勢力'),'種族')
        self.assertEqual((race['key'],race['name'],faction['種族']),('只人',)*3)
        self.assertEqual((race['className'],faction['カナ']),('ヒューマン',)*2)
        self.assertEqual(race['旧名称'],['人間'])
        self.assertEqual(race['高さ'],0)
        self.assertTrue(race['使用可'])

    def test_incomplete_rows_preserved_but_disabled(self):
        reader=Reader([{'種族':'ドワーフ','能力クラス':'ドワーフ','使用可':False,'設定メモ':'未設定'}])
        validate_unified_race_table(reader)
        self.assertFalse(convert_sheet(reader,'種族','種族.json').records[0]['使用可'])
        self.assertFalse(convert_sheet(reader,'勢力','勢力.json').records[0]['使用可'])

    def test_enabled_missing_values_rejected(self):
        for key in ('高さ','初期人数','画像','概要','詳細','特徴','マーカー色','土地'):
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_unified_race_table(Reader([ready(**{key:None})]))

    def test_unknown_class_flag_and_invalid_numeric_rejected(self):
        for extra in ({'能力クラス':'不明'},{'使用可':'TRUE'},{'初期人数':0},{'高さ':-1},{'高さ':1.5},
                      {'軍隊':True},{'ヒーロー':float('nan')},{'旧名称':'人間'},{'旧名称':'{}'},{'特徴':'[1]'},{'種族':''},{'マーカー色':'red'}):
            with self.subTest(extra=extra),self.assertRaises(ValueError):
                validate_unified_race_table(Reader([ready(**extra)]))

    def test_duplicate_names_and_ambiguous_aliases_rejected(self):
        for second in (ready(),ready(種族='エルフ',旧名称='["人間"]'),ready(種族='人間',旧名称='[]')):
            with self.subTest(second=second),self.assertRaises(ValueError):
                validate_unified_race_table(Reader([ready(),second]))

    def test_cli_reports_sources_before_closing_workbook(self):
        class ContextReader(Reader):
            def __init__(self,path):
                super().__init__([ready()]);self.closed=False
            def __enter__(self):return self
            def __exit__(self,*args):self.closed=True
            def sheet_rows(self,name):
                if self.closed:raise AssertionError('Reader used after close')
                yield from super().sheet_rows(name)
        with tempfile.TemporaryDirectory() as directory, patch('game_data_converter.XlsxReader',ContextReader), contextlib.redirect_stdout(io.StringIO()):
            target=Path(directory)
            source=target/'source.xlsx';source.touch()
            with patch('sys.argv',['converter.py','--input',str(source),'--sheet','種族','--output-dir',str(target/'json'),'--report',str(target/'report.json')]):
                result=main()
            self.assertEqual(result,0)
            self.assertTrue((target/'json/種族.json').exists())
            self.assertTrue((target/'json/勢力.json').exists())


if __name__=='__main__':
    unittest.main()
