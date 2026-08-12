const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createStore } = require('./cloudbase-store');

const rooms = new Map();
const store = createStore();
const MAX_PLAYERS = 10;
const MAX_BODY_BYTES = 16 * 1024;
const json = (res, status, body) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(body)); };
const id = () => crypto.randomBytes(5).toString('hex');
const code = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const roomView = room => ({ code:room.code, hostId:room.hostId, status:room.status, players:room.players.map(({id,...p})=>({id,...p})) });

function readBody(req) { return new Promise(resolve => { let raw='', tooLarge=false; req.on('data', d => { raw+=d; if(raw.length>MAX_BODY_BYTES){tooLarge=true; req.destroy();} }); req.on('end', () => { if(tooLarge)return resolve({}); try { resolve(JSON.parse(raw||'{}')); } catch { resolve({}); } }); }); }
function findPlayer(room, playerId) { return room.players.find(p => p.id === playerId); }

const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    const body = req.method === 'POST' ? await readBody(req) : {};
    if (url.pathname === '/api/create' && req.method === 'POST') {
      const player = { id:id(), name:(body.name||'无名客').slice(0,16), role:null, assistants:null, points:null, answers:[], ready:false, finished:false, affection:{}, loyalty:{} };
      const room = { code:code(), hostId:player.id, status:'lobby', players:[player] }; rooms.set(room.code,room); await store.set(room);
      return json(res,200,{code:room.code,playerId:player.id});
    }
    const roomCode = (body.code || url.searchParams.get('code') || '').toUpperCase();
    const room = rooms.get(roomCode) || await store.get(roomCode);
    if (!room) return json(res,404,{error:'剧本不存在或已结束'});
    rooms.set(room.code, room);
    if (url.pathname === '/api/room') return json(res,200,roomView(room));
    if (url.pathname === '/api/join' && req.method === 'POST') {
      if (room.status !== 'lobby') return json(res,409,{error:'剧本已开始'});
      if (room.players.length >= MAX_PLAYERS) return json(res,409,{error:'剧本人数已满'});
      const player={id:id(),name:(body.name||'无名客').slice(0,16),role:null,assistants:null,points:null,answers:[],ready:false,finished:false,affection:{},loyalty:{}};
      room.players.push(player); await store.set(room); return json(res,200,{code:room.code,playerId:player.id});
    }
    const player=findPlayer(room,body.playerId);
    if (!player) return json(res,403,{error:'玩家身份无效'});
    if (url.pathname === '/api/role' && req.method === 'POST') {
      if (room.players.some(p => p.id !== player.id && p.role === body.role)) return json(res,409,{error:'这个身份已被朋友点亮'});
      player.role=Number(body.role); await store.set(room); return json(res,200,roomView(room));
    }
    if (url.pathname === '/api/assistants' && req.method === 'POST') {
      const picks=Array.isArray(body.assistants)?body.assistants.map(Number):[];
      if (picks.length !== 3 || new Set(picks).size !== 3 || picks.some(n=>n<0||n>11)) return json(res,400,{error:'请选择三名不同的 NPC 助力'});
      player.assistants=picks; await store.set(room); return json(res,200,roomView(room));
    }
    if (url.pathname === '/api/ready' && req.method === 'POST') {
      if (room.status !== 'setup') return json(res,409,{error:'当前不能提交技能分配'});
      if (player.role === null || !Array.isArray(player.assistants) || player.assistants.length !== 3) return json(res,400,{error:'请先选择身份与三名 NPC 助力'});
      player.points=body.points; player.ready=true;
      if (room.players.every(p=>p.ready)) room.status='playing';
      await store.set(room); return json(res,200,roomView(room));
    }
    if (url.pathname === '/api/start' && req.method === 'POST') {
      if (room.hostId !== player.id) return json(res,403,{error:'只有房主可以开启剧本'});
      if (room.players.length < 2) return json(res,409,{error:'至少需要两名玩家加入剧本'});
      room.status='setup'; await store.set(room); return json(res,200,roomView(room));
    }
    if (url.pathname === '/api/answer' && req.method === 'POST') {
      player.answers.push(body.answer); player.affection=body.affection; player.loyalty=body.loyalty; await store.set(room); return json(res,200,{ok:true});
    }
    if (url.pathname === '/api/finish' && req.method === 'POST') { player.finished=true; if(room.players.every(p=>p.finished)) room.status='finished'; await store.set(room); return json(res,200,roomView(room)); }
    return json(res,404,{error:'未找到请求'});
  }
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const filePath=path.join(__dirname,file);
  if (!filePath.startsWith(__dirname) || !fs.existsSync(filePath)) { res.writeHead(404); return res.end('Not found'); }
  const type={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[path.extname(filePath)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':type,'Cache-Control':file==='index.html'?'no-cache':'public, max-age=3600','X-Content-Type-Options':'nosniff'}); fs.createReadStream(filePath).on('error',()=>{if(!res.headersSent)res.writeHead(500);res.end('Server error');}).pipe(res);
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.listen(process.env.PORT||4174,'0.0.0.0',()=>console.log(`Dream Chronicle listening on port ${process.env.PORT||4174}`));
