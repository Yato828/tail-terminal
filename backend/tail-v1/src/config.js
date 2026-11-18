import { DEFAULT_OPENAI_MODEL } from './identity.js';
const rpc=process.env.SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com';
function safeRpc(value){const u=new URL(value);if(u.protocol!=='https:' && !(process.env.NODE_ENV==='test'&&u.protocol==='http:'))throw new Error('RPC must use HTTPS');return u}
export const config={
  host:process.env.HOST||'127.0.0.1', port:Number(process.env.PORT||8787),
  origins:(process.env.ALLOWED_ORIGINS||'http://localhost:4664,http://localhost:5173').split(',').map(s=>s.trim()).filter(Boolean),
  rpc:safeRpc(rpc),rpcBackup:process.env.SOLANA_RPC_BACKUP_URL?safeRpc(process.env.SOLANA_RPC_BACKUP_URL):null,
  jupiterKey:process.env.JUPITER_API_KEY||'',openaiKey:process.env.OPENAI_API_KEY||'',openaiModel:process.env.OPENAI_MODEL?.trim()||DEFAULT_OPENAI_MODEL,
  dataDir:process.env.DATA_DIR||'./data',maxStreamTokens:Math.max(1,Math.min(30,Number(process.env.MAX_STREAM_TOKENS||12))),
  marketPollMs:Math.max(8000,Number(process.env.MARKET_POLL_MS||10_000))
};
