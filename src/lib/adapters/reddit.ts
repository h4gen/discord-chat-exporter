import type { PlatformAdapter, PostData } from "../adapter"

export class RedditAdapter implements PlatformAdapter {
  platformName = "reddit"

  getPostSelector(): string {
    // Shreddit-post is the modern Reddit container
    return "shreddit-post, [data-testid='post-container']"
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
    // Reddit IDs usually start with t3_
    return post.getAttribute("id") || post.getAttribute("data-fullname") || null
  }

  private extractPostText(post: HTMLElement): string {
    const title = post.getAttribute('post-title') || 
                  post.querySelector("[slot='title']")?.textContent?.trim() ||
                  post.querySelector("h1, h2, h3")?.textContent?.trim() || 
                  post.querySelector("a[data-click-id='body']")?.textContent?.trim() || ""

    const bodySelectors = [
      "[slot='text-body']",
      "div[id$='-post-rtjson-container']",
      ".post-content",
      "[data-click-id='text']",
      ".RichTextJSON-root",
      ".feed-card-text",
      ".md", // Common markdown container on Reddit
      ".ST_content", // Another common class
      ".p-4.pb-2" // Sometimes used for content
    ]

    let bodyText = ""
    for (const selector of bodySelectors) {
      const element = post.querySelector<HTMLElement>(selector)
      if (element) {
        // Try to get text while preserving structure
        // If it's a container with nested elements, innerText is usually best
        const candidate = element.innerText?.trim() || element.textContent?.trim() || ""
        if (candidate && candidate.length > bodyText.length) {
          bodyText = candidate
        }
      }
    }

    // If still no body text, and it's a shreddit-post, look specifically for its content
    if (!bodyText && post.tagName.toLowerCase() === 'shreddit-post') {
      // Try to find ANY div with content that isn't the title
      const allDivs = Array.from(post.querySelectorAll('div'))
      for (const div of allDivs) {
        const text = div.innerText?.trim()
        if (text && text.length > 20 && text !== title) {
          if (text.length > bodyText.length) bodyText = text
        }
      }
    }

    // Combine title and body with clear separation
    const fullText = (title && bodyText && !bodyText.includes(title)) 
      ? `${title}\n\n${bodyText}` 
      : (bodyText || title || "")
    
    // Clean up whitespace but preserve single newlines
    return fullText
      .replace(/[ \t]+/g, " ") // replace multiple spaces/tabs with single space
      .replace(/\n\s*\n/g, "\n\n") // normalize multiple newlines
      .trim()
  }

  private extractAuthorName(post: HTMLElement): string | undefined {
    return post.getAttribute("author") || 
           post.querySelector("a[data-testid='post_author_link']")?.textContent?.trim() ||
           post.querySelector("[slot='authorName']")?.textContent?.trim() ||
           post.querySelector(".author-name")?.textContent?.trim() ||
           post.querySelector("a[href*='/user/']")?.textContent?.trim() ||
           undefined
  }

  private extractAuthorImage(post: HTMLElement): string | undefined {
    // Reddit authors in feeds don't always have images easily accessible
    // Try to find the author image in shreddit-post slots or generic avatars
    const selectors = [
      "faceplate-img[slot='author-avatar']",
      "[slot='author-avatar'] img",
      "shreddit-async-loader[bundlename='shreddit_avatar'] img",
      "faceplate-img",
      "img[alt*='avatar']",
      "img[src*='avatar']",
      "img[src*='usericon']"
    ]
    
    for (const sel of selectors) {
      const img = post.querySelector<HTMLElement>(sel)
      if (img) {
        const src = img.getAttribute("src") || img.getAttribute("data-delayed-url") || (img as HTMLImageElement).src
        if (src && !src.includes("data:image") && !src.includes("placeholder")) return src
      }
    }
    return undefined
  }

  private extractPostUrl(post: HTMLElement): string | undefined {
    const permalink = post.getAttribute("permalink")
    if (permalink) {
      return permalink.startsWith('http') ? permalink : `https://www.reddit.com${permalink}`
    }
    return post.querySelector<HTMLAnchorElement>("a[data-click-id='body']")?.href || undefined
  }

  isPromoted(post: HTMLElement): boolean {
    return post.hasAttribute("ad-id") || !!post.querySelector(".promoted-link")
  }

  isCompany(post: HTMLElement): boolean {
    // Not directly applicable to Reddit in the same way as LinkedIn
    return false
  }

  insertComment(postEl: HTMLElement, text: string): void {
    // 1. Try modern Shreddit composer (often used in detail views)
    const composer = postEl.querySelector<HTMLElement>('shreddit-composer') || 
                     document.querySelector<HTMLElement>('shreddit-composer')
    
    if (composer) {
      const shadowRoot = composer.shadowRoot
      // Shreddit composer uses a rich text editor inside shadow DOM
      const editor = shadowRoot?.querySelector<HTMLElement>('div[contenteditable="true"]') ||
                     shadowRoot?.querySelector<HTMLElement>('.ql-editor') ||
                     shadowRoot?.querySelector<HTMLElement>('faceplate-batch[contenteditable="true"]')
      
      if (editor) {
        editor.focus()
        document.execCommand('insertText', false, text)
        editor.dispatchEvent(new Event('input', { bubbles: true }))
        return
      }
    }

    // 2. Try generic rich text editors or contenteditables
    const genericEditor = postEl.querySelector<HTMLElement>('div[contenteditable="true"]') ||
                          document.querySelector<HTMLElement>('div[contenteditable="true"]')
    if (genericEditor) {
      genericEditor.focus()
      document.execCommand('insertText', false, text)
      genericEditor.dispatchEvent(new Event('input', { bubbles: true }))
      return
    }

    // 3. Fallback for older Reddit or standard textareas
    const textarea = postEl.querySelector<HTMLTextAreaElement>('textarea') ||
                     document.querySelector<HTMLTextAreaElement>('textarea')
    
    if (textarea) {
      textarea.focus()
      // For textareas, execCommand doesn't always work, use manual insertion
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const val = textarea.value
      textarea.value = val.slice(0, start) + text + val.slice(end)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      textarea.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }

  scrollToPost(id: string, element?: HTMLElement): void {
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" })
      return
    }
    const el = document.getElementById(id) || document.querySelector(`[data-fullname="${id}"]`)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }

  getPostUrl(id: string, postUrl?: string): string | undefined {
    return postUrl
  }
}

