import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { StorageManager } from "~lib/storage-manager"
import { getPrivateChannels } from "~lib/discord-api"
import type { Message, Guild, Channel } from "~lib/discord-api"
import { Button } from "~components/ui/button"
import { ScrollArea } from "~components/ui/scroll-area"
import { Badge } from "~components/ui/badge"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "~components/ui/accordion"
import { 
  Database, 
  Download, 
  Trash2, 
  Server, 
  Hash, 
  ChevronRight, 
  FileJson, 
  FileSpreadsheet,
  Clock,
  DownloadCloud
} from "lucide-react"

interface ChannelStats {
  channel: Channel
  count: number
  lastSync?: string
}

interface GuildGroup {
  guild: Guild
  channels: ChannelStats[]
}

export default function DataViewPage() {
  const [groups, setGroups] = useState<GuildGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadData = async () => {
    setIsLoading(true)
    let meta = await StorageManager.getMetadata()
    const cachedIds = await StorageManager.getAllCachedChannelIds()
    
    // Auto-heal missing or corrupted DM metadata
    let needsHeal = false
    const unknownIds = cachedIds.filter(id => !meta.channels[id] || meta.channels[id].guild_id === "unknown")
    
    if (unknownIds.length > 0) {
      try {
        const dms = await getPrivateChannels()
        for (const dm of dms) {
          if (unknownIds.includes(dm.id)) {
             meta.channels[dm.id] = dm
             needsHeal = true
          }
        }
        if (needsHeal) {
          await StorageManager.saveMetadata(meta)
          meta = await StorageManager.getMetadata() // reload
        }
      } catch (e) {
        // ignore errors silently
      }
    }

    const guildMap: Record<string, GuildGroup> = {}
    
    for (const channelId of cachedIds) {
      const msgs = await StorageManager.getMessages(channelId)
      if (msgs.length === 0) continue

      const channel = meta.channels[channelId] || { id: channelId, name: `Channel (${channelId})`, type: 0, guild_id: "unknown" }
      let guildId = channel.guild_id || "unknown"
      
      // Safety net: if it's strictly a numeric string and we have no meta, assume it's a DM or unknown
      if (guildId === "unknown" && !meta.channels[channelId]) {
         guildId = "@me" // Force unmapped channels into Direct Messages to prevent ghosting
      }

      const entry: ChannelStats = {
        channel,
        count: msgs.length,
        lastSync: msgs[0]?.timestamp
      }

      if (!guildMap[guildId]) {
        const guild = meta.guilds[guildId] || { id: guildId, name: guildId === "unknown" ? "Other / Legacy" : guildId === "@me" ? "Direct Messages" : `Server (${guildId})`, icon: null }
        guildMap[guildId] = {
          guild,
          channels: []
        }
      }
      guildMap[guildId].channels.push(entry)
    }

    // Sort groups by name and channels by position/name
    const sortedGroups = Object.values(guildMap).sort((a, b) => a.guild.name.localeCompare(b.guild.name))
    sortedGroups.forEach(g => {
      g.channels.sort((a, b) => (a.channel.position || 0) - (b.channel.position || 0) || a.channel.name.localeCompare(b.channel.name))
    })

    setGroups(sortedGroups)
    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleExportCSV = (filename: string, msgs: Message[], meta: any) => {
    const escape = (val: any) => {
      const str = String(val || "").replace(/"/g, '""')
      return `"${str}"`
    }

    const headers = ["Server", "Channel", "Message ID", "Author ID", "Author Name", "Timestamp", "Content"]
    const rows = [headers.join(",")]
    
    msgs.forEach(m => {
      const cId = m.channel_id || "unknown"
      const channel = meta.channels[cId] || { name: cId, guild_id: 'unknown' }
      const guild = meta.guilds[channel.guild_id] || { name: channel.guild_id }
      
      const row = [
        escape(guild.name),
        escape(channel.name),
        m.id,
        m.author.id,
        escape(m.author.username),
        m.timestamp,
        escape(m.content)
      ]
      rows.push(row.join(","))
    })

    const csvContent = rows.join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    
    link.setAttribute("href", url)
    link.setAttribute("download", `discord_${filename.replace(/\s+/g, "_")}_${Date.now()}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleExportAllInGuild = async (group: GuildGroup) => {
    const allMessages: Message[] = []
    const meta = await StorageManager.getMetadata()
    for (const stat of group.channels) {
      const msgs = await StorageManager.getMessages(stat.channel.id)
      for (const m of msgs) allMessages.push(m)
    }
    // Sort combined by timestamp
    allMessages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    handleExportCSV(group.guild.name, allMessages, meta)
  }

  const handleDelete = async (channelId: string) => {
    if (confirm("Are you sure you want to delete this cached data?")) {
      await StorageManager.clearChannelData(channelId)
      await loadData()
    }
  }

  const handleDeleteGuild = async (group: GuildGroup) => {
    if (confirm(`Delete everything cached for ${group.guild.name}?`)) {
      for (const stat of group.channels) {
        await StorageManager.clearChannelData(stat.channel.id)
      }
      await loadData()
    }
  }

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  }

  if (groups.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <Database className="w-12 h-12 mb-4 opacity-20" />
        <h3 className="font-semibold text-foreground">No Local Data</h3>
        <p className="text-xs mt-1">Start a download to see your archives here.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background">
      <div className="p-4 border-b bg-card shrink-0 flex justify-between items-center shadow-sm z-10">
        <div className="flex flex-col">
          <h2 className="text-sm font-bold">Local Archives</h2>
          <span className="text-[10px] text-muted-foreground font-medium">{groups.reduce((acc, g) => acc + g.channels.length, 0)} cached channels</span>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="h-8 gap-1.5 text-[11px] font-bold border-primary/20 hover:bg-primary/5 text-primary"
          onClick={async () => {
             const allMsgs: Message[] = []
             const meta = await StorageManager.getMetadata()
             for(const g of groups) {
               for(const s of g.channels) {
                 const m = await StorageManager.getMessages(s.channel.id)
                 for (const msg of m) allMsgs.push(msg)
               }
             }
             allMsgs.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
             handleExportCSV("FullArchive", allMsgs, meta)
          }}
        >
          <DownloadCloud className="w-3.5 h-3.5" />
          Export All
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-3 pt-4 px-3 pb-6">
          <Accordion type="multiple" className="space-y-2.5">
            {groups.map(group => (
              <AccordionItem key={group.guild.id} value={group.guild.id} className="border-none">
                <div className="group/item flex items-stretch bg-card border border-muted/60 rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-primary/20 transition-all h-12">
                  <div className="flex-1 flex items-center min-w-0">
                    <AccordionTrigger className="flex-1 hover:no-underline py-0 h-full px-4 text-sm font-bold transition-all border-none hover:bg-muted/10 [&[data-state=open]]:rounded-b-none overflow-hidden">
                      <div className="flex items-center gap-3 text-left min-w-0 w-full">
                        {group.guild.icon ? (
                          <img 
                            src={`https://cdn.discordapp.com/icons/${group.guild.id}/${group.guild.icon}.png?size=32`} 
                            className="w-7 h-7 rounded-lg shrink-0 shadow-sm"
                            alt={group.guild.name}
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-[10px] text-primary shrink-0 border border-primary/20 font-black">
                            {group.guild.name.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span className="truncate flex-1 font-bold text-foreground/90">{group.guild.name}</span>
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-bold bg-muted/80 text-muted-foreground border-none shrink-0 mr-4">
                          {group.channels.length}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                  </div>
                  
                  <div className="flex gap-0.5 pr-2 shrink-0 border-l border-muted/20 pl-1 items-center bg-muted/5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                      title="Export Server"
                      onClick={(e) => { e.stopPropagation(); handleExportAllInGuild(group); }}
                    >
                      <DownloadCloud className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
                      title="Delete Server Cache"
                      onClick={(e) => { e.stopPropagation(); handleDeleteGuild(group); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <AccordionContent className="bg-muted/10 border-x border-b border-muted/40 rounded-b-xl px-2.5 py-3 -mt-px space-y-2">
                  <div className="space-y-1.5">
                    {group.channels.map(stat => (
                      <div key={stat.channel.id} className="bg-card border border-muted/40 rounded-lg p-3 flex items-center justify-between hover:border-primary/30 transition-shadow shadow-sm">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-8 h-8 flex items-center justify-center bg-muted/30 rounded-md text-muted-foreground shrink-0 border border-muted/10">
                            <Hash className="w-4 h-4 opacity-70" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-[12px] font-bold truncate text-foreground leading-tight">{stat.channel.name}</h4>
                            <div className="flex items-center gap-2.5 mt-1 text-[10px] text-muted-foreground font-semibold">
                              <span className="flex items-center gap-1.5">
                                <Database className="w-3 h-3 text-primary/50" /> {stat.count.toLocaleString()}
                              </span>
                              {stat.lastSync && (
                                <span className="flex items-center gap-1.5 border-l border-muted/30 pl-2.5">
                                  <Clock className="w-3 h-3 text-primary/50" /> {new Date(stat.lastSync).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-0.5 shrink-0 pl-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5"
                            onClick={async () => {
                              const msgs = await StorageManager.getMessages(stat.channel.id)
                              const meta = await StorageManager.getMetadata()
                              handleExportCSV(stat.channel.name, msgs, meta)
                            }}
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                            onClick={() => handleDelete(stat.channel.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </ScrollArea>
    </div>
  )
}

function Loader2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2003/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2v4" />
      <path d="m16.2 7.8 2.9-2.9" />
      <path d="M18 12h4" />
      <path d="m16.2 16.2 2.9 2.9" />
      <path d="M12 18v4" />
      <path d="m4.9 19.1 2.9-2.9" />
      <path d="M2 12h4" />
      <path d="m4.9 4.9 2.9 2.9" />
    </svg>
  )
}
