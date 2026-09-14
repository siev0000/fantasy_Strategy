import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data", "source", "export", "json");
const sourceDir = path.join(root, "frontend", "src");
const outputPath = path.join(root, "artifacts", "game-data-usage-report.json");
const definitionOnlyTables = new Set(["効果", "災害", "都市基本データ"]);
const provisionalTables = new Set(["都市"]);

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes:true });
  const nested = await Promise.all(entries.map(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(fullPath) : [fullPath];
  }));
  return nested.flat();
}

const sourceFiles = (await filesBelow(sourceDir)).filter(file => /\.(?:js|mjs|vue|html)$/.test(file));
const sourceText = (await Promise.all(sourceFiles.map(file => readFile(file, "utf8")))).join("\n");
const jsonFiles = (await readdir(dataDir)).filter(file => file.endsWith(".json")).sort((a, b) => a.localeCompare(b, "ja"));
const tables = [];

for (const file of jsonFiles) {
  const table = file.replace(/\.json$/i, "");
  const jsonText = (await readFile(path.join(dataDir, file), "utf8")).replace(/^\uFEFF/, "");
  const value = JSON.parse(jsonText);
  const rows = Array.isArray(value) ? value : [value];
  const fields = [...new Set(rows.flatMap(row => row && typeof row === "object" ? Object.keys(row) : []))];
  const fieldStatus = fields.map(field => {
    const literalUsed = sourceText.includes(field);
    const status = literalUsed
      ? "参照あり"
      : definitionOnlyTables.has(table) || provisionalTables.has(table)
        ? "予約・定義のみ"
        : "未接続候補";
    return { field, status };
  });
  tables.push({
    table,
    recordCount:rows.length,
    fields:fieldStatus,
    referencedCount:fieldStatus.filter(row => row.status === "参照あり").length,
    reservedCount:fieldStatus.filter(row => row.status === "予約・定義のみ").length,
    unconnectedCount:fieldStatus.filter(row => row.status === "未接続候補").length
  });
}

const report = {
  generatedAt:new Date().toISOString(),
  note:"文字列参照による静的監査。未接続候補は実装確認が必要で、未使用確定を意味しない。",
  tableCount:tables.length,
  fieldCount:tables.reduce((sum, table) => sum + table.fields.length, 0),
  referencedCount:tables.reduce((sum, table) => sum + table.referencedCount, 0),
  reservedCount:tables.reduce((sum, table) => sum + table.reservedCount, 0),
  unconnectedCount:tables.reduce((sum, table) => sum + table.unconnectedCount, 0),
  tables
};

await mkdir(path.dirname(outputPath), { recursive:true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  output:path.relative(root, outputPath),
  tableCount:report.tableCount,
  fieldCount:report.fieldCount,
  referencedCount:report.referencedCount,
  reservedCount:report.reservedCount,
  unconnectedCount:report.unconnectedCount,
  unconnectedByTable:tables.filter(table => table.unconnectedCount).map(table => ({ table:table.table, count:table.unconnectedCount }))
}, null, 2));
