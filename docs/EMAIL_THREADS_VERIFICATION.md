# Gmail thread increment — verification

## Implemented and deployed

- Source `67ad43f0121adfeb7e53a5c0d002ba76aa92b588`, branch `codex/opera-refresh`, public repository NTHV9/ar-workspace.
- Worker `ar-workspace` deployment `03c7af55e74245199353ecec01251518`; Workflow version `f10eaa54-c2ed-4e77-b9b1-b3a823328a7c`. Health returned the exact source SHA and Supabase database_verified. Existing OPERA/Gmail schedules and secrets were preserved.
- Applied migration `ar_email_threads`, actual Supabase version `20260910112014`. Local migration filename is aligned with that recorded version; SQL content is unchanged from the reviewed/applied file. No old application/cloud resources were altered.
- New private thread choice table with RLS and no client table privileges; service-only selection/list RPCs. Existing save/claim logic remains in private helpers behind guarded public wrappers. Direct service execution of the old private claim helper is revoked.

## Tests actually run

- Full unit suite: 342 tests across 52 files passed.
- GitHub source verification workflow completed successfully: https://github.com/NTHV9/ar-workspace/actions/runs/34471410867 .
- TypeScript and production frontend/Worker bundle builds passed. Vite reports a non-blocking 509.71 kB lazy DocumentRoute chunk (200.58 kB gzip); limits were not raised to hide the notice.
- Root's final local thread browser suite: 20/20 passed. Cloudflare source: the same 20 cases plus the Picker referrer regression, 21/21 passed. The UI subtask also ran 24 existing email/supplemental/By System cases successfully.
- Synthetic SQL rollback checks passed for owner/revision/package, malformed and duplicate RFC IDs, recipient overlap, locked subject, preserving selection through body edits, missing/different expected thread, legacy helper rejection, pending-handoff rejection, duplicate claim, clearing selection/new-message claim, synthetic reply hash/source/privacy checks and private grants. No provider requests occur in that fixture.
- Post-SQL read confirmed zero persisted thread choices, zero synthetic thread jobs and zero business sent events. Anonymous list/preview/select/test endpoints all return 401 on the deployed Worker.
- Security advisor returned only informational RLS-with-no-policy notices for deliberately inaccessible private tables, including the thread table. No public policy was added to suppress those notices. [Supabase explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Independent review fixes: exact parent subject in confirmation; clearing failed/stale previews; historyId on both forward/backward pages, including offset zero; RFC In-Reply-To ancestry fallback; strict SQL RFC/hash validation. Synthetic screenshot checks covered 1440×900,1280×800,390×844. Original reference images and historical screenshots are unchanged; new evidence uses only synthetic accounts/messages.

## Real Gmail proof

- At 18:31 ICT, the deployed browser read an owned verified synthetic conversation through Worker → Gmail metadata endpoints. It displayed the known earlier test message and its participants without requesting HTML, remote images or attachment bytes.
- At **18:31:44 ICT**, an explicitly initiated diagnostic sent one generic synthetic PDF as a reply to that previously verified test delivery. Gmail SENT verification checked threadId, In-Reply-To, References, recipients, subject/body and attachment bytes/checksum. The subsequent conversation preview contained both test messages in one thread.
- The diagnostic persisted recipientHash and header/thread proof without matchedRecipients or recipient addresses. It had no supplementalSource, customer attachment, account link or billing/collection event. Diagnostic sent total is five; business sent events remain zero.
- The owner replied to the latest diagnostic. At **18:36 ICT**, Refresh test conversation read three messages from Gmail: the two outgoing tests and an incoming reply dated **18:34 ICT**, with a non-empty snippet and **Explicit reply reference** matching the latest diagnostic parent. This proves Browser → Worker → Gmail incoming metadata/reference behavior. Reply content and participant addresses were not copied into repository evidence.
- Post-reply checks: business sent events 0, first billing dates 0, reminder stages 0, persisted account thread choices 0, diagnostic sent total 5. Reading the reply did not alter accounting or workflow state.

## Practical scope and limits

Staff can explicitly choose a previous thread, preview its participants and parent, adopt its subject and retain manually chosen recipients/body/files. Switching to a new email clears the selection and permits subject changes. Reply previews do not close debt, set paid, reset dates/stages or apply a hold.

Reads are manual and paginated. There is no periodic inbox scan, automatic reply classifier, remittance allocation, attachment download or full HTML email viewer. Metadata snippets can be absent. A thread with unsupported/ambiguous required headers, incomplete draft metadata or oversized metadata fails explicitly; it is never silently treated as an empty or complete conversation.

Normal account-specific search/selection/send UI was tested with synthetic API fixtures and guarded SQL rollback data. Per the owner's instruction, no customer account was used for a live send or persistent thread-selection test. The real provider proof used the isolated diagnostic path, which shares the metadata/MIME/SENT implementation.

Next independent increment: explicit remittance received-date/reference/invoice links and reported amount, with separate OPERA balances and no automatic settlement inference. Cash collection definitions/retention and legacy Google cleanup remain separate decisions.
