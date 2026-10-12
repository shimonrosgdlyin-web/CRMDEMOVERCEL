export type PropertyType = 'apartment' | 'house' | 'penthouse' | 'land' | 'office'
export type PropertyStatus = 'available' | 'pending' | 'rented' | 'sold'
export type ClientStatus = 'new' | 'contacted' | 'meeting' | 'offer' | 'signed' | 'closed'
export type MatchStatus = 'suggested' | 'sent' | 'interested' | 'rejected'
export type InquiryType = 'whatsapp' | 'email' | 'call' | 'note'
export type OrganizationMemberRole = 'owner' | 'admin' | 'agent'
export type OrganizationInviteRole = 'admin' | 'agent'
export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

export interface Property {
  id: string
  agent_id: string
  organization_id?: string
  title: string
  type: PropertyType
  price: number
  address: string
  city: string
  rooms?: number
  size_sqm?: number
  floor?: number
  parking: boolean
  elevator: boolean
  description?: string
  status: PropertyStatus
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  agent_id: string
  organization_id?: string
  name: string
  phone?: string
  email?: string
  budget_min?: number
  budget_max?: number
  property_types: PropertyType[]
  preferred_cities: string[]
  rooms_min?: number
  rooms_max?: number
  notes?: string
  status: ClientStatus
  created_at: string
  updated_at: string
}

export interface Match {
  id: string
  agent_id: string
  organization_id?: string
  property_id: string
  client_id: string
  score: number
  status: MatchStatus
  created_at: string
  updated_at: string
  property?: Property
  client?: Client
}

export interface Inquiry {
  id: string
  agent_id: string
  organization_id?: string
  client_id: string
  property_id?: string
  type: InquiryType
  message?: string
  sent_at: string
  client?: { name: string; phone?: string }
  property?: { title: string; address: string }
}

export interface Profile {
  id: string
  full_name: string
  phone?: string
  agency_name?: string
  created_at: string
}

// ─── Multi-tenant foundation (Stage 1 — schema exists, not yet populated or
// enforced by app code; see crm/supabase/CLAUDE.md) ──────────────────────────

export interface Organization {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  role: OrganizationMemberRole
  created_at: string
  organization?: Organization
  profile?: Profile
}

export interface OrganizationInvite {
  id: string
  organization_id: string
  email: string
  role: OrganizationInviteRole
  invited_by: string
  // token is intentionally omitted here — it's returned once, directly, by
  // POST /api/organizations/invites to the admin who just created the
  // invite; it should never be part of a general "list invites" shape that
  // might get rendered/logged elsewhere.
  status: InviteStatus
  created_at: string
  updated_at: string
  accepted_at?: string
  expires_at: string
}

// ─── Platform super-admin panel (migration 013) ──────────────────────────────
// These shapes mirror the return types of the admin_* RPCs, NOT table rows —
// the panel never selects from a tenant table directly. Anything absent here
// is absent on purpose: no tenant business data, and no profiles.phone.

export type AdminAuditAction = 'org.suspend' | 'org.restore' | 'user.suspend' | 'user.restore'
export type AdminAuditTargetType = 'organization' | 'user'

export interface PlatformStats {
  organization_count: number
  suspended_org_count: number
  user_count: number
  suspended_user_count: number
  property_count: number
  client_count: number
  inquiry_count: number
  platform_admin_count: number
}

/** Shared by every suspendable entity — null on all three means "active". */
export interface SuspensionState {
  suspended_at: string | null
  suspended_by: string | null
  suspension_reason: string | null
}

export interface AdminOrganizationRow extends SuspensionState {
  id: string
  name: string
  created_at: string
  member_count: number
  property_count: number
  client_count: number
  inquiry_count: number
  last_activity_at: string | null
}

/** One row per member; org columns repeat across rows (it's a flat join). */
export interface AdminOrganizationDetailRow extends SuspensionState {
  organization_id: string
  organization_name: string
  created_at: string
  member_user_id: string | null
  member_email: string | null
  member_full_name: string | null
  member_agency: string | null
  member_role: OrganizationMemberRole | null
  member_joined_at: string | null
  member_suspended_at: string | null
}

export interface AdminUserRow extends SuspensionState {
  user_id: string
  email: string | null
  full_name: string | null
  agency_name: string | null
  created_at: string
  last_sign_in_at: string | null
  email_confirmed_at: string | null
  org_count: number
  is_admin: boolean
}

export interface AdminAuditLogEntry {
  id: string
  actor_id: string | null
  actor_email: string
  action: AdminAuditAction
  target_type: AdminAuditTargetType
  target_id: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface PlatformAdminRow {
  user_id: string
  email: string | null
  full_name: string | null
  granted_at: string
  granted_by: string | null
  note: string | null
}

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  apartment: 'דירה',
  house: 'בית פרטי',
  penthouse: 'פנטהאוז',
  land: 'קרקע',
  office: 'משרד',
}

export const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  available: 'זמין',
  pending: 'ממתין',
  rented: 'מושכר',
  sold: 'נמכר',
}

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  new: 'ליד חדש',
  contacted: 'יצר קשר',
  meeting: 'פגישה',
  offer: 'הצעה',
  signed: 'חתם',
  closed: 'סגור',
}

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  suggested: 'מוצע',
  sent: 'נשלח',
  interested: 'מעוניין',
  rejected: 'נדחה',
}

export const INQUIRY_TYPE_LABELS: Record<InquiryType, string> = {
  whatsapp: 'וואטסאפ',
  email: 'מייל',
  call: 'שיחה',
  note: 'הערה',
}

export const ORGANIZATION_MEMBER_ROLE_LABELS: Record<OrganizationMemberRole, string> = {
  owner: 'בעלים',
  admin: 'מנהל',
  agent: 'סוכן',
}

export const ORGANIZATION_INVITE_ROLE_LABELS: Record<OrganizationInviteRole, string> = {
  admin: 'מנהל',
  agent: 'סוכן',
}

export const INVITE_STATUS_LABELS: Record<InviteStatus, string> = {
  pending: 'ממתין',
  accepted: 'התקבל',
  expired: 'פג תוקף',
  revoked: 'בוטל',
}

export const ADMIN_AUDIT_ACTION_LABELS: Record<AdminAuditAction, string> = {
  'org.suspend': 'השעיית ארגון',
  'org.restore': 'שחזור ארגון',
  'user.suspend': 'השעיית משתמש',
  'user.restore': 'שחזור משתמש',
}

export const ADMIN_AUDIT_TARGET_TYPE_LABELS: Record<AdminAuditTargetType, string> = {
  organization: 'ארגון',
  user: 'משתמש',
}
