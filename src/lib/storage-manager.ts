import { Storage } from "@plasmohq/storage"
import type { Message, Guild, Channel } from "./discord-api"

export const storage = new Storage({
  area: "local"
})

export interface Metadata {
  guilds: Record<string, Guild>
  channels: Record<string, Channel>
  lastSync: Record<string, string> // channelId -> last message timestamp or snowflake
}

export interface DownloadState {
  status: "idle" | "running" | "paused" | "finished" | "error"
  progress: number
  currentChannelId: string | null
  logs: string[]
  selectedChannels: string[]
  timeDeltaValue: number
  timeDeltaUnit: string
}

export class StorageManager {
  private static STORAGE_KEY_PREFIX = "msgs:"
  private static METADATA_KEY = "discord_metadata"
  private static DOWNLOAD_STATE_KEY = "download_state"

  static async getDownloadState(): Promise<DownloadState> {
    const defaultState: DownloadState = {
      status: "idle",
      progress: 0,
      currentChannelId: null,
      logs: [],
      selectedChannels: [],
      timeDeltaValue: 7,
      timeDeltaUnit: "days"
    }
    const data = await storage.get<DownloadState>(this.DOWNLOAD_STATE_KEY)
    return data || defaultState
  }

  static async updateDownloadState(update: Partial<DownloadState>): Promise<void> {
    const current = await this.getDownloadState()
    await storage.set(this.DOWNLOAD_STATE_KEY, { ...current, ...update })
  }

  static async addDownloadLog(msg: string): Promise<void> {
    const current = await this.getDownloadState()
    const logEntry = `${new Date().toLocaleTimeString([], { hour12: false })}: ${msg}`
    // Keep last 1000 logs to prevent storage bloat
    const updatedLogs = [...current.logs, logEntry].slice(-1000)
    await this.updateDownloadState({ logs: updatedLogs })
  }

  static async getMetadata(): Promise<Metadata> {
    const data = await storage.get<Metadata>(this.METADATA_KEY)
    return data || { guilds: {}, channels: {}, lastSync: {} }
  }

  static async saveMetadata(metadata: Metadata): Promise<void> {
    await storage.set(this.METADATA_KEY, metadata)
  }

  static async addGuilds(guildList: Guild[]) {
    const meta = await this.getMetadata()
    guildList.forEach(g => {
      meta.guilds[g.id] = g
    })
    await this.saveMetadata(meta)
  }

  static async addChannels(channelList: Channel[]) {
    const meta = await this.getMetadata()
    channelList.forEach(c => {
      meta.channels[c.id] = c
    })
    await this.saveMetadata(meta)
  }

  static async saveMessages(channelId: string, messages: Message[]) {
    const key = `${this.STORAGE_KEY_PREFIX}${channelId}`
    const existing = await storage.get<Message[]>(key) || []
    
    // Deduplicate by ID
    const messageMap = new Map<string, Message>()
    existing.forEach(m => messageMap.set(m.id, m))
    messages.forEach(m => messageMap.set(m.id, m))
    
    // Sort by timestamp descending
    const updated = Array.from(messageMap.values()).sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    
    await storage.set(key, updated)
    
    // Update last sync
    if (updated.length > 0) {
      const meta = await this.getMetadata()
      meta.lastSync[channelId] = updated[0].id // Store newest snowflake
      await this.saveMetadata(meta)
    }
  }

  static async getMessages(channelId: string): Promise<Message[]> {
    const key = `${this.STORAGE_KEY_PREFIX}${channelId}`
    return await storage.get<Message[]>(key) || []
  }

  static async getAllCachedChannelIds(): Promise<string[]> {
    const allKeys = await storage.getAll()
    return Object.keys(allKeys)
      .filter(k => k.startsWith(this.STORAGE_KEY_PREFIX))
      .map(k => k.replace(this.STORAGE_KEY_PREFIX, ""))
  }

  static async clearChannelData(channelId: string) {
    const key = `${this.STORAGE_KEY_PREFIX}${channelId}`
    await storage.remove(key)
    
    const meta = await this.getMetadata()
    delete meta.lastSync[channelId]
    await this.saveMetadata(meta)
  }

  static async clearAllData() {
    const ids = await this.getAllCachedChannelIds()
    for (const id of ids) {
      await storage.remove(`${this.STORAGE_KEY_PREFIX}${id}`)
    }
    await storage.remove(this.METADATA_KEY)
  }

  static async getChannelName(channelId: string): Promise<string> {
    const meta = await this.getMetadata()
    return meta.channels[channelId]?.name || channelId
  }

  static async getGuildName(guildId: string): Promise<string> {
    const meta = await this.getMetadata()
    return meta.guilds[guildId]?.name || guildId
  }
}
