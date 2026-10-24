import zipfile
import xml.etree.ElementTree as E
from pathlib import PurePosixPath

ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
with zipfile.ZipFile('output/sheet-merge-final.xlsx') as source:
    workbook=E.fromstring(source.read('xl/workbook.xml'))
    sheets=workbook.find('{'+ns+'}sheets')
    ids=[]
    for sheet in list(sheets):
        if sheet.get('name') not in {'用語辞書','国家設定'}:
            sheets.remove(sheet)
        else:
            ids.append(sheet.get('{'+rel+'}id'))
    names=workbook.find('{'+ns+'}definedNames')
    if names is not None:
        workbook.remove(names)
    relationships=E.fromstring(source.read('xl/_rels/workbook.xml.rels'))
    targets=set()
    for item in list(relationships):
        if item.get('Type','').endswith('/worksheet'):
            if item.get('Id') not in ids:
                relationships.remove(item)
            else:
                target=item.get('Target')
                targets.add(target.lstrip('/') if target.startswith('/') else 'xl/'+target)
    with zipfile.ZipFile('output/sheet-merge-preview/preview-source.xlsx','w',zipfile.ZIP_DEFLATED) as result:
        for name in source.namelist():
            if name.startswith('xl/worksheets/') and name not in targets:
                continue
            content=E.tostring(workbook,encoding='utf-8') if name=='xl/workbook.xml' else E.tostring(relationships,encoding='utf-8') if name=='xl/_rels/workbook.xml.rels' else source.read(name)
            result.writestr(name,content)
