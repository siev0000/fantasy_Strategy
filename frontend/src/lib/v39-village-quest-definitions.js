import {getGameDataRows} from './game-data-registry.js';
import fixture from '../../../config/v39-village-incident-test.json';

export function getV39VillageDialogueEntries(state,village){
  const faction=state.players.find(row=>row.id===state.activePlayerId)?.factionState;
  const saved=Object.values(faction?.eventDialogueById||{}).filter(row=>row.contextId===village.id&&!row.closed).map(row=>row.definition).filter(Boolean);
  const source=village.incidentTest?fixture.numberedEvents||[]:getGameDataRows('イベント会話').filter(row=>row.分類==='一般村');
  const resumable=saved.filter(row=>!village.incidentTest||source.some(definition=>definition.ID===row.ID));
  return [...new Map([...source,...resumable].map(row=>[row.ID,row])).values()];
}
