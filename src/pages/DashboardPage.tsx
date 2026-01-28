import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useProductionRows, useDashboardStats } from '@/hooks/useOrders'
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
import { StatsCards } from '@/components/StatsCards'
import { ProductionTable } from '@/components/ProductionTable'
import { TnaView } from '@/components/TnaView'
import { ExcelUpload } from '@/components/ExcelUpload'
import { OrderSummaryTab } from '@/components/OrderSummaryTab'
import {
  Factory,
  LogOut,
  Search,
  RefreshCw,
  Table,
  Calendar,
  Filter,
  X,
  Upload,
  Building2,
  User,
  AlertTriangle,
  Clock,
  ListOrdered,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import type { ProductionRow } from '@/types'

type FilterType = {
  company: 'all' | 'EMPL' | 'EHI'
  buyer: string
  merchant: string
  overdue: boolean
  thisWeek: boolean
}

export function DashboardPage() {
  const { logout } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<NodeJS.Timeout>()
  const [showExcelUpload, setShowExcelUpload] = useState(false)

  // Filters
  const [filters, setFilters] = useState<FilterType>({
    company: 'all',
    buyer: '',
    merchant: '',
    overdue: false,
    thisWeek: false,
  })

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

  // Extract unique buyers and merchants for filter dropdowns
  const { buyers, merchants } = useMemo(() => {
    const buyerSet = new Set<string>()
    const merchantSet = new Set<string>()
    rows.forEach((row) => {
      if (row.customerCode) buyerSet.add(row.customerCode)
      if (row.merchant) merchantSet.add(row.merchant)
    })
    return {
      buyers: Array.from(buyerSet).sort(),
      merchants: Array.from(merchantSet).sort(),
    }
  }, [rows])

  // Apply client-side filters
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // Company filter
      if (filters.company !== 'all' && row.companyCode !== filters.company) {
        return false
      }

      // Buyer filter
      if (filters.buyer && row.customerCode !== filters.buyer) {
        return false
      }

      // Merchant filter
      if (filters.merchant && !row.merchant.includes(filters.merchant)) {
        return false
      }

      // Overdue filter
      if (filters.overdue) {
        const exFactory = new Date(row.exFactoryDate)
        if (exFactory >= new Date()) {
          return false
        }
      }

      // This week filter
      if (filters.thisWeek) {
        const exFactory = new Date(row.exFactoryDate)
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
  }, [rows, filters])

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['production-rows'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
  }

  const clearFilters = () => {
    setFilters({
      company: 'all',
      buyer: '',
      merchant: '',
      overdue: false,
      thisWeek: false,
    })
  }

  const activeFilterCount =
    (filters.company !== 'all' ? 1 : 0) +
    (filters.buyer ? 1 : 0) +
    (filters.merchant ? 1 : 0) +
    (filters.overdue ? 1 : 0) +
    (filters.thisWeek ? 1 : 0)

  // Get today's date formatted
  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Excel style */}
      <header className="border-b bg-card sticky top-0 z-20">
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

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search OPS, Buyer, Article..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-9"
              />
            </div>

            {/* Filters Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="relative">
                  <Filter className="h-4 w-4 mr-1" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-primary text-primary-foreground"
                    >
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Filter By</DropdownMenuLabel>
                <DropdownMenuSeparator />

                {/* Company Filter */}
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

                {/* Status Filters */}
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

                {/* Clear Filters */}
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

            {/* Buyer Filter Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={filters.buyer ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs"
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

            {/* Upload Excel */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExcelUpload(true)}
            >
              <Upload className="h-4 w-4 mr-1" />
              Upload
            </Button>

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

        {/* Active Filters Bar */}
        {activeFilterCount > 0 && (
          <div className="px-4 pb-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Active filters:</span>
            {filters.company !== 'all' && (
              <Badge variant="secondary" className="text-xs">
                {filters.company}
                <X
                  className="h-3 w-3 ml-1 cursor-pointer"
                  onClick={() => setFilters((f) => ({ ...f, company: 'all' }))}
                />
              </Badge>
            )}
            {filters.buyer && (
              <Badge variant="secondary" className="text-xs">
                Buyer: {filters.buyer}
                <X
                  className="h-3 w-3 ml-1 cursor-pointer"
                  onClick={() => setFilters((f) => ({ ...f, buyer: '' }))}
                />
              </Badge>
            )}
            {filters.merchant && (
              <Badge variant="secondary" className="text-xs">
                Merchant: {filters.merchant}
                <X
                  className="h-3 w-3 ml-1 cursor-pointer"
                  onClick={() => setFilters((f) => ({ ...f, merchant: '' }))}
                />
              </Badge>
            )}
            {filters.overdue && (
              <Badge variant="destructive" className="text-xs">
                Overdue
                <X
                  className="h-3 w-3 ml-1 cursor-pointer"
                  onClick={() => setFilters((f) => ({ ...f, overdue: false }))}
                />
              </Badge>
            )}
            {filters.thisWeek && (
              <Badge variant="default" className="text-xs bg-green-600">
                This Week
                <X
                  className="h-3 w-3 ml-1 cursor-pointer"
                  onClick={() => setFilters((f) => ({ ...f, thisWeek: false }))}
                />
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-2">
              Showing {filteredRows.length} of {rows.length} items
            </span>
          </div>
        )}
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
              {filteredRows.length !== rows.length && (
                <Badge variant="secondary" className="text-[10px] ml-1">
                  {filteredRows.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="order-summary" className="gap-2">
              <ListOrdered className="h-4 w-4" />
              Order Summary
            </TabsTrigger>
            <TabsTrigger value="tna" className="gap-2">
              <Calendar className="h-4 w-4" />
              TNA Timeline
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders">
            <div className="bg-card rounded-lg border shadow-sm">
              <ProductionTable rows={filteredRows} isLoading={rowsLoading} />
            </div>
          </TabsContent>

          <TabsContent value="order-summary">
            <OrderSummaryTab />
          </TabsContent>

          <TabsContent value="tna">
            <div className="bg-card rounded-lg border shadow-sm p-4">
              <TnaView rows={filteredRows} isLoading={rowsLoading} />
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Excel Upload Dialog */}
      <ExcelUpload open={showExcelUpload} onOpenChange={setShowExcelUpload} />
    </div>
  )
}
