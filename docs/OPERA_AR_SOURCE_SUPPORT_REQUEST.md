# Draft support request — exact current AR Invoice tax source

Status: not sent; revised after the owner selected an AR-only financial source.
No credentials, customer names,
guest details, invoice identifiers, amounts or attachments are included.

**Subject:** OHIP: exact current AR Invoice PDF/tax totals and stored-folio identifier mapping

Hello OPERA/OHIP Support,

We are integrating an AR billing application and need a supported, repeatable
read path for the same current Invoice printed from **Manage Accounts Receivables
→ Manage Account Invoices → Create Statement → Print Invoices**.

We match records by property, AR account and AR financial transaction/Invoice
identity. Comparing current AR PDFs exposed cases where reservation/Folio/date/
window selectors do not uniquely identify the AR Invoice. We must preserve each
Invoice's actual before-VAT, VAT, NonVAT and printed total, including adjustments.

Please confirm the following:

1. Which supported API returns the exact current AR Invoice PDF or its stored
   tax-footer fields using the property, AR account and AR transaction identity?
   Please provide the operation ID, request schema and identifier mappings.
2. For `GET /csh/v1/hotels/{hotelId}/storedFolios/{folioId}`, which API supplies
   `{folioId}`? How does it relate to `storedFolioId`, `folioSeqNo`, `folioNo`
   and `invoiceNo`? The response fields in our AR `invoicePaymentDetails` reads
   do not supply a stored-folio identifier. We do not assume these IDs are
   interchangeable. How are separate AR invoices sharing a Folio distinguished?
3. We will not use `folioReports` or Guest Folio PDF totals for AR financial
   sourcing or validation. Please identify an exact **current AR** source that
   includes subsequent AR adjustments, and the documented identifiers that bind
   its response to the selected AR Invoice.
4. Which historical posted fields distinguish non-taxable revenue from
   non-revenue amounts included in, or excluded from, the AR tax footer?
   Current `nonTaxable`, `revenue`, transaction type and Generates configuration
   are not sufficient in the observed cases: equivalent flags can accompany
   different printed tax-base treatment. We need the actual posted/report values,
   not a new calculation using current configuration alone.
5. If this requires a Data API subject area, please specify the exact schema,
   field names, keys, entitlement and freshness guarantees. Please identify
   options under the current agreement first. Do not activate a new subscription
   or paid service; any commercial/access change requires separate approval.

We can provide a small redacted reproduction after agreeing on a secure channel.
We are requesting read/print integration guidance, not changes to accounting
transactions or tax configuration.

Acceptance criteria:

- The response identifies one exact current AR Invoice, including when Folio
  numbers/windows are shared or reused.
- Gross, before-VAT, VAT, NonVAT and printed outstanding agree with the AR UI PDF.
- Later adjustments/payments cannot cause stale or cross-Invoice tax evidence.
- The integration uses documented identifiers and URLs without guessing IDs,
  bypassing ambiguous selection or introducing per-Invoice overrides.

Thank you.

## Public contract references reviewed

- [Oracle Hospitality API specifications](https://github.com/oracle/hospitality-api-docs)
- [Cashiering specification](https://github.com/oracle/hospitality-api-docs/blob/main/rest-api-specs/property/v1/csh.json)
- [Media configuration specification](https://github.com/oracle/hospitality-api-docs/blob/main/rest-api-specs/property/v1/medcfg.json)
- [Accounts Receivables specification](https://github.com/oracle/hospitality-api-docs/blob/main/rest-api-specs/property/v1/ars.json)
