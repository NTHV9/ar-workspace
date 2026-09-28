---
version: 1
slug: "src-drive-drivestorage-tsx"
primary_target: "src/drive/DriveStorage.tsx"
related_targets: ["src/drive/RetentionStatus.tsx", "src/drive/drive.css", "src/navigation.ts"]
---

# Storage — audit refinement, 28 September 2026

U01/U10 separates Document packages from retained evidence, older files and Drive archives. The page first explains the temporary package lifecycle; healthy Drive connection/destination setup is collapsed, while a connection needing attention stays exposed. Usage and retention status remain explicit, including unavailable or not-enabled states.

Temporary packages stay available through preparation. Confirmed Sent or explicit discard closes them; pending Draft and uncertain sends remain protected. Tracked older documents, Drive archives, remittance and supplemental evidence follow the separate one-calendar-month-after-verified-completion policy with existing holds, reopen and source-verification checks. Business history remains available. These are copy and disclosure changes, not retention-code or file-access changes.

The Operations & recovery link uses same-tab internal navigation with session/scope and unsaved-work protection; fresh tabs still require authentication. Drive destination verification, exact-file test cleanup and authorized resource boundaries remain intact. New temporary preparation does not gain an older-job archive action.

Inspected source and `.tmp/impeccable-fixes/storage.png` establish this presentation. No Drive operation or retention execution was performed by this documentation pass. Delivery evidence belongs to docs/PROJECT_STATUS.md.
