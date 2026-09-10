# Statement font repair — 11 September 2026

The current Statement renderer selected its Thai font for every non-ASCII character, even when the standard Latin font supported that character. This caused `document_statement_character_unsupported` for ordinary Latin accents.

Source `8cb9563342a5c49031ff6bed8a8f57d2b34769ac` selects fonts by actual character coverage, handles mixed Thai/Latin text in font runs and canonical Unicode composition, and retains the established number/voucher alignment. It does not discard unsupported characters or guess corrections to upstream text. The document page now distinguishes waiting to start from active file preparation.

Validation: Typecheck/Build passed. The isolated committed-source checkout passed693 tests in71 files; the Statement-targeted suite passed11 tests. Synthetic Latin accents, mixed Thai/Latin and literal source characters were extracted from the produced PDFs with pypdf and visually rendered with Poppler. No customer PDF or screenshot was committed. Full supported browser external-billing suite6 passed on Cloudflare; document preparation browser regressions are also tracked by the final acceptance run.

Production: Worker version `528b7248-8d5a-4d94-94a4-7ed2645bc7dd`, health matched source and database_verified. One owner-reported job was repaired only after verifying its failed Statement had no storage object, no saved edits/exports and exactly three existing ready Invoice files. Reset only that unavailable font-failure record and restarted its exact completed Workflow. The replay ran one Statement step and completed in about6.5 seconds; all four files are ready. Original Invoice file timestamps/byte counts were unchanged, so no native Invoice regeneration occurred. Statement221,092 bytes was opened through authenticated Cloudflare → private Storage → PDF preview and visually inspected.

Initial waiting evidence: job creation→Workflow start was about31 seconds; first file step began roughly28 seconds later. The complete initial source-file processing then took about14 seconds. No claim is made that every pending delay has the same cause. Main completion work moves the large financial-history importer into its own bounded background queue to protect interactive processing capacity.

Source-quality note: any odd characters already present in upstream text remain source text. The font fix restores rendering; it does not silently reinterpret legal/customer names.
