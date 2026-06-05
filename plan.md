# NLU Stock Management System — Implementation Plan

## Overview

Phase 1: Stock management (dispensing, receiving, adjustment, maintenance, reports, settings).
Tech: Next.js 16 App Router, React 19, TypeScript 5, Prisma 7.8 + PostgreSQL, shadcn/ui 4.7 + Tailwind CSS 4.

---

## Milestone 0: Project Init & Dev Environment

### 0.1 Create Next.js project
```bash
npx create-next-app@latest nlu-stock --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd nlu-stock
```

### 0.2 Install core dependencies
```bash
# UI
npx shadcn@latest init
npx shadcn@latest add button card dialog dropdown-menu input label select sheet table tabs badge separator tooltip command popover form textarea avatar checkbox radio-group scroll-area skeleton switch sonner navigation-menu

# State & forms
npm install react-hook-form @hookform/resolvers zod

# ORM & DB
npm install prisma @prisma/client
npm install -D prisma

# Auth — jose JWT (no next-auth)
npm install jose bcryptjs
npm install -D @types/bcryptjs

# QR
npm install qrcode html5-qrcode
npm install -D @types/qrcode

# Charts
npm install recharts

# File uploads
npm install multer
npm install -D @types/multer

# Email
npm install nodemailer
npm install -D @types/nodemailer

# Export
npm install xlsx pdfkit
npm install -D @types/pdfkit

# Icons
npm install lucide-react

# Theme
npm install next-themes

# Date
npm install date-fns
```

### 0.3 Docker Compose for PostgreSQL
```yaml
# docker-compose.yml
version: "3.8"
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: nlu_stock
      POSTGRES_USER: nlu
      POSTGRES_PASSWORD: nlu_dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

### 0.4 Prisma init & connection
```bash
npx prisma init
```
Set `DATABASE_URL` in `.env`:
```
DATABASE_URL="postgresql://nlu:nlu_dev@localhost:5432/nlu_stock"
```

### 0.5 Folder structure
```
src/
├── app/
│   ├── (auth)/              # Login layout (no sidebar)
│   │   └── login/
│   ├── (dashboard)/         # Main layout (sidebar + bottom tab)
│   │   ├── layout.tsx
│   │   ├── page.tsx         # Dashboard
│   │   ├── items/
│   │   │   ├── page.tsx     # All Items list
│   │   │   └── [id]/
│   │   │       └── page.tsx # Item Detail
│   │   ├── dispense/
│   │   │   └── page.tsx     # ตัดเบิก
│   │   ├── receive/
│   │   │   └── page.tsx     # รับของเข้า
│   │   ├── reports/
│   │   │   └── page.tsx     # Reports
│   │   └── settings/
│   │       └── page.tsx     # Settings (Admin)
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts
│   │   │   ├── logout/route.ts
│   │   │   └── session/route.ts
│   │   ├── items/
│   │   ├── dispense/
│   │   ├── receive/
│   │   ├── reports/
│   │   ├── settings/
│   │   └── upload/
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                  # shadcn components
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   ├── bottom-tab.tsx
│   │   ├── header.tsx
│   │   └── auth-guard.tsx
│   ├── dashboard/
│   │   ├── low-stock-card.tsx
│   │   ├── near-expiry-card.tsx
│   │   ├── maintenance-due-card.tsx
│   │   ├── status-overview-card.tsx
│   │   ├── recent-dispense.tsx
│   │   ├── recent-receive.tsx
│   │   ├── top-dispense.tsx
│   │   └── usage-chart.tsx
│   ├── items/
│   ├── dispense/
│   │   └── cart-drawer.tsx
│   ├── receive/
│   ├── reports/
│   ├── settings/
│   └── shared/
│       ├── qr-scanner.tsx
│       ├── qr-display.tsx
│       ├── file-upload.tsx
│       └── data-table.tsx
├── lib/
│   ├── prisma.ts            # Prisma client singleton
│   ├── auth.ts              # jose JWT sign/verify helpers
│   ├── utils.ts             # cn(), formatters
│   ├── validators/          # Zod schemas
│   └── constants.ts         # Status enums, category enums
├── hooks/
│   ├── use-auth.ts
│   ├── use-debounce.ts
│   └── use-pagination.ts
├── types/
│   └── index.ts
└── middleware.ts             # Auth middleware
```

### 0.6 Environment variables
```env
# .env.local
DATABASE_URL="postgresql://nlu:nlu_dev@localhost:5432/nlu_stock"
JWT_SECRET="dev-secret-change-in-prod"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Email (Dev: console transport)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
ALERT_EMAIL_RECIPIENTS="admin@university.ac.th"

# File upload
UPLOAD_DIR="./uploads"
MAX_FILE_SIZE=10485760  # 10MB
```

### 0.7 Git init
```bash
git init
# Add .gitignore (node_modules, .env*, uploads/, .next/)
git add .
git commit -m "init: Next.js 16 project with dependencies (jose auth)"
```

**Deliverable**: `npm run dev` runs, `docker compose up -d` starts PostgreSQL, Prisma connects.

---

## Milestone 1: Database Schema

### 1.1 Prisma schema — full Phase 1 model

> **Grill session decisions (Q1-Q15):**
> - Q1: Running total at Item + Lot, Prisma `$transaction` for atomicity
> - Q2: Staff selects lot manually (sorted FIFO as suggestion)
> - Q3: No SubItem rows when `track_individually = false`
> - Q4: Durable non-tracked still uses dispense/return (qty-based)
> - Q5: Single return per DispenseRecord (no partial return)
> - Q6: `Item.status` for fixed asset, `SubItem.status` for tracked durable
> - Q7: `lotId` nullable in DispenseRecord, required only for consumable
> - Q8: Store both `quantity` + `quantitySub`
> - Q9: Flat 3 columns for location (no self-reference)
> - Q10: No QRCode table, generate at runtime from item.code
> - Q11: ReceiveRecord stores only `lotId` (Lot is source of truth)
> - Q12: Fixed asset fields in `Item` table (nullable, filter by category)
> - Q13: `attachmentUrls String[]` array column
> - Q14: `Subject` table (admin-managed dropdown)
> - Q15: Indexes for query patterns

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Category {
  CONSUMABLE
  DURABLE
  FIXED_ASSET
  BOOK
}

enum ItemStatus {
  AVAILABLE
  CHECKED_OUT
  DAMAGED
  UNDER_REPAIR
  LOST
  PENDING_MAINTENANCE
  DISPOSED
}

enum Role {
  ADMIN
  STAFF
  INSTRUCTOR
}

enum AdjustmentReason {
  LOST
  DAMAGED_PENDING_REPAIR
  COUNT_MISMATCH
  DISPOSAL
  OTHER
}

enum MaintenanceType {
  PREVENTIVE
  CORRECTIVE
}

enum MaintenanceResult {
  AVAILABLE
  NEEDS_MORE_REPAIR
  DISPOSED
}

// --- Users ---
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  role      Role     @default(STAFF)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  dispenseRecords    DispenseRecord[]
  receiveRecords     ReceiveRecord[]
  adjustments        StockAdjustment[]
  maintenanceRecords MaintenanceRecord[]
  statusChanges      ItemStatusLog[]

  @@map("users")
}

// --- Categories ---
model CategoryType {
  id          String   @id @default(cuid())
  name        String   @unique
  category    Category
  description String?
  sortOrder   Int      @default(0)

  items Item[]

  @@map("categories")
}

// --- Subjects (admin-managed, staff selects from dropdown) ---
model Subject {
  id        String   @id @default(cuid())
  code      String   @unique
  name      String
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  dispenseRecords DispenseRecord[]

  @@map("subjects")
}

// --- Locations (flat 3 columns, no self-reference) ---
model Location {
  id      String  @id @default(cuid())
  room    String
  cabinet String?
  shelf   String?

  items Item[]

  @@unique([room, cabinet, shelf])
  @@map("locations")
}

// --- Items ---
model Item {
  id                String       @id @default(cuid())
  code              String       @unique
  name              String
  nameTh            String?
  categoryId        String
  category          CategoryType @relation(fields: [categoryId], references: [id])
  trackIndividually Boolean      @default(false)
  status            ItemStatus   @default(AVAILABLE)
  issueUnit         String
  subUnit           String
  conversionFactor  Int          @default(1)
  minThreshold      Int          @default(0)
  locationId        String?
  location          Location?    @relation(fields: [locationId], references: [id])
  imageUrl          String?
  description       String?
  isActive          Boolean      @default(true)
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt

  // Running total (Q1)
  totalQty          Int          @default(0)
  availableQty      Int          @default(0)

  // Fixed Asset fields (nullable, used when category = FIXED_ASSET)
  serialNumber          String?
  model                 String?
  purchaseDate          DateTime?
  purchasePrice         Float?
  vendor                String?
  warrantyEndDate       DateTime?
  maintenanceCycleMonths Int     @default(12)
  lastMaintenanceDate   DateTime?
  nextMaintenanceDate   DateTime?
  manualUrl             String?  // PDF manual file path

  // Relations
  subItems           SubItem[]
  lots               Lot[]
  dispenseRecords    DispenseRecord[]
  receiveRecords     ReceiveRecord[]
  adjustments        StockAdjustment[]
  maintenanceRecords MaintenanceRecord[]
  statusLogs         ItemStatusLog[]

  @@index([categoryId, isActive])
  @@index([locationId])
  @@index([availableQty])
  @@map("items")
}

// --- Sub-Items (only when track_individually = true) ---
model SubItem {
  id        String     @id @default(cuid())
  itemId    String
  item      Item       @relation(fields: [itemId], references: [id], onDelete: Cascade)
  subCode   String
  status    ItemStatus @default(AVAILABLE)
  condition String?
  notes     String?
  imageUrl  String?
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  dispenseRecords DispenseRecord[]
  statusLogs      ItemStatusLog[]

  @@unique([itemId, subCode])
  @@index([itemId, status])
  @@map("sub_items")
}

// --- Lots (consumable batches) ---
model Lot {
  id            String   @id @default(cuid())
  itemId        String
  item          Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)
  lotNumber     String
  expiryDate    DateTime?
  quantity      Int      @default(0)
  receivedDate  DateTime @default(now())
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  dispenseRecords DispenseRecord[]
  receiveRecords  ReceiveRecord[]

  @@unique([itemId, lotNumber])
  @@index([itemId, expiryDate])
  @@map("lots")
}

// --- Dispense (ตัดเบิก) ---
model DispenseRecord {
  id          String    @id @default(cuid())
  itemId      String
  item        Item      @relation(fields: [itemId], references: [id])
  subItemId   String?
  subItem     SubItem?  @relation(fields: [subItemId], references: [id])
  lotId       String?   // nullable, required for consumable (Q7)
  lot         Lot?      @relation(fields: [lotId], references: [id])
  quantity    Int                       // in issue units (Q8)
  quantitySub Int                       // in sub units (Q8)
  subjectId   String?
  subject     Subject?  @relation(fields: [subjectId], references: [id])
  staffId     String
  staff       User      @relation(fields: [staffId], references: [id])
  dispensedAt DateTime  @default(now())
  returnedAt  DateTime? // for durables, single return (Q5)
  notes       String?

  @@index([itemId, dispensedAt])
  @@index([staffId, dispensedAt])
  @@map("dispense_records")
}

// --- Receive (รับของเข้า) ---
model ReceiveRecord {
  id          String   @id @default(cuid())
  itemId      String
  item        Item     @relation(fields: [itemId], references: [id])
  lotId       String?
  lot         Lot?     @relation(fields: [lotId], references: [id])
  quantity    Int
  receivedBy  String
  receiver    User     @relation(fields: [receivedBy], references: [id])
  receivedAt  DateTime @default(now())
  notes       String?

  @@index([itemId, receivedAt])
  @@map("receive_records")
}

// --- Stock Adjustment ---
model StockAdjustment {
  id            String           @id @default(cuid())
  itemId        String
  item          Item             @relation(fields: [itemId], references: [id])
  previousQty   Int
  newQty        Int
  reason        AdjustmentReason
  notes         String?
  adjustedBy    String
  adjuster      User             @relation(fields: [adjustedBy], references: [id])
  imageEvidence String?
  adjustedAt    DateTime         @default(now())

  @@index([itemId, adjustedAt])
  @@map("stock_adjustments")
}

// --- Maintenance (Fixed Asset only) ---
model MaintenanceRecord {
  id                String            @id @default(cuid())
  itemId            String
  item              Item              @relation(fields: [itemId], references: [id])
  type              MaintenanceType
  result            MaintenanceResult
  performedAt       DateTime
  performedBy       String
  performer         User              @relation(fields: [performedBy], references: [id])
  issue             String?
  description       String?
  cost              Float?
  attachmentUrls    String[]
  nextMaintenanceAt DateTime?

  createdAt         DateTime          @default(now())

  @@map("maintenance_records")
}

// --- Status Change Log ---
model ItemStatusLog {
  id             String     @id @default(cuid())
  itemId         String
  item           Item       @relation(fields: [itemId], references: [id])
  subItemId      String?
  subItem        SubItem?   @relation(fields: [subItemId], references: [id])
  previousStatus ItemStatus
  newStatus      ItemStatus
  reason         String?
  changedBy      String
  changer        User       @relation(fields: [changedBy], references: [id])
  imageUrl       String?
  changedAt      DateTime   @default(now())

  @@map("item_status_logs")
}
```

### 1.2 Seed data
```bash
npx prisma migrate dev --name init
```

Seed script (`prisma/seed.ts`):
- 4 categories (สิ้นเปลือง, คงทน, ครุพันธุ์, หนังสือ)
- 3 demo users (admin@dev, staff@dev, instructor@dev)
- 10+ sample items across categories
- Locations: 2 rooms, 4 cabinets, 8 shelves

**Deliverable**: `npx prisma migrate dev` runs clean. `npx prisma studio` shows seed data.

---

## Milestone 2: Auth & Layout

### 2.1 jose JWT auth helpers (`lib/auth.ts`)
- `signToken(payload: { userId, email, role })` → JWT string (HS256, `jose.SigningKey`)
- `verifyToken(token: string)` → payload or null
- Token stored in httpOnly cookie (`session_token`)
- Cookie options: `httpOnly`, `secure` (prod), `sameSite=lax`, `path=/`, `maxAge=24h`
- Exports: `signToken`, `verifyToken`, `getSessionUser(request)` (reads cookie + verifies)

### 2.2 Auth API routes
- `POST /api/auth/login` — validate email against User table, sign JWT, set cookie, return user
- `POST /api/auth/logout` — clear cookie
- `GET /api/auth/session` — read cookie, verify token, return user payload
- Dev mode: accept email-only login (mock, no password)
- Prod mode: verify Azure AD token from MSAL client-side flow, then sign our JWT

### 2.3 Auth middleware (`middleware.ts`)
```typescript
// Read `session_token` cookie on every request
// Verify JWT via jose
// Unauthenticated → redirect to /login
// Role check: /settings requires ADMIN, /dispense+receive requires STAFF or ADMIN
// INSTRUCTOR → view-only routes only (/items, /reports, /)
// Skip /api/auth/* and /login
```

### 2.4 Login page (`app/(auth)/login/page.tsx`)
- Dev: 3 quick-login buttons (Admin / Staff / Instructor) + email field
- Prod: MSAL popup → get Azure AD id_token → POST to `/api/auth/login`
- On success → redirect to `/`
- Show error if email not in User table

### 2.5 Dashboard layout (`app/(dashboard)/layout.tsx`)
- Sidebar: logo, nav links (Dashboard, All Items, Dispense, Receive, Reports, Settings)
- Sidebar: user avatar + name + role badge + logout button (calls `/api/auth/logout`)
- Bottom tab bar: shows on mobile (Dashboard, Items, Dispense, Receive, More)
- Header: page title + breadcrumbs
- Role guard: hide Settings nav if not Admin
- Responsive: sidebar collapses to hamburger on mobile

### 2.6 Theme setup
- `next-themes` provider
- Orange + gray color palette in Tailwind config
- Dark/light toggle in header

**Deliverable**: Login works (dev mode). JWT issued via jose, stored in httpOnly cookie. Middleware protects routes by role. Layout renders with sidebar + bottom tab. Theme toggle works.

---

## Milestone 3: Settings — Item Master & Categories

Build Settings first because all other features depend on master data.

### 3.1 Settings layout
- Tab navigation: Items Master | Categories | Locations | Users | Import
- Admin-only access (role check)
- Each tab is a client component with its own CRUD

### 3.2 Categories tab
- List categories in table (name, type, description, sort order)
- Add/Edit dialog (form: name, category enum, description)
- Delete with confirmation (check if items reference it)
- Reorder (drag or manual sort)

### 3.3 Locations tab
- Tree view: Room > Cabinet > Shelf
- Add room / Add cabinet (select room) / Add shelf (select cabinet)
- Edit name, delete (check if items reference it)
- Breadcrumb display: "ห้อง A / ตู้ 3 / ชั้น 2"

### 3.4 Items Master tab — the big one
- Data table with columns: code, name, category, tracking type, total qty, available qty, location, status
- Filter: category, status, location, track_individually
- Search: code, name, nameTh
- Sort: code, name, qty (asc/desc)
- Pagination: server-side

**Add/Edit Item dialog** (multi-step or single form with sections):
1. Basic: code (auto-gen or manual), name, nameTh, category, description
2. Tracking: track_individually toggle
3. Units: issue unit, sub unit, conversion factor
4. Stock: min threshold, location
5. Image upload (single image)
6. Fixed Asset extra fields (show only if category = FIXED_ASSET): serial number, model, purchase date, price, vendor, warranty end date, maintenance cycle months

### 3.5 Sub-codes management
- On Item Master tab, expand row or click "Manage Sub-codes"
- Show sub-item list: subCode, status, condition
- Add sub-codes: prefix + start number + end number → batch generate
- Edit: status, condition, notes
- Delete with confirmation

### 3.6 Users tab
- List users: email, name, role, active status
- Add user: email, name, role
- Edit role / toggle active
- Delete (soft: set isActive = false)

### 3.7 Import tab
- Dropdown select import type: Items / Categories / Locations / Sub-codes
- Download template CSV button (generates template with headers)
- Upload CSV file
- Preview: show first 5 rows in table
- Validate: check required fields, data types, duplicates
- Import: save valid rows, show error rows with reasons
- Summary: "Imported 45 rows, 3 errors"

### 3.8 API routes for Settings
```
POST   /api/settings/categories
GET    /api/settings/categories
PUT    /api/settings/categories/[id]
DELETE /api/settings/categories/[id]

POST   /api/settings/locations
GET    /api/settings/locations
PUT    /api/settings/locations/[id]
DELETE /api/settings/locations/[id]

POST   /api/settings/items
GET    /api/settings/items
PUT    /api/settings/items/[id]
DELETE /api/settings/items/[id]

POST   /api/settings/items/[id]/sub-items
GET    /api/settings/items/[id]/sub-items
PUT    /api/settings/sub-items/[id]
DELETE /api/settings/sub-items/[id]

GET    /api/settings/users
POST   /api/settings/users
PUT    /api/settings/users/[id]

POST   /api/settings/import
GET    /api/settings/import/template?type=items
```

**Deliverable**: Admin can CRUD categories, locations, items (with sub-codes), users. Import CSV works. All data persists in PostgreSQL.

---

## Milestone 4: All Items & Item Detail

### 4.1 All Items page (`/items`)
- Reuse data table from Settings Items Master but view-focused
- Columns: code, name, category badge, available qty / total qty, unit, status badge, location
- Filter bar: category chips, status dropdown, location dropdown, search input
- Sort options: name A-Z, qty low→high, recent dispense
- Click row → `/items/[id]`
- Remember scroll position on back navigation
- Role: all roles can view. Admin/Staff see action buttons. Instructor sees view-only.

### 4.2 Item Detail page (`/items/[id]`) — 4 tabs

**Overview tab:**
- Card: code, name, category, location, issue unit / sub unit, conversion factor
- Stock display: available / total (with progress bar toward min threshold)
- Status summary (for track_individually): available X, checked out Y, damaged Z, etc.
- Expiry alert (consumable with lots): list lots near expiry
- QR code display + print button
- Item image
- Action buttons: Dispense, Receive, Adjust (Admin/Staff), Report Damage (Admin/Staff)

**Sub-codes tab** (visible only when track_individually = true):
- Table: subCode, status badge, condition, last action
- Click row → expand details or inline edit status
- Batch status change: select multiple → change status

**History tab:**
- Timeline view (reverse chronological)
- Events: dispense, receive, adjust, status change, maintenance
- Each event: date, type icon, description, user, quantity change
- Filter by event type

**Maintenance tab** (visible only for category = FIXED_ASSET):
- Info card: serial number, model, purchase date, price, vendor, warranty end, maintenance cycle, last maintenance, next maintenance
- Status badge: ปกติ (green) / ใกล้ถึงรอบ (yellow, within 30 days) / เลยรอบ (red, past due)
- "บันทึก Maintenance" button → dialog form
- Maintenance history timeline: date, type, issue (if corrective), description, cost, performer, attachments

### 4.3 Report Damage / Lost dialog
- Triggered from Item Detail action button
- Form: new status dropdown (Lost / Damaged / Under Repair / Disposed), notes, image upload
- If track_individually = false → redirect to Adjust flow instead
- If track_individually = true → select sub-item → change status

### 4.4 Stock Adjustment dialog
- Triggered from Item Detail or Stock Check page
- Form: current qty (readonly), new qty, reason (dropdown), notes, image upload
- Calculate diff automatically
- Save → create StockAdjustment record + update item qty

### 4.5 API routes
```
GET  /api/items                    # list with filters
GET  /api/items/[id]               # detail with relations
POST /api/items/[id]/adjust        # stock adjustment
POST /api/items/[id]/status        # change status (damage/lost)
GET  /api/items/[id]/history       # timeline events
```

**Deliverable**: All Items list works with filters. Item Detail shows 4 tabs. Adjustment and damage report work. History timeline renders.

---

## Milestone 5: Dispense (ตัดเบิก)

### 5.1 Dispense page (`/dispense`)
- Full-screen item list: search bar + QR scan button
- Each row: code, name, category badge, available qty, [+] button
- Search: by code or name (debounced, server-side)
- QR scan: open camera → scan QR code → find item → add to cart

### 5.2 Add to cart flow
- Click [+] → quantity input dialog
  - If consumable: input qty (issue unit or sub unit with toggle), select lot (FIFO order — oldest expiry first)
  - If durable + track_individually: select sub-code(s) from popup
  - If durable + not track_individually: input qty
- Add to cart (client state: Zustand or React context)

### 5.3 Cart drawer (FAB)
- Floating Action Button bottom-right: cart icon + badge count
- Click → right drawer slides in (Sheet component)
- Cart items list: item name, qty, lot/sub-code, [remove] button
- Subject/Activity selector: dropdown or text input
- Confirm button → API call

### 5.4 Dispense API
```
POST /api/dispense
Body: {
  items: [{ itemId, subItemId?, quantity, quantitySub, lotId? }],
  subject: string,
  activity?: string,
  notes?: string
}
```
Transaction:
1. For consumable: deduct lot quantity + item availableQty
2. For durable (individual): update sub-item status to CHECKED_OUT
3. For durable (quantity): deduct item availableQty
4. Create DispenseRecord for each item
5. Create ItemStatusLog for status changes

### 5.5 Return action (durables)
- On Item Detail, for CHECKED_OUT durables, show "คืนแล้ว" button
- Click → confirm → update sub-item status back to AVAILABLE
- Update DispenseRecord.returnedAt

**Deliverable**: Staff can search/scan items, add to cart, select subject, confirm dispense. Consumable qty deducts. Durable status changes. Return button works.

---

## Milestone 6: Receive (รับของเข้า)

### 6.1 Receive page (`/receive`)
- Form-based, add multiple items in one session
- Item selector: search by code/name
- Per item:
  - Quantity (issue unit)
  - Lot number (required for consumable)
  - Expiry date (optional, shows only for consumable)
- Add row button → add another item
- Remove row button
- Save all → API call

### 6.2 Receive API
```
POST /api/receive
Body: {
  items: [{ itemId, quantity, lotNumber?, expiryDate? }],
  notes?: string
}
```
Transaction:
1. For consumable: find or create Lot → add quantity → update item totals
2. For durable (not individual): add to item totals
3. For durable (individual): create SubItem entries if new
4. Create ReceiveRecord for each item

**Deliverable**: Staff can receive multiple items at once. Lot tracking works for consumables. Item quantities update correctly.

---

## Milestone 7: Dashboard

### 7.1 Dashboard page (`/`) — 8 widgets

**Row 1: 4 metric cards**
1. Low Stock card: count of items where availableQty < minThreshold. Click → All Items filtered to low stock.
2. Near Expiry card: count of lots expiring within 3 months. Click → filter.
3. Overdue Maintenance card: count of fixed assets past nextMaintenanceDate. Click → filter.
4. Status Overview card: donut/pie chart — breakdown by status across all items.

**Row 2: 2 recent lists**
5. Recent Dispense: last 10 records. Columns: date, item, qty, staff, subject. Click row → item detail.
6. Recent Receive: last 5 records. Columns: date, item, qty, receiver.

**Row 3: analytics**
7. Top Dispensed This Month: bar chart (top 10 items by dispense quantity).
8. Usage by Subject/Activity: bar chart (usage grouped by subject/activity this month).

### 7.2 Dashboard API
```
GET /api/dashboard/summary          # low stock count, near expiry count, overdue maintenance count
GET /api/dashboard/status-overview  # status breakdown by category
GET /api/dashboard/recent-dispense  # last 10 dispense records
GET /api/dashboard/recent-receive   # last 5 receive records
GET /api/dashboard/top-dispense     # top items this month
GET /api/dashboard/usage-by-subject # usage grouped by subject/activity
```

### 7.3 All cards clickable
- Click metric → navigate to filtered All Items page
- Click list row → navigate to Item Detail
- Click chart segment → navigate to filtered view

**Deliverable**: Dashboard renders all 8 widgets with real data. Charts interactive. Links navigate correctly.

---

## Milestone 8: Reports

### 8.1 Reports page (`/reports`)
- 6 report types in tabs or card grid
- Each report: filter controls + data table + chart (where applicable) + export buttons

**Reports:**
1. **Stock Summary**: current stock levels by category. Filters: category, location. Table + bar chart.
2. **Dispense History**: all dispense records. Filters: date range, item, staff, subject. Table.
3. **Usage by Subject/Activity**: aggregated usage. Filters: date range, category. Table + bar chart.
4. **Near-Expiry / Low Stock**: items expiring soon or below threshold. Filters: category. Table.
5. **Annual Cost**: purchase price + repair costs aggregated. Filters: year, category. Table + pie chart.
6. **Damaged Assets**: items with status damaged/under-repair/disposed. Filters: date range, status. Table.
7. **Maintenance Schedule** (Fixed Asset): upcoming maintenance dates. Filters: date range, location, status (ปกติ/ใกล้ถึงรอบ/เลยรอบ). Table.
8. **Maintenance History**: all maintenance records. Filters: date range, type (preventive/corrective), item. Table.

### 8.2 Export
- CSV: generated server-side via Prisma query → csv string → download
- Excel: SheetJS (xlsx) → .xlsx file → download
- PDF: pdfkit → generated PDF → download
- Export button on each report table header

### 8.3 Report API routes
```
GET /api/reports/stock-summary
GET /api/reports/dispense-history
GET /api/reports/usage-by-subject
GET /api/reports/near-expiry-low-stock
GET /api/reports/annual-cost
GET /api/reports/damaged-assets
GET /api/reports/maintenance-schedule
GET /api/reports/maintenance-history

GET /api/reports/export?type=stock-summary&format=csv
GET /api/reports/export?type=stock-summary&format=xlsx
GET /api/reports/export?type=stock-summary&format=pdf
```

**Deliverable**: All reports render with filters. Charts display correctly. CSV/Excel/PDF export works.

---

## Milestone 9: QR Code System

### 9.1 QR generation
- Auto-generate QR code when item is created
- QR value = item code (plain text)
- Store QRCode record in DB
- Display QR in Item Detail Overview tab

### 9.2 QR scanning
- Use `html5-qrcode` library
- Scan button on Dispense page + All Items page
- Opens camera view → scan → parse code → find item → navigate or add to cart
- Fallback: manual search input

### 9.3 QR printing
- Print single QR from Item Detail
- Batch print from Settings > Items Master (select multiple → print all QRs)
- Print layout: QR code + item code + item name, sized for sticker labels

**Deliverable**: QR codes generated for all items. Scanning works on tablet/mobile. Print layout correct.

---

## Milestone 10: Alerts & Email

### 10.1 Alert checking service — ✅ DONE
- `lib/alerts.ts`: `getAlertCounts()` queries low stock, near-expiry, overdue maintenance
- `api/alerts/route.ts`: GET endpoint returns alert counts
- `hooks/use-alerts.tsx`: `AlertProvider` polls every 5 min, `useAlerts()` hook

### 10.2 Email notifications — ⏭️ SKIPPED (deferred)
- No cron job, no NodeMailer integration yet
- Will implement later when SMTP credentials are available

### 10.3 Dashboard alerts — ✅ DONE
- Dashboard widgets show alerts in real-time
- Alert counts available via context throughout the app
- Badge count on nav items if alerts exist

**Status**: Alert querying + dashboard display done. Email/cron deferred.

---

## Milestone 11: File Uploads

### 11.1 Upload API — ✅ DONE
- `POST /api/upload` — uses native `Request.formData()` (no multer needed in App Router)
- Validates file type (jpg/png/webp/pdf) and size (10MB max)
- Saves to `./uploads/` with UUID filename
- Returns `{ url: "/uploads/<uuid>.ext" }`

### 11.2 Usage points — ✅ DONE
- `FileUpload` shared component (`components/shared/file-upload.tsx`)
- Item image: Settings > Items Master > Stock & Location tab
- Damage evidence: Report Damage/Lost dialog
- Stock adjustment evidence: Adjust Stock dialog
- Maintenance attachment: Maintenance Record form (PDF, image)
- Item image display: Item Detail > Overview tab
- Attachment links: Maintenance history records

### 11.3 File serving — ✅ DONE
- `GET /uploads/[...path]` catch-all route with MIME type detection
- Path traversal protection
- Cache-Control: immutable, 1 year

**Deliverable**: File upload works for all usage points. Images display correctly. PDFs downloadable.

---

## Milestone 12: Polish & Testing

### 12.1 Responsive testing
- Tablet (primary): 768px - 1024px
- Mobile: 375px - 768px
- Desktop: 1024px+
- Test sidebar collapse, bottom tab, drawer, forms

### 12.2 Loading & error states
- Skeleton loaders for all data tables
- Error boundaries per page
- Toast notifications (sonner) for success/error actions
- Empty states with illustrations/messages

### 12.3 Accessibility
- Keyboard navigation
- Screen reader labels
- Focus management in dialogs/drawers

### 12.4 Performance
- Server-side pagination for all lists
- Debounced search
- Optimistic updates for common actions
- Image lazy loading

### 12.5 Integration testing
- Test full flows: login → dispense → check stock → receive → adjust → report
- Test role restrictions: instructor can't dispense, staff can't access settings
- Test edge cases: dispense more than available, duplicate lot numbers, expired items

### 12.6 Seed script for demo
- Realistic data: 50+ items, 100+ dispense records, lots, maintenance records
- Useful for demo to stakeholders

**Deliverable**: App works smoothly on tablet. All roles tested. No critical bugs.

---

## Implementation Order Summary

```
Week 1:  M0 (init) → M1 (schema) → M2 (auth & layout)
Week 2:  M3 (settings — items, categories, locations, users)
Week 3:  M4 (all items & detail) → M9 (QR codes, integrate with items)
Week 4:  M5 (dispense) → M6 (receive) → M11 (file uploads)
Week 5:  M7 (dashboard) → M8 (reports)
Week 6:  M10 (alerts & email) → M12 (polish & testing)
```

**Status: M0–M12 all DONE.** New milestones below based on grill session (2026-05-28).

---

## Milestone 13: Schema Overhaul — Category Rules, Location & Field Changes

Based on grill sessions (2026-05-28). See `CONTEXT.md` for full glossary.

### 13.1 Item field changes

| Change | Before | After | Reason |
|--------|--------|-------|--------|
| `name` | unclear language | Thai (primary display) | UI shows Thai names |
| `nameTh` → `nameEn` | `nameTh String?` | `nameEn String?` | field name was misleading |
| `model` | brand/model combined | keep as-is (brand+model combined) | CSV sometimes has brand only, sometimes both; search handles lookup |
| `serialNumber` | on Item | **move to SubItem** | each piece has different serial (e.g. Syringe Pump 1, 2, 3) |
| `vendor` | single String | → `vendorCompany`, `vendorContact`, `vendorPhone` | match CSV columns |
| `warrantyEndDate` | DateTime | → `warrantyMonths Int @default(0)` | CSV gives duration not date; compute endDate from purchaseDate |
| `storageRequirements` | n/a | add `storageRequirements String?` | for consumables |

### 13.2 SubItem changes
- Add `serialNumber String?` (moved from Item)
- Add `condition ItemCondition?` enum field (already exists in schema)

### 13.3 Location model change
- **Before**: `Location { room, cabinet, shelf }`
- **After**: `Location { building, floor, room, detail? }`
- `detail` = optional free-text (locker, ตู้ชั้น 4, เคาว์เตอร์หน้าห้อง, ตู้เย็น, Simman 1, ด้านหลังชั้น 5)
- Parsing: `"อาคาร 2 ชั้น 5"` → building=`อาคาร 2`, floor=`ชั้น 5`; `"501"` → room; `"Simman 1"` → detail
- Unique constraint: `[building, floor, room, detail]`

### 13.4 trackIndividually derived from Category
- FIXED_ASSET → always `true`
- CONSUMABLE → always `false`
- DURABLE → per-item choice (keep field)
- BOOK → always `true`
- Add validation in API: reject `trackIndividually=true` for CONSUMABLE, force `true` for FIXED_ASSET and BOOK

### 13.5 New CategoryType seed data

**FIXED_ASSET (12 types):**
- หุ่นสำหรับตรวจร่างกาย
- หุ่นทางสูติศาสตร์และนรีเวช
- ครุภัณฑ์ทางการแพทย์
- เครื่องมือทางอาชีวอนามัย
- หุ่นทางศัลยศาสตร์
- อุปกรณ์ทางออร์โธปิดิกส์
- หุ่นฝึกทักษะการทำหัตถการเฉพาะทาง
- หุ่นจำลองสถานการณ์ทางการพยาบาลขั้นสูง
- หุ่นจำลองสถานการณ์
- หุ่นฝึกช่วยฟื้นคืนชีพ
- อุปกรณ์อิเล็กทรอนิกส์
- โสตทัศนูปกรณ์

**DURABLE (3 types):**
- วัสดุคงทน
- ของเล่น — หมวดที่ 14: สื่อการสอน/ของเล่นส่งเสริมพัฒนาการ (trackIndividually: true)
- อุปกรณ์ประกอบวิชา

**CONSUMABLE (2 types):**
- วัสดุสิ้นเปลือง
- ยา

**BOOK (13 types):** หมวด 1–13 (see CONTEXT.md)

### 13.6 Item Status mapping (CSV → enum)

| CSV Thai | Enum |
|----------|------|
| พร้อมใช้งาน | AVAILABLE |
| ถูกใช้งาน | CHECKED_OUT |
| ชำรุด | DAMAGED |
| ส่งซ่อม | UNDER_REPAIR |
| แทงจำหน่าย | DISPOSED |
| สูญหาย | LOST |

### 13.7 Reference data from CSV (units)

**Issue units:** กล่อง, ถุง, ชิ้น, set, ชุด, ห่อ, เครื่อง, อัน, แผง, กระปุก
**Sub units:** ชิ้น, กรัม, อัน, เม็ด, ซีซี

**Deliverable**: Migration runs clean. All new fields, CategoryTypes, and Units seeded. Location uses building/floor/room/detail. trackIndividually enforced by category.

---

## Milestone 14: Kit / BOM System

### 14.1 KitComponent model
```prisma
model KitComponent {
  id              String  @id @default(cuid())
  kitItemId       String
  kitItem         Item    @relation("KitComponents", fields: [kitItemId], references: [id], onDelete: Cascade)
  componentItemId String
  componentItem   Item    @relation("KitComponentParts", fields: [componentItemId], references: [id], onDelete: Restrict)
  quantity        Int     // how many of this component per kit

  @@unique([kitItemId, componentItemId])
  @@map("kit_components")
}
```

### 14.2 Assemble / Disassemble API
```
POST /api/kits/[id]/assemble
Body: { quantity: int }
Transaction:
  1. For each KitComponent: check component has enough availableQty
  2. Deduct from each component's availableQty
  3. Add to kit's availableQty
  4. Create StockAdjustment records for audit trail

POST /api/kits/[id]/disassemble
Body: { quantity: int }
Transaction:
  1. Check kit has enough availableQty
  2. Deduct from kit's availableQty
  3. Add back to each component's availableQty
  4. Create StockAdjustment records for audit trail
```

### 14.3 Kit management UI
- In Settings > Items Master: mark item as "isKit" + add component picker
- Component picker: search items, set quantity per component
- On Item Detail for kits: show BOM table (component, qty per kit, current stock)
- Assemble/Disassemble buttons with quantity input
- Kit stock shown separately from component stock

### 14.4 Dispense with kit awareness
- When dispensing a kit: deduct kit stock only (components already deducted at assembly)
- When dispensing a component directly: deduct component stock only
- No cross-deduction at dispense time — BOM resolution happens at assemble/disassemble

**Deliverable**: Admin can define kits with components. Staff can assemble/disassemble kits. Stock moves correctly. Audit trail exists.

---

## Milestone 15: Real Data Import from CSV

### 15.1 Import order (by file)

**Phase 1 — FIXED_ASSET (trackIndividually, SubItem per piece):**
1. `วัสดุอุปกรณ์อิเล็กทรอนิกส์.csv` → ~105 rows, FIXED_ASSET
   - Each row = SubItem (iPad 1, iPad 2, VR 1, VR 2...)
   - Group by name → Item (strip trailing number)
   - Fields: brand+model → model, Serial No. → SubItem.serialNumber, gov tag → SubItem.serialNumber
2. `ครุภัณฑ์.csv` → ~594 rows, FIXED_ASSET
   - Each row = SubItem
   - Group by name → Item (strip trailing number)
   - Fields: ยี่ห้อ/รุ่น → model, หมายเลขครุภัณฑ์ → SubItem.serialNumber, รหัส NLU → SubItem.subCode
   - Vendor: ชื่อบริษัท → vendorCompany, ชื่อตัวแทน → vendorContact, เบอร์โทร → vendorPhone
   - warrantyMonths from `การรับประกันสินค้า` (parse "1 ปี" → 12)
   - purchasePrice from `ราคา`

**Phase 2 — BOOK (trackIndividually, copy = SubItem):**
3. `หนังสือ.csv` → ~236 rows, BOOK
   - Copies (suffix -c1, -c2) = same Item, different SubItem
   - No brand, serial, purchase info
   - CategoryType = หมวดที่ 1-13

**Phase 3 — DURABLE:**
4. `ของเล่น.csv` → ~210 rows, DURABLE + trackIndividually
   - Same pattern as books (copies → SubItem)
   - CategoryType = หมวดที่ 14
5. `บัญชีวัสดุคงทน.csv` → ~250 rows, DURABLE (quantity only)
   - code = SP001-SP250, qty from CSV
   - Notes contain kit info (skip for now, store as text)

**Phase 4 — CONSUMABLE:**
6. `วัสดุสิ้นเปลือง.csv` → ~194 items, CONSUMABLE
   - Import latest `คงเหลือ` as totalQty
   - Import quarterly history: `ซื้อเพิ่ม` → ReceiveRecord, `ใช้ไป` → DispenseRecord per quarter
   - Date: midpoint of quarter period

**Deferred:**
7. `อุปกรณ์นักศึกษายืมประกอบวิชา.csv` → DURABLE kit items — import with M14 (Kit/BOM)

### 15.2 Grouping logic (for trackIndividually items)
- Strip trailing number from name: "Syringe Pump 1" → Item "Syringe Pump", SubItem #1
- Copy suffix: "002-001-c1" → Item "002-001", SubItem "c1"
- Deduplicate Items by (name + categoryType + model)

### 15.3 Import script
- `npx tsx scripts/import-csv.ts` — one-time import
- Idempotent: skip if item code already exists
- Summary report: imported X items, Y sub-items, Z lots, errors
- Parse Thai dates: "11 ธันวาคม 2567" → DateTime

**Deliverable**: All real NLU data imported (except kits). App shows real items instead of demo data.

---

## Milestone 16: UI Updates for New Categories

### 16.1 Category-aware forms
- Item form: show/hide fields based on Category
  - FIXED_ASSET: show all fixed asset fields, force trackIndividually=true
  - DURABLE: show trackIndividually toggle
  - CONSUMABLE: show lot fields, show storage requirements, force trackIndividually=false
  - BOOK: force trackIndividually=true, no serial/brand fields

### 16.2 Category badges & filters
- Update category labels throughout app (Thai names + Category enum badge)
- Filter dropdowns group by Category type

### 16.3 Dispense flow updates
- FIXED_ASSET: must select specific SubItem
- BOOK: must select specific SubItem (copy c1, c2, c3)
- DURABLE (trackIndividually=true): must select specific SubItem (toy code)
- DURABLE (quantity): simple quantity input
- CONSUMABLE: lot selection + quantity

**Deliverable**: All forms respect category rules. UI shows correct fields per category type.

---

## Implementation Order (New Milestones)

```
Phase A:  M13 (schema overhaul — location, categories, trackIndividually, storage)
Phase B:  M15 (CSV import — get real data in to test with)
Phase C:  M14 (kit/BOM system)
Phase D:  M16 (UI updates for new categories)
```

## Key Decisions

1. **Settings first** — all other features depend on master data
2. **Prisma transactions** for stock operations (dispense/receive/adjust) to maintain data integrity
3. **FIFO lot selection** — auto-sort lots by expiry date, oldest first
4. **Server-side pagination** — never load all items client-side
5. **QR = item code** — simple, no encrypted payload needed
6. **jose JWT (no next-auth)** — custom auth with httpOnly cookie, lighter and more flexible
7. **File uploads local** — migrate to cloud storage (S3/Blob) for production
8. **Zod validation** on every API route input
9. **Category drives tracking** — trackIndividually derived from Category, not free choice
10. **Electronics = FIXED_ASSET** — iPads, VR, TVs have serial numbers and individual tracking
11. **Toys = DURABLE + trackIndividually** — individual codes but no serial/brand
12. **Books = BOOK + trackIndividually** — 13 sub-categories, each copy tracked
13. **Kit/BOM = assemble/disassemble** — stock moves between component and kit, not at dispense time
14. **Location = building/floor/room/detail** — matches real NLU building structure
15. **`name` = Thai, `nameEn` = English** — Thai is primary display language
16. **`model` combines brand+model** — single text field, search for lookup
17. **`serialNumber` on SubItem, not Item** — each piece has different serial
18. **Vendor split into 3 fields** — vendorCompany, vendorContact, vendorPhone (match CSV columns)
19. **`warrantyMonths` (Int) replaces `warrantyEndDate`** — CSV gives duration, compute endDate from purchaseDate
20. **Consumable quarterly history → ReceiveRecord/DispenseRecord** — import as actual transactions per quarter
21. **Kit/BOM import deferred** — after M14 implementation
