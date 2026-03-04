import { useState, useEffect } from 'react'
import { db } from '@/lib/firebase'
import { doc, onSnapshot } from 'firebase/firestore'

/**
 * Production status data for a single order item
 */
export interface ProductionItemStatus {
  status: string
  bazarDone: number
  toRcvdPcs: number
  oldStock: number
  uFinishing: number
  updatedAt: string
}

/**
 * Production tracker entry from the production_tracker collection
 */
export interface ProductionTrackerData {
  id: string
  opsNo: string
  items: Record<string, ProductionItemStatus>
  stages?: Record<string, {
    status: 'pending' | 'in_progress' | 'completed'
    actualDate: string | null
    notes?: string
    updatedAt: string
    updatedBy?: string
  }>
  createdAt: string
  updatedAt: string
}

/**
 * Real-time Firebase listener for production tracker data.
 * When an OPS card is expanded in TNA view, this fires to get live stage data.
 */
export function useProductionStatus(orderId: string | undefined) {
  const [data, setData] = useState<ProductionTrackerData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!orderId) {
      setData(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    const docRef = doc(db, 'production_tracker', orderId)

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setData({
            id: snapshot.id,
            ...snapshot.data(),
          } as ProductionTrackerData)
        } else {
          setData(null)
        }
        setIsLoading(false)
      },
      (err) => {
        console.error('Error listening to production status:', err)
        setError(err as Error)
        setIsLoading(false)
      }
    )

    return () => unsubscribe()
  }, [orderId])

  return { data, isLoading, error }
}

/**
 * Get production status for a specific item
 */
export function getItemProductionStatus(
  productionData: ProductionTrackerData | null,
  itemId: string
): ProductionItemStatus | null {
  if (!productionData?.items) return null
  return productionData.items[itemId] || null
}
