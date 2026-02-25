import type { PlatformAdapter, PostData } from "../adapter"

export class LinkedInAdapter implements PlatformAdapter {
  platformName = "linkedin"

  getPostSelector(): string {
    return [
      '[data-id*="urn:li:activity:"]',
      '[data-urn*="urn:li:activity:"]',
      '[data-id^="urn:li:aggregate"]',
      '[data-urn^="urn:li:aggregate"]'
    ].join(", ")
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
    const raw =
      post.getAttribute("data-id") ||
      post.getAttribute("data-urn") ||
      post.getAttribute("data-reaction-urn") ||
      ""
    const match = raw.match(/urn:li:activity:[^,)\s]+/)
    if (match) {
      return match[0]
    }
    return raw || null
  }

  private extractPostText(post: HTMLElement): string {
    const selectors = [
      ".feed-shared-update-v2__commentary",
      ".feed-shared-inline-show-more-text__text-view",
      ".feed-shared-inline-show-more-text",
      ".feed-shared-update-v2__description",
      ".update-components-text",
      ".break-words",
      ".tvm-parent-container",
      "[data-test-id='main-feed-post-content']"
    ]

    for (const selector of selectors) {
      const element = post.querySelector(selector)
      if (element) {
        // Collect text while preserving some structure
        const text = Array.from(element.childNodes)
          .map(node => {
            if (node.nodeType === Node.TEXT_NODE) return node.textContent
            if (node instanceof HTMLElement) {
              if (node.tagName.toLowerCase() === 'br') return "\n"
              if (node.classList.contains('feed-shared-inline-show-more-text__see-more-less-toggle')) return ""
              return node.innerText
            }
            return ""
          })
          .join("")
          .trim()
        
        if (text) {
          return text
            .replace(/[ \t]+/g, " ")
            .replace(/\n\s*\n/g, "\n\n")
        }
      }
    }

    return post.textContent?.trim().replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n\n") ?? ""
  }

  private extractAuthorName(post: HTMLElement): string | undefined {
    const selectors = [
      "a.feed-shared-actor__container-link span[dir='ltr']",
      ".update-components-actor__name span[dir='ltr']",
      ".feed-shared-actor__title span[dir='ltr']",
      ".feed-shared-actor__name",
      ".update-components-actor__title",
    ]
    for (const sel of selectors) {
      const el = post.querySelector<HTMLElement>(sel)
      let text = el?.textContent?.trim()
      if (text) {
        const firstLine = text.split('\n')[0].trim()
        const half = Math.floor(firstLine.length / 2)
        if (firstLine.length > 4 && firstLine.slice(0, half) === firstLine.slice(half)) {
          return firstLine.slice(0, half)
        }
        return firstLine
      }
    }
    const imgAlt =
      post.querySelector<HTMLImageElement>(".feed-shared-actor__avatar img")?.alt ||
      post.querySelector<HTMLImageElement>(".update-components-actor__avatar img")?.alt
    if (imgAlt && imgAlt.trim()) return imgAlt.trim().split('\n')[0].trim()
    return undefined
  }

  private extractAuthorImage(post: HTMLElement): string | undefined {
    const selectors = [
      ".feed-shared-actor__avatar img",
      ".update-components-actor__avatar img",
      ".ivm-image-view-model img",
    ]
    for (const sel of selectors) {
      const img = post.querySelector<HTMLImageElement>(sel)
      const src = img?.src || img?.getAttribute("data-delayed-url")
      if (src) return src
    }
    return undefined
  }

  private extractPostUrl(post: HTMLElement): string | undefined {
    const link = post.querySelector<HTMLAnchorElement>("a[href*='urn:li:activity:']")
    const href = link?.href
    if (href) return href
    return undefined
  }

  isPromoted(post: HTMLElement): boolean {
    const selectors = [
      ".feed-shared-actor__sub-description",
      ".feed-shared-update-v2__control-menu-container",
      ".update-components-actor__sub-description"
    ]
    for (const sel of selectors) {
      const el = post.querySelector(sel)
      if (el?.textContent?.toLowerCase().includes("promoted") || 
          el?.textContent?.toLowerCase().includes("anzeige") || 
          el?.textContent?.toLowerCase().includes("gesponsert")) {
        return true
      }
    }
    return false
  }

  isCompany(post: HTMLElement): boolean {
    const authorLink = post.querySelector<HTMLAnchorElement>('a[href*="/company/"]')
    return !!authorLink
  }

  insertComment(postEl: HTMLElement, text: string): void {
    const editor = postEl.querySelector<HTMLElement>('div[contenteditable="true"]') ||
                   postEl.querySelector<HTMLElement>('.ql-editor') ||
                   postEl.querySelector<HTMLElement>('.comments-comment-box__editor') ||
                   document.querySelector<HTMLElement>('.ql-editor') || // Global fallback for detail pages
                   document.querySelector<HTMLElement>('div[contenteditable="true"]')

    if (editor) {
      editor.focus()
      document.execCommand('insertText', false, text)
      editor.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      const commentButton = postEl.querySelector<HTMLElement>('.comment-button') ||
                          postEl.querySelector<HTMLElement>('button[aria-label="Comment"]') ||
                          postEl.querySelector<HTMLElement>('.artdeco-button--tertiary') ||
                          document.querySelector<HTMLElement>('button[aria-label="Comment"]')
      
      if (commentButton) {
        commentButton.click()
        setTimeout(() => this.insertComment(postEl, text), 500)
      }
    }
  }

  scrollToPost(id: string, element?: HTMLElement): void {
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" })
      return
    }
    const selector = [
      `[data-id*="${id}"]`,
      `[data-urn*="${id}"]`,
      `[data-reaction-urn*="${id}"]`
    ].join(",")
    const el = document.querySelector<HTMLElement>(selector)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }

  getPostUrl(id: string, postUrl?: string): string | undefined {
    if (postUrl) return postUrl
    if (!id) return undefined
    const encodedUrn = encodeURIComponent(id)
    return `https://www.linkedin.com/feed/update/${encodedUrn}`
  }
}

