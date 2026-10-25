# Net-base wrapper VAT validation — 23 October 2026

Status: implemented, tested and independently reviewed locally. Production routing
is unchanged; this is not completion of the whole AR-only replacement.

## Financial acceptance

The reference is the actual current OPERA AR Invoice PDF, not Guest Folio. Ten
captured AR PDFs were independently parsed twice. All 70 footer values agree:
before-VAT, VAT, NonVAT, gross, printed outstanding, debit and credit.

The underlying source contains 93 selected wrappers, 503 wrapper components and
19 ordinary direct Revenue rows. Ninety-six components use VAT on posted net
alone, excluding the service generate from the VAT calculation base. Each has
explicit ownership and posted generated-child references. Paired current rules
validate the observed relationship; they are not asserted to be historical rules.

Posted SVC remains included in the before-VAT footer. It is neither removed from
that footer nor relabelled NonVAT solely because excluded from the VAT basis.
Actual posted amounts are retained; this change does not recalculate the ledger.

## Implementation and independent review

A separate proof binds complete before/after financial sources and exact
wrapper/package/component/generate identities. Only individually verified
component IDs may bypass the full-gross VAT ratio. All other strict scope,
residual, precision and payment checks remain. No native fallback or per-Invoice
exception was added. The two separate TSK rounding/allocation shapes stay deferred.

Reviews found missing reverse-reference closure, contradictory supplied wrapper
amounts and package/monetary-ID aliases. Red counterexamples reproduced these;
all were repaired and independently re-reviewed. Unknown overlap shapes are
unsupported by this narrow proof, not labelled universally invalid OPERA data.

Final checks: 242 files / 2,839 regression tests, 349 focused tests, typecheck,
build and whitespace checks passed. Astra independently passed the final two
net-base suites (60 tests). The existing large-bundle build warning remains.

## Fresh source and printed PDF checks

All ten scoped fresh OPERA reads completed successfully. The final verifier
revalidated their complete packets, with zero forbidden Guest calls. Ten PDFs
were produced privately using the application's renderer (11 pages). Reopening
those generated PDFs yielded all 70 money values exactly equal to the AR PDF
references, with no missing fields or out-of-page text. A representative footer
was also visually compared. The final model is unchanged from the model printed
into these PDFs; selected lines and tax identity are preserved.

Full 1,402-case recorded-source regression: 1,212 exact seven-field matches,
190 unqualified, zero monetary mismatches and zero forbidden report calls. All
1,202 previous matches remain; the ten newly admitted cases equal this cohort.
This is not fresh live certification of all 1,402 cases.

## Separate visible-text findings

The 112 native visible rows agree on dates and debit/credit amounts. Five native
PDFs differ from the previous generated model in 35 wrapper descriptions and five
references (native blank versus a model check reference). These differences are
pre-existing and unchanged by this tax proof. The native package label was not
found in the captured non-Guest API responses. Do not claim complete visible-text
parity, hardcode labels, or silently blank references without a source-backed rule.
These findings remain open independently of the financial acceptance above.

## Evidence and external state

Raw PDFs, models and customer records stay in ignored private audit storage.
Key evidence names: `astra-net-vat-acceptance.private.json`,
`net-base-native-tax-check.private.json`, `net-base-final-validation.private.json`,
and `net-base-output/pdf-field-check.private.json`, under
`.tmp/invoice-parity-20261022/`.

All temporary authenticated previews stopped and nonce/session files were removed.
No email, ledger, billing history, Sheet dates, access settings or paid services
changed. Nothing in this stage was deployed or enabled on the live web route.
