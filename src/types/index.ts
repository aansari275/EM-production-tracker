// ============== TNA (Time & Action Plan) Types ==============

// TNA Stages - 11 production milestones
export const TNA_STAGES = [
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

export type TnaStage = typeof TNA_STAGES[number]

// Display labels for each TNA stage
export const TNA_STAGE_LABELS: Record<TnaStage, string> = {
  raw_material_purchase: 'Raw Material Purchase',
  dyeing: 'Dyeing',
  photo_shoot_approval: 'Photo Shoot / Approval Sample',
  first_piece_approval: 'First Piece Approval',
  weaving: 'Weaving',
  finishing: 'Finishing',
  fg_godown: 'FG Godown',
  order_label_in_house: 'Order Label In House',
  inspection: 'Inspection',
  packing: 'Packing',
  dispatch: 'Dispatch'
}

// Short labels for compact display
export const TNA_STAGE_SHORT_LABELS: Record<TnaStage, string> = {
  raw_material_purchase: 'Raw Material',
  dyeing: 'Dyeing',
  photo_shoot_approval: 'Photo Shoot',
  first_piece_approval: 'First Piece',
  weaving: 'Weaving',
  finishing: 'Finishing',
  fg_godown: 'FG Godown',
  order_label_in_house: 'Labels',
  inspection: 'Inspection',
  packing: 'Packing',
  dispatch: 'Dispatch'
}

// Optional stages (can be marked N/A)
export const TNA_OPTIONAL_STAGES: TnaStage[] = [
  'photo_shoot_approval',
  'first_piece_approval',
  'order_label_in_house'
]

// Single TNA entry
export interface TnaEntry {
  stage: TnaStage
  targetDate: string | null  // ISO date string or null for N/A
}

// Complete TNA plan (from Orders)
export interface TnaPlan {
  entries: TnaEntry[]
}

// ============== Stage Status Types ==============

export type StageStatus = 'pending' | 'in_progress' | 'completed'

export interface StageUpdate {
  actualDate: string | null   // ISO date when actually completed
  status: StageStatus
  notes?: string
  updatedAt: string           // Last update timestamp
  updatedBy?: string          // For audit
}

// ============== Production Tracker Types (Excel-style) ==============

// Item-level tracking (matches Excel row)
export interface ProductionItemTracker {
  id: string                  // itemId from order
  orderId: string             // Parent order ID
  opsNo: string               // e.g., "EM-25-444"

  // Production tracking fields (editable by PPC)
  status: string              // Free text: "Running on loom & Cutoff- 15 Feb"
  rcvdPcs: number             // Received pieces
  toRcvdPcs: number           // To receive (calculated: orderPcs - rcvdPcs)
  oldStock: number            // Old stock pieces
  bazarDone: number           // Bazar done pieces
  uFinishing: number          // Under finishing pieces
  packed: number              // Packed pieces

  // Vendor/Folio tracking
  vendorName?: string
  folioNo?: string
  supplierCompletionDate?: string

  updatedAt: string
  updatedBy?: string
}

// Order-level tracker entry (groups item trackers)
export interface ProductionTrackerEntry {
  id: string                  // Same as order ID
  opsNo: string               // e.g., "OPS-25881"

  // Item-level tracking
  items: Record<string, ProductionItemTracker>  // keyed by item ID

  // TNA stage tracking (optional, for TNA tab)
  stages?: Record<TnaStage, StageUpdate>
  currentStage?: TnaStage

  createdAt: string
  updatedAt: string
}

// ============== Order Types (from Orders app - read-only) ==============

export type OrderType = 'custom' | 'broadloom' | 'area_rugs' | 'samples'
export type CompanyCode = 'EMPL' | 'EHI'

export interface OrderItem {
  id: string
  articleName: string
  sku: string
  size: string
  pcs: number
  sqm: number
  unitPrice: number
  lineValue: number
  emDesignName?: string
  color?: string
  quality?: string
  // Additional fields from import
  contractorName?: string
  folioNo?: string
}

export interface Order {
  id: string
  salesNo: string             // OPS number
  customerCode: string        // e.g., J-03
  buyerName: string
  orderType: OrderType
  companyCode: CompanyCode
  orderConfirmationDate: string
  merchantCode: string
  assistantMerchantCode?: string
  managedBy: string
  poNo: string
  buyerPoShipDate: string
  shipDate: string            // Ex-Factory date
  items: OrderItem[]
  totalPcs: number
  totalSqm: number
  poValue: number
  tna?: TnaPlan
  status: 'draft' | 'submitted' | 'sent' | 'shipped'
  createdAt: string
  updatedAt: string
}

// Flattened row for Excel-style display (one row per item)
export interface ProductionRow {
  // From Order
  orderId: string
  companyCode: CompanyCode    // "Handled" column
  customerCode: string        // Buyer Code
  merchant: string            // Merchant (with assistant)
  poDate: string              // PO Rcvd Date
  exFactoryDate: string       // Ex-Factory Date
  opsNo: string               // OPS # (formatted)

  // From OrderItem
  itemId: string
  article: string             // Article name / EM Design
  size: string
  color: string
  quality: string
  orderPcs: number            // ORDER PCS

  // From ProductionItemTracker (editable)
  // Column mapping from Excel:
  // - RCVD PCS → bazarDone (displayed as "Rcvd")
  // - TO RCVD PCS → toRcvdPcs (displayed as "To Rcvd")
  // - U/FINISHING → uFinishing (displayed as "Finish")
  status: string              // Free text status
  bazarDone: number           // Rcvd - from RCVD PCS column (bazar done qty)
  toRcvdPcs: number           // To Rcvd - from TO RCVD PCS column (bazar pending)
  oldStock: number            // Old stock pieces
  uFinishing: number          // Finish - from U/FINISHING column

  // Vendor info
  vendorName: string
  folioNo: string
  supplierCompletionDate: string
  orderIssueDate: string
  orderType: string           // J, P, etc.
}

// Combined order with tracker data for display
export interface OrderWithTracker extends Order {
  tracker?: ProductionTrackerEntry
}

// ============== API Response Types ==============

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// ============== Dashboard Stats ==============

export interface DashboardStats {
  totalOrders: number
  totalItems: number
  totalPcs: number
  byCompany: { EMPL: number; EHI: number }
  overdue: number
  thisWeek: number
}

// ============== WIP (Work In Progress) Types ==============

export interface WIPRow {
  company: 'EMPL' | 'EHI'
  opsNo: string
  buyerCode: string
  buyerName?: string
  merchant: string
  orderDate: string | null
  shipDate: string | null
  folioNo: string
  contractor: string
  design: string
  size: string
  color: string
  quality: string
  totalPcs: number
  onLoom: number           // Currently being woven
  bazarPcs: number         // Received from weaver (bazar stage)
  finishingPcs: number     // In finishing pipeline
  fgGodownPcs: number      // In finished goods godown
  packedPcs: number        // Packed and ready
  dispatchedPcs: number    // Already dispatched
  // Order item identifiers for drill-down
  orderId?: number
  orderItemId?: number
}

// Grouped row — one per OPS (aggregated from WIPRow items)
export interface WIPGroupedRow {
  company: 'EMPL' | 'EHI'
  opsNo: string
  buyerCode: string
  buyerName: string
  merchant: string
  orderDate: string | null
  shipDate: string | null
  itemCount: number
  totalPcs: number
  onLoom: number
  bazarPcs: number
  finishingPcs: number
  fgGodownPcs: number
  packedPcs: number
  dispatchedPcs: number
  items: WIPRow[]
}

export interface WIPSyncStatus {
  empl: 'live'
  ehi: {
    status: 'synced' | 'stale' | 'error'
    lastSyncedAt: string | null
  }
}

export interface WIPResponse {
  data: WIPRow[]
  syncStatus: WIPSyncStatus
  summary: WIPSummary
}

export interface WIPSummary {
  totalOrders: number
  totalPcs: number
  onLoom: number
  inBazar: number
  inFinishing: number
  packed: number
  dispatched: number
  byCompany: {
    EMPL: { orders: number; pcs: number }
    EHI: { orders: number; pcs: number }
  }
}
