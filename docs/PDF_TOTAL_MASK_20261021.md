# Total text editing beside table rules

## Reproduction and cause

Staff reported that the upper Total amount in a TSAN Invoice could not be edited. The exact click-versus-export symptom was unknown. The reported preparation was already closed, so its original bytes were not used in this test. Private installed hotel templates were used with synthetic identity, 14 transaction rows and the reported amount shape.

The real Workspace UI allowed selection and typing but Preview failed with `The source background contains artwork or nearby content`. A six-hotel, three-total matrix reproduced the upper Total failure in KAT, TSAN, TLKL and WAKL; the other totals passed. The outer background sampling ring extended beyond the painted mask into a nearby table rule.

## Repair

The existing uniform outer-ring check remains the first choice. If that ring is mixed, the renderer now proves a flat background using every clear pixel inside the actual mask, excluding only the existing observed-glyph tolerance. At least four clear pixels and uniform color are required. The full original mask is still checked against the original glyph matte. Lines/artwork inside the mask and unprovable backgrounds remain rejected. No geometry, accounting value, OPERA data, tax calculation or automatic total recalculation is changed.

## Verification

- Workspace UI: select the upper Total, change its text, Preview, save through a local test callback and download the resulting PDF. Reopened/rendered the downloaded PDF and visually checked the changed field, table rules, other totals and tax values.
- 18 total replacements/export cases on six private hotel templates passed. Repeated 18 cases with a font-size change forcing the non-native fallback; all passed. Browser raster comparison outside the edited field's padded bounds found zero changed pixels in both matrices.
- Regression tests cover nearby rules outside versus inside the mask, colored backgrounds, mixed interior artwork, insufficient clear-pixel evidence, and fractional boundaries at the 1.5x inspection scale.
- Full suite: 2,104 tests / 215 files passed. TypeScript and production build passed. Independent review reported no P0-P2 issues and independently ran 21 focused tests; its fractional-boundary recommendation was added before the full run.
- All template assets, generated PDFs and browser evidence remain private and ignored under `.tmp/total-edit`. No live email, Sheet update, ledger mutation or preparation mutation occurred. This verifies the actual template layout and UI behavior, not the original closed preparation bytes or every arbitrary uploaded PDF.

Deployment is recorded in PROJECT_STATUS.
