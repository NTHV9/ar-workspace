# System-rendered Statement RTF trial — 2026-09-09

## Owner-approved scope

Owner explicitly approved experimenting with system-generated Statement PDFs using the supplied KAT/TSK RTFs and requested no visible generated-by-AR label. This replaces the native-only constraint for this trial, not as an automatic production fallback. Do not claim byte-identical/native OPERA generation. The 100% visual-match request remains unproven.

## Implemented experiment

scripts/statement-template-trial.py preserves the source RTF tables, static text, embedded pictures, headers and footers; expands the known Invoice table row and materializes the supported XDO form-field expressions from synthetic fixture data. It is not a general XDO/XSLT engine: unknown expressions fail. It retains PAGE/NUMPAGES fields for the converter, consumes directive-only paragraph breaks and normalizes placeholder small-caps styling to match the observed OPERA captions. All changes are to generated copies.

LibreOffice26.2.6.3 was downloaded from The Document Foundation's official distribution and its MSI Authenticode signer verified. Administrative extraction resides only under ignored .cache/statement-renderer; bundled runtime DLLs were placed app-locally. Conversion runs headless with an isolated cache user profile. No paid SDK, cloud deployment or OPERA setting change.

Original input hashes unchanged:
- kat_statement.rtf:2184761ab0a6f7c1a5744f8f319264dac807cef5541b6b42fc3b6a57195f4905
- tsk_statement.rtf:b9ff9b64312b9affd67b25cfaecee6531e7f8b85a8e5859654e9d3dce6f5f1d5

## Private outputs and checks

All PDFs/RTFs/screenshots/validation JSON are under ignored private/statement-trial. They include the template's actual hotel banking/letterhead information, so they were not committed even though Invoice/customer fixtures are synthetic.

| File | Invoices | Pages | Extracted identifiers and total |
|---|---:|---:|---|
| kat-statement-single.pdf |1|1|Pass |
| tsk-statement-single.pdf |1|1|Pass |
| kat-statement-multipage.pdf |45|2|Pass |
| tsk-statement-multipage.pdf |45|3|Pass |

Validated complete unique Voucher sets, exact expected totals, Letter612×792pt page size, no unresolved XDO placeholders and no added generated-by-AR label. Rendered PDF pages with Poppler and visually inspected both single-page outputs and multi-page behavior. No emails, workflow billing facts, real ledger changes or document uploads to cloud services occurred.

## Fidelity result and material limitations

Not100%. Compared KAT with the first page of the available private OPERA Batch PDF at equal page dimensions. The reference and trial use different customer strings but equal line-count/layout fixtures; this is a static-layout comparison, not a pixel-identical fixture comparison. After one correction pass, sample top positions in points are:
- Title: reference98.86 vs trial101.03
- Aging heading:275.83 vs284.05
- Bank heading:334.72 vs343.55
- Prepared line:539.35 vs535.50
Fonts are Arial/Arial Bold in the trial; reference also embeds Arial Unicode MS. Small table borders, padding, word metrics, footer spacing and signature-line lengths remain different.

The supplied tsk_statement.rtf visibly renders The Shore at Katathani branding. It was kept unchanged; owner confirmation is pending. No corresponding native TSK Statement PDF baseline was available for an exact comparison. The45-row TSK fixture also leaves the Prepared line on a mostly empty third page; this is an unresolved pagination issue, not accepted production fidelity.

This is an offline proof of template materialization, not an enabled Cloudflare Statement generator. The selected converter is a local native binary and has not been integrated into Workers. Native API acquisition and production renderer architecture remain separate unfinished work. No automatic fallback or silent switch was made.
