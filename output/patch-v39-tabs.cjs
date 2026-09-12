const fs = require("fs");
const zlib = require("zlib");
const path = "frontend/index.html";
const source = fs.readFileSync(path, "utf8");
const start = source.indexOf("const gzipBase64=");
const match = source.slice(start).match(/"([A-Za-z0-9+/=]+)"/);
if (!match) throw new Error("Compressed v39 payload was not found.");
const html = zlib.gunzipSync(Buffer.from(match[1], "base64")).toString("utf8");
const before = `  Object.entries(footerSections).forEach(([key,section])=>{
    if(!section)return;
    section.style.display=b.dataset.foot===key?"grid":"none";
  });`;
const after = `  Object.entries(footerSections).forEach(([key,section])=>{
    if(!section)return;
    const active=b.dataset.foot===key;
    section.hidden=!active;
    section.setAttribute("aria-hidden",String(!active));
    section.style.setProperty("display",active?"grid":"none","important");
  });`;
if (!html.includes(before)) throw new Error("Footer tab handler was not found.");
const updated = html.replace(before, after);
const compressed = zlib.gzipSync(Buffer.from(updated, "utf8")).toString("base64");
const output = source.slice(0, start) + source.slice(start).replace(match[1], compressed);
fs.writeFileSync(path, output, "utf8");
