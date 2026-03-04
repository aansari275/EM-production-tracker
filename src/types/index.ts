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

// Combined order with tracker data for display
export interface OrderWithTracker extends Order {
  tracker?: ProductionTrackerEntry
}

// ============== Production Stats (from Neon) ==============

export interface ProductionStat {
  pcs: number
  bazar: number
  bal: number
}

export type ProductionStatsMap = Record<string, ProductionStat>

// ============== Inspection Schedule (shared Firestore collection) ==============

export type InspectionStatus = 'scheduled' | 'completed' | 'rescheduled' | 'cancelled'

export interface InspectionSchedule {
  id: string
  opsNo: string
  orderId: string
  inspectionDate: string
  inspectionCompany: CompanyCode
  status: InspectionStatus
  buyerCode: string
  articleName?: string
  totalPcs: number
  totalSqm: number
  merchantCode: string
  scheduledBy: string
  scheduledAt: string
  completedAt?: string
  rescheduledFrom?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

// ============== TED (Technical Execution Documents) Types ==============

export interface TedFormSummary {
  id: string
  emDesignNo: string
  buyerCode: string
  buyerName: string
  buyerDesignName?: string
  construction?: string
  productQuality?: string
  productType?: string
  size?: string
  ppMeetingDate?: string
  pileMaterial?: string
  status?: string
  thumbnailUrl?: string
}

export interface TedForm extends TedFormSummary {
  meetingAttendees?: string[]
  unfinishedGsm?: number
  finishedGsm?: number
  warpMaterial?: string
  weftMaterial?: string
  pileHeightUnfinished?: string
  pileHeightFinished?: string
  fringesDetails?: string
  sizeTolerance?: string
  processFlow?: string
  qualityCallOutsCtq?: string
  buyersSpecificRequirements?: string
  remarks?: string
  reedNoKanghi?: string
  warpIn6Inches?: string
  weftIn6Inches?: string
  shadeCardAvailable?: string
  redSealAvailable?: string
  khatiDetails?: string
  imageUrls?: Record<string, string[]>
  createdAt?: string
  updatedAt?: string
}

// ============== API Response Types ==============

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

