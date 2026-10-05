# Client identity

A client row is identified by `(owner_user_id, business_id)`. Business IDs are
generated in the browser and are unique only within one owner's account.

Portfolio summaries expose `ownerUserId`, and the business switcher carries that
owner through open, save, and delete requests. Legacy links that contain only a
business ID remain valid when the caller has one matching client or owns the
matching row. If two shared clients match, Precog refuses the request instead of
choosing one.

## Remaining propagation

Feature-specific requests for reports, shares, history, procedures, controls,
and integrations still use a business ID. Their common owner resolver now
refuses ambiguous shared IDs, so these operations cannot target an arbitrary
owner. A later migration can add optional `ownerUserId` to those request
contracts and carry the active profile's owner through each feature. Browser
revision and recovery indexes can then move from business-ID keys to the same
composite key. ID-only fields stay readable until existing bookmarks and stored
browser data have aged out.
