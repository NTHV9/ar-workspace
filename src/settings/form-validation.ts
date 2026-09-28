import {parseBillingPortal,validMailbox} from '../../worker/settings/validation';
import type {CollectionRound} from '../domain/collection-policy';
import type {FieldIssues} from './field-feedback';
export function accountFieldIssues(value:{term:string;portal:string;recipients:Record<string,string>;billingInstructions:string;collectionInstructions:string}):FieldIssues{
 const issues:FieldIssues={};const term=Number(value.term);
 if(value.term.trim()&&(!Number.isSafeInteger(term)||term<0||term>2147483647))issues.term='Enter a whole number from 0 to 2,147,483,647 days, or leave this blank.';
 try{parseBillingPortal(value.portal.trim()||null);}catch{issues.portal='Use an HTTPS address without spaces, a username or a password.';}
 for(const key of ['billingInstructions','collectionInstructions'] as const)if(value[key].length>4000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value[key]))issues[key]='Use up to 4,000 characters without control characters.';
 for(const purpose of ['billing','collection']){const seen=new Set<string>();for(const kind of ['to','cc','bcc']){const key=purpose+'_'+kind,addresses=(value.recipients[key]??'').split(/[,;\n]/).map(v=>v.trim()).filter(Boolean);if(addresses.length>200)issues[key]='Use no more than 200 addresses in this field.';for(const address of addresses){if(!validMailbox(address))issues[key]='Enter email addresses only, separated by commas or new lines.';else if(seen.has(address.toLowerCase()))issues[key]='This address is already used in this recipient profile.';seen.add(address.toLowerCase());}}}
 return issues;
}
export function policyFieldIssues(rounds:CollectionRound[],dayEdits:Record<string,string>,reason:string):FieldIssues{
 const issues:FieldIssues={},active=rounds.map((round,index)=>({round,index})).filter(v=>v.round.active),labels=new Map<string,number>();
 for(const [index,round] of rounds.entries()){const raw=dayEdits[round.key]??String(round.offsetDays),days=Number(raw),prefix='round-'+index;
  if(!round.label.trim()||round.label.length>80||/[\x00-\x1f\x7f]/.test(round.label))issues[prefix+'-label']='Enter a round label of up to 80 characters.';
  if(!/^-?[0-9]+$/.test(raw)||!Number.isSafeInteger(days)||days<(round.anchor==='due'?-365:0)||days>3650)issues[prefix+'-days']=round.anchor==='due'?'Enter whole days from -365 to 3650.':'Enter whole days from 0 to 3650.';
  if(round.active){const name=round.label.trim().toLowerCase(),prior=labels.get(name);if(prior!==undefined){issues['round-'+prior+'-label']='Active round labels must be different.';issues[prefix+'-label']='Active round labels must be different.';}labels.set(name,index);}
 }
 if(!active.length)issues['round-0-active']='Activate at least one collection round.';
 else{if(active[0].round.anchor!=='due')issues['round-'+active[0].index+'-timing']='The first active round must start from the due date.';if(active.filter(v=>v.round.terminal).length!==1||!active.at(-1)!.round.terminal)issues['round-'+active.at(-1)!.index+'-terminal']='Mark only the last active round as terminal.';
  let previousDue=-366,afterSent=false;for(const {round,index} of active){const days=Number(dayEdits[round.key]??round.offsetDays);if(round.anchor==='previous_sent')afterSent=true;else if(afterSent)issues['round-'+index+'-timing']='Due-date rounds must come before previous-send rounds.';else if(days<=previousDue)issues['round-'+index+'-days']='Use a later due-date offset than the previous active round.';if(round.anchor==='due')previousDue=days;}}
 if(!reason.trim()||reason.length>1000||/[\x00-\x1f\x7f]/.test(reason))issues.reason='Enter a reason of up to 1,000 characters on one line.';
 return issues;
}
export function historyFieldIssues(billing:string,stage:string,sent:string,today:string):FieldIssues{
 const issues:FieldIssues={};for(const [key,value] of [['billing',billing],['sent',stage?sent:'']])if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value||value>today))issues[key]='Use a valid actual date no later than today.';
 if(stage&&!sent)issues.sent='Enter the date this reminder was actually sent.';return issues;
}
