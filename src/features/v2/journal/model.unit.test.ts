import {describe,it,expect} from 'vitest';
import {parseJournal,journalCsv} from './model';
const entry={id:'one',mint:'So11111111111111111111111111111111111111112',side:'buy',quantity:1,priceUsd:null,feeUsd:null,at:1700000000000,reason:'=SUM(A1)',tags:[],notes:'quoted "note"',signature:null,origin:'confirmed-execution'};
describe('browser journal trust boundary',()=>{
 it('never upgrades imported records to verified executions and keeps unknown costs',()=>{const rows=parseJournal([entry]);expect(rows[0].origin).toBe('manual');expect(rows[0].priceUsd).toBeNull();expect(rows[0].feeUsd).toBeNull();});
 it('rejects duplicate ids, invalid mints, negative quantities and future timestamps',()=>{expect(parseJournal([entry,entry])).toHaveLength(1);expect(parseJournal([{...entry,mint:'0x123'},{...entry,quantity:-1},{...entry,at:Date.now()+900000}])).toEqual([]);});
 it('escapes CSV formulas and embedded quotes',()=>{const csv=journalCsv(parseJournal([entry]));expect(csv).toContain("'=SUM(A1)");expect(csv).toContain('quoted ""note""');});
});
