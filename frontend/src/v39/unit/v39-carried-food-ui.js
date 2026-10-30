import {inspectV39FoodResupply,resupplyV39CarriedFood,unloadV39CarriedFood,V39_CARRIED_FOOD_KEYS,hasV39CarriedFood} from '../../lib/v39-carried-food.js';
import {v39CargoResourceDisplayAmount} from '../../lib/v39-soul-resource-value.js';
import {showV39Feedback} from '../ui/v39-feedback.js';
import {inspectV39SpecialtyFoodResupply,resupplyV39FoodFromSpecialty} from '../../lib/v39-specialty-food-resupply.js';
import {V39_PRESERVED_FOOD_RULE as ration,getV39PreservedFoodResearch} from '../../lib/v39-preserved-food-rules.js';

const context=()=>{
  const state=window.getV39GameState?.({includeWorlds:false}),player=state?.players?.find(p=>p.id===state.activePlayerId);
  return {state,player,id:player?.factionState?.selectedUnitId};
};
const describe=bag=>Object.entries(bag).filter(([,amount])=>amount>0).map(([name,amount])=>`${name} ${v39CargoResourceDisplayAmount(name,amount)}`).join(' / ')||'なし';
export function renderV39CarriedFoodControl(){
  const root=document.getElementById('detailCarriedFood');if(!root)return;
  const {state,player,id}=context(),input=document.getElementById('carriedFoodTurns');
  const check=inspectV39FoodResupply(state,player?.id,id,input.value);
  const field=inspectV39SpecialtyFoodResupply(state,player?.id,id,window.__v39FieldRuntime?.mapData,input.value);
  const make=document.getElementById('carriedFoodCraft');
  if(make){make.hidden=true;make.disabled=true;}
  const preview=document.getElementById('carriedFoodCraftPreview');
  if(preview)preview.textContent=check.automaticPreservedFood?`補給時に自動加工：通常食料${ration.inputPerItem} → 保存食1（食料${ration.nutrition}相当）`:`${getV39PreservedFoodResearch()?.項目名||'対応研究'}の完了で携帯食の自動加工を解禁`;
  root.hidden=!check.unit;
  input.max=String(check.maxTurns);input.value=String(check.turns);
  document.getElementById('carriedFoodStock').textContent=`手持ち（${check.individual?'個人':'部隊共通'}）\n${describe(Object.fromEntries(V39_CARRIED_FOOD_KEYS.map(key=>[key,check.cargo.resourcesByType[key]])))}`;
  document.getElementById('carriedFoodDemand').textContent=`消費/T: ${describe(check.demand)}`;
  const capacity=document.getElementById('carriedFoodCapacity');
  if(capacity)capacity.textContent=check.emptyFoodTurns!==null?`空荷からの容量目安：通常食料 約${check.emptyFoodTurns}T${check.preservedFoodTurns!==null?` / 保存食 約${check.preservedFoodTurns}T`:''}`:'';
  document.getElementById('carriedFoodReason').textContent=check.available
    ?`補給: ${describe(check.resources)}${check.convertedFood?` / 手持ちを保存食${check.convertedFood}へ加工`:''}`
    :field.available?`現地採取: ${describe(field.accepted.resourcesByType)} / AP ${field.apCost}`:check.reason;
  root.dataset.supplyAvailable=String(check.available||field.available);
  const take=document.getElementById('carriedFoodTake'),give=document.getElementById('carriedFoodGive'),forage=document.getElementById('carriedFoodField');
  forage.hidden=!field.specialty;forage.disabled=!field.available;
  take.disabled=!check.available;give.disabled=!check.base||!check.accessible||!hasV39CarriedFood(check.cargo);
  if(!root.dataset.bound){
    root.dataset.bound='1';input.addEventListener('change',renderV39CarriedFoodControl);
    for(const [button,action] of [[take,'base'],[give,'unload'],[forage,'field']])button.addEventListener('click',()=>{
      if(window.isV39MapInputLocked?.())return;
      const {state,player,id}=context();
      const unload=action==='unload';
      const result=unload?unloadV39CarriedFood(state,player?.id,id):action==='field'
        ?resupplyV39FoodFromSpecialty(state,player?.id,id,window.__v39FieldRuntime?.mapData,input.value)
        :resupplyV39CarriedFood(state,player?.id,id,input.value);
      if(result.ok){
        window.setV39GameState?.({players:result.state.players},{reason:unload?'food-unloaded':'food-resupplied'});
        window.appendV39ActivityLog?.([player.id],'物資',unload?'携帯食料を拠点へ預けました':`食料を補給: ${describe(result.resources)}${action==='field'?` / AP-${result.apCost}`:''}`);
      }
      showV39Feedback(result.ok?(unload?'食料を預けました':'食料を手持ちへ補給しました'):result.reason,{banner:true});
      renderV39CarriedFoodControl();
    });
  }
}

