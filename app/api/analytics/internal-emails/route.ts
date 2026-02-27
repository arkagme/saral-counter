import { NextResponse } from "next/server";
import { getInternalEmails } from "@/lib/internal-emails";

/**
 * GET /api/analytics/internal-emails
 *
 * Returns the list of internal team email addresses stored in the
 * INTERNAL_TEAM_EMAILS environment variable.  The client uses this list to:
 *   – filter out internal users from the User Content Dashboards
 *   – subtract their contributions from the Platform Statistics numbers
 * when the "Show team data" toggle is OFF.
 *
 * This is a server-only route so the raw env var is never bundled into
 * client-side JavaScript.
 */
export async function GET() {
  const emails = getInternalEmails();
  return NextResponse.json({ emails });
}
