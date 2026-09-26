import {registerValues,trackingStatuses,type RegisterRow,type RegisterValues} from './model';
export interface PasteColumn {label:string;field?:keyof RegisterValues}
export interface PasteEntry {row:RegisterRow;values:RegisterValues;cells:string[]}
export function parseSheetText(text:string):string[][]{
 if(text.length>100000)throw Error('Paste is too large. Use up to 100 rows at a time.');
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 const input=text.replace(/\r\n?/g,'\n');
 for(let i=0;i<input.length;i++){const c=input[i];
  if(quoted){if(c==='"'){if(input[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c==='"'&&!cell&&!closed){quoted=true;continue;}
  if(c==='\t'||c==='\n'){row.push(cell);cell='';closed=false;if(c==='\n'){rows.push(row);row=[];}continue;}
  if(closed)throw Error('The pasted cells have invalid quotation marks.');cell+=c;
 }
 if(quoted)throw Error('The pasted cells have an unfinished quotation mark.');
 if(cell||row.length||!input.endsWith('\n')){row.push(cell);rows.push(row);}
 if(!rows.length||rows.length>100)throw Error('Paste between 1 and 100 rows.');
 if(rows.some(r=>r.length!==rows[0].length))throw Error('Every pasted row must have the same number of columns.');return rows;
}
function dateValue(value:string,today:string,future:boolean):string|null{
 if(!value.trim())return null;let v=value.trim();const local=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);if(local)v=`${local[3]}-${local[2].padStart(2,'0')}-${local[1].padStart(2,'0')}`;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number(v.slice(0,4))<1900||!Number.isFinite(Date.parse(v))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v||!future&&v>today)throw Error('Use a valid YYYY-MM-DD or DD/MM/YYYY date; actual sent dates cannot be in the future.');return v;
}
function valueFor(field:keyof RegisterValues,value:string,today:string,stages:{key:string;label:string}[]):RegisterValues[keyof RegisterValues]{
 const v=value.trim();
 if(field==='billingRequired'){if(!v||v.toLowerCase()==='not configured')return null;if(/^(required|yes|true)$/i.test(v))return true;if(/^(not required|no|false)$/i.test(v))return false;throw Error('Use Required or Not required.');}
 if(field==='creditTerm'){if(!v)return null;if(!/^\d+$/.test(v)||Number(v)>3650)throw Error('Credit term must be a whole number from 0 to 3650.');return Number(v);}
 if(field==='reportedReceived'){if(!v)return null;if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(v))throw Error('Use a non-negative amount with no more than two decimal places.');const amount=v.replaceAll(',','');if(!Number.isSafeInteger(Math.round(Number(amount)*100)))throw Error('The amount is too large.');return amount;}
 if(['firstBillingDate','lastReminderDate','promisedDate'].includes(field))return dateValue(v,today,field==='promisedDate');
 if(field==='lastReminderStage'){if(!v||/^(no reminders|none)$/i.test(v))return null;const stage=stages.find(s=>[s.key,s.label].some(x=>x.toLowerCase()===v.toLowerCase()));if(!stage)throw Error('Choose a reminder stage configured in collection rules.');return stage.key;}
 if(field==='trackingStatus'){const status=trackingStatuses.find(s=>s.toLowerCase()===v.toLowerCase());if(status!==undefined)return status;if(/^not started$/i.test(v))return '';throw Error('Use a listed tracking status.');}
 if(value.length>(field==='note'?4000:160))throw Error(field==='note'?'Notes allow up to 4000 characters.':'Owner allows up to 160 characters.');return value;
}
export function planSheetPaste(text:string,rows:RegisterRow[],start:number,columns:PasteColumn[],today:string,stages:{key:string;label:string}[],firstValues?:RegisterValues):PasteEntry[]{
 const cells=parseSheetText(text),width=cells[0].length;
 if(start<0||start+cells.length>rows.length)throw Error('The paste extends beyond the loaded invoice rows. No new invoices are created.');
 if(width>columns.length||columns.slice(0,width).some(c=>!c.field))throw Error('The paste includes read-only OPERA columns. Start in a manual field and paste only editable columns.');
 return cells.map((line,index)=>{const row=rows[start+index],values={...(index===0&&firstValues?firstValues:registerValues(row))};
  line.forEach((value,i)=>{try{const field=columns[i].field!;Object.assign(values,{[field]:valueFor(field,value,today,stages)});}catch(e){throw Error(`Invoice ${row.invoice_no??row.id} / ${columns[i].label}: ${e instanceof Error?e.message:'Invalid value'}`);}});
  if(columns.slice(0,width).some(c=>c.field==='lastReminderStage')&&!values.lastReminderStage)values.lastReminderDate=null;
  if(values.lastReminderStage&&!values.lastReminderDate)throw Error(`Invoice ${row.invoice_no??row.id}: include Date sent with the reminder stage.`);
  return {row,values,cells:line};
 });
}
