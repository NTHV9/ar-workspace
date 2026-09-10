# Account billing channel and approved spreadsheet import

Owner confirmation, 10 September 2026: every row in the supplied agent workbook is Billing Required. By Email uses ordinary billing email; By System requires billing in that account's external system. Credit Term and the separate billing/collection recipient fields are authoritative for the matched Account No. The owner confirmed applying the same row to both KAT and TSK wherever the exact Account No. exists; ledgers and account identities remain separate.

## Interpretation

- Match Account No. within each hotel. Do not use fuzzy names, create missing accounts, or overwrite rules on unrelated accounts.
- First configuration also assigns rules to existing eligible open invoices without assigned rules. Preserve first actual billing date and reminder history; missing dates remain missing, including zero-day terms.
- By System stores an optional HTTPS portal and instructions. Prepare PDFs, submit through the external account system, then record the first actual billing date. Email creation/sending for billing is blocked at Worker and database claim; collection email remains an explicit separate purpose. No external portal integration or automatic submission is enabled.
- Spreadsheet email lists become To recipients, with empty CC/BCC. Normalize obvious trailing quote delimiters and duplicate addresses; preserve remaining instructions separately. Do not copy collection email into a missing billing email.
- Two By Email rows provide form descriptions without billing addresses. Preserve those descriptions with empty billing recipients; valid terms and collection recipients can still be imported.
- Original workbook and all source rows, addresses, account mapping, SQL payload and verification details stay in ignored private/agent-settings-import. Public tests use synthetic rows only.

## Preview

53 source rows: 49 By Email, 4 By System; terms are 0, 15, 30 or 60 calendar days. Exact account matching yields 104 existing property accounts: KAT53 and TSK51. No duplicate account-number rows or ambiguous property matches were found. Two source accounts have no current matching TSK account; do not fabricate records for them.

## Verification and release

Implementation and import results are recorded below after testing and applying the approved data. No customer email sending is part of this import.

- Applied ar_billing_channel migration to the confirmed Supabase project after collision checks (settings0,channelcolumns0 before apply).
- Synthetic SQL rollback verified first-initialization pending-handoff guard, System blocks both current and retained Gmail claim helpers, zero-day term preservation, revision/no-op behavior and unchanged sent history. Expected-error assertions are null-safe.
- Full104-account import rehearsed and rolled back, then applied as one transaction after the owner confirmed both hotels. Read-back comparison matched all104 entries including recipient lists, portal/instructions, terms and channel; no mismatches.
- Result: KAT53 (Email49/System4), TSK51 (Email47/System4);104 settings audit revisions.721 eligible existing invoice workflows initialized. Actual billing/reminder/due dates0 and business sent events0 remain unchanged. No emails were sent.
- Private anomalies: two form-only billing email fields remain blank for both hotels; two source accounts lack a matching TSK account.32 trailing quote cells and one duplicate/list case were normalized, preserving valid addresses and separate instructions.
