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
    if (path === '/production-stats' && method === 'GET') {
      const stats: Record<string, { pcs: number; bazar: number; bal: number }> = {}

      // Query EMPL Neon
      const emplUrl = process.env.EMPL_DATABASE_URL
      if (emplUrl) {
        try {
          const sql = neon(emplUrl)
          const rows = await sql`
            SELECT
              o.order_number as ops_no,
              COALESCE(SUM(oi.quantity), 0)::int as pcs,
              COALESCE(SUM(CASE WHEN oi.status IN ('bazar_done', 'finishing', 'fg_godown', 'packed', 'dispatched') THEN oi.quantity ELSE 0 END), 0)::int as bazar,
              COALESCE(SUM(CASE WHEN oi.status NOT IN ('bazar_done', 'finishing', 'fg_godown', 'packed', 'dispatched') THEN oi.quantity ELSE 0 END), 0)::int as bal
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE o.status IN ('active', 'open', 'Active', 'Open')
              AND (o.order_number LIKE 'EM-25-%' OR o.order_number LIKE 'EM-26-%')
            GROUP BY o.order_number
          `
          for (const row of rows) {
            if (row.ops_no) {
              stats[row.ops_no] = {
                pcs: Number(row.pcs) || 0,
                bazar: Number(row.bazar) || 0,
                bal: Number(row.bal) || 0,
              }
            }
          }
        } catch (err) {
          console.error('EMPL production stats error:', err)
        }
      }

      // Query EHI Neon
      const ehiUrl = process.env.EHI_DATABASE_URL
      if (ehiUrl) {
        try {
          const sql = neon(ehiUrl)
          const rows = await sql`
            SELECT
              o.customer_order_no as ops_no,
              COALESCE(SUM(od.qty_required), 0)::int as pcs,
              COALESCE(COUNT(CASE WHEN c.current_pro_status > 1 THEN 1 END), 0)::int as bazar,
              COALESCE(SUM(od.qty_required), 0)::int - COALESCE(COUNT(CASE WHEN c.current_pro_status > 1 THEN 1 END), 0)::int as bal
            FROM order_master o
            JOIN order_detail od ON o.order_id = od.order_id
            LEFT JOIN carpet_number c ON c.item_finished_id = od.item_finished_id AND c.order_id = o.order_id
            WHERE o.status = '0'
            GROUP BY o.customer_order_no
          `
          for (const row of rows) {
            if (row.ops_no) {
              // Format EHI OPS to match display format
              const opsKey = row.ops_no
              stats[opsKey] = {
                pcs: Number(row.pcs) || 0,
                bazar: Number(row.bazar) || 0,
                bal: Math.max(0, Number(row.bal) || 0),
              }
            }
          }
        } catch (err) {
          console.error('EHI production stats error:', err)
        }
      }

      return jsonResponse(stats)
    }

    // INSPECTION SCHEDULES: Read from Firestore
    if (path === '/inspection-schedules' && method === 'GET') {
      const startDate = url.searchParams.get('startDate')
      const endDate = url.searchParams.get('endDate')

      let query: FirebaseFirestore.Query = db.collection('inspection_schedules')

      if (startDate) {
        query = query.where('inspectionDate', '>=', startDate)
      }
      if (endDate) {
        query = query.where('inspectionDate', '<=', endDate)
      }

      const snapshot = await query.get()
      const schedules = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }))

      // Sort by date
      schedules.sort((a: any, b: any) =>
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
