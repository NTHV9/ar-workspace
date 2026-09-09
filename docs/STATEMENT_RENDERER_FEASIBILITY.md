# Statement renderer feasibility — 2026-09-09

## Scope and result

Owner approved investigating the production rendering route before integrating PDF Workspace. This is a throwaway spike, not production implementation. No extra service was provisioned, no customer input was processed, and no application deployment occurred.

Tested a JavaScript alternative using existing pdf-lib 1.17.1. Materialized blank copies of the two supplied RTFs with no customer, account, Invoice or monetary values, then converted those blank copies once using the existing private LibreOffice installation. Embedded their vector header, closing and footer regions into newly composed PDFs; dynamic data and pagination were drawn with JavaScript. Original source files were unchanged. Bank/letterhead information and all artifacts remain in ignored private/statement-worker-spike.

This avoids running LibreOffice for every document, but it is NOT an RTF interpreter in Workers. Template changes require regenerating and reviewing the blank assets. Cropped embedded PDF Forms retain other blank source-page operators/resources: a production asset compiler must isolate the actual required content and remove unused fields/resources before PDF-editor integration. No real customer content was used to create the blank assets.

## Executed evidence

- Node execution generated KAT/TSK single-row and 45-row PDFs: 1 and 3 pages respectively. Initial measured elapsed times 38–86 ms and output sizes 239,770–258,561 bytes; these are local Node measurements, not Workers CPU or latency measurements.
- Reopened all four outputs with pypdf: exact unique Voucher membership/count, correct fixture total, repeated account header and Letter dimensions passed. Rendered and visually inspected all eight output pages. Repeating headings, wrapped long names and grouped closing sections were visible.
- Empty and over-500-row input rejected. Thai text also rejected by the temporary Helvetica font: this is an explicit unsupported case, not successful Unicode support.
- Browser-target ESM bundle compiled with esbuild: 813.1 KiB, with no Node filesystem dependency in the renderer. The local fixture runner separately uses filesystem I/O.
- Attempted Wrangler 4.129.0 local runtime with an isolated config, no remote bindings, localhost only. workerd failed to start with Windows access violation 0xc0000005. No Worker request executed. Do not treat Node/bundle success as deployed Workers evidence.
- Poppler reported unavailable display-font resources for Symbol/ArialUnicode in the blank source PDFs; visible fixture text rendered, but font portability and unused-resource cleanup remain acceptance items.

The dynamic font is Helvetica, while static template content retains its original fonts. Spacing, table borders, signature-line positioning and pagination are not certified identical to OPERA. The trial trusts preformatted synthetic input and is not suitable for receiving production requests or computing authoritative totals. It does not implement Auth, OPERA freshness checks, cents arithmetic, account-wide Aging, request bounds beyond row count, template-version validation or private document persistence.

## Alternatives checked against primary documentation

| Approach | Assessment |
|---|---|
| JavaScript + reviewed blank PDF assets | Demonstrated local generation; existing dependency, no new rendering service. Preferred candidate subject to Unicode/fonts, hardened pagination, asset isolation and actual Worker execution. |
| Cloudflare Browser Run HTML-to-PDF | Requires translating template layout to HTML and validating Chromium pagination. Paid plan currently includes 10 browser hours/month, with usage charges beyond that; no call or enablement performed. |
| LibreOffice in Cloudflare Containers | Closest to the existing RTF trial processor, but adds a native runtime/container lifecycle and usage billing. No image built or container provisioned. |

Sources checked 2026-09-09: [pdf-lib API](https://pdf-lib.js.org/docs/api/classes/pdfdocument), [custom fonts](https://pdf-lib.js.org/), [Browser Run pricing](https://developers.cloudflare.com/browser-run/pricing/), [Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/). Included quotas do not establish this account's remaining usage.

## Recommended next implementation

Use the JavaScript candidate only after a production renderer supports the required character set, decimal/cents validation and robust bounded layout. Keep versioned blank assets private and template-scoped; never derive them from customer PDFs. Worker must build the render model from verified selected Invoice data and separately verified account Aging, then save the result through the existing private document job flow. Provide an explicit template-generation action without automatic native-PDF fallback or a visible generated-by-AR label. Require a deployed authenticated smoke test, unauthorized denial, both hotels, partial payment, long text, multipage and PDF Workspace edit/reopen tests before enabling. This spike alone satisfies none of those production integration checks.
