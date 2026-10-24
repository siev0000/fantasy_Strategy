import settings from '../../../config/v39-facility-summon-costs.json';

export function getV39SummonBatchOptions(maximumLevel,baseLevel,config=settings){
  const maximum=Math.max(1,Math.floor(Number(config.maximumBatchCount??settings.maximumBatchCount)||1));
  const ratios=config.batchLevelRatios||settings.batchLevelRatios;
  return Array.from({length:maximum},(_,i)=>i+1).map(count=>({count,
    maximumLevel:Math.floor(Math.max(0,Number(maximumLevel)||0)*Math.min(1,Math.max(0,Number(ratios[count])||0)))}))
    .filter(option=>baseLevel>0&&baseLevel<=option.maximumLevel);
}
