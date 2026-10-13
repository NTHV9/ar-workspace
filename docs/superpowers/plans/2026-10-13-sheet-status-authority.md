# Sheet status authority and reported Invoice repairs

**Spec:** Current owner instructions and `docs/DECISIONS_AND_OPEN_ITEMS.md`, 13 October 2026.

- [x] Diagnose TSAN 27302 PDF address failure using field/type/count-only selected-invoice evidence; fix and verify actual generation without sending.
- [x] Inspect the exact TSAN 27439 and TLKL 12175 source rows, workflow and outbound history. Preserve immutable mail evidence.
- [x] Permit missing Account No. only with complete, unique Hotel/Invoice/Folio/date corroboration; preserve immutable bindings and ambiguity holds.
- [x] Make verified Sheet R/U/V/W, including explicit blanks, determine current mapped workflow fields; keep actual mail and Friendly/Final evidence separate. Keep original settings authority for terms/requirements.
- [x] Preserve reliable writeback for new actual sends while preventing old completed/corrected commands from restoring a Sheet-cleared status. Test clear/edit/reimport, new sends, queued/uncertain conflicts and no duplicates.
- [x] Correct the two reported statuses through verified source alignment, deploy, and read back both Invoice and Dashboard behavior. No customer email, OPERA money change or sheet-structure mutation.
