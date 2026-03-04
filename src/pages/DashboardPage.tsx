import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useOrders } from '@/hooks/useOrders'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { OrdersView } from '@/components/OrdersView'
import { TnaView } from '@/components/TnaView'
import {
  Factory,
  LogOut,
  Search,
  RefreshCw,
  Table,
  Calendar,
  Filter,
  X,
  Building2,
  User,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

type FilterType = {
  company: 'all' | 'EMPL' | 'EHI'
  buyer: string
  overdue: boolean
  thisWeek: boolean
}

export function DashboardPage() {
  const { logout, user } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<NodeJS.Timeout>()

  // Filters
  const [filters, setFilters] = useState<FilterType>({
    company: 'all',
    buyer: '',
    overdue: false,
    thisWeek: false,
  })

  const { data: orders = [], isLoading, isFetching } = useOrders(debouncedSearch)

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

  // Extract unique buyers for filter dropdown
  const buyers = useMemo(() => {
    const buyerSet = new Set<string>()
    orders.forEach((order) => {
      if (order.customerCode) buyerSet.add(order.customerCode)
    })
    return Array.from(buyerSet).sort()
  }, [orders])

  // Apply client-side filters
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Company filter
      if (filters.company !== 'all' && order.companyCode !== filters.company) {
        return false
      }

      // Buyer filter
      if (filters.buyer && order.customerCode !== filters.buyer) {
        return false
      }

      // Overdue filter
      if (filters.overdue) {
        const exFactory = new Date(order.shipDate)
        if (exFactory >= new Date()) {
          return false
        }
      }

      // This week filter
      if (filters.thisWeek) {
        const exFactory = new Date(order.shipDate)
        const now = new Date()
        const weekStart = new Date(now)
        weekStart.setDate(now.getDate() - now.getDay() + 1) // Monday
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekStart.getDate() + 6) // Sunday
        if (exFactory < weekStart || exFactory > weekEnd) {
          return false
        }
      }

      return true
    })
  }, [orders, filters])

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['orders'] })
  }

  const clearFilters = () => {
    setFilters({
      company: 'all',
      buyer: '',
      overdue: false,
      thisWeek: false,
    })
  }

  const activeFilterCount =
    (filters.company !== 'all' ? 1 : 0) +
    (filters.buyer ? 1 : 0) +
    (filters.overdue ? 1 : 0) +
    (filters.thisWeek ? 1 : 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Minimal Header */}
      <header className="bg-white border-b sticky top-0 z-20">
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-600 rounded flex items-center justify-center">
              <Factory className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-gray-800">Production Tracker</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Refresh */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isFetching}
              className="h-8"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>

            {/* User info */}
            {user && (
              <div className="flex items-center gap-2 px-2">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || ''}
                    className="w-8 h-8 rounded-full"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-medium">
                    {user.displayName?.charAt(0) || user.email?.charAt(0) || '?'}
                  </div>
                )}
                <span className="text-sm text-gray-700 hidden sm:inline">
                  {user.displayName?.split(' ')[0]}
                </span>
              </div>
            )}

            {/* Logout */}
            <Button variant="ghost" size="sm" onClick={logout} className="h-8">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 max-w-7xl mx-auto space-y-4">
        {/* Search and Filters Bar */}
        <div className="bg-white rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search OPS, Buyer, Article..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-9 bg-gray-50 border-gray-200"
              />
            </div>

            {/* Filters */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 relative">
                  <Filter className="h-4 w-4 mr-1" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-green-600">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Filter By</DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Company
                </DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={filters.company === 'all'}
                  onCheckedChange={() => setFilters((f) => ({ ...f, company: 'all' }))}
                >
                  All
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.company === 'EMPL'}
                  onCheckedChange={() => setFilters((f) => ({ ...f, company: 'EMPL' }))}
                >
                  EMPL Only
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.company === 'EHI'}
                  onCheckedChange={() => setFilters((f) => ({ ...f, company: 'EHI' }))}
                >
                  EHI Only
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />

                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Status
                </DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={filters.overdue}
                  onCheckedChange={(checked) => setFilters((f) => ({ ...f, overdue: checked }))}
                >
                  <AlertTriangle className="h-3 w-3 mr-2 text-red-500" />
                  Overdue Only
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.thisWeek}
                  onCheckedChange={(checked) => setFilters((f) => ({ ...f, thisWeek: checked }))}
                >
                  <Calendar className="h-3 w-3 mr-2 text-green-500" />
                  This Week Only
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />

                {activeFilterCount > 0 && (
                  <div className="p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs"
                      onClick={clearFilters}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Clear All Filters
                    </Button>
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Buyer Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={filters.buyer ? 'default' : 'outline'}
                  size="sm"
                  className={`h-9 text-xs ${filters.buyer ? 'bg-green-600 hover:bg-green-700' : ''}`}
                >
                  <User className="h-3 w-3 mr-1" />
                  {filters.buyer || 'Buyer'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 max-h-64 overflow-y-auto">
                <DropdownMenuCheckboxItem
                  checked={!filters.buyer}
                  onCheckedChange={() => setFilters((f) => ({ ...f, buyer: '' }))}
                >
                  All Buyers
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                {buyers.map((buyer) => (
                  <DropdownMenuCheckboxItem
                    key={buyer}
                    checked={filters.buyer === buyer}
                    onCheckedChange={() => setFilters((f) => ({ ...f, buyer }))}
                  >
                    {buyer}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Active Filter Pills */}
            {activeFilterCount > 0 && (
              <div className="flex items-center gap-1 ml-2">
                {filters.company !== 'all' && (
                  <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => setFilters((f) => ({ ...f, company: 'all' }))}>
                    {filters.company} <X className="h-3 w-3 ml-1" />
                  </Badge>
                )}
                {filters.overdue && (
                  <Badge variant="destructive" className="text-xs cursor-pointer" onClick={() => setFilters((f) => ({ ...f, overdue: false }))}>
                    Overdue <X className="h-3 w-3 ml-1" />
                  </Badge>
                )}
                {filters.thisWeek && (
                  <Badge className="text-xs bg-green-600 cursor-pointer" onClick={() => setFilters((f) => ({ ...f, thisWeek: false }))}>
                    This Week <X className="h-3 w-3 ml-1" />
                  </Badge>
                )}
              </div>
            )}

            {/* Results count */}
            <span className="text-xs text-gray-500 ml-auto">
              {filteredOrders.length} orders
            </span>
          </div>
        </div>

        {/* Tabs for different views */}
        <Tabs defaultValue="orders" className="w-full">
          <TabsList className="bg-white border">
            <TabsTrigger value="orders" className="gap-2 data-[state=active]:bg-green-50 data-[state=active]:text-green-700">
              <Table className="h-4 w-4" />
              Orders
            </TabsTrigger>
            <TabsTrigger value="tna" className="gap-2 data-[state=active]:bg-green-50 data-[state=active]:text-green-700">
              <Calendar className="h-4 w-4" />
              TNA Timeline
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="mt-3">
            <div className="bg-white rounded-lg border">
              <OrdersView orders={filteredOrders} isLoading={isLoading} />
            </div>
          </TabsContent>

          <TabsContent value="tna" className="mt-3">
            <div className="bg-white rounded-lg border p-4">
              <TnaView orders={filteredOrders} isLoading={isLoading} />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
