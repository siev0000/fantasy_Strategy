export function describeV39NpcObjective(objective={}){
  objective=objective||{};
  if(objective.type==='victory-landmark')return objective.hold?'覇権地の防衛':'覇権地の攻略';
  if(objective.type==='foreign-faction')return objective.resourceRaid?'資源確保の襲撃':'他勢力へ対応';
  return {explore:'未踏地域を移動探索','resource-search':'魂・死体の供給元探索','resource-recover':'残留資源の回収',
    'resource-demand':'村への生贄要求','resource-receive':'生贄の受取','resource-return':'資源の持帰り'}[objective.type]||'未設定（次のAI行動で決定）';
}
