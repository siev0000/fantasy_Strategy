import zipfile
import xml.etree.ElementTree as E

ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
with zipfile.ZipFile('output/guardian-trials-final.xlsx') as source:
    book=E.fromstring(source.read('xl/workbook.xml'))
    sheets=book.find('{'+ns+'}sheets');ids=[]
    for sheet in list(sheets):
        if sheet.get('name')!='イベント':sheets.remove(sheet)
        else:ids.append(sheet.get('{'+rel+'}id'))
    names=book.find('{'+ns+'}definedNames')
    if names is not None:book.remove(names)
    relationships=E.fromstring(source.read('xl/_rels/workbook.xml.rels'));targets=set()
    for item in list(relationships):
        if item.get('Type','').endswith('/worksheet'):
            if item.get('Id') not in ids:relationships.remove(item)
            else:
                path=item.get('Target');targets.add(path.lstrip('/') if path.startswith('/') else 'xl/'+path)
    with zipfile.ZipFile('output/guardian-trials-preview.xlsx','w',zipfile.ZIP_DEFLATED) as out:
        for name in source.namelist():
            if name.startswith('xl/worksheets/') and name not in targets:continue
            data=E.tostring(book,encoding='utf-8') if name=='xl/workbook.xml' else E.tostring(relationships,encoding='utf-8') if name=='xl/_rels/workbook.xml.rels' else source.read(name)
            out.writestr(name,data)
