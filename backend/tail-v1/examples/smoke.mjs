const base=process.env.TAIL_API_URL||'http://127.0.0.1:8787';
for(const path of ['/api/health','/api/fable/status','/api/trade/capabilities']){
 const r=await fetch(base+path);console.log(r.status,path,JSON.stringify(await r.json()).slice(0,300));if(!r.ok)process.exitCode=1;
}
