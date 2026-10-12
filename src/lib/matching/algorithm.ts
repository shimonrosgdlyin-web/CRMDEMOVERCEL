import type { Property, Client } from '@/types'

export interface MatchResult {
  property_id: string
  client_id: string
  score: number
  reasons: string[]
}

export function scoreMatch(property: Property, client: Client): MatchResult {
  let score = 0
  const reasons: string[] = []

  // Budget match (40 points)
  if (client.budget_min !== undefined || client.budget_max !== undefined) {
    const withinMin = client.budget_min === undefined || property.price >= client.budget_min
    const withinMax = client.budget_max === undefined || property.price <= client.budget_max
    if (withinMin && withinMax) {
      score += 40
      reasons.push('מחיר בתקציב')
    } else if (withinMax && client.budget_max && property.price > client.budget_max * 0.9) {
      score += 20
      reasons.push('מחיר קרוב לתקציב')
    }
  } else {
    score += 20 // no budget preference — partial match
  }

  // Property type match (25 points)
  if (client.property_types.length === 0 || client.property_types.includes(property.type)) {
    score += 25
    reasons.push('סוג נכס מתאים')
  }

  // City match (20 points)
  if (
    client.preferred_cities.length === 0 ||
    client.preferred_cities.some(
      (c) => c.toLowerCase() === property.city.toLowerCase()
    )
  ) {
    score += 20
    reasons.push('עיר מועדפת')
  }

  // Rooms match (15 points)
  if (property.rooms !== undefined) {
    const aboveMin =
      client.rooms_min === undefined || property.rooms >= client.rooms_min
    const belowMax =
      client.rooms_max === undefined || property.rooms <= client.rooms_max
    if (aboveMin && belowMax) {
      score += 15
      reasons.push('מספר חדרים מתאים')
    } else if (client.rooms_min === undefined && client.rooms_max === undefined) {
      score += 8
    }
  }

  return { property_id: property.id, client_id: client.id, score, reasons }
}

export function matchPropertiesToClient(
  properties: Property[],
  client: Client,
  minScore = 40
): MatchResult[] {
  return properties
    .map((p) => scoreMatch(p, client))
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score)
}
