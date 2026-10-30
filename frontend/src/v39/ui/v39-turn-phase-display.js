import {isV39TerritoryPhase,usesV39OperationPhases} from '../../lib/v39-operation-phases.js';
import {normalizeGameStartSettings} from '../../lib/game-start-settings.js';

export function resolveV39TurnPhaseDisplay(gameSettings={},timeline={}){
  const state={gameSettings,timeline},phased=usesV39OperationPhases(state),nation=isV39TerritoryPhase(state);
  const limit=normalizeGameStartSettings(gameSettings).maxCombatTurnsPerWorldTurn;
  const count=nation?0:Math.min(limit,Math.max(1,Math.floor(Number(timeline.expeditionTurns)||0)+1));
  const phase=phased?(nation?'territory':'expedition'):'standard';
  const title=phased?(nation?'領土運営：開拓・建設を予約':`戦闘・探索 ${count}/${limit}`):'ターン操作';
  return {phase,phased,count,title,turn:`T${Math.max(1,Math.floor(Number(timeline.turnNumber)||1))}`,
    announcement:phased?`${nation?'領土運営':'戦闘・探索'}フェーズへ移行しました`:''};
}
