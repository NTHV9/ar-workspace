# Email preparation flow and attachment loading

Status: implemented and locally verified; deployment pending.

The user reports repeated Save message requirements between PDF preparation and sending, plus slow sends. The existing composer blocks actions for any dirty field, including automatically loaded signatures. The change saves current edits when the user requests review/send preparation, Gmail draft creation or an attachment operation, then uses the returned draft revision. Save message remains available for saving without continuing. The final human send confirmation, exact reviewed PDF package, revision conflicts, uncertain-result handling and no-duplicate delivery claims remain in place.

For preparation speed, stored attachments are read in ordered batches of at most three. The entire manifest is checked before reads. Existing total-byte limits and per-file byte/hash checks remain; all started reads settle before a failed batch is rejected, and no later batch starts after failure. Fresh OPERA verification still precedes storage reads; thread validation and provider submission remain after successful preparation. Sent-evidence reconciliation is unchanged.

The deterministic six-file test models 100 ms network latency per storage read: serial loading takes 600 ms versus 200 ms in batches of three. One file remains 100 ms. These are simulated storage-stage timings, not measured production send times; OPERA and Gmail latency still contribute to the total.

No database migration, retention change or real email send is part of this change.

## Verification

- The initial browser regression fails because review is disabled after edits. Final Email Composer suite: 22 cases pass, covering auto-save before review/draft/download/upload/removal, saved revision propagation, retained inputs after save conflicts, rapid repeated actions and explicit final send acknowledgment. Desktop and mobile synthetic review captures show the current body and renamed attachment. Original tracked evidence is preserved.
- Relevant backend regression: 172 tests across 27 files pass, including the eight new preparation tests. Astra independently checks 22 related cases and reviews the scoped product changes. Manifest prevalidation, out-of-order completion, drained failures, byte/hash mismatch, unchanged single-file timing and fresh-source rejection are covered.
- TypeScript and browser asset build pass. Impeccable detector reports no findings on the changed UI file. Captures and timing evidence are synthetic; actual provider delivery timing is not claimed.
