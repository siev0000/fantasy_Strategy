import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';

const wb=await SpreadsheetFile.importXlsx(await FileBlob.load('output/guardian-trials-preview.xlsx'));
for(const [range,name] of [['A18:F20','guardian-event-names'],['N18:Q20','guardian-event-goals']]){
  const preview=await wb.render({sheetName:'イベント',range,scale:1,format:'png'});
  await fs.writeFile(`output/sheet-merge-preview/${name}.png`,new Uint8Array(await preview.arrayBuffer()));
}
