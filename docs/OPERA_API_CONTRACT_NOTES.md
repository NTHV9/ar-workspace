# OPERA contract evidence — 2026-09-08

Public Oracle contracts read for the new implementation:
- https://github.com/oracle/hospitality-api-docs/blob/main/rest-api-specs/property/v1/ars.json
- https://github.com/oracle/hospitality-api-docs/blob/main/rest-api-specs/security/v1/publishedoauth.json
- https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/c_authenticating_to_oracle_hospitality_property_apis_ocim.htm
- https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/t_migrating_to_client_credentials_based_authentication_scheme_ocim.htm

Confirmed gateway supplied by the owner: https://mtcb2pr.hospitality-api.ap-mumbai-1.ocs.oraclecloud.com ; enterprise TSTLKL; hotels KAT and TSK.

The owner chose new Worker Secrets, not reuse of legacy credential storage. The UI was prepared with OPERA_CLIENT_ID, OPERA_CLIENT_SECRET and OPERA_APP_KEY, all secret_text. No secret values are read back or recorded in source.

The documented OCIM scope is urn:opc:hgbu:ws:__myscopes__. The initial real probe uses client_credentials with enterpriseId, app key and Basic client authentication. A successful real token/read is still required to validate environment compatibility.

The ARS contract describes accountsDetails as an array, accountDetails as one account, and details as an array of account invoice/payment groups. Account IDs are UniqueID objects with an id field; Account No is a separate string. Currency amounts have amount and currencyCode.

Pagination metadata describes offset as the requested initial index and absent hasMore as all rows fetched. The new collector rejects contradictory totals, duplicate members, changed offsets, and empty hasMore pages. These checks do not prove that the source did not change without affecting counts; real membership comparison remains required before publication.

No invoice or folio selector is inferred from a similarly named field. Current membership, historical zero coverage and selected-only native PDFs still require actual environment evidence.

Live probe confirmed token authentication and reached discovery. The environment rejected limit=50 with HTTP 400 / OPERAWS-ODE09998 and explicitly required a maximum of 20 for Account Discovery. Reader defaults now use pages of 20; this is pagination size, not an account-count cap. History is initially requested in pages of 20 and must be verified independently.

Owner-supplied Downloads/openapi.json: ARS version 26.3.0.0, SHA-256 04c6379b6ef8a2b92f0d7f40689e723464d295001f86c2c90a8b42e3cf5402cf. The three primary GET contracts match the public Oracle specification read above. The supplied file itself has not been copied into Git.

Live cursor verification supersedes the schema wording for this environment: discovery request offsets0/20 return20/40. KAT last request100 returns120 with5 rows of total105; TSK last request60 returns80 with10 rows of total70. Response offset is next page position (requested offset + limit), not current position or returned member count. History first-page offset is also20. The runtime adapter validates this explicit convention and uses the returned next cursor, while retaining duplicate and total checks. Initial full refresh stopped before staging because this mismatch was detected; no partial data was published.

Full-account validation found additional source representations: the final aging bucket has start151 with no end (stored as null/unbounded); whitespace-only optional reference fields are absent text; some account headers omit balance while their summary has an explicit verified THB total. The normalizer uses the summary in that last case, still rejecting a malformed or disagreeing present balance. It never substitutes zero for a missing monetary source.

Open-only history missed offsetting positive/negative pairs in three KAT accounts while matching all shared item balances. Those accounts receive a full zero-inclusive paginated history audit before publication. Current items are never discarded simply because the filtered history omits them.

Early Statement preparation test: GET /ars/v1/statements with one transactionNo, exact hotelId/accountID, inclPrinted=true, inclFolios=false, inclZero=false returned one matching item and matching selected balance for both hotel samples. A report descriptor was present. This proves selected data preparation, not rendered/native PDF bytes. No Statement generation POST or accounting write was issued for this test.

## Compressed history investigation — 2026-09-08

The earlier `history_total_understated` interpretation is superseded where explicit compressed parent links are verified. OPERA's history pagination counts root entries; `inclDetails=true` can expand a compressed parent into its parent row plus child rows. In all seven KAT warning accounts, complete reads at limits20 and10 returned the same unique transaction membership and identical row content. A limit1 read at the affected root returned3 rows: one compressed parent and two children whose `parentInvoiceNo` equals that parent's `invoiceNo`. Thus the +2 is expanded detail, not two missing pagination slots. No rows are discarded from current/history reconciliation.

The reader now compares `totalResults` against verified roots while retaining all members for duplicate/identity/balance checks. Missing or ambiguous same-page parent links fail validation. Discovery remains strict and unchanged. Unexplained over-return still warns; child balances are not rewritten or inferred as zero.

Oracle's [Managing AR Invoices](https://docs.oracle.com/en/industries/hospitality/opera-cloud/25.2/ocsuh/t_admin_financial_managing_ar_account_invoices_and_payments.htm) documents parent/child compression and that payments apply to the parent. The API pagination expansion above is experimentally verified environment behavior, not an explicit promise quoted from that manual. Before Billing/Collection, child identity and parent context must be retained to avoid treating compressed children as independently collectible debts.

TSK subsequently passed independent limit20 and limit10 scans: 2330 roots/2332 unique rows, matching SHA-256 of sorted identity+row content, no duplicates. The limit1 slot1926 returned exactly one compressed parent and two explicitly linked children; repeated window and single-slot union matched. All eight cases are therefore explained (root/detail counts: KAT82/84,8/10,819/821,76/78,617/619,73/75,202/204; TSK2330/2332). Two diagnostic workflow attempts failed internally and were rerun successfully in smaller steps; failed attempts were not used as passing evidence. No OPERA writes were made.
