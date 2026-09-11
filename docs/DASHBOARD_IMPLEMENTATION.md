# Dashboard — approved extension

Owner request: add a central Dashboard containing invoice entries, first billing, follow-up activity, OPERA payment credits and current urgent work. The owner asked what selected-day activity versus latest outstanding work means; explained with a bill entered on1September and first billed on10September. No new accounting or sending rules are introduced.

Mode: Operate. Extend the existing Luminous visual system from DESIGN.md, luminous-v4.png and supporting-surfaces-v1.png. Keep the existing Portfolio matrix as its own screen. Add Dashboard to the navigation at `/?dashboard=1`; preserve existing entry URLs.

Direction contract:

- A compact date/account filter row, then four related daily measurements in a divided white strip. Default date is today in Thailand.
- A wider latest-AR comparison for KAT/TSK and a narrower current-action list. These use current source state regardless of the selected activity date.
- Supporting billing-channel, payment-allocation, sent-stage and remittance evidence below. Counts that overlap are labelled; no sum of action-view counts is presented as a debt total.
- Preserve blue/teal property colors, navy type, fine borders, rounded surfaces, self-hosted Plus Jakarta Sans and tabular numerals. No new artwork or replacement reference images.
- Use existing authenticated read APIs. No new database schema, OPERA endpoint, provider credential, recurring poll or auto-send. Existing app-level on-open refresh remains in force.
- First-billed count combines verified first Gmail billings and first external billings. External record amounts can include repeat presentations, so they remain separate rather than being mislabeled as first-billing amounts.
- Payment credits use OPERA payment dates; their applied/unallocated values are current allocations of that dated cohort, not allocation events that occurred on the date.
- Unknown coverage or failed sources stay unavailable per section. One failed source must not hide other sections or become zero.
- Source links carry date/hotel/type/account and an explicit Dashboard return path. Same Account ID in two hotels stays distinct.
- Verify behavior and synthetic images at1440×900,1280×800,390×844. Verify the actual authenticated Cloudflare page privately; do not commit real customer screenshots.

Implementation/evidence status is maintained in PROJECT_STATUS.md; this direction contract alone is not a provider-test result.
