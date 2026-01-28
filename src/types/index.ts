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

// ============== Production Tracker Types ==============

export interface ProductionTrackerEntry {
  id: string                  // Same as order ID
  opsNo: string               // e.g., "OPS-25881"
  stages: Record<TnaStage, StageUpdate>
  currentStage: TnaStage      // Current active stage
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
  totalOpen: number
  byStage: Record<TnaStage, number>
  overdue: number
  thisWeek: number
}
