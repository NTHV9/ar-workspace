-- A confirmed sent record stays queryable through its evidence lifecycle.
-- Confirmation and reconciliation already return existing sent results without updates.
create or replace trigger ar_preserve_sent_manifest before update of snapshot,owner,mode,stage,state,gmail_id,sent_at on ar_private.mail_deliveries for each row execute function ar_private.preserve_sent_report_evidence();
