import type {PdfProject,PdfSourceDocument} from './types';
import {deliveryGroups} from './model';
export function differencePages(project:PdfProject,sources:PdfSourceDocument[]){return deliveryGroups(project,sources).flatMap(g=>g.pages);}
