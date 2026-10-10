import { useEffect, useState } from 'react'
import {
  getMyStats,
  getOverallStats,
  type MyGameStat,
  type OverallGameStat,
} from '../../api'
import CafeHeader from '../../components/CafeHeader'

interface Props {
  onBack: () => void
}

type Tab = 'mine' | 'overall'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function GameStats({ onBack }: Props) {
  const [tab, setTab] = useState<Tab>('mine')

  const [mine, setMine] = useState<MyGameStat[] | null>(null)
  const [overall, setOverall] = useState<OverallGameStat[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load "my stats" once.
  useEffect(() => {
    getMyStats()
      .then(setMine)
      .catch((e) => setError((e as Error).message))
  }, [])

  // Load each page of the overall leaderboard as it's requested.
  useEffect(() => {
    if (tab !== 'overall') return
    setLoading(true)
    getOverallStats(page)
      .then((res) => {
        setOverall((prev) => (page === 1 ? res.items : [...prev, ...res.items]))
        setHasMore(res.has_more)
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [tab, page])

  const myBest = mine && mine.length > 0 ? Math.max(...mine.map((s) => s.score)) : 0

  return (
    <div className="screen stats-screen">
      <CafeHeader onBack={onBack} />

      <h1 className="stats-title">Snake stats</h1>

      <div className="stats-tabs">
        <button
          className={tab === 'mine' ? 'stats-tab on' : 'stats-tab'}
          onClick={() => setTab('mine')}
        >
          My stats
        </button>
        <button
          className={tab === 'overall' ? 'stats-tab on' : 'stats-tab'}
          onClick={() => setTab('overall')}
        >
          Overall
        </button>
      </div>

      {error && <p className="form-error center">{error}</p>}

      {tab === 'mine' && (
        <div className="stats-body">
          <div className="stats-highlight">
            <span className="muted">Your best</span>
            <strong>{myBest}</strong>
          </div>
          {mine === null ? (
            <p className="muted center">Loading…</p>
          ) : mine.length === 0 ? (
            <p className="muted center">No games yet — go play a round!</p>
          ) : (
            <ul className="stats-list">
              {mine.map((s) => (
                <li key={s.id}>
                  <span className="stats-when">{formatDate(s.datetime_started)}</span>
                  <span className="stats-score">{s.score}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'overall' && (
        <div className="stats-body">
          <ol className="leaderboard">
            {overall.map((s, i) => (
              <li key={s.id}>
                <span className="lb-rank">{i + 1}</span>
                <span className="lb-avatar">
                  {s.photo_path ? (
                    <img src={s.photo_path} alt="" />
                  ) : (
                    <span>🐍</span>
                  )}
                </span>
                <span className="lb-name">{s.name ?? 'Player'}</span>
                <span className="lb-score">{s.score}</span>
              </li>
            ))}
          </ol>
          {loading && <p className="muted center">Loading…</p>}
          {!loading && overall.length === 0 && (
            <p className="muted center">No scores recorded yet.</p>
          )}
          {hasMore && !loading && (
            <button className="ghost-btn center-block" onClick={() => setPage((p) => p + 1)}>
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  )
}
