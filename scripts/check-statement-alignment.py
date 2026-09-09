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
   for header,right in zip(headers,[460,515,576]):
    assert header is not None and abs(header['x1']-right)<0.15, f'Page {page_no}: numeric header is not right-aligned with its data column'
 assert checked>0, 'No Statement table found'
 print('PASS: numeric header alignment')
