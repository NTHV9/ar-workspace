# Qualified local native PDF text

This is a line-only adapter for PdfCraft v0.8.0, pinned at
`9931329b9fae0b05373b4dc3ac7c58541f0891a4`. It does not expose block rewrite,
diagnostic bypass, font imports, network access or persisted document sessions.

Build with `native/build.ps1`, supplying paths to isolated Rust/Cargo **1.95.0**,
wasm-bindgen **0.2.129**, Cargo cache and Rustup home. The script downloads the
commit archive, verifies SHA-256
`953f32944503e09323c4d66aac2528974cb04f94acfc1a4dfe50c1a86f0091ed`,
compares an existing source extraction with the pinned archive, disables optional
font packages in the child process environment, uses Cargo.lock and builds the
checked-in `src/pdf/native/wasm` web bindings. No global installation is required.
`native/upstream`, build output and extracted verification source are ignored.

The generated WASM SHA-256 for this build is
`18e2d1d26f744ab7d5a816e344701f4177486500bee9875fdfc29436d6320f8f`.
Licenses and attribution ship at `public/licenses/pdf-native`.

The runtime matches original page/text/baseline/size/font/style, then supplies the
complete exact Rust inventory target to a clone-before-write transaction. It
refuses substitution, invisible/stroked text, graphics-state transparency,
text clipping, tagged/ActualText content, annotations, forms/signatures, Forms/shading, non-unit text transforms/scales/rise, Type3 fonts,
visual-order scripts, newlines, unqualified growth and changed neighboring text. Serialized
output is re-opened and all pages' native text, non-text operators and complete
resolved resource graphs are checked against the original. Empty replacement
removes only the exact target line; every surviving line keeps its text/style/geometry.
Image painting is admitted only inside balanced image-only q/Q blocks containing
bounded Image resources and finite placement/clipping operations. Text, Forms,
transparency and unqualified operators inside those blocks remain refused.
The original bytes and source detection stay untouched. A candidate is used for
both editor source raster and final export; accepted layers are suppressed.
All-native pages retain native content. Other edits rasterize the same candidate.

Single-line growth accepts an explicit finite editor right edge, bounded by the
page and the intact source fragment. Without that argument, the original bound
remains. Baseline, font/style and every other source line stay fixed. The growing
footprint cannot cross other source text, later-painted source paths/images, or
earlier editor overlays. Source-paint checks track graphics state/transforms,
conservative curve/join/cap bounds and subpaths; earlier page backgrounds and
later artwork outside the footprint do not prevent editing. No source operator
or resource is removed to make a growing edit pass. This remains single-line
qualification, not native multiline or arbitrary font rewriting.

The narrow guard intentionally excludes ordinary OPERA pages containing Forms;
no broad native eligibility claim is made. Such edits retain the existing raster
route, with fixed-scale cached original-source inspection. Flat colored backgrounds
are sampled from a small local ring; all interior nonbackground pixels must also
match the original observed glyph matte shape/color within a bounded antialias
tolerance and continuous source-color interpolation (opaque and transparent
canvases can use different edge coverage). Inspection uses an alpha-enabled
white-backed PDF.js canvas, avoiding LCD font color fringes without changing
actual colored artwork. Unaccounted artwork/nearby content produces an actionable refusal.
An explicit user-selected nonwhite mask is still honored. The check does not infer a clean interior from its perimeter alone. Artwork
indistinguishable from the original glyph ink remains a limit of raster inspection;
final rendered-image review remains necessary, as before.

Worker execution is at most ten seconds, with at most two concurrent workers and
eight waiting page states. The latest queued state replaces the previous state
of that page; bytes are copied only at admission. Transient worker misses are
removed from the candidate cache so a later Preview can retry.
Document disposal aborts workers, late replies cannot settle twice, and candidate
promises are cached for at most three page states per source session. Original
text extraction is cached per immutable source page. Original inspection canvases
use fixed scale 1.5 (capped at four million pixels), cached for two source pages,
so thumbnail zoom cannot change background qualification. Document context follows
PDFDocumentProxy identity, preserving native eligibility and runtime font scope
when supplemental documents are merged into another document Map. Permanent
page-level qualification refusals are cached per immutable source/page; target
matching/font/box refusals do not disable other eligible edits. Form XObjects and
unqualified image operations remain conservative raster fallbacks. Native edits
after row movement require the whole original text rectangle to belong to one
intact source fragment at the current overlay position. Earlier overlapping
overlays also exclude a target to preserve paint order. Candidates contain only
in-memory transient bytes and are never uploaded by this module.

Validation: `tests/pdf-native-*.test.ts`, plus existing PDF source/engine/browser
regressions. Tests include real WASM rewriting of a synthetic blue/white header,
stale target and invisible/stroke/opacity/clip/transform/Form refusals. Browser
and independent exported-PDF visual checks are recorded by integration acceptance.
See `docs/PDF_NATIVE_REFERENCE_20261021.md` for the six-template and actual-source
qualification. Mixed layout edits still use the existing raster composition path;
this is not general native editing of every PDF.
