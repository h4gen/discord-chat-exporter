export interface PostData {
  id: string
  text: string
  authorName?: string
  authorImage?: string
  postUrl?: string
  element: HTMLElement
}

export type ScoreValue = 0 | 1 | 2 | 3 | 4 | 5
export type PostStatus = "pending" | "failed" | null

export interface PlatformAdapter {
  platformName: string
  getPostSelector(): string
  extractPostData(element: HTMLElement): PostData | null
  isPromoted(element: HTMLElement): boolean
  isCompany(element: HTMLElement): boolean
  insertComment(element: HTMLElement, text: string): void
  scrollToPost(id: string, element?: HTMLElement): void
  getPostUrl(id: string, postUrl?: string): string | undefined
}

