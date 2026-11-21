const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const {localRequest} = require("./v39-effect-local-draft.cjs");
const colorRules = import("../config/v39-enchantment-color-rules.mjs");

function installV39EnchantmentColors(app,{root,enabled}){
  const route="/api/local/enchantment-colors";
  const file=path.join(root,"config","v39-enchantment-colors.json");
  const dataFile=path.join(root,"data","source","export","json","付与.json");
  const revisionOf=text=>crypto.createHash("sha256").update(text).digest("hex");
  const read=async()=>{
    const text=await fs.readFile(file,"utf8");
    return {revision:revisionOf(text),colors:JSON.parse(text)};
  };
  let saving=false;
  app.use(route,(req,res,next)=>{
    res.set("Cache-Control","no-store");
    if(!enabled||!localRequest(req)||(req.method==="PUT"&&req.get("x-v39-local-editor")!=="1")){
      return res.status(403).json({error:"付与カラーはローカル開発サーバーで設定できます。"});
    }
    next();
  });
  app.get(route,async (_req,res)=>{
    try{res.json(await read());}
    catch{res.status(500).json({error:"付与カラーのJSONを読み込めません。"});}
  });
  app.put(route,express.json({limit:"64kb",strict:true}),async(req,res)=>{
    const {revision,colors}=req.body||{};
    if(typeof revision!=="string"||!/^[0-9a-f]{64}$/.test(revision)||!colors||typeof colors!=="object"||Array.isArray(colors)){
      return res.status(400).json({error:"付与カラーの形式が正しくありません。"});
    }
    if(saving)return res.status(409).json({error:"別の保存が進行中です。少し待って再試行してください。"});
    saving=true;
    const temp=file+"."+crypto.randomUUID()+".tmp";
    try{
      const {V39_ENCHANTMENT_COLOR_FIELDS,groupV39EnchantmentColors,normalizeV39EnchantmentColor}=await colorRules;
      const {groups,keysByAbility}=groupV39EnchantmentColors(JSON.parse(await fs.readFile(dataFile,"utf8")));
      const before=await read();
      if(before.revision!==revision)return res.status(409).json({error:"付与カラーが別の画面で更新されました。開き直してください。"});
      const entries=Object.entries(colors);
      if(entries.some(([key,value])=>{
        if(!groups.has(key)||!value||typeof value!=="object"||Array.isArray(value))return true;
        const fields=Object.entries(value);
        return !fields.length||fields.some(([field,color])=>!V39_ENCHANTMENT_COLOR_FIELDS.includes(field)||!normalizeV39EnchantmentColor(color));
      })){
        return res.status(400).json({error:"付与系統とカラーコードを確認してください。"});
      }
      const known=Object.fromEntries(entries.map(([key,value])=>
        [key,Object.fromEntries(Object.entries(value).map(([field,color])=>[field,normalizeV39EnchantmentColor(color)]))]
      ));
      const retired=Object.entries(before.colors).filter(([key])=>!groups.has(key)&&!keysByAbility.has(key));
      const updated={...Object.fromEntries(retired),...known};
      const text=JSON.stringify(updated,null,2)+"\n";
      await fs.writeFile(temp,text,{encoding:"utf8",flag:"wx"});
      await fs.rename(temp,file);
      res.json({revision:revisionOf(text),colors:updated});
    }catch{
      res.status(500).json({error:"付与カラーのJSONを保存できません。"});
    }finally{
      await fs.unlink(temp).catch(()=>{});
      saving=false;
    }
  });
}

module.exports={installV39EnchantmentColors};
