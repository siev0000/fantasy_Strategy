import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const require = createRequire(import.meta.url);
const express = require('express');
const { installV39EffectLocalDraft, localRequest, validatePayload } = require('../server/v39-effect-local-draft.cjs');
const root = await mkdtemp(resolve('output/ui261-api-'));
const file = join(root, 'config/local/v39-effect-settings.json');
const app = express(); installV39EffectLocalDraft(app, { root });
const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
const url = `http://127.0.0.1:${server.address().port}/api/local/effect-settings`;
const payload = { schema:'v39-effect-local-draft', version:1, categories:{ slash:{ sequenceSteps:[{ effectName:'斬撃' }] } }, attributes:{}, effects:{} };
const raw = (headers, method = 'GET') => new Promise((resolve, reject) => {
  const req = httpRequest(url, {method,headers:{'Content-Type':'application/json','X-V39-Local-Editor':'1',...headers}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
  req.on('error',reject);req.end(method==='PUT'?JSON.stringify({revision:null,payload}):undefined);
});
const put = (revision, value = payload, headers = {}) => fetch(url, { method:'PUT', headers:{ 'Content-Type':'application/json','X-V39-Local-Editor':'1', ...headers }, body:JSON.stringify({ revision, payload:value }) });
try {
  const interfaces={lan:[{address:'192.168.0.209',netmask:'255.255.255.0',internal:false}]};
  const lanReq=peer=>({socket:{remoteAddress:peer},get:key=>({'host':'192.168.0.209:3000','origin':'http://192.168.0.209:3000'}[key])});
  assert.equal(localRequest(lanReq('192.168.0.33'),interfaces),true);
  assert.equal(localRequest(lanReq('192.168.1.33'),interfaces),false);
  assert.equal(localRequest(lanReq('203.0.113.33'),interfaces),false);
  assert.equal(localRequest({ socket:{ remoteAddress:'192.168.1.2' }, get:() => 'localhost:3000' }), false);
  for (const headers of [{ Host:'evil.example' }, { Origin:'https://evil.example' }, { 'X-Forwarded-For':'127.0.0.1' }, { 'CF-Connecting-IP':'127.0.0.1' }]) {
    assert.equal(await raw(headers),403,JSON.stringify(headers));
    assert.equal(await raw(headers,'PUT'),403);
  }
  assert.equal(validatePayload(JSON.parse('{"schema":"v39-effect-local-draft","version":1,"categories":{"__proto__":{}},"attributes":{},"effects":{}}')), false);
  assert.deepEqual(await (await fetch(url)).json(), { revision:null, payload:null });
  assert.equal((await put(null, { ...payload, categories:[] })).status, 400);
  const saved = await (await put(null)).json();
  assert.equal(saved.payload.categories.slash.sequenceSteps[0].effectName, '斬撃');
  assert.equal(JSON.parse(await readFile(file, 'utf8')).schema, payload.schema);
  assert.equal((await put(null)).status, 409);
  const races = await Promise.all([put(saved.revision), put(saved.revision)]);
  assert.deepEqual(races.map(r => r.status).sort(), [200, 409], 'serialized CAS writes');

  const bundle = await build({ entryPoints:['frontend/src/lib/v39-effect-local-draft.js'], bundle:true, write:false, format:'esm', platform:'node' });
  const { createV39EffectDraftSync } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  let current = structuredClone(payload), message = '';
  const storage = new Map();
  const adapter = { getItem:key => storage.get(key), setItem:(key, value) => storage.set(key, value), removeItem:key => storage.delete(key) };
  const sync = createV39EffectDraftSync({ snapshot:() => structuredClone(current), apply:value => { current = structuredClone(value); },
    fetch:(_path, options) => fetch(url, options), storage:adapter, onStatus:value => { message = value; }, delay:5 });
  await sync.start(); assert.match(message, /読込済み/);
  current.categories.slash.scaleMultiplierPercent = 135; sync.changed(); await sync.flush();
  assert.equal(sync.isDirty(), false);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).categories.slash.scaleMultiplierPercent, 135);
  const external = await (await fetch(url)).json();
  await put(external.revision, { ...payload, attributes:{ 炎:{ tint:'#ff0000' } } });
  current.categories.slash.scaleMultiplierPercent = 175; sync.changed(); await sync.flush();
  assert.equal(sync.isBlocked(), true); assert.equal(sync.isDirty(), true);
  assert.ok(JSON.parse(await readFile(file, 'utf8')).attributes.炎, 'conflict preserves other writer');
  await sync.flush({ overwrite:true }); assert.equal(sync.isDirty(), false);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).categories.slash.scaleMultiplierPercent, 175);
  sync.changed(); sync.dispose(); const before = structuredClone(current);
  const next = createV39EffectDraftSync({ snapshot:() => current, apply:value => { current = value; }, fetch:(_p, options) => fetch(url, options), storage:adapter });
  await next.start(); assert.equal(next.isBlocked(), true); assert.deepEqual(current, before, 'dirty browser not overwritten');
  await next.reload(); assert.equal(next.isDirty(), false);
  const firstStorage=new Map();let applied=false;
  const first=createV39EffectDraftSync({snapshot:()=>current,apply:()=>{applied=true;},fetch:(_p,options)=>fetch(url,options),storage:{getItem:key=>firstStorage.get(key),setItem:(key,value)=>firstStorage.set(key,value),removeItem:key=>firstStorage.delete(key)},hasLocalChanges:()=>true});
  await first.start();assert.equal(first.isBlocked(),true);assert.equal(applied,false,'first JSON connection preserves existing browser edits');first.dispose();
  sync.dispose(); next.dispose();
  await writeFile(file, '{broken', 'utf8');
  assert.equal((await fetch(url)).status, 500); assert.equal((await put(null)).status, 500);
  assert.equal(await readFile(file, 'utf8'), '{broken', 'corrupt file not overwritten');
  console.log('PASS: local JSON read/write, denied remote/proxy/origin, schema validation, atomic CAS/conflict, frontend autosave/hydration, pending browser protection and corrupt-file preservation. No browser.');
} finally {
  await new Promise(r => server.close(r));
  await unlink(file).catch(() => {});
  await rmdir(join(root, 'config/local')).catch(() => {});
  await rmdir(join(root, 'config')).catch(() => {});
  await rmdir(root);
}
