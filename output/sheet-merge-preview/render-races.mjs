import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';

const wb=await SpreadsheetFile.importXlsx(await FileBlob.load('output/race-unification-preview.xlsx'));
for(const [range,name] of [['A1:D12','race-names'],['I1:P12','race-settings']]){
  const preview=await wb.render({sheetName:'種族',range,scale:1,format:'png'});
  await fs.writeFile(`output/sheet-merge-preview/${name}.png`,new Uint8Array(await preview.arrayBuffer()));
}
