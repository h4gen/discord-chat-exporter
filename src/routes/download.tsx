import { useRef, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "~components/ui/button"
import { Progress } from "~components/ui/progress"
import { ScrollArea } from "~components/ui/scroll-area"
import { Loader2, AlertCircle, CheckCircle2, ChevronLeft, Pause, Play, Database, History } from "lucide-react"
import { useStorage } from "@plasmohq/storage/hook"
import { StorageManager, storage } from "~lib/storage-manager"
import type { DownloadState } from "~lib/storage-manager"

export default function DownloadPage() {
  const navigate = useNavigate()
  const [state, setState] = useStorage<DownloadState>({ key: "download_state", instance: storage as any })
  const scrollRef = useRef<HTMLDivElement>(null)
  const [currentChannel, setCurrentChannel] = useState<any>(null)
  const [currentGuild, setCurrentGuild] = useState<any>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    const loadMetadata = async () => {
      if (state?.currentChannelId) {
        const meta = await StorageManager.getMetadata()
        const channel = meta.channels[state.currentChannelId]
        if (channel) {
          setCurrentChannel(channel)
          const guild = meta.guilds[channel.guild_id || "unknown"]
          setCurrentGuild(guild)
        }
      } else {
        setCurrentChannel(null)
        setCurrentGuild(null)
      }
    }
    loadMetadata()
  }, [state?.currentChannelId])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollIntoView({ block: 'end' })
    }
  }, [state?.logs, autoScroll])

  if (!state || state.status === "idle") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <History className="w-12 h-12 mb-4 opacity-20" />
        <h3 className="font-semibold text-foreground">No Active Download</h3>
        <p className="text-xs mt-1">Select channels and start a session to see progress here.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/")}>
          Select Channels
        </Button>
      </div>
    )
  }

  const togglePause = async () => {
    const newStatus = state.status === "paused" ? "running" : "paused"
    await StorageManager.updateDownloadState({ status: newStatus })
    await StorageManager.addDownloadLog(newStatus === "paused" ? "Download paused by user." : "Download resumed by user.")
  }

  const { status, progress, logs } = state

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground animate-in fade-in duration-300">
      <div className="p-4 flex-1 flex flex-col min-h-0 space-y-4">
        <div className="text-center shrink-0">
          {status === "finished" ? (
            <div className="relative inline-block">
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-background animate-pulse" />
            </div>
          ) : status === "error" ? (
            <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-2" />
          ) : status === "paused" ? (
            <Pause className="w-10 h-10 text-yellow-500 mx-auto mb-2 animate-pulse" />
          ) : (
            <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-2" />
          )}
          <h2 className="text-base font-bold tracking-tight">
            {status === "finished" ? "Backup Complete" : status === "error" ? "Backup Failed" : status === "paused" ? "Backup Paused" : "Backup in Progress"}
          </h2>
          {status === "running" && state.currentChannelId && (
            <div className="mt-3 flex flex-col items-center gap-1 bg-muted/20 py-2 px-4 rounded-xl border border-muted/40 shadow-inner max-w-[240px] mx-auto">
               <div className="flex items-center gap-1.5 text-[10px] font-bold text-foreground/70 leading-none">
                 <span className="text-primary/70 shrink-0">SERVER:</span> 
                 <span className="truncate max-w-[120px]">{currentGuild?.name || "Loading..."}</span>
                 <span className="text-muted-foreground/40 font-mono text-[9px] shrink-0">[{currentGuild?.id || "..."}]</span>
               </div>
               <div className="flex items-center gap-1.5 text-[10px] font-bold text-foreground/80 leading-none">
                 <span className="text-primary/70 shrink-0">CHANNEL:</span> 
                 <span className="truncate max-w-[110px]">#{currentChannel?.name || "..."}</span>
                 <span className="text-muted-foreground/40 font-mono text-[9px] shrink-0">[{state.currentChannelId}]</span>
               </div>
            </div>
          )}
        </div>

        <div className="space-y-1.5 shrink-0 px-1">
          <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            <span>Session Progress</span>
            <span className="text-primary">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2 bg-muted border-none overflow-hidden shadow-inner" />
        </div>

        <div className="flex-1 min-h-0 border rounded-xl bg-card/30 overflow-hidden flex flex-col shadow-inner">
          <div className="px-3 py-2 border-b bg-muted/20 flex justify-between items-center shrink-0">
            <h3 className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Background Logs</h3>
            <div className="flex gap-2 items-center">
              <label className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground cursor-pointer hover:text-foreground">
                <input 
                  type="checkbox" 
                  checked={autoScroll} 
                  onChange={(e) => setAutoScroll(e.target.checked)} 
                  className="w-3 h-3 accent-primary" 
                />
                AUTO-SCROLL
              </label>
              <div className={`w-2 h-2 rounded-full ${status === "paused" ? 'bg-yellow-500' : status === "error" ? 'bg-destructive' : 'bg-green-500'} animate-pulse`} />
            </div>
          </div>
          <ScrollArea className="flex-1 p-3">
            <div className="space-y-1 font-mono text-[9px] leading-relaxed">
              {logs.map((log, i) => {
                const parts = log.split(': ')
                const time = parts[0]
                const msg = parts.slice(1).join(': ')
                return (
                  <div key={i} className="text-muted-foreground/80 border-l-2 border-muted pl-2 py-0.5 hover:bg-muted/5 transition-colors">
                    <span className="text-primary/40 font-bold">{time}</span>
                    <span className="ml-2 text-foreground/70">{msg}</span>
                  </div>
                )
              })}
              <div ref={scrollRef} className="h-2" />
            </div>
          </ScrollArea>
        </div>
      </div>

      <div className="p-4 border-t bg-card sticky bottom-0 shrink-0 flex flex-col gap-2 shadow-lg">
        {status !== "finished" && status !== "error" && (
          <Button 
            onClick={togglePause} 
            variant={status === "paused" ? "default" : "secondary"}
            className="w-full h-10 text-xs font-bold transition-all flex items-center justify-center gap-2"
          >
            {status === "paused" ? <><Play className="w-3.5 h-3.5 fill-current" /> Resume Backup</> : <><Pause className="w-3.5 h-3.5 fill-current" /> Pause Progress</>}
          </Button>
        )}
        
        {status === "error" && (
          <Button 
            onClick={async () => {
              await StorageManager.updateDownloadState({ status: "running" })
              await StorageManager.addDownloadLog("Retrying suspended download...")
            }}
            className="w-full h-10 text-xs font-bold shadow-lg shadow-destructive/20 bg-destructive hover:bg-destructive/90 text-destructive-foreground transition-all flex items-center justify-center gap-2"
          >
            <Play className="w-3.5 h-3.5 fill-current" /> Retry Failed Download
          </Button>
        )}
        
        {status === "finished" && (
          <Button 
            onClick={() => navigate("/data")} 
            className="w-full h-10 text-xs font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] flex items-center justify-center gap-2"
          >
            <Database className="w-3.5 h-3.5" /> View Results in Data Tab
          </Button>
        )}

        {(status === "finished" || status === "error") && (
          <Button onClick={() => navigate("/")} variant="outline" className="w-full h-10 font-bold text-[10px] flex items-center justify-center gap-2">
            <ChevronLeft className="w-3.5 h-3.5" /> Start New Session
          </Button>
        )}
      </div>
    </div>
  )
}
