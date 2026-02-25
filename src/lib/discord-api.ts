import { Storage } from "@plasmohq/storage"

const storage = new Storage({ area: "local" })

export const DISCORD_API_BASE = "https://discord.com/api/v9"

async function getToken(): Promise<string | null> {
  return await storage.get("discord_token")
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithRetry(url: string, options: RequestInit = {}, maxRetries = 15) {
  const token = await getToken()
  if (!token) throw new Error("No Discord token found. Please sync your token first.")

  const headers = {
    ...options.headers,
    Authorization: token,
    "Content-Type": "application/json"
  }

  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, { ...options, headers })

    if (response.status === 429) {
      //... handled below
    }

    if (response.status >= 500 && response.status < 600) {
      // Handle temporary server errors with exponential backoff (capped at 30s)
      const backoffMs = Math.min(Math.pow(2, i) * 2000, 30000)
      console.warn(`Discord server error (${response.status}). Retrying in ${backoffMs}ms...`)
      await sleep(backoffMs)
      continue
    }

    if (!response.ok) {
      if (response.status === 429) {
        // Handle rate limit
        const retryAfterStr = response.headers.get("Retry-After")
        let retryAfter = 5000 // Default 5s
        
        if (retryAfterStr) {
          retryAfter = (parseFloat(retryAfterStr) * 1000) + 100 // Convert to ms + small buffer
        } else {
          try {
            const body = await response.json()
            if (body.retry_after) retryAfter = (body.retry_after * 1000) + 100
          } catch {
            // ignore parsing error if it's not JSON
          }
        }
        
        console.warn(`Rate limited by Discord. Retrying in ${retryAfter}ms...`)
        await sleep(retryAfter)
        continue
      }
      throw new Error(`Discord API error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  throw new Error("Max retries exceeded while fetching from Discord.")
}

export interface Guild {
  id: string
  name: string
  icon: string | null
}

export interface Channel {
  id: string
  name?: string
  type: number
  position?: number
  parent_id?: string
  guild_id?: string
  recipients?: {
    id: string
    username: string
    global_name?: string
  }[]
}

export interface Message {
  id: string
  content: string
  timestamp: string
  channel_id?: string
  author: {
    id: string
    username: string
    global_name?: string
  }
}

export async function getGuilds(): Promise<Guild[]> {
  return fetchWithRetry(`${DISCORD_API_BASE}/users/@me/guilds`)
}

export async function getGuildChannels(guildId: string): Promise<Channel[]> {
  const channels: Channel[] = await fetchWithRetry(`${DISCORD_API_BASE}/guilds/${guildId}/channels`)
  // Filter for text-based channels where possible (Type 0 = GUILD_TEXT)
  return channels.filter(c => c.type === 0 || c.type === 2 || c.type === 5 || c.type === 15) 
}

export async function getPrivateChannels(): Promise<Channel[]> {
  const channels: Channel[] = await fetchWithRetry(`${DISCORD_API_BASE}/users/@me/channels`)
  return channels.map(c => {
    let name = c.name
    if (!name && c.recipients && c.recipients.length > 0) {
      name = c.recipients.map(r => r.global_name || r.username).join(", ")
    }
    return { ...c, name: name || "Unknown DM", guild_id: "@me" }
  })
}

export async function getChannel(channelId: string): Promise<Channel> {
  const c: Channel = await fetchWithRetry(`${DISCORD_API_BASE}/channels/${channelId}`)
  let name = c.name
  let guild_id = c.guild_id
  
  if (c.type === 1 || c.type === 3) { // DM or Group DM
    if (!name && c.recipients && c.recipients.length > 0) {
      name = c.recipients.map(r => r.global_name || r.username).join(", ")
    }
    guild_id = "@me"
  }
  return { ...c, name: name || "Unknown Channel", guild_id }
}

export async function getMessages(channelId: string, before?: string, limit: number = 100): Promise<Message[]> {
  let url = `${DISCORD_API_BASE}/channels/${channelId}/messages?limit=${limit}`
  if (before) {
    url += `&before=${before}`
  }
  return fetchWithRetry(url)
}
