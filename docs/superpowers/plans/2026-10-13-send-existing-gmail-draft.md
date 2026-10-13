# Send an existing Gmail draft from the workspace

Owner request: allow Review & send now after Create Gmail draft, with Send as the primary colored action and Draft secondary. Preserve explicit human confirmation and prevent duplicate messages.

- [x] Add an atomic one-time dispatch claim on the existing delivery. Keep its mode/history identity; never create a replacement delivery or use messages/send as a fallback.
- [x] Validate the exact existing Gmail draft and reviewed package. Use drafts.send with the existing ID and reviewed MIME bytes, preventing a concurrent Gmail edit from changing recipients or attachments. A missing/changed draft or uncertain response cannot trigger an automatic resend.
- [x] Verify the new provider Sent receipt and use the existing actual-Sent business-history path. Keep region, signature, stage and policy checks.
- [x] Enable Send only for a verified created draft, change button hierarchy and preserve the confirmation dialog. Test duplicate clicks, changed/deleted draft, permissions and provider failures.
- [x] Qualify SQL locally, deploy and verify the current UI. Include this path in the pending isolated live PDF-to-email test; do not send the owner's customer draft without an explicit send instruction.

Provider contract: https://developers.google.com/workspace/gmail/api/guides/drafts#send_drafts allows the existing draft ID plus updated message.raw in one send request.
