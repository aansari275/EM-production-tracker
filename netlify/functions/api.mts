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

    // TEDS: List/search all TEDs
    if (path === '/teds' && method === 'GET') {
      const search = url.searchParams.get('search')?.toLowerCase()

      const snapshot = await db.collection('tedForms').get()
      let teds = snapshot.docs.map((doc) => {
        const d = doc.data()
        // Normalize snake_case / camelCase field names
        const emDesignNo = d.emDesignNo || d.empl_design_no || ''
        const buyerCode = d.buyerCode || d.buyer_code || ''
        const buyerName = d.buyerName || d.buyer_name || ''
        const buyerDesignName = d.buyerDesignName || d.buyer_design_name || ''
        const construction = d.construction || ''
        const productQuality = d.productQuality || d.product_quality || ''
        const productType = d.productType || d.product_type || ''
        const size = d.size || ''
        const rawDate = d.ppMeetingDate || d.pp_meeting_date || ''
        const ppMeetingDate = rawDate?._seconds
          ? new Date(rawDate._seconds * 1000).toISOString().split('T')[0]
          : typeof rawDate === 'string' ? rawDate : ''
        const pileMaterial = d.pileMaterial || d.pile_material || ''
        const status = d.status || ''

        // Get first image URL for thumbnail
        const images = d.images || d.imageUrls || {}
        let thumbnailUrl = ''
        for (const key of ['product_photo', 'productPhoto', 'approved_cad', 'approvedCad']) {
          if (images[key] && Array.isArray(images[key]) && images[key].length > 0) {
            thumbnailUrl = images[key][0]
            break
          }
        }

        return {
          id: doc.id,
          emDesignNo,
          buyerCode,
          buyerName,
          buyerDesignName,
          construction,
          productQuality,
          productType,
          size,
          ppMeetingDate,
          pileMaterial,
          status,
          thumbnailUrl,
        }
      })

      // Apply search filter
      if (search) {
        teds = teds.filter((t) => {
          return (
            t.emDesignNo.toLowerCase().includes(search) ||
            t.buyerCode.toLowerCase().includes(search) ||
            t.buyerName.toLowerCase().includes(search) ||
            t.buyerDesignName.toLowerCase().includes(search) ||
            t.construction.toLowerCase().includes(search) ||
            t.productQuality.toLowerCase().includes(search)
          )
        })
      }

      // Sort by ppMeetingDate desc (newest first)
      teds.sort((a, b) => (b.ppMeetingDate || '').localeCompare(a.ppMeetingDate || ''))

      return jsonResponse({ success: true, data: teds })
    }

    // TEDS: Get single TED full details
    if (path.match(/^\/teds\/[^/]+$/) && method === 'GET') {
      const tedId = path.split('/')[2]
      const doc = await db.collection('tedForms').doc(tedId).get()

      if (!doc.exists) {
        return jsonResponse({ success: false, error: 'TED not found' }, 404)
      }

      const d = doc.data()!
      const ted = {
        id: doc.id,
        emDesignNo: d.emDesignNo || d.empl_design_no || '',
        buyerCode: d.buyerCode || d.buyer_code || '',
        buyerName: d.buyerName || d.buyer_name || '',
        buyerDesignName: d.buyerDesignName || d.buyer_design_name || '',
        construction: d.construction || '',
        productQuality: d.productQuality || d.product_quality || '',
        productType: d.productType || d.product_type || '',
        size: d.size || '',
        ppMeetingDate: d.ppMeetingDate || d.pp_meeting_date || '',
        pileMaterial: d.pileMaterial || d.pile_material || '',
        status: d.status || '',
        meetingAttendees: d.meetingAttendees || d.meeting_attendees || [],
        unfinishedGsm: d.unfinishedGsm || d.unfinished_gsm || null,
        finishedGsm: d.finishedGsm || d.finished_gsm || null,
        warpMaterial: d.warpMaterial || d.warp_material || '',
        weftMaterial: d.weftMaterial || d.weft_material || '',
        pileHeightUnfinished: d.pileHeightUnfinished || d.pile_height_unfinished || '',
        pileHeightFinished: d.pileHeightFinished || d.pile_height_finished || '',
        fringesDetails: d.fringesDetails || d.fringes_details || '',
        sizeTolerance: d.sizeTolerance || d.size_tolerance || '',
        processFlow: d.processFlow || d.process_flow || '',
        qualityCallOutsCtq: d.qualityCallOutsCtq || d.quality_call_outs || '',
        buyersSpecificRequirements: d.buyersSpecificRequirements || d.buyers_specific_requirements || '',
        remarks: d.remarks || '',
        reedNoKanghi: d.reedNoKanghi || d.reed_no_kanghi || '',
        warpIn6Inches: d.warpIn6Inches || d.warp_in_6_inches || '',
        weftIn6Inches: d.weftIn6Inches || d.weft_in_6_inches || '',
        shadeCardAvailable: d.shadeCardAvailable || d.shade_card_available || '',
        redSealAvailable: d.redSealAvailable || d.red_seal_available || '',
        khatiDetails: d.khatiDetails || d.khati_details || '',
        imageUrls: d.images || d.imageUrls || {},
        createdAt: d.createdAt?._seconds
          ? new Date(d.createdAt._seconds * 1000).toISOString()
          : d.createdAt || null,
        updatedAt: d.updatedAt?._seconds
          ? new Date(d.updatedAt._seconds * 1000).toISOString()
          : d.updatedAt || null,
      }

      return jsonResponse({ success: true, data: ted })
    }

    // ============================================================
    // TNA ERP Stages — Live production stage data from Neon
    // GET /api/tna-erp-stages
    // Returns per-OPS stage data for WIP, RM Purchase, and Dyeing
    // ============================================================
    if (path === '/tna-erp-stages' && method === 'GET') {
      try {
        const emplUrl = process.env.EMPL_DATABASE_URL
        const ehiUrl = process.env.EHI_DATABASE_URL

        if (!emplUrl && !ehiUrl) {
          return jsonResponse({ error: 'Neon connection strings not configured' }, 500)
        }

        interface ErpStageData {
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
          rmReceivedDate?: string | null
          dyeingIssuedDate?: string | null
          dyeingReceivedDate?: string | null
          firstBazarDate?: string | null
          lastBazarDate?: string | null
          firstDispatchDate?: string | null
          lastDispatchDate?: string | null
        }

        const stages: Record<string, ErpStageData> = {}

        // Query EMPL Neon
        const fetchEmpl = async () => {
          if (!emplUrl) return
          try {
            const sql = neon(emplUrl)

            // WIP counts + carpet dates
            const wipRows = await sql`
              SELECT o.order_number as ops_no,
                SUM(oi.ordered_qty)::int as total_ordered,
                COUNT(c.id)::int as total_carpets,
                COUNT(CASE WHEN c.current_stage = 'weaving' THEN 1 END)::int as on_loom,
                COUNT(CASE WHEN c.current_stage NOT IN ('weaving','dispatched','invoiced')
                      AND c.current_stage IS NOT NULL THEN 1 END)::int as bazar,
                COUNT(CASE WHEN c.current_stage = 'dispatched' THEN 1 END)::int as dispatched,
                MIN(c.bazar_date) as first_bazar_date,
                MAX(c.bazar_date) as last_bazar_date,
                MIN(c.dispatch_date) as first_dispatch_date,
                MAX(c.dispatch_date) as last_dispatch_date
              FROM orders o
              JOIN order_items oi ON oi.order_id = o.id
              LEFT JOIN carpets c ON c.order_item_id = oi.id
              WHERE o.status IN ('active','open','Active','Open','confirmed')
                AND (o.order_number LIKE 'EM-25-%' OR o.order_number LIKE 'EM-26-%')
              GROUP BY o.order_number
            `

            // RM Purchase
            const rmRows = await sql`
              SELECT o.order_number as ops_no,
                BOOL_OR(pi.id IS NOT NULL) as has_indent,
                BOOL_OR(pi.status IN ('received', 'billed')) as indent_received
              FROM orders o
              LEFT JOIN purchase_indent_items pii ON pii.order_id = o.id
              LEFT JOIN purchase_indents pi ON pi.id = pii.indent_id
              WHERE o.status IN ('active','open','Active','Open','confirmed')
                AND (o.order_number LIKE 'EM-25-%' OR o.order_number LIKE 'EM-26-%')
              GROUP BY o.order_number
            `

            // Dyeing + dates from material_ledger
            const dyeRows = await sql`
              SELECT o.order_number as ops_no,
                BOOL_OR(do2.id IS NOT NULL OR ml_di.id IS NOT NULL) as has_dyeing,
                BOOL_OR(doi.received_qty > 0 OR ml_dr.id IS NOT NULL) as dyeing_received,
                MAX(CASE WHEN ml.transaction_type = 'DI' THEN ml.slip_date END) as dyeing_issued_date,
                MAX(CASE WHEN ml.transaction_type = 'DR' THEN ml.slip_date END) as dyeing_received_date,
                MAX(CASE WHEN ml.transaction_type = 'PR' THEN ml.slip_date END) as rm_received_date
              FROM orders o
              LEFT JOIN dyeing_orders do2 ON do2.order_id = o.id
              LEFT JOIN dyeing_order_items doi ON doi.dyeing_order_id = do2.id
              LEFT JOIN material_ledger ml_di ON ml_di.order_id = o.id AND ml_di.transaction_type = 'DI'
              LEFT JOIN material_ledger ml_dr ON ml_dr.order_id = o.id AND ml_dr.transaction_type = 'DR'
              LEFT JOIN material_ledger ml ON ml.order_id = o.id AND ml.transaction_type IN ('DI','DR','PR')
              WHERE o.status IN ('active','open','Active','Open','confirmed')
                AND (o.order_number LIKE 'EM-25-%' OR o.order_number LIKE 'EM-26-%')
              GROUP BY o.order_number
            `

            // Build RM map
            const rmMap: Record<string, { hasIndent: boolean; indentReceived: boolean }> = {}
            for (const row of rmRows) {
              rmMap[row.ops_no] = { hasIndent: row.has_indent || false, indentReceived: row.indent_received || false }
            }

            // Build dyeing map (with dates)
            const dyeMap: Record<string, { hasDyeingOrder: boolean; dyeingReceived: boolean; dyeingIssuedDate?: string; dyeingReceivedDate?: string; rmReceivedDate?: string }> = {}
            for (const row of dyeRows) {
              dyeMap[row.ops_no] = {
                hasDyeingOrder: row.has_dyeing || false,
                dyeingReceived: row.dyeing_received || false,
                dyeingIssuedDate: row.dyeing_issued_date || null,
                dyeingReceivedDate: row.dyeing_received_date || null,
                rmReceivedDate: row.rm_received_date || null,
              }
            }

            // Merge WIP + RM + Dyeing
            for (const row of wipRows) {
              const rm = rmMap[row.ops_no] || { hasIndent: false, indentReceived: false }
              const dye = dyeMap[row.ops_no] || { hasDyeingOrder: false, dyeingReceived: false }
              stages[row.ops_no] = {
                totalOrdered: row.total_ordered || 0,
                totalCarpets: row.total_carpets || 0,
                onLoom: row.on_loom || 0,
                finishing: row.bazar || 0,  // EMPL: all bazar = finishing
                fgGodown: 0,  // Not distinguishable in EMPL
                packed: 0,    // Not distinguishable in EMPL
                dispatched: row.dispatched || 0,
                hasIndent: rm.hasIndent,
                indentReceived: rm.indentReceived,
                hasDyeingOrder: dye.hasDyeingOrder,
                dyeingReceived: dye.dyeingReceived,
                source: 'EMPL',
                rmReceivedDate: dye.rmReceivedDate || null,
                dyeingIssuedDate: dye.dyeingIssuedDate || null,
                dyeingReceivedDate: dye.dyeingReceivedDate || null,
                firstBazarDate: row.first_bazar_date || null,
                lastBazarDate: row.last_bazar_date || null,
                firstDispatchDate: row.first_dispatch_date || null,
                lastDispatchDate: row.last_dispatch_date || null,
              }
            }
          } catch (err) {
            console.error('EMPL TNA ERP stages error:', err)
          }
        }

        // Query EHI Neon
        const fetchEhi = async () => {
          if (!ehiUrl) return
          try {
            const sql = neon(ehiUrl)

            // WIP counts using ehi_carpets.wip_stage
            const wipRows = await sql`
              SELECT o.order_no as ops_no,
                SUM(oi.ordered_qty)::int as total_ordered,
                COUNT(ec.id)::int as total_carpets,
                COUNT(CASE WHEN ec.wip_stage = 'on_loom' THEN 1 END)::int as on_loom,
                COUNT(CASE WHEN ec.wip_stage = 'finishing' THEN 1 END)::int as finishing,
                COUNT(CASE WHEN ec.wip_stage = 'fg_godown' THEN 1 END)::int as fg_godown,
                COUNT(CASE WHEN ec.wip_stage = 'packed' THEN 1 END)::int as packed
              FROM ehi_orders o
              JOIN ehi_order_items oi ON oi.order_id = o.id
              LEFT JOIN ehi_carpets ec ON ec.order_item_id = oi.id
              WHERE o.status = '0' AND o.order_no LIKE 'EM-%' AND o.order_no >= 'EM-25-'
              GROUP BY o.order_no
            `

            // RM Purchase (from purchase_indent_detail) + GRN dates
            const rmRows = await sql`
              SELECT om.customerorderno as ops_no,
                BOOL_OR(pid.pindentdetailid IS NOT NULL) as has_indent,
                BOOL_OR(prd.purchasereceivedetailid IS NOT NULL) as indent_received,
                MAX(prm.receivedate::date)::text as rm_received_date
              FROM order_master om
              LEFT JOIN purchase_indent_detail pid ON pid.orderid = om.orderid
              LEFT JOIN purchase_receive_detail prd ON prd.orderid = om.orderid
              LEFT JOIN purchase_receive_master prm ON prm.purchasereceiveid = prd.purchasereceiveid
              WHERE om.status = '0' AND om.customerorderno LIKE 'EM-%' AND om.customerorderno >= 'EM-25-'
              GROUP BY om.customerorderno
            `

            // Dyeing (from indent_detail with DyingType > 0) + dates
            const dyeRows = await sql`
              SELECT om.customerorderno as ops_no,
                BOOL_OR(id.dyingtype > 0) as has_dyeing,
                BOOL_OR(im.receivedate IS NOT NULL AND id.dyingtype > 0) as dyeing_received,
                MAX(CASE WHEN id.dyingtype > 0 THEN im."date"::date END)::text as dyeing_issued_date,
                MAX(CASE WHEN id.dyingtype > 0 AND im.receivedate IS NOT NULL THEN im.receivedate::date END)::text as dyeing_received_date
              FROM order_master om
              LEFT JOIN indent_detail id ON id.orderid = om.orderid AND id.dyingtype > 0
              LEFT JOIN indent_master im ON im.indentid = id.indentid
              WHERE om.status = '0' AND om.customerorderno LIKE 'EM-%' AND om.customerorderno >= 'EM-25-'
              GROUP BY om.customerorderno
            `

            // Build maps (with dates)
            const rmMap: Record<string, { hasIndent: boolean; indentReceived: boolean; rmReceivedDate?: string }> = {}
            for (const row of rmRows) {
              rmMap[row.ops_no] = { hasIndent: row.has_indent || false, indentReceived: row.indent_received || false, rmReceivedDate: row.rm_received_date || null }
            }
            const dyeMap: Record<string, { hasDyeingOrder: boolean; dyeingReceived: boolean; dyeingIssuedDate?: string; dyeingReceivedDate?: string }> = {}
            for (const row of dyeRows) {
              dyeMap[row.ops_no] = { hasDyeingOrder: row.has_dyeing || false, dyeingReceived: row.dyeing_received || false, dyeingIssuedDate: row.dyeing_issued_date || null, dyeingReceivedDate: row.dyeing_received_date || null }
            }

            // Merge (EHI has no carpet date columns)
            for (const row of wipRows) {
              const rm = rmMap[row.ops_no] || { hasIndent: false, indentReceived: false }
              const dye = dyeMap[row.ops_no] || { hasDyeingOrder: false, dyeingReceived: false }
              if (!stages[row.ops_no]) {
                stages[row.ops_no] = {
                  totalOrdered: row.total_ordered || 0,
                  totalCarpets: row.total_carpets || 0,
                  onLoom: row.on_loom || 0,
                  finishing: row.finishing || 0,
                  fgGodown: row.fg_godown || 0,
                  packed: row.packed || 0,
                  dispatched: 0,
                  hasIndent: rm.hasIndent,
                  indentReceived: rm.indentReceived,
                  hasDyeingOrder: dye.hasDyeingOrder,
                  dyeingReceived: dye.dyeingReceived,
                  source: 'EHI',
                  rmReceivedDate: rm.rmReceivedDate || null,
                  dyeingIssuedDate: dye.dyeingIssuedDate || null,
                  dyeingReceivedDate: dye.dyeingReceivedDate || null,
                }
              }
            }
          } catch (err) {
            console.error('EHI TNA ERP stages error:', err)
          }
        }

        // Run both in parallel
        await Promise.all([fetchEmpl(), fetchEhi()])

        return jsonResponse(stages)
      } catch (error: any) {
        console.error('TNA ERP stages error:', error)
        return jsonResponse(
          { error: error.message || 'Failed to fetch TNA ERP stages' },
          500
        )
      }
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
