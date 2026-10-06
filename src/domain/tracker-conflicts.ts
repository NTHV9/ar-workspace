import type {RegionId} from './hotels';
export const trackerConflictCategories=['all','dates','references','identity','other'] as const;
export type TrackerConflictCategory=typeof trackerConflictCategories[number];
export const trackerConflictCategoryLabels:Record<TrackerConflictCategory,string>={all:'All differences',dates:'Billing & follow-up dates',references:'Reference values',identity:'Invoice identity',other:'Tracking details'};
export const trackerConflictFieldLabels:Readonly<Record<string,string>>={R:'First billing date',U:'Follow-up 1 date',V:'Follow-up 2 date',W:'Follow-up 3 date',S:'Credit term',T:'Due date',AA:'Difference',X:'Promised payment date',Y:'Tracking status',Z:'Reported received',AB:'Notes',AC:'Responsible person',identity:'Invoice identity'};
export interface TrackerConflict {id:string;rowKey:string;field:string;reason:string;sheetValue:unknown;webValue:unknown;revision:number;createdAt:string}
export interface TrackerConflictPage {region:RegionId;category:TrackerConflictCategory;counts:Record<TrackerConflictCategory,number>;rows:TrackerConflict[];nextCursor:string|null}
export function trackerConflictCategory(field:string):Exclude<TrackerConflictCategory,'all'>{return ['R','U','V','W'].includes(field)?'dates':['S','T','AA'].includes(field)?'references':field==='identity'?'identity':'other';}
export function validConflictPage(raw:unknown,region:RegionId,category:TrackerConflictCategory):raw is TrackerConflictPage{
 const p=raw as TrackerConflictPage;if(!p||p.region!==region||p.category!==category||!p.counts||trackerConflictCategories.some(c=>!Number.isSafeInteger(p.counts[c])||p.counts[c]<0)||p.counts.all!==p.counts.dates+p.counts.references+p.counts.identity+p.counts.other||!Array.isArray(p.rows)||p.rows.length>50||new Set(p.rows.map(r=>r.id)).size!==p.rows.length||p.rows.some(r=>!r||typeof r.id!=='string'||typeof r.rowKey!=='string'||typeof r.field!=='string'||typeof r.reason!=='string'||!Number.isSafeInteger(r.revision)||r.revision<1||typeof r.createdAt!=='string')||p.nextCursor!==null&&(typeof p.nextCursor!=='string'||p.nextCursor.length>800||p.rows.length!==50))return false;
 return p.rows.length<=p.counts[category]&&p.rows.every(r=>category==='all'||trackerConflictCategory(r.field)===category);
}
