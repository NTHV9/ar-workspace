"""Prepare private invoice letterhead/layout assets from owner-supplied XDO RTFs.

This materializes known placeholders for layout extraction, not live report data.
RTFs and generated assets contain private banking details and must stay outside Git.
"""
from pathlib import Path
import argparse, importlib.util, re, json, subprocess, hashlib, base64, io
from PIL import ImageDraw
import pypdfium2 as pdfium
import pdfplumber

_spec=importlib.util.spec_from_file_location('rtf',Path(__file__).with_name('statement-template-trial.py'))
rtf=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(rtf)
TEMPLATES={'KAT':'kat_ar_folio_vat_revised.rtf','TSK':'tsk_folio_ar.rtf','TLKL':'tlkl_folio_vat_v1.rtf','WAKL':'wakl_ar_folio.rtf','TLFO':'tlfo_folio_ar.rtf','TSAN':'tsan_ar_folio_vat.rtf'}
FIELDS=['ADDRESSEE_FULL_ADDRESS','ARRIVAL_DATE_SHORT','DEPARTURE_DATE_SHORT','BALANCE','BALANCE_IN_WORDS','BILL_NUMBER_HEADER','CASHIER_NAME','CASHIER_NO','CHEQUE_NUMBER','CONFIRMATION_NO','CREDIT_CARD_NUMBER_DETAIL','EXPIRY_DATE_CHAR_DETAIL','EXTERNAL_REFERENCE','CUSTOM_REFERENCE','FIRST_NAME','LAST_NAME','GUEST_COMPANY','TRAVEL_AGENT_NAME','SOURCE_NAME','NO_OF_ADULTS','NO_OF_CHILDREN','P_CURRENCY','P_USER','REFERENCE_DISPLAYED','ROOM_NUMBER','SYSTEM_DATE','SYSTEM_TIME','TAX1_NO','TOTAL_CREDIT','TOTAL_DEBIT','TOTAL_GROSS','TOTAL_NON_TAXABLE','VAT1_AMT','/DATA/LIST_REPORT/REPORT/P_CURRENCY','xdofx:TOTAL_NET-TOTAL_NON_TAXABLE','TRX_DATE_SHORT','DESCRIPTION','DEBIT','CREDIT']
TOKENS={k:f'M{i:03}' for i,k in enumerate(FIELDS)}

def materialize(text,values):
    edits=[]
    for a,b in rtf.fields(text):
        field=text[a:b];exprs=re.findall(r'<\?(.{1,700}?)\?>',field)
        if not exprs:continue
        expr=exprs[0]
        if expr.startswith(('param@','for-each:','end ','if:','if@')):value=''
        elif expr in values:value=values[expr]
        else:raise ValueError('Unsupported XDO field: '+expr)
        result=field.split('{\\fldrslt',1)[1];fonts=re.findall(r'\\f(\d+)\b',result);sizes=re.findall(r'\\fs(\d+)\b',result);bold=re.findall(r'\\b(\d*)(?![A-Za-z0-9])',result)
        style=f"\\f{fonts[-1] if fonts else '0'}\\fs{sizes[-1] if sizes else '16'}"+('\\b' if bold and bold[-1]!='0' else '\\b0')
        edits.append((a,b,'{'+style+'\\cf0\\scaps0 '+rtf.escape(value)+'}' if value else ''))
    for a,b,x in reversed(edits):text=text[:a]+x+text[b:]
    text=text.replace('<?end body?>','');text=re.sub(r'<\?start(.*?)body\?>',lambda m:m[1].replace(':',''),text,flags=re.S)
    def consume(m):
        expression=re.sub(r'\\[A-Za-z]+-?\d* ?|[{}\r\n]','',m[0])
        if expression!='<?add-page-total:page_total;LINE_BALANCES?>':raise ValueError('Unsupported literal directive')
        return ''.join(x for x in re.findall(r'\\[A-Za-z]+-?\d* ?|[{}]',m[0]) if x.strip() not in [r'\rquote',r'\lquote',r'\rdblquote',r'\ldblquote'])
    text=re.sub(r'<\?add.*?\?>',consume,text,flags=re.S)
    text=re.sub(r'\\scaps(?![A-Za-z0-9])',r'\\scaps0',text)
    if '<?' in text:raise ValueError('Unresolved XDO directive')
    rtf.fields(text)
    return text

def prepare(root,out):
    out.mkdir(parents=True,exist_ok=True)
    for hotel,name in TEMPLATES.items():
        source=(root/name).read_text(encoding='latin1')
        for variant,values in [('markers',TOKENS),('blank',dict.fromkeys(FIELDS,''))]:
            values=values|{'P_CURRENCY':'THB','/DATA/LIST_REPORT/REPORT/P_CURRENCY':'THB'}
            (out/f'{hotel}-{variant}.rtf').write_text(materialize(source,values),encoding='latin1',newline='')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--templates',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--converter',type=Path,required=True);p.add_argument('--profile',type=Path,required=True);a=p.parse_args()
    prepare(a.templates,a.output)
    result=subprocess.run([str(a.converter.resolve()),'-env:UserInstallation='+a.profile.resolve().as_uri(),'--headless','--convert-to','pdf','--outdir',str(a.output.resolve()),*[str(x.resolve()) for x in a.output.glob('*.rtf')]],capture_output=True,text=True,timeout=90,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if result.returncode:raise RuntimeError('Private template conversion failed')
    for hotel in TEMPLATES:
        with pdfplumber.open(a.output/f'{hotel}-markers.pdf') as pdf:
            if len(pdf.pages)!=1:raise ValueError('Template fixture must fit one page')
            page=pdf.pages[0];words=page.extract_words(extra_attrs=['size','fontname']);positions={}
            for field,token in TOKENS.items():
                hits=[w for w in words if token in w['text']]
                if hits:positions[field]=[{k:w[k] for k in ['x0','x1','top','bottom','size','fontname']} for w in hits]
            if any(k not in positions for k in ['TRX_DATE_SHORT','TOTAL_DEBIT','BALANCE','BILL_NUMBER_HEADER']):raise ValueError('Missing layout marker')
            layout={'width':page.width,'height':page.height,'positions':positions,'labels':[{k:w[k] for k in ['text','x0','x1','top','bottom','size']} for w in words if w['text'] in ['DATE','DESCRIPTION','REFERENCE','Total','Guest','Signature','Page','No.']]}
            (a.output/f'{hotel}-layout.json').write_text(json.dumps(layout,indent=2),encoding='utf8')
        doc=pdfium.PdfDocument(str(a.output/f'{hotel}-markers.pdf'));bitmap=doc[0].render(scale=2).to_pil().convert('RGB');draw=ImageDraw.Draw(bitmap)
        for field,hits in positions.items():
            for hit in hits:draw.rectangle((hit['x0']*2-1,hit['top']*2-1,hit['x1']*2+1,hit['bottom']*2+1),fill='white')
        page_label=next(w for w in words if w['text']=='Page')
        date=positions['SYSTEM_DATE'][0];guests=positions['NO_OF_ADULTS'][0]
        for top,bottom in [(page_label['top'],page_label['bottom']),(date['top'],date['bottom']),(guests['top'],guests['bottom'])]:draw.rectangle((472*2,top*2-1,579*2,bottom*2+1),fill='white')
        bank_text=[]
        if hotel=='KAT':
            # This RTF has a hard paragraph break inside a fixed-height bank-name
            # cell. Preserve all source words and render them on one fitted line.
            labels=[next(w for w in words if w['text']==label and w['x0']<100 and w['top']>300) for label in ['Beneficiary','Bank','Account','Swift']]
            for i,label in enumerate(labels):
                lower=label['top']-3 if i==1 else label['top']-.2
                upper=(labels[i+1]['top']-3 if i==0 else labels[i+1]['top']-.2) if i<3 else label['bottom']+1
                value=' '.join(w['text'] for w in sorted(words,key=lambda w:(round(w['top'],1),w['x0'])) if 120<w['x0']<315 and lower<=w['top']<upper)
                if not value:raise ValueError('Banking source value missing')
                bank_text.append({'x':133.7,'top':label['top'],'text':value})
            draw.rectangle((132*2,(labels[0]['top']-1)*2,314*2,(labels[-1]['bottom']+1)*2),fill='white')
        bitmap.save(a.output/f'{hotel}-blank.png')
        row_top=positions['TRX_DATE_SHORT'][0]['top'];closing_top=positions['TOTAL_DEBIT'][0]['top']-5;closing_bottom=positions['BALANCE'][0]['bottom']+4;signature_top=positions['CASHIER_NAME'][0]['top']-20
        regions={'header':(0,row_top-4),'closing':(closing_top,closing_bottom),'signature':(signature_top,signature_top+35),'footer':(687,792)}
        images={}
        for name,(top,bottom) in regions.items():
            top=round(top*2)/2;bottom=round(bottom*2)/2;part=bitmap.crop((0,round(top*2),1224,round(bottom*2)));buf=io.BytesIO();part.save(buf,format='PNG',optimize=True);raw=buf.getvalue()
            (a.output/f'{hotel}-{name}.png').write_bytes(raw)
            images[name]={'width':612,'height':bottom-top,'png':base64.b64encode(raw).decode(),'sha256':hashlib.sha256(raw).hexdigest()}
        assets={'hotel':hotel,'version':'invoice-rtf-20260921-v1',**images,'bankText':bank_text,'layout':{'positions':positions,'rowTop':row_top,'closingTop':round(closing_top*2)/2,'signatureTop':round(signature_top*2)/2,'pageTop':page_label['top']}}
        (a.output/f'{hotel}-assets.json').write_text(json.dumps(assets,separators=(',',':')),encoding='utf8')
        print(json.dumps({'hotel':hotel,'layoutFields':len(positions),'templateSha256':hashlib.sha256((a.templates/TEMPLATES[hotel]).read_bytes()).hexdigest()}))
