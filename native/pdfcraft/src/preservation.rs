use pdfcraft_cos::{Document,Object,Dict};
use pdfcraft_content::Op;

/// Only balanced, text-free image painting may use image transforms/clipping.
/// Form XObjects and graphics-state changes remain outside this qualification.
pub fn image_block(doc:&Document,resources:&Dict,ops:&[Op],start:usize)->Option<usize>{
 if !ops.get(start)?.is("q"){return None;}
 let images=resources.get(b"XObject").and_then(|o|doc.dict(o))?;
 let mut depth=0usize;let mut painted=false;
 for (i,op) in ops.iter().enumerate().skip(start){
  match op.op.as_slice(){
   b"q"=>{depth+=1;if depth>64{return None;}},
   b"Q"=>{depth=depth.checked_sub(1)?;if depth==0{return painted.then_some(i);}},
   b"cm"=>{if op.nums::<6>()?.iter().any(|v|!v.is_finite()){return None;}},
   b"re"=>{if op.nums::<4>()?.iter().any(|v|!v.is_finite()){return None;}},
   b"W"|b"W*"|b"n"=>{},
   b"Do"=>{
    let name=op.operands.first()?.as_name()?;
    let object=doc.resolve(images.get(name)?);
    let Object::Stream(image)=&*object else{return None;};
    if image.dict.name(b"Subtype")!=Some(b"Image".as_slice()){return None;}
    let w=image.dict.int(b"Width")?;let h=image.dict.int(b"Height")?;
    if w<=0||h<=0||w.checked_mul(h)?>32_000_000{return None;}
    painted=true;
   },
   _=>return None,
  }
 }
 None
}

fn equal_dict(a:&Document,b:&Document,x:&Dict,y:&Dict,budget:&mut usize,depth:usize)->bool{
 x.len()==y.len()&&x.iter().all(|(key,value)|y.get(key).is_some_and(|other|equal_object(a,b,value,other,budget,depth+1)))
}
fn equal_object(a:&Document,b:&Document,x:&Object,y:&Object,budget:&mut usize,depth:usize)->bool{
 if *budget==0||depth>32{return false;}*budget-=1;
 let x=a.resolve(x);let y=b.resolve(y);
 match (&*x,&*y){
  (Object::Dict(x),Object::Dict(y))=>equal_dict(a,b,x,y,budget,depth),
  (Object::Stream(x),Object::Stream(y))=>x.raw==y.raw&&equal_dict(a,b,&x.dict,&y.dict,budget,depth),
  (Object::Array(x),Object::Array(y))=>x.len()==y.len()&&x.iter().zip(y).all(|(x,y)|equal_object(a,b,x,y,budget,depth+1)),
  (Object::Ref(_),_)|(_,Object::Ref(_))=>false,
  (x,y)=>x==y,
 }
}
/// Compare complete resolved resource graphs, including image masks and fonts.
/// Cyclic/oversized graphs refuse rather than silently omit preservation checks.
pub fn resources_unchanged(a:&Document,b:&Document,page:usize)->bool{
 let before=pdfcraft_model::pages(a);let after=pdfcraft_model::pages(b);
 let Some(x)=before.get(page).and_then(|p|p.dict.get(b"Resources")) else{return false;};
 let Some(y)=after.get(page).and_then(|p|p.dict.get(b"Resources")) else{return false;};
 equal_object(a,b,x,y,&mut 10000,0)
}
