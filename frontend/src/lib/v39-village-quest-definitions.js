import {getGameDataRows} from './game-data-registry.js';
import fixture from '../../../config/v39-village-incident-test.json';
import {resolveV39CityEvents} from './v39-city-development.js';
import {resolveV39CitySpecializationModifiers} from './v39-city-specialization-rules.js';

export function getV39VillageDialogueEntries(state,village){
  const faction=state.players.find(row=>row.id===state.activePlayerId)?.factionState;
  const saved=Object.values(faction?.eventDialogueById||{}).filter(row=>row.contextId===village.id&&!row.closed).map(row=>row.definition).filter(Boolean);
  const configured=new Set(resolveV39CitySpecializationModifiers(village).events.map(row=>row.id));
  const source=village.incidentTest?fixture.numberedEvents||[]:[...getGameDataRows('イベント会話').filter(row=>row.分類==='一般村'&&!configured.has(row.ID)),...resolveV39CityEvents(village,state.timeline?.turnNumber||1)];
  const resumable=saved.filter(row=>!village.incidentTest||source.some(definition=>definition.ID===row.ID));
  return [...new Map([...source,...resumable].map(row=>[row.ID,row])).values()];
}
