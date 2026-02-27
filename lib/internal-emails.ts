/**
 * Internal team email addresses.
 *
 * Source: INTERNAL_TEAM_EMAILS environment variable (server-side only).
 * Format: comma-separated list of email addresses (case-insensitive).
 *
 * Example .env.local entry:
 *   INTERNAL_TEAM_EMAILS=alice@saral.in,bob@saral.in,test@saral.in
 *
 * These emails are used to:
 *  - Subtract the internal team's contributions from Platform Statistics when
 *    the "Show team data" toggle is OFF.
 *  - Hide internal team rows in the User Content Dashboards when the toggle is OFF.
 */
export function getInternalEmails(): string[] {
  const raw = process.env.INTERNAL_TEAM_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
