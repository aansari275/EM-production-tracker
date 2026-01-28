# Eastern Mills Production Tracker

## Project Overview
TNA Stage Tracker app for the Production Planning & Control (PPC) team to track and update production status of all open orders.

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
- View all open orders (status: 'sent')
- Update TNA stage progress (actual dates, status, notes)
- Dashboard stats (by stage, overdue, etc.)

## Data Model

### Reading from Orders (Read-Only)
- `orders/data/orders` - Order details, TNA target dates
- `ops_no` - OPS registry

### New Collection: `production_tracker`
```typescript
interface ProductionTrackerEntry {
  id: string                    // Same as order ID
  opsNo: string                 // e.g., "OPS-25881"
  stages: {
    [stage: TnaStage]: {
      actualDate: string | null  // ISO date when actually completed
      status: 'pending' | 'in_progress' | 'completed'
      notes?: string
      updatedAt: string
      updatedBy?: string
    }
  }
  currentStage: TnaStage
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
| `/api/production-tracker` | GET | List all tracker entries |
| `/api/production-tracker/:id` | GET/PUT | Get/update tracker entry |
| `/api/production-tracker/:id/stage/:stage` | PUT | Update single stage |

## Environment Variables
```bash
# Firebase
FIREBASE_PROJECT_ID=easternmillscom
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@easternmillscom.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# PPC Access
PPC_ACCESS_PIN=<shared-pin-for-ppc-team>
```

## Local Development
```bash
npm run dev  # Starts Netlify dev server at http://localhost:8888
```

## Deployment
- **Netlify Site**: TBD
- Auto-deploys from `main` branch
