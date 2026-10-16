import { useEffect, useState } from 'react'
import {
  getServiceReviewScores,
  type ServiceReviewScores,
} from '../../api'
import ManagerHeader from '../../components/ManagerHeader'

interface Props {
  onBack: () => void
}

// The 20 service aspects in display order. `key` matches the ServiceReviewScores
// field returned by the API; `label` is the human name shown on the chart.
const ASPECTS: { key: keyof ServiceReviewScores; label: string }[] = [
  { key: 'staff_friendliness', label: 'Staff Friendliness' },
  { key: 'speed_of_service', label: 'Speed of Service' },
  { key: 'order_accuracy', label: 'Order Accuracy' },
  { key: 'attentiveness', label: 'Attentiveness' },
  { key: 'atmosphere_ambiance', label: 'Atmosphere / Ambiance' },
  { key: 'cleanliness', label: 'Cleanliness' },
  { key: 'value_for_money', label: 'Value for Money' },
  { key: 'food_quality', label: 'Food Quality' },
  { key: 'beverage_quality', label: 'Beverage Quality' },
  { key: 'menu_variety', label: 'Menu Variety' },
  { key: 'seating_comfort', label: 'Seating Comfort' },
  { key: 'wait_time_queue_management', label: 'Wait Time / Queue Management' },
  { key: 'problem_resolution', label: 'Problem Resolution' },
  { key: 'staff_knowledge', label: 'Staff Knowledge' },
  { key: 'noise_level', label: 'Noise Level' },
  { key: 'payment_billing_experience', label: 'Payment & Billing Experience' },
  { key: 'kid_family_friendliness', label: 'Kid-Family Friendliness' },
  { key: 'pet_friendliness', label: 'Pet Friendliness' },
  { key: 'aesthetic_decor', label: 'Aesthetic / Decor' },
  { key: 'accessibility', label: 'Accessibility' },
]

// Red (low) -> amber (mid) -> green (high), so the chart reads at a glance.
function barColor(score: number): string {
  if (score < 4) return '#e24a6e'
  if (score < 7) return '#f0a020'
  return '#14b98a'
}

/** Manager page: the AI-derived 0-10 score for each service aspect, plotted as
 *  a horizontal bar chart. Aspects the reviews couldn't speak to show as "No
 *  data". Recomputed in the background every 20 service reviews. */
export default function ServiceReviewAnalysis({ onBack }: Props) {
  const [scores, setScores] = useState<ServiceReviewScores | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getServiceReviewScores()
      .then((s) => alive && setScores(s))
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const scored = ASPECTS.map((a) => ({
    ...a,
    value: scores ? (scores[a.key] as number | null) : null,
  }))
  const hasAnyScore = scored.some((a) => a.value != null)

  return (
    <div className="screen menu-screen mgr-screen">
      <ManagerHeader onBack={onBack} />

      <div className="menu-head">
        <h1 className="menu-title">Service review analysis</h1>
        <p className="muted">
          AI scores across {scores?.number_of_reviews ?? 0} review(s), 0–10 per
          aspect.
        </p>
      </div>

      {error && <p className="form-error center">{error}</p>}
      {loading && <p className="muted center">Loading…</p>}

      {!loading && !error && !hasAnyScore && (
        <p className="muted center">
          No scores yet — they’re computed automatically once reviews come in.
        </p>
      )}

      {!loading && !error && hasAnyScore && (
        <ul className="sra-chart">
          {scored.map((a) => (
            <li key={a.key} className="sra-row">
              <span className="sra-label">{a.label}</span>
              <div className="sra-track">
                {a.value != null ? (
                  <div
                    className="sra-fill"
                    style={{
                      width: `${a.value * 10}%`,
                      background: barColor(a.value),
                    }}
                  />
                ) : null}
              </div>
              <span className="sra-score">
                {a.value != null ? a.value.toFixed(0) : '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
