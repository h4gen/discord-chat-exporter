import type { PlatformAdapter, PostData } from "../adapter"

export class TwitterAdapter implements PlatformAdapter {
  platformName = "twitter"

  getPostSelector(): string {
    return 'article[data-testid="tweet"]'
  }

  extractPostData(element: HTMLElement): PostData | null {
    const id = this.extractCanonicalId(element)
    if (!id) return null

    const text = this.extractPostText(element)
    const authorName = this.extractAuthorName(element)
    const authorImage = this.extractAuthorImage(element)
    const postUrl = this.extractPostUrl(element)

    return {
      id,
      text,
      authorName,
      authorImage,
      postUrl,
      element
    }
  }

  private extractCanonicalId(post: HTMLElement): string | null {
    // Twitter doesn't have a direct ID attribute on the article, 
    // but the link to the tweet contains the ID.
    const link = post.querySelector<HTMLAnchorElement>('a[href*="/status/"]')
    if (link) {
      const match = link.href.match(/\/status\/([0-9]+)/)
      return match ? match[1] : null
    }
    return null
  }

  private extractPostText(post: HTMLElement): string {
    const textElement = post.querySelector<HTMLElement>('[data-testid="tweetText"]')
    if (textElement) {
      // Preserve structure/newlines
      return textElement.innerText?.trim() || textElement.textContent?.trim() || ""
    }
    return ""
  }

  private extractAuthorName(post: HTMLElement): string | undefined {
    const nameElement = post.querySelector('[data-testid="User-Name"]')
    if (nameElement) {
      // Twitter's User-Name block contains both display name and handle
      // We usually just want the display name (first part)
      const spans = nameElement.querySelectorAll('span')
      if (spans.length > 0) {
        return spans[0].innerText?.trim() || spans[0].textContent?.trim() || undefined
      }
    }
    return undefined
  }

  private extractAuthorImage(post: HTMLElement): string | undefined {
    const img = post.querySelector<HTMLImageElement>('[data-testid="Tweet-User-Avatar"] img')
    return img?.src || undefined
  }

  private extractPostUrl(post: HTMLElement): string | undefined {
    const link = post.querySelector<HTMLAnchorElement>('a[href*="/status/"]')
    return link?.href || undefined
  }

  isPromoted(post: HTMLElement): boolean {
    // Twitter promoted tweets have a specific "Promoted" text or SVG
    const text = post.innerText?.toLowerCase() || ""
    return text.includes("promoted") || text.includes("anzeige") || text.includes("gesponsert")
  }

  isCompany(post: HTMLElement): boolean {
    // Not easily distinguishable from user accounts on Twitter
    return false
  }

  insertComment(postEl: HTMLElement, text: string): void {
    // 1. Try to find the reply box if it's already open
    let editor = document.querySelector<HTMLElement>('[data-testid="tweetTextarea_0"]') ||
                 document.querySelector<HTMLElement>('div[contenteditable="true"]')

    if (editor) {
      editor.focus()
      document.execCommand('insertText', false, text)
      editor.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      // 2. If no editor found, try to click the reply button
      const replyButton = postEl.querySelector<HTMLElement>('[data-testid="reply"]')
      if (replyButton) {
        replyButton.click()
        // Wait for the modal/box to appear and try again
        setTimeout(() => this.insertComment(postEl, text), 500)
      }
    }
  }

  scrollToPost(id: string, element?: HTMLElement): void {
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" })
      return
    }
    // Search for the status link that contains the ID
    const links = document.querySelectorAll<HTMLAnchorElement>(`a[href*="/status/${id}"]`)
    for (const link of links) {
      const post = link.closest('article[data-testid="tweet"]')
      if (post) {
        post.scrollIntoView({ behavior: "smooth", block: "center" })
        break
      }
    }
  }

  getPostUrl(id: string, postUrl?: string): string | undefined {
    return postUrl
  }
}

