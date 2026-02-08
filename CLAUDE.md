# Eastern Mills Production Tracker

## Project Overview
Excel-style production tracker for the Production Planning & Control (PPC) team. Matches the "Running Order Status" Excel format that PPC uses daily.

**Live URL**: https://em-production-tracker.netlify.app
**PIN**: ppc2024

## Tech Stack
- **Frontend**: React 18 + TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend**: Netlify Functions (serverless)
- **Database**: Firebase Firestore (same `easternmillscom` project)
- **State**: TanStack Query (React Query)
- **Hosting**: Netlify

## Authentication
- Simple PIN authentication (not Firebase Auth)
- PIN stored in `PPC_ACCESS_PIN` environment variable
- Session stored in localStorage

## Key Features

### 1. Excel-Style Production Table
- Item-level rows (one row per order item, like the Excel)
- **Column order (optimized for visibility):**
  1. OPS # - Order number
  2. Buyer - Buyer code
  3. Article - EM Design name
  4. Size - Dimensions
  5. Pcs - Order quantity
  6. **Status** (yellow) - Free text production status
  7. **Rcvd** (green) - Bazar done qty (from RCVD PCS column in Excel)
  8. **To Rcvd** (orange) - Bazar pending (from TO RCVD PCS column)
  9. **Finish** (purple) - Under finishing (from U/FINISHING column)
  10. Ex-Fact - Ex-factory date
  11. Color - Color variant
  12. Quality - Quality/construction
  13. Co. - Company (EMPL/EHI)
- Inline editing: Click any editable cell to update
- Color-coded production columns always visible (no horizontal scroll needed)
- Visual separation between different OPS numbers

### 2. Search & Filters
- **Search**: OPS #, Buyer Code, Article name, Merchant
- **Company Filter**: All / EMPL Only / EHI Only
- **Buyer Filter**: Quick dropdown for buyer selection
- **Status Filters**: Overdue Only / This Week Only
- Active filters bar shows applied filters with clear buttons

### 3. Central Upload Zone (Hero Feature)
- **Large drag-and-drop area** at top of dashboard - impossible to miss
- Drag & drop Excel file or click "Select File" button
- Shows "Last updated: X minutes ago" timestamp
- Pulsing badge shows new orders count (clickable for details)
- Supports .xlsx and .xls files

### 4. Excel Bulk Upload
- Upload "Running Order Status" Excel for bulk status updates
- **Only updates status fields** (does not add new items)
- **Excel Column → Display Mapping:**
  | Excel Column | Display | Field |
  |-------------|---------|-------|
  | Status | Status | status |
  | RCVD PCS | Rcvd | bazarDone (Bazar Done qty) |
  | TO RCVD PCS | To Rcvd | toRcvdPcs (Bazar Pending) |
  | U/FINISHING | Finish | uFinishing |
- Matches existing items by OPS # + Article + Size + Color
- Preview before upload, shows results summary
- Uses **batched Firestore writes** (400 per batch) for performance
- Stores OPS numbers from Excel for new orders comparison

### 5. TNA Timeline View
- Separate tab for visual TNA stage tracking
- Grouped by OPS number with expandable sections
- 11-stage vertical timeline with status indicators
- Click to update stage status

### 6. Compact Stats Row
- 4 key metrics: Orders, Total Pcs, Overdue, This Week
- Clean horizontal layout below upload zone

### 7. New Orders Detection
- **Compares by OPS#** - Shows orders whose OPS# is NOT in uploaded Excel
- Pulsing amber badge on upload zone: "X new orders - Click to view"
- **Clickable modal** with full details:
  - OPS # (large, highlighted)
  - Company (EMPL/EHI)
  - Buyer code & name
  - Total pcs & sqm
  - Created date
- "Upload Updated Excel" button in modal
- Clears when PPC adds orders to their Excel and re-uploads
- Data stored in: `settings/production_status_file` (opsNumbers array + uploadedAt)

## Data Model

### Reading from Orders (Read-Only)
- `orders/data/orders` - Order details, items, TNA target dates
- `merchants` - Merchant names for display

### Collection: `production_tracker`
```typescript
interface ProductionTrackerEntry {
  id: string                    // Same as order ID
  opsNo: string                 // e.g., "EM-26-881"

  // Item-level tracking (keyed by item ID)
  items: {
    [itemId: string]: {
      status: string            // Free text: "Running on loom & Cutoff- 15 Feb"
      bazarDone: number         // Rcvd - from RCVD PCS (bazar done qty)
      toRcvdPcs: number         // To Rcvd - from TO RCVD PCS (bazar pending)
      oldStock: number          // Old stock pieces
      uFinishing: number        // Finish - from U/FINISHING
      updatedAt: string
    }
  }

  // TNA stage tracking (optional, for TNA tab)
  stages?: {
    [stage: TnaStage]: {
      actualDate: string | null
      status: 'pending' | 'in_progress' | 'completed'
      notes?: string
      updatedAt: string
    }
  }

  createdAt: string
  updatedAt: string
}
```

## TNA Stages (11 total)
1. Raw Material Purchase
2. Dyeing
3. Photo Shoot / Approval Sample (optional)
4. First Piece Approval (optional)
5. Weaving
6. Finishing
7. FG Godown
8. Order Label In House (optional)
9. Inspection
10. Packing
11. Dispatch

## API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/verify` | POST | Verify PIN |
| `/api/orders` | GET | List open orders (status=sent) |
| `/api/production-rows` | GET | Get item-level rows (Excel format) |
| `/api/dashboard/stats` | GET | Dashboard statistics |
| `/api/production-tracker/:id/item/:itemId` | PUT | Update item status |
| `/api/production-tracker/:id/stage/:stage` | PUT | Update TNA stage |
| `/api/production-tracker/bulk-update` | POST | Bulk update from Excel |
| `/api/production-status/file` | GET | Get last upload metadata + OPS numbers |
| `/api/production-status/file` | POST | Save upload metadata + OPS numbers from Excel |
| `/api/production-status/new-orders` | GET | Get orders whose OPS# is NOT in uploaded Excel |
| `/api/wip` | GET | Live WIP from EMPL + EHI (filters: `company`, `buyer`, `search`) |

## Live WIP Dashboard (Feb 2026)

### Architecture
- **EMPL**: Live queries to existing Neon PostgreSQL (`neondb`)
- **EHI**: SQL Server (10.63.100.46 via ZeroTier) → synced every 30 min to Neon PostgreSQL (`ehi_wip`)
- **Neon Project**: `quiet-lake-53645968` (both databases in same project)

### EHI Sync Script
- **File**: `scripts/sync-ehi.mjs`
- Connects to EHI SQL Server, reads open orders + 333K carpets
- Upserts into Neon PostgreSQL with transaction safety (BEGIN/COMMIT/ROLLBACK)
- **LaunchAgent**: `~/Library/LaunchAgents/com.em.ehi-sync.plist` (every 30 min)
- **Dependencies**: `mssql`, `pg`, `dotenv` (NOT in package.json — install separately)
- **Env**: `scripts/.env` with `EHI_SQL_*` and `EHI_DATABASE_URL`
- **Run manually**: `node scripts/sync-ehi.mjs`

### WIP Stage Mapping (EHI)
- **on_loom**: CurrentProStatus = 1 (WEAVING)
- **finishing**: CurrentProStatus 2-6, 8-20, 23-24, 26, 28-37
- **fg_godown**: CurrentProStatus 21 (AQL), 22 (MOVE TO WAREHOUSE)
- **packed**: CurrentProStatus 7, 25, 27
- **bazar_pcs**: Count of carpets with CurrentProStatus > 1 (passed through bazar)

### Bazar in EHI
Bazar is NOT a separate process. It's the PROCESS_RECEIVE_1 event (weaving receive).
When a rug comes off the loom and is received from the weaver, that IS the bazar checkpoint.
Tracked in: `PROCESS_RECEIVE_MASTER_1` / `PROCESS_RECEIVE_DETAIL_1` (1.1M records).

### Key EHI SQL Server Tables
| Table | Records | Purpose |
|-------|---------|---------|
| `OrderMaster` | Open: 521 | Orders (Status='0' = open) |
| `OrderDetail` | ~2,912 | Order line items |
| `CarpetNumber` | 4M total | Individual carpet tracking |
| `Process_Stock_Detail` | 33.8M | Process flow history |
| `PROCESS_NAME_MASTER` | 37 | Process definitions |
| `ITEM_PARAMETER_MASTER` | - | Links Item_Finished_Id to design/size/color/quality |

### EHI Column Name Gotchas
- `OrderMaster.CustomerOrderNo` = OPS number (NOT OrderNo)
- `OrderMaster.Status = '0'` = Open (NOT 'Active')
- `OrderDetail.QtyRequired` (NOT Qty)
- `OrderDetail.ArticalNo` (typo in EHI schema, NOT ArticleNo)
- Design/Size/Color/Quality link via `ITEM_PARAMETER_MASTER.ITEM_FINISHED_ID`
- CarpetNumber links via `Item_Finished_Id + OrderId` (NOT OrderDetailId)

## Environment Variables
```bash
# Firebase
FIREBASE_PROJECT_ID=easternmillscom
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@easternmillscom.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# PPC Access
PPC_ACCESS_PIN=ppc2024

# WIP Databases (Netlify env vars)
EMPL_DATABASE_URL=postgresql://...@neon.tech/neondb?sslmode=require
EHI_DATABASE_URL=postgresql://...@neon.tech/ehi_wip?sslmode=require
```

## Local Development
```bash
npm install
npm run dev  # Starts Netlify dev server at http://localhost:8888
```

## Deployment
- **Netlify Site**: em-production-tracker
- **Site ID**: 41e47928-41a1-4dc6-8ec3-69fba71e90da
- Auto-deploys from `main` branch on GitHub
- Manual deploy: `netlify deploy --prod`

## File Structure
```
src/
├── components/
│   ├── ProductionTable.tsx    # Main Excel-style table
│   ├── TnaView.tsx            # TNA timeline view
│   ├── StatsCards.tsx         # Dashboard stats
│   ├── ExcelUpload.tsx        # Bulk upload dialog
│   └── ui/                    # shadcn/ui components
├── hooks/
│   ├── useOrders.ts           # Fetch orders & production rows
│   ├── useWIP.ts              # Live WIP React Query hook
│   └── useProductionTracker.ts # Update mutations
├── pages/
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   └── WIPPage.tsx            # Live WIP dashboard
├── contexts/
│   └── AuthContext.tsx
├── types/
│   └── index.ts
└── lib/
    ├── firebase.ts
    └── utils.ts

netlify/functions/
└── api.mts                    # All API endpoints
```

## Recent Changes (Jan 2025)

### Jan 30, 2025 - Major UI Overhaul
- **Central Upload Zone** - Large drag-and-drop hero section at top of dashboard. Upload button was hidden before, now impossible to miss.
- **New Orders by OPS#** - Compares system orders against uploaded Excel OPS numbers (not timestamps). Shows only orders PPC doesn't have in their sheet.
- **Clickable New Orders Badge** - Pulsing amber badge opens modal with full order details (OPS#, buyer, pcs, sqm, date).
- **Last Updated Timestamp** - Shows "Last updated: X minutes ago" in upload zone.
- **Batched Bulk Updates** - Uses Firestore batch writes (400/batch) to prevent timeout on large uploads.
- **Simplified Stats** - Reduced from 6 cards to 4 compact stats (Orders, Pcs, Overdue, This Week).
- **Friendlier Upload Results** - Changed "Errors" to "Skipped" for items not in system (old/completed orders).

### Earlier (Jan 2025)
- **Column Reorder** - Production status columns (Status, Rcvd, To Rcvd, Finish) now appear early in table for visibility without scrolling.
- **Simplified Column Mapping** - Excel columns mapped directly: RCVD PCS → Rcvd, TO RCVD PCS → To Rcvd, U/FINISHING → Finish.
- **Fixed Table Layout** - Uses `table-fixed` CSS to ensure all columns fit on screen.
