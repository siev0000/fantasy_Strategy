import json
import re
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
import xml.etree.ElementTree as ET

sys.path.insert(0, 'scripts')
from game_data_converter import XlsxReader, SHEET_TO_JSON

root = Path('.')
path = root / 'output/sheet-audit-source.xlsx'
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
report = {'sheets': [], 'cross_sheet_references': [], 'dynamic_formulas': [], 'defined_names': []}
with XlsxReader(path) as reader, zipfile.ZipFile(path) as archive:
    names = list(reader.sheet_targets)
    for name in names:
        rows = list(reader.sheet_rows(name))
        used = [(i, {col: c for col, c in cells.items() if c.value not in (None, '') or c.formula}) for i, cells in rows]
        used = [(i, cells) for i, cells in used if cells]
        formulas = []
        for i, cells in used:
            for col, cell in cells.items():
                if not cell.formula:
                    continue
                formulas.append({'row': i, 'column': col, 'formula': cell.formula})
                for target in names:
                    if f"'{target.replace(chr(39), chr(39)*2)}'!" in cell.formula or re.search(r'(?<![\w])' + re.escape(target) + r'!', cell.formula):
                        report['cross_sheet_references'].append({'from': name, 'to': target, 'row': i, 'column': col, 'formula': cell.formula})
                if re.search(r'INDIRECT|IMPORTRANGE|#REF!', cell.formula, re.I):
                    report['dynamic_formulas'].append({'sheet': name, **formulas[-1]})
        output = SHEET_TO_JSON.get(name, 'スキル一覧.json' if name == 'CS' else None)
        runtime = root / 'data/source/export/json' / (output or 'NO_OUTPUT')
        data = json.loads(runtime.read_text(encoding='utf-8-sig')) if runtime.exists() else None
        item = {'name': name, 'populated_rows': len(used), 'max_row': max((i for i, _ in used), default=0),
                'max_column_count': max((max(cells)+1 for _, cells in used), default=0), 'formula_count': len(formulas),
                'output': output, 'runtime_records': len(data) if isinstance(data, list) else None,
                'preview': [{'row': i, 'cells': {col: c.value for col, c in cells.items() if col <= 10}} for i, cells in used[:6]],
                'formula_samples': formulas[:4]}
        report['sheets'].append(item)
    for entry in archive.namelist():
        if not entry.endswith('.xml'):
            continue
        xml = ET.fromstring(archive.read(entry))
        if entry == 'xl/workbook.xml':
            report['defined_names'] = [{'name': e.get('name'), 'value': e.text} for e in xml.findall('.//m:definedName', ns)]
        # Validation rules and chart formulas can depend on tabs without cell formulas.
        for element in xml.iter():
            if element.tag.split('}')[-1] not in {'formula1', 'formula2', 'definedName', 'f'} or not element.text:
                continue
            if entry.startswith('xl/worksheets/') and element.tag.split('}')[-1] == 'f':
                continue
            for name in names:
                if f"'{name}'!" in element.text or re.search(r'(?<![\w])'+re.escape(name)+r'!',element.text):
                    report.setdefault('other_xml_references', []).append({'xml': entry, 'type': element.tag.split('}')[-1], 'target': name, 'expression': element.text})

references = defaultdict(list)
for base in ['frontend/src', 'web', 'scripts', 'config']:
    for file in (root / base).rglob('*'):
        if file.suffix not in {'.js', '.mjs', '.vue', '.ts', '.py', '.json', '.html'}:
            continue
        if any(part in {'node_modules', '__pycache__'} for part in file.parts):
            continue
        text = file.read_text(encoding='utf-8-sig', errors='replace')
        for i, line in enumerate(text.splitlines(), 1):
            for name in names:
                if re.search(r'(?:getGameDataRows|getGameDataTable|getRegistryDataRows|findGameDataRow)\(\s*[\'\"]' + re.escape(name) + r'[\'\"]', line) or name+'.json' in line:
                    references[name].append({'path': file.as_posix(), 'line': i, 'text': line.strip()[:230]})
report['code_references'] = dict(references)
target = root / 'output/sheet-audit-evidence.json'
target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
for item in report['sheets']:
    print(json.dumps({k: item[k] for k in ['name', 'populated_rows', 'max_row', 'max_column_count', 'formula_count', 'output', 'runtime_records']}, ensure_ascii=False))
edges=Counter((e['from'], e['to']) for e in report['cross_sheet_references'])
print('FORMULA EDGES', json.dumps([[a,b,c] for (a,b),c in edges.items()], ensure_ascii=False))
print('DYNAMIC', len(report['dynamic_formulas']), 'NAMES', len(report['defined_names']), 'OTHER', len(report.get('other_xml_references', [])))
