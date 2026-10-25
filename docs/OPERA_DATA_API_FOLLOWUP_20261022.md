# Oracle follow-up draft — direct current AR tax data

Prepared for the owner to review and forward. **Not sent.** No application,
subscription, permission, credential or paid service has been changed.

## Verified findings

- The production application used by AR was identified in the Developer Portal
  by the masked key suffix, which matches the running service and is unique among
  the four visible applications. The application is `TLK-Test`, environment
  Production. No full key was displayed or copied.
- Its subscribed plan tabs are API Catalog, Hospitality Property and OAuth.
  A Data APIs plan is not present in that subscription list. Other applications'
  credentials were not used.
- Fresh requests to the published Data API path return HTTP 403. Both the
  existing path and the documented trailing-slash form were checked. The former
  returns `No Subscribed Plan or API found`; the latter also returns 403.
- Authorization, app-key, Accept and JSON request headers follow Oracle's
  [Data API calling requirements](https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/c_oauth_token_api.htm).
  The path matches the [published endpoint](https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/c_calling_the_oracle_hospitality_data_apis.htm).
- Oracle documents additional R&A/version and Data Access entitlement
  prerequisites. Whether the hotel's existing contract already includes those
  entitlements has **not** been verified. This is not evidence that an employee's
  normal OPERA role lacks Property API permissions. See Oracle's
  [prerequisites](https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/r_prerequisites_oracle_hospitality_data_apis.htm)
  and [HTTP error guidance](https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/c_common_error_messages.htm).

## Questions for Oracle / the hotel's Oracle administrator

The owner has instructed us to treat Data APIs as unavailable and continue with
existing callable services. The questions below seek a supported Property API
path; they do not request activation, entitlement changes or additional cost.

1. Which supported Property API returns current AR Invoice net/VAT/non-VAT amounts using
   exact property, account and AR invoice transaction identity, including AR
   adjustments, transfers, applied payments and split/reused Folios?
2. Can MED `getFolioReport` select an exact current AR Invoice? Its public
   selectors do not expose AR account/transaction identity, and distinct AR
   invoices can share the same reservation/window/Folio/date. If supported,
   provide the documented selector mapping and current-versus-historical rules.
3. Supplying the configured AR report name through `folioType` returned a short
   base64-encoded report handle rather than PDF bytes, with no retrieval links.
   Is this an unsupported report context or a configuration issue? What
   documented retrieval operation, if any, consumes that response?
4. What supported field/API supplies the path `folioId` for CSH
   `getStoredFolioDetails` when exact AR details omit `storedFolioId`? How does
   this relate to Folio number and Folio sequence? Scoped read-only probes with
   those source-observed values and exact invoice/date/window qualifiers returned
   no stored file. We have not accepted either as a proven identifier mapping.
5. Which Property response exposes historical non-taxable treatment of an exact
   Revenue transaction? NetVat can return gross equal to net with no generates,
   while current code `nonTaxable` flags do not match the current AR print's
   aggregate classification. A current configuration or charge simulation alone
   is insufficient evidence for these historical postings.

Please do not request keys, secrets, PINs or customer PDFs in an ordinary email.
Exact private reproductions can be supplied through an approved support channel
after the owner authorizes the recipient and data. Current production keeps
identity/source checks and refuses unqualified results instead of selecting a
different invoice because its totals happen to agree.
