import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),holders:vi.fn()}));
vi.mock('../../../lib/rpcFeed',()=>({rpc:mocks.rpc}));
vi.mock('../../../lib/holders',()=>({fetchHolderSnapshot:mocks.holders}));
import {enrichMintEvidence} from './enrich';
import {snapshotFromPair,getMarketSnapshot,markSnapshotStale} from './snapshot';
import {resetMarketCache} from './cache';
const mint='So11111111111111111111111111111111111111112',pool='Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const program='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const source=(address=mint)=>snapshotFromPair(address,{chainId:'solana',pairAddress:pool,baseToken:{address},priceUsd:'100',volume:{h24:0}});
const account=()=>({owner:program,data:{parsed:{type:'mint',info:{mintAuthority:null,freezeAuthority:mint,supply:'1000',decimals:0}}}});
beforeEach(()=>{resetMarketCache();mocks.rpc.mockReset();mocks.holders.mockReset();mocks.holders.mockResolvedValue({holders:[{address:{hash:mint},value:'20'}],accountCount:1,source:'Solana RPC',fetchedAt:Date.now(),observedAt:null,partial:true});});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('explicit on-chain filter evidence',()=>{
 it('validates mint owner/type, preserves authorities and shares independently dated evidence',async()=>{
  const initial=source(),at=initial.fields.priceUsd.fetchedAt;
  mocks.rpc.mockResolvedValue({value:[account()]});
  const [snapshot]=await enrichMintEvidence([initial]);
  expect(snapshot.fields.mintAuthority).toMatchObject({value:false,source:'Solana mainnet RPC',observedAt:null,status:'ready'});
  expect(snapshot.fields.freezeAuthority.value).toBe(true);
  expect(snapshot.fields.holderConcentration).toMatchObject({value:2,status:'ready',note:expect.stringContaining('unresolved sample owners')});
  expect(snapshot.fields.priceUsd.fetchedAt).toBe(at);
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify([{chainId:'solana',pairAddress:pool,baseToken:{address:mint},priceUsd:'101'}]))));
  const next=await getMarketSnapshot(mint,{force:true});
  expect(next.fields.priceUsd.value).toBe(101);expect(next.fields.holderConcentration.value).toBe(2);
  expect(next.fields.volume24h.value).toBeNull();
 });
 it('rejects malformed batches and does not publish hostile owner/type or missing authorities',async()=>{
  mocks.rpc.mockResolvedValueOnce({value:[]});await expect(enrichMintEvidence([source()])).rejects.toThrow('invalid batch');
  mocks.rpc.mockResolvedValueOnce({value:[{...account(),owner:mint}]});const [bad]=await enrichMintEvidence([source()]);
  expect(bad.fields.tokenProgram.value).toBeNull();expect(bad.fields.mintAuthority.value).toBeNull();expect(mocks.holders).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValueOnce({value:[{owner:program,data:{parsed:{type:'account',info:{mintAuthority:null}}}}]});
  const [tokenAccount]=await enrichMintEvidence([source()]);expect(tokenAccount.fields.mintAuthority.value).toBeNull();
  mocks.rpc.mockResolvedValueOnce({value:[{owner:program,data:{parsed:{type:'mint',info:{}}}}]});
  const [missing]=await enrichMintEvidence([source()]);expect(missing.fields.freezeAuthority.value).toBeNull();expect(missing.fields.tokenProgram.value).toBe(program);
 });
 it('bounds a manual batch to eight mints and four holder reads, leaving the remaining sample untouched',async()=>{
  const mints=[mint,'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v','JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN','DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263','11111111111111111111111111111111',program,'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb','SysvarRent111111111111111111111111111111111','SysvarC1ock11111111111111111111111111111111'];
  mocks.rpc.mockResolvedValue({value:Array.from({length:8},account)});
  const snapshots=mints.map(source),result=await enrichMintEvidence(snapshots);
  expect(mocks.rpc.mock.calls[0][1][0]).toHaveLength(8);expect(mocks.holders).toHaveBeenCalledTimes(4);expect(result).toHaveLength(9);expect(result[8]).toBe(snapshots[8]);
 });
 it('ages each source independently instead of rejuvenating metadata with an on-chain update',()=>{
  vi.useFakeTimers();const s=source();s.fields.priceUsd.fetchedAt=Date.now()-20000;s.fields.mintAuthority={value:false,source:'Solana mainnet RPC',fetchedAt:Date.now(),observedAt:null,status:'ready'};
  const fresh=markSnapshotStale(s,'Dex source rate limited');expect(fresh.fields.priceUsd.status).toBe('stale');expect(fresh.fields.mintAuthority.status).toBe('ready');
  vi.advanceTimersByTime(30001);expect(markSnapshotStale(fresh).fields.mintAuthority.status).toBe('stale');
 });
});
