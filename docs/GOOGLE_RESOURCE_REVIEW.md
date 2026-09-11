# Google resource cleanup review

The owner requested cleanup of old Google Cloud resources while continuing Drive integration, then explicitly protected the default Compute service account. The Credentials screen is inside the shared AR Project; it is not a list of separate projects. Do not delete the entire project because the new application's Google integrations use it.

Protected resources:

- Project ar-project-506410 while the new application's Google Login, Gmail and Drive depend on it.
- Default Compute service account 208708155572-compute@developer.gserviceaccount.com (explicit owner instruction).
- The new application's OAuth client ar-workspace-gmail and its active callbacks/secret bindings.
- OAuth client ar-workspace, whose Google UI redirect URI matches the new Supabase project callback. This is the current Google Login client.
- Any new Drive/Picker configuration created for this application.

Cleanup remains a separate reviewable action: inventory exact resource names, determine dependencies and present the proposed deletions and impacts before deleting. A name containing a legacy prefix is not sufficient proof that deletion is safe. No cleanup has been performed by this review.

## Inventory from the Credentials screen

The new application uses the two ar-workspace OAuth clients and the new ar-workspace-picker key. A runtime source search found no Google service-account credential/impersonation references in the new Worker/frontend. This establishes separation from the listed legacy identities; it does not prove that the legacy application has stopped using them.

Potential legacy cleanup set (not yet deleted):

| Kind | Exact resource name |
|---|---|
| OAuth client | OPERA AR Gmail (created August 26, 2026) |
| OAuth client | AR Collection System Web (created August 23, 2026) |
| Service account | opera-ar-prod-backup@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-prod-drive-archive@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-drive-archive@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-prod-drive-purge@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-drive-purge@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-prod-gmail-push@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-gmail-push@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-prod-migration@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-prod-runtime@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-prod-scheduler@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-deploy@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-plan@ar-project-506410.iam.gserviceaccount.com |

Deleting these credentials can stop the old application's login/Gmail, runtime, scheduled work, archive, deployment and backup operations. This set does not delete Cloud Run services, databases, stored documents or the Google project. Exact deletion and its legacy-service impact require confirmation before the final delete action. Preserve the explicitly protected default Compute service account and all current app credentials.
