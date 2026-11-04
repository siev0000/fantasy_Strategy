import assert from 'node:assert/strict';
import { PhaserEffectPlayer } from '../配布用/アニメーション再生機能/phaser-effect-player.mjs';

for(const brightnessPercent of [0,100,175])for(const grayscaleBase of [false,true])for(const gradientEnabled of [false,true]){
  const commands=[],textures=new Map();
  let saved;
  const context={canvas:{},save(){saved={filter:this.filter,blend:this.globalCompositeOperation};},restore(){this.filter=saved.filter;this.globalCompositeOperation=saved.blend;},filter:'none',globalCompositeOperation:'source-over',globalAlpha:1,
    clearRect(){},createLinearGradient(){return {addColorStop(){}};},
    drawImage(){commands.push({type:'source',filter:this.filter,blend:this.globalCompositeOperation});},
    fillRect(){commands.push({type:'color',filter:this.filter,blend:this.globalCompositeOperation});}};
  const scene={textures:{get:key=>key==='source'?{getSourceImage:()=>({width:120,height:120})}:textures.get(key),
    exists:key=>textures.has(key),remove:key=>textures.delete(key),
    createCanvas(key,width,height){const texture={width,height,context,refresh(){}};textures.set(key,texture);return texture;}},
    add:{image(){return {scene,frame:{data:{}},
      setTexture(){return this;},setCrop(){return this;},clearTint(){return this;},
      setTint(){},setOrigin(){},setScale(){},setDepth(){},setAngle(){},setAlpha(){},setBlendMode(){},setName(){},setPosition(){},clearMask(){},
      destroy(){this.scene=null;}};}}};
  const player=new PhaserEffectPlayer(scene,{textureLoader:async()=>'source'});
  await player.showFrame({src:'source',x:20,y:30,grayscaleBase,gradientEnabled,brightnessPercent,tint:'#ff0000',
    gradientColorA:'#ff0000',gradientColorB:'#0000ff',gradientMotionMode:'fixed',renderStyle:'none'});
  if(grayscaleBase){
    assert.equal(commands[0].filter,'grayscale(1)','convert source before coloring');
    const color=commands.find(c=>c.type==='color');assert.equal(color.filter,'none');assert.equal(color.blend,'multiply');
    assert.ok(commands.some(c=>c.blend==='destination-in'),'restore original alpha mask');
    assert.equal(context.filter,'none');
  }else assert.ok(commands.every(c=>c.filter==='none' || c.filter.startsWith('brightness(')),'without attribute conversion, preserve source colors');
  if(brightnessPercent!==100){assert.equal(commands.at(-1).filter,`brightness(${brightnessPercent}%)`);assert.equal(commands.at(-1).blend,'copy');}
  player.destroy();
}
console.log('PASS: monochrome precedes tint/gradient, preserves alpha mask, and is skipped when disabled. No browser.');
