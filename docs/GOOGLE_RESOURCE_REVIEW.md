# Google resource cleanup review

The owner requested cleanup of old Google Cloud resources while continuing Drive integration, then explicitly protected the default Compute service account. The Credentials screen is inside the shared AR Project; it is not a list of separate projects. Do not delete the entire project because the new application's Google integrations use it.

Protected resources:

- Project ar-project-506410 while the new application's Google Login, Gmail and Drive depend on it.
- Default Compute service account 208708155572-compute@developer.gserviceaccount.com (explicit owner instruction).
- The new application's OAuth client ar-workspace-gmail and its active callbacks/secret bindings.
- The OAuth client currently configured for Supabase Google Login; identify it before any cleanup.
- Any new Drive/Picker configuration created for this application.

Cleanup remains a separate reviewable action: inventory exact resource names, determine dependencies and present the proposed deletions and impacts before deleting. A name containing a legacy prefix is not sufficient proof that deletion is safe. No cleanup has been performed by this review.
