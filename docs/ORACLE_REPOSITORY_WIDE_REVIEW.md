# Oracle Hospitality repository-wide review — 2026-09-09

## Scope actually inspected

Fetched the official main commit and complete recursive Git tree: dd631fbd5d0fce74a7dbdf96b43f07ce587211f2, dated2026-09-04T16:51:27Z. The tree is not truncated. This is the same revision used in prior selected-module research; new coverage is breadth, not a new release.

Downloaded the pinned official archive into ignored .cache/oracle-repository-review only. Validated archive paths and did not execute scripts, import its workflows, change project remotes, or overwrite conflicting cached content.163files,77,368,815uncompressed bytes; archive6,072,575bytes.

-61REST JSON specifications,3,641path operations: enumerated methods, operation IDs, descriptions and success schemas.
-Recursively resolved local response references and inventoried byte/binary/file formats:32operations. Most are key images, calendar/maintenance images or reservation alert scripts; binary format alone does not mean PDF.
-6Postman request collections,2,923requests: property2,410; property workflows276; distribution153; Nor1 4; R&A Data75; R&A Object Storage5. Inspected relevant request names/URLs and bodies, not just file names.
-79GraphQL-area files inventoried and text-searched; read AR Accounts Receivable, AR Aging, AR Ledger and EFolio schema context. These expose subject-area data rather than a demonstrated native Statement rendering mutation.
-Repository-wide text checks found no reportviewer, P_REPORT_SEQ, xmlpserver or /services/rest/v1/reports. BATCH_ appears in R&A Data collection as BATCH_CODE, not the UI BATCH_<number> renderer reference. reportSeqNo appears only in ars.json among REST files.
-Related issues/PRs reviewed separately in ORACLE_STATEMENT_ISSUES_REVIEW.md. No historical every-commit source audit is claimed.

Primary repository snapshot: https://github.com/oracle/hospitality-api-docs/tree/dd631fbd5d0fce74a7dbdf96b43f07ce587211f2

## File-capable routes beyond the prior keyword search

| Operation / collection | Actual contract | Result for Internal AR Statement |
|---|---|---|
| getFileAttachment, GET /med/config/v1/fileAttachments | Existing attachment bytes; id/idContext/idType identify the attachment. | Potential retrieval only if a real output Attachment ID and mapping are obtained. The RTF template attachment ID is not the generated PDF ID. No such Statement mapping appears here. |
| getEmailFile, GET /med/config/v1/emailFile/{emailId} | Existing OPERA Email BLOB by its unique Email ID. | Not a renderer and no known emailId for our Statement. Do not send an email merely to manufacture an ID. |
| getCustomizedLetter, GET /med/config/v1/customizedLetter/{letterId} | HTML or RTF letter content. Official Postman uses ResvConfLetterId context. | Not an AR Statement PDF; do not substitute BATCH/reportSeqNo/filename as letterId. |
| getRegistrationCard | Reservation registration-card PDF. | Different document purpose/identity. |
| getFolioReport | Reservation Folio PDF byte field. | Already implemented and tested for Invoice PDFs; still no standalone selected-AR renderer. |
| R&A Object Storage collection | Token with R&A-specific scope, generate PAR URL for existing prefix/fileName, list PAR information. | Delivery for scheduled Publisher output already in storage. No Internal OPERA batch execution/mapping. No URL generation, new access, schedule or paid service was enabled. |

Primary media spec: https://github.com/oracle/hospitality-api-docs/blob/dd631fbd5d0fce74a7dbdf96b43f07ce587211f2/rest-api-specs/property/v1/medcfg.json

R&A Object Storage collection: https://github.com/oracle/hospitality-api-docs/blob/dd631fbd5d0fce74a7dbdf96b43f07ce587211f2/postman-collections/reporting-and-analytics/R%26A%20Object%20Storage%20APIs.postman_collection.json

The Object Storage token request uses client_credentials with scope urn:opc:hgbu:ws:rna:E:{TenantID}:all against its configured identity host. This is distinct from the working OHIP scope and does not contradict separate OAC user-context REST requirements. Its PAR endpoint is {PortalEndPoint}developer/appapi/v1/os/PARUrl. Existing destination, credentials and file-prefix mapping are prerequisites, not inferred values. It is not the Publisher /run endpoint.

## Postman example limitations

The property collection has16ARS request examples, but no native Statement prepare/render/download workflow. Existing examples include reminder data and AR transactions; they do not fill the renderer gap. Some sample values are older than constraints proved against the tenant (e.g. getAccounts limit100), so examples must not override current published limits or actual runtime validation.

The customized-letter example explicitly uses reservation confirmation-letter identity, and file attachment examples do not supply a native Statement mapping. No captured UI state or credential was replayed.

## Conclusion

Broader repository inspection adds file-delivery candidates and better scope/provenance, but still does not establish the supported external operation that creates the native Internal Statement output and connects reportSeqNo to BATCH or a retrievable attachment. This is not proof no private/other-entitlement/future API exists. No new tenant execution, configuration, source-code change or deployment occurred in this review.
