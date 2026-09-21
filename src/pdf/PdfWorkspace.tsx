import {InlineTextEditor} from './InlineTextEditor';
import {pageCanvasHeight,applyFlowEdit,MAX_FLOW_HEIGHT,sourceBandIsEmpty} from './flow';
import {FinalPdfPreview,type PreviewZoom} from './FinalPdfPreview';
import {useNativeEditing} from './use-native-editing';
import {mapSourceRect,mapSourceTextRect,overlaps} from './row-layout';
import {createReplacementLayer,measureLayerText} from './source-text';
import {insertTextLine,removeTextLine} from './text-lines';
import {deleteTextLayer,replacementForRun,sourceRunDeleted} from './source-edits';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowDown, ArrowUp, Check, ImagePlus, Plus, Redo2, Trash2, Undo2, X } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { detectText, exportProject, loadSources, renderPage, PdfLayerEditError } from './engine';
import { deliveryGroups, movePage, restoreProject } from './model';
import {displayScale,observeDisplay} from './display';
import type { DetectedText, PdfExportFile, PdfLayer, PdfProject, PdfProjectPage, PdfSourceDocument } from './types';
import './pdf-workspace.css';
export type { PdfExportFile, PdfProject, PdfSourceDocument } from './types';

type Props = { onDirtyChange?:(dirty:boolean)=>void; transient?:boolean; onReview?:(files:PdfExportFile[],next:'email'|'download')=>Promise<void|(()=>void)>; documents: PdfSourceDocument[]; initialProject?: PdfProject; initialDelivery?: PdfProject['delivery']; initialReviewed?:boolean; onContinueToEmail?:()=>void; accountName: string; hotel: string; selectedCount: number; onClose: () => void; onSave?: (files: PdfExportFile[], project: PdfProject) => Promise<void>; onSaveDraft?: (project: PdfProject) => Promise<void> };
const fonts = ['Arial', 'Georgia', 'Courier New', 'Tahoma', 'Plus Jakarta Sans'];
const uid = () => crypto.randomUUID();

function PageCanvas({ page, documents, className = '', scale = 1.5 }: { page: PdfProjectPage; documents: Map<string, PDFDocumentProxy>; className?: string; scale?: number }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [rasterScale,setRasterScale]=useState(scale);
  const [rendered,setRendered]=useState<PdfProjectPage|null>(null);
  useEffect(()=>{const element=container.current;if(!element)return;return observeDisplay(element,()=>{const next=displayScale(page,element.getBoundingClientRect().width,devicePixelRatio);setRasterScale(previous=>Math.abs(previous-next)<.01?previous:next);});},[page.width,page.height]);
  useEffect(() => {
    let current = true;
    const canvas = document.createElement('canvas');setRendered(null);
    renderPage(page, documents, canvas, rasterScale,{tolerant:true}).then(result => { if (current) { container.current?.replaceChildren(canvas); setRendered(page);setError(result.issues.length?'An edit needs attention. The original page remains visible.':''); } else canvas.width=canvas.height=0; }).catch(error => { if (current) setError(error instanceof Error?error.message:'Page could not be rendered. Reopen the original document.'); });
    return () => { current = false; };
  }, [page, documents, rasterScale]);
  return <div className={`pdf-canvas ${className}`} data-render-state={rendered===page?'ready':'rendering'} aria-label="PDF page"><div className="pdf-canvas-art" ref={container}/>{error&&<span className="pdf-canvas-warning" title={error} aria-label={error}>!</span>}</div>;
}

export function PdfWorkspace({ onDirtyChange, transient=false, onReview, documents: sources, initialProject, initialDelivery='combined', initialReviewed=false,onContinueToEmail, accountName, hotel, selectedCount, onClose, onSave, onSaveDraft }: Props) {
  const [companion,setCompanion]=useState(()=>matchMedia('(max-width:899px)').matches);
  useEffect(()=>{const media=matchMedia('(max-width:899px)'),change=()=>setCompanion(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  const [loaded, setLoaded] = useState<Map<string, PDFDocumentProxy>>(new Map());
  const [project, setProject] = useState<PdfProject | null>(null);
  const [persistedProject, setPersistedProject] = useState<PdfProject | null>(null);
  const [draftSaved, setDraftSaved] = useState(false), [closeConfirm, setCloseConfirm] = useState(false);
  const dirty = project !== null && project !== persistedProject;
  const [past, setPast] = useState<PdfProject[]>([]), [future, setFuture] = useState<PdfProject[]>([]);
  const [activeId, setActiveId] = useState(''), [selected, setSelected] = useState('');
  const [tool, setTool] = useState('replace'), [runs, setRuns] = useState<DetectedText[]>([]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState<PdfExportFile[] | null>(null), [previewIndex, setPreviewIndex] = useState(0);
  const [ack, setAck] = useState(false), [viewed, setViewed] = useState<number[]>([]),[previewRendering,setPreviewRendering]=useState(true);
  useEffect(()=>{if(companion){setPreview(null);setAck(false);}},[companion]);
  const [zoom, setZoom] = useState(90);
  const [showGuides,setShowGuides]=useState(false);
  const [packageOpen,setPackageOpen]=useState(true);
  const [previewZoom,setPreviewZoom]=useState<PreviewZoom>('fit-width');
  const canContinue=!!onContinueToEmail&&!dirty&&!busy&&(saved||initialReviewed);
  const textField=useRef<HTMLTextAreaElement>(null),inlineField=useRef<HTMLTextAreaElement>(null),activeInput=useRef<HTMLTextAreaElement|null>(null);
  const pendingTextFocus=useRef<{caret?:number}|null>(null);
  useLayoutEffect(()=>{applyTextFocus();},[selected,busy,project]);
  const [paperScale,setPaperScale]=useState(1);
  const stage = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const revision = useRef(0);
  const sourceSession = useRef(sources); sourceSession.current = sources;
  const activePage = useRef('');
  const reviewedProject = useRef<PdfProject | null>(null);
  const sourceModel = useRef<PdfProject | null>(null);
  const drag = useRef<{ id: string; x: number; y: number; layer: PdfLayer; resize: boolean; before: PdfProject } | null>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; workspace.current?.querySelector<HTMLButtonElement>('.pdf-close')?.focus(); return () => previous?.focus(); }, []);
  useEffect(() => { if (!preview) return; const previous = document.activeElement as HTMLElement | null; workspace.current?.querySelector<HTMLButtonElement>('.pdf-preview-dialog button')?.focus(); return () => previous?.focus(); }, [preview]);
  useEffect(() => { if (!closeConfirm) return; const previous = document.activeElement as HTMLElement | null; workspace.current?.querySelector<HTMLButtonElement>('.pdf-unsaved-dialog button')?.focus(); return () => previous?.focus(); }, [closeConfirm]);
  useEffect(()=>{onDirtyChange?.(dirty||busy||(transient&&past.length>0));return()=>onDirtyChange?.(false);},[dirty,busy,transient,past.length,onDirtyChange]);
  useEffect(() => { if (!dirty && !busy && !(transient && past.length > 0)) return; const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [dirty, busy, transient, past.length]);
  useEffect(() => {
    let current = true; let dispose: (() => void) | undefined;
    revision.current++; reviewedProject.current = null;
    setProject(null); setPersistedProject(null); setDraftSaved(false); setCloseConfirm(false); setError(''); setPreview(null); setAck(false); setViewed([]); setSaved(false); setSelected('');
    loadSources(sources).then(result => { dispose = result.dispose; if (current) { sourceModel.current=result.project; const restored = initialProject ? restoreProject(initialProject, result.project) : {...result.project,delivery:initialDelivery}; setLoaded(result.documents); setProject(restored); setPersistedProject(restored); setActiveId(restored.pages[0]?.id || ''); setPast([]); setFuture([]); } else dispose(); }).catch(e => { dispose?.(); if (current) setError(e instanceof Error ? e.message : 'Unable to open PDF.'); });
    return () => { current = false; revision.current++; dispose?.(); };
  }, [sources, initialProject, initialDelivery]);
  const visiblePages = project ? deliveryGroups(project, sources).flatMap(g => g.pages) : [];
  const page = visiblePages.find(p => p.id === activeId) || visiblePages[0];
  activePage.current = page?.id || '';
  const layer = page?.layers.find(l => l.id === selected);
  const canvasHeight=page?pageCanvasHeight(page):1;
  useEffect(()=>{const element=stage.current;if(!element||!page)return;return observeDisplay(element,()=>setPaperScale(element.getBoundingClientRect().width/page.width));},[page?.id,page?.width,zoom,loaded]);
  const originalRun=layer?.formField?runs.find(run=>run.field===layer.formField?.type&&run.sourceText?.runIndex===layer.formField?.runIndex):layer?.sourceText?runs.find(run=>run.sourceText?.runIndex===layer.sourceText?.runIndex):layer?.original?runs.find(run=>run.text===layer.original!.text&&Math.abs(run.x-layer.original!.x)<.01&&Math.abs(run.y-layer.original!.y)<.01):undefined;
  const textMetrics=layer&&!layer.deleted&&!['image','shape','whiteout'].includes(layer.kind)?measureLayerText(layer):null;
  const textOverflow=!!textMetrics&&(textMetrics.height>layer!.height+.5||textMetrics.width>layer!.width+.5);
  const textCollision=!!layer?.sourceText&&!!textMetrics&&runs.some(run=>{if(!run.text.trim()||page&&replacementForRun(page,run)?.text==='')return false;if(layer.maskOriginal!==false&&run.sourceText?.runIndex===layer.sourceText?.runIndex)return false;const rect=mapSourceTextRect(run,page?.rowEdits??[],run.fontSize*.72);return !!rect&&overlaps({x:layer.x,y:layer.y,width:textMetrics.width,height:textMetrics.height},rect);});
  const native=useNativeEditing({page,documents:loaded,runs,layer,tool,setTool,busy,setBusy,onError:setError,onChange:changed=>{if(project){const added=changed.layers.find(l=>l.tableRow&&!page?.layers.some(old=>old.id===l.id));commit({...project,pages:project.pages.map(p=>p.id===changed.id?changed:p)});if(added){setSelected(added.id);focusText(0);}else if(!changed.layers.some(l=>l.id===selected))setSelected('');}}});
  useEffect(() => { let current = true; setRuns([]); if (page) detectText(page, loaded).then(value => { if (current) setRuns(value); }).catch(() => { if (current) setError('Text detection unavailable. Use a text box or whiteout and review the exported page.'); }); return () => { current = false; }; }, [page?.id, loaded]);
  function invalidate() { revision.current++; reviewedProject.current = null; setPreview(null); setAck(false); setViewed([]); setSaved(false); setDraftSaved(false); }
  function requestClose() { if (dirty || busy || (transient && past.length > 0)) setCloseConfirm(true); else onClose(); }
  async function saveDraft(closeAfter = false) {
    if (!project || !onSaveDraft || busy) return;
    const startedAt = revision.current, session = sources, snapshot = project;
    setBusy(true); setError('');
    try {
      if(!sourceModel.current)throw new Error('Original document model unavailable');restoreProject(snapshot,sourceModel.current);
      await onSaveDraft(snapshot);
      if (startedAt !== revision.current || session !== sourceSession.current) return;
      setPersistedProject(snapshot); setDraftSaved(true);
      if (closeAfter) { setCloseConfirm(false); onClose(); }
    } catch (e) { if (startedAt === revision.current && session === sourceSession.current) setError(e instanceof Error ? e.message : 'Draft save failed. Your edits are still open.'); }
    finally { setBusy(false); }
  }
  function commit(next: PdfProject) { if (!project||!sourceModel.current) return; try{restoreProject(next,sourceModel.current);}catch{setError('This change exceeds safe page, layer, text or image limits and was not applied.');return;} setError('');setPast(p => [...p.slice(-49), project]); setFuture([]); setProject(next); invalidate(); }
  function fitText(next:PdfLayer):PdfLayer {
    if(!page||['image','shape','whiteout'].includes(next.kind))return next;
    const nextColumn=next.tableRow?Math.min(page.width,...page.layers.filter(l=>l.tableRow===next.tableRow&&l.x>next.x+1).map(l=>l.x-4)):page.width;
    const natural=measureLayerText(next);const width=Math.max(.1,Math.min(nextColumn-next.x,Math.max(next.original?.width??next.width,natural.naturalWidth+(next.sourceText?1:0))));
    const measured=measureLayerText({...next,width});return {...next,width,height:Math.min(MAX_FLOW_HEIGHT-next.y,Math.max(next.original?.height??next.fontSize*1.25,measured.height))};
  }
  function updateLayer(change:Partial<PdfLayer>){
    if(!page||!layer||layer.deleted||!project||busy)return;let next={...layer,...change},changed=page;
    const textChange='text'in change||'fontSize'in change||'font'in change||'bold'in change||'italic'in change;
    if(textChange){
      next=fitText(next);
      const siblings=layer.tableRow?page.layers.filter(l=>l.tableRow===layer.tableRow):[layer];
      const beforeBottom=Math.max(...siblings.map(l=>l.y+l.height)),afterBottom=Math.max(next.y+next.height,...siblings.filter(l=>l.id!==layer.id).map(l=>l.y+l.height));
      const delta=afterBottom-beforeBottom;
      const displayed=runs.flatMap(run=>{if(replacementForRun(page,run)?.text==='')return [];const rect=mapSourceTextRect(run,page.rowEdits??[],run.fontSize*.72);return rect?[rect]:[];});
      const rowBelow=displayed.filter(r=>r.y>layer.y+layer.fontSize*.8).sort((a,b)=>a.y-b.y)[0];
      const otherBelow=page.layers.filter(l=>l.id!==layer.id&&!l.deleted&&l.y>layer.y+layer.fontSize*.8).sort((a,b)=>a.y-b.y)[0];
      const nextY=Math.min(rowBelow?.y??Infinity,otherBelow?.y??Infinity);
      if(delta>.1){
        const at=layer.textFlow?layer.textFlow.at+layer.textFlow.height:layer.tableRow?beforeBottom:Math.min(Number.isFinite(nextY)?nextY-.1:Infinity,layer.y+layer.height);
        try{changed=applyFlowEdit(page,{id:uid(),kind:'insert',y:at,height:delta},siblings.map(l=>l.id));next.textFlow={at:layer.textFlow?.at??at,height:(layer.textFlow?.height??0)+delta};}catch(e){setError(e instanceof Error?e.message:'Unable to flow this text.');return;}
      }else if(delta<-.1&&layer.textFlow){
        const remove=Math.min(-delta,layer.textFlow.height),at=layer.textFlow.at+layer.textFlow.height-remove;
        const occupied=!sourceBandIsEmpty(page,at,remove)||displayed.some(r=>r.sourceText?.runIndex!==layer.sourceText?.runIndex&&r.y+r.fontSize*.72>=at&&r.y+r.fontSize*.72<at+remove)||page.layers.some(l=>l.id!==layer.id&&l.y<at+remove&&l.y+l.height>at);
        if(!occupied){try{changed=applyFlowEdit(page,{id:uid(),kind:'delete',y:at,height:remove},[layer.id]);next.textFlow=layer.textFlow.height-remove>.1?{at:layer.textFlow.at,height:layer.textFlow.height-remove}:undefined;}catch{/* Keep occupied or unverified spacing rather than remove another object. */}}
      }
    }else if('x'in change||'y'in change||'height'in change)next.textFlow=undefined;
    commit({...project,pages:project.pages.map(p=>p.id===page.id?{...changed,layers:changed.layers.map(l=>l.id===layer.id?next:l)}:p)});
  }
  function releaseTextSpace(before:PdfProjectPage,removed:PdfLayer):PdfProjectPage {
    const flow=removed.textFlow;if(!flow||!sourceBandIsEmpty(before,flow.at,flow.height))return before;
    if(before.layers.some(l=>l.id!==removed.id&&!l.deleted&&l.y<flow.at+flow.height&&l.y+l.height>flow.at))return before;
    try{return applyFlowEdit(before,{id:uid(),kind:'delete',y:flow.at,height:flow.height},[removed.id]);}catch{return before;}
  }
  function deleteSelected(){
    if(!page||!layer||!project||busy)return;
    const changed=deleteTextLayer(releaseTextSpace(page,layer),layer);
    commit({...project,pages:project.pages.map(p=>p.id===page.id?changed:p)});setSelected('');
  }
  function restoreOriginalText(){
    if(!page||!layer||!originalRun||!project||busy)return;
    const changed=releaseTextSpace(page,layer),position=mapSourceTextRect(originalRun,changed.rowEdits??[],originalRun.fontSize*.72);if(!position)return;
    const restored={...createReplacementLayer(originalRun,layer.id),x:position.x,y:position.y,...(layer.formField?{formField:layer.formField}:{})};
    commit({...project,pages:project.pages.map(p=>p.id===page.id?{...changed,layers:changed.layers.map(l=>l.id===layer.id?restored:l)}:p)});focusText();
  }
  function applyTextFocus(){
    const pending=pendingTextFocus.current;if(!pending)return;
    const input=inlineField.current??textField.current;
    if(!input||input.closest('[inert]'))return;
    input.focus();if(document.activeElement!==input)return;activeInput.current=input;
    if(pending.caret!==undefined)input.setSelectionRange(pending.caret,pending.caret);pendingTextFocus.current=null;
  }
  function focusText(caret?:number){pendingTextFocus.current={caret};requestAnimationFrame(applyTextFocus);}
  function changeLine(remove=false){if(!layer)return;const input=activeInput.current??inlineField.current??textField.current,start=input?.selectionStart??layer.text.length,end=input?.selectionEnd??start;const edit=remove?removeTextLine(layer.text,start,end):insertTextLine(layer.text,start,end);updateLayer({text:edit.text});focusText(edit.caret);}
  function restoreFormatting(){if(!layer||!originalRun||!page)return;const fresh=createReplacementLayer(originalRun,layer.id),position=layer.maskOriginal===false?layer:mapSourceTextRect(originalRun,page.rowEdits??[],originalRun.fontSize*.72);if(!position)return;updateLayer({...fresh,x:position.x,y:position.y,text:layer.text,...(layer.maskOriginal===false?{maskOriginal:false}:{})});focusText();}
  function chooseFont(font:string){if(!layer)return;if(font==='__source__'){restoreFormatting();return;}updateLayer({font,sourceText:undefined,...(layer.maskOriginal===false?{kind:'text',maskOriginal:undefined,original:undefined}:{})});}
  function addLayer(kind: PdfLayer['kind'], original?: DetectedText, image?: string,position?:{x:number;y:number}) {
    if (!page || !project) return;
    if(kind==='replacement'&&original){
      const formField=original.field&&original.sourceText?{type:original.field,runIndex:original.sourceText.runIndex}:undefined;
      const existing=page.layers.find(l=>formField&&l.formField?.type===formField.type&&l.formField.runIndex===formField.runIndex)||page.layers.find(l=>(l.maskOriginal!==false||original.field==='voucher-number'&&!l.tableRow)&&l.original&&l.original.text===original.text&&Math.abs(l.original.x-original.x)<.01&&Math.abs(l.original.y-original.y)<.01);
      if(existing){if(formField&&(!existing.formField||existing.deleted))commit({...project,pages:project.pages.map(p=>p.id===page.id?{...p,layers:p.layers.map(l=>l.id===existing.id?{...l,formField,deleted:undefined,...(l.deleted?{text:''}:{})}:l)}:p)});setSelected(existing.id);setTool('replace');focusText();return;}
      const position=mapSourceTextRect(original,page.rowEdits??[],original.fontSize*.72);if(!position)return;const item=createReplacementLayer(original,uid());item.x=position.x;item.y=position.y;if(formField)item.formField=formField;commit({...project,pages:project.pages.map(p=>p.id===page.id?{...p,layers:[...p.layers,item]}:p)});setSelected(item.id);setTool('replace');focusText();return;
    }
    const item: PdfLayer = { id: uid(), kind, x: original?.x ?? 45, y: original?.y ?? 70, width: original ? Math.max(original.width + 8, 80) : 210, height: original ? Math.max(original.height + 5, 26) : 65, text: original?.text ?? (kind === 'stamp' ? 'REVIEWED' : kind === 'note' ? 'Note' : kind === 'text' ? 'Enter text' : ''), color: '#173a62', fill: kind === 'note' ? '#fff1b8' : '#ffffff', font: 'Arial', fontSize: Math.max(6,Math.min(144,original?.fontSize ?? 14)), bold: kind === 'stamp', italic: false, image, ...(original ? { original: { ...original } } : {}) };
    if(position){item.x=Math.max(0,Math.min(page.width-20,position.x));item.y=Math.max(0,Math.min(canvasHeight-20,position.y));item.width=Math.min(210,page.width-item.x);item.height=Math.min(65,canvasHeight-item.y);item.text='';}
    commit({ ...project, pages: project.pages.map(p => p.id === page.id ? { ...p, layers: [...p.layers, item] } : p) }); setSelected(item.id); setTool(['image','shape','whiteout'].includes(kind)?'select':'replace');if(!['image','shape','whiteout'].includes(kind))focusText();
  }
  function navigateCell(backwards:boolean){
    if(!page||!layer?.tableRow)return false;
    const cells=page.layers.filter(l=>l.tableRow===layer.tableRow&&!l.deleted).sort((a,b)=>a.x-b.x),index=cells.findIndex(l=>l.id===layer.id),next=cells[index+(backwards?-1:1)];
    if(!next)return false;setSelected(next.id);focusText();return true;
  }
  function startDrag(event: PointerEvent<HTMLButtonElement>, item: PdfLayer, resize = false) {
    if (!project) return; invalidate(); event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setSelected(item.id);
    drag.current = { id: item.id, x: event.clientX, y: event.clientY, layer: item, resize, before: project };
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const d = drag.current; if (!d || !page || !project || !stage.current) return;
    const scale = stage.current.getBoundingClientRect().width / page.width;
    const dx = (event.clientX - d.x) / scale, dy = (event.clientY - d.y) / scale;
    const next = d.resize ? { width: Math.max(15, Math.min(page.width - d.layer.x, d.layer.width + dx)), height: Math.max(15, Math.min(canvasHeight - d.layer.y, d.layer.height + dy)) } : { x: Math.max(0, Math.min(page.width - d.layer.width, d.layer.x + dx)), y: Math.max(0, Math.min(canvasHeight - d.layer.height, d.layer.y + dy)) };
    setProject({ ...project, pages: project.pages.map(p => p.id === page.id ? { ...p, layers: p.layers.map(l => l.id === d.id ? { ...l, ...next, textFlow:undefined } : l) } : p) });
  }
  function endDrag() { if (drag.current) { const before = drag.current.before; setPast(p => [...p.slice(-49), before]); setFuture([]); invalidate(); drag.current = null; } }
  async function makePreview() {
    if (!project) return;const startedAt=revision.current,session=sources;setBusy(true);setError('');
    try {
      const files=await exportProject(project,sources,loaded);
      if(startedAt!==revision.current||session!==sourceSession.current)return;
      reviewedProject.current=project;setPreview(files);setPreviewIndex(0);setAck(false);setViewed([]);
    }catch(e){
      if(startedAt===revision.current&&session===sourceSession.current){
        const failedPage=e instanceof PdfLayerEditError?visiblePages.find(p=>p.id===e.pageId&&p.layers.some(l=>l.id===e.layerId)):undefined;
        if(e instanceof PdfLayerEditError&&failedPage){
          setActiveId(failedPage.id);setSelected(e.layerId);setTool('replace');
          const pageNumber=visiblePages.indexOf(failedPage)+1;
          setError(e.kind==='source-font'?'Page '+pageNumber+': choose a replacement font for the selected text, then open Preview again.':'Page '+pageNumber+': '+e.message);
          focusText();
        }else setError(e instanceof Error?e.message:'Export failed.');
      }
    }finally{setBusy(false);}
  }
  async function save(next:'email'|'download'='email') { if (!project || reviewedProject.current !== project || !preview || !ack || viewed.length !== preview.length || previewRendering) return; const startedAt=revision.current;const session=sources;setBusy(true); setError(''); try { let complete:void|(()=>void)=undefined; if (onReview) complete=await onReview(preview,next); else if (onSave) await onSave(preview, reviewedProject.current); else for (const file of preview) { const url = URL.createObjectURL(new Blob([file.bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); } if(startedAt===revision.current&&session===sourceSession.current){setSaved(true);setPersistedProject(project);if(typeof complete==='function')complete();} } catch(e) { if(startedAt===revision.current&&session===sourceSession.current)setError(e instanceof Error ? e.message : 'The handoff could not be confirmed. Keep this tab open and retry with the same reviewed files.'); } finally { setBusy(false); } }
  const changeCount = project?.pages.reduce((n, p) => n + p.layers.length + (p.rowEdits?.length??0) + (p.sourcePage === null ? 1 : 0), 0) || 0;
  const pageChanges = project ? sources.flatMap(source => {
    const current = project.pages.filter(p => p.sourceId === source.id);
    const removed = Array.from({ length: loaded.get(source.id)?.numPages || 0 }, (_, i) => i + 1).filter(n => !current.some(p => p.sourcePage === n));
    const order = current.flatMap(p => p.sourcePage === null ? [] : [p.sourcePage]);
    const reordered = order.some((n, i) => i > 0 && n < order[i - 1]);
    const added = current.filter(p => p.sourcePage === null).length;
    return [...(removed.length ? [`${source.name}: removed original page${removed.length > 1 ? 's' : ''} ${removed.join(', ')}`] : []), ...(reordered ? [`${source.name}: original page order ${order.join(' → ')}`] : []), ...(added ? [`${source.name}: ${added} blank page${added > 1 ? 's' : ''} added`] : [])];
  }) : [];
  return <div className="pdf-workspace" data-companion={companion} data-guides={showGuides} data-package-open={packageOpen} ref={workspace} role="dialog" aria-modal={!preview&&!closeConfirm} aria-label="PDF Workspace" onKeyDown={event => {
    if (event.key === 'Escape' && closeConfirm) { event.preventDefault(); setCloseConfirm(false); return; }
    if (event.key === 'Escape' && busy) { event.preventDefault();return; }
    if (event.key === 'Escape' && preview) { event.preventDefault(); setPreview(null); return; }
    if (event.key === 'Escape') {event.preventDefault();setSelected('');setTool('replace');setError('');return;}
    if (event.key !== 'Tab') return;
    const scope = closeConfirm ? workspace.current?.querySelector('.pdf-unsaved-dialog') : preview ? workspace.current?.querySelector('.pdf-preview-dialog') : workspace.current;
    const focusable = Array.from(scope?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),iframe,[tabindex="0"]') || []).filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <header className="pdf-header"><img src="/katathani-collection.svg" alt="Katathani Collection"/><div><b>Katathani AR Collection System</b><small>Document preparation · PDF Workspace</small></div><div className="pdf-context"><small>{hotel} · {accountName}</small><b>{selectedCount} selected Invoice / Folio rows</b></div><button className="pdf-close" aria-label="Close PDF Workspace" onClick={requestClose}><X size={17}/></button></header>
    {companion&&<section className="pdf-companion"><h2>Continue editing on desktop</h2><p>{transient?'Your edits stay in this tab. Return to a larger screen to review and continue; closing this tab discards editing changes.':'Your current PDF project and unsaved edits are retained. Save a draft to resume on a larger screen. Final preview and export require desktop review.'}</p>{onSaveDraft&&<button disabled={busy||!project||!dirty} onClick={()=>void saveDraft(true)}>Save draft for desktop</button>}<button disabled={busy} onClick={requestClose}>Close workspace</button></section>}
    <nav className="pdf-steps" aria-label="Document steps">{['Scope & Purpose', 'Documents', 'PDF Review', 'Email', 'Handoff'].map((name, i) => <div key={name} className={i === 2 ? 'current' : i < 2 ? 'done' : ''}><span>{i < 2 ? <Check size={15}/> : i + 1}</span><div><b>{name}</b><small>{['Hotel & Account', 'Selected source PDFs', 'Edit, preview, flatten', transient?'Continue after review':onContinueToEmail?'Prepare after saving':'Separate email workspace', transient?'Send / download':'Private save / download'][i]}</small></div></div>)}</nav>
    {error && !closeConfirm && <p className="pdf-error" role="alert">{error}</p>}
    {!project ? <div className="pdf-empty">{error ? 'Document unavailable. Close and retry from the Account.' : 'Opening source PDFs…'}</div> : <div className="pdf-layout" inert={busy||!!preview||closeConfirm}>
      <aside className="pdf-package" id="pdf-package-panel" hidden={!packageOpen}><h2>Package</h2><p>Exact selected-only manifest</p><h3>Document content</h3>{([['statement','Statement only'],['invoices','Invoices / Folios only'],['both','Both']] as const).map(([value,label]) => <button key={value} className={`pdf-choice ${project.content === value ? 'chosen' : ''}`} disabled={value === 'statement' ? !sources.some(s=>s.kind==='statement') : value === 'invoices' ? !sources.some(s=>s.kind==='invoice') : !sources.some(s=>s.kind==='statement') || !sources.some(s=>s.kind==='invoice')} onClick={()=>commit({...project,content:value})}>{label}</button>)}
        <h3>Delivery shape</h3>{([['combined','One combined PDF'],['split','Statement + combined Invoices'],['separate','Statement + each Invoice']] as const).map(([value,label])=><button key={value} className={`pdf-choice ${project.delivery===value?'chosen':''}`} onClick={()=>commit({...project,delivery:value})}>{label}</button>)}
        <h3>Original documents <small>{sources.length}</small></h3>{sources.map(source=><div className="pdf-source" key={source.id}><b>{source.kind==='statement'?'STM':'INV'}</b><span>{source.name}<small>{project.pages.filter(p=>p.sourceId===source.id).length} pages</small></span></div>)}
        <p className="pdf-limit">Edit directly on the page. Hide Package for more space. Original PDFs and accounting balances stay unchanged.</p>
      </aside>
      <main className="pdf-editor"><div className="pdf-toolbar" aria-label="PDF tools"><button aria-label="Document package" aria-controls="pdf-package-panel" aria-expanded={packageOpen} onClick={()=>setPackageOpen(value=>!value)}>Package</button><button className={tool==='place-text'?'active':''} onClick={()=>{setTool('place-text');setSelected('');}}>Add text anywhere</button>{[['replace','Edit source text'],['text','Text box'],['select','Select'],['whiteout','Whiteout'],['shape','Shape'],['note','Note'],['stamp','Stamp']].map(([value,label])=><button key={value} className={tool===value?'active':''} onClick={()=>value==='select'||value==='replace'?setTool(value):addLayer(value as PdfLayer['kind'])}>{label}</button>)}<button className={tool==='objects'?'active':''} onClick={()=>{setTool('objects');setSelected('');}}>Move lines</button><button className={tool==='area'?'active':''} onClick={()=>{setTool('area');setSelected('');}}>Move table / area</button><label className="pdf-image-upload" title="Add PNG or JPEG image"><ImagePlus size={15}/><span>Image</span><input aria-label="Add image" type="file" accept="image/png,image/jpeg" onChange={async e=>{ const file=e.target.files?.[0]; if(!file)return; if(file.size>10_000_000){setError('Choose an image smaller than 10 MB.');return;} if(!['image/png','image/jpeg'].includes(file.type)){setError('Choose a PNG or JPEG image.');return;} const startedAt=revision.current;const imagePage=page?.id;const session=sources;const reader=new FileReader();reader.onload=()=>{if(startedAt!==revision.current||session!==sourceSession.current||imagePage!==activePage.current){setError('Image selection interrupted by another change. Choose the image again.');return;}addLayer('image',undefined,String(reader.result));};reader.readAsDataURL(file);e.target.value=''; }}/></label><button aria-label="Undo" disabled={!past.length} onClick={()=>{setFuture(f=>[project,...f]);setProject(past[past.length-1]);setPast(p=>p.slice(0,-1));setError('');invalidate();}}><Undo2 size={15}/></button><button aria-label="Redo" disabled={!future.length} onClick={()=>{setPast(p=>[...p,project]);setProject(future[0]);setFuture(f=>f.slice(1));setError('');invalidate();}}><Redo2 size={15}/></button><button aria-pressed={showGuides} onClick={()=>setShowGuides(value=>!value)}>Show guides</button><select aria-label="Zoom" value={zoom} onChange={e=>setZoom(Number(e.target.value))}>{[60,75,90,100,125,150,200].map(n=><option key={n} value={n}>{n}%</option>)}</select></div>
        <div className="pdf-document-tools">{native.controls}{tool==='place-text'&&<p role="status">Click on the page to add text. Press Esc to cancel.</p>}{tool==='replace'&&<p>Click text to edit directly. Use Tab between new row cells; Esc finishes editing.</p>}</div><div className="pdf-stage-row"><div className="pdf-thumbnails">{visiblePages.map((p,n)=><button className={p.id===page?.id?'active':''} key={p.id} onClick={()=>{setActiveId(p.id);setSelected('');}} aria-label={`Select page ${n+1}`}><PageCanvas page={p} documents={loaded} scale={0.16}/><small>{n+1}</small></button>)}<button aria-label="Add blank page" disabled={!page} onClick={()=>{if(!page)return;const blank={id:uid(),sourceId:page.sourceId,sourcePage:null,width:page.width,height:page.height,layers:[]};commit({...project,pages:[...project.pages,blank]});setActiveId(blank.id);}}><Plus size={16}/> Page</button></div>
          <div className="pdf-page-scroll">{page ? <><div className="pdf-page-controls"><span>Source page {visiblePages.indexOf(page)+1} of {visiblePages.length}</span><button aria-label="Move page earlier within document" onClick={()=>commit(movePage(project,page.id,-1))}><ArrowUp size={14}/></button><button aria-label="Move page later within document" onClick={()=>commit(movePage(project,page.id,1))}><ArrowDown size={14}/></button><button aria-label="Delete page" onClick={()=>{commit({...project,pages:project.pages.filter(p=>p.id!==page.id)});setSelected('');}}><Trash2 size={14}/></button></div><div className="pdf-paper" ref={stage} style={{width:`${zoom}%`,aspectRatio:`${page.width}/${canvasHeight}`}}><PageCanvas page={page} documents={loaded}/>{runs.map((run,i)=>{if(tool!=='replace'&&(tool!=='select'||!run.field)||sourceRunDeleted(page,run)&&!run.field)return null;const emptyVoucher=run.field==='voucher-number'&&(!run.text||sourceRunDeleted(page,run));const rect=mapSourceTextRect(run,page.rowEdits??[],run.fontSize*.72);return rect?<button key={i} className={`pdf-text-target ${emptyVoucher?'pdf-voucher-field':''}`} disabled={run.rotated} title={emptyVoucher?'Enter Voucher No.':run.rotated?'Rotated text: use whiteout and text box':`Edit: ${run.text}`} aria-label={emptyVoucher?'Enter Voucher No.':`Edit original text: ${run.text}`} style={{left:`${rect.x/page.width*100}%`,top:`${rect.y/canvasHeight*100}%`,width:`${rect.width/page.width*100}%`,height:`${rect.height/canvasHeight*100}%`}} onClick={()=>addLayer('replacement',run)}/>:null;})}{page.layers.filter(item=>!item.deleted).map(item=><div className={`pdf-layer-target ${selected===item.id?'selected editing-inline':''} ${(item.maskOriginal===false||item.tableRow)&&!item.text?'empty-cell':''}`} key={item.id} style={{left:`${item.x/page.width*100}%`,top:`${item.y/canvasHeight*100}%`,width:`${item.width/page.width*100}%`,height:`${item.height/canvasHeight*100}%`,fontSize:Math.min(12,Math.max(1,item.height*paperScale-2))}}>{selected===item.id&&!['image','shape','whiteout'].includes(item.kind)&&<InlineTextEditor layer={item} scale={paperScale} inputRef={inlineField} invalid={!!textMetrics?.unsupported} onChange={text=>updateLayer({text})} onNavigate={navigateCell} onFocus={input=>{activeInput.current=input;}}/>}<button className="pdf-layer-move" aria-label={`Move ${item.kind} layer`} onClick={()=>{setSelected(item.id);if(!['image','shape','whiteout'].includes(item.kind))focusText();}} onPointerDown={e=>startDrag(e,item)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}/>{selected===item.id&&<button className="pdf-resize" aria-label="Resize selected layer" onPointerDown={e=>startDrag(e,item,true)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}/>}</div>)}{native.overlay}{tool==='place-text'&&<button className="pdf-text-placement" aria-label="Place text on page" onClick={event=>{if(!stage.current)return;const bounds=stage.current.getBoundingClientRect();addLayer('text',undefined,undefined,event.detail?{x:(event.clientX-bounds.left)/bounds.width*page.width,y:(event.clientY-bounds.top)/bounds.height*canvasHeight}:{x:page.width/3,y:Math.min(canvasHeight/3,page.height/3)});}}/>}</div>{tool==='replace'&&!runs.length&&<p>No detected source text on this page. Use text boxes and whiteout.</p>}</> : <p className="pdf-empty">No pages in this content selection. Undo page deletion or select another content mode.</p>}</div>
        </div>
      </main>
      <aside className="pdf-review"><h2>Edit & Review</h2><p>Click and type on the page. Enter moves the content below.</p><div className="pdf-selection"><Check size={14}/> {selectedCount} selected rows · {hotel}</div><button className="pdf-wide pdf-primary pdf-review-primary" disabled={busy||!visiblePages.length} onClick={makePreview}>{busy?'Preparing…':'Open mandatory Preview'}</button>
        {layer?.deleted?<section className="pdf-properties"><h3>Text box deleted</h3><p>The original text has been removed from this PDF.</p><button className="pdf-wide" onClick={restoreOriginalText}>Restore original text</button></section>:layer ? <section className="pdf-properties"><h3>{layer.kind==='replacement'?'Edit text':'Selected '+layer.kind}</h3>{textMetrics?.unsupported&&<div role="alert" className="pdf-text-warning pdf-font-recovery"><p>The original font cannot draw the new text. Choose a replacement font and check its appearance in Preview.</p><button className="pdf-wide" disabled={busy} onClick={()=>chooseFont('Arial')}>Use Arial for this text</button></div>}{originalRun&&<div className="pdf-original-format"><span>{originalRun?.fontLabel??'Original font'} · {layer.fontSize} pt</span><button onClick={restoreFormatting}>Restore original formatting</button></div>}{!['image','shape','whiteout'].includes(layer.kind)&&<><label>Text<textarea ref={textField} aria-label="Layer text" onFocus={event=>{activeInput.current=event.currentTarget;}} spellCheck={false} rows={Math.min(10,Math.max(4,layer.text.split('\n').length+1))} value={layer.text} onChange={e=>updateLayer({text:e.target.value})}/></label><div className="pdf-line-actions"><button aria-label="Add text line" onClick={()=>changeLine()}>+ Line</button><button aria-label="Remove text line" onClick={()=>changeLine(true)}>− Line</button></div>{textCollision&&<p className="pdf-text-warning">Text overlaps another field. Add a row, move the box, or shorten the text.</p>}{textOverflow&&<p role="alert" className="pdf-text-warning">Text needs more space. Move or enlarge the box before Preview.</p>}<div className="pdf-property-row"><label>Font<select aria-label="Text font" value={layer.sourceText?'__source__':layer.font} onChange={e=>chooseFont(e.target.value)}>{layer.sourceText&&<option value="__source__">Original · {originalRun?.fontLabel??'PDF font'}</option>}{fonts.map(font=><option key={font}>{font}</option>)}</select></label><label>Size<input aria-label="Font size" type="number" min="0.1" max="1440" step="0.1" value={layer.fontSize} onChange={e=>updateLayer({fontSize:Math.max(.1,Math.min(1440,Number(e.target.value)))})}/></label></div><div className="pdf-property-row"><button aria-pressed={layer.bold} onClick={()=>updateLayer({bold:!layer.bold})}><b>Bold</b></button><button aria-pressed={layer.italic} onClick={()=>updateLayer({italic:!layer.italic})}><i>Italic</i></button></div></>}
        <div className="pdf-property-row"><label>Text / border<input aria-label="Text color" type="color" value={layer.color} onChange={e=>updateLayer({color:e.target.value})}/></label><label>Background / mask<input aria-label="Background color" type="color" value={layer.fill} onChange={e=>updateLayer({fill:e.target.value})}/></label></div><details className="pdf-geometry"><summary>Position & size</summary><div className="pdf-property-grid">{(['x','y','width','height'] as const).map(key=><label key={key}>{key}<input aria-label={`Layer ${key}`} type="number" value={Math.round(layer[key])} min={key==='width'||key==='height'?15:0} onChange={e=>updateLayer({[key]:Math.max(key==='width'||key==='height'?15:0,Number(e.target.value))})}/></label>)}</div></details>{layer.kind==='replacement'&&layer.original&&layer.maskOriginal!==false&&<button className="pdf-wide" onClick={restoreOriginalText}>Restore original text</button>}<button className="pdf-wide" onClick={deleteSelected}>{['image','shape','whiteout'].includes(layer.kind)?'Delete layer':'Delete text box'}</button></section>:<p className="pdf-limit">Click the words you want to change. Add text anywhere, or select a whole area to move it. Formatting appears here when text is selected.</p>}
        <h3>Differences from source <small>{changeCount} additions / edits</small></h3><div className="pdf-differences">{project.pages.flatMap((p,n)=>p.layers.map(l=><button key={l.id} onClick={()=>{setActiveId(p.id);setSelected(l.id);}}><b>Page {n+1} · {l.deleted?'Deleted text box':l.kind}</b>{l.original&&<del>{l.original.text}</del>}<span>{l.deleted?'Deleted':l.text||(['image','shape','whiteout'].includes(l.kind)?'Layout object':'Empty text box')}</span></button>))}{project.pages.flatMap((p,n)=>(p.rowEdits??[]).map(edit=><p key={edit.id}>Page {n+1} · {edit.kind==='insert'?'Added row':edit.kind==='delete'?'Removed row / empty lines':'Moved line / area'}</p>))}{!changeCount&&<p>No text or object edits.</p>}{pageChanges.map(change=><p key={change}>{change}</p>)}<p>{project.pages.length} pages in this PDF package. Preview includes page order and deletions.</p></div>{onSaveDraft&&<button className="pdf-wide pdf-draft-button" disabled={busy||!project||!dirty} onClick={()=>void saveDraft()}>Save draft</button>}{draftSaved&&<p role="status" className="pdf-selection">Draft saved. Final review is still required.</p>}{dirty&&<p className="pdf-unsaved-note">Unsaved changes</p>}{saved&&<p role="status" className="pdf-selection">{transient?'Reviewed files are ready for this attempt. PDF edits stay in this tab.':`Files ${onSave?'saved privately':'downloaded'}.`}</p>}{onContinueToEmail&&<div className="pdf-email-next"><button className="pdf-wide pdf-primary" disabled={transient?busy||!visiblePages.length:!canContinue} onClick={transient?makePreview:onContinueToEmail}>Continue to email</button><p>{transient?'Review the final PDFs, then prepare your message. Sending requires a separate confirmation.':canContinue?'Prepare the recipients and message next. Sending requires a separate confirmation.':'Review and save the final PDFs to continue.'}</p></div>}
      </aside>
    </div>}
    {preview&&<div className="pdf-preview-overlay"><section className="pdf-preview-dialog" role="dialog" aria-modal="true" aria-label="Final PDF preview"><header><div><h2>Final PDF preview</h2><p>{preview[previewIndex].name} · {previewIndex+1} of {preview.length} files</p></div><button aria-label="Close final preview" disabled={busy} onClick={()=>setPreview(null)}><X size={18}/></button></header><div className="pdf-preview-controls"><div className="pdf-preview-files">{preview.map((file,i)=><button className={i===previewIndex?'active':''} key={file.name} data-reviewed={viewed.includes(i)} onClick={()=>setPreviewIndex(i)}>{viewed.includes(i)&&<Check size={13}/>} {file.name}</button>)}</div><label className="pdf-preview-zoom">Preview zoom<select aria-label="Preview zoom" value={previewZoom} onChange={e=>setPreviewZoom(e.target.value==='fit-width'?e.target.value:Number(e.target.value))}><option value="fit-width">Fit width</option>{[25,50,75,100,125,150,200].map(n=><option value={n} key={n}>{n}%</option>)}</select></label></div><FinalPdfPreview zoom={previewZoom} file={preview[previewIndex]} onRendering={()=>{setPreviewRendering(true);setAck(false);}} onRendered={()=>{setPreviewRendering(false);setViewed(v=>v.includes(previewIndex)?v:[...v,previewIndex]);}}/><footer><label><input type="checkbox" disabled={viewed.length!==preview.length||previewRendering||busy} checked={ack} onChange={e=>setAck(e.target.checked)}/> I reviewed every output page and acknowledge the visible edits. PDF edits do not change AR balances or OPERA.</label><div className="pdf-preview-actions">{transient&&onContinueToEmail&&<button disabled={!ack||busy||viewed.length!==preview.length||previewRendering} onClick={()=>void save('download')}>Download reviewed PDFs</button>}<button className="pdf-primary" disabled={transient?!ack||busy||viewed.length!==preview.length||previewRendering:canContinue?false:!ack||busy||viewed.length!==preview.length||previewRendering||saved} onClick={transient?()=>void save(onContinueToEmail?'email':'download'):canContinue?onContinueToEmail:()=>void save()}>{transient?(busy?'Preparing files…':onContinueToEmail?'Continue to email':'Download reviewed PDFs'):canContinue?'Continue to email':saved?'Saved':busy?'Saving…':onSave?'Save reviewed PDFs privately':'Download reviewed PDFs'}</button></div></footer></section></div>}
    {closeConfirm&&<div className="pdf-preview-overlay pdf-close-overlay"><section className="pdf-unsaved-dialog" role="alertdialog" aria-modal="true" aria-label="Unsaved PDF changes"><h2>{busy?'Save in progress':'Keep your PDF changes?'}</h2><p>{busy?'Keep this workspace open until the handoff finishes.':transient?'PDF edits only live in this tab. Discarding them means editing again next time. Reviewed files already prepared for email remain available for that attempt.':onSaveDraft?'Your latest edits have not been saved. Save a draft to continue later, or discard these changes.':'Your latest edits have not been saved. Keep editing or discard these changes.'}</p>{error&&<p role="alert" className="pdf-error">{error}</p>}<button onClick={()=>setCloseConfirm(false)}>Keep editing</button>{onSaveDraft&&<button disabled={busy} onClick={()=>void saveDraft(true)}>Save draft and close</button>}<button disabled={busy} onClick={()=>{setCloseConfirm(false);onClose();}}>Discard changes and close</button></section></div>}
  </div>;
}
