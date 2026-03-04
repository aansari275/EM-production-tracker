import { useQuery } from '@tanstack/react-query'
import type { ProductionStatsMap } from '@/types'

export function useProductionStats() {
  return useQuery<ProductionStatsMap>({
    queryKey: ['production-stats'],
    queryFn: async () => {
      const res = await fetch('/api/production-stats')
      if (!res.ok) throw new Error('Failed to fetch production stats')
      return res.json()
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}
