import type { Context } from '@netlify/functions'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { neon } from '@neondatabase/serverless'

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

    // PRODUCTION STATS: Live Neon ERP data (Bazar/Bal per OPS)
    // Matches Orders app's /api/production-stats exactly
    if (path === '/production-stats' && method === 'GET') {
      const stats: Record<string, { pcs: number; bazar: number; bal: number }> = {}

      const emplUrl = process.env.EMPL_DATABASE_URL
      const ehiUrl = process.env.EHI_DATABASE_URL

      // Query EMPL Neon (neondb)
      const fetchEmpl = async () => {
        if (!emplUrl) return
        try {
          const sql = neon(emplUrl)

          // Total pcs per OPS
          const pcsRows = await sql`
            SELECT o.order_number as ops_no,
              SUM(oi.ordered_qty)::int as total_pcs
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            WHERE o.status IN ('active','open','Active','Open','confirmed')
              AND (o.order_number LIKE 'EM-25-%' OR o.order_number LIKE 'EM-26-%')
            GROUP BY o.order_number
          `

          // Bazar (WIP) counts per OPS
          const bazarRows = await sql`
            SELECT o.order_number as ops_no,
              COUNT(CASE WHEN c.current_stage NOT IN ('weaving','dispatched','invoiced')
                    AND c.current_stage IS NOT NULL THEN 1 END)::int as bazar_pcs,
              COUNT(CASE WHEN c.current_stage = 'dispatched' THEN 1 END)::int as dispatched_pcs
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN carpets c ON c.order_item_id = oi.id
            WHERE o.status IN ('active','open','Active','Open','confirmed')
              AND (o.order_number LIKE 'EM-25-%' OR o.order_number LIKE 'EM-26-%')
            GROUP BY o.order_number
          `

          for (const row of pcsRows) {
            if (row.ops_no) {
              stats[row.ops_no] = { pcs: Number(row.total_pcs) || 0, bazar: 0, bal: 0 }
            }
          }
          for (const row of bazarRows) {
            if (row.ops_no && stats[row.ops_no]) {
              stats[row.ops_no].bazar = Number(row.bazar_pcs) || 0
              const dispatched = Number(row.dispatched_pcs) || 0
              stats[row.ops_no].bal = stats[row.ops_no].pcs - stats[row.ops_no].bazar - dispatched
              if (stats[row.ops_no].bal < 0) stats[row.ops_no].bal = 0
            }
          }
        } catch (err) {
          console.error('EMPL production stats error:', err)
        }
      }

      // Query EHI Neon (ehi_wip)
      const fetchEhi = async () => {
        if (!ehiUrl) return
        try {
          const sql = neon(ehiUrl)

          // Total pcs per OPS
          const pcsRows = await sql`
            SELECT o.order_no as ops_no,
              SUM(oi.ordered_qty)::int as total_pcs
            FROM ehi_orders o
            JOIN ehi_order_items oi ON oi.order_id = o.id
            WHERE o.status = '0'
              AND o.order_no LIKE 'EM-%'
              AND o.order_no >= 'EM-25-'
            GROUP BY o.order_no
          `

          // Bazar counts per OPS
          const bazarRows = await sql`
            SELECT o.order_no as ops_no,
              COUNT(CASE WHEN cn.currentprostatus IS NOT NULL
                    AND cn.currentprostatus != 1 THEN 1 END)::int as bazar_pcs
            FROM ehi_orders o
            JOIN ehi_order_items oi ON oi.order_id = o.id
            LEFT JOIN carpet_number cn ON cn.orderid = oi.order_id_src
              AND cn.item_finished_id = oi.item_finished_id
            WHERE o.status = '0'
              AND o.order_no LIKE 'EM-%'
              AND o.order_no >= 'EM-25-'
            GROUP BY o.order_no
          `

          for (const row of pcsRows) {
            if (row.ops_no) {
              if (!stats[row.ops_no]) {
                stats[row.ops_no] = { pcs: Number(row.total_pcs) || 0, bazar: 0, bal: 0 }
              } else {
                stats[row.ops_no].pcs += (Number(row.total_pcs) || 0)
              }
            }
          }
          for (const row of bazarRows) {
            if (row.ops_no && stats[row.ops_no]) {
              stats[row.ops_no].bazar += (Number(row.bazar_pcs) || 0)
              stats[row.ops_no].bal = stats[row.ops_no].pcs - stats[row.ops_no].bazar
              if (stats[row.ops_no].bal < 0) stats[row.ops_no].bal = 0
            }
          }
        } catch (err) {
          console.error('EHI production stats error:', err)
        }
      }

      // Run both in parallel
      await Promise.all([fetchEmpl(), fetchEhi()])

      return jsonResponse(stats)
    }

    // INSPECTION SCHEDULES: Read from Firestore
    if (path === '/inspection-schedules' && method === 'GET') {
      const startDate = url.searchParams.get('startDate')
      const endDate = url.searchParams.get('endDate')

      // Fetch all inspection_schedules, filter client-side to avoid composite index requirement
      const snapshot = await db.collection('inspection_schedules').get()
      let schedules = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as any[]

      // Filter by date range if provided
      if (startDate) {
        schedules = schedules.filter(s => s.inspectionDate >= startDate)
      }
      if (endDate) {
        schedules = schedules.filter(s => s.inspectionDate <= endDate)
      }

      // Sort by date
      schedules.sort((a, b) =>
        (a.inspectionDate || '').localeCompare(b.inspectionDate || '')
      )

      return jsonResponse({ schedules })
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

    if (!stageData || stageData.status !== 'completed') {
      return stage
    }
  }

  return 'dispatch'
}
