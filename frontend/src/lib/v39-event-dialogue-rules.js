// Numbered-sheet dialogue foundation. UI and quest/payment adapters are connected separately.
const fail=(state,reason)=>({ok:false,state,reason});
const own=(object,key)=>Object.hasOwn(object||{},key);
const playerOf=state=>state.players?.find(player=>player.id===state.activePlayerId);
const sessionOf=(state,id)=>{
  const sessions=playerOf(state)?.factionState?.eventDialogueById;
  return own(sessions,id)?sessions[id]:null;
};
const save=(state,session)=>({...state,players:state.players.map(player=>player.id!==state.activePlayerId?player:{...player,factionState:{...player.factionState,eventDialogueById:{...player.factionState?.eventDialogueById,[session.instanceId]:session}}})});

export function inspectV39NumberedDialogue(definition) {
  const errors=[];
  if(!definition?.ID||definition.入力書式!=='番号付きセルv1')errors.push('番号付きセルv1のイベントではありません');
  const choices=definition?.選択肢;
  if(!Array.isArray(choices)||!choices.length)return [...errors,'選択肢がありません'];
  const seen=new Set();
  for(const choice of choices) {
    if(!choice||typeof choice!=='object'){errors.push('選択肢が不正です');continue;}
    const id=choice.番号;
    if(typeof id!=='string'||!/^\d+(?:-\d+)*$/.test(id)||id.split('-').some(part=>!(/^[1-9]\d*$/.test(part)))||seen.has(id))errors.push('番号が不正または重複しています');
    seen.add(id);
    if(typeof choice.名前!=='string'||!choice.名前.trim())errors.push('選択肢名がありません');
    for(const field of ['選択条件','消費','報酬','効果'])if(!Array.isArray(choice[field])||choice[field].some(term=>!term||typeof term.タイプ!=='string'))errors.push(`${field}が不正です`);
  }
  for(const choice of choices.filter(row=>row&&typeof row==='object')) {
    const parent=typeof choice.番号==='string'&&choice.番号.includes('-')?choice.番号.slice(0,choice.番号.lastIndexOf('-')):undefined;
    if(choice.親番号!==parent||parent&&!seen.has(parent))errors.push('親番号が一致しないか存在しません');
  }
  if(!Array.isArray(definition?.発生条件)||definition.発生条件.some(term=>!term||typeof term.タイプ!=='string'))errors.push('発生条件が不正です');
  return errors;
}

function checked(state,definition,id) {
  if(inspectV39NumberedDialogue(definition).length)return 'イベント定義が不正です';
  const session=sessionOf(state,id);
  if(!session||session.eventId!==definition.ID)return 'このプレイヤーの会話がありません';
  if(session.instanceId!==id||typeof session.contextId!=='string'||!session.contextId.trim())return '保存された会話の対象が不正です';
  if(session.closed)return '会話は終了しています';
  const ids=new Set(definition.選択肢.map(choice=>choice.番号));
  if(typeof session.cursor!=='string'||session.cursor&&!ids.has(session.cursor)||!Array.isArray(session.applied)||session.applied.some(key=>!ids.has(key)))return '保存された会話と定義が一致しません';
  return '';
}

function conditionsAllow(conditions,context,adapters) {
  for(const condition of conditions) {
    const handler=adapters.conditions?.[condition.タイプ];
    if(typeof handler!=='function')return {ok:false,reason:`未接続の条件: ${condition.タイプ}`};
    try {if(handler(condition,context)!==true)return {ok:false,reason:'条件を満たしていません'};}
    catch {return {ok:false,reason:'条件判定に失敗しました'};}
  }
  return {ok:true};
}

export function openV39NumberedDialogue(state,definition,{instanceId,contextId}={}) {
  if(!playerOf(state)||inspectV39NumberedDialogue(definition).length)return fail(state,'プレイヤーまたはイベント定義が不正です');
  if(typeof instanceId!=='string'||!instanceId.trim()||typeof contextId!=='string'||!contextId.trim())return fail(state,'会話の実行IDと対象IDが必要です');
  const old=sessionOf(state,instanceId);
  if(old)return old.eventId===definition.ID&&old.contextId===contextId?{ok:true,state,session:old}:fail(state,'実行IDが別の会話に使用されています');
  const session={eventId:definition.ID,instanceId,contextId,cursor:'',applied:[],closed:false};
  return {ok:true,state:save(state,session),session};
}

export function viewV39NumberedDialogue(state,definition,instanceId,adapters={}) {
  const reason=checked(state,definition,instanceId);if(reason)return {ok:false,reason,choices:[]};
  const session=sessionOf(state,instanceId),context={state,playerId:state.activePlayerId,contextId:session.contextId,instanceId};
  const global=conditionsAllow(definition.発生条件,context,adapters);
  const choices=definition.選択肢.filter(choice=>(choice.親番号||'')===session.cursor).map(choice=>{
    const available=global.ok?(session.applied.includes(choice.番号)?{ok:true}:conditionsAllow(choice.選択条件,context,adapters)):global;
    return {...choice,available:available.ok,reason:available.reason||'',applied:session.applied.includes(choice.番号)};
  });
  return {ok:true,choices,cursor:session.cursor,answer:definition.選択肢.find(choice=>choice.番号===session.cursor)?.回答||'',canBack:!!session.cursor};
}

export function chooseV39NumberedDialogue(state,definition,instanceId,number,adapters={}) {
  const view=viewV39NumberedDialogue(state,definition,instanceId,adapters);
  if(!view.ok)return fail(state,view.reason);
  const choice=view.choices.find(row=>row.番号===number);
  if(!choice?.available)return fail(state,choice?.reason||'現在の選択肢ではありません');
  const session=sessionOf(state,instanceId),applied=session.applied.includes(number);
  let next=state;
  if(!applied) {
    const required=['消費','報酬','効果'].flatMap(field=>choice[field].filter(term=>!(field==='効果'&&term.タイプ==='会話終了')).map(term=>`${field}:${term.タイプ}`));
    if(required.some(key=>!adapters.supportedOperations?.includes(key)))return fail(state,'未接続の消費・報酬・効果があります');
    if(required.length) {
      if(typeof adapters.applyChoice!=='function')return fail(state,'結果の適用処理が未接続です');
      // An adapter receives a working copy; a failed operation cannot partially charge the original state.
      let result;
      try {result=adapters.applyChoice(structuredClone(state),structuredClone(choice),{playerId:state.activePlayerId,contextId:session.contextId,instanceId});}
      catch {return fail(state,'結果の適用処理に失敗しました');}
      if(!result?.ok||result.state?.activePlayerId!==state.activePlayerId||!playerOf(result.state))return fail(state,result?.reason||'結果を適用できません');
      next=result.state;
    }
  }
  const updated={...session,cursor:number,applied:applied?session.applied:[...session.applied,number],closed:choice.効果.some(term=>term.タイプ==='会話終了')};
  return {ok:true,state:save(next,updated),session:updated,answer:choice.回答};
}

export function backV39NumberedDialogue(state,definition,instanceId) {
  const reason=checked(state,definition,instanceId);if(reason)return fail(state,reason);
  const session=sessionOf(state,instanceId),choice=definition.選択肢.find(row=>row.番号===session.cursor);
  const updated={...session,cursor:choice?.親番号||''};
  return {ok:true,state:save(state,updated),session:updated};
}
