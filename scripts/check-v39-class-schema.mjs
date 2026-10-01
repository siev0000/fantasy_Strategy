import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

// frontend/src/lib/v39-class-rules.js の V39_BASE_CLASS_NAMES と一致させる。
const expectedBaseClassNames = [
  "ファイター", "ナイト", "フェンサー", "モンク", "シーフ", "レンジャー",
  "アーチャー", "ウィザード", "アルケミスト", "クレリック", "パラディン", "ドルイド"
];

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.getGameDataRows === "function" && typeof window.validateGameDataRegistry === "function");
  const report = await page.evaluate((baseClassNames) => {
    const text = value => String(value ?? "").trim();
    const rows = window.getGameDataRows("クラス");
    const professions = rows.filter(row => text(row?.名前) && (text(row?.種類) === "職業" || text(row?.種類).endsWith("系")));
    const baseClassNameSet = new Set(baseClassNames);
    const initial = professions.filter(row => baseClassNameSet.has(text(row?.名前)));
    const validation = window.validateGameDataRegistry();
    const validationErrorGroups = Object.entries(validation.issues
      .filter(issue => issue.level === "error")
      .reduce((groups, issue) => {
        const key = `${issue.table}:${issue.type}:${issue.field || "-"}`;
        groups[key] = (groups[key] || 0) + 1;
        return groups;
      }, {}));
    const validationWarningGroups = Object.entries(validation.issues
      .filter(issue => issue.level === "warning")
      .reduce((groups, issue) => {
        const key = `${issue.table}:${issue.type}:${issue.field || "-"}`;
        groups[key] = (groups[key] || 0) + 1;
        return groups;
      }, {}));
    return {
      rawClassRows:window.getGameDataTable("クラス")?.length || 0,
      runtimeClassRows:rows.length,
      professionRows:professions.length,
      initialClassNames:initial.map(row => text(row?.名前)),
      validationErrors:validation.errorCount,
      validationWarnings:validation.warningCount,
      validationErrorGroups,
      validationWarningGroups,
      missingTypeNames:validation.issues
        .filter(issue => issue.type === "missing-required" && issue.table === "クラス" && issue.field === "種類")
        .map(issue => text(issue.recordId).replace(/^クラス:/, ""))
    };
  }, expectedBaseClassNames);
  console.log(JSON.stringify({ report, errors }, null, 2));
  if (
    errors.length
    || report.validationErrors !== 0
    || report.rawClassRows <= report.runtimeClassRows
    || JSON.stringify(report.initialClassNames) !== JSON.stringify(expectedBaseClassNames)
  ) process.exitCode = 1;
} finally {
  await browser.close();
}
