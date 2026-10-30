const pendingByGame=new WeakMap();

// Sleeping world scenes share one TextureManager; enqueue each source only once.
export function loadV39SharedImageTexture(scene,key,url,onReady=()=>{}) {
  const game=scene.game;
  if(game.textures.exists(key)){onReady();return Promise.resolve(true);}
  let pending=pendingByGame.get(game);
  if(!pending){pending=new Map();pendingByGame.set(game,pending);}
  if(!pending.has(key)){
    const promise=new Promise(resolve=>{
      const image=new Image();
      image.onload=()=>{
        if(game.pendingDestroy||!game.textures?.game?.renderer){resolve(false);return;}
        if(!game.textures.exists(key))game.textures.addImage(key,image);
        resolve(true);
      };
      image.onerror=()=>{console.error('[v39 shared texture] failed to load',url);resolve(false);};
      image.src=url;
    });
    pending.set(key,promise);
  }
  return pending.get(key).then(loaded=>{
    if(loaded&&!game.pendingDestroy&&scene.sys?.game===game)onReady();
    return loaded&&!game.pendingDestroy;
  });
}
