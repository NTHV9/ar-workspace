/** Public, sanitized explanations shared by API and UI. No provider details. */
export const operationMessages:Record<string,string>={
 acceptance_recipient_not_authorized:'This isolated test can use only its explicitly authorized test recipient, with no CC or BCC.',
 operations_write_hold:'New work is paused for recovery review. Saved data remains readable.',
 storage_file_expired:'This working file was deleted after the completed-work retention period. Its billing and sending history is retained.',
 storage_upload_uncertain:'The upload result is unconfirmed. Check the file in Storage before starting another upload.',
 storage_object_changed:'The stored file differs from its original receipt and needs review.',
 budget_storage_exceeded:'Working-file storage has reached the app allowance. Review usage in Storage before adding files.',
 budget_egress_exceeded:'Managed file transfers have reached this month’s app allowance. Review usage in Storage.',
 budget_database_exceeded:'The database has reached the app allowance. New work is paused for a usage review.',
 budget_headroom_exceeded:'This operation would use the reserved safety margin. Review usage in Storage.',
 budget_concurrency_exceeded:'Other uploads are still in progress or unconfirmed. Check their results in Storage.',
 budget_review_required:'File operations are paused until the usage discrepancy has been reviewed.',
 retention_busy:'A linked file is being checked for cleanup. Retry after its outcome is confirmed in Storage.',
};
