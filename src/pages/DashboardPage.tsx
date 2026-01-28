import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useOrders, useDashboardStats } from '@/hooks/useOrders'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatsCards } from '@/components/StatsCards'
import { OrdersTable } from '@/components/OrdersTable'
import { Factory, LogOut, Search, RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

export function DashboardPage() {
  const { logout } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const { data: orders = [], isLoading: ordersLoading, isFetching } = useOrders(debouncedSearch)
  const { data: stats } = useDashboardStats()

  // Debounced search
  const handleSearchChange = (value: string) => {
    setSearch(value)
    // Simple debounce
    const timer = setTimeout(() => {
      setDebouncedSearch(value)
    }, 300)
    return () => clearTimeout(timer)
  }

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['orders'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Factory className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Production Tracker</h1>
              <p className="text-xs text-muted-foreground">Eastern Mills PPC</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search OPS # or Buyer..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Refresh */}
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>

            {/* Logout */}
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Stats Cards */}
        <StatsCards stats={stats} isLoading={!stats} />

        {/* Orders Table */}
        <div className="bg-card rounded-lg border shadow-sm">
          <div className="p-4 border-b">
            <h2 className="text-lg font-medium">Open Orders</h2>
            <p className="text-sm text-muted-foreground">
              Track production progress for all orders in production
            </p>
          </div>
          <OrdersTable
            orders={orders}
            isLoading={ordersLoading}
          />
        </div>
      </main>
    </div>
  )
}
