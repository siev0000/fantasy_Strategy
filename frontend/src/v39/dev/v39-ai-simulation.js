import {createSeededRandom} from '../../lib/seeded-random.js';
import {simulationActors,compareSimulationActors} from './v39-ai-simulation-records.js';
import './v39-ai-simulation.css';
import {applyV39InitialSovereignProfile} from '../core/v39-initial-sovereign.js';
import {describeV39ResourceDelta} from '../../lib/v39-resource-delta-view.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const round=value=>Math.round(Number(value)*10)/10;
const session={frames:[],issues:[],running:false,paused:false,completed:0,target:50,seed:'ai-long-test',status:'現在のゲームを初期状態として記録してください',initial:null,errorSave:null,selected:'',view:'summary',category:'全て',turn:'latest'};
let root=null,pauseRequested=false,events=[],runtimeError=null;
const state=()=>window.getV39GameState?.({includeWorlds:false});
const map=()=>window.__v39FieldRuntime?.mapData;
const enabled=()=>window.isV39TestMode?.()===true;
const actors=()=>simulationActors(state(),map());
const frameNow=()=>({turn:state().timeline.turnNumber,actors:actors(),changes:[],issues:[]});

function download(name,data){
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function capture(){
  if(!map()?.grid||!state()?.players?.length)throw new Error('先にマップと初期拠点を用意してください');
  if(window.isV39MapInputLocked?.())throw new Error('現在の処理が完了してから記録してください');
  if(state().timeline?.phase!=='player')throw new Error('プレイヤーターンの処理完了後に記録してください');
  session.initial=window.exportV39SaveJson(0);session.errorSave=null;session.completed=0;session.issues=[];session.frames=[frameNow()];session.turn='latest';
  session.status=`T${session.frames[0].turn} を初期状態として記録しました（勢力・村 ${session.frames[0].actors.length}）`;
}
function controls(){
  return `<header><h2>AI長期シミュレーション</h2><div class="sim-header-actions"><button data-sim-action="export" ${session.running||!session.frames.length?'disabled':' '}>ログをダウンロード</button><button data-sim-action="close">閉じる</button></div></header>
    <div class="sim-controls"><label>進めるターン <input data-sim-target type="number" min="1" max="200" value="${session.target}" ${session.running?'disabled':''}></label><label>乱数種 <input data-sim-seed value="${esc(session.seed)}" ${session.running||session.completed?'disabled':''}></label>
    <button data-sim-action="generate" ${session.running?'disabled':''}>検証マップ作成</button><button data-sim-action="capture" ${session.running?'disabled':''}>現在を初期状態に</button><button data-sim-action="reset" ${session.running||!session.initial?'disabled':''}>初期状態へ戻す</button>
    <button data-sim-action="step" ${session.running?'disabled':''}>1T進行</button><button data-sim-action="run" ${session.running?'disabled':''}>${session.paused?'再開':'連続実行'}</button><button data-sim-action="pause" ${!session.running?'disabled':''}>一時停止</button></div>
    <div class="sim-status" role="status">${esc(session.status)} / ${session.completed} / ${session.target}T / 要確認 ${session.issues.filter(row=>row.severity==='要確認').length}・異常 ${session.issues.filter(row=>row.severity==='異常').length}<progress max="${session.target}" value="${session.completed}"></progress></div>`;
}
function detail(frame,actor){
  if(!actor)return '<p>対象のNPC勢力・一般村がありません。「検証マップ作成」または現在のゲームでNPCを配置してください。</p>';
  if(session.view==='summary')return `<h3>${esc(actor.name)} <small>${esc(actor.kind)} / ${esc(actor.race)}</small></h3><p>目標: ${esc(actor.goal)}${actor.units.length?'':'（行動可能な戦力なし）'}</p><p>判断理由: ${esc(actor.reasons.join(' / ')||'追加の阻害理由なし')}</p>
    <div class="sim-metrics"><span>人口 ${actor.population}</span><span>生存戦力 ${actor.units.length}</span><span>完成施設 ${actor.buildings.length}</span><span>訓練 ${actor.training.length}</span></div>
    <h4>食料方針</h4>${actor.food.map(row=>`<p>${esc(row.name)}: ${row.active?'食料優先':'通常'} / 収支不足 ${round(row.deficitTotal)} / 備蓄不足 ${round(row.reserveDeficitTotal)}</p>`).join('')||'<p>計画記録なし</p>'}
    <h4>災害・施設・輸送</h4>${(actor.environment?.disasters||[]).map(row=>`<p>${esc(row.name)} / ${esc(row.worldId)} / 影響${row.affectedTiles}マス</p>`).join('')||(actor.environment?'<p>災害の影響なし</p>':'<p>環境記録なし（旧ログ）</p>')}
    ${(actor.environment?.facilities||[]).filter(row=>row.hp<row.maxHp).map(row=>`<p>${esc(row.name)} (${esc(row.key)}) HP ${round(row.hp)}/${round(row.maxHp)}${row.hp===0?' / 損壊':''}${row.cause?` / 最終被害: ${esc(row.cause)}`:''}</p>`).join('')}
    ${(actor.environment?.transports||[]).map(row=>`<p>${esc(row.name)} / 輸送 ${esc(row.status)}${row.reason?` / ${esc(row.reason)}`:''}</p>`).join('')}
    <h4>建設・開拓 / 訓練</h4><p>次の建設: ${esc(actor.nextConstruction||'未決定')}</p>${actor.pending.map(item=>`<p>${esc(item.name)} (${esc(item.tileKey)}) 残${esc(item.remainingTurns)}T</p>`).join('')||'<p>工事なし</p>'}${actor.training.map(item=>`<p>${esc(item.name)} EXP ${esc(item.progress??'?')} / ${esc(item.required??'?')}</p>`).join('')}
    <h4>不足資材（在庫 / 必要）</h4>${actor.needs.map(row=>`<p>${esc(row.name)} ${round(row.stock)} / ${round(row.required)}（不足${round(row.missing)}） ${esc(row.purpose)}</p>`).join('')||'<p>記録なし</p>'}
    <h4>在庫</h4><dl class="sim-stocks">${Object.entries(actor.stocks).map(([key,value])=>{
      const delta=describeV39ResourceDelta(actor.stockDeltas?.[key]);
      return `<div><dt>${esc(key)}</dt><dd>${round(value)} <span data-sim-stock-delta="${esc(key)}" class="sim-stock-delta ${delta.tone}">${delta.text}</span></dd></div>`;
    }).join('')}</dl><p><small>括弧内は直近の経済更新の実収支。建築など更新外の単発支出は含みません。</small></p><h4>ユニットの位置</h4><ul>${actor.units.map(unit=>`<li>${esc(unit.name||unit.id)} ${esc(unit.worldId)} (${unit.x},${unit.y}) HP${unit.hp} AP${unit.ap}</li>`).join('')}</ul>`;
  if(session.view==='issues')return session.issues.filter(row=>row.actorId===actor.id||!row.actorId).map(row=>`<article class="sim-issue"><b>T${row.turn} ${esc(row.severity)}</b> ${esc(row.message)}</article>`).join('')||'<p>検出事項なし。正常動作・バランスの保証ではありません。</p>';
  const frames=session.turn==='latest'?session.frames:session.frames.filter(item=>String(item.turn)===session.turn);
  return `<label>行動種別 <select data-sim-category>${['全て','判断','移動','戦闘','建設','徴兵','調達','変化'].map(category=>`<option${session.category===category?' selected':''}>${category}</option>`).join('')}</select></label>`+frames.slice().reverse().map(item=>{
    const rows=item.changes.filter(row=>(row.actorId===actor.id||row.actorIds?.includes(actor.id)||row.actorId==='world')&&(session.category==='全て'||row.category===session.category));
    return rows.length?`<section><h4>T${item.turn} ${item.durationMs??0}ms</h4>${rows.map(row=>`<p><b>${esc(row.category)}</b> ${esc(row.message)}</p>`).join('')}</section>`:'';
  }).join('');
}
function render(){
  if(!root)return;
  const oldScroll=root.querySelector('.sim-detail')?.scrollTop||0;
  const frame=session.turn==='latest'?session.frames.at(-1):session.frames.find(item=>String(item.turn)===session.turn);
  const rows=frame?.actors||actors();
  if(!rows.some(row=>row.id===session.selected))session.selected=rows[0]?.id||'';
  const actor=rows.find(row=>row.id===session.selected);
  root.innerHTML=`<div class="sim-shell">${controls()}<div class="sim-body"><aside aria-label="NPCと村">${rows.map(row=>`<button data-sim-actor="${esc(row.id)}" aria-pressed="${row.id===session.selected}"><b>${esc(row.name)}</b><small>${esc(row.kind)} / ${esc(row.race)}</small><small>人口${row.population} / 戦力${row.units.length}</small></button>`).join('')}</aside><main><nav>${[['summary','状態・目標'],['history','行動履歴'],['issues','要確認']].map(([id,label])=>`<button data-sim-view="${id}" aria-pressed="${session.view===id}">${label}</button>`).join('')}<label>表示ターン <select data-sim-turn><option value="latest">最新 / 全履歴</option>${session.frames.map(item=>`<option value="${item.turn}"${session.turn===String(item.turn)?' selected':''}>T${item.turn}</option>`).join('')}</select></label></nav><div class="sim-detail">${detail(frame,actor)}</div></main></div><footer>画像・演出なし／通常の全ターン処理を使用。人間側は行動せずターン終了。同じ初期状態・乱数種で再実行（時刻ID等の完全一致は保証しません）。要確認は不具合確定ではありません。</footer></div>`;
  root.querySelector('.sim-detail').scrollTop=oldScroll;
}
async function generate(){
  if(!window.confirm('現在のゲームを検証用マップ（勝利NPC3勢力）へ置き換えます。必要なセーブは保存済みですか？'))return;
  const random=Math.random;Math.random=createSeededRandom(session.seed);
  try{
    const setup=window.startV39LocalSession(1,{playMode:'single-normal',gameSettings:{npcFactionCount:3}});
    const initial={...setup,players:setup.players.map(player=>player.isPlayer===false?player:{...player,race:'只人'})};
    const sovereign=applyV39InitialSovereignProfile(initial,{playerId:'player-1',race:'只人',className:'ファイター',characterName:'検証統治者',villageName:'検証拠点'});
    if(!sovereign.ok)throw new Error(sovereign.reason);
    window.setV39GameState({players:sovereign.state.players},{reason:'ai-simulation-setup'});
    window.generateV39TestFieldWithSeed({w:40,h:40,patternId:'realistic'},session.seed);
    const result=window.autoPlaceV39InitialBases('player-1');
    if(!result?.ok)throw new Error(result?.reason||'初期配置に失敗しました');
  }finally{Math.random=random;}
  await window.waitForV39MapRenderSettled?.();capture();
}
async function run(count){
  if(session.running||!enabled())return;
  if(!session.initial)capture();
  if(session.completed>=200){session.status='200ターンに到達しました。新しい初期状態を記録してください';return;}
  if(state().timeline.turnNumber!==session.frames.at(-1).turn||JSON.stringify(actors())!==JSON.stringify(session.frames.at(-1).actors))throw new Error('記録外でゲーム状態が変わっています。初期状態へ戻すか、現在を記録してください');
  count=Math.min(count,200-session.completed);
  session.target=Math.max(session.target,session.completed+count);
  session.running=true;session.paused=false;pauseRequested=false;runtimeError=null;render();
  const batch=window.beginV39MapRenderBatch?.('ai-long-simulation');
  const oldSuppression=window.__v39SuppressCombatEffects;
  window.__v39AiSimulationRunning=true;window.__v39SuppressCombatEffects=true;
  try{
    for(let index=0;index<count&&!pauseRequested;index++){
      if(!enabled())throw new Error('テストモードが解除されました');
      if(state()?.victory?.completed){session.status='勝利条件達成のため停止';break;}
      const previous=actors(),turn=state().timeline.turnNumber,started=performance.now();events=[];
      const random=Math.random;Math.random=createSeededRandom(`${session.seed}:${turn}`);
      try{
        const limit=(state().players||[]).filter(player=>player.isPlayer!==false).length+1;
        let passes=0;
        while(state().timeline.turnNumber===turn&&passes++<limit){
          if(!await window.advanceV39Turn({skipUnactedFocus:true,presentation:false}))throw new Error('ターンを進められません（処理中・入力ロック・勝利状態を確認）');
        }
      }finally{Math.random=random;}
      if(runtimeError)throw runtimeError;
      if(state().timeline.turnNumber<=turn)throw new Error('一巡してもターン数が更新されません');
      const current=actors(),comparison=compareSimulationActors(previous,current,session.frames);
      const frame={turn:state().timeline.turnNumber,actors:current,...comparison,durationMs:Math.round(performance.now()-started),performance:structuredClone(window.getV39LatestTurnPerformance?.()||{})};
      frame.changes.push(...events);session.frames.push(frame);session.completed++;
      // Repeated warnings remain visible at their first occurrence rather than flooding the report.
      for(const issue of frame.issues)if(!session.issues.some(row=>row.actorId===issue.actorId&&row.message===issue.message))session.issues.push({...issue,turn:frame.turn});
      session.status=`T${frame.turn} 完了 (${frame.durationMs}ms)`;
      if(frame.issues.some(row=>row.severity==='異常')){session.errorSave=window.exportV39SaveJson(0);session.status='異常を検出して停止（ログをダウンロードで取得）';break;}
      render();await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(pauseRequested){session.paused=true;session.status='一時停止（現在ターン完了後）';}
  }catch(error){
    session.status=`エラー停止: ${error.message}`;session.issues.push({turn:state()?.timeline?.turnNumber,severity:'異常',message:error.stack||error.message});
    try{session.errorSave=window.exportV39SaveJson(0);}catch{/* Retain earlier records even if save validation fails. */}
  }finally{
    window.__v39SuppressCombatEffects=oldSuppression;window.__v39AiSimulationRunning=false;
    window.endV39MapRenderBatch?.(batch,{force:true,reason:'ai-long-simulation-complete'});
    session.running=false;render();
  }
}
async function handleAction(action){
  if(session.running){if(action==='pause'||action==='close'){pauseRequested=true;session.status='現在ターンの完了を待って停止します';render();}return;}
  session.target=Math.max(1,Math.min(200,Math.floor(Number(root.querySelector('[data-sim-target]')?.value)||50)));
  session.seed=root.querySelector('[data-sim-seed]')?.value||'ai-long-test';
  try{
    if(action==='close'){root.remove();root=null;document.body.classList.remove('v39-ai-simulation-open');return;}
    if(action==='generate'){
      session.running=true;render();
      try{await generate();}finally{session.running=false;}
    }
    if(action==='capture'&&(!session.initial||window.confirm('現在を新しい初期状態とし、記録を消去しますか？')))capture();
    if(action==='reset'&&session.initial&&window.confirm('記録した初期状態に戻して履歴を消去しますか？')){
      window.importV39SaveJson(session.initial);await window.waitForV39MapRenderSettled?.();
      session.frames=[frameNow()];session.completed=0;session.issues=[];session.errorSave=null;session.paused=false;session.turn='latest';session.status='初期状態に戻しました';
    }
    if(action==='step')await run(1);
    if(action==='run')await run(Math.max(0,session.target-session.completed));
    if(action==='export')download('ai-simulation-report.json',{version:2,exportedAt:new Date().toISOString(),seed:session.seed,status:session.status,completed:session.completed,target:session.target,finalFrame:session.frames.at(-1),frames:session.frames,issues:session.issues,initialSave:session.initial,checkpointSave:session.errorSave||window.exportV39SaveJson(0)});
  }catch(error){session.status=error.message;}
  render();
}
export function openV39AiSimulation(){
  if(!enabled())return false;
  if(root){render();return true;}
  root=document.createElement('div');root.id='v39-ai-simulation';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','AI長期シミュレーション');root.tabIndex=-1;
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.simActor){session.selected=button.dataset.simActor;render();}
    else if(button.dataset.simView){session.view=button.dataset.simView;render();}
    else if(button.dataset.simAction)void handleAction(button.dataset.simAction);
  });
  root.addEventListener('change',event=>{
    if(event.target.matches('[data-sim-turn]'))session.turn=event.target.value;
    else if(event.target.matches('[data-sim-category]'))session.category=event.target.value;
    else return;render();
  });
  root.addEventListener('keydown',event=>{
    event.stopPropagation();
    if(event.key==='Escape'){event.preventDefault();void handleAction('close');}
    if(event.key==='Tab'){
      const elements=[...root.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')];
      const first=elements[0],last=elements.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  });
  document.body.append(root);document.body.classList.add('v39-ai-simulation-open');render();root.focus();return true;
}
window.addEventListener('v39:combat-log',event=>{
  if(!session.running)return;
  const detail=event.detail||{},current=state(),targetIds=(detail.entries||[]).map(row=>row.targetId),participants=[detail.attackerId,...targetIds];
  const actorIds=[...(current.players||[]).filter(row=>row.isPlayer===false&&row.factionState.units.some(unit=>participants.includes(unit.id))).map(row=>row.id),
    ...(current.neutralVillages||[]).filter(row=>(row.defenseUnits||[]).some(unit=>participants.includes(unit.id))).map(row=>`village:${row.id}`)];
  events.push({actorId:actorIds[0]||'world',actorIds,category:'戦闘',message:detail.summary||`${detail.attackerName||detail.attackerId||'?'} / ${detail.skillName||''} / 記録${detail.entries?.length||0}件`});
});
window.openV39AiSimulation=openV39AiSimulation;
window.getV39AiSimulationReport=()=>structuredClone({completed:session.completed,running:session.running,status:session.status,frames:session.frames,issues:session.issues});
window.addEventListener('error',event=>{if(window.__v39AiSimulationRunning)runtimeError=event.error||new Error(event.message);});
window.addEventListener('unhandledrejection',event=>{if(window.__v39AiSimulationRunning)runtimeError=event.reason instanceof Error?event.reason:new Error(String(event.reason));});
