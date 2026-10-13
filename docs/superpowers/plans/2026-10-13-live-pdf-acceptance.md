# Live PDF acceptance requalification

**Goal:** Execute one synthetic edited PDF package through actual private storage and Gmail without production business history.

**Architecture:** Reuse the owner-bound retired acceptance gateway after qualifying current schema isolation locally. Keep the existing scenario allowances and actual provider credentials outside fixture schemas. No paid infrastructure or customer fixture data.

**Spec:** `docs/PDF_LIVE_FLOW_PREFLIGHT_20261013.md` and current owner approval.

- [x] Reproduce current provisioner compatibility locally; retain failures as evidence.
- [x] Replace the obsolete whole-database 100 MiB precondition with a bounded check against the already configured database allowance and existing reservation, without increasing scenario allowances. Verify clone dependencies, actor access and cleanup against current schema.
- [x] Verify current Worker paths route all synthetic reads/writes to the isolated context, including transient files, email and tracker side effects. Fix only demonstrated compatibility defects.
- [x] Apply qualified definitions, register exact owner/recipient-guarded scenario and temporarily enable acceptance; verify ordinary requests remain unchanged.
- [x] Create synthetic PDFs, edit/name/import a synthetic scan in the actual Workspace, review, upload and send one package to the authorized ephemeral recipient. Compare reviewed/exported/sent attachment hashes and confirm production business events/outbox unchanged.
- [x] Reconcile exact provider artifacts, clean up test state, disable acceptance and record remaining limitations and final production health.

Any failure before isolation is established prevents cloud fixture creation. A generic diagnostic email is not a substitute for this proof.
