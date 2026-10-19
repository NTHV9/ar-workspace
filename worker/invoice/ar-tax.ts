// Evidence from OPERA's calculator is kept separate from posted transaction rows.
// It is usable only with independent, freshly read native invoice tax controls.
type Row=Record<string,unknown>;
const fail=():never=>{throw Error('document_invoice_ar_tax_unverified');};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail();
const array=(v:unknown):Row[]=>Array.isArray(v)?v.map(object):fail();
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:fail();
export const canonical=(v:unknown):string=>JSON.stringify(v,(_k,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
export interface ArSimulation {postingId:string;rules:unknown;rulesAfter:unknown;generatedRules:unknown[];calculation:unknown}
export function verifyArSimulation(e:Omit<ArSimulation,'postingId'>,hotel:string,code:string,gross:number){
 if(!Number.isFinite(gross)||!gross||canonical(e.rules)!==canonical(e.rulesAfter))fail();
 const root=object(object(e.rules).transactionCode),setup=object(root.trxSetup),generates=object(root.generatesSetup);
 if(root.hotelId!==hotel||root.code!==code||object(root.classification).type!=='Revenue'||setup.generatesType!=='INCLUSIVE'||setup.taxInclusive!==true||setup.nonTaxable!==false||root.compTransaction===true||array(root.associatedTransactionCodes).length)fail();
 const rules=array(generates.generates);if(!rules.length||rules.length>5)fail();
 const result=object(object(e.calculation).result),charges=array(result.charges),echo=charges.filter(c=>c.basePosting===true),parts=charges.filter(c=>c.basePosting===false);
 if(charges.length!==rules.length+2||echo.length!==1||parts.length!==rules.length+1||echo[0].transactionCode!==code||echo[0].sequence!==0||number(echo[0].amount)!==gross||number(result.totalAmount)!==gross)fail();
 parts.sort((a,b)=>number(a.sequence)-number(b.sequence));
 if(parts[0].transactionCode!==code||parts.some((c,n)=>c.sequence!==n||c.hotelId!==undefined&&c.hotelId!==hotel||Math.sign(number(c.amount))!==Math.sign(gross)))fail();
 const base=number(parts[0].amount),bucket:Record<string,number>={Base:base,Bucket1:0,Bucket2:0,Bucket3:0};
 const add=(raw:unknown,amount:number)=>{const flags=object(raw);for(const n of [1,2,3]){const flag=flags['bucket'+n];if(typeof flag!=='boolean')fail();if(flag)bucket['Bucket'+n]+=amount;}};
 add(generates.addBaseAmtTo,base);let total=base,vat=0;const seen=new Set([code]);
 for(let n=0;n<rules.length;n++){
  const g=rules[n],rule=object(g.rule),percentage=object(rule.percentage),posting=object(rule.posting),part=parts[n+1],generatedCode=String(g.code);
  if(seen.has(generatedCode)||part.transactionCode!==generatedCode)fail();seen.add(generatedCode);
  // Unknown rule properties cannot silently introduce conditional calculation.
  if(Object.keys(rule).some(k=>!['percentage','posting','uDFFunctionName','uDF'].includes(k))||rule.uDF||rule.uDFFunctionName||Object.keys(posting).some(k=>k!=='adjustmentType')||posting.adjustmentType!=='NoAdjustment'||percentage.useTaxBracket!==false||Object.keys(percentage).some(k=>!['amount','calculatedOn','useTaxBracket'].includes(k)))fail();
  const rate=number(percentage.amount),basis=bucket[String(percentage.calculatedOn)],amount=number(part.amount);
  if(rate<=0||rate>100||basis===undefined||Math.abs(amount-basis*rate/100)>1e-7)fail();
  const definitions=e.generatedRules.map(v=>object(object(v).transactionCode)).filter(d=>d.hotelId===hotel&&d.code===generatedCode);if(definitions.length!==1)fail();
  const definition=definitions[0],group=object(object(definition.classification).group).code;
  const nested=definition.generatesSetup?object(definition.generatesSetup).generates:undefined;
  if(nested!==undefined&&array(nested).length||definition.associatedTransactionCodes!==undefined&&array(definition.associatedTransactionCodes).length)fail();
  if(group==='TAX'&&/\bVAT\b/i.test(String(object(definition.description).defaultText))&&rate===7)vat+=amount;
  else if(group!=='SVC')fail();
  total+=amount;add(g.addGeneratedAmtTo,amount);
 }
 if(Math.abs(total-gross)>1e-7||!vat||Math.abs(vat*107-gross*7)>1e-6)fail();
 return {vat,nonTaxable:0};
}
