# AR Address for document stationery - 11 November 2026

The owner requires AR Address for every property's generated Invoice and Statement.
Both generators use accountWithAddressee. Profile-backed stationery now selects the
OPERA address type code AR ADDRESS, irrespective of BUSINESS primary status.

An exact attached AR address resolves multiple AR addresses for a shared profile.
When the attached address is BUSINESS and the same profile has one AR address,
use that AR address. Without a linked AR reference, use the unique AR primary, then the first AR
address in provider order when no AR primary exists, per the owner's follow-up.
Multiple AR primaries remain ambiguous. Profile/account identity, complete-list checks, and string-line
validation stay enforced. No AR address produces an actionable missing-address
error. Accounts without a linked profile keep their direct AR-account stationery,
except explicitly non-AR address types, which are rejected.

This changes new source generation. Previously reviewed PDF bytes and business
history are not rewritten. No OPERA account/profile settings are modified.

Focused regression verifies all seven hotel IDs, linked BUSINESS primary override,
single and multiple AR addresses, absent AR type, translated labels, identity,
pagination, malformed fields, Invoice tax/money, and Statement balances/Aging.
An actual saved OPERA replay covers two TSUN invoice sources with correct AR
addresses already selected, preserving gross, VAT and outstanding balances and
rendering two PDF pages. This replay is not a fresh OPERA read or proof of the
unidentified agency screenshot.
