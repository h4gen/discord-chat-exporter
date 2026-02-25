export interface AlignmentMetrics {
  semantic_overlap: number
  complexity_fit: number
  topic_adjacency: number
}

export interface EngagementMetrics {
  correction_value: number
  authority_evidence: number
  conversational_opening: number
}

export interface QualityMetrics {
  informational_density: number
  sales_spam_likelihood: number
}

export interface CitationSource {
  name: string
  count: number
  uri?: string
}

export type SavedPost = {
  urn?: string
  text: string
  score?: number
  reason?: string
  sources?: CitationSource[]
  timestamp: number
  savedAt?: number
  authorName?: string
  authorImage?: string
  postUrl?: string

  // Detailed metrics
  alignment?: AlignmentMetrics
  engagement?: EngagementMetrics
  quality?: QualityMetrics
}

export type RecommendedCommentCategory =
  | "knowledge_transfer"
  | "constructive_dissent"
  | "social_proof"
  | "strategic_question"

export interface RecommendedComment {
  comment: string
  category: RecommendedCommentCategory
  category_rank: number
  short_reasoning: string
}

export interface CommentRecommendations {
  comments: RecommendedComment[]
}
