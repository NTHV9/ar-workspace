# Property-configured country display

Parent approved this display-only change. DisplaySol implements and coordinates the common model/reader hooks. No financial policy, native-PDF input or deployment.

## Source contract

Actual paired property-country reads cover all 42 hotel/code records used by the current corpus. Configured country `name` matches the native AR address country text for all 1,129 source addresses ending in a country code. These are acceptance controls, not a runtime name table.

Create separate country display proof/read helpers. The proof carries version/kind, hotel, exact requested country code, before/after **account-country snapshots**, and before/after raw country metadata. The snapshot must preserve account hotel/ID and both supplied country `value` and `code` fields (including absence/null distinctions). Do not use `arOnlyTaxSource` for this fence: it intentionally excludes addresses.

Resolve the rendered source country using the existing `country.value ?? country.code` rule. Only replace a nonempty code-shaped value with one unique same-property configured country record. If both source fields supply codes they must agree; conflicting, already-expanded, absent or unsupported values retain the existing address with an internal display gap. Do not guess via Intl, ISO tables, translation, names, guest address or another account.

The metadata record's hotel and countryCode must match. Use its nonempty bounded `name`. A supplied nonempty default description must agree with the name; unresolved nonempty translations refuse the display proof. Never substitute isoName or another label when the name evidence is missing. Require stable complete metadata pairs and reject duplicate/foreign records. A captured multi-code response may support one selected record only with its full unchanged response retained and a unique exact match; no synthetic splicing.

## Reader/model behavior

- `beginArCountryDisplayRead(reader, initial)` snapshots the actual account-country identity and reads `invoiceCountryDisplayMetadata([code])` only when a code needs resolution. No candidate makes no call.
- Across the caller's SAME existing financial fresh read, compare the fresh account-country snapshot exactly, reread the same property/code metadata, and require pair stability. Source-country or selected metadata mutation throws the existing source-changed error. Provider/missing optional evidence preserves the original address with a diagnostic gap.
- Financial qualification runs first. The pure country verifier returns only the configured display name after binding the fresh account. It grants no financial authority.
- Replace only the final address item that exactly represents the current selected source code. Preserve every other address/name/header field, all source references, financial lines, derived body rows, IDs and all seven monetary fields. Do not append a name if the existing model has no corresponding country item.
- Keep the raw packet/account unchanged. Use the common finish path for every financial strategy and allow this known display proof in existing display-envelope guards. Do not add a second financial read or let the header evidence qualify a refused invoice.

## Tests and qualification

RED tests: exact configured name replaces only the code; property-specific names are used literally; no-code/already-named paths make no metadata request; wrong hotel/code/account, duplicate/missing record, conflicting source value/code, conflicting description/translation, changed country or metadata, and forged label fail/gap as specified. Assert all other model/source fields and financial values unchanged.

Reader tests must prove before/after metadata straddles the existing financial fence for ordinary and SourceClaims paths, provider failures do not trigger another source, and source-country change is detected despite the financial fingerprint staying the same. Reuse the 42 paired metadata records and 1,129 native address controls, then verify generated PDFs during the parent's fresh cohort. No hardcoded countries or invoice exceptions.
