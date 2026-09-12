# Aging: all ranges without horizontal scrolling

Owner rejects the previous look and asks to see every range at once without scrolling. Current scope replaces only Current Aging. No backend/schema/provider changes. Existing authorized Git and Cloudflare deployment apply to NTHV9/ar-workspace / ar-workspace; keep --keep-vars and protect customer data.

## Design and behavior
- One desktop comparison: Account Type / matched Account as a group, TSK/KAT/Total as labeled subrows, one column per source aging range plus optional net. All six ranges visible at1440 and1280 without horizontal scrolling; no shortened monetary values or concealed buckets to make it fit. Vertical pagination remains for all accounts.
- At narrow widths, transpose each account group into range rows with hotel amount columns so every range remains readable without horizontal scrolling. Keep exact amounts, labels, optional percentages, absent vs zero, source uncertainty and credits.
- Default all ranges and Total net descending. Old focused-range context is normalized to this new view; selecting overview range highlights/drills without hiding the other ranges. Explicit Columns choices remain optional.
- Owner selected a mixed light look and explicitly rejected dark navy as boring. Use mint/sky/lavender light surfaces with rich distribution colors and hotel context. Actual values only; negative credits use an honest signed representation. Preserve original references and app identity outside Aging.
- All existing identity/grouping, exact source bucket/schema, child exclusion, hotel/account/invoice drill, source failure, sort/filter/page/back context and authenticated access remain.

## Work
- [x] Independent overview implementer: new AgingOverview component/style with existing props; root integrates. No CurrentAging.tsx or shared styles changes.
- [x] Root: grouped all-range table, mobile transpose, context/sort/columns and regression/browser tests.
- [x] Independent integrated review; typecheck/build/unit/browser; synthetic1440/1280/narrow evidence with exact-money fit assertions.
- [ ] Public audit, push/CI/deploy/live verify/expected-head merge and PROJECT_STATUS. No paid additions, business data mutations or email sends.
