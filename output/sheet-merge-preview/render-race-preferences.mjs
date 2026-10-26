import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';

const wb=await SpreadsheetFile.importXlsx(await FileBlob.load('output/race-preferences-preview.xlsx'));
for(const [range,name] of [['A1:A12','race-preference-names'],['Q1:R12','race-preference-values']]){
  const preview=await wb.render({sheetName:'種族',range,scale:1,format:'png'});
  await fs.writeFile(`output/sheet-merge-preview/${name}.png`,new Uint8Array(await preview.arrayBuffer()));
}
