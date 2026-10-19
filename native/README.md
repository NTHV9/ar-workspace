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
`5c30e0287ce404292a7bb9d6a34ac552302be60895662a6f6e2f08603e6d0ee4`.
Licenses and attribution ship at `public/licenses/pdf-native`.

The runtime matches original page/text/baseline/size/font/style, then supplies the
complete exact Rust inventory target to a clone-before-write transaction. It
refuses substitution, invisible/stroked text, graphics-state transparency,
clipping, tagged/ActualText content, annotations, forms/signatures, Forms/images/shading, non-unit transforms/scales/rise, Type3 fonts,
visual-order scripts, newlines, growth and changed neighboring text. Serialized
output is re-opened and all pages' native text plus non-text operators are checked.
The original bytes and source detection stay untouched. A candidate is used for
both editor source raster and final export; accepted layers are suppressed.
All-native pages retain native content. Other edits rasterize the same candidate.

The narrow guard intentionally excludes ordinary OPERA pages containing Forms;
no broad native eligibility claim is made. Such edits retain the existing raster
route, with fixed-scale cached original-source inspection. Flat colored backgrounds
are sampled from a small local ring; all interior nonbackground pixels must also
match the original observed glyph matte shape/color within a bounded antialias
tolerance. Unaccounted artwork/nearby content produces an actionable refusal.
An explicit user-selected nonwhite mask is still honored. The check does not infer a clean interior from its perimeter alone. Artwork
indistinguishable from the original glyph ink remains a limit of raster inspection;
final rendered-image review remains necessary, as before.

Worker lifetime is at most ten seconds, with at most two concurrent workers.
Document disposal aborts workers, late replies cannot settle twice, and candidate
promises are cached for at most three page states per source session. Original
text extraction is cached per immutable source page. Original inspection canvases
use fixed scale 1.5 (capped at four million pixels), cached for two source pages,
so thumbnail zoom cannot change background qualification. Candidates contain only
in-memory transient bytes and are never uploaded by this module.

Validation: `tests/pdf-native-*.test.ts`, plus existing PDF source/engine/browser
regressions. Tests include real WASM rewriting of a synthetic blue/white header,
stale target and invisible/stroke/opacity/clip/transform/Form refusals. Browser
and independent exported-PDF visual checks are recorded by integration acceptance.
