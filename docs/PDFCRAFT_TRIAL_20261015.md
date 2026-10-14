# PdfCraft isolated feasibility trial — 15 October 2026

## Decision

Do not replace production PDF Workspace with PdfCraft 0.8.0 on this evidence. Viewing, simple same-height Latin edits, combining pages and a targeted white redaction worked. Adding an address line and then moving the existing table did not preserve usable layout in the tested OPERA Statement. This is a bounded observed incompatibility, not a claim that all PDFs fail.

## Environment and isolation

Official `storytold/pdfcraft` v0.8.0 release, Windows x64 portable and web packages. Both SHA-256 values matched the release's published checksum manifest. No installer, global config, production dependency, provider resource, accounting record, email or original PDF was changed. Private inputs, outputs, downloaded binaries and scripts are in ignored `.tmp/pdfcraft-trial-20261015/`.

The web trial runs on loopback only, with local PDF copies and an outbound-restricting CSP. It is not published. Its WASM file is 38,059,629 bytes uncompressed, substantially more than the hosting document's older approximate size. No claim of faster production cold loading follows from native CLI timings.

## Observations

| Operation | Result |
|---|---|
| Read document structure/text | Four source files opened; scanned file has no meaningful text layer before OCR |
| Render first page | OPERA, current web Statement/Invoice, and scanned PDF all render; no blank scan |
| Same-height address replacement | Saved/reopened; replacement and VAT text visible |
| Insert address line | Saves, but VAT continuation moves beneath an existing table background; source text is still extractable, yet visually hidden. Independent Poppler render confirms the issue |
| Actual web edit | Enter-separated address editing reproduced the overlap after applying the edit; initial paste/type automation did not preserve newlines and was corrected using individual Enter events |
| Right-hand header | Account identifier coordinate remains unchanged during address edit; this particular old cross-column symptom is not reproduced |
| Thai replacement with shipped default fonts | Rejected with missing Thai glyph; explicit suitable font import remains untested, so this is not a claim Thai can never work |
| White redaction of one address phrase | Saved/reopened and target absent from independent text extraction; adjacent VAT text preserved. No broad security certification inferred |
| Combine web Invoice and scanned PDF | Six output pages; scanned last page rendered successfully |
| Move table text | Text moves while vector lines/background stay, producing overlap/misalignment |
| Move table text plus listed Form | Still fails to move the table grid as a unit and shifts unrelated page-number artwork |
| Move larger body plus Form | Misaligns aging/bank table text and backgrounds; unsuitable output |

PdfCraft's object inventory exposed text, logo image and a full-page Form for this source; it did not expose a complete table group with its standalone vector paths. Its object_move command succeeded technically, but successful return status did not imply a correct visual table move. Browser marquee selection also did not establish a clean isolated table group.

## Timing limits

Single native CLI samples including process startup: structure reads 54–86 ms, first-page render at 96 dpi 71–80 ms, address newline edit/save 83 ms, same-height edit/save 1,496 ms, targeted redaction/save 158 ms, combine 111 ms. These are smoke measurements on small files, not repeated benchmarks, and must not be compared directly to the browser app or remote OPERA PDF generation.

## Next useful scope

A targeted region/table-move prototype in the existing Workspace is more directly aligned with the owner's need: text, paths, fills and images must move together without hiding content, altering other columns, or losing searchability. PdfCraft could remain a candidate for isolated rendering/organization features after qualification. Row insertion semantics, Thai font import/shaping, broad OCR accuracy, accessibility and large-file/browser memory budgets are not certified by this trial.

Sources inspected: https://github.com/storytold/pdfcraft/releases/tag/v0.8.0 and the matching package HOSTING.md/tool schemas. No production rollout was performed.
