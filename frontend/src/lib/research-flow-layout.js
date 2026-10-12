// 同じ前提系列を縦の列へ揃える。端末の幅に応じて系列を折り返す。
export function layoutResearchFlow(items, {width=180,height=92,columnGap=14,rowGap=20,maxColumns=3}={}) {
  const byId = new Map(items.map(item => [item.id,item]));
  const neighbors = new Map(items.map(item => [item.id,[]]));
  for (const item of items) for (const parent of item.prerequisiteIds || []) {
    if (!byId.has(parent)) continue;
    neighbors.get(item.id).push(parent);
    neighbors.get(parent).push(item.id);
  }
  const visited = new Set(), groups = [];
  for (const item of items) {
    if (visited.has(item.id)) continue;
    const ids = [], queue = [item.id];
    for (let i=0; i<queue.length; i++) {
      const id = queue[i];
      if (visited.has(id)) continue;
      visited.add(id); ids.push(id); queue.push(...neighbors.get(id));
    }
    groups.push(ids);
  }
  const ranks = new Map();
  const rank = (id,path=new Set()) => {
    if (ranks.has(id)) return ranks.get(id);
    if (path.has(id)) return 0;
    const next = new Set(path); next.add(id);
    const parents = (byId.get(id).prerequisiteIds || []).filter(parent=>byId.has(parent));
    const value = Math.max(0,...parents.map(parent=>rank(parent,next)+1));
    ranks.set(id,value); return value;
  };
  const columns = Math.max(1,Math.floor(maxColumns)), nodes = [];
  let top = 12;
  for (let start=0; start<groups.length; start+=columns) {
    const batch = groups.slice(start,start+columns);
    let longest = 0;
    batch.forEach((ids,column) => {
      // 複数前提や分岐も順序を維持し、カードの重なりを防ぐ。
      ids.sort((a,b)=>rank(a)-rank(b) || items.indexOf(byId.get(a))-items.indexOf(byId.get(b)));
      ids.forEach((id,row)=>nodes.push({item:byId.get(id),x:12+column*(width+columnGap),y:top+row*(height+rowGap),width,height}));
      longest = Math.max(longest,ids.length);
    });
    top += longest*(height+rowGap)+rowGap;
  }
  const positions = new Map(nodes.map(node=>[node.item.id,node]));
  const edges = nodes.flatMap(to=>(to.item.prerequisiteIds || []).filter(id=>positions.has(id)).map(id=>({from:positions.get(id),to})));
  return {nodes,edges,width:Math.max(1,...nodes.map(node=>node.x+width+12)),height:Math.max(1,...nodes.map(node=>node.y+height+12))};
}
