"""Check numeric Statement header alignment without exposing document text."""
import sys
import pdfplumber
for path in sys.argv[1:]:
 checked=0
 with pdfplumber.open(path) as doc:
  for page_no,page in enumerate(doc.pages,1):
   words=page.extract_words()
   headers=[next((w for w in words if w['text']==label),None) for label in ['Debit','Credit','Balance']]
   if headers[0] is None: continue
   checked+=1
   voucher=next(w for w in words if w['text']=='Voucher')
   assert abs((voucher['x0']+voucher['x1'])/2-369)<0.15, f'Page {page_no}: Voucher header is not centered'
   due=next((w for w in words if w['text']=='Balance' and w['top']>voucher['bottom']),{'top':705})
   lines={}
   for word in words:
    if word['x0']>=328 and word['x1']<=410 and voucher['bottom']<word['top']<due['top']:
     lines.setdefault(round(word['top'],1),[]).append(word)
   for line in lines.values():
    assert abs((min(w['x0'] for w in line)+max(w['x1'] for w in line))/2-369)<0.15, f'Page {page_no}: Voucher value is not centered'

   for header,right in zip(headers,[460,515,576]):
    assert header is not None and abs(header['x1']-right)<0.15, f'Page {page_no}: numeric header is not right-aligned with its data column'
 assert checked>0, 'No Statement table found'
 print('PASS: numeric headers and Voucher alignment')
