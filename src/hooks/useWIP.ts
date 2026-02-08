import { useQuery } from '@tanstack/react-query'
import type { WIPResponse, WIPRow, WIPSummary, WIPSyncStatus } from '@/types'

interface UseWIPOptions {
  company?: 'EMPL' | 'EHI' | 'all'
  buyer?: string
  search?: string
  enabled?: boolean
}

async function fetchWIP(params: {
  company?: string
  buyer?: string
  search?: string
}): Promise<WIPResponse> {
  const query = new URLSearchParams()
  if (params.company && params.company !== 'all') {
    query.set('company', params.company)
  }
  if (params.buyer) query.set('buyer', params.buyer)
  if (params.search) query.set('search', params.search)

  const queryStr = query.toString()
  const url = `/api/wip${queryStr ? `?${queryStr}` : ''}`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`WIP fetch failed: ${res.status}`)
  }
  const json = await res.json()
  if (!json.success) {
    throw new Error(json.error || 'WIP fetch failed')
  }
  return {
    data: json.data || [],
    syncStatus: json.syncStatus || { empl: 'live', ehi: { status: 'error', lastSyncedAt: null } },
    summary: json.summary || {
      totalOrders: 0, totalPcs: 0, onLoom: 0, inBazar: 0,
      inFinishing: 0, packed: 0, dispatched: 0,
      byCompany: { EMPL: { orders: 0, pcs: 0 }, EHI: { orders: 0, pcs: 0 } },
    },
  }
}

export function useWIP(options: UseWIPOptions = {}) {
  const { company = 'all', buyer, search, enabled = true } = options

  return useQuery<WIPResponse>({
    queryKey: ['wip', company, buyer, search],
    queryFn: () => fetchWIP({ company, buyer, search }),
    staleTime: 5 * 60 * 1000,     // 5 min stale time (data refreshes from ERP)
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 min
    refetchOnWindowFocus: true,
    enabled,
  })
}

// Export types for convenience
export type { WIPRow, WIPSummary, WIPSyncStatus }
