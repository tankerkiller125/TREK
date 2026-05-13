import { useState, useCallback, useEffect } from 'react'
import { Loader2, MapPin, Star } from 'lucide-react'
import Modal from '../shared/Modal'
import { mapsApi } from '../../api/client'
import { useTranslation } from '../../i18n'
import { useToast } from '../shared/Toast'
import { NEARBY_CATEGORIES } from './nearbyCategories'
import type { Place } from '../../types'

export interface NearbyResult {
  google_place_id: string | null
  osm_id: string | null
  name: string
  address: string
  lat: number | null
  lng: number | null
  rating: number | null
  distance_m: number | null
  types: string[]
  source: 'google' | 'openstreetmap'
}

interface NearbySearchResponse {
  results: NearbyResult[]
  source: 'google' | 'openstreetmap'
  radius_m: number
}

interface NearbyModalProps {
  place: Place
  onClose: () => void
  onPick: (result: NearbyResult, categoryKey: string) => void
}

function formatDistance(m: number | null): string {
  if (m == null) return ''
  if (m < 1000) return `${m} m`
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`
}

export default function NearbyModal({ place, onClose, onPick }: NearbyModalProps) {
  const { t, language } = useTranslation()
  const toast = useToast()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [response, setResponse] = useState<NearbySearchResponse | null>(null)

  const handlePickCategory = useCallback(async (key: string) => {
    if (place.lat == null || place.lng == null) return
    setSelectedKey(key)
    setIsLoading(true)
    setResponse(null)
    try {
      const data = await mapsApi.nearby(Number(place.lat), Number(place.lng), key, language)
      setResponse(data as NearbySearchResponse)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('nearby.searchError')
      toast.error(message)
      setSelectedKey(null)
    } finally {
      setIsLoading(false)
    }
  }, [place.lat, place.lng, language, t, toast])

  const handleBack = () => {
    setSelectedKey(null)
    setResponse(null)
  }

  useEffect(() => {
    if (place.lat == null || place.lng == null) {
      toast.error(t('nearby.missingCoords'))
      onClose()
    }
  }, [place.lat, place.lng, onClose, t, toast])

  const title = selectedKey
    ? t('nearby.resultsTitle') + ` — ${place.name}`
    : t('nearby.title') + ` — ${place.name}`

  return (
    <Modal isOpen onClose={onClose} title={title} size="lg">
      {!selectedKey && (
        <div>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            {t('nearby.pickCategory')}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {NEARBY_CATEGORIES.map(cat => {
              const Icon = cat.icon
              return (
                <button
                  key={cat.key}
                  onClick={() => handlePickCategory(cat.key)}
                  className="flex items-center gap-2 p-3 rounded-lg transition-colors text-left"
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-faint)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                >
                  <Icon size={18} />
                  <span className="text-sm font-medium">{t(cat.labelKey)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {selectedKey && (
        <div>
          <button
            onClick={handleBack}
            className="text-xs mb-3"
            style={{ color: 'var(--accent)' }}
          >
            ← {t('nearby.changeCategory')}
          </button>

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {t('nearby.searching')}
              </span>
            </div>
          )}

          {!isLoading && response && response.results.length === 0 && (
            <div className="py-10 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
              {t('nearby.noResults')}
            </div>
          )}

          {!isLoading && response && response.results.length > 0 && (
            <div className="flex flex-col gap-2">
              {response.results.map(result => (
                <button
                  key={(result.google_place_id || result.osm_id || result.name) + ':' + result.lat + ',' + result.lng}
                  onClick={() => onPick(result, selectedKey)}
                  className="flex items-start gap-3 p-3 rounded-lg text-left transition-colors"
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-faint)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                >
                  <MapPin size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{result.name}</div>
                    {result.address && (
                      <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                        {result.address}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {result.rating != null && (
                        <span className="flex items-center gap-0.5">
                          <Star size={11} fill="currentColor" />
                          {result.rating.toFixed(1)}
                        </span>
                      )}
                      {result.distance_m != null && (
                        <span>{formatDistance(result.distance_m)}</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!isLoading && response && (
            <div className="mt-4 text-xs text-center" style={{ color: 'var(--text-faint)' }}>
              {response.source === 'google' ? t('nearby.poweredByGoogle') : t('nearby.poweredByOsm')}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
