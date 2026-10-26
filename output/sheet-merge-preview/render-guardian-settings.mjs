import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';

const wb=await SpreadsheetFile.importXlsx(await FileBlob.load('output/guardian-settings-preview.xlsx'));
for(const [range,name] of [['G1:H5','guardian-settings-candidates'],['I1:N5','guardian-settings-values']]){
  const preview=await wb.render({sheetName:'勝利対象土地',range,scale:1,format:'png'});
  await fs.writeFile(`output/sheet-merge-preview/${name}.png`,new Uint8Array(await preview.arrayBuffer()));
}
