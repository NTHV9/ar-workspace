# Oracle repository issues and PR review — 2026-09-09

## Result

The public issue/PR material reviewed does not supply the missing supported external operation for rendering the native Internal AR Statement or mapping prepared `reportSeqNo` to the UI `BATCH_` output. The concrete download-related addition is for **Reporting & Analytics Object Storage delivery of scheduled BI Publisher output**. Its provenance does not establish that this delivery channel can retrieve the tenant's Internal/Customized Statement.

This is a bounded negative research result, not evidence that no private, separately entitled, future, or otherwise unpublished Oracle API exists. Existing tenant observations in `INTERNAL_STATEMENT_TRACE.md` and `STATEMENT_API_RESEARCH.md` remain unchanged.

## Scope and reproducibility

Used unauthenticated, read-only GitHub REST requests on 2026-09-09:

- [All issues and PRs, page 1](https://api.github.com/repos/oracle/hospitality-api-docs/issues?state=all&per_page=100&page=1) and [page 2](https://api.github.com/repos/oracle/hospitality-api-docs/issues?state=all&per_page=100&page=2): 126 records, comprising 15 issues and 111 PRs. Page 2 contained 26 records, so issue-list pagination was exhausted.
- [Repository issue conversation comments](https://api.github.com/repos/oracle/hospitality-api-docs/issues/comments?per_page=100): 37 records; [PR inline review comments](https://api.github.com/repos/oracle/hospitality-api-docs/pulls/comments?per_page=100): 3 records. Neither reached its page limit.
- Inspected titles/bodies and searched for Statement, report, rendering, PDF, download, receivable, `reportSeqNo`, `BATCH_`, and `reportviewer`. The narrower Statement/PDF/renderer identifiers had no matches in issue/PR titles, bodies, or issue comments. Read the three inline review comments; they concern README relative links.
- Read submitted review summaries for relevant PRs #82, #85, #104, #123, #125, and #126. These contain brief approvals, not a rendering contract. Other PR review summaries and every historical file diff were not exhaustively inspected.
- [Repository metadata](https://api.github.com/repos/oracle/hospitality-api-docs) reported `has_discussions=false`; no separate enabled GitHub Discussions channel was available.

## Relevant first-party leads

| Source | Observed evidence | Consequence for Internal Statement |
|---|---|---|
| [PR #82](https://github.com/oracle/hospitality-api-docs/pull/82), merged November 22, 2024 | Author `rb80` has GitHub association `MEMBER`; added Reporting & Analytics download-link Postman collection. [Member review](https://github.com/oracle/hospitality-api-docs/pull/82#pullrequestreview-2452065767) approved it. | First-party provenance for that separate R&A delivery workflow, not an Internal AR execution promise. |
| [PR #82 changed files](https://github.com/oracle/hospitality-api-docs/pull/82/files) | Collection description starts from BI Publisher jobs scheduled to Object Storage. It requires R&A Portal Object Storage application credentials, tenant identity, and the scheduled prefix/file name. Requests generate file/folder PAR URLs and list PAR information. | A file delivery mechanism with pre-existing scheduled output. No native Statement execution, `reportSeqNo` binding, or UI batch mapping is supplied. Do not guess prefix/file name from the OPERA report name. |
| [PR #85](https://github.com/oracle/hospitality-api-docs/pull/85) | Member-authored rename of the R&A collection/environment explicitly records no functional changes. | A rename does not add the missing renderer. |
| [PR #104](https://github.com/oracle/hospitality-api-docs/pull/104), [#125](https://github.com/oracle/hospitality-api-docs/pull/125), [#126](https://github.com/oracle/hospitality-api-docs/pull/126) | Member-authored R&A Data API/GraphQL subject-area publication and version updates. | These descriptions do not establish a PDF execution/download contract for Internal Statements. |

PR #82 links to [Oracle Support article 1017217](https://iccp.custhelp.com/app/answers/answer_view/a_id/1017217). The web tool could not open that article; **its contents were not read**. It is a concrete first-party follow-up lead, but cannot be cited as proving native Statement support.

## Authority and next question

GitHub `MEMBER` establishes organization association in the retrieved metadata; `CONTRIBUTOR` alone is not proof that a commenter speaks for Oracle. No third-party comment found here provides a native Statement solution. An unrelated [member response on issue #62](https://github.com/oracle/hospitality-api-docs/issues/62#issuecomment-1650060951) directs runtime problems to a Technical SR. The [repository README](https://github.com/oracle/hospitality-api-docs/blob/main/README.md) also identifies its API help contact. Neither is a technical answer to this Statement question.

The remaining precise Oracle question is: which supported external operation executes the existing Internal/Customized AR Statement with the prepared selection context, how does it return output identity/PDF, what credentials authorize it, and what sequencing is required relative to `postStatements`? Include the known UI `BATCH_` chain as diagnostic context, without assuming identifier equivalence or forwarding browser state.

Status: **research completed; no integration implemented, tested against the tenant, deployed, or enabled**. No message posted or sent, no tenant request, no credential access, no cloud change, and no application source change in this subtask. Only this note and ignored local caches were written.
