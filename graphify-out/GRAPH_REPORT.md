# Graph Report - .  (2026-05-27)

## Corpus Check
- 195 files · ~161,785 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2263 nodes · 3527 edges · 60 communities (44 shown, 16 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 27 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Prisma Item Model|Prisma Item Model]]
- [[_COMMUNITY_Prisma DispenseRecord Model|Prisma DispenseRecord Model]]
- [[_COMMUNITY_API Route Handlers|API Route Handlers]]
- [[_COMMUNITY_Prisma Internal Namespace|Prisma Internal Namespace]]
- [[_COMMUNITY_Prisma User Model|Prisma User Model]]
- [[_COMMUNITY_Prisma ReceiveRecord Model|Prisma ReceiveRecord Model]]
- [[_COMMUNITY_Prisma Lot Model|Prisma Lot Model]]
- [[_COMMUNITY_Prisma ItemStatusLog Model|Prisma ItemStatusLog Model]]
- [[_COMMUNITY_Prisma SubItem Model|Prisma SubItem Model]]
- [[_COMMUNITY_Prisma MaintenanceRecord Model|Prisma MaintenanceRecord Model]]
- [[_COMMUNITY_Prisma StockAdjustment Model|Prisma StockAdjustment Model]]
- [[_COMMUNITY_Prisma CategoryType Model|Prisma CategoryType Model]]
- [[_COMMUNITY_Prisma Location Model|Prisma Location Model]]
- [[_COMMUNITY_Prisma Subject Model|Prisma Subject Model]]
- [[_COMMUNITY_Reports & Charts|Reports & Charts]]
- [[_COMMUNITY_Prisma Filter Types|Prisma Filter Types]]
- [[_COMMUNITY_Architecture Decisions|Architecture Decisions]]
- [[_COMMUNITY_Dashboard Charts|Dashboard Charts]]
- [[_COMMUNITY_Settings & Receive Pages|Settings & Receive Pages]]
- [[_COMMUNITY_UI Avatar & Popover|UI Avatar & Popover]]
- [[_COMMUNITY_Prisma Browser Enums|Prisma Browser Enums]]
- [[_COMMUNITY_Item Detail & Settings Tabs|Item Detail & Settings Tabs]]
- [[_COMMUNITY_Dispense Cart|Dispense Cart]]
- [[_COMMUNITY_Dashboard Tables & Pagination|Dashboard Tables & Pagination]]
- [[_COMMUNITY_Dashboard Widgets|Dashboard Widgets]]
- [[_COMMUNITY_Validation Schemas|Validation Schemas]]
- [[_COMMUNITY_Items List & History|Items List & History]]
- [[_COMMUNITY_Dashboard Layout & Navigation|Dashboard Layout & Navigation]]
- [[_COMMUNITY_UI Command & Dialog|UI Command & Dialog]]
- [[_COMMUNITY_UI Dropdown Menu|UI Dropdown Menu]]
- [[_COMMUNITY_ERD Generator|ERD Generator]]
- [[_COMMUNITY_Prisma Client Models|Prisma Client Models]]
- [[_COMMUNITY_UI Sheet & Bottom Tab|UI Sheet & Bottom Tab]]
- [[_COMMUNITY_UI Pagination|UI Pagination]]
- [[_COMMUNITY_UI Navigation Menu|UI Navigation Menu]]
- [[_COMMUNITY_Sub-Item Validators|Sub-Item Validators]]
- [[_COMMUNITY_Prisma Internal Class|Prisma Internal Class]]
- [[_COMMUNITY_Root Layout & Sonner|Root Layout & Sonner]]
- [[_COMMUNITY_UI Tooltip|UI Tooltip]]
- [[_COMMUNITY_Location Validators|Location Validators]]
- [[_COMMUNITY_Receive Validators|Receive Validators]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_Auth Layout|Auth Layout]]
- [[_COMMUNITY_Milestone 10|Milestone 10]]
- [[_COMMUNITY_Milestone 11|Milestone 11]]
- [[_COMMUNITY_Milestone 12|Milestone 12]]
- [[_COMMUNITY_Prisma Schema|Prisma Schema]]
- [[_COMMUNITY_File SVG Icon|File SVG Icon]]
- [[_COMMUNITY_Vercel SVG Logo|Vercel SVG Logo]]
- [[_COMMUNITY_Next.js SVG Logo|Next.js SVG Logo]]
- [[_COMMUNITY_Globe SVG Icon|Globe SVG Icon]]
- [[_COMMUNITY_Window SVG Icon|Window SVG Icon]]
- [[_COMMUNITY_AGENTS Next.js Rules|AGENTS Next.js Rules]]
- [[_COMMUNITY_Community 59|Community 59]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 138 edges
2. `json()` - 68 edges
3. `requireAuth()` - 47 edges
4. `Button()` - 32 edges
5. `requireAdmin()` - 29 edges
6. `error()` - 26 edges
7. `getSearchParams()` - 26 edges
8. `Badge()` - 23 edges
9. `parseBody()` - 21 edges
10. `Card()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `Requirement Summary (Sum requirement.md)` --semantically_similar_to--> `System Draft Diagram (ร่างระบบ.pdf)`  [INFERRED] [semantically similar]
  plan-nlu-stock/Requirement/Sum requirement.md → plan-nlu-stock/Requirement/ร่างระบบ.pdf
- `Manual FIFO Lot Selection` --implements--> `POST /api/dispense`  [INFERRED]
  plan-nlu-stock/docs/adr/0004-manual-fifo-lot-selection.md → src/app/api/dispense/route.ts
- `Key Implementation Decisions` --references--> `ADR 0003: Dual Unit System with Conversion Factor`  [INFERRED]
  plan.md → plan-nlu-stock/docs/adr/0003-dual-unit-system.md
- `No server-side lot auto-selection logic needed — simpler API` --implements--> `Dispense consumable with lot — decrement lot quantity and item availableQty with optimistic lock`  [EXTRACTED]
  plan-nlu-stock/docs/adr/0004-manual-fifo-lot-selection.md → src/app/api/dispense/route.ts
- `Key Implementation Decisions` --references--> `ADR 0001: Dual Tracking Model`  [INFERRED]
  plan.md → plan-nlu-stock/docs/adr/0001-dual-tracking-model.md

## Communities (60 total, 16 thin omitted)

### Community 0 - "Prisma Item Model"
Cohesion: 0.01
Nodes (181): AggregateItem, EnumItemStatusFieldUpdateOperationsInput, GetItemAggregateType, GetItemGroupByPayload, Item$adjustmentsArgs, Item$dispenseRecordsArgs, Item$locationArgs, Item$lotsArgs (+173 more)

### Community 1 - "Prisma DispenseRecord Model"
Cohesion: 0.01
Nodes (144): AggregateDispenseRecord, DispenseRecord$lotArgs, DispenseRecord$subItemArgs, DispenseRecord$subjectArgs, DispenseRecordAggregateArgs, DispenseRecordAvgAggregateInputType, DispenseRecordAvgAggregateOutputType, DispenseRecordAvgOrderByAggregateInput (+136 more)

### Community 2 - "API Route Handlers"
Cohesion: 0.06
Nodes (80): POST(), GET(), GET(), POST(), DAMAGE_STATUSES, GET(), GET(), POST() (+72 more)

### Community 3 - "Prisma Internal Namespace"
Cohesion: 0.02
Nodes (124): Args, At, AtLeast, AtLoose, AtStrict, BatchPayload, Boolean, BooleanFieldRefInput (+116 more)

### Community 4 - "Prisma User Model"
Cohesion: 0.02
Nodes (120): AggregateUser, BoolFieldUpdateOperationsInput, DateTimeFieldUpdateOperationsInput, EnumRoleFieldUpdateOperationsInput, GetUserAggregateType, GetUserGroupByPayload, Prisma__UserClient, StringFieldUpdateOperationsInput (+112 more)

### Community 5 - "Prisma ReceiveRecord Model"
Cohesion: 0.02
Nodes (112): AggregateReceiveRecord, GetReceiveRecordAggregateType, GetReceiveRecordGroupByPayload, Prisma__ReceiveRecordClient, ReceiveRecord$lotArgs, ReceiveRecordAggregateArgs, ReceiveRecordAvgAggregateInputType, ReceiveRecordAvgAggregateOutputType (+104 more)

### Community 6 - "Prisma Lot Model"
Cohesion: 0.02
Nodes (108): AggregateLot, GetLotAggregateType, GetLotGroupByPayload, Lot$dispenseRecordsArgs, Lot$receiveRecordsArgs, LotAggregateArgs, LotAvgAggregateInputType, LotAvgAggregateOutputType (+100 more)

### Community 7 - "Prisma ItemStatusLog Model"
Cohesion: 0.02
Nodes (106): AggregateItemStatusLog, GetItemStatusLogAggregateType, GetItemStatusLogGroupByPayload, ItemStatusLog$subItemArgs, ItemStatusLogAggregateArgs, ItemStatusLogCountAggregateInputType, ItemStatusLogCountAggregateOutputType, ItemStatusLogCountArgs (+98 more)

### Community 8 - "Prisma SubItem Model"
Cohesion: 0.02
Nodes (102): AggregateSubItem, GetSubItemAggregateType, GetSubItemGroupByPayload, Prisma__SubItemClient, SubItem$dispenseRecordsArgs, SubItem$statusLogsArgs, SubItemAggregateArgs, SubItemCountAggregateInputType (+94 more)

### Community 9 - "Prisma MaintenanceRecord Model"
Cohesion: 0.02
Nodes (101): AggregateMaintenanceRecord, EnumMaintenanceResultFieldUpdateOperationsInput, EnumMaintenanceTypeFieldUpdateOperationsInput, GetMaintenanceRecordAggregateType, GetMaintenanceRecordGroupByPayload, MaintenanceRecordAggregateArgs, MaintenanceRecordAvgAggregateInputType, MaintenanceRecordAvgAggregateOutputType (+93 more)

### Community 10 - "Prisma StockAdjustment Model"
Cohesion: 0.02
Nodes (97): AggregateStockAdjustment, EnumAdjustmentReasonFieldUpdateOperationsInput, GetStockAdjustmentAggregateType, GetStockAdjustmentGroupByPayload, Prisma__StockAdjustmentClient, StockAdjustmentAggregateArgs, StockAdjustmentAvgAggregateInputType, StockAdjustmentAvgAggregateOutputType (+89 more)

### Community 11 - "Prisma CategoryType Model"
Cohesion: 0.02
Nodes (81): AggregateCategoryType, CategoryType$itemsArgs, CategoryTypeAggregateArgs, CategoryTypeAvgAggregateInputType, CategoryTypeAvgAggregateOutputType, CategoryTypeAvgOrderByAggregateInput, CategoryTypeCountAggregateInputType, CategoryTypeCountAggregateOutputType (+73 more)

### Community 12 - "Prisma Location Model"
Cohesion: 0.03
Nodes (73): AggregateLocation, GetLocationAggregateType, GetLocationGroupByPayload, Location$itemsArgs, LocationAggregateArgs, LocationCountAggregateInputType, LocationCountAggregateOutputType, LocationCountArgs (+65 more)

### Community 13 - "Prisma Subject Model"
Cohesion: 0.03
Nodes (72): AggregateSubject, GetSubjectAggregateType, GetSubjectGroupByPayload, Prisma__SubjectClient, Subject$dispenseRecordsArgs, SubjectAggregateArgs, SubjectCountAggregateInputType, SubjectCountAggregateOutputType (+64 more)

### Community 14 - "Reports & Charts"
Cohesion: 0.11
Nodes (42): Props, Subject, ItemData, Props, Props, Props, STATUS_OPTIONS, SubItemOption (+34 more)

### Community 15 - "Prisma Filter Types"
Cohesion: 0.04
Nodes (55): BoolFilter, BoolWithAggregatesFilter, DateTimeFilter, DateTimeNullableFilter, DateTimeNullableWithAggregatesFilter, DateTimeWithAggregatesFilter, EnumAdjustmentReasonFilter, EnumAdjustmentReasonWithAggregatesFilter (+47 more)

### Community 16 - "Architecture Decisions"
Cohesion: 0.08
Nodes (45): StockSummaryChart(), UsageBySubjectChart(), columns, DamagedAssetsTab(), filterConfig, Row, statusColors, columns (+37 more)

### Community 17 - "Dashboard Charts"
Cohesion: 0.06
Nodes (37): DashboardBarCharts(), TopDispenseData, UsageSubjectData, DashboardCharts(), DispenseRecord, ReceiveRecord, TopDispenseData, UsageSubjectData (+29 more)

### Community 18 - "Settings & Receive Pages"
Cohesion: 0.07
Nodes (37): AnnualCostChart(), AnnualCostChartProps, AnnualCostData, StockSummaryChartProps, StockSummaryData, UsageBySubjectChartProps, UsageBySubjectData, STATUS_LABELS (+29 more)

### Community 19 - "UI Avatar & Popover"
Cohesion: 0.08
Nodes (50): ADR 0001: Dual Tracking Model, ADR 0002: Phase 1 Dispensing Includes Durables, ADR 0003: Dual Unit System with Conversion Factor, jose JWT Auth Strategy, Stock Adjustment, Consumable (สิ้นเปลือง), Dispense (ตัดเบิก), Dual Unit System (Issue Unit + Sub Unit) (+42 more)

### Community 20 - "Prisma Browser Enums"
Cohesion: 0.08
Nodes (33): CategoryType, ItemData, LocationType, LotType, SubItemType, ItemDetailHistory(), Props, TimelineEvent (+25 more)

### Community 21 - "Item Detail & Settings Tabs"
Cohesion: 0.06
Nodes (30): CategoryTypeScalarFieldEnum, DispenseRecordScalarFieldEnum, ItemScalarFieldEnum, ItemStatusLogScalarFieldEnum, LocationScalarFieldEnum, LotScalarFieldEnum, MaintenanceRecordScalarFieldEnum, ModelName (+22 more)

### Community 22 - "Dispense Cart"
Cohesion: 0.14
Nodes (22): Pagination(), RecentDispenseRecord, RecentDispenseTableProps, RecentReceiveRecord, RecentReceiveTableProps, Props, STATUS_OPTIONS, STATUS_VARIANTS (+14 more)

### Community 23 - "Dashboard Tables & Pagination"
Cohesion: 0.11
Nodes (25): cn(), Avatar(), AvatarBadge(), AvatarFallback(), AvatarGroup(), AvatarGroupCount(), AvatarImage(), CardAction() (+17 more)

### Community 24 - "Dashboard Widgets"
Cohesion: 0.1
Nodes (22): Stock adjust computes newTotal = shelfCount + checkedOut (tracked: count CHECKED_OUT sub-items, non-tracked: totalQty - availableQty), Stock adjust creates ItemStatusLog even when status unchanged, recording qty change in reason, INSTRUCTOR role blocked from stock adjustment, POST /api/items/[id]/adjust, Stock adjust rejects request if shelf count equals current availableQty, ADJUSTMENT_REASONS hardcoded in dialog (LOST, DAMAGED_PENDING_REPAIR, COUNT_MISMATCH, DISPOSAL, OTHER), Dialog shows computed newTotal preview with delta coloring (green for increase, red for decrease), Dispense uses Prisma $transaction for atomic multi-item dispensing (+14 more)

### Community 25 - "Validation Schemas"
Cohesion: 0.12
Nodes (18): Command(), CommandDialog(), CommandEmpty(), CommandGroup(), CommandInput(), CommandItem(), CommandList(), CommandSeparator() (+10 more)

### Community 26 - "Items List & History"
Cohesion: 0.15
Nodes (14): CartContext, CartProvider(), CartState, useCart(), CartDrawer(), DispenseContent(), SearchItem, QuantityDialog() (+6 more)

### Community 27 - "Dashboard Layout & Navigation"
Cohesion: 0.12
Nodes (9): DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut(), DropdownMenuSubContent() (+1 more)

### Community 28 - "UI Command & Dialog"
Cohesion: 0.15
Nodes (12): Category, MaintenanceResult, MaintenanceType, Role, CategoryCreateInput, categoryCreateSchema, CategoryUpdateInput, categoryUpdateSchema (+4 more)

### Community 29 - "UI Dropdown Menu"
Cohesion: 0.19
Nodes (12): arrows, descLines, elements, els, excalidraw, fs, makeArrow(), makeRect() (+4 more)

### Community 30 - "ERD Generator"
Cohesion: 0.14
Nodes (13): CategoryType, DispenseRecord, Item, ItemStatusLog, Location, Lot, MaintenanceRecord, PrismaClient (+5 more)

### Community 31 - "Prisma Client Models"
Cohesion: 0.19
Nodes (10): BottomTabProps, tabs, Sheet(), SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay() (+2 more)

### Community 32 - "UI Sheet & Bottom Tab"
Cohesion: 0.27
Nodes (9): PaginationProps, Pagination(), PaginationContent(), PaginationEllipsis(), PaginationItem(), PaginationLink(), PaginationLinkProps, PaginationNext() (+1 more)

### Community 33 - "UI Pagination"
Cohesion: 0.22
Nodes (9): NavigationMenu(), NavigationMenuContent(), NavigationMenuIndicator(), NavigationMenuItem(), NavigationMenuLink(), NavigationMenuList(), NavigationMenuPositioner(), NavigationMenuTrigger() (+1 more)

### Community 34 - "UI Navigation Menu"
Cohesion: 0.2
Nodes (9): AdjustmentReason, ItemCreateInput, itemCreateSchema, ItemUpdateInput, itemUpdateSchema, StatusChangeInput, statusChangeSchema, StockAdjustInput (+1 more)

### Community 35 - "Sub-Item Validators"
Cohesion: 0.29
Nodes (4): config, LogOptions, PrismaClient, PrismaClientConstructor

### Community 36 - "Prisma Internal Class"
Cohesion: 0.29
Nodes (4): PopoverContent(), PopoverDescription(), PopoverHeader(), PopoverTitle()

### Community 37 - "Root Layout & Sonner"
Cohesion: 0.29
Nodes (6): SubItemBatchCreateInput, subItemBatchCreateSchema, SubItemCreateInput, subItemCreateSchema, SubItemUpdateInput, subItemUpdateSchema

### Community 38 - "UI Tooltip"
Cohesion: 0.4
Nodes (3): metadata, sarabun, Toaster()

### Community 40 - "Receive Validators"
Cohesion: 0.4
Nodes (4): LocationCreateInput, locationCreateSchema, LocationUpdateInput, locationUpdateSchema

## Knowledge Gaps
- **1737 isolated node(s):** `config`, `eslintConfig`, `nextConfig`, `fs`, `tables` (+1732 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Dashboard Tables & Pagination` to `UI Sheet & Bottom Tab`, `UI Pagination`, `Prisma Internal Class`, `Location Validators`, `Reports & Charts`, `Architecture Decisions`, `Dashboard Charts`, `Settings & Receive Pages`, `Prisma Browser Enums`, `Dispense Cart`, `Validation Schemas`, `Dashboard Layout & Navigation`, `Prisma Client Models`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `Button()` connect `Reports & Charts` to `UI Sheet & Bottom Tab`, `Architecture Decisions`, `Dashboard Charts`, `Settings & Receive Pages`, `Prisma Browser Enums`, `Dispense Cart`, `Dashboard Tables & Pagination`, `Validation Schemas`, `Items List & History`, `Prisma Client Models`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `Card()` connect `Settings & Receive Pages` to `Reports & Charts`, `Architecture Decisions`, `Dashboard Charts`, `Dispense Cart`, `Dashboard Tables & Pagination`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **What connects `config`, `eslintConfig`, `nextConfig` to the rest of the system?**
  _1737 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Prisma Item Model` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Prisma DispenseRecord Model` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `API Route Handlers` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._