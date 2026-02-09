import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useProductionRows, useDashboardStats, useNewOrders } from '@/hooks/useOrders'
import { formatDistanceToNow, format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ProductionTable } from '@/components/ProductionTable'
import { TnaView } from '@/components/TnaView'
import { ExcelUpload } from '@/components/ExcelUpload'
import { WIPPage } from '@/pages/WIPPage'
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
  FileSpreadsheet,
  Package,
  AlertCircle,
  Activity,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

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
  const [showNewOrders, setShowNewOrders] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Filters
  const [filters, setFilters] = useState<FilterType>({
    company: 'all',
    buyer: '',
    merchant: '',
    overdue: false,
    thisWeek: false,
  })

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        setShowExcelUpload(true)
        // Pass the file to ExcelUpload via a custom event
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('excel-file-dropped', { detail: file }))
        }, 100)
      }
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setShowExcelUpload(true)
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('excel-file-dropped', { detail: file }))
      }, 100)
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const { data: rows = [], isLoading: rowsLoading, isFetching } = useProductionRows(debouncedSearch)
  const { data: stats } = useDashboardStats()
  const { data: newOrdersData, isLoading: newOrdersLoading } = useNewOrders()

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

  // Extract unique buyers for filter dropdowns
  const buyers = useMemo(() => {
    const buyerSet = new Set<string>()
    rows.forEach((row) => {
      if (row.customerCode) buyerSet.add(row.customerCode)
    })
    return Array.from(buyerSet).sort()
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

            {/* Logout */}
            <Button variant="ghost" size="sm" onClick={logout} className="h-8">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 max-w-7xl mx-auto space-y-4">
        {/* CENTRAL UPLOAD ZONE - Hero Section */}
        <div
          ref={dropZoneRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative cursor-pointer transition-all duration-200
            rounded-xl border-2 border-dashed p-6
            ${isDragging
              ? 'border-green-500 bg-green-50 scale-[1.01]'
              : 'border-gray-300 bg-white hover:border-green-400 hover:bg-green-50/50'
            }
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileSelect}
          />

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className={`
              w-16 h-16 rounded-full flex items-center justify-center transition-colors
              ${isDragging ? 'bg-green-500 text-white' : 'bg-green-100 text-green-600'}
            `}>
              <Upload className="h-8 w-8" />
            </div>

            <div className="text-center sm:text-left">
              <h2 className="text-lg font-semibold text-gray-800">
                {isDragging ? 'Drop Excel file here' : 'Upload Running Order Status'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Drag & drop your Excel file here, or click to browse
              </p>
              {newOrdersData?.lastUploadedAt ? (
                <p className="text-xs text-green-600 mt-1 font-medium">
                  Last updated: {formatDistanceToNow(new Date(newOrdersData.lastUploadedAt), { addSuffix: true })}
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">
                  No upload yet
                </p>
              )}
            </div>

            <Button
              variant="default"
              className="bg-green-600 hover:bg-green-700 shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                fileInputRef.current?.click()
              }}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Select File
            </Button>
          </div>

          {/* New Orders Badge - Clickable to show details */}
          {!newOrdersLoading && newOrdersData && newOrdersData.orders.length > 0 && (
            <div
              className="absolute -top-2 -right-2 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                setShowNewOrders(true)
              }}
            >
              <Badge className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 text-sm shadow-lg animate-pulse">
                <AlertCircle className="h-4 w-4 mr-1" />
                {newOrdersData.orders.length} new order{newOrdersData.orders.length > 1 ? 's' : ''} - Click to view
              </Badge>
            </div>
          )}
        </div>

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
              {filteredRows.length} items
            </span>
          </div>
        </div>

        {/* Tabs for different views */}
        <Tabs defaultValue="orders" className="w-full">
          <TabsList className="bg-white border">
            <TabsTrigger value="orders" className="gap-2 data-[state=active]:bg-green-50 data-[state=active]:text-green-700">
              <Table className="h-4 w-4" />
              Order Status
            </TabsTrigger>
            <TabsTrigger value="wip" className="gap-2 data-[state=active]:bg-green-50 data-[state=active]:text-green-700">
              <Activity className="h-4 w-4" />
              Live WIP
            </TabsTrigger>
            <TabsTrigger value="tna" className="gap-2 data-[state=active]:bg-green-50 data-[state=active]:text-green-700">
              <Calendar className="h-4 w-4" />
              TNA Timeline
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="mt-3">
            <div className="bg-white rounded-lg border">
              <ProductionTable rows={filteredRows} isLoading={rowsLoading} />
            </div>
          </TabsContent>

          <TabsContent value="wip" className="mt-3">
            <WIPPage />
          </TabsContent>

          <TabsContent value="tna" className="mt-3">
            <div className="bg-white rounded-lg border p-4">
              <TnaView rows={filteredRows} isLoading={rowsLoading} />
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Excel Upload Dialog */}
      <ExcelUpload open={showExcelUpload} onOpenChange={setShowExcelUpload} />

      {/* New Orders Dialog */}
      <Dialog open={showNewOrders} onOpenChange={setShowNewOrders}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-5 w-5" />
              {newOrdersData?.orders.length || 0} New Orders Found
            </DialogTitle>
            <DialogDescription>
              These orders are in the system but NOT in your Excel sheet. Add them to your tracking sheet.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            <div className="space-y-3">
              {newOrdersData?.orders.map((order) => (
                <div
                  key={order.id}
                  className="bg-amber-50 border border-amber-200 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-lg font-bold text-amber-700 font-mono">
                          {order.opsNo}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {order.companyCode}
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-700">
                        <span className="font-medium">{order.buyerCode}</span>
                        <span className="text-gray-400 mx-2">•</span>
                        <span>{order.buyerName}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-800">{order.totalPcs} pcs</p>
                      <p className="text-sm text-gray-500">{order.totalSqm?.toFixed(1)} sqm</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-amber-200 text-xs text-gray-500">
                    Created: {order.createdAt ? format(new Date(order.createdAt), 'dd MMM yyyy, h:mm a') : 'Unknown'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t bg-gray-50 -mx-6 -mb-6 px-6 py-4 mt-4">
            <p className="text-sm text-gray-600 mb-3">
              <strong>Action needed:</strong> Add these OPS numbers to your Running Order Status Excel and upload again.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowNewOrders(false)}
              >
                Close
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700"
                onClick={() => {
                  setShowNewOrders(false)
                  fileInputRef.current?.click()
                }}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Updated Excel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
