import type { Context } from '@netlify/functions'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

// Initialize Firebase Admin
if (!getApps().length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  })
}

const db = getFirestore()

// Helper to format OPS number (OPS-25881 -> EM-26-881)
function formatOpsNo(opsNo: string): string {
  if (!opsNo) return '-'
  const match = opsNo.match(/OPS-(\d+)/)
  if (!match) return opsNo
  const numericPart = match[1]
  const currentYear = new Date().getFullYear().toString().slice(-2)
  let sequence = numericPart
  if (numericPart.length > 4) {
    sequence = numericPart.slice(2)
  }
  return `EM-${currentYear}-${sequence}`
}

// TNA Stages
const TNA_STAGES = [
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
] as const

type TnaStage = typeof TNA_STAGES[number]
type StageStatus = 'pending' | 'in_progress' | 'completed'

interface StageUpdate {
  actualDate: string | null
  status: StageStatus
  notes?: string
  updatedAt: string
  updatedBy?: string
}

interface ProductionTrackerEntry {
  id: string
  opsNo: string
  stages: Record<TnaStage, StageUpdate>
  currentStage: TnaStage
  items?: Record<string, ProductionItemTracker>
  createdAt: string
  updatedAt: string
}

interface ProductionItemTracker {
  id: string
  orderId: string
  opsNo: string
  status: string
  rcvdPcs: number
  toRcvdPcs: number
  oldStock: number
  bazarDone: number
  uFinishing: number
  packed: number
  vendorName?: string
  folioNo?: string
  supplierCompletionDate?: string
  updatedAt: string
  updatedBy?: string
}

interface ProductionRow {
  orderId: string
  companyCode: 'EMPL' | 'EHI'
  customerCode: string
  merchant: string
  poDate: string
  exFactoryDate: string
  opsNo: string
  itemId: string
  article: string
  size: string
  color: string
  quality: string
  orderPcs: number
  status: string
  rcvdPcs: number
  toRcvdPcs: number
  oldStock: number
  bazarDone: number
  uFinishing: number
  packed: number
  vendorName: string
  folioNo: string
  supplierCompletionDate: string
  orderIssueDate: string
  orderType: string
}

// Helper to create JSON response
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

// Route handler
export default async function handler(req: Request, context: Context): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname.replace('/.netlify/functions/api', '').replace('/api', '')
  const method = req.method

  try {
    // AUTH: Verify PIN
    if (path === '/auth/verify' && method === 'POST') {
      const body = await req.json()
      const { pin } = body

      const expectedPin = process.env.PPC_ACCESS_PIN

      if (!expectedPin) {
        return jsonResponse({ success: false, error: 'PIN not configured' }, 500)
      }

      if (pin === expectedPin) {
        return jsonResponse({ success: true })
      }

      return jsonResponse({ success: false, error: 'Invalid PIN' }, 401)
    }

    // ORDERS: List open orders (status = 'sent')
    if (path === '/orders' && method === 'GET') {
      const search = url.searchParams.get('search')?.toLowerCase()

      // Fetch orders with status 'sent' (in production)
      const ordersRef = db.collection('orders').doc('data').collection('orders')
      let query = ordersRef.where('status', '==', 'sent')

      const ordersSnapshot = await query.get()
      let orders = ordersSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))

      // Filter out sample orders
      orders = orders.filter((o: any) => o.orderType !== 'samples')

      // Apply search filter
      if (search) {
        orders = orders.filter((o: any) => {
          const salesNo = (o.salesNo || '').toLowerCase()
          const customerCode = (o.customerCode || '').toLowerCase()
          const buyerName = (o.buyerName || '').toLowerCase()
          return (
            salesNo.includes(search) ||
            customerCode.includes(search) ||
            buyerName.includes(search)
          )
        })
      }

      // Sort by ship date (nearest first)
      orders.sort((a: any, b: any) => {
        const dateA = new Date(a.shipDate || '9999-12-31')
        const dateB = new Date(b.shipDate || '9999-12-31')
        return dateA.getTime() - dateB.getTime()
      })

      // Fetch production tracker data for these orders
      const trackerPromises = orders.map(async (order: any) => {
        const trackerDoc = await db.collection('production_tracker').doc(order.id).get()
        return {
          ...order,
          tracker: trackerDoc.exists ? { id: trackerDoc.id, ...trackerDoc.data() } : undefined,
        }
      })

      const ordersWithTrackers = await Promise.all(trackerPromises)

      return jsonResponse({ success: true, data: ordersWithTrackers })
    }

    // PRODUCTION ROWS: Get item-level production data (Excel format)
    if (path === '/production-rows' && method === 'GET') {
      const search = url.searchParams.get('search')?.toLowerCase()

      // Fetch orders with status 'sent' (in production)
      const ordersRef = db.collection('orders').doc('data').collection('orders')
      const ordersSnapshot = await ordersRef.where('status', '==', 'sent').get()

      let orders = ordersSnapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((o: any) => o.orderType !== 'samples')

      // Fetch merchants for name lookup
      const merchantsSnapshot = await db.collection('merchants').get()
      const merchantsMap = new Map<string, { name: string; code: string }>()
      merchantsSnapshot.docs.forEach((doc) => {
        const data = doc.data()
        merchantsMap.set(data.code, { name: data.name, code: data.code })
      })

      // Fetch production tracker data
      const trackerIds = orders.map((o: any) => o.id)
      const trackerMap = new Map<string, any>()

      // Batch fetch trackers (Firestore doesn't support in queries > 30)
      for (let i = 0; i < trackerIds.length; i += 30) {
        const batch = trackerIds.slice(i, i + 30)
        const trackerDocs = await Promise.all(
          batch.map((id: string) => db.collection('production_tracker').doc(id).get())
        )
        trackerDocs.forEach((doc) => {
          if (doc.exists) {
            trackerMap.set(doc.id, doc.data())
          }
        })
      }

      // Build flattened rows (one per item)
      const rows: ProductionRow[] = []

      orders.forEach((order: any) => {
        const tracker = trackerMap.get(order.id)
        const merchant = merchantsMap.get(order.merchantCode)
        const assistant = order.assistantMerchantCode
          ? merchantsMap.get(order.assistantMerchantCode)
          : null

        const merchantDisplay = assistant
          ? `${merchant?.name || order.merchantCode} / ${assistant.name}`
          : merchant?.name || order.merchantCode

        // Format OPS number (OPS-25881 -> EM-26-881)
        const opsNo = formatOpsNo(order.salesNo)

        const items = order.items || []
        items.forEach((item: any) => {
          const itemTracker = tracker?.items?.[item.id] || {}

          const row: ProductionRow = {
            orderId: order.id,
            companyCode: order.companyCode || 'EMPL',
            customerCode: order.customerCode || '',
            merchant: merchantDisplay,
            poDate: order.orderConfirmationDate || '',
            exFactoryDate: order.shipDate || '',
            opsNo,
            itemId: item.id,
            article: item.emDesignName || item.articleName || '',
            size: item.size || '',
            color: item.color || '',
            quality: item.quality || '',
            orderPcs: item.pcs || 0,
            status: itemTracker.status || '',
            rcvdPcs: itemTracker.rcvdPcs || 0,
            toRcvdPcs: (item.pcs || 0) - (itemTracker.rcvdPcs || 0),
            oldStock: itemTracker.oldStock || 0,
            bazarDone: itemTracker.bazarDone || 0,
            uFinishing: itemTracker.uFinishing || 0,
            packed: itemTracker.packed || 0,
            vendorName: item.contractorName || itemTracker.vendorName || '',
            folioNo: item.folioNo || itemTracker.folioNo || '',
            supplierCompletionDate: itemTracker.supplierCompletionDate || '',
            orderIssueDate: order.orderConfirmationDate || '',
            orderType: order.orderType || '',
          }

          rows.push(row)
        })
      })

      // Apply search filter
      let filteredRows = rows
      if (search) {
        filteredRows = rows.filter((row) => {
          return (
            row.opsNo.toLowerCase().includes(search) ||
            row.customerCode.toLowerCase().includes(search) ||
            row.article.toLowerCase().includes(search) ||
            row.merchant.toLowerCase().includes(search)
          )
        })
      }

      // Sort by Ex-Factory date (nearest first), then by OPS
      filteredRows.sort((a, b) => {
        const dateA = new Date(a.exFactoryDate || '9999-12-31')
        const dateB = new Date(b.exFactoryDate || '9999-12-31')
        if (dateA.getTime() !== dateB.getTime()) {
          return dateA.getTime() - dateB.getTime()
        }
        return a.opsNo.localeCompare(b.opsNo)
      })

      return jsonResponse({ success: true, data: filteredRows })
    }

    // ORDERS: Get single order
    if (path.match(/^\/orders\/[^/]+$/) && method === 'GET') {
      const orderId = path.split('/')[2]

      const orderDoc = await db.collection('orders').doc('data').collection('orders').doc(orderId).get()

      if (!orderDoc.exists) {
        return jsonResponse({ success: false, error: 'Order not found' }, 404)
      }

      const order = { id: orderDoc.id, ...orderDoc.data() }

      // Get tracker data
      const trackerDoc = await db.collection('production_tracker').doc(orderId).get()
      const tracker = trackerDoc.exists ? { id: trackerDoc.id, ...trackerDoc.data() } : undefined

      return jsonResponse({ success: true, data: { ...order, tracker } })
    }

    // DASHBOARD: Get stats (new format for Excel-style view)
    if (path === '/dashboard/stats' && method === 'GET') {
      // Fetch all open orders
      const ordersRef = db.collection('orders').doc('data').collection('orders')
      const ordersSnapshot = await ordersRef.where('status', '==', 'sent').get()

      let orders = ordersSnapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((o: any) => o.orderType !== 'samples')

      // Calculate stats
      const now = new Date()
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - now.getDay() + 1) // Monday
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6) // Sunday

      let totalItems = 0
      let totalPcs = 0
      let overdue = 0
      let thisWeek = 0
      const byCompany = { EMPL: 0, EHI: 0 }

      orders.forEach((order: any) => {
        // Count items and pieces
        const items = order.items || []
        totalItems += items.length
        totalPcs += items.reduce((sum: number, item: any) => sum + (item.pcs || 0), 0)

        // Company breakdown
        if (order.companyCode === 'EMPL') {
          byCompany.EMPL++
        } else if (order.companyCode === 'EHI') {
          byCompany.EHI++
        }

        // Overdue check
        const shipDate = new Date(order.shipDate)
        if (shipDate < now) {
          overdue++
        }

        // This week check
        if (shipDate >= weekStart && shipDate <= weekEnd) {
          thisWeek++
        }
      })

      return jsonResponse({
        success: true,
        data: {
          totalOrders: orders.length,
          totalItems,
          totalPcs,
          byCompany,
          overdue,
          thisWeek,
        },
      })
    }

    // PRODUCTION TRACKER: Update item-level tracking (Excel row)
    if (path.match(/^\/production-tracker\/[^/]+\/item\/[^/]+$/) && method === 'PUT') {
      const parts = path.split('/')
      const orderId = parts[2]
      const itemId = parts[4]

      const body = await req.json()
      const now = new Date().toISOString()

      // Get or create tracker document
      const trackerRef = db.collection('production_tracker').doc(orderId)
      const trackerDoc = await trackerRef.get()

      // Build item update
      const itemUpdate: Partial<ProductionItemTracker> = {
        ...body,
        updatedAt: now,
      }

      // Remove undefined values
      Object.keys(itemUpdate).forEach((key) => {
        if (itemUpdate[key as keyof ProductionItemTracker] === undefined) {
          delete itemUpdate[key as keyof ProductionItemTracker]
        }
      })

      if (trackerDoc.exists) {
        // Update existing
        await trackerRef.update({
          [`items.${itemId}`]: {
            ...trackerDoc.data()?.items?.[itemId],
            ...itemUpdate,
          },
          updatedAt: now,
        })
      } else {
        // Create new tracker with this item
        await trackerRef.set({
          opsNo: '',
          items: {
            [itemId]: {
              id: itemId,
              orderId,
              ...itemUpdate,
            },
          },
          createdAt: now,
          updatedAt: now,
        })
      }

      return jsonResponse({ success: true })
    }

    // PRODUCTION TRACKER: Update single stage
    if (path.match(/^\/production-tracker\/[^/]+\/stage\/[^/]+$/) && method === 'PUT') {
      const parts = path.split('/')
      const orderId = parts[2]
      const stage = parts[4] as TnaStage

      if (!TNA_STAGES.includes(stage)) {
        return jsonResponse({ success: false, error: 'Invalid stage' }, 400)
      }

      const body = await req.json()
      const { opsNo, status, actualDate, notes } = body

      const now = new Date().toISOString()

      // Get or create tracker document
      const trackerRef = db.collection('production_tracker').doc(orderId)
      const trackerDoc = await trackerRef.get()

      const stageUpdate: StageUpdate = {
        status: status || 'pending',
        actualDate: actualDate || null,
        notes: notes || undefined,
        updatedAt: now,
      }

      if (trackerDoc.exists) {
        // Update existing
        await trackerRef.update({
          [`stages.${stage}`]: stageUpdate,
          currentStage: calculateCurrentStage(
            { ...trackerDoc.data()?.stages, [stage]: stageUpdate },
            undefined
          ),
          updatedAt: now,
        })
      } else {
        // Create new tracker
        const initialStages: Record<TnaStage, StageUpdate> = {} as Record<TnaStage, StageUpdate>
        TNA_STAGES.forEach((s) => {
          initialStages[s] = {
            status: 'pending',
            actualDate: null,
            updatedAt: now,
          }
        })
        initialStages[stage] = stageUpdate

        await trackerRef.set({
          opsNo: opsNo || '',
          stages: initialStages,
          currentStage: calculateCurrentStage(initialStages, undefined),
          createdAt: now,
          updatedAt: now,
        })
      }

      return jsonResponse({ success: true })
    }

    // PRODUCTION TRACKER: Bulk update stages
    if (path.match(/^\/production-tracker\/[^/]+$/) && method === 'PUT') {
      const orderId = path.split('/')[2]
      const body = await req.json()
      const { opsNo, stages } = body

      const now = new Date().toISOString()

      const trackerRef = db.collection('production_tracker').doc(orderId)
      const trackerDoc = await trackerRef.get()

      const updates: Record<string, any> = {
        updatedAt: now,
      }

      if (stages) {
        Object.entries(stages).forEach(([stage, update]: [string, any]) => {
          updates[`stages.${stage}`] = {
            ...update,
            updatedAt: now,
          }
        })
      }

      if (trackerDoc.exists) {
        await trackerRef.update(updates)

        // Recalculate current stage
        const updatedDoc = await trackerRef.get()
        const currentStage = calculateCurrentStage(updatedDoc.data()?.stages, undefined)
        await trackerRef.update({ currentStage })
      } else {
        // Create new
        const initialStages: Record<TnaStage, StageUpdate> = {} as Record<TnaStage, StageUpdate>
        TNA_STAGES.forEach((s) => {
          const stageUpdate = stages?.[s]
          initialStages[s] = {
            status: stageUpdate?.status || 'pending',
            actualDate: stageUpdate?.actualDate || null,
            notes: stageUpdate?.notes,
            updatedAt: now,
          }
        })

        await trackerRef.set({
          opsNo: opsNo || '',
          stages: initialStages,
          currentStage: calculateCurrentStage(initialStages, undefined),
          createdAt: now,
          updatedAt: now,
        })
      }

      return jsonResponse({ success: true })
    }

    // Not found
    return jsonResponse({ success: false, error: 'Not found' }, 404)

  } catch (error) {
    console.error('API Error:', error)
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    )
  }
}

// Helper to calculate current stage
function calculateCurrentStage(
  stages: Record<TnaStage, StageUpdate> | undefined,
  tna: any
): TnaStage {
  if (!stages) return 'raw_material_purchase'

  // Find the first non-completed stage
  for (const stage of TNA_STAGES) {
    const stageData = stages[stage]

    // Skip if N/A (from TNA) - would need order TNA data
    // For now, just check completion

    if (!stageData || stageData.status !== 'completed') {
      return stage
    }
  }

  return 'dispatch'
}
