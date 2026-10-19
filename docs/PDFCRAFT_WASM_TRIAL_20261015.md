# PdfCraft selective Rust/WASM native-text experiment — 15 October 2026

Subsequent expanded testing and actual current-Workspace comparison found
additional correctness failures and a qualified same-input native-line benefit.
See [the read-only employee workflow audit](PDF_WORKSPACE_COMPARISON_AUDIT_20261015.md)
before relying on the initial bounded results below. No product fixes or
production enablement followed that audit.

**Outcome: implemented and tested locally; not production-ready, deployed or enabled.**
The owner approved trying the Rust native editing component, following the
[component research](PDFCRAFT_COMPONENT_REUSE_20261015.md). This experiment
demonstrates genuine native text replacement in a browser without rasterizing
the entire edited page. It does not replace the PDF Workspace or fix table movement.

## What was actually built

- Source pinned to [PdfCraft v0.8.0](https://github.com/storytold/pdfcraft/tree/9931329b9fae0b05373b4dc3ac7c58541f0891a4), commit `9931329b9fae0b05373b4dc3ac7c58541f0891a4`.
- Minimal standalone Rust bridge imports `cos`, `edit` and `model` and their dependency closure. It excludes the full engine, renderer, egui application and remote services. Our installed PDF.js 6.3.289 supplies browser previews.
- Rust 1.95.0, wasm32-unknown-unknown and wasm-bindgen 0.2.129. Toolchain/cache installed only inside the ignored trial folder, without changing global PATH/configuration. No production package/lockfile or cloud changes.
- A module Worker opens bytes, exposes native line/block metadata, applies text edits, and returns a full rewritten PDF. Original source files are not overwritten. Normal edits check selected source/revision, bounds and neighbouring extracted text. Font import plus Apply uses a copy-on-write candidate and commits together.
- Final WASM: **2,402,157 bytes (2.29 MiB)**, SHA256 `e8401bb05eacfa7256ccca75a2b87c2a2498b9dc70b4b4212a5d7207b354f571`. The earlier complete PdfCraft web application was 38,059,629 bytes; these builds expose different feature sets.
- Trial source, local server, input copies and private evidence are under `.tmp/pdfcraft-wasm-20261015/`, excluded from Git. Start with `node .tmp/pdfcraft-wasm-20261015/server.mjs` and open `http://127.0.0.1:5281/`. The server binds loopback only, serves explicit assets and accepts named synthetic verification outputs only.

## Verified results

| Scenario | Observed result |
|---|---|
| Latin single-line address edit in real browser | Applied, previewed, exported and independently reopened. Replacement text remains searchable/extractable; original target disappears. Downloaded bytes exactly match the accepted synthetic test output. |
| Three representative private PDFs, eight pages total | Full saved outputs reopen. Extracted text changes only at the selected first-page line. At 300 dpi every pixel outside the permitted edit area is unchanged, including all other pages. |
| Existing artwork | The same samples retain 17 image resources, 10 Form resources and 1,009 vector paint operations, with image/Form content and drawing sequence hashes unchanged. This qualifies these samples only. |
| Synthetic address/VAT/table | New text appears; VAT, account, amounts and footer remain unchanged. Pixel comparison outside the target passes. No old target plaintext remains in the three decoded streams checked. This is not a general redaction certification. |
| Newline, excessive width, stale revision | Refused, with unchanged revision and serialized bytes. The experiment intentionally excludes expanding/reflowing text. |
| Failed PDF open | Existing session survives. A browser file-picker test with an invalid PDF followed by Export retained the previous file's correct name and bytes. |
| Failed font import plus edit | Entire Apply candidate is discarded; no extra font resources/revision are retained. |
| Scan/image-only input | No editable native text is exposed; native editing is refused. OCR was not added. |
| Shared Form fixture | Text in the reused nested Form is not exposed by this narrow inventory. One-instance editing remains unsupported. The invalid-index rejection test proves missing-selection handling, not shared-object isolation. |

Final browser matrix: **9 of 11 checks pass**. The two capability failures are
Thai block editing and single-instance shared Form editing. They are retained
as limitations, not relabelled as successful editing. A separate independent
review found and prompted the failed-load filename and font-import transaction
repairs above; the final browser run covers both.

## Thai investigation

The application's Noto Sans Thai asset is a variable font; the importer rejects
that format. A trial-only default static instance (weight 400, width 100) was
generated with fonttools 4.67.0 under the existing OFL license. Static import succeeds.

Changing a Thai block containing a Latin heading remains unqualified:

- Applying the imported font to the complete block also changes the heading's
  font/metrics. Upstream estimated top bounds grow by 1.61 points and the normal
  adapter refuses the operation.
- Retaining mixed source fonts encounters an upstream unsupported mixed
  contextual-run error for the changed text. An unchanged-text no-op does not
  demonstrate Thai editing.
- An investigator-only clone preview produced visible, extractable Thai text,
  but changed the heading typography. It was inspected separately and was
  **not accepted** by the normal path. This diagnostic method is excluded from
  the browser Worker command allowlist and does not commit session state.

Both font/style preservation and Thai shaping need further work before general
use. Do not weaken the bounds checks merely to make this fixture pass.

## Performance and adoption decision

One warm browser interaction recorded roughly 2.6 ms for native Apply and
0.4 ms for serialization on the tiny synthetic page; these Worker measurements
exclude full preview rendering, UI latency, network/provider requests and email.
They are **not** a repeated benchmark against the existing Workspace. Peak
memory, cancellation, large files and device/browser coverage were not qualified.
Rust is not established as faster than our current solution by this experiment.

The demonstrated benefit is fidelity: qualifying text-only edits preserve
native searchable text and the rest of the page's vector content, whereas the
current Workspace rasterizes edited pages. A selective future path is plausible;
wholesale replacement is not supported by the evidence. Native table/area moving,
text reflow, nested Forms, clipped/rotated content, complex glyph subsets,
redaction completeness and exact final-review handoff remain separate integration work.

Current runtime neighbour checks use extracted metadata on the edited page;
they are not a whole-document graphical correctness check. The current comparison
key also includes paint operator positions and can conservatively refuse otherwise
valid block rewrites. Source text/font geometry validation needs refinement for
broader adoption, with independent rendering retained.

Last recorded production source is `596fe7bc505102bd5d9ef7439d992c265a357793`, Worker
`d8f8f99e-0bf1-4ead-b154-7a60c2011387`. No actual preparations, financial data,
retention policy, Google Sheets or email were changed/sent in this experiment.
Production deployment health was not re-probed for this local experiment.

## Source and license boundaries

Relevant upstream APIs are [text editing](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/edit/src/text.rs),
[font shaping](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/fonts/src/source_shaping.rs)
and [full PDF rewriting](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/cos/src/writer.rs).
The cloned source retains MIT/Apache-2.0, NOTICE and third-party attribution.
Choose and preserve the applicable notices for any distribution; retain the
font's OFL notice. No PdfCraft branding was copied into the product. No commercial
PDF service or paid add-on was introduced.
