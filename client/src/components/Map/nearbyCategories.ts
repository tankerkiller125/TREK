import {
  UtensilsCrossed,
  BedDouble,
  Landmark,
  ShoppingBag,
  Bus,
  Activity,
  Coffee,
  Anchor,
  Mountain,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Category } from '../../types'

/**
 * Mirror of the server-side NEARBY_CATEGORY_MAP. Keep in sync with
 * server/src/services/nearbyCategoryMap.ts when adding new categories.
 *
 * `key` is the canonical identifier sent to the backend. `matchesName` is the
 * pattern used to resolve the key back to a real Category row from the user's
 * categories table — needed because users can rename or delete the default
 * categories.
 */
export interface NearbyCategoryDef {
  key: string
  labelKey: string
  icon: LucideIcon
  matchesName: (n: string) => boolean
}

export const NEARBY_CATEGORIES: NearbyCategoryDef[] = [
  { key: 'restaurant', labelKey: 'nearby.restaurant', icon: UtensilsCrossed, matchesName: n => /restaurant|dining/i.test(n) },
  { key: 'bar_cafe',   labelKey: 'nearby.barCafe',    icon: Coffee,          matchesName: n => /bar|cafe|coffee|pub/i.test(n) },
  { key: 'hotel',      labelKey: 'nearby.hotel',      icon: BedDouble,       matchesName: n => /hotel|lodging|accommodation/i.test(n) },
  { key: 'attraction', labelKey: 'nearby.attraction', icon: Landmark,        matchesName: n => /attraction|sight|museum/i.test(n) },
  { key: 'shopping',   labelKey: 'nearby.shopping',   icon: ShoppingBag,     matchesName: n => /shop/i.test(n) },
  { key: 'activity',   labelKey: 'nearby.activity',   icon: Activity,        matchesName: n => /activity|leisure|sport/i.test(n) },
  { key: 'transport',  labelKey: 'nearby.transport',  icon: Bus,             matchesName: n => /transport|transit/i.test(n) },
  { key: 'beach',      labelKey: 'nearby.beach',      icon: Anchor,          matchesName: n => /beach/i.test(n) },
  { key: 'nature',     labelKey: 'nearby.nature',     icon: Mountain,        matchesName: n => /nature|park/i.test(n) },
]

export function resolveCategoryId(categories: Category[], key: string): number | null {
  const def = NEARBY_CATEGORIES.find(c => c.key === key)
  if (!def) return null
  const match = categories.find(c => def.matchesName(c.name))
  if (match) return match.id
  const other = categories.find(c => /other/i.test(c.name))
  return other ? other.id : null
}
