import {expect,it} from 'vitest';
import {changeBasket,reconcileBasket,selectedGroups,selectionKey,type SelectionWork} from '../src/batch/selection';
const row=(hotel='KAT',account='10',id='1',stage='Billing'):SelectionWork=>({hotel,account_id:account,id,account_name:'Synthetic agency',open:125.25,collection_selectable:true,verification_state:'verified',workflow:{billing_required:true},action:{stage}});
it('keeps selections across accounts, hotels and stages without invoice-ID collisions',()=>{
 const rows=[row(),row('TSK'),row('KAT','20'),row('KAT','10','2','Follow 1')];
 let basket={};for(const r of rows)basket=changeBasket(basket,selectionKey(r),[r.id],'add');
 const groups=selectedGroups(basket,rows);expect(groups).toHaveLength(4);expect(groups.reduce((n,g)=>n+g.amount,0)).toBe(501);
 expect(groups.map(g=>g.purpose)).toEqual(['billing','billing','billing','collection']);
});
it('adds and removes only within the selected work group',()=>{
 const a=row(),b=row('TSK');let basket=changeBasket({},selectionKey(a),['1'],'add');
 basket=changeBasket(basket,selectionKey(b),['1'],'add');basket=changeBasket(basket,selectionKey(a),['1'],'toggle');
 expect(selectedGroups(basket,[a,b]).map(g=>g.hotel)).toEqual(['TSK']);
});
it('keeps hidden selections when focus or display filters change',()=>{
 const rows=[row(),row('KAT','20','2')],basket=changeBasket(changeBasket({},selectionKey(rows[0]),['1'],'add'),selectionKey(rows[1]),['2'],'add');
 expect(reconcileBasket(basket,rows)).toBe(basket);expect(selectedGroups(basket,rows)).toHaveLength(2);
});
it('removes stale, held, changed-stage and unverified selections without silently moving their stage',()=>{
 const rows=[row(),row('TSK'),row('KAT','20','2'),row('KAT','30','3')];let basket={};
 for(const r of rows)basket=changeBasket(basket,selectionKey(r),[r.id],'add');
 const fresh=rows.map((r,i)=>i===0?{...r,action:{stage:'Follow 1'}}:i===1?{...r,collection_selectable:false}:i===2?{...r,verification_state:'unknown'}:{...r,action:{stage:'On hold'}});
 expect(selectedGroups(reconcileBasket(basket,fresh),fresh)).toEqual([]);
});
it('does not require recipients to select or prepare a group',()=>{
 const r=row();const groups=selectedGroups(changeBasket({},selectionKey(r),['1'],'add'),[r]);
 expect(groups[0]).toMatchObject({hotel:'KAT',accountId:'10',ids:['1'],amount:125.25});
});
