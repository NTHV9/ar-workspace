import type {DocumentExport, DocumentJob} from '../../worker/documents/jobs';
import type {PdfExportFile} from './types';

type Receipt = Omit<DocumentExport, 'name'>;
type Attempt = {files: PdfExportFile[]; revision: number; receipts: DocumentExport[]; result?: DocumentJob};

// A lost review response must retry the exact revision and already-uploaded bytes.
// This state lives only in the current tab; it never stores an editable project.
export function createReviewHandoff() {
  let attempt: Attempt | undefined;
  let pending: Promise<DocumentJob> | undefined;
  return (files: PdfExportFile[], revision: number, upload: (file: PdfExportFile) => Promise<Receipt>, review: (revision: number, receipts: DocumentExport[]) => Promise<DocumentJob>): Promise<DocumentJob> => {
    if (pending) return pending;
    if (!attempt || attempt.files !== files) attempt = {files, revision, receipts: []};
    const current = attempt;
    pending = (async () => {
      if (current.result) return current.result;
      for (let i = current.receipts.length; i < files.length; i++) {
        const receipt = await upload(files[i]);
        current.receipts.push({...receipt, name: files[i].name});
      }
      current.result = await review(current.revision, current.receipts);
      return current.result;
    })().finally(() => { pending = undefined; });
    return pending;
  };
}
