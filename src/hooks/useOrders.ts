import { useQuery } from '@tanstack/react-query'
import type { Order, OrderWithTracker, ProductionTrackerEntry, DashboardStats, TnaStage, ProductionRow } from '@/types'

// Fetch production rows (item-level, Excel-style format)
export function useProductionRows(search?: string) {
  return useQuery<ProductionRow[]>({
    queryKey: ['production-rows', search],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)

      const response = await fetch(`/api/production-rows?${params}`)
      if (!response.ok) throw new Error('Failed to fetch production data')

      const data = await response.json()
      return data.data || []
    },
    staleTime: 30000, // 30 seconds
  })
}

// Fetch open orders (status = 'sent')
export function useOrders(search?: string) {
  return useQuery<OrderWithTracker[]>({
    queryKey: ['orders', search],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)

      const response = await fetch(`/api/orders?${params}`)
      if (!response.ok) throw new Error('Failed to fetch orders')

      const data = await response.json()
      return data.data || []
    },
    staleTime: 30000, // 30 seconds
  })
}

// Fetch single order with tracker
export function useOrder(orderId: string | undefined) {
  return useQuery<OrderWithTracker>({
    queryKey: ['order', orderId],
    queryFn: async () => {
      if (!orderId) throw new Error('No order ID')

      const response = await fetch(`/api/orders/${orderId}`)
      if (!response.ok) throw new Error('Failed to fetch order')

      const data = await response.json()
      return data.data
    },
    enabled: !!orderId,
  })
}

// Fetch dashboard stats
export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const response = await fetch('/api/dashboard/stats')
      if (!response.ok) throw new Error('Failed to fetch stats')

      const data = await response.json()
      return data.data
    },
    staleTime: 60000, // 1 minute
  })
}

// Interface for new orders data
export interface NewOrdersData {
  orders: Array<{
    id: string
    opsNo: string
    buyerCode: string
    buyerName: string
    companyCode: 'EMPL' | 'EHI'
    totalPcs: number
    totalSqm: number
    createdAt: string
  }>
  lastUploadedAt: string | null
  isFirstUpload: boolean
}

// Fetch new orders (created after last Excel upload)
export function useNewOrders() {
  return useQuery<NewOrdersData>({
    queryKey: ['new-orders'],
    queryFn: async () => {
      const response = await fetch('/api/production-status/new-orders')
      if (!response.ok) throw new Error('Failed to fetch new orders')

      const data = await response.json()
      return data.data
    },
    staleTime: 60000, // 1 minute
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  })
}

// Helper to determine current stage from tracker
export function getCurrentStage(tracker: ProductionTrackerEntry | undefined, order: Order): TnaStage {
  if (!tracker?.stages) {
    // No tracker yet, start from first stage
    return 'raw_material_purchase'
  }

  // Find the first non-completed stage
  const stages: TnaStage[] = [
    'raw_material_purchase',
    'dyeing',
    'photo_shoot_approval',
    'first_piece_approval',
    'weaving',
    'finishing',
    'fg_godown',
    'order_label_in_house',
    'inspection',
    'packing',
    'dispatch'
  ]

  for (const stage of stages) {
    const stageData = tracker.stages[stage]
    // Skip optional stages that are N/A in TNA
    const tnaEntry = order.tna?.entries.find(e => e.stage === stage)
    if (tnaEntry?.targetDate === null) continue

    if (!stageData || stageData.status !== 'completed') {
      return stage
    }
  }

  return 'dispatch'
}
