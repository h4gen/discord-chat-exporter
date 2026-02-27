import { MemoryRouter, Route, Routes, Link, useLocation } from "react-router-dom"
import { useStorage } from "@plasmohq/storage/hook"
import { ShieldCheck, ShieldAlert, DownloadCloud, Settings, Database, RefreshCw } from "lucide-react"
import "./style.css"
import { Button } from "~components/ui/button"
import SelectChannelsPage from "~routes/select"
import DownloadPage from "~routes/download"
import { storage, StorageManager } from "~lib/storage-manager"
import DataViewPage, { FULL_CSV_COLUMNS } from "~routes/data"
import { Checkbox } from "~components/ui/checkbox"

function Layout({ children }: { children: React.ReactNode }) {
  const [token] = useStorage<string>({ key: "discord_token", instance: storage as any })
  const location = useLocation()

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-2">
          <DownloadCloud className="w-5 h-5 text-primary" />
          <h1 className="font-semibold tracking-tight text-sm">Discord Downloader</h1>
        </div>
        
        <div className="flex items-center gap-2 text-xs font-medium">
          {token ? (
            <span className="flex items-center gap-1 text-green-500 bg-green-500/10 px-2 py-1 rounded-full">
              <ShieldCheck className="w-3.5 h-3.5" />
              Synced
            </span>
          ) : (
            <span className="flex items-center gap-1 text-destructive bg-destructive/10 px-2 py-1 rounded-full">
              <ShieldAlert className="w-3.5 h-3.5" />
              Not Synced
            </span>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="flex items-center justify-around p-2 border-t bg-card text-muted-foreground">
        <Link to="/" className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${location.pathname === '/' ? 'text-primary bg-primary/10' : 'hover:bg-muted'}`}>
          <RefreshCw className="w-5 h-5" />
          <span className="text-[10px] font-medium">Servers</span>
        </Link>
        <Link to="/download" className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${location.pathname === '/download' ? 'text-primary bg-primary/10' : 'hover:bg-muted'}`}>
          <DownloadCloud className="w-5 h-5" />
          <span className="text-[10px] font-medium">Download</span>
        </Link>
        <Link to="/data" className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${location.pathname === '/data' ? 'text-primary bg-primary/10' : 'hover:bg-muted'}`}>
          <Database className="w-5 h-5" />
          <span className="text-[10px] font-medium">Data</span>
        </Link>
        <Link to="/settings" className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${location.pathname === '/settings' ? 'text-primary bg-primary/10' : 'hover:bg-muted'}`}>
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-medium">Settings</span>
        </Link>
      </nav>
    </div>
  )
}

function LandingPage() {
  const [token] = useStorage<string>({ key: "discord_token", instance: storage as any })

  if (!token) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">Awaiting Session Sync</h2>
        <p className="text-sm text-muted-foreground mb-6">
          To download messages, open Discord in your browser and click on any channel. We'll securely detect your session token.
        </p>
        <Button onClick={() => window.open('https://discord.com/app', '_blank')}>
          Open Discord
        </Button>
      </div>
    )
  }

  return <SelectChannelsPage />
}

function DevSettingsPage() {
  const [token, setToken] = useStorage<string>({ key: "discord_token", instance: storage as any })
  const [exportColumns, setExportColumns] = useStorage<string[]>({ key: "export_columns", instance: storage as any }, FULL_CSV_COLUMNS)

  const toggleColumn = (col: string) => {
    setExportColumns(prev => {
      const curr = prev || FULL_CSV_COLUMNS
      if (curr.includes(col)) return curr.filter(c => c !== col)
      // preserve absolute ordering based on how it's defined in FULL_CSV_COLUMNS
      return FULL_CSV_COLUMNS.filter(c => curr.includes(c) || c === col)
    })
  }

  return (
    <div className="p-4 space-y-6">
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider">CSV Export Columns</h2>
        <div className="grid grid-cols-2 gap-2 bg-muted/20 p-3 rounded-lg border">
          {FULL_CSV_COLUMNS.map(col => {
            const isChecked = (exportColumns || FULL_CSV_COLUMNS).includes(col)
            return (
              <label key={col} className="flex items-center gap-2 text-xs font-medium cursor-pointer hover:text-primary transition-colors">
                <Checkbox 
                  checked={isChecked} 
                  onCheckedChange={() => toggleColumn(col)} 
                  className="w-4 h-4 rounded-[4px]"
                />
                {col}
              </label>
            )
          })}
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider">Debug Options</h2>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Detected Token</label>
          <div className="mt-1 p-2 bg-muted rounded-md text-[10px] break-all font-mono opacity-60 hover:opacity-100 transition-opacity">
            {token || "No token detected"}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="destructive" onClick={() => setToken("")} className="flex-1 text-xs h-8">
            Clear Token
          </Button>
          <Button 
            variant="destructive" 
            className="flex-1 text-xs h-8"
            onClick={async () => {
              if (confirm("Are you sure? This will permanently delete all downloaded messages and metadata.")) {
                await storage.clear()
                alert("All local data has been wiped.")
                window.location.reload()
              }
            }}
          >
            Wipe Local Data
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function SidePanel() {
  return (
    <MemoryRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="/data" element={<DataViewPage />} />
          <Route path="/settings" element={<DevSettingsPage />} />
        </Routes>
      </Layout>
    </MemoryRouter>
  )
}
