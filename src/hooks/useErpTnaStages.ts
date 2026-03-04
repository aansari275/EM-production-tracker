import { useQuery } from '@tanstack/react-query'

export interface ErpStageData {
  totalOrdered: number
  totalCarpets: number
  onLoom: number
  finishing: number
  fgGodown: number
  packed: number
  dispatched: number
  hasIndent: boolean
  indentReceived: boolean
  hasDyeingOrder: boolean
  dyeingReceived: boolean
  source: 'EMPL' | 'EHI'
  // Actual dates from ERP
  rmReceivedDate?: string | null
  dyeingIssuedDate?: string | null
  dyeingReceivedDate?: string | null
  firstBazarDate?: string | null
  lastBazarDate?: string | null
  firstDispatchDate?: string | null
  lastDispatchDate?: string | null
}

export type ErpTnaStagesMap = Record<string, ErpStageData>

export function useErpTnaStages() {
  return useQuery<ErpTnaStagesMap>({
    queryKey: ['tna-erp-stages'],
    queryFn: async () => {
      const response = await fetch('/api/tna-erp-stages')
      if (!response.ok) {
        throw new Error('Failed to fetch TNA ERP stages')
      }
      return response.json()
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}
