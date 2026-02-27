import { StorageManager, storage } from "~lib/storage-manager"
import { getMessages, getChannel, getActiveThreads, getArchivedThreads } from "~lib/discord-api"
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
        if (timeDeltaUnit === 'hours') cutoffDate.setHours(cutoffDate.getHours() - val)
        else if (timeDeltaUnit === 'days') cutoffDate.setDate(cutoffDate.getDate() - val)
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
        
        let targets: { id: string, name: string }[] = []
        
        // Add the main channel (if it's not a forum, forum itself has no messages)
        if (channel?.type !== 15) {
          targets.push({ id: channelId, name: channelName })
        }

        if (channel?.guild_id && channel?.guild_id !== "@me") {
          await StorageManager.addDownloadLog(`Checking for threads in #${channelName}...`)
          try {
             const activeThreads = await getActiveThreads(channel.guild_id)
             const myActive = activeThreads.filter(t => t.parent_id === channelId)
             const archivedPublic = await getArchivedThreads(channelId, 'public', cutoffDate)
             
             const allThreads = [...myActive, ...archivedPublic]
             // Dedup threads
             const uniqueThreads = Array.from(new Map(allThreads.map(t => [t.id, t])).values())
             
             if (uniqueThreads.length > 0) {
               await StorageManager.addDownloadLog(`Found ${uniqueThreads.length} threads in #${channelName}.`)
               targets.push(...uniqueThreads.map(t => ({ id: t.id, name: t.name || t.id })))
             }
          } catch (e) {
             await StorageManager.addDownloadLog(`Could not fetch threads for #${channelName}.`)
          }
        }

        if (targets.length === 0 && channel?.type === 15) {
           await StorageManager.addDownloadLog(`No threads found in forum #${channelName}.`)
        }

        for (const target of targets) {
          const isThread = target.id !== channelId;
          const displayTargetName = isThread ? `${channelName} > ${target.name}` : channelName;
          await StorageManager.addDownloadLog(`Starting backup for ${isThread ? 'thread' : 'channel'} ${displayTargetName}...`)
          
          const existingMessagesInDb = await StorageManager.getMessages(channelId);
          const existingIds = new Set(existingMessagesInDb.map(m => m.id));
          const targetMessages = existingMessagesInDb.filter(m => isThread ? (m as any).thread_id === target.id : !(m as any).thread_id);
          const oldestExistingId = targetMessages.length > 0 ? targetMessages[targetMessages.length - 1].id : undefined;
          const absoluteOldestKnownObj = targetMessages.length > 0 ? new Date(targetMessages[targetMessages.length - 1].timestamp).getTime() : 0;

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
              const messages = await getMessages(target.id, lastMessageId, 100)
              
              if (messages.length === 0) {
                keepFetching = false
                break
              }

              const allFetchedAreKnown = messages.every(m => existingIds.has(m.id));

              const validMessages = messages
                .filter(m => new Date(m.timestamp) >= cutoffDate)
                .filter(m => !existingIds.has(m.id))
                .map(m => ({ 
                  ...m, 
                  channel_id: channelId, // bucket into the parent channel for DB 
                  ...(isThread ? { thread_id: target.id, thread_name: target.name } : {})
                }))
              
              validMessages.forEach(m => existingIds.add(m.id));
              batch.push(...validMessages)
              channelMessageCount += validMessages.length

              if (batch.length >= 200) {
                await StorageManager.saveMessages(channelId, batch)
                batch = []
                await StorageManager.addDownloadLog(`Saved ${channelMessageCount} new messages for ${displayTargetName}...`)
              }

              lastMessageId = messages[messages.length - 1].id

              if (new Date(messages[messages.length - 1].timestamp) < cutoffDate) {
                keepFetching = false
                break
              }
              
              if (allFetchedAreKnown && oldestExistingId) {
                const currentOldestFetched = new Date(messages[messages.length - 1].timestamp).getTime();
                if (currentOldestFetched > absoluteOldestKnownObj) {
                  await StorageManager.addDownloadLog(`Fast-forwarding past known messages...`);
                  lastMessageId = oldestExistingId;
                }
              }

              // Anti-ban: Human-like delay between page fetches (1.0s to 2.5s)
              if (keepFetching) {
                const delayMs = Math.floor(Math.random() * 1500) + 1000 
                await new Promise(resolve => setTimeout(resolve, delayMs))
              }

            } catch (err: any) {
              if (err.message?.includes("403")) {
                await StorageManager.addDownloadLog(`Access Denied (403): Skipping ${displayTargetName}`)
                keepFetching = false
                break
              } else if (err.message?.includes("400")) {
                await StorageManager.addDownloadLog(`Bad Request (400): Skipping ${displayTargetName}. (Normal for empty forums)`)
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
          
          await StorageManager.addDownloadLog(`Finished: ${channelMessageCount} new messages from ${displayTargetName}.`)
        }

        completed++
        const newProgress = Math.round((completed / selectedChannels.length) * 100)
        await StorageManager.updateDownloadState({ progress: newProgress })
        await StorageManager.addDownloadLog(`Finished processing #${channelName} (Total completed: ${completed}/${selectedChannels.length})`)

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
