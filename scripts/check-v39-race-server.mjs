import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {io} from 'socket.io-client';

const port=33100+Math.floor(Math.random()*100),url=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',data=>log+=String(data));server.stderr.on('data',data=>log+=String(data));
const socket=io(url,{autoConnect:false,reconnection:false});
function event(name){return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{socket.off(name,done);reject(new Error(`Timeout: ${name}; ${log}`));},6000);
  function done(value){clearTimeout(timer);resolve(value);}socket.once(name,done);
});}
try{
  const deadline=Date.now()+6000;
  while(!log.includes('Fantasy Strategy server listening')){if(Date.now()>deadline)throw new Error(log);await new Promise(resolve=>setTimeout(resolve,30));}
  const connected=event('connect');socket.connect();await connected;
  const created=event('room:created'),snapshot=event('room:snapshot');
  socket.emit('room:create',{mode:'v39-world',protocolVersion:'v39-room-v1',roomName:'種族設定検証',playerName:'検証者'});
  const room=await created;await snapshot;
  for(const raceKey of ['ドワーフ','獣人','巨人','ヴァンパイア','人間','森人']){
    const response=event('room:error');socket.emit('room:select-faction',{roomId:room.roomId,playerId:'player-1',raceKey});
    assert.match((await response).message,/選択できない/);
  }
  for(const raceKey of ['只人','エルフ','竜人','オーガ','ゴブリン','悪魔','天使']){
    const response=event('room:snapshot');socket.emit('room:select-faction',{roomId:room.roomId,playerId:'player-1',raceKey});
    assert.equal((await response).settings.playerFactionSelections['player-1'],raceKey);
  }
  console.log('server: 7 canonical races accepted; 4 incomplete races and legacy names rejected for new selections');
}finally{
  socket.disconnect();server.kill('SIGTERM');
  await Promise.race([once(server,'exit'),new Promise(resolve=>setTimeout(resolve,1000))]);
}
