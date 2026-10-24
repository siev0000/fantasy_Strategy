import fs from 'node:fs/promises';
import {FileBlob, SpreadsheetFile} from '@oai/artifact-tool';

const wb=await SpreadsheetFile.importXlsx(await FileBlob.load('output/sheet-merge-preview/preview-source.xlsx'));
if(process.argv.includes('--help')) {
  console.log(wb.help('render',{include:'index,examples,notes',maxChars:6000}).ndjson);
} else {
  for(const [sheetName,range,label] of [['用語辞書','A1:I10','dictionary'],['国家設定','AA1:AN6','nation-options'],['国家設定','A1:F14','nation-government']]) {
    const preview=await wb.render({sheetName,range,scale:1,format:'png'});
    await fs.writeFile(`output/sheet-merge-preview/${label}.png`,new Uint8Array(await preview.arrayBuffer()));
  }
}
