import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowDown, ArrowUp, Check, ImagePlus, Plus, Redo2, Trash2, Undo2, X } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { detectText, exportProject, loadSources, renderPage } from './engine';
import { deliveryGroups, movePage, restoreProject } from './model';
import type { DetectedText, PdfExportFile, PdfLayer, PdfProject, PdfProjectPage, PdfSourceDocument } from './types';
import './pdf-workspace.css';
export type { PdfExportFile, PdfProject, PdfSourceDocument } from './types';

type Props = { documents: PdfSourceDocument[]; initialProject?: PdfProject; initialDelivery?: PdfProject['delivery']; accountName: string; hotel: string; selectedCount: number; onClose: () => void; onSave?: (files: PdfExportFile[], project: PdfProject) => Promise<void>; onSaveDraft?: (project: PdfProject) => Promise<void> };
const fonts = ['Arial', 'Georgia', 'Courier New', 'Tahoma', 'Plus Jakarta Sans'];
const uid = () => crypto.randomUUID();

function PageCanvas({ page, documents, className = '', scale = 1.5 }: { page: PdfProjectPage; documents: Map<string, PDFDocumentProxy>; className?: string; scale?: number }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    const canvas = document.createElement('canvas');
    renderPage(page, documents, canvas, scale).then(() => { if (current) { container.current?.replaceChildren(canvas); setError(''); } }).catch(() => { if (current) setError('Page could not be rendered. Reopen the original document.'); });
    return () => { current = false; };
  }, [page, documents, scale]);
  return <div className={`pdf-canvas ${className}`} ref={container} aria-label="PDF page">{error && <p role="alert">{error}</p>}</div>;
}

function FinalPdfPreview({ file, onRendered, onRendering }: { file: PdfExportFile; onRendered: () => void; onRendering: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const ready = useRef(onRendered); ready.current = onRendered;
  const starting = useRef(onRendering); starting.current = onRendering;
  const [status, setStatus] = useState('Rendering actual output pages…');
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true; let dispose: (() => void) | undefined;
    container.current?.replaceChildren(); setError(''); setStatus('Rendering actual output pages…'); starting.current();
    void (async () => {
      try {
        const result = await loadSources([{ id: 'final-preview', name: file.name, kind: 'statement', bytes: file.bytes }]);
        dispose = result.dispose;
        if (!current) { dispose(); return; }
        for (const [index, page] of result.project.pages.entries()) {
          if (!current) return;
          const canvas = document.createElement('canvas');
          canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `Final PDF page ${index + 1}`);
          await renderPage(page, result.documents, canvas, 1.25);
          if (current) container.current?.appendChild(canvas);
        }
        if (current) { setStatus(`${result.project.pages.length} output pages rendered. Review every page below.`); ready.current(); }
      } catch { if (current) { setError('Final PDF could not be rendered. Close the preview and retry. Saving remains disabled.'); setStatus(''); } }
    })();
    return () => { current = false; dispose?.(); };
  }, [file]);
  return <div className="pdf-final-scroll"><p role="status">{status}</p>{error && <p role="alert" className="pdf-error">{error}</p>}<div className="pdf-final-pages" ref={container}/></div>;
}

export function PdfWorkspace({ documents: sources, initialProject, initialDelivery='combined', accountName, hotel, selectedCount, onClose, onSave, onSaveDraft }: Props) {
  const [loaded, setLoaded] = useState<Map<string, PDFDocumentProxy>>(new Map());
  const [project, setProject] = useState<PdfProject | null>(null);
  const [persistedProject, setPersistedProject] = useState<PdfProject | null>(null);
  const [draftSaved, setDraftSaved] = useState(false), [closeConfirm, setCloseConfirm] = useState(false);
  const dirty = project !== null && project !== persistedProject;
  const [past, setPast] = useState<PdfProject[]>([]), [future, setFuture] = useState<PdfProject[]>([]);
  const [activeId, setActiveId] = useState(''), [selected, setSelected] = useState('');
  const [tool, setTool] = useState('select'), [runs, setRuns] = useState<DetectedText[]>([]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState<PdfExportFile[] | null>(null), [previewIndex, setPreviewIndex] = useState(0);
  const [ack, setAck] = useState(false), [viewed, setViewed] = useState<number[]>([]);
  const [zoom, setZoom] = useState(90);
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
  useEffect(() => { if (!dirty && !busy) return; const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [dirty, busy]);
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
  useEffect(() => { let current = true; setRuns([]); if (page) detectText(page, loaded).then(value => { if (current) setRuns(value); }).catch(() => { if (current) setError('Text detection unavailable. Use a text box or whiteout and review the exported page.'); }); return () => { current = false; }; }, [page?.id, loaded]);
  function invalidate() { revision.current++; reviewedProject.current = null; setPreview(null); setAck(false); setViewed([]); setSaved(false); setDraftSaved(false); }
  function requestClose() { if (dirty || busy) setCloseConfirm(true); else onClose(); }
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
  function updateLayer(change: Partial<PdfLayer>) { if (page && layer && project) commit({ ...project, pages: project.pages.map(p => p.id === page.id ? { ...p, layers: p.layers.map(l => l.id === layer.id ? { ...l, ...change } : l) } : p) }); }
  function addLayer(kind: PdfLayer['kind'], original?: DetectedText, image?: string) {
    if (!page || !project) return;
    const item: PdfLayer = { id: uid(), kind, x: original?.x ?? 45, y: original?.y ?? 70, width: original ? Math.max(original.width + 8, 80) : 210, height: original ? Math.max(original.height + 5, 26) : 65, text: original?.text ?? (kind === 'stamp' ? 'REVIEWED' : kind === 'note' ? 'Note' : kind === 'text' ? 'Enter text' : ''), color: '#173a62', fill: kind === 'note' ? '#fff1b8' : '#ffffff', font: 'Arial', fontSize: Math.max(6,Math.min(144,original?.fontSize ?? 14)), bold: kind === 'stamp', italic: false, image, ...(original ? { original: { ...original } } : {}) };
    commit({ ...project, pages: project.pages.map(p => p.id === page.id ? { ...p, layers: [...p.layers, item] } : p) }); setSelected(item.id); setTool('select');
  }
  function startDrag(event: PointerEvent<HTMLButtonElement>, item: PdfLayer, resize = false) {
    if (!project) return; invalidate(); event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setSelected(item.id);
    drag.current = { id: item.id, x: event.clientX, y: event.clientY, layer: item, resize, before: project };
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const d = drag.current; if (!d || !page || !project || !stage.current) return;
    const scale = stage.current.getBoundingClientRect().width / page.width;
    const dx = (event.clientX - d.x) / scale, dy = (event.clientY - d.y) / scale;
    const next = d.resize ? { width: Math.max(15, Math.min(page.width - d.layer.x, d.layer.width + dx)), height: Math.max(15, Math.min(page.height - d.layer.y, d.layer.height + dy)) } : { x: Math.max(0, Math.min(page.width - d.layer.width, d.layer.x + dx)), y: Math.max(0, Math.min(page.height - d.layer.height, d.layer.y + dy)) };
    setProject({ ...project, pages: project.pages.map(p => p.id === page.id ? { ...p, layers: p.layers.map(l => l.id === d.id ? { ...l, ...next } : l) } : p) });
  }
  function endDrag() { if (drag.current) { const before = drag.current.before; setPast(p => [...p.slice(-49), before]); setFuture([]); invalidate(); drag.current = null; } }
  async function makePreview() { if (!project) return; const startedAt = revision.current; const session = sources; setBusy(true); setError(''); try { const files = await exportProject(project, sources, loaded); if (startedAt !== revision.current || session !== sourceSession.current) return; reviewedProject.current = project; setPreview(files); setPreviewIndex(0); setAck(false); setViewed([]); } catch(e) { if (startedAt === revision.current && session === sourceSession.current) setError(e instanceof Error ? e.message : 'Export failed.'); } finally { setBusy(false); } }
  async function save() { if (!project || reviewedProject.current !== project || !preview || !ack || viewed.length !== preview.length) return; const startedAt=revision.current;const session=sources;setBusy(true); setError(''); try { if (onSave) await onSave(preview, reviewedProject.current); else for (const file of preview) { const url = URL.createObjectURL(new Blob([file.bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); } if(startedAt===revision.current&&session===sourceSession.current){setSaved(true);setPersistedProject(project);} } catch(e) { if(startedAt===revision.current&&session===sourceSession.current)setError(e instanceof Error ? e.message : 'Save failed. Your edits are still open; try again.'); } finally { setBusy(false); } }
  const changeCount = project?.pages.reduce((n, p) => n + p.layers.length + (p.sourcePage === null ? 1 : 0), 0) || 0;
  const pageChanges = project ? sources.flatMap(source => {
    const current = project.pages.filter(p => p.sourceId === source.id);
    const removed = Array.from({ length: loaded.get(source.id)?.numPages || 0 }, (_, i) => i + 1).filter(n => !current.some(p => p.sourcePage === n));
    const order = current.flatMap(p => p.sourcePage === null ? [] : [p.sourcePage]);
    const reordered = order.some((n, i) => i > 0 && n < order[i - 1]);
    const added = current.filter(p => p.sourcePage === null).length;
    return [...(removed.length ? [`${source.name}: removed original page${removed.length > 1 ? 's' : ''} ${removed.join(', ')}`] : []), ...(reordered ? [`${source.name}: original page order ${order.join(' → ')}`] : []), ...(added ? [`${source.name}: ${added} blank page${added > 1 ? 's' : ''} added`] : [])];
  }) : [];
  return <div className="pdf-workspace" ref={workspace} role="dialog" aria-modal={!preview&&!closeConfirm} aria-label="PDF Workspace" onKeyDown={event => {
    if (event.key === 'Escape' && closeConfirm) { event.preventDefault(); setCloseConfirm(false); return; }
    if (event.key === 'Escape' && preview) { event.preventDefault(); setPreview(null); return; }
    if (event.key !== 'Tab') return;
    const scope = closeConfirm ? workspace.current?.querySelector('.pdf-unsaved-dialog') : preview ? workspace.current?.querySelector('.pdf-preview-dialog') : workspace.current;
    const focusable = Array.from(scope?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),iframe,[tabindex="0"]') || []).filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <header className="pdf-header"><img src="/katathani-collection.svg" alt="Katathani Collection"/><div><b>Katathani AR Collection System</b><small>Document preparation · PDF Workspace</small></div><div className="pdf-context"><small>{hotel} · {accountName}</small><b>{selectedCount} selected Invoice / Folio rows</b></div><button className="pdf-close" aria-label="Close PDF Workspace" onClick={requestClose}><X size={17}/></button></header>
    <nav className="pdf-steps" aria-label="Document steps">{['Scope & Purpose', 'Documents', 'PDF Review', 'Email', 'Handoff'].map((name, i) => <div key={name} className={i === 2 ? 'current' : i < 2 ? 'done' : ''}><span>{i < 2 ? <Check size={15}/> : i + 1}</span><div><b>{name}</b><small>{['Hotel & Account', 'Selected source PDFs', 'Edit, preview, flatten', 'Not enabled here', 'Private save / download'][i]}</small></div></div>)}</nav>
    {error && !closeConfirm && <p className="pdf-error" role="alert">{error}</p>}
    {!project ? <div className="pdf-empty">{error ? 'Document unavailable. Close and retry from the Account.' : 'Opening source PDFs…'}</div> : <div className="pdf-layout">
      <aside className="pdf-package"><h2>Package</h2><p>Exact selected-only manifest</p><h3>Document content</h3>{([['statement','Statement only'],['invoices','Invoices / Folios only'],['both','Both']] as const).map(([value,label]) => <button key={value} className={`pdf-choice ${project.content === value ? 'chosen' : ''}`} disabled={value === 'statement' ? !sources.some(s=>s.kind==='statement') : value === 'invoices' ? !sources.some(s=>s.kind==='invoice') : !sources.some(s=>s.kind==='statement') || !sources.some(s=>s.kind==='invoice')} onClick={()=>commit({...project,content:value})}>{label}</button>)}
        <h3>Delivery shape</h3>{([['combined','One combined PDF'],['split','Statement + combined Invoices'],['separate','Statement + each Invoice']] as const).map(([value,label])=><button key={value} className={`pdf-choice ${project.delivery===value?'chosen':''}`} onClick={()=>commit({...project,delivery:value})}>{label}</button>)}
        <h3>Original documents <small>{sources.length}</small></h3>{sources.map(source=><div className="pdf-source" key={source.id}><b>{source.kind==='statement'?'STM':'INV'}</b><span>{source.name}<small>{project.pages.filter(p=>p.sourceId===source.id).length} pages</small></span></div>)}
        <p className="pdf-limit">Fixed-page editing with wrapping inside text boxes. No automatic Word-style paragraph or page reflow. Text detection is unavailable on scanned pages.</p>
      </aside>
      <main className="pdf-editor"><div className="pdf-toolbar" aria-label="PDF tools">{[['select','Select'],['text','Text box'],['replace','Edit source text'],['whiteout','Whiteout'],['shape','Shape'],['note','Note'],['stamp','Stamp']].map(([value,label])=><button key={value} className={tool===value?'active':''} onClick={()=>value==='select'||value==='replace'?setTool(value):addLayer(value as PdfLayer['kind'])}>{label}</button>)}<label className="pdf-image-upload" title="Add PNG or JPEG image"><ImagePlus size={15}/><span>Image</span><input aria-label="Add image" type="file" accept="image/png,image/jpeg" onChange={async e=>{ const file=e.target.files?.[0]; if(!file)return; if(file.size>10_000_000){setError('Choose an image smaller than 10 MB.');return;} if(!['image/png','image/jpeg'].includes(file.type)){setError('Choose a PNG or JPEG image.');return;} const startedAt=revision.current;const imagePage=page?.id;const session=sources;const reader=new FileReader();reader.onload=()=>{if(startedAt!==revision.current||session!==sourceSession.current||imagePage!==activePage.current){setError('Image selection interrupted by another change. Choose the image again.');return;}addLayer('image',undefined,String(reader.result));};reader.readAsDataURL(file);e.target.value=''; }}/></label><button aria-label="Undo" disabled={!past.length} onClick={()=>{setFuture(f=>[project,...f]);setProject(past[past.length-1]);setPast(p=>p.slice(0,-1));invalidate();}}><Undo2 size={15}/></button><button aria-label="Redo" disabled={!future.length} onClick={()=>{setPast(p=>[...p,project]);setProject(future[0]);setFuture(f=>f.slice(1));invalidate();}}><Redo2 size={15}/></button><select aria-label="Zoom" value={zoom} onChange={e=>setZoom(Number(e.target.value))}>{[60,75,90,100,125,150].map(n=><option key={n} value={n}>{n}%</option>)}</select></div>
        <div className="pdf-stage-row"><div className="pdf-thumbnails">{visiblePages.map((p,n)=><button className={p.id===page?.id?'active':''} key={p.id} onClick={()=>{setActiveId(p.id);setSelected('');}} aria-label={`Select page ${n+1}`}><PageCanvas page={p} documents={loaded} scale={0.16}/><small>{n+1}</small></button>)}<button aria-label="Add blank page" disabled={!page} onClick={()=>{if(!page)return;const blank={id:uid(),sourceId:page.sourceId,sourcePage:null,width:page.width,height:page.height,layers:[]};commit({...project,pages:[...project.pages,blank]});setActiveId(blank.id);}}><Plus size={16}/> Page</button></div>
          <div className="pdf-page-scroll">{page ? <><div className="pdf-page-controls"><span>Page {visiblePages.indexOf(page)+1} of {visiblePages.length}</span><button aria-label="Move page earlier within document" onClick={()=>commit(movePage(project,page.id,-1))}><ArrowUp size={14}/></button><button aria-label="Move page later within document" onClick={()=>commit(movePage(project,page.id,1))}><ArrowDown size={14}/></button><button aria-label="Delete page" onClick={()=>{commit({...project,pages:project.pages.filter(p=>p.id!==page.id)});setSelected('');}}><Trash2 size={14}/></button></div><div className="pdf-paper" ref={stage} style={{width:`${zoom}%`,aspectRatio:`${page.width}/${page.height}`}}><PageCanvas page={page} documents={loaded}/>{tool==='replace'&&runs.map((run,i)=><button key={i} className="pdf-text-target" disabled={run.rotated} title={run.rotated?'Rotated text: use whiteout and text box':`Edit: ${run.text}`} aria-label={`Edit original text: ${run.text}`} style={{left:`${run.x/page.width*100}%`,top:`${run.y/page.height*100}%`,width:`${run.width/page.width*100}%`,height:`${run.height/page.height*100}%`}} onClick={()=>addLayer('replacement',run)}/>)}{page.layers.map(item=><div className={`pdf-layer-target ${selected===item.id?'selected':''}`} key={item.id} style={{left:`${item.x/page.width*100}%`,top:`${item.y/page.height*100}%`,width:`${item.width/page.width*100}%`,height:`${item.height/page.height*100}%`}}><button className="pdf-layer-move" aria-label={`Move ${item.kind} layer`} onClick={()=>setSelected(item.id)} onPointerDown={e=>startDrag(e,item)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}/>{selected===item.id&&<button className="pdf-resize" aria-label="Resize selected layer" onPointerDown={e=>startDrag(e,item,true)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}/>}</div>)}</div>{tool==='replace'&&!runs.length&&<p>No detected source text on this page. Use text boxes and whiteout.</p>}</> : <p className="pdf-empty">No pages in this content selection. Undo page deletion or select another content mode.</p>}</div>
        </div>
      </main>
      <aside className="pdf-review"><h2>Review & Finalize</h2><p>Preview is mandatory before saving</p><div className="pdf-selection"><Check size={14}/> {selectedCount} selected rows · {hotel}</div>
        {layer ? <section className="pdf-properties"><h3>Selected {layer.kind}</h3>{!['image','shape','whiteout'].includes(layer.kind)&&<><label>Text<textarea aria-label="Layer text" value={layer.text} onChange={e=>updateLayer({text:e.target.value})}/></label><div className="pdf-property-row"><label>Font<select value={layer.font} onChange={e=>updateLayer({font:e.target.value})}>{fonts.map(font=><option key={font}>{font}</option>)}</select></label><label>Size<input aria-label="Font size" type="number" min="6" max="144" value={layer.fontSize} onChange={e=>updateLayer({fontSize:Math.max(6,Math.min(144,Number(e.target.value)))})}/></label></div><div className="pdf-property-row"><button aria-pressed={layer.bold} onClick={()=>updateLayer({bold:!layer.bold})}><b>Bold</b></button><button aria-pressed={layer.italic} onClick={()=>updateLayer({italic:!layer.italic})}><i>Italic</i></button></div></>}
        <div className="pdf-property-row"><label>Text / border<input aria-label="Text color" type="color" value={layer.color} onChange={e=>updateLayer({color:e.target.value})}/></label><label>Background / mask<input aria-label="Background color" type="color" value={layer.fill} onChange={e=>updateLayer({fill:e.target.value})}/></label></div><div className="pdf-property-grid">{(['x','y','width','height'] as const).map(key=><label key={key}>{key}<input aria-label={`Layer ${key}`} type="number" value={Math.round(layer[key])} min={key==='width'||key==='height'?15:0} onChange={e=>updateLayer({[key]:Math.max(key==='width'||key==='height'?15:0,Number(e.target.value))})}/></label>)}</div><button className="pdf-wide" onClick={()=>{commit({...project,pages:project.pages.map(p=>p.id===page.id?{...p,layers:p.layers.filter(l=>l.id!==layer.id)}:p)});setSelected('');}}>Delete layer</button></section>:<p className="pdf-limit">Select a layer to edit its text, style, position or size. Choose Edit source text, then select a detected text run.</p>}
        <h3>Differences from source <small>{changeCount} additions / edits</small></h3><div className="pdf-differences">{project.pages.flatMap((p,n)=>p.layers.map(l=><button key={l.id} onClick={()=>{setActiveId(p.id);setSelected(l.id);}}><b>Page {n+1} · {l.kind}</b>{l.original&&<del>{l.original.text}</del>}<span>{l.text||'Layout object'}</span></button>))}{!changeCount&&<p>No text or object edits.</p>}{pageChanges.map(change=><p key={change}>{change}</p>)}<p>{project.pages.length} pages in project. Page order and deletions are included in final preview.</p></div><div className="pdf-flatten"><b>Safe flatten on edited pages</b><p>Edited pages become opaque images in the output. Covered source text is not copied into those pages. Review every page; a white rectangle alone does not remove source data.</p></div><button className="pdf-wide" disabled={busy||!visiblePages.length} onClick={makePreview}>{busy?'Preparing…':'Open mandatory Preview'}</button>{onSaveDraft&&<button className="pdf-wide pdf-draft-button" disabled={busy||!project||!dirty} onClick={()=>void saveDraft()}>Save draft</button>}{draftSaved&&<p role="status" className="pdf-selection">Draft saved. Final review is still required.</p>}{dirty&&<p className="pdf-unsaved-note">Unsaved changes</p>}{saved&&<p role="status" className="pdf-selection">Files {onSave?'saved privately':'downloaded'}.</p>}
      </aside>
    </div>}
    {preview&&<div className="pdf-preview-overlay"><section className="pdf-preview-dialog" role="dialog" aria-modal="true" aria-label="Final PDF preview"><header><div><h2>Final PDF preview</h2><p>{preview[previewIndex].name} · {previewIndex+1} of {preview.length} files</p></div><button aria-label="Close final preview" onClick={()=>setPreview(null)}><X size={18}/></button></header><div className="pdf-preview-files">{preview.map((file,i)=><button className={i===previewIndex?'active':''} key={file.name} data-reviewed={viewed.includes(i)} onClick={()=>setPreviewIndex(i)}>{viewed.includes(i)&&<Check size={13}/>} {file.name}</button>)}</div><FinalPdfPreview file={preview[previewIndex]} onRendering={()=>{setViewed(v=>v.filter(i=>i!==previewIndex));setAck(false);}} onRendered={()=>setViewed(v=>v.includes(previewIndex)?v:[...v,previewIndex])}/><footer><label><input type="checkbox" disabled={viewed.length!==preview.length||busy} checked={ack} onChange={e=>setAck(e.target.checked)}/> I reviewed every output page and acknowledge the visible edits. PDF edits do not change AR balances or OPERA.</label><button className="pdf-primary" disabled={!ack||busy||viewed.length!==preview.length||saved} onClick={save}>{saved?'Saved':busy?'Saving…':onSave?'Save reviewed PDFs privately':'Download reviewed PDFs'}</button></footer></section></div>}
    {closeConfirm&&<div className="pdf-preview-overlay pdf-close-overlay"><section className="pdf-unsaved-dialog" role="alertdialog" aria-modal="true" aria-label="Unsaved PDF changes"><h2>{busy?'Save in progress':'Keep your PDF changes?'}</h2><p>{busy?'Keep this workspace open until the save finishes.':onSaveDraft?'Your latest edits have not been saved. Save a draft to continue later, or discard these changes.':'Your latest edits have not been saved. Keep editing or discard these changes.'}</p>{error&&<p role="alert" className="pdf-error">{error}</p>}<button onClick={()=>setCloseConfirm(false)}>Keep editing</button>{onSaveDraft&&<button disabled={busy} onClick={()=>void saveDraft(true)}>Save draft and close</button>}<button disabled={busy} onClick={()=>{setCloseConfirm(false);onClose();}}>Discard changes and close</button></section></div>}
  </div>;
}
