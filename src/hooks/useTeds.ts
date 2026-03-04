import { useQuery } from '@tanstack/react-query'
import type { TedFormSummary, TedForm } from '@/types'

export function useTeds(search?: string) {
  return useQuery<TedFormSummary[]>({
    queryKey: ['teds', search],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)

      const response = await fetch(`/api/teds?${params}`)
      if (!response.ok) throw new Error('Failed to fetch TEDs')

      const data = await response.json()
      return data.data || []
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

export function useTed(id: string | null) {
  return useQuery<TedForm>({
    queryKey: ['ted', id],
    queryFn: async () => {
      const response = await fetch(`/api/teds/${id}`)
      if (!response.ok) throw new Error('Failed to fetch TED')

      const data = await response.json()
      return data.data
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  })
}
