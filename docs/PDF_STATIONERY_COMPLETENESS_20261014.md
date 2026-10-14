# PDF stationery completeness — 14 October 2026

Owner supplied an OPERA batch PDF and its Workspace counterpart. All source pages were rendered and reviewed privately. Comparison found missing country/VAT address continuation, routed charge narratives and continuation-page signature blocks. A print-operator value also differs: it is blank in the web document and has no verified source mapping in the selected API packet. It remains explicitly unresolved rather than borrowing a cashier or login identity.

## Fixes

- Shared addressee resolution no longer treats any populated AR inline address as complete. Actual selected-source evidence shows a three-line inline projection and a four-line matching Profile address. Exact attached Address ID selects the complete record. Without an ID, a populated inline address must match one compatible primary record and no other compatible record. Wrong profile, truncated lists, ambiguity and provider failure remain errors. Both Statement and Invoice consume this resolver.
- Routed reference narratives are retained even after OPERA reference prefixes. Literal source room text is preserved. The verified nine-digit check suffix is not appended again when already present; short room/check suffix collisions are covered without stripping digits or changing monetary values.
- Signature artwork and cashier name repeat on every Invoice page. Body rows and closing sections reserve sufficient space and do not overlap the signature/footer. Totals and bank details remain once on the final page.

## Verification

- Full unit run: 1,958 tests across 195 files passed before the final multiline render test addition. Subsequent focused render/model runs passed 38 tests; TypeScript passes. Multiline routed-reference and eleven-line-address pagination tests verify no missing content or signature overlap.
- Independent comparison inspected all seven supplied pages, and review identified/fixed address ambiguity and numeric suffix inference risks.
- Actual repaired Statement and Invoice generated successfully through the production document workflow. The fourth address/VAT line is present on the Statement and every Invoice page, routed narratives are present 14 times, and signatures repeat. Selected charge, VAT, balance, account-wide aging and bank details remain unchanged. Exact private artifacts and comparison report are outside Git.
- Deployed source `463eca5f3de29da9a19b9de0ba01e130f8f11c4c`, Worker `f1cbc2c6-eb35-4118-bc66-c013678df198`; exact-source health verified. Old downloaded/reviewed files are not rewritten; a newly generated preparation is required.

No OPERA account/profile updates or emails were performed. Existing user preparations remain intact. Generated validation preparations are distinct from the original user job. This verifies the supplied selection and synthetic cases, not every possible OPERA stationery field across all accounts.
