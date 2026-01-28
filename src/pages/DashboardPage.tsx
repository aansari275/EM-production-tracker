import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useProductionRows, useDashboardStats } from '@/hooks/useOrders'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatsCards } from '@/components/StatsCards'
import { ProductionTable } from '@/components/ProductionTable'
import { TnaView } from '@/components/TnaView'
import { Factory, LogOut, Search, RefreshCw, Table, Calendar } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

export function DashboardPage() {
  const { logout } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<NodeJS.Timeout>()

  const { data: rows = [], isLoading: rowsLoading, isFetching } = useProductionRows(debouncedSearch)
  const { data: stats } = useDashboardStats()

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [search])

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['production-rows'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
  }

  // Get today's date formatted
  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Excel style */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-600 rounded flex items-center justify-center">
              <Factory className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Running Order Status</h1>
              <p className="text-xs text-muted-foreground">Date: {today}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search OPS, Buyer, Article..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-9"
              />
            </div>

            {/* Refresh */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>

            {/* Logout */}
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4 mr-1" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 space-y-4">
        {/* Stats Cards - Compact */}
        <StatsCards stats={stats} isLoading={!stats} />

        {/* Tabs for different views */}
        <Tabs defaultValue="orders" className="w-full">
          <TabsList>
            <TabsTrigger value="orders" className="gap-2">
              <Table className="h-4 w-4" />
              Order Status
            </TabsTrigger>
            <TabsTrigger value="tna" className="gap-2">
              <Calendar className="h-4 w-4" />
              TNA Timeline
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders">
            <div className="bg-card rounded-lg border shadow-sm">
              <ProductionTable
                rows={rows}
                isLoading={rowsLoading}
              />
            </div>
          </TabsContent>

          <TabsContent value="tna">
            <div className="bg-card rounded-lg border shadow-sm p-4">
              <TnaView rows={rows} isLoading={rowsLoading} />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
