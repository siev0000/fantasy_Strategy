const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');

const ROUTE = '/api/local/effect-settings';
const isLoopback = value => ['localhost', '127.0.0.1', '[::1]', '::1', '::ffff:127.0.0.1'].includes(value);
const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);

const ipv4 = value => {
  const parts=String(value).split('.');
  return parts.length===4&&parts.every(part=>/^\d+$/.test(part)&&Number(part)<=255)
    ? parts.reduce((total,part)=>(total*256+Number(part))>>>0,0) : null;
};
const privateIp = value => /^10\./.test(value)||/^192\.168\./.test(value)||/^172\.(1[6-9]|2\d|3[01])\./.test(value);
function localRequest(req, interfaces = require('node:os').networkInterfaces()) {
  if (['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'cf-connecting-ip'].some(key => req.get(key))) return false;
  try {
    const host = new URL(`http://${req.get('host')}`);
    const peer=String(req.socket.remoteAddress||'').replace(/^::ffff:/,'');
    const local=isLoopback(peer)&&isLoopback(host.hostname);
    const lan=privateIp(peer)&&privateIp(host.hostname)&&Object.values(interfaces).flat().some(item=>{
      const mask=ipv4(item.netmask),address=ipv4(item.address),client=ipv4(peer);
      return !item.internal&&item.address===host.hostname&&mask!==null&&address!==null&&client!==null&&(address&mask)===(client&mask);
    });
    if (!local&&!lan) return false;
    if (req.get('origin') && new URL(req.get('origin')).origin !== host.origin) return false;
    return req.get('sec-fetch-site') !== 'cross-site';
  } catch { return false; }
}

function validatePayload(raw) {
  if (!isRecord(raw) || raw.schema !== 'v39-effect-local-draft' || raw.version !== 1
    || !['categories', 'attributes', 'effects'].every(key => isRecord(raw[key]))) return false;
  const visit = (value, depth = 0) => {
    if (depth > 16) return false;
    if (Array.isArray(value)) return value.length <= 256 && value.every(item => visit(item, depth + 1));
    if (!isRecord(value)) return value === null || ['string', 'number', 'boolean'].includes(typeof value);
    const entries = Object.entries(value);
    return entries.length <= 2048 && entries.every(([key, item]) =>
      !['__proto__', 'constructor', 'prototype'].includes(key) && visit(item, depth + 1));
  };
  return visit(raw);
}

function installV39EffectLocalDraft(app, { root, enabled = true }) {
  const filePath = path.join(root, 'config/local/v39-effect-settings.json');
  let writes = Promise.resolve();
  const read = async () => {
    try {
      const text = await fs.readFile(filePath, 'utf8');
      const payload = JSON.parse(text);
      if (!validatePayload(payload)) throw new Error('Invalid draft file');
      return { revision:crypto.createHash('sha256').update(text).digest('hex'), payload };
    } catch (error) { if (error.code === 'ENOENT') return { revision:null, payload:null }; throw error; }
  };
  app.use(ROUTE, (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!enabled || !localRequest(req)) return res.status(403).json({ error:'ローカル開発環境からのみ利用できます。' });
    if (req.method === "PUT" && req.get("x-v39-local-editor") !== "1") return res.status(403).json({error:"編集用ヘッダーが必要です。"});
    next();
  });
  app.get(ROUTE, async (_req, res) => {
    try { res.json(await read()); }
    catch { res.status(500).json({ error:'ローカルJSONを読み込めません。ファイルを確認してください。' }); }
  });
  app.put(ROUTE, express.json({ limit:'1mb', strict:true }), (req, res) => {
    if (!validatePayload(req.body?.payload) || !(req.body.revision === null || typeof req.body.revision === 'string')) {
      return res.status(400).json({ error:'エフェクト設定JSONの形式が正しくありません。' });
    }
    const run = async () => {
      const current = await read();
      if (current.revision !== req.body.revision) return res.status(409).json({ error:'JSONが別の操作で更新されました。再読込してください。' });
      const payload = { schema:'v39-effect-local-draft', version:1, updatedAt:new Date().toISOString(),
        categories:req.body.payload.categories, attributes:req.body.payload.attributes, effects:req.body.payload.effects };
      await fs.mkdir(path.dirname(filePath), { recursive:true });
      const text = JSON.stringify(payload, null, 2) + String.fromCharCode(10);
      const temp = `${filePath}.${crypto.randomUUID()}.tmp`;
      try {
        await fs.writeFile(temp, text, 'utf8');
        await fs.rename(temp, filePath);
      } finally { await fs.unlink(temp).catch(() => {}); }
      res.json({ revision:crypto.createHash('sha256').update(text).digest('hex'), payload });
    };
    writes = writes.then(run, run).catch(() => { if (!res.headersSent) res.status(500).json({ error:'ローカルJSONを保存できません。ブラウザ内の設定は保持されています。' }); });
  });
}

module.exports = { installV39EffectLocalDraft, validatePayload, localRequest };
