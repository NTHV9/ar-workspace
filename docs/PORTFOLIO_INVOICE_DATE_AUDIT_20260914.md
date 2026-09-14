# New Invoices from Portfolio Bill Date

The owner supplied an Invoice visible in Portfolio with the selected OPERA Bill Date while Period analysis showed zero, then explicitly required New Invoices to use the same data source as Portfolio and filter that Bill Date.

The investigation found that the previous KPI read a separate financial-history publication. Current invoices and that history were refreshed at different times. A bounded GET-only diagnostic showed that the live dated and undated OPERA requests now returned the example equally; no provider date-filter defect was established. The old saved-history zero therefore did not establish an empty current Portfolio cohort. A later exact-day history refresh also returned additional historical invoices, including closed rows; that is a different population from the saved Portfolio invoice ledger.

## Final contract

- The new service-only ar_dashboard_invoice_entries RPC reads public.ar_invoices joined to public.ar_accounts, the same saved source used by Portfolio / Account Detail.
- Raw detail rows use inclusive invoice.transaction_date between the selected dates, without filtering on current open balance. Hotel, Account and Account Type are applied before both aggregation and pagination. No observation timestamp is used as Bill Date.
- Count and original amount measure verified standalone/parent roots, including signed credit roots. Compressed children remain identifiable and are not added twice. Unverified relevant rows prevent a claimed confirmed total.
- All Hotels, KAT, TSK, account filters and drill rows share this source. The old financial-history API remains for payment statistics and their independently verified dates and mappings.
- The metric uses the saved invoice ledger behind Portfolio, including retained zero-balance rows. The screen-only open <> 0 filter must not be copied into this measure: closing a stored invoice preserves its Bill Date count and original amount. No extra population is imported from the separate history reader. Historical period-end outstanding snapshots keep their separate existing meaning.

## Verification

Synthetic SQL fixtures deliberately give current Portfolio and financial history different date populations. Worker tests assert a single protected Portfolio RPC and exact range/scope/pagination, with no history/provider request. Browser checks compare daily/range counts, hotel/type/account filtering, drill pagination and source failures independently from history completeness.

Runtime validation and release identifiers are recorded in PROJECT_STATUS.md. No customer rows, names, document bytes or diagnostic extracts are checked in.
