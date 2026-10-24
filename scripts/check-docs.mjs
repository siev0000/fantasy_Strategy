import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const docs = path.join(root, 'docs');
const slash = value => value.split(path.sep).join('/');
function walk(folder) {
  return fs.readdirSync(folder, {withFileTypes: true}).flatMap(entry => {
    const target = path.join(folder, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}
const files = walk(docs).sort((a, b) => slash(a).localeCompare(slash(b), 'ja'));
const relative = file => slash(path.relative(docs, file));
const labels = {
  '.': '入口・共通ルール', 'rules/units': 'ユニット・戦闘',
  'rules/world': 'フィールド・環境', 'rules/economy': '施設・資源・物流',
  'rules/diplomacy': '勢力・交流', 'rules/ui': '画面・操作',
  development: '開発手順', tests: '検証手順', tasks: '分野別タスク',
  design: '設計・検討案', references: '参考資料・素材',
  'references/assets': '参考画像・HTML', history: '履歴'
};
const groups = new Map(Object.keys(labels).map(key => [key, []]));
for (const file of files) {
  if (relative(file) === 'INDEX.md') continue;
  const dir = slash(path.dirname(relative(file)));
  const group = dir.startsWith('history/') ? 'history' : dir;
  if (!groups.has(group)) throw new Error(`Unclassified docs folder: ${dir}`);
  groups.get(group).push(file);
}
const lines = [
  '# 文書一覧', '',
  '[入口](README.md) / [文書運用ルール](DOCUMENTATION_RULES.md)', '',
  'この一覧は `npm run docs:index` で生成する。手作業で追記せず、各ファイルを更新する。',
  '`rules/` の暫定・未実装節と、設計案・履歴を区別して読む。', ''
];
for (const [group, entries] of groups) {
  if (!entries.length) continue;
  lines.push(`## ${labels[group]}`, '');
  for (const file of entries) {
    const name = relative(file);
    const heading = name.endsWith('.md')
      ? fs.readFileSync(file, 'utf8').match(/^#\s+(.+)$/m)?.[1]?.trim()
      : null;
    const title = (heading || path.basename(file)).replace(/[\[\]]/g, '');
    const link = name.split('/').map(segment => encodeURIComponent(segment)).join('/');
    // Parentheses in Japanese filenames must not terminate a Markdown link.
    lines.push(`- [${title}](${link.replaceAll('(', '%28').replaceAll(')', '%29')}) : \`${name}\``);
  }
  lines.push('');
}
const expected = lines.join('\n');
const indexFile = path.join(docs, 'INDEX.md');
if (process.argv.includes('--write-index')) fs.writeFileSync(indexFile, expected, 'utf8');
const errors = [];
const warnings = [];
// These original reference-only placeholders never had accompanying assets.
const referencePlaceholders = new Set(['references/assets/test.html:icon1.png', 'references/assets/test.html:icon2.png']);
if (!fs.existsSync(indexFile) || fs.readFileSync(indexFile, 'utf8').replace(/\r\n/g, '\n') !== expected) {
  errors.push('docs/INDEX.md is stale. Run npm run docs:index.');
}

function checkLink(file, raw, offset, source) {
  const target = raw.trim().replace(/^<|>$/g, '').split(/\s+["']/)[0];
  if (!target || /^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) return;
  let decoded;
  try { decoded = decodeURIComponent(target.split(/[?#]/)[0]); }
  catch { errors.push(`${relative(file)}: malformed link ${target}`); return; }
  if (!decoded) return;
  const resolved = path.resolve(path.dirname(file), decoded);
  if (fs.existsSync(resolved)) return;
  if (referencePlaceholders.has(`${relative(file)}:${decoded}`)) {
    warnings.push(`Reference placeholder (not a game asset): ${relative(file)} -> ${decoded}`);
    return;
  }
  const line = source.slice(0, offset).split('\n').length;
  errors.push(`${relative(file)}:${line}: missing ${decoded}`);
}
const checkFiles = [...files.filter(file => /\.(?:md|html)$/i.test(file)), path.join(root, 'AGENTS.md')];
for (const file of checkFiles) {
  // Examples in code fences are not document links.
  const source = fs.readFileSync(file, 'utf8').replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, block => block.replace(/[^\n]/g, ' '));
  const inline = /!?\[[^\]\n]*\]\((<[^>]+>|[^)\n]+)\)/g;
  for (const match of source.matchAll(inline)) checkLink(file, match[1], match.index, source);
  for (const match of source.matchAll(/^\s*\[[^\]\n]+\]:\s*(<[^>]+>|\S+)/gm)) checkLink(file, match[1], match.index, source);
  if (file.endsWith('.html')) {
    for (const match of source.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) checkLink(file, match[1], match.index, source);
  }
}
const manifest = JSON.parse(fs.readFileSync(path.join(docs, 'history/document-moves-2026-10-23.json'), 'utf8'));
for (const move of manifest.moves) {
  if (!fs.existsSync(path.join(root, move.to))) errors.push(`Missing migrated document: ${move.to}`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Documentation OK: ${files.length} files, index and local links verified; ${manifest.moves.length} migration targets present.`);
}
if (warnings.length) console.warn(warnings.join('\n'));
