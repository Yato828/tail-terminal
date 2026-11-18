import {expect,test} from '@playwright/test';
import {fixtures,mint,errors} from './support';

test('registered journal preserves drafts and CRUD after the approved entry transition is ready',async({page})=>{
 await fixtures(page);
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
 await page.goto(`/terminal?mint=${mint}&module=journal`);
 // Chart data may finish loading while the approved entry animation still makes
 // the terminal inert. Wait for interactivity, not an arbitrary animation delay.
 await expect(page.locator('.tail-terminal-route:not([inert])')).toBeVisible();
 await expect(page.locator('.sol-chart[data-chart-id="primary"]')).toHaveAttribute('data-candle-count','40');
 let panel=page.getByRole('dialog',{name:'Trade Journal',exact:true});
 await panel.getByLabel('Journal token mint').fill(mint);
 await panel.getByLabel('Journal quantity').fill('10');
 await panel.getByLabel('Journal price USD').fill('2');
 await panel.getByLabel('Journal reason').fill('Manual research entry');
 await expect(panel.getByLabel('Journal quantity')).toHaveValue('10');
 await expect(panel.getByLabel('Journal price USD')).toHaveValue('2');
 await expect(panel.getByLabel('Journal reason')).toHaveValue('Manual research entry');
 await panel.getByRole('button',{name:'Add manual entry',exact:true}).click();
 const record=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tail.v2.journal')??'[]')[0]??null);
 await expect.poll(async()=>{const r=await record();return r?{quantity:r.quantity,priceUsd:r.priceUsd,reason:r.reason,feeUsd:r.feeUsd,origin:r.origin}:null;}).toEqual({quantity:10,priceUsd:2,reason:'Manual research entry',feeUsd:null,origin:'manual'});
 await panel.getByRole('button',{name:'Edit entry',exact:true}).click();
 await expect(panel.getByLabel('Journal quantity')).toHaveValue('10');
 await panel.getByLabel('Journal notes').fill('Updated note');
 await panel.getByLabel('Journal price USD').fill('3');
 await expect(panel.getByLabel('Journal notes')).toHaveValue('Updated note');
 await expect(panel.getByLabel('Journal quantity')).toHaveValue('10');
 await panel.getByRole('button',{name:'Save journal entry',exact:true}).click();
 await expect.poll(async()=>{const r=await record();return r?{quantity:r.quantity,priceUsd:r.priceUsd,notes:r.notes}:null;}).toEqual({quantity:10,priceUsd:3,notes:'Updated note'});
 await page.reload();
 await expect(page.locator('.tail-terminal-route:not([inert])')).toBeVisible();
 panel=page.getByRole('dialog',{name:'Trade Journal',exact:true});
 await expect(panel.getByRole('cell',{name:/Updated note/})).toBeVisible();
 await panel.getByRole('button',{name:'Edit entry',exact:true}).click();
 await expect(panel.getByLabel('Journal quantity')).toHaveValue('10');
 await expect(panel.getByLabel('Journal price USD')).toHaveValue('3');
 await expect(panel.getByLabel('Journal reason')).toHaveValue('Manual research entry');
 await panel.getByRole('button',{name:'Cancel edit',exact:true}).click();
 await panel.getByRole('button',{name:'Delete entry',exact:true}).click();
 await expect(panel.getByText('No journal records.',{exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tail.v2.journal')??'[]').length)).toBe(0);
 expect(errors.get(page)).toEqual([]);
});
