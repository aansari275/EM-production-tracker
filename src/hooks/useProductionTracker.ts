import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ProductionTrackerEntry, StageUpdate, TnaStage, ProductionItemTracker } from '@/types'

// Update item-level production tracking (Excel-style row)
export function useUpdateItemTracker() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      orderId: string
      itemId: string
      update: Partial<ProductionItemTracker>
    }) => {
      const response = await fetch(`/api/production-tracker/${params.orderId}/item/${params.itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params.update)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update item')
      }

      return response.json()
    },
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['production-rows'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    }
  })
}

interface UpdateStageParams {
  orderId: string
  opsNo: string
  stage: TnaStage
  update: Partial<StageUpdate>
}

// Update a single TNA stage
export function useUpdateStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ orderId, opsNo, stage, update }: UpdateStageParams) => {
      const response = await fetch(`/api/production-tracker/${orderId}/stage/${stage}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opsNo, ...update })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update stage')
      }

      return response.json()
    },
    onSuccess: (_, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['production-rows'] })
      queryClient.invalidateQueries({ queryKey: ['order', variables.orderId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    }
  })
}

// Update multiple stages at once
export function useBulkUpdateStages() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ orderId, opsNo, stages }: {
      orderId: string
      opsNo: string
      stages: Record<TnaStage, Partial<StageUpdate>>
    }) => {
      const response = await fetch(`/api/production-tracker/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opsNo, stages })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update stages')
      }

      return response.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['production-rows'] })
      queryClient.invalidateQueries({ queryKey: ['order', variables.orderId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    }
  })
}
