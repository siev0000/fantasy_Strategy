import unittest
from game_data_converter import CellValue, convert_sheet, SHEET_TO_JSON


class Reader:
    def __init__(self, names):
        self.names = names

    def sheet_rows(self, _):
        yield 1, {i: CellValue(value=value) for i, value in enumerate(['性格', '一人称', '交渉開始'])}
        for index, name in enumerate(self.names, 2):
            yield index, {i: CellValue(value=value) for i, value in enumerate([name, '我', '何用だ。\n申せ。'])}


class ConversationPersonalityConverterTests(unittest.TestCase):
    def test_current_sheet_only_and_multiline(self):
        self.assertEqual(SHEET_TO_JSON['性格会話'], '性格会話.json')
        result = convert_sheet(Reader(['尊大']), '性格会話', '性格会話.json')
        self.assertFalse(result.errors)
        self.assertEqual(result.records, [{'性格': '尊大', '一人称': '我', '交渉開始': '何用だ。\n申せ。'}])

    def test_duplicate_personality_rejected(self):
        result = convert_sheet(Reader(['尊大', '尊大']), '性格会話', '性格会話.json')
        self.assertTrue(result.errors)


if __name__ == '__main__':
    unittest.main()
