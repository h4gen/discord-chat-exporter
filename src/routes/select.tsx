import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { getGuilds, getGuildChannels, getPrivateChannels } from "~lib/discord-api"
import type { Guild, Channel } from "~lib/discord-api"
import { Button } from "~components/ui/button"
import { ScrollArea } from "~components/ui/scroll-area"
import { Checkbox } from "~components/ui/checkbox"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "~components/ui/accordion"
import { Badge } from "~components/ui/badge"
import { Hash, Loader2, CheckSquare, Square, RefreshCw, MessagesSquare } from "lucide-react"
import { useStorage } from "@plasmohq/storage/hook"
import { StorageManager, storage } from "~lib/storage-manager"

export default function SelectChannelsPage() {
  const navigate = useNavigate()
  const [guilds, setGuilds] = useState<Guild[]>([])
  const [channelsByGuild, setChannelsByGuild] = useState<Record<string, Channel[]>>({})
  const [selectedChannels, setSelectedChannels] = useStorage<string[]>({ key: "selected_channels", instance: storage as any }, [])
  const [timeDeltaValue, setTimeDeltaValue] = useStorage<number>({ key: "time_delta_value", instance: storage as any }, 7)
  const [timeDeltaUnit, setTimeDeltaUnit] = useStorage<string>({ key: "time_delta_unit", instance: storage as any }, "days")
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [expandedGuild, setExpandedGuild] = useStorage<string>({ key: "expanded_guild", instance: storage as any }, "")
  const [metadata] = useStorage<any>({ key: "discord_metadata", instance: storage as any })

  const loadGuilds = useCallback(async (force = false) => {
    try {
      if (force) setIsRefreshing(true)
      else setIsLoading(true)
      
      const userGuilds = await getGuilds()
      const pseudoGuild: Guild = {
        id: "@me",
        name: "Direct Messages",
        icon: null
      }
      const sortedGuilds = [pseudoGuild, ...[...userGuilds].sort((a, b) => a.name.localeCompare(b.name))]
      setGuilds(sortedGuilds)
      await StorageManager.addGuilds(sortedGuilds)
    } catch (err) {
      console.error("Failed to load guilds", err)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadGuilds()
  }, [loadGuilds])

  const loadChannels = async (guildId: string) => {
    if (channelsByGuild[guildId]) return
    try {
      const channels = guildId === "@me" 
        ? await getPrivateChannels() 
        : await getGuildChannels(guildId)
      const sortedChannels = [...channels].sort((a, b) => (a.position || 0) - (b.position || 0) || (a.name || "").localeCompare(b.name || ""))
      setChannelsByGuild(prev => ({ ...prev, [guildId]: sortedChannels }))
      await StorageManager.addChannels(sortedChannels)
    } catch (err) {
      console.error(`Failed to load channels for ${guildId}`, err)
    }
  }

  const handleGuildExpand = (value: string) => {
    setExpandedGuild(value)
    if (value) {
      loadChannels(value)
    }
  }

  const toggleChannel = (channelId: string) => {
    setSelectedChannels(prev => {
      const current = prev || []
      return current.includes(channelId)
        ? current.filter(id => id !== channelId)
        : [...current, channelId]
    })
  }

  const toggleAllInGuild = (guildId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const currentSelected = selectedChannels || []
    
    // First try loaded channels, fallback to metadata
    let channels = channelsByGuild[guildId]
    if (!channels && metadata && metadata.channels) {
      channels = Object.values(metadata.channels).filter((c: any) => c.guild_id === guildId) as Channel[]
    }

    if (!channels || channels.length === 0) {
      loadChannels(guildId).then(() => {
        setChannelsByGuild(current => {
          const loadedChannels = current[guildId] || []
          const ids = loadedChannels.map(c => c.id)
          setSelectedChannels(prev => {
             const next = [...(prev || [])]
             ids.forEach(id => { if(!next.includes(id)) next.push(id) })
             return next
          })
          return current
        })
      })
      return
    }

    const channelIds = channels.map(c => c.id)
    const allSelected = channelIds.length > 0 && channelIds.every(id => currentSelected.includes(id))

    if (allSelected) {
      setSelectedChannels(currentSelected.filter(id => !channelIds.includes(id)))
    } else {
      const newSelection = [...currentSelected]
      channelIds.forEach(id => {
        if (!newSelection.includes(id)) newSelection.push(id)
      })
      setSelectedChannels(newSelection)
    }
  }

  const startDownload = async () => {
    if (!selectedChannels || selectedChannels.length === 0) return
    await StorageManager.updateDownloadState({
      status: "running",
      progress: 0,
      currentChannelId: null,
      logs: [`Initializing backup for ${selectedChannels.length} channels...`],
      selectedChannels,
      timeDeltaValue,
      timeDeltaUnit
    })
    navigate("/download")
  }

  const getSelectedCountInGuild = (guildId: string) => {
    const currentSelected = selectedChannels || []
    
    // First try loaded state
    if (channelsByGuild[guildId]) {
      return channelsByGuild[guildId].filter(c => currentSelected.includes(c.id)).length
    }

    // Fallback to metadata
    if (metadata && metadata.channels) {
      const guildChannels = Object.values(metadata.channels).filter((c: any) => c.guild_id === guildId)
      return guildChannels.filter((c: any) => currentSelected.includes(c.id)).length
    }

    return 0
  }

  if (isLoading && guilds.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-3 border-b space-y-3 bg-card shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Select Target Channels</h2>
          <div className="flex items-center gap-2">
            {(selectedChannels?.length || 0) > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 text-[11px] font-bold text-destructive hover:bg-destructive/10"
                onClick={() => setSelectedChannels([])}
              >
                Clear Selection
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground"
              onClick={() => loadGuilds(true)}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        
        <div className="flex items-center justify-between bg-muted/50 p-2 rounded-lg">
          <label className="text-xs font-medium text-muted-foreground mr-2">Download History:</label>
          <div className="flex items-center gap-1">
            <input 
              type="number" 
              min="1"
              value={timeDeltaUnit === 'all' ? '' : timeDeltaValue} 
              onChange={(e) => setTimeDeltaValue(parseInt(e.target.value) || 1)}
              disabled={timeDeltaUnit === 'all'}
              className="text-xs border rounded p-1 w-12 bg-background text-foreground focus:ring-1 focus:ring-primary outline-none disabled:opacity-50"
            />
            <select 
              value={timeDeltaUnit} 
              onChange={(e) => setTimeDeltaUnit(e.target.value)}
              className="text-xs border rounded p-1 bg-background text-foreground focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="hours">Hours</option>
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
              <option value="months">Months</option>
              <option value="years">Years</option>
              <option value="all">All Time</option>
            </select>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0 bg-background/50">
        <div className="space-y-3 pt-4 px-3 pb-6">
          <Accordion type="single" collapsible onValueChange={handleGuildExpand} value={expandedGuild}>
            {guilds.map((guild) => {
              const selectedCount = getSelectedCountInGuild(guild.id)
              
              let guildChannelsInMeta = []
              if (metadata && metadata.channels) {
                 guildChannelsInMeta = Object.values(metadata.channels).filter((c: any) => c.guild_id === guild.id)
              }
              const totalCount = channelsByGuild[guild.id]?.length || guildChannelsInMeta.length || 0
              const allSelected = totalCount > 0 && selectedCount === totalCount

              return (
                <AccordionItem key={guild.id} value={guild.id} className="border-none mb-2.5">
                  <div className="group/item flex items-center bg-card border border-muted/60 rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-primary/20 transition-all">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-12 w-11 shrink-0 transition-colors border-r border-muted/20 rounded-none bg-muted/5 ${allSelected ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                      onClick={(e) => toggleAllInGuild(guild.id, e)}
                      title={allSelected ? "Deselect All" : "Select All"}
                    >
                      {allSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                    </Button>
                    
                    <AccordionTrigger className="flex-1 hover:no-underline py-3 px-4 text-sm font-bold transition-all border-none hover:bg-muted/10 [&[data-state=open]]:rounded-b-none">
                      <div className="flex items-center gap-3 text-left min-w-0 flex-1">
                        {guild.icon ? (
                          <img 
                            src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=32`} 
                            className="w-7 h-7 rounded-lg shrink-0 shadow-sm"
                            alt={guild.name}
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-[10px] text-primary shrink-0 border border-primary/20 font-black">
                            {guild.name.substring(0,2).toUpperCase()}
                          </div>
                        )}
                        <span className="truncate flex-1 font-bold text-foreground/90">{guild.name}</span>
                        {selectedCount > 0 && (
                          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-bold bg-primary/10 text-primary border-none">
                            {selectedCount}{totalCount > 0 ? `/${totalCount}` : ""}
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                  </div>
                  
                  <AccordionContent className="bg-muted/10 border-x border-b border-muted/40 rounded-b-xl px-2.5 py-3 -mt-px space-y-2">
                    {channelsByGuild[guild.id] ? (
                      channelsByGuild[guild.id].length > 0 ? (
                        <div className="space-y-1.5">
                          {channelsByGuild[guild.id].map(channel => (
                            <label 
                              key={channel.id} 
                              className="bg-card border border-muted/40 rounded-lg p-3 flex items-center gap-3 hover:border-primary/30 transition-shadow shadow-sm cursor-pointer group"
                            >
                              <div className="relative flex items-center">
                                <Checkbox 
                                  checked={(selectedChannels || []).includes(channel.id)}
                                  onCheckedChange={() => toggleChannel(channel.id)}
                                  className="z-10 w-5 h-5 border-muted-foreground/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                />
                              </div>
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                {channel.type === 15 ? (
                                  <MessagesSquare className="w-4 h-4 text-indigo-500/80 group-hover:text-indigo-500 transition-colors shrink-0" />
                                ) : (
                                  <Hash className="w-4 h-4 text-muted-foreground group-hover:text-primary/70 transition-colors shrink-0" />
                                )}
                                <span className={`text-[12px] font-bold truncate transition-colors ${(selectedChannels || []).includes(channel.id) ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>
                                  {channel.name}
                                </span>
                                {channel.type === 15 && (
                                  <Badge variant="outline" className="text-[9px] px-1.5 h-4 ml-auto bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 font-bold shrink-0 leading-none flex items-center">
                                    FORUM
                                  </Badge>
                                )}
                              </div>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-muted-foreground italic px-4 py-3 bg-card border border-dashed rounded-lg text-center">
                          No readable text channels found.
                        </div>
                      )
                    ) : (
                      <div className="flex items-center justify-center gap-3 py-6 bg-card border border-dashed rounded-lg">
                        <Loader2 className="w-5 h-5 animate-spin text-primary/60" /> 
                        <span className="text-xs font-medium text-muted-foreground animate-pulse">Fetching channels...</span>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-card sticky bottom-0 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] shrink-0">
        <Button 
          className="w-full h-11 text-sm font-semibold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]" 
          disabled={!selectedChannels || selectedChannels.length === 0}
          onClick={startDownload}
        >
          {selectedChannels && selectedChannels.length > 0 
            ? `Start Download (${selectedChannels.length} channel${selectedChannels.length > 1 ? 's' : ''})` 
            : "Select channels to download"}
        </Button>
      </div>
    </div>
  )
}
