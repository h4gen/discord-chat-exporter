import type { PlatformAdapter } from "./adapter"

const DEBUG = true

export class InteractionManager {
  private adapter: PlatformAdapter

  constructor(adapter: PlatformAdapter) {
    this.adapter = adapter
  }

  private log(...args: any[]) {
    if (DEBUG) console.log(`[InteractionManager:${this.adapter.platformName}]`, ...args)
  }

  public start() {
    this.log("Starting interaction manager")
    try {
      chrome.runtime?.onMessage?.addListener((msg) => {
        if (msg?.type === "scroll-to-urn" && msg.urn) {
          this.log("scroll-to received", msg.urn)
          this.adapter.scrollToPost(msg.urn)
        }
        
        if (msg?.type === "insert-comment" && msg.urn && msg.text) {
          this.log("insert-comment received", msg.urn)
          
          // On detail pages, the post might not have the ID on the container
          // but we might be ON the right page already.
          // The adapter's insertComment should handle finding the editor.
          const selector = this.adapter.getPostSelector()
          const allPosts = document.querySelectorAll(selector)
          let targetElement: HTMLElement | null = null

          for (const p of allPosts) {
            const data = this.adapter.extractPostData(p as HTMLElement)
            if (data?.id === msg.urn) {
              targetElement = p as HTMLElement
              break
            }
          }

          // If not found by ID, and it's a detail page, try a generic approach
          if (!targetElement && allPosts.length > 0) {
            // In detail view, there's usually only one main post
            targetElement = allPosts[0] as HTMLElement
          }

          if (targetElement) {
            this.adapter.insertComment(targetElement, msg.text)
          } else {
            // Last resort: just try to find ANY editor on the page
            this.adapter.insertComment(document.body, msg.text)
          }
        }
      })
    } catch (err) {
      console.error("Failed to start InteractionManager", err)
    }
  }
}

