import { resolveEffectImpactPercent } from '../../../../配布用/アニメーション再生機能/phaser-effect-player.mjs';

export function resolveV39EffectImpactGuide(bounds) {
  const a=(bounds.angleDeg || 0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return [[0,0],[100,0],[100,100],[0,100]].map(([percentX,percentY])=>{
    const dx=(percentX/100-.5)*bounds.width*(bounds.flipX?-1:1),dy=(percentY/100-.5)*bounds.height*(bounds.flipY?-1:1);
    return {x:bounds.x+(bounds.screenScaleX ?? 1)*(dx*c-dy*s),
      y:bounds.y+(bounds.screenScaleY ?? 1)*(dx*s+dy*c),percentX,percentY};
  });
}

export function installV39EffectImpactDrag(stage, { getContext, onPreview, onCommit, onCancel }) {
  let drag;
  const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const point = event => {
    const rect = stage.getBoundingClientRect();
    return { x:(event.clientX-rect.left)*drag.width/rect.width,
      y:(event.clientY-rect.top)*drag.height/rect.height };
  };
  stage.addEventListener('pointerdown', event => {
    if (!event.target.closest?.('#v39-effect-impact-marker') || (event.button !== undefined && event.button !== 0)) return;
    stop(event);
    const context = getContext();
    if (!context?.bounds) return;
    drag = { ...context, bounds:{ ...context.bounds }, pointerId:event.pointerId };
    stage.setPointerCapture(event.pointerId);
  }, true);
  stage.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    stop(event);
    const location = point(event);
    onPreview(location, resolveEffectImpactPercent(drag.bounds, location));
  }, true);
  const finish = (event, cancelled) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    stop(event);
    const context = drag, value = resolveEffectImpactPercent(drag.bounds, point(event));
    drag = null;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    if (cancelled) onCancel?.();
    else onCommit(value, context);
  };
  stage.addEventListener('pointerup', event => finish(event, false), true);
  stage.addEventListener('pointercancel', event => finish(event, true), true);
  stage.addEventListener('lostpointercapture', () => { if (drag) { drag = null; onCancel?.(); } });
}
