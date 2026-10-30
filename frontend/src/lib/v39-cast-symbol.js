// Shared 24-unit pictograms for Phaser and DOM casting states.
const shapes={
  cast:{background:'#10242b',lines:[[[-10,-8],[10,-8],[10,5],[0,5],[-6,10],[-5,5],[-10,5],[-10,-8]]],fills:[],
    circles:[{x:-5,y:-1,radius:1.2,fill:true},{x:0,y:-1,radius:1.2,fill:true},{x:5,y:-1,radius:1.2,fill:true}]},
  ready:{lines:[[[0,-8],[7,4],[-7,4],[0,-8]],[[0,8],[-7,-4],[7,-4],[0,8]]],fills:[],
    circles:[{x:0,y:0,radius:11},{x:0,y:0,radius:9}]}
};
export const getV39CastSymbolShape=kind=>shapes[kind]||null;
export function renderV39CastSymbol(ready){
  const kind=ready?'ready':'cast',shape=shapes[kind];
  const points=path=>path.map(p=>p.join(',')).join(' ');
  return `<svg viewBox="-13 -13 26 26" data-v39-cast-symbol="${kind}" aria-hidden="true">${shape.lines.map(path=>`<polyline points="${points(path)}" fill="${shape.background||'none'}" stroke="currentColor" stroke-width="${ready?1:2}" stroke-linejoin="round"/>`).join('')}${shape.fills.map(path=>`<polygon points="${points(path)}" fill="currentColor"/>`).join('')}${shape.circles.map(circle=>`<circle cx="${circle.x}" cy="${circle.y}" r="${circle.radius}" fill="${circle.fill?'currentColor':'none'}" stroke="currentColor" stroke-width="1"/>`).join('')}</svg>`;
}
