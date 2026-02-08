import type { Context } from '@netlify/functions'
import { neon } from '@neondatabase/serverless'

// ============================================================================
// WIP API — Live production data from EMPL + EHI Neon PostgreSQL databases
// ============================================================================

interface WIPRow {
  company: 'EMPL' | 'EHI'
  opsNo: string
  buyerCode: string
  buyerName: string
  folioNo: string
  contractor: string
  design: string
  size: string
  color: string
  quality: string
  totalPcs: number
  onLoom: number
  bazarPcs: number
  finishingPcs: number
  fgGodownPcs: number
  packedPcs: number
  dispatchedPcs: number
  orderId?: number
  orderItemId?: number
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ============================================================================
// EMPL WIP Query — Direct from Neon PostgreSQL
// ============================================================================

async function queryEmplWIP(filters: {
  buyer?: string
  search?: string
}): Promise<WIPRow[]> {
  const dbUrl = process.env.EMPL_DATABASE_URL
  if (!dbUrl) {
    console.warn('EMPL_DATABASE_URL not set, skipping EMPL WIP')
    return []
  }

  const sql = neon(dbUrl)

  // Build WHERE clause parts
  const conditions: string[] = [
    "o.status IN ('active', 'open', 'Active', 'Open')",
    // Filter to EM-25+ orders only (ops_number format: OPS-25xxx where 25=year)
    "o.ops_number >= 'OPS-25000'"
  ]

  if (filters.buyer) {
    conditions.push(`b.code = '${filters.buyer.replace(/'/g, "''")}'`)
  }

  if (filters.search) {
    const s = filters.search.replace(/'/g, "''").toLowerCase()
    conditions.push(`(
      LOWER(o.order_number) LIKE '%${s}%' OR
      LOWER(o.ops_number) LIKE '%${s}%' OR
      LOWER(b.code) LIKE '%${s}%' OR
      LOWER(b.name) LIKE '%${s}%' OR
      LOWER(d.name) LIKE '%${s}%'
    )`)
  }

  const whereClause = conditions.join(' AND ')

  try {
    const rows = await sql`
      SELECT
        'EMPL' as company,
        COALESCE(o.ops_number, o.order_number) as ops_no,
        COALESCE(b.code, '') as buyer_code,
        COALESCE(b.name, '') as buyer_name,
        COALESCE(f.folio_number, '') as folio_no,
        COALESCE(ct.name, '') as contractor,
        COALESCE(d.name, '') as design,
        COALESCE(s.label, '') as size,
        COALESCE(col.name, '') as color,
        COALESCE(q.name, '') as quality,
        COALESCE(oi.ordered_qty, 0) as total_pcs,
        o.id as order_id,
        oi.id as order_item_id,
        -- Count carpets by stage for this order item
        COUNT(CASE WHEN c.current_stage = 'weaving' THEN 1 END)::int as on_loom,
        COUNT(CASE WHEN c.current_stage = 'bazar' THEN 1 END)::int as bazar_pcs,
        COUNT(CASE WHEN c.current_stage IN ('finishing', 'finishing_issued') THEN 1 END)::int as finishing_pcs,
        COUNT(CASE WHEN c.current_stage IN ('fg_godown', 'stock', 'inspection') THEN 1 END)::int as fg_godown_pcs,
        COUNT(CASE WHEN c.packing_transferred = true AND c.current_stage NOT IN ('dispatched', 'invoiced') THEN 1 END)::int as packed_pcs,
        COUNT(CASE WHEN c.current_stage IN ('dispatched', 'invoiced') THEN 1 END)::int as dispatched_pcs
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN buyers b ON b.id = o.buyer_id
      LEFT JOIN qualities q ON q.id = oi.quality_id
      LEFT JOIN designs d ON d.id = oi.design_id
      LEFT JOIN colours col ON col.id = oi.colour_id
      LEFT JOIN sizes s ON s.id = oi.size_id
      LEFT JOIN carpets c ON c.order_item_id = oi.id
      LEFT JOIN folios f ON f.id = c.folio_id
      LEFT JOIN contractors ct ON ct.id = f.contractor_id
      WHERE ${sql.unsafe(whereClause)}
      GROUP BY
        o.id, o.ops_number, o.order_number,
        b.code, b.name,
        f.folio_number, ct.name,
        d.name, s.label, col.name, q.name,
        oi.ordered_qty, oi.id
      ORDER BY o.ops_number, oi.id
    `

    return rows.map((row: any) => ({
      company: 'EMPL' as const,
      opsNo: row.ops_no || '',
      buyerCode: row.buyer_code || '',
      buyerName: row.buyer_name || '',
      folioNo: row.folio_no || '',
      contractor: row.contractor || '',
      design: row.design || '',
      size: row.size || '',
      color: row.color || '',
      quality: row.quality || '',
      totalPcs: Number(row.total_pcs) || 0,
      onLoom: Number(row.on_loom) || 0,
      bazarPcs: Number(row.bazar_pcs) || 0,
      finishingPcs: Number(row.finishing_pcs) || 0,
      fgGodownPcs: Number(row.fg_godown_pcs) || 0,
      packedPcs: Number(row.packed_pcs) || 0,
      dispatchedPcs: Number(row.dispatched_pcs) || 0,
      orderId: Number(row.order_id) || undefined,
      orderItemId: Number(row.order_item_id) || undefined,
    }))
  } catch (err) {
    console.error('EMPL WIP query error:', err)
    return []
  }
}

// ============================================================================
// EHI WIP Query — From synced Neon PostgreSQL
// ============================================================================

async function queryEhiWIP(filters: {
  buyer?: string
  search?: string
}): Promise<WIPRow[]> {
  const dbUrl = process.env.EHI_DATABASE_URL
  if (!dbUrl) {
    console.warn('EHI_DATABASE_URL not set, skipping EHI WIP')
    return []
  }

  const sql = neon(dbUrl)

  // EHI status '0' = Open orders, only EM-style OPS numbers (skip legacy IKEA orders)
  const conditions: string[] = [
    "o.status = '0'",
    "o.order_no LIKE 'EM-%'",
    // Filter to EM-25+ orders only (skip old EM-17, EM-18, etc.)
    "o.order_no >= 'EM-25-'"
  ]

  if (filters.buyer) {
    conditions.push(`o.buyer_code = '${filters.buyer.replace(/'/g, "''")}'`)
  }

  if (filters.search) {
    const s = filters.search.replace(/'/g, "''").toLowerCase()
    conditions.push(`(
      LOWER(o.order_no) LIKE '%${s}%' OR
      LOWER(o.buyer_code) LIKE '%${s}%' OR
      LOWER(o.local_order) LIKE '%${s}%' OR
      LOWER(oi.design_name) LIKE '%${s}%'
    )`)
  }

  const whereClause = conditions.join(' AND ')

  try {
    const rows = await sql`
      SELECT
        'EHI' as company,
        o.order_no as ops_no,
        COALESCE(o.buyer_code, '') as buyer_code,
        '' as buyer_name,
        '' as folio_no,
        '' as contractor,
        COALESCE(oi.design_name, '') as design,
        COALESCE(oi.size, '') as size,
        COALESCE(oi.color, '') as color,
        COALESCE(oi.quality, '') as quality,
        COALESCE(oi.ordered_qty, 0) as total_pcs,
        o.id as order_id,
        oi.id as order_item_id,
        -- Count by wip_stage (pre-computed during sync)
        -- Bazar = rugs that have passed through bazar (off-loom). In EHI, bazar is
        -- the receiving event from Process 1 (WEAVING), not a separate process.
        -- Everything past weaving has been through bazar.
        COUNT(CASE WHEN c.wip_stage = 'on_loom' THEN 1 END)::int as on_loom,
        COUNT(CASE WHEN c.wip_stage != 'on_loom' THEN 1 END)::int as bazar_pcs,
        COUNT(CASE WHEN c.wip_stage = 'finishing' THEN 1 END)::int as finishing_pcs,
        COUNT(CASE WHEN c.wip_stage = 'fg_godown' THEN 1 END)::int as fg_godown_pcs,
        COUNT(CASE WHEN c.wip_stage = 'packed' THEN 1 END)::int as packed_pcs,
        0::int as dispatched_pcs
      FROM ehi_orders o
      JOIN ehi_order_items oi ON oi.order_id = o.id
      LEFT JOIN ehi_carpets c ON c.order_item_id = oi.id
      WHERE ${sql.unsafe(whereClause)}
      GROUP BY
        o.id, o.order_no, o.buyer_code,
        oi.design_name, oi.size, oi.color, oi.quality,
        oi.ordered_qty, oi.id
      ORDER BY o.order_no, oi.id
    `

    return rows.map((row: any) => ({
      company: 'EHI' as const,
      opsNo: row.ops_no || '',
      buyerCode: row.buyer_code || '',
      buyerName: row.buyer_name || '',
      folioNo: row.folio_no || '',
      contractor: row.contractor || '',
      design: row.design || '',
      size: row.size || '',
      color: row.color || '',
      quality: row.quality || '',
      totalPcs: Number(row.total_pcs) || 0,
      onLoom: Number(row.on_loom) || 0,
      bazarPcs: Number(row.bazar_pcs) || 0,
      finishingPcs: Number(row.finishing_pcs) || 0,
      fgGodownPcs: Number(row.fg_godown_pcs) || 0,
      packedPcs: Number(row.packed_pcs) || 0,
      dispatchedPcs: Number(row.dispatched_pcs) || 0,
      orderId: Number(row.order_id) || undefined,
      orderItemId: Number(row.order_item_id) || undefined,
    }))
  } catch (err) {
    console.error('EHI WIP query error:', err)
    return []
  }
}

// ============================================================================
// Get EHI sync status
// ============================================================================

async function getEhiSyncStatus(): Promise<{ status: 'synced' | 'stale' | 'error'; lastSyncedAt: string | null }> {
  const dbUrl = process.env.EHI_DATABASE_URL
  if (!dbUrl) {
    return { status: 'error', lastSyncedAt: null }
  }

  try {
    const sql = neon(dbUrl)
    const result = await sql`
      SELECT MAX(synced_at) as last_sync FROM ehi_orders LIMIT 1
    `
    const lastSync = result[0]?.last_sync
    if (!lastSync) {
      return { status: 'error', lastSyncedAt: null }
    }

    const syncTime = new Date(lastSync)
    const hoursSinceSync = (Date.now() - syncTime.getTime()) / (1000 * 60 * 60)

    return {
      status: hoursSinceSync > 2 ? 'stale' : 'synced',
      lastSyncedAt: syncTime.toISOString(),
    }
  } catch {
    return { status: 'error', lastSyncedAt: null }
  }
}

// ============================================================================
// Handler
// ============================================================================

export default async function handler(req: Request, context: Context): Promise<Response> {
  const url = new URL(req.url)
  const method = req.method

  if (method !== 'GET') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405)
  }

  try {
    // Parse filters
    const company = url.searchParams.get('company') as 'EMPL' | 'EHI' | null
    const buyer = url.searchParams.get('buyer') || undefined
    const search = url.searchParams.get('search') || undefined

    const filters = { buyer, search }

    // Query both databases in parallel (skip if filtered to one company)
    const [emplData, ehiData, ehiSyncStatus] = await Promise.all([
      company === 'EHI' ? [] : queryEmplWIP(filters),
      company === 'EMPL' ? [] : queryEhiWIP(filters),
      getEhiSyncStatus(),
    ])

    const allData = [...emplData, ...ehiData]

    // Calculate summary
    const emplRows = allData.filter(r => r.company === 'EMPL')
    const ehiRows = allData.filter(r => r.company === 'EHI')

    // Unique OPS numbers per company
    const emplOps = new Set(emplRows.map(r => r.opsNo))
    const ehiOps = new Set(ehiRows.map(r => r.opsNo))

    const summary = {
      totalOrders: emplOps.size + ehiOps.size,
      totalPcs: allData.reduce((sum, r) => sum + r.totalPcs, 0),
      onLoom: allData.reduce((sum, r) => sum + r.onLoom, 0),
      inBazar: allData.reduce((sum, r) => sum + r.bazarPcs, 0),
      inFinishing: allData.reduce((sum, r) => sum + r.finishingPcs, 0),
      packed: allData.reduce((sum, r) => sum + r.packedPcs, 0),
      dispatched: allData.reduce((sum, r) => sum + r.dispatchedPcs, 0),
      byCompany: {
        EMPL: {
          orders: emplOps.size,
          pcs: emplRows.reduce((sum, r) => sum + r.totalPcs, 0),
        },
        EHI: {
          orders: ehiOps.size,
          pcs: ehiRows.reduce((sum, r) => sum + r.totalPcs, 0),
        },
      },
    }

    return jsonResponse({
      success: true,
      data: allData,
      syncStatus: {
        empl: 'live',
        ehi: ehiSyncStatus,
      },
      summary,
    })
  } catch (error) {
    console.error('WIP API Error:', error)
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    )
  }
}
