import {HEX_TILE_CONFIG} from "../../lib/phaser-map-panel-config.js";
import {V39AreaEffectPlayer} from "../../lib/v39-area-effect-player.js";
import {playV39MapEffect} from "./v39-effect-player.js";
import {showV39CombatEntryPopups,showDelayedHpBar,showOutcomePopup} from "./v39-combat-feedback.js";

// The overlay shares the battlefield camera, with the hex effect origin above the tile row.
export function projectV39GachaEffectCamera({tileSize,offset,height}) {
  const zoom=tileSize/HEX_TILE_CONFIG.width;
  const ground=height-tileSize;
  return {
    zoom,
    scrollX:-offset/zoom,
    scrollY:HEX_TILE_CONFIG.height/2-(ground-tileSize/2)/zoom
  };
}

export function createV39GachaEffects(host,onBusyChange,{visualHp,resolveCenter,react=()=>{}}={}) {
  let view;
  let game;
  let scene;
  let player;
  let ready;
  let finishBoot;
  let closed=false;
  let queued=0;
  let tail=Promise.resolve();
  const jobsByEntries=new WeakMap();
  const scheduledEntries=new WeakSet();
  const tileCenter=({x,y})=>({x:(x+.5)*HEX_TILE_CONFIG.width,y:(y+.5)*HEX_TILE_CONFIG.height});

  function applyView() {
    if(!view||!scene)return;
    const {width,height}=view;
    if(game.scale.width!==width||game.scale.height!==height)game.scale.resize(width,height);
    const {zoom,scrollX,scrollY}=projectV39GachaEffectCamera(view);
    scene.cameras.main.setOrigin(0,0).setZoom(zoom).setScroll(scrollX,scrollY);
  }

  function ensureScene() {
    if(!ready)ready=import("phaser").then(module=>{
      if(closed||!host.isConnected||!view)return false;
      const Phaser=module.default||module;
      return new Promise(resolve=>{
        finishBoot=resolve;
        game=new Phaser.Game({
          type:Phaser.CANVAS,parent:host,width:view.width,height:view.height,transparent:true,
          input:{keyboard:false,mouse:false,touch:false,gamepad:false},
          scene:{create(){
            finishBoot=null;
            if(closed){resolve(false);return;}
            scene=this;
            player=new V39AreaEffectPlayer(scene);
            applyView();
            resolve(true);
          }}
        });
      });
    });
    return ready;
  }

  function enqueue(job) {
    if(closed)return;
    queued++;
    if(queued===1)onBusyChange(true);
    tail=tail.then(async()=>{
      const {request,context,detail}=job;
      const entries=detail?.entries??request?.hitEntries??[];
      let released=false;
      const release=()=>{
        if(released)return;
        released=true;
        if(!closed&&entries.length)visualHp?.release(entries);
      };
      try {
        if(closed||!await ensureScene()||closed)return;
        game.loop.wake();
        const popups=[];
        const waitUntil=promise=>popups.push(promise);
        const points=entries.filter(entry=>Number.isFinite(entry.x)&&Number.isFinite(entry.y))
          .map(entry=>({entry,center:resolveCenter?.(entry)??tileCenter(entry)}));
        let impactShown=false;
        const showImpact=()=>{
          if(closed||impactShown)return;
          impactShown=true;
          for(const {entry,center} of points)showV39CombatEntryPopups(scene,entry,center,waitUntil,react);
          const obstruction=detail?.obstruction;
          if(Number.isFinite(obstruction?.x)&&Number.isFinite(obstruction.y))
            showOutcomePopup(scene,tileCenter(obstruction),obstruction.message,waitUntil);
        };
        if(request){
          try{
            await playV39MapEffect({...request,onImpactLate:showImpact},{...context,player,getScene:()=>closed?null:scene});
          }catch(error){
            console.warn("[v39 gacha] attack effect failed",error);
          }
        }
        if(closed)return;
        showImpact();
        for(const {entry,center} of points)showDelayedHpBar(scene,entry,center,waitUntil);
        release();
        await Promise.all(popups);
      }finally{release();}
    }).catch(error=>{
      console.warn("[v39 gacha] combat presentation failed",error);
    }).finally(()=>{
      queued--;
      if(!queued&&!closed){
        game?.loop.sleep();
        onBusyChange(false);
      }
    });
    return tail;
  }

  function play(request,context){
    const job={request,context};
    if(Array.isArray(request.hitEntries)){
      jobsByEntries.set(request.hitEntries,job);
      for(const entry of request.hitEntries)scheduledEntries.add(entry);
    }
    return enqueue(job);
  }

  function presentLog(detail,context){
    const entries=detail.entries??[];
    visualHp?.hold(entries);
    const job=jobsByEntries.get(entries);
    if(job){
      job.detail=detail;
      for(const entry of entries)scheduledEntries.add(entry);
      return;
    }
    const remaining=entries.filter(entry=>!scheduledEntries.has(entry));
    if(remaining.length||detail.obstruction)enqueue({context,detail:{...detail,entries:remaining}});
  }

  return {
    play,presentLog,get busy(){return queued>0;},
    setView(next){view=next;applyView();},
    destroy(){
      closed=true;
      finishBoot?.(false);
      finishBoot=null;
      player?.destroy();
      if(game){game.loop.wake();game.destroy(true);}
      scene=null;
    }
  };
}
