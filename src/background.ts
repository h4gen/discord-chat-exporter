import { StorageManager, storage } from "~lib/storage-manager"
import { getMessages, getChannel } from "~lib/discord-api"
import type { Channel } from "~lib/discord-api"

console.log("Discord Downloader Background Script Initialized")

// Listen for token discovery
chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    const authHeader = details.requestHeaders?.find(
      (header) => header.name.toLowerCase() === "authorization"
    )

    if (authHeader && authHeader.value) {
      storage.get("discord_token").then((currentToken) => {
        if (currentToken !== authHeader.value) {
          console.log("New Discord Token discovered! Syncing...")
          storage.set("discord_token", authHeader.value)
        }
      })
    }
  },
  { urls: ["https://discord.com/api/*"] },
  ["requestHeaders", "extraHeaders"]
)

// Set panel behavior to open on click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error))

// Persistent Download Engine
let isProcessRunning = false

async function startDownloadEngine() {
  if (isProcessRunning) return
  isProcessRunning = true

  try {
    while (true) {
      const state = await StorageManager.getDownloadState()
      
      if (state.status !== "running") {
        isProcessRunning = false
        break
      }

      const { selectedChannels, timeDeltaValue, timeDeltaUnit, progress, currentChannelId } = state
      
      const cutoffDate = new Date()
      if (timeDeltaUnit !== 'all') {
        const val = parseInt(timeDeltaValue as any)
        if (timeDeltaUnit === 'days') cutoffDate.setDate(cutoffDate.getDate() - val)
        else if (timeDeltaUnit === 'weeks') cutoffDate.setDate(cutoffDate.getDate() - (val * 7))
        else if (timeDeltaUnit === 'months') cutoffDate.setMonth(cutoffDate.getMonth() - val)
        else if (timeDeltaUnit === 'years') cutoffDate.setFullYear(cutoffDate.getFullYear() - val)
      } else {
        cutoffDate.setTime(0)
      }

      // Determine starting point
      let completed = Math.floor((progress / 100) * selectedChannels.length)
      const channelsToProcess = selectedChannels.slice(completed)

      for (const channelId of channelsToProcess) {
        // Re-check state inside loop for pause/stop
        const loopState = await StorageManager.getDownloadState()
        if (loopState.status !== "running") break

        let meta = await StorageManager.getMetadata()
        let channel = meta.channels[channelId]

        if (!channel) {
          try {
             channel = await getChannel(channelId)
             meta.channels[channelId] = channel
             await StorageManager.saveMetadata(meta)
          } catch (e) {
             console.error("Failed to fetch missing channel metadata", e)
          }
        }

        const guild = meta.guilds[channel?.guild_id || "unknown"]
        const channelName = channel?.name || channelId
        const guildName = guild?.name || (guild?.id === "unknown" ? "Other" : guild?.id || "Unknown Server")

        await StorageManager.updateDownloadState({ currentChannelId: channelId })
        await StorageManager.addDownloadLog(`Target: ${guildName} [${guild?.id || '?'}] > #${channelName} [${channelId}]`)
        await StorageManager.addDownloadLog(`Starting backup...`)
        
        let lastMessageId: string | undefined = undefined
        let keepFetching = true
        let channelMessageCount = 0
        let batch: any[] = []

        while (keepFetching) {
          const innerState = await StorageManager.getDownloadState()
          if (innerState.status !== "running") {
            keepFetching = false
            break
          }

          try {
            const messages = await getMessages(channelId, lastMessageId, 100)
            
            if (messages.length === 0) {
              keepFetching = false
              break
            }

            const validMessages = messages
              .filter(m => new Date(m.timestamp) >= cutoffDate)
              .map(m => ({ ...m, channel_id: channelId }))
            
            batch.push(...validMessages)
            channelMessageCount += validMessages.length

            if (batch.length >= 200) {
              await StorageManager.saveMessages(channelId, batch)
              batch = []
              await StorageManager.addDownloadLog(`Saved ${channelMessageCount} messages for #${channelName}...`)
            }

            lastMessageId = messages[messages.length - 1].id

            if (new Date(messages[messages.length - 1].timestamp) < cutoffDate) {
              keepFetching = false
              break
            }

            // Anti-ban: Human-like delay between page fetches (1.0s to 2.5s)
            if (keepFetching) {
              const delayMs = Math.floor(Math.random() * 1500) + 1000 
              await new Promise(resolve => setTimeout(resolve, delayMs))
            }

          } catch (err: any) {
            if (err.message?.includes("403")) {
              await StorageManager.addDownloadLog(`Access Denied (403): Skipping #${channelName}`)
              keepFetching = false
              break
            } else {
              await StorageManager.addDownloadLog(`Error: ${err.message}`)
              await StorageManager.updateDownloadState({ status: "error" })
              isProcessRunning = false
              return
            }
          }
        }
        
        if (batch.length > 0) {
          await StorageManager.saveMessages(channelId, batch)
        }

        completed++
        const newProgress = Math.round((completed / selectedChannels.length) * 100)
        await StorageManager.updateDownloadState({ progress: newProgress })
        await StorageManager.addDownloadLog(`Channel #${channelName} backup complete.`)

        if (completed < selectedChannels.length) {
          const nextChannelDelay = Math.floor(Math.random() * 2000) + 2000 // 2s - 4s
          await new Promise(resolve => setTimeout(resolve, nextChannelDelay))
        }
      }

      // If we finished all channels
      const finalState = await StorageManager.getDownloadState()
      if (finalState.status === "running") {
        await StorageManager.updateDownloadState({ status: "finished", currentChannelId: null })
        await StorageManager.addDownloadLog("All backups complete!")
      }
      
      isProcessRunning = false
      break
    }
  } catch (err: any) {
    console.error("Background Download Error:", err)
    await StorageManager.updateDownloadState({ status: "error" })
    await StorageManager.addDownloadLog(`System Error: ${err.message}`)
  } finally {
    isProcessRunning = false
  }
}

// Watch for state changes to start the engine
storage.watch({
  "download_state": (c) => {
    if (c.newValue?.status === "running" && !isProcessRunning) {
      startDownloadEngine()
    }
  }
})

// Check status on startup
StorageManager.getDownloadState().then(state => {
  if (state.status === "running") {
    startDownloadEngine()
  }
})
