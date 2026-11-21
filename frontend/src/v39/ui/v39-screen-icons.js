import {renderV39IconAssignment, resolveV39IconAssignment} from "../../lib/v39-icon-assignment.js";
import {getV39SharedIconRow} from "../../lib/v39-shared-icon-settings.js";
import {RESEARCH_CATEGORY_ORDER,getResearchCategoryMeta} from "../../lib/research-tree-config.js";
import "./v39-resource-item-icon.css";

export const V39_SCREEN_ICON_TYPE = "画面用アイコン";
const screenDefaults = new Map([
  ["携帯食料・補給","🍞"],
  ["手持ち物資","🎒"],
  ["特殊資源","🍄"],
  ["部隊","👥"],
  ["土地","⬢"],
  ["交流","◇"],
  ["物流","⇄"],
  ["テスト","試"],
  ["装備","⚒"],
  ["製作ポイント","⚒"],
  ["資源表示","⇄"],
  ["国家・外交","🏳"],
  ["表示設定","目"],
  ["ゲーム開始設定","⬢"],
  ["設計書","📝"],
  ["移動","➜"],
  ["待機","◷"],
  ["回復まで待機","◷"],
  ["採取","⛏"],
  ["魂を回収","◇"]
]);
export const V39_SCREEN_ICON_ROWS = ["人口","友好度","索敵","攻撃","防御","建設","住宅","設定","一覧",...screenDefaults.keys(),...RESEARCH_CATEGORY_ORDER.map(key=>"研究・"+getResearchCategoryMeta(key).label),...["武器","魔法","肉体","その他"].map(name=>"技・"+name),...["森","山岳","火山","砂漠","薬草の群生地","死の霧","峡谷","洞窟","遺跡"].map(name=>"地形・"+name)]
  .map(name => ({名前:name}));

export function renderV39ScreenIcon(name) {
  const row = getV39SharedIconRow(V39_SCREEN_ICON_TYPE, name);
  return renderV39IconAssignment(resolveV39IconAssignment(row), "v39-resource-item-sprite")
    || screenDefaults.get(name) || "";
}
