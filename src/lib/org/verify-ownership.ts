import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Confirms a client_id from a request body actually belongs to the calling
 * agent, in their current org — not just that it's a validly-shaped UUID.
 * Zod (client.schema.ts / inquiry.schema.ts / the inline schema in
 * matches/route.ts) only ever checks the UUID *format*; without this query,
 * any authenticated caller could reference another org's client_id and RLS
 * would not independently catch it (inquiries' RLS checks organization_id on
 * the row being inserted, not that the referenced client_id belongs there —
 * security-review finding, 2026-08-30).
 *
 * Returns the full row (so callers that need the client's data, like the
 * matching algorithm, don't have to fetch it twice) or null if it doesn't
 * exist / doesn't belong to this agent+org.
 */
export async function verifyClientOwnership(
  supabase: SupabaseClient,
  clientId: string,
  userId: string,
  organizationId: string
) {
  const { data } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('agent_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  return data
}

/**
 * Same as verifyClientOwnership but for property_id — properties are
 * org-shared (Stage 2), not agent-owned, so this checks organization_id
 * only, no agent_id, matching every other properties-table query in this
 * codebase (see crm/CLAUDE.md).
 */
export async function verifyPropertyOwnership(
  supabase: SupabaseClient,
  propertyId: string,
  organizationId: string
) {
  const { data } = await supabase
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  return data
}
