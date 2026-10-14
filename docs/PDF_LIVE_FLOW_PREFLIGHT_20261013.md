# Live PDF-to-email preflight — 13 October 2026

The owner approved the proposed synthetic PDF Workspace → actual storage → email verification, with no business history. This is a preflight result, not completed end-to-end evidence.

## Confirmed observations

- Authenticated GET `/api/acceptance/status` returns HTTP 409 `acceptance_inactive`.
- Read-only SQL against the configured production project confirms both retired acceptance namespaces absent and zero prepared/active acceptance sessions.
- Database size at observation: 342,502,547 bytes. The existing `acceptance_admin_provision` definition rejects a database above 104,857,600 bytes before creating its namespaces. Its separate scenario reservation is 40 MiB storage, 80 MiB egress and 24 MiB database.
- Normal diagnostic send creates its own generic PDF and can include selected supplemental attachments from an existing draft. It does not independently create a synthetic reviewed document job. Sending that diagnostic again would not close the requested full-flow proof.

## Required preparation

Requalify the isolated acceptance provisioner against the current schema and resource headroom before creating any cloud fixture or enabling acceptance. Review the outdated database-size precondition without silently bypassing it or increasing paid capacity. Verify current transient-document, regional authorization, mail and tracker paths remain isolated. Use the approved single test recipient only through a private ephemeral guard. Then execute the actual edited synthetic package flow, compare attachment hashes, verify no real business events/outbox entries, and remove only exact owned test artifacts.

## Actions not taken

No provisioning, acceptance enablement, production configuration/schema change, new test email, original-sheet write, customer document upload or business event occurred in this preflight. The SQL editor may retain a private read-only query. No secret or recipient was included in that query or this report.
