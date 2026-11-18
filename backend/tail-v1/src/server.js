import {createServer} from 'node:http';
import {config} from './config.js';
import {Market,parseFilters} from './market.js';
import {Rpc} from './rpc.js';
import {Jupiter} from './jupiter.js';
import {Store} from './store.js';
import {Streams} from './streams.js';
import {Fable} from './fable.js';
import {Charts} from './charts.js';
import {json,readJson,HttpError,assert,solAddress,boundedInt,rateLimiter,now,signature} from './core.js';

export async function createApp({cfg=config,fetchImpl=fetch,storeDir=cfg.dataDir}={}){
 const market=new Market({fetchImpl});const charts=new Charts({fetchImpl});const rpc=new Rpc({url:cfg.rpc,backup:cfg.rpcBackup,fetchImpl});const jupiter=new Jupiter({key:cfg.jupiterKey,fetchImpl});const store=new Store(storeDir);await store.init();
 const fable=new Fable({key:cfg.openaiKey,model:cfg.openaiModel,market,rpc,fetchImpl});const streams=new Streams({market,store,periodMs:cfg.marketPollMs,maxTokens:cfg.maxStreamTokens});
 const globalRate=rateLimiter(120,60000);const sessionRate=rateLimiter(4,60000);
 function bearer(req){const v=req.headers.authorization||'';assert(v.startsWith('Bearer '),401,'AUTH_REQUIRED','Use Bearer session token from POST /api/session');return v.slice(7)}
 const server=createServer(async(req,res)=>{
  res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');res.setHeader('x-frame-options','DENY');res.setHeader('content-security-policy',"default-src 'none'");
  res.setHeader('cross-origin-resource-policy','cross-origin');
  const origin=req.headers.origin;
  try{
   if(origin){assert(cfg.origins.includes(origin),403,'ORIGIN_FORBIDDEN','Origin is not allowed');res.setHeader('access-control-allow-origin',origin);res.setHeader('vary','Origin')}
   if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-methods':'GET,POST,DELETE,OPTIONS','access-control-allow-headers':'content-type,authorization','access-control-max-age':'120'});res.end();return}
   const ip=req.socket.remoteAddress||'local';assert(globalRate(ip),429,'RATE_LIMIT','Slow down');
   assert(['GET','POST','DELETE'].includes(req.method),405,'METHOD_NOT_ALLOWED','Unsupported HTTP method');
   const url=new URL(req.url||'/',`http://localhost`),path=url.pathname;
   if(req.method==='GET'&&path==='/api/health')return json(res,200,{status:'ok',service:'TAIL Backend',version:'1.0.0',asOf:now(),market:'DexScreener',wallet:'Solana RPC',quote:'Jupiter V2',tradeExecution:false,fable:fable.status(),warning:'Noncustodial read/quote backend, real trade execution disabled pending security audit'});
   if(req.method==='GET'&&path==='/api/trade/capabilities')return json(res,200,{quote:true,buyExecution:false,sellExecution:false,signing:false,autotrading:false,reason:'Transaction policy and quote-to-instruction verification not implemented'});
   if(req.method==='GET'&&path==='/api/market/search')return json(res,200,await market.search(url.searchParams.get('q'),url.searchParams.get('limit')||20));
   if(req.method==='GET'&&path==='/api/market/profiles')return json(res,200,await market.profiles(url.searchParams.get('limit')||30));
   if(req.method==='GET'&&path==='/api/market/trending')return json(res,200,await market.trending(url.searchParams.get('limit')||20));
   if(req.method==='GET'&&path==='/api/market/new-pools')return json(res,200,await charts.newPools(url.searchParams.get('limit')||20));
   if(req.method==='GET'&&path==='/api/market/filter')return json(res,200,await market.filter(url.searchParams.get('q'),parseFilters(url.searchParams),url.searchParams.get('limit')||20));
   let m;
   if(req.method==='GET'&&(m=path.match(/^\/api\/market\/pool\/([^/]+)\/ohlcv$/)))return json(res,200,await charts.ohlcv(solAddress(m[1]),url.searchParams.get('interval')||'1m',url.searchParams.get('limit')||150,{token:url.searchParams.get('token')||'base',before:url.searchParams.get('before_timestamp')}));
   if(req.method==='GET'&&(m=path.match(/^\/api\/market\/pool\/([^/]+)\/trades$/)))return json(res,200,await charts.trades(solAddress(m[1]),url.searchParams.get('limit')||20));
   if(req.method==='GET'&&(m=path.match(/^\/api\/market\/token\/([^/]+)$/)))return json(res,200,await market.token(solAddress(m[1])));
   if(req.method==='GET'&&(m=path.match(/^\/api\/market\/stream\/([^/]+)$/)))return await streams.subscribe(solAddress(m[1]),res);
   if(req.method==='GET'&&(m=path.match(/^\/api\/wallet\/([^/]+)\/activity$/)))return json(res,200,await rpc.activity(solAddress(m[1]),boundedInt(url.searchParams.get('limit'),15,1,50)));
   if(req.method==='GET'&&(m=path.match(/^\/api\/wallet\/([^/]+)$/)))return json(res,200,await rpc.wallet(solAddress(m[1])));
   if(req.method==='GET'&&(m=path.match(/^\/api\/transaction\/([^/]+)$/)))return json(res,200,await rpc.txStatus(signature(m[1])));
   if(req.method==='GET'&&path==='/api/trade/quote'){const quote=await jupiter.quote(url.searchParams.get('inputMint'),url.searchParams.get('outputMint'),url.searchParams.get('amount'));let outputDecimals=null;try{const supply=await rpc.call('getTokenSupply',[quote.outputMint]);const d=supply?.value?.decimals;if(Number.isInteger(d)&&d>=0&&d<=18)outputDecimals=d}catch{}return json(res,200,{...quote,outputDecimals})}
   if(req.method==='GET'&&path==='/api/fable/status')return json(res,200,fable.status());
   if(req.method==='POST'&&path==='/api/fable/chat'){const ac=new AbortController();const disconnected=()=>{if(!res.writableEnded)ac.abort()};res.once('close',disconnected);try{const result=await fable.chat(await readJson(req),ip,ac.signal);if(!res.destroyed)return json(res,200,result)}finally{res.removeListener('close',disconnected)}return;}
   if(req.method==='POST'&&path==='/api/session'){assert(sessionRate(ip),429,'SESSION_RATE','Too many anonymous sessions');return json(res,201,{token:await store.session(),notice:'Anonymous bearer session for watchlists/alerts ONLY. It does not prove wallet ownership.'})}
   if(req.method==='GET'&&path==='/api/watchlist')return json(res,200,{items:store.get(bearer(req)).watchlist});
   if(req.method==='POST'&&path==='/api/watchlist'){const b=await readJson(req);return json(res,200,{items:await store.watch(bearer(req),b.mint,b.enabled!==false)})}
   if(req.method==='GET'&&path==='/api/alerts')return json(res,200,{items:store.get(bearer(req)).alerts});
   if(req.method==='GET'&&path==='/api/alerts/events')return json(res,200,{items:store.get(bearer(req)).events});
   if(req.method==='POST'&&path==='/api/alerts')return json(res,201,{alert:await store.alert(bearer(req),await readJson(req))});
   if(req.method==='DELETE'&&(m=path.match(/^\/api\/alerts\/([0-9a-f]{16})$/))){await store.deleteAlert(bearer(req),m[1]);return json(res,200,{deleted:true})}
   throw new HttpError(404,'NOT_FOUND','Unknown endpoint');
  }catch(e){if(res.destroyed)return;if(res.headersSent){if(!res.destroyed){res.write('event: error\ndata: '+JSON.stringify({code:e.code||'INTERNAL_ERROR'})+'\n\n');res.end()}return}
   const status=e instanceof HttpError?e.status:500;
   if(status===500)console.error('[TAIL]',e);
   json(res,status,{error:{code:e.code||'INTERNAL_ERROR',message:status===500?'Internal server error':e.message},asOf:now()});
  }
 });
 return {server,market,charts,rpc,jupiter,store,fable,streams,async close(){streams.close();await new Promise(resolve=>server.close(resolve))}};
}
if(process.argv[1] && new URL(import.meta.url).pathname===process.argv[1]){
 const app=await createApp();app.server.listen(config.port,config.host,()=>console.log(`TAIL Backend on http://${config.host}:${config.port}`));
 process.on('SIGINT',()=>app.server.close(()=>process.exit(0)));process.on('SIGTERM',()=>app.server.close(()=>process.exit(0)));
}
