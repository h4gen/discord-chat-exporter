import { sendToBackground } from "@plasmohq/messaging"
import { storage } from "~lib/storage"
import type { PlatformAdapter, ScoreValue, PostStatus } from "./adapter"

const DEBUG = true
const OVERLAY_CLASS = "plasmo-feed-highlighter-overlay"

type PostState = {
  id: string
  element: HTMLElement
  status: PostStatus
  text: string
  score?: ScoreValue
  reason?: string
  attempts: number
  authorName?: string
  authorImage?: string
  postUrl?: string
}

const STATE_STYLES: Record<string, { border: string; shadow: string }> = {
  pending: { border: "#b0bcd0", shadow: "0 0 5px rgba(176,188,208,0.4)" },
  failed: { border: "#f87171", shadow: "0 0 8px rgba(248,113,113,0.45)" },
  score0: { border: "#e5e7eb", shadow: "0 0 2px rgba(0,0,0,0.1)" },
  score1: { border: "#fde047", shadow: "0 0 5px rgba(253,224,71,0.4)" },
  score2: { border: "#a3e635", shadow: "0 0 8px rgba(163,230,53,0.5)" },
  score3: { border: "#4ade80", shadow: "0 0 10px rgba(74,222,128,0.6)" },
  score4: { border: "#2dd4bf", shadow: "0 0 12px rgba(45,212,191,0.7)" },
  score5: { border: "#818cf8", shadow: "0 0 15px rgba(129,140,248,0.8)" }
}

export class PostManager {
  private adapter: PlatformAdapter
  private postStates = new Map<string, PostState>()
  private inflight = new Set<string>()
  private observer: MutationObserver | null = null
  
  private filterPromoted = false
  private filterCompany = false

  constructor(adapter: PlatformAdapter) {
    this.adapter = adapter
    this.initSettings()
  }

  private async initSettings() {
    this.filterPromoted = !!(await storage.get<boolean>("filterPromoted"))
    this.filterCompany = !!(await storage.get<boolean>("filterCompany"))

    storage.watch({
      filterPromoted: (c) => {
        this.filterPromoted = !!c.newValue
        if (this.filterPromoted) this.reScanAndFilter()
      },
      filterCompany: (c) => {
        this.filterCompany = !!c.newValue
        if (this.filterCompany) this.reScanAndFilter()
      }
    })
  }

  private log(...args: any[]) {
    if (DEBUG) console.log(`[PostManager:${this.adapter.platformName}]`, ...args)
  }

  private reScanAndFilter() {
    this.log("Re-scanning due to filter change")
    this.postStates.forEach((state, id) => {
      if ((this.filterPromoted && this.adapter.isPromoted(state.element)) || 
          (this.filterCompany && this.adapter.isCompany(state.element))) {
        this.removeOverlay(state.element)
        this.postStates.delete(id)
      }
    })
  }

  private removeOverlay(post: HTMLElement) {
    const overlay = post.querySelector(`.${OVERLAY_CLASS}`)
    if (overlay) overlay.remove()
  }

  private getOverlay(post: HTMLElement) {
    let overlay = post.querySelector<HTMLElement>(`.${OVERLAY_CLASS}`)
    if (!overlay) {
      overlay = document.createElement("div")
      overlay.className = OVERLAY_CLASS
      overlay.style.position = "absolute"
      overlay.style.top = "0"
      overlay.style.left = "0"
      overlay.style.width = "100%"
      overlay.style.height = "100%"
      overlay.style.borderRadius = "8px"
      overlay.style.pointerEvents = "none"
      overlay.style.zIndex = "1"
      overlay.style.boxSizing = "border-box"
      
      if (getComputedStyle(post).position === "static") {
        post.style.position = "relative"
      }
      
      post.appendChild(overlay)
    }
    return overlay
  }

  private applyStateToPost(state: PostState) {
    const overlay = this.getOverlay(state.element)
    const key =
      state.status === "pending"
        ? "pending"
        : state.status === "failed"
        ? "failed"
        : typeof state.score === "number"
        ? `score${state.score}`
        : "pending"
    const style = STATE_STYLES[key] || STATE_STYLES.pending
    overlay.style.border = `2px solid ${style.border}`
    overlay.style.boxShadow = style.shadow
    
    if (state.score !== undefined) {
      overlay.title = `Score: ${state.score}/5\nReason: ${state.reason || ''}`
    }
  }

  public start() {
    this.log("Initializing post manager engine")
    
    this.scan()
    this.observer = new MutationObserver((mutations) => {
      const postsToUpdate = new Set<HTMLElement>()
      const selector = this.adapter.getPostSelector()

      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            if (node.matches(selector)) {
              postsToUpdate.add(node)
            } else {
              const nested = node.querySelectorAll?.(selector)
              nested?.forEach((p) => postsToUpdate.add(p as HTMLElement))
              
              // Also catch updates to existing posts (lazy loading body)
              const parentPost = node.closest?.(selector)
              if (parentPost) {
                postsToUpdate.add(parentPost as HTMLElement)
              }
            }
          }
        })
      })

      postsToUpdate.forEach(post => this.registerPost(post))
    })

    this.observer.observe(document.body, { childList: true, subtree: true })
  }

  private scan() {
    const selector = this.adapter.getPostSelector()
    const posts = document.querySelectorAll(selector)
    this.log("Scan found", posts.length, "posts")
    posts.forEach((post) => this.registerPost(post as HTMLElement))
  }

  private registerPost(element: HTMLElement) {
    const data = this.adapter.extractPostData(element)
    if (!data) return

    if (this.filterPromoted && this.adapter.isPromoted(element)) return
    if (this.filterCompany && this.adapter.isCompany(element)) return

    let state = this.postStates.get(data.id)

    if (!state) {
      state = {
        id: data.id,
        element: data.element,
        text: data.text,
        status: "pending",
        attempts: 0,
        authorName: data.authorName,
        authorImage: data.authorImage,
        postUrl: data.postUrl
      }
      this.postStates.set(data.id, state)
    } else {
      state.element = element
      if (data.text) state.text = data.text
      if (data.authorName) state.authorName = data.authorName
      if (data.authorImage) state.authorImage = data.authorImage
      if (data.postUrl) state.postUrl = data.postUrl
    }

    this.applyStateToPost(state)
    this.processPost(state)
  }

  private processPost(state: PostState) {
    if (this.inflight.has(state.id)) return
    if (typeof state.score === "number" && state.status === null) return

    // Refresh text if it changed (e.g. "show more" clicked)
    const latestData = this.adapter.extractPostData(state.element)
    if (latestData?.text && latestData.text !== state.text) {
      state.text = latestData.text
    }

    if (!state.text || state.text.trim().length === 0 || !state.authorName) {
      return
    }

    this.inflight.add(state.id)
    state.status = "pending"
    this.applyStateToPost(state)

    this.fetchScore(state)
      .then(({ score, reason }) => {
        state.status = null
        state.score = score
        state.reason = reason
        state.attempts = 0
        this.applyStateToPost(state)
      })
      .catch((err) => {
        console.warn("Score fetch failed", state.id, err)
        state.status = "failed"
        state.attempts += 1
        this.applyStateToPost(state)
        this.scheduleRetry(state)
      })
      .finally(() => {
        this.inflight.delete(state.id)
        this.applyStateToPost(state)
      })
  }

  private scheduleRetry(state: PostState) {
    const retryDelay = Math.min(30000, 1000 * 2 ** state.attempts)
    setTimeout(() => this.processPost(state), retryDelay)
  }

  private async fetchScore(state: PostState): Promise<{ score: ScoreValue, reason?: string }> {
    const response = await sendToBackground<
      { text: string, urn?: string, meta?: { authorName?: string; authorImage?: string; postUrl?: string } },
      { ok: boolean; score?: number; reason?: string; error?: string }
    >({
      name: "fetch-score",
      body: { 
        text: state.text, 
        urn: state.id, 
        meta: { 
          authorName: state.authorName, 
          authorImage: state.authorImage, 
          postUrl: state.postUrl 
        } 
      }
    })

    if (response?.ok && typeof response.score === "number") {
      return { score: response.score as ScoreValue, reason: response.reason }
    }
    throw new Error(response?.error || "Unknown background error")
  }
}

