# Web password recovery verification

Implemented: dedicated recovery form, explicit link request for the allowed account, PKCE callback, new/confirm password, minimum 12-character web password, sanitized error/expired-link guidance, and mobile layout. Recovery does not update the Google password. App source-data reads and refreshes are suspended while the recovery screen is active; the URL marker is not an authorization grant.

Live configuration checked on 11 September 2026 around 00:50 ICT:

- Supabase project `jmyvpurzmoiecpydjrci` retains the original Site URL and login redirect.
- Added only `https://ar-workspace.ar-c82.workers.dev/?recover=1` to allowed redirect URLs; saved and read back two exact entries. No wildcard, other project, or OAuth client changed.
- The reset template uses `{{ .ConfirmationURL }}`. No template content or user password changed.
- Supabase built-in email service is configured, with its provider rate/recipient restrictions. No custom SMTP, paid mail provider or add-on was added.

Five local browser cases passed: explicit PKCE email request, fixed recipient and callback; anonymous URL cannot show an update form; valid synthetic session with mismatched/matching confirmation; provider error sanitization; mobile navigation without automatic mail; and one-time PKCE callback code exchange before the form. Requests were intercepted with synthetic credentials and **no actual recovery mail was sent or existing user password changed**. This verifies application behavior, not inbox delivery. Google and email/password real login evidence remains in PROJECT_STATUS.

Reference: [Supabase password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [password update](https://supabase.com/docs/reference/javascript/auth-updateuser). PKCE links must be opened in the requesting browser. A future production SMTP configuration or actual mailbox-delivery check is separate from this implemented flow.
