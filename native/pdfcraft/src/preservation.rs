use pdfcraft_cos::{Document,Object,Dict};
use pdfcraft_content::Op;

#[derive(Clone,Copy)]
struct PaintState{matrix:[f64;6],width:f64,miter:f64}
fn point(m:[f64;6],x:f64,y:f64)->[f64;2]{[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]}
fn concat(a:[f64;6],b:[f64;6])->[f64;6]{[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]}
fn include(bounds:&mut Option<[f64;4]>,p:[f64;2])->bool{
 if p.iter().any(|v|!v.is_finite()){return false;}
 *bounds=Some(match bounds{Some(b)=>[b[0].min(p[0]),b[1].min(p[1]),b[2].max(p[0]),b[3].max(p[1])],None=>[p[0],p[1],p[0],p[1]]});true
}
fn overlaps(a:[f64;4],b:[f64;4],pad:f64)->bool{a[0]-pad<b[2]&&a[2]+pad>b[0]&&a[1]-pad<b[3]&&a[3]+pad>b[1]}
/// Native text keeps its original paint order. Growing it must not hide the
/// new glyphs under a later source image/path. Earlier backgrounds are safe.
/// Curves and clipping use conservative bounds; uncertainty refuses admission.
pub fn later_paint_overlaps(ops:&[Op],changed:usize,region:[f64;4])->bool{
 let mut state=PaintState{matrix:[1.,0.,0.,1.,0.,0.],width:1.,miter:10.};let mut stack=Vec::new();let mut path=None;let mut points=0usize;let mut prior_points=0usize;
 for (index,op) in ops.iter().enumerate(){
  match op.op.as_slice(){
   b"q"=>stack.push(state),b"Q"=>{let Some(saved)=stack.pop()else{return true;};state=saved;},
   b"cm"=>{let Some(m)=op.nums::<6>()else{return true;};state.matrix=concat(state.matrix,m);if state.matrix.iter().any(|v|!v.is_finite()){return true;}},
   b"w"=>{let Some(w)=op.num(0)else{return true;};if !w.is_finite()||w<0.{return true;}state.width=w;},
   b"M"=>{let Some(m)=op.num(0)else{return true;};if !m.is_finite()||m<1.{return true;}state.miter=m;},
   b"m"|b"l"|b"c"|b"v"|b"y"=>{
    if op.is("m"){prior_points=prior_points.max(points);points=0;}
    let n=match op.op.as_slice(){b"c"=>6,b"v"|b"y"=>4,_=>2};
    for p in (0..n).step_by(2){let (Some(x),Some(y))=(op.num(p),op.num(p+1))else{return true;};if !include(&mut path,point(state.matrix,x,y)){return true;}points+=1;}
   },
   b"re"=>{let Some([x,y,w,h])=op.nums::<4>()else{return true;};for p in [[x,y],[x+w,y],[x+w,y+h],[x,y+h]]{if !include(&mut path,point(state.matrix,p[0],p[1])){return true;}}points+=4;},
   b"S"|b"s"|b"f"|b"F"|b"f*"|b"B"|b"B*"|b"b"|b"b*"=>{
    let stroke=matches!(op.op.as_slice(),b"S"|b"s"|b"B"|b"B*"|b"b"|b"b*");
    let scale=(state.matrix[0].abs()+state.matrix[2].abs()).max(state.matrix[1].abs()+state.matrix[3].abs());
    // A square cap on a diagonal reaches beyond half the width on either axis.
    let pad=if stroke{state.width*scale*if points.max(prior_points)>2{state.miter.max(2.)}else{2.}/2.}else{0.};
    if index>changed&&path.is_some_and(|p|overlaps(p,region,pad)){return true;}path=None;points=0;prior_points=0;
   },
   b"n"=>{path=None;points=0;prior_points=0;},
   b"Do"=>{if index>changed{let mut image=None;for p in [[0.,0.],[1.,0.],[1.,1.],[0.,1.]]{if !include(&mut image,point(state.matrix,p[0],p[1])){return true;}}if image.is_some_and(|p|overlaps(p,region,0.)){return true;}}},
   _=>{}
  }
 }
 false
}

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
