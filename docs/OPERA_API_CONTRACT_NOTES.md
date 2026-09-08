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
