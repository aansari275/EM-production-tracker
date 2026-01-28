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
- Columns: Handled, Buyer, Merchant, PO Date, Ex-Factory, OPS #, Article, Size, Color, Quality, Order Pcs, Status, Rcvd, To Rcvd, Bazar, Finish, Packed
- Inline editing: Click any editable cell to update
- Color-coded columns matching Excel (yellow for Status, green for Rcvd, etc.)
- Visual separation between different OPS numbers

### 2. Search & Filters
- **Search**: OPS #, Buyer Code, Article name, Merchant
- **Company Filter**: All / EMPL Only / EHI Only
- **Buyer Filter**: Quick dropdown for buyer selection
- **Status Filters**: Overdue Only / This Week Only
- Active filters bar shows applied filters with clear buttons

### 3. Excel Bulk Upload
- Upload "Running Order Status" Excel for bulk status updates
- **Only updates status fields** (does not add new items):
  - Status (free text)
  - Rcvd Pcs, Old Stock, Bazar Done, U/Finishing, Packed
- Matches existing items by OPS # + Article + Size + Color
- Preview before upload, shows results summary

### 4. TNA Timeline View
- Separate tab for visual TNA stage tracking
- Grouped by OPS number with expandable sections
- 11-stage vertical timeline with status indicators
- Click to update stage status

### 5. Dashboard Stats
- Total Orders, Total Items, Total Pcs
- Overdue orders count
- This Week's ex-factory
- EMPL / EHI company breakdown

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
      rcvdPcs: number
      oldStock: number
      bazarDone: number
      uFinishing: number
      packed: number
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

## Environment Variables
```bash
# Firebase
FIREBASE_PROJECT_ID=easternmillscom
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@easternmillscom.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# PPC Access
PPC_ACCESS_PIN=ppc2024
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
│   └── useProductionTracker.ts # Update mutations
├── pages/
│   ├── LoginPage.tsx
│   └── DashboardPage.tsx
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
