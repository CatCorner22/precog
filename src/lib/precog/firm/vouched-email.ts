/**
 * Whether Precog can vouch for an account's address, as SQL fragments over a
 * `"user"` row aliased `alias` (a name the caller writes, never user input).
 * No imports, so the firm store, the digest and the QuickBooks alert share
 * one rule without pulling each other in.
 *
 * VOUCHED_EMAIL is the firm join's rule (accountFit): the address is
 * confirmed, and the account has a password or Google sign-in, or no X
 * sign-in at all. X sign-ins carry a made-up address from the auth broker,
 * so an account that has only X is never vouched for.
 */
export const VOUCHED_EMAIL = (alias: string) => `(
  ${alias}."emailVerified" and (
    exists (
      select 1 from account a
      where a."userId" = ${alias}.id and a."providerId" in ('credential', 'grok-google')
    )
    or not exists (
      select 1 from account a where a."userId" = ${alias}.id and a."providerId" = 'grok-x'
    )
  )
)`;

/**
 * An address Precog emails on its own initiative: the weekly digest, the
 * QuickBooks service notice and the Reply-To of an owner's reminder. Exactly
 * the firm join's rule, so a Google sign-in whose address the broker did not
 * mark confirmed is not emailed either.
 */
export const TRUSTED_EMAIL = VOUCHED_EMAIL;

/** The account has a Google sign-in through the auth broker. */
export const GOOGLE_ACCOUNT = (alias: string) => `exists (
  select 1 from account a where a."userId" = ${alias}.id and a."providerId" = 'grok-google'
)`;

/** The account has an X sign-in through the auth broker. */
export const X_ACCOUNT = (alias: string) => `exists (
  select 1 from account a where a."userId" = ${alias}.id and a."providerId" = 'grok-x'
)`;
