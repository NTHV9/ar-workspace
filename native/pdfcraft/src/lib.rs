use std::sync::Arc;
use pdfcraft_cos::{Document,Object,SaveOptions,write_full};
use pdfcraft_edit::{TextLine,text_lines,replace_line};
use pdfcraft_content::Pieces;
use serde_json::{Value,json};
use wasm_bindgen::prelude::*;
fn err(s:impl std::fmt::Display)->JsValue{JsValue::from_str(&s.to_string())}
fn same(a:&Value,b:&Value)->bool{match (a,b){(Value::Number(x),Value::Number(y))=>x.as_f64().zip(y.as_f64()).is_some_and(|(x,y)|(x-y).abs()<1e-8),(Value::Array(x),Value::Array(y))=>x.len()==y.len()&&x.iter().zip(y).all(|(a,b)|same(a,b)),(Value::Object(x),Value::Object(y))=>x.len()==y.len()&&x.iter().all(|(k,a)|y.get(k).is_some_and(|b|same(a,b))),_=>a==b}}
fn line(l:&TextLine)->Value{json!({"text":l.text,"rect":l.rect,"baseline":l.baseline(),"font":l.font,"baseFont":l.base_font,"size":l.size,"bold":l.bold,"italic":l.italic,"color":l.color,"decodable":l.decodable,"visualOrder":l.visual_order})}
fn content_ops(doc:&Document,page:usize)->Result<Vec<pdfcraft_content::Op>,JsValue>{
 let pages=pdfcraft_model::pages(doc);let p=pages.get(page).ok_or_else(||err("Missing page"))?;
 let contents=p.dict.get(b"Contents").ok_or_else(||err("Missing page content"))?;
 let objects=match &*doc.resolve(contents){Object::Array(a)=>a.clone(),_=>vec![contents.clone()]};
 let mut streams=Vec::new();let mut budget=8*1024*1024;
 for o in objects{let resolved=doc.resolve(&o);let Object::Stream(s)=&*resolved else{return Err(err("Invalid content"))};let bytes=s.decoded_within(budget).map_err(err)?;budget=budget.saturating_sub(bytes.len());streams.push(bytes);}
 let parsed=Pieces::join(&streams).parse();if parsed.skipped>0{return Err(err("Unparsed page content"));}
 Ok(parsed.ops)
}
fn nontext(doc:&Document,page:usize)->Result<Vec<u8>,JsValue>{Ok(pdfcraft_content::serialize_ops(&content_ops(doc,page)?.into_iter().filter(|op|!matches!(op.op.as_slice(),b"Tj"|b"TJ")).collect::<Vec<_>>()))}
fn guard(doc:&Document,page:usize)->Result<(),JsValue>{
 let pages=pdfcraft_model::pages(doc);let p=pages.get(page).ok_or_else(||err("Missing page"))?;
 if p.dict.get(b"Annots").is_some_and(|o|doc.resolve(o).as_array().is_none_or(|a|!a.is_empty())){return Err(err("Annotated pages are not qualified"));}
 if p.rotation(doc)!=0||p.user_unit(doc)!=1.0||p.crop(doc)[0]!=0.0||p.crop(doc)[1]!=0.0{return Err(err("Unsupported page transform"));}
 if let Some(resources)=p.dict.get(b"Resources").and_then(|o|doc.dict(o)){if let Some(fonts)=resources.get(b"Font").and_then(|o|doc.dict(o)){for (_,font) in fonts.iter(){if doc.dict(font).and_then(|d|d.get(b"Subtype").and_then(Object::as_name).map(|v|v.to_vec())).as_deref()==Some(b"Type3"){return Err(err("Type3 fonts are not qualified"));}}}}
 for op in content_ops(doc,page)?{
  match op.op.as_slice(){
   b"gs"|b"W"|b"W*"|b"Do"|b"BI"|b"sh"|b"BDC"|b"BMC"|b"'"|b"\""=>return Err(err("Unsupported transparency, clipping or artwork resource")),
   b"Tr" if op.num(0)!=Some(0.0)=>return Err(err("Only visible opaque fill text is qualified")),
   b"cm"|b"Tm"=>{let m=op.nums::<6>().ok_or_else(||err("Invalid matrix"))?;if m[0]!=1.0||m[1]!=0.0||m[2]!=0.0||m[3]!=1.0{return Err(err("Unsupported text transform"));}},
   b"Tz" if op.num(0)!=Some(100.0)=>return Err(err("Unsupported horizontal scale")),
   b"Ts" if op.num(0)!=Some(0.0)=>return Err(err("Unsupported text rise")),
   _=>{}
  }
 }
 Ok(())
}
/// One transaction, no persisted document handles, networking, block rewrite or font import.
#[wasm_bindgen]
pub fn inventory(bytes:Vec<u8>,page:usize)->Result<String,JsValue>{
 let doc=open(bytes)?;guard(&doc,page)?;let lines=text_lines(&doc,page).map_err(err)?;
 serde_json::to_string(&lines.iter().enumerate().map(|(i,l)|json!({"index":i,"style":line(l)})).collect::<Vec<_>>()).map_err(err)
}
fn open(bytes:Vec<u8>)->Result<Document,JsValue>{if bytes.len()>32*1024*1024{return Err(err("PDF exceeds native edit limit"));}if bytes.windows(10).any(|v|v==b"/ByteRange"){return Err(err("Signed PDFs are not qualified"));}let doc=Document::open(Arc::new(bytes)).map_err(err)?;if let Some(root)=doc.root(){if let Some(catalog)=doc.get(root).as_dict(){if catalog.get(b"AcroForm").is_some()||catalog.get(b"Perms").is_some(){return Err(err("Interactive or signed PDFs are not qualified"));}}}if doc.security().is_some(){return Err(err("Encrypted PDF unsupported"));}Ok(doc)}
#[wasm_bindgen]
pub fn replace(bytes:Vec<u8>,page:usize,expected:&str,text:&str)->Result<Vec<u8>,JsValue>{
 if text.is_empty()||text.len()>4096||text.contains(['\r','\n']){return Err(err("Only nonempty single-line replacements are qualified"));}
 let doc=open(bytes)?;guard(&doc,page)?;
 let before=text_lines(&doc,page).map_err(err)?;
 let expected:Value=serde_json::from_str(expected).map_err(err)?;
 let matches:Vec<usize>=before.iter().enumerate().filter(|(_,l)|same(&line(l),&expected)).map(|(i,_)|i).collect();
 if matches.len()!=1{return Err(err("Stale or ambiguous native target"));}let index=matches[0];let target=&before[index];
 if !target.decodable||target.visual_order{return Err(err("Unsupported source font"));}
 let mut draft=doc.clone();let result=replace_line(&mut draft,page,index,text).map_err(err)?;
 if result.substituted.is_some(){return Err(err("Font substitution refused"));}
 if nontext(&doc,page)?!=nontext(&draft,page)?{return Err(err("Untouched graphics operators changed"));}
 let after=text_lines(&draft,page).map_err(err)?;
 if after.len()!=before.len(){return Err(err("Unexpected line count"));}
 for (i,(a,b)) in before.iter().zip(&after).enumerate(){
  if i!=index {if !same(&line(a),&line(b)){return Err(err("Untouched text changed"));}continue;}
  let mut expected= line(a);let mut actual=line(b);expected["text"]=json!(text);expected.as_object_mut().unwrap().remove("rect");actual.as_object_mut().unwrap().remove("rect");
  if actual!=expected{return Err(err("Replacement text or styling changed"));}
  if b.rect.iter().any(|v|!v.is_finite())||b.rect[0]<a.rect[0]-0.75||b.rect[1]<a.rect[1]-0.75||b.rect[2]>a.rect[2]+0.75||b.rect[3]>a.rect[3]+0.75{return Err(err("Replacement exceeds original bounds"));}
 }
 let bytes=write_full(&draft,&SaveOptions::default()).map_err(err)?;
 // Validate the serialized candidate too, including all other pages' text.
 let reopened=open(bytes.clone())?;
 for p in 0..pdfcraft_model::pages(&doc).len(){let wanted=if p==page{after.clone()}else{text_lines(&doc,p).map_err(err)?};if nontext(&draft,p)?!=nontext(&reopened,p)?{return Err(err("Serialized graphics differ"));}let actual=text_lines(&reopened,p).map_err(err)?;if actual.len()!=wanted.len()||actual.iter().zip(&wanted).any(|(a,b)|!same(&line(a),&line(b))){return Err(err("Serialized text differs"));}}
 Ok(bytes)
}

