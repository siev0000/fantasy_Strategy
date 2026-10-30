export const V39_MAP_QUALITY_OPTIONS=Object.freeze([
  Object.freeze({id:'low',label:'軽量',cacheResolution:0.5}),
  Object.freeze({id:'standard',label:'標準',cacheResolution:1}),
  Object.freeze({id:'high',label:'高画質',cacheResolution:null})
]);
export const normalizeV39MapQuality=value=>V39_MAP_QUALITY_OPTIONS.some(row=>row.id===value)?value:'standard';
export const resolveV39MapQuality=value=>V39_MAP_QUALITY_OPTIONS.find(row=>row.id===normalizeV39MapQuality(value));