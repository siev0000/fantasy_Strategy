import {getV39OfferingPopulationSources,inspectV39SpecialVillageOffering,inspectV39SpecialVillageReincarnation} from '../../lib/v39-special-villages.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function specialVillageReincarnationMarkup(state,village,actor,draft){
  const player=state.players.find(p=>p.id===state.activePlayerId),sources=getV39OfferingPopulationSources(player);
  if(!sources.some(row=>row.id===draft.settlementId))draft.settlementId=sources[0]?.id||'';
  const source=sources.find(row=>row.id===draft.settlementId);
  if(!source?.races.some(row=>row.race===draft.race))draft.race=source?.races[0]?.race||'';
  const check=inspectV39SpecialVillageReincarnation(state,player.id,village.id,{...draft,unitId:actor?.id});
  return {check,markup:`<article class="v39-hub-card" data-special-village-reincarnation><h3>転生を交渉</h3>
    <p>転生する本人: ${esc(actor?.name||'交渉役を選択してください')}</p>
    <p>${esc(check.currentRace||actor?.race||'未選択')} → 主要種族 ${esc(check.targetRace)} Lv${check.targetLevel}</p>
    <p>総合Lv ${actor?.level||0} → ${check.level}（取得分＋${check.addedLevel}）</p>
    <p>元の種族・職業Lv、習得スキル、装備を保持します。主要種族だけを切り替え、以後は新種族の配分で成長します。</p>
    <div class="v39-offering-fields"><label>奉納元の自拠点<select data-offering-field="settlementId">${sources.map(row=>`<option value="${esc(row.id)}"${row.id===draft.settlementId?' selected':''}>${esc(row.name)}</option>`).join('')}</select></label>
    <label>生贄にする住民<select data-offering-field="race">${(source?.races||[]).map(row=>`<option value="${esc(row.race)}"${row.race===draft.race?' selected':''}>${esc(row.race)} / ${row.count}人</option>`).join('')||'<option value="">対象なし</option>'}</select></label></div>
    <p>対価: 生贄${check.cost}人・AP${check.apCost}。転生時の一度だけ支払い、軍隊維持の定期奉納とは別です。</p>
    <p>取得済みの同じ種族Lvは重ねて加算しません。転生でHP/APを回復しません。</p>
    <p role="status">${check.available?'この条件で転生できます':esc(check.reasons.join(' / '))}</p></article>`};
}

export function specialVillageOfferingMarkup(state,village,actor,draft,map){
  const player=state.players.find(row=>row.id===state.activePlayerId),sources=getV39OfferingPopulationSources(player);
  if(!sources.some(row=>row.id===draft.settlementId))draft.settlementId=sources[0]?.id||'';
  const source=sources.find(row=>row.id===draft.settlementId);
  if(!source?.races.some(row=>row.race===draft.race))draft.race=source?.races[0]?.race||'';
  const check=inspectV39SpecialVillageOffering(state,player.id,village.id,{...draft,unitId:actor?.id},map);
  const config=check.config;
  if(!config)return {markup:'',check};
  const contract=village.offeringByPlayerId?.[player.id];
  return {check,markup:`<article class="v39-hub-card" data-special-village-offering><h3>生贄の奉納・軍隊加入</h3>
    <p>勝利を目指さない特殊村 / ${esc(config.race)}</p>
    <p>${config.offeringIntervalTurns}ターンごとに軍隊1駒につき${config.peoplePerArmy}人を指定拠点から自動奉納して維持します。人口不足時は契約停止・軍隊帰還となり、村で手動再開します。</p>
    <p>契約: ${contract?.status==='active'?`有効 / 次回T${contract.nextOfferingTurn}`:contract?.status==='suspended'?'停止中 / 再開待ち':'未契約'} / 活動中${check.current.length}駒</p>
    <div class="v39-offering-fields"><label>供給元の自拠点<select data-offering-field="settlementId">${sources.map(row=>`<option value="${esc(row.id)}"${row.id===draft.settlementId?' selected':''}>${esc(row.name)}</option>`).join('')}</select></label>
    <label>生贄にする住民<select data-offering-field="race">${(source?.races||[]).map(row=>`<option value="${esc(row.race)}"${row.race===draft.race?' selected':''}>${esc(row.race)} / ${row.count}人</option>`).join('')||'<option value="">対象なし</option>'}</select></label>
    <label>加入する軍隊<select data-offering-field="count">${Array.from({length:config.maxArmiesPerOffering},(_,i)=>i+1).map(count=>`<option value="${count}"${count===draft.count?' selected':''}>${count}駒 / 生贄${count*config.peoplePerArmy}人</option>`).join('')}</select></label></div>
    <p>契約数: 軍隊${draft.count}駒 / ${esc(config.race)} / ${esc(village.className)} Lv${config.armyLevel}</p>
    <p>今回の奉納: ${check.cost}人 / 次回以降: ${draft.count*config.peoplePerArmy}人・${config.offeringIntervalTurns}Tごと</p>
    <p>追加APなし。新規加入・帰還後の再参加は村の隣にAP0で配置します。既存軍隊は人数変更や維持費支払いで回復しません。</p>
    <p role="status">${check.available?'この条件で契約できます':esc(check.reasons.join(' / '))}</p>
    ${contract?.status==='active'?'<button type="button" data-special-contract-stop>契約を停止・軍隊を帰還させる</button>':''}</article>`};
}
