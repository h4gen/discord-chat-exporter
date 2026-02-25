export const buildPostUrl = (urn?: string, postUrl?: string) => {
  if (postUrl) return postUrl
  if (!urn) return undefined
  // Encode urn to be safe for URL path
  const encodedUrn = encodeURIComponent(urn)
  return `https://www.linkedin.com/feed/update/${encodedUrn}`
}

