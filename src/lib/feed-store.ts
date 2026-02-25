import type { AlignmentMetrics, CitationSource, EngagementMetrics, QualityMetrics } from "./types"

export type ScoredPost = {
  text: string
  score: number
  reason?: string
  sources?: CitationSource[]
  timestamp: number
  urn?: string
  authorName?: string
  authorImage?: string
  postUrl?: string

  // Detailed metrics
  alignment?: AlignmentMetrics
  engagement?: EngagementMetrics
  quality?: QualityMetrics
}

type Listener = () => void

let state: ScoredPost[] = []
const listeners = new Set<Listener>()
const LIMIT = 100

const notify = () => {
  listeners.forEach((l) => l())
}

const sortPosts = (posts: ScoredPost[]) =>
  [...posts].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.timestamp - a.timestamp
  })

const setState = (next: ScoredPost[]) => {
  state = next
  notify()
}

const addOrUpdate = (post: ScoredPost) => {
  // dedupe by urn when present, otherwise by text
  const idx = state.findIndex((p) => (post.urn ? p.urn === post.urn : p.text === post.text))
  let next = [...state]

  if (idx >= 0) {
    next[idx] = { ...next[idx], ...post }
  } else {
    next.unshift(post)
  }

  next = sortPosts(next)
  if (next.length > LIMIT) {
    next = next.slice(0, LIMIT)
  }

  setState(next)
}

const clear = () => {
  if (state.length === 0) return
  setState([])
}

const getSnapshot = () => state

const subscribe = (listener: Listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const feedStore = {
  addOrUpdate,
  clear,
  getSnapshot,
  subscribe
}
