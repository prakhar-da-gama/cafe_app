import { useEffect, useRef, type RefObject } from 'react'

/* Draws the tag cloud as a little graph: unselected tags are nodes joined by
 * thin black lines (at most MAX_LINKS per node) that stretch as the tags
 * drift. Picking a tag shatters its lines into dots that fly into the Go
 * button; un-picking it brings dots back out of the button and they mend into
 * fresh lines to whatever neighbours currently have room.
 *
 * Two canvases: lines sit *under* the tag cloud (so they meet the bubbles'
 * edges), the flying dots sit *over* everything (so they can reach the dock).
 * Tags are few (≤ ~20), so the graph is plain arrays and O(n²) pair scans. */

interface Props {
  hostRef: RefObject<HTMLElement | null>
  cloudRef: RefObject<HTMLElement | null>
  targetRef: RefObject<HTMLElement | null>
  tagEls: Map<number, HTMLElement>
  ids: number[]
  selected: number[]
}

interface Pt {
  x: number
  y: number
}

interface Edge {
  a: number
  b: number
  // Mending lines grow from `a` towards `b` as their dots land.
  filled: number
  total: number
}

interface Spark {
  from: Pt
  to: () => Pt | null
  bend: number
  t0: number
  dur: number
  mend: boolean
  edge?: Edge
}

const MAX_LINKS = 3
const LINE_WIDTH = 1.5
const DOT_SPACING = 9
const DOT_R = 2
const FLY_MS = 850

const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2)
const lerp = (a: Pt, b: Pt, t: number): Pt => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

export default function TagLinks({
  hostRef,
  cloudRef,
  targetRef,
  tagEls,
  ids,
  selected,
}: Props) {
  const underRef = useRef<HTMLCanvasElement>(null)
  const overRef = useRef<HTMLCanvasElement>(null)
  const edges = useRef<Edge[]>([])
  const sparks = useRef<Spark[]>([])
  const prevSelected = useRef<number[]>(selected)
  const reduced = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  // Centre of an element in host coordinates (live: follows the CSS drift).
  function centre(el: Element | null | undefined): Pt | null {
    const host = hostRef.current
    if (!el || !host) return null
    const h = host.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2 - h.left, y: r.top + r.height / 2 - h.top }
  }
  const nodePt = (id: number) => centre(tagEls.get(id))
  const targetPt = () => centre(targetRef.current)

  function degree(id: number) {
    return edges.current.reduce((n, e) => n + +(e.a === id || e.b === id), 0)
  }
  function linked(a: number, b: number) {
    return edges.current.some(
      (e) => (e.a === a && e.b === b) || (e.a === b && e.b === a),
    )
  }

  // Wire `id` to up to `want` nearby free nodes (distance jittered so the
  // picks vary). Returns the new edges.
  function connect(id: number, free: number[], want: number): Edge[] {
    const p = nodePt(id)
    if (!p) return []
    const made: Edge[] = []
    const cands = free
      .filter((o) => o !== id && degree(o) < MAX_LINKS && !linked(id, o))
      .map((o) => {
        const q = nodePt(o)
        const d = q ? Math.hypot(q.x - p.x, q.y - p.y) : Infinity
        return { o, w: d * (0.7 + Math.random() * 0.6) }
      })
      .sort((m, n) => m.w - n.w)
    for (const { o } of cands) {
      if (made.length >= want || degree(id) >= MAX_LINKS) break
      const e: Edge = { a: id, b: o, filled: 1, total: 1 }
      edges.current.push(e)
      made.push(e)
    }
    return made
  }

  // Fresh random graph over the unselected tags.
  function buildGraph() {
    edges.current = []
    const free = ids.filter((id) => !selected.includes(id))
    const pts = new Map(free.map((id) => [id, nodePt(id)]))
    const pairs: { a: number; b: number; w: number }[] = []
    for (let i = 0; i < free.length; i++)
      for (let j = i + 1; j < free.length; j++) {
        const p = pts.get(free[i])
        const q = pts.get(free[j])
        if (!p || !q) continue
        const d = Math.hypot(q.x - p.x, q.y - p.y)
        pairs.push({ a: free[i], b: free[j], w: d * (0.6 + Math.random() * 0.8) })
      }
    pairs.sort((m, n) => m.w - n.w)
    for (const { a, b } of pairs)
      if (
        Math.random() < 0.75 &&
        degree(a) < MAX_LINKS &&
        degree(b) < MAX_LINKS
      )
        edges.current.push({ a, b, filled: 1, total: 1 })
    // Nobody left floating alone if there's anyone with room.
    for (const id of free) if (degree(id) === 0) connect(id, free, 1)
  }

  // Pick: drop the node's lines, shattering each into dots bound for Go.
  function shatter(id: number) {
    const gone = edges.current.filter((e) => e.a === id || e.b === id)
    edges.current = edges.current.filter((e) => !gone.includes(e))
    if (reduced.current) return
    const now = performance.now()
    for (const e of gone) {
      const a = nodePt(e.a)
      const b = nodePt(e.b)
      if (!a || !b) continue
      const end = lerp(a, b, e.filled / e.total)
      const n = Math.max(3, Math.round(Math.hypot(end.x - a.x, end.y - a.y) / DOT_SPACING))
      for (let i = 0; i < n; i++) {
        // Dots peel off starting from the picked tag's end.
        const t = e.a === id ? i / (n - 1) : 1 - i / (n - 1)
        sparks.current.push({
          from: lerp(a, end, t),
          to: targetPt,
          bend: Math.random() * 2 - 1,
          t0: now + i * 18 + Math.random() * 90,
          dur: FLY_MS * (0.8 + Math.random() * 0.4),
          mend: false,
        })
      }
    }
  }

  // Un-pick: new lines for the node, built from dots that leave the Go button.
  function mend(id: number) {
    const free = ids.filter((o) => !selected.includes(o))
    const made = connect(id, free, 2 + +(Math.random() < 0.5))
    const from = targetPt()
    if (reduced.current || !from) return
    const now = performance.now()
    for (const e of made) {
      const a = nodePt(e.a)
      const b = nodePt(e.b)
      if (!a || !b) continue
      const n = Math.max(3, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / DOT_SPACING))
      e.filled = 0
      e.total = n
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1)
        sparks.current.push({
          from,
          to: () => {
            const p = nodePt(e.a)
            const q = nodePt(e.b)
            return p && q ? lerp(p, q, t) : null
          },
          bend: Math.random() * 2 - 1,
          // Arrive in order along the line so it visibly grows from the tag.
          t0: now + i * 22,
          dur: FLY_MS,
          mend: true,
          edge: e,
        })
      }
    }
  }

  // New tag set → new graph.
  useEffect(() => {
    buildGraph()
    sparks.current = []
  }, [ids.join(',')])

  // Selection diff → shatter / mend.
  useEffect(() => {
    const prev = prevSelected.current
    for (const id of selected) if (!prev.includes(id)) shatter(id)
    for (const id of prev) if (!selected.includes(id)) mend(id)
    prevSelected.current = selected
  }, [selected])

  // Render loop.
  useEffect(() => {
    let raf = 0
    const fit = (c: HTMLCanvasElement, w: number, h: number, dpr: number) => {
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr)
        c.height = Math.round(h * dpr)
      }
      const ctx = c.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      return ctx
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const host = hostRef.current
      const under = underRef.current
      const over = overRef.current
      if (!host || !under || !over) return
      const w = host.clientWidth
      const h = host.clientHeight
      const dpr = Math.min(2, window.devicePixelRatio || 1)

      // Lines, clipped to the cloud's scroll viewport.
      const lc = fit(under, w, h, dpr)
      const cloud = cloudRef.current?.getBoundingClientRect()
      const hr = host.getBoundingClientRect()
      lc.save()
      if (cloud) {
        lc.beginPath()
        lc.rect(cloud.left - hr.left, cloud.top - hr.top, cloud.width, cloud.height)
        lc.clip()
      }
      lc.strokeStyle = '#000'
      lc.lineWidth = LINE_WIDTH
      lc.lineCap = 'round'
      lc.beginPath()
      for (const e of edges.current) {
        if (e.filled <= 0) continue
        const a = nodePt(e.a)
        const b = nodePt(e.b)
        if (!a || !b) continue
        const end = lerp(a, b, e.filled / e.total)
        lc.moveTo(a.x, a.y)
        lc.lineTo(end.x, end.y)
      }
      lc.stroke()
      lc.restore()

      // Flying dots.
      const sc = fit(over, w, h, dpr)
      sc.fillStyle = '#000'
      sparks.current = sparks.current.filter((s) => {
        const u = (now - s.t0) / s.dur
        if (u < 0) {
          // Waiting to leave: a shattered dot holds its spot on the old line.
          if (!s.mend) {
            sc.beginPath()
            sc.arc(s.from.x, s.from.y, DOT_R, 0, Math.PI * 2)
            sc.fill()
          }
          return true
        }
        const to = s.to()
        if (u >= 1 || !to) {
          if (s.edge && s.edge.filled < s.edge.total) s.edge.filled++
          return false
        }
        const k = ease(u)
        const dx = to.x - s.from.x
        const dy = to.y - s.from.y
        const d = Math.hypot(dx, dy) || 1
        const off = s.bend * Math.min(110, d * 0.35)
        const c = { x: (s.from.x + to.x) / 2 - (dy / d) * off, y: (s.from.y + to.y) / 2 + (dx / d) * off }
        const x = (1 - k) * (1 - k) * s.from.x + 2 * (1 - k) * k * c.x + k * k * to.x
        const y = (1 - k) * (1 - k) * s.from.y + 2 * (1 - k) * k * c.y + k * k * to.y
        // Shrink into the button / swell out of it.
        const r = s.mend ? DOT_R * (0.4 + 0.6 * k) : DOT_R * (1 - 0.7 * k)
        sc.globalAlpha = s.mend ? Math.min(1, u * 4) : Math.min(1, (1 - u) * 4)
        sc.beginPath()
        sc.arc(x, y, r, 0, Math.PI * 2)
        sc.fill()
        sc.globalAlpha = 1
        return true
      })
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <>
      <canvas ref={underRef} className="tag-links tag-links-under" aria-hidden="true" />
      <canvas ref={overRef} className="tag-links tag-links-over" aria-hidden="true" />
    </>
  )
}
