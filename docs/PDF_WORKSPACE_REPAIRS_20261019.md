# PDF Workspace repairs — 19 October 2026

Owner-approved implementation of the five issues demonstrated in the
[comparison audit](PDF_WORKSPACE_COMPARISON_AUDIT_20261015.md).

## Implemented

- Stationery text growth moves a bounded group of related same-column fields,
  including country/VAT, while the other column remains fixed. Ambiguous or
  occupied spacing is refused. Item rows retain existing full-width flow.
  Growing, shrinking, restoring and Undo preserve source identities.
- Table/area moves check both actual visible pixels and text/layer destinations
  before committing. Occupied destinations are refused without erasure;
  blank moves remain available. The probe uses the actual capped render scale.
- Image insertion uses decoded intrinsic aspect ratio; ordinary resizing keeps
  that ratio. Async decoding cannot attach a result to a changed page/session.
- Differences uses the same visible delivery-page order as thumbnails and
  preview, including attached PDFs and content filters.
- A pinned PdfCraft v0.8.0 line-only WASM worker handles strictly qualified
  same-line edits. It preserves native text and the source background, validates
  target identity/current box/font/style and refuses substitution or unsupported
  graphics state. No block rewrite, diagnostic bypass or network service is used.
- Editor rendering and export consume the same candidate. Where raster output
  remains necessary, fixed-resolution source inspection verifies background and
  original glyph ink before automatic masking; ambiguous artwork is refused.

Original documents and business/accounting state are unchanged. Existing row
tools, histories, page/attachment grouping, filenames and reviewed-byte handoff
remain in place. No schema change, paid add-on or actual email send is involved.

## Validation

- Full unit suite: **1,994 tests / 200 files passed** on the final implementation.
- TypeScript and production Vite build passed.
- Independent task and whole-branch reviews approved the implementation after
  fixing a large-page collision-scale issue, native current-box validation and
  raster background antialiasing regressions.
- Actual browser Workspace: address newline leaves the right reference/date in
  place; country/VAT move below the new line without overlap; table multiline
  still expands its complete row; occupied moves stop before Balance Due;
  image insertion/resizing preserves portrait ratio; attachment page labels
  reflect their displayed order; Preview, download and simulated email handoff
  use the reviewed package.
- Independently reopened/downloaded outputs were rendered with Poppler at
  300 dpi. The two untouched Invoice pages remain pixel- and text-identical
  to the audit baseline. The added native colored-header page contains exactly
  the requested INVOICE-to-BILL text change, and every pixel outside that word
  area is unchanged. VAT, table entries, totals and footer remain visible.
- Browser regressions also exercise ordinary and embedded fonts, multiline,
  moved and deleted text, thumbnail/editor/export scales, unsafe interior
  artwork, initial/attached native pages and unsupported-page caching.

Private synthetic outputs and screenshots are under
`.tmp/pdf-workspace-repairs/` and individually named Fixed-*-20261019.pdf in the
test Downloads directory. They are not included in the production bundle.
The native build and license inventory are documented in `native/README.md`.

## Deliberate boundaries

The native path is limited to supported visible opaque single-line text with
unchanged font/style/position and verified bounds. Forms, images, annotations,
tagged content, unsupported transforms and similar complex pages retain the
raster path. Permanent page refusals are cached, and worker concurrency,
lifetimes and input size are bounded. No claim that all PDFs remain native,
that all Thai shaping is qualified, or that Rust makes every workflow faster.

Raster inspection cannot recover artwork indistinguishable from the original
glyph ink. Explicit masking remains a deliberate user action, and final Preview
is retained. New input classes require additional qualification.

## Release state

Implemented, locally/browser/PDF tested and deployed on 19 October 2026.
Deployed source: `6835fbaad2e1fc30790e1f36f4bde1e0af30f7ea`.
Final Worker: `968c130a-3876-4c89-bf96-c5e85ae94d9f`.
Live health confirmed that exact source and database verification; six protected
anonymous routes rejected access. Hosted WASM and worker bytes match the tested
build; the public license notice is available.

The first deployment temporarily reset two tracker enablement flags from live
true values to tracked false defaults. Both were restored in the final release
about 3 minutes 27 seconds later. Version comparison verifies all previous plain
bindings except COMMIT_SHA and unchanged secret binding names. The interruption
is disclosed rather than claiming synchronization was unaffected.

Browser editing and PDF acceptance used synthetic local fixtures. No actual
email was sent and no production customer preparation was mutated for testing.
See [PR138](https://github.com/NTHV9/ar-workspace/pull/138) and PROJECT_STATUS.
