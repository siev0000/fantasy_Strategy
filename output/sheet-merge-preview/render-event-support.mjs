import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';

const wb=await SpreadsheetFile.importXlsx(await FileBlob.load('output/events-guardians-preview.xlsx'));
for(const [range,name] of [['A21:F24','event-support-names'],['N21:S24','event-support-goals']]){
  const preview=await wb.render({sheetName:'イベント',range,scale:1,format:'png'});
  await fs.writeFile(`output/sheet-merge-preview/${name}.png`,new Uint8Array(await preview.arrayBuffer()));
}
