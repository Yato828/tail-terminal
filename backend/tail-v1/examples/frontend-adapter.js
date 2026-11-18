// Example integration for the new TAIL React frontend. Copy/adapt, do not blindly overwrite the existing API layer.
const API=import.meta.env?.VITE_TAIL_API_URL||'http://127.0.0.1:8787';
async function get(path){const r=await fetch(API+path);const data=await r.json();if(!r.ok)throw new Error(data?.error?.message||'Request failed');return data}
export const tailApi={
 search:q=>get('/api/market/search?q='+encodeURIComponent(q)),
 token:mint=>get('/api/market/token/'+encodeURIComponent(mint)),
 filter:(q,f)=>get('/api/market/filter?'+new URLSearchParams({q,...f})),
 wallet:address=>get('/api/wallet/'+encodeURIComponent(address)),
 quote:(inputMint,outputMint,amount)=>get('/api/trade/quote?'+new URLSearchParams({inputMint,outputMint,amount})),
 subscribeToken(mint,onData){const s=new EventSource(API+'/api/market/stream/'+encodeURIComponent(mint));s.addEventListener('snapshot',e=>onData(JSON.parse(e.data)));return ()=>s.close()},
 async askFable(message,context){const r=await fetch(API+'/api/fable/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message,context})});const data=await r.json();if(!r.ok)throw new Error(data?.error?.message);return data}
};
