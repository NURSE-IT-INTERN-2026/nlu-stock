"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StockSummaryTab } from "@/components/reports/stock-summary-tab";
import { DispenseHistoryTab } from "@/components/reports/dispense-history-tab";
import { UsageBySubjectTab } from "@/components/reports/usage-by-subject-tab";
import { NearExpiryLowStockTab } from "@/components/reports/near-expiry-low-stock-tab";
import { AnnualCostTab } from "@/components/reports/annual-cost-tab";
import { DamagedAssetsTab } from "@/components/reports/damaged-assets-tab";
import { MaintenanceScheduleTab } from "@/components/reports/maintenance-schedule-tab";
import { MaintenanceHistoryTab } from "@/components/reports/maintenance-history-tab";
import {
  Package, ShoppingCart, Users, AlertTriangle, DollarSign,
  Wrench, Calendar, Clock,
} from "lucide-react";

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState("stock-summary");

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-muted/50 p-1">
          <TabsTrigger value="stock-summary" className="gap-1.5">
            <Package className="h-3.5 w-3.5" />
            Stock Summary
          </TabsTrigger>
          <TabsTrigger value="dispense-history" className="gap-1.5">
            <ShoppingCart className="h-3.5 w-3.5" />
            Dispense History
          </TabsTrigger>
          <TabsTrigger value="usage-by-subject" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Usage by Subject
          </TabsTrigger>
          <TabsTrigger value="near-expiry-low-stock" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Near-Expiry / Low Stock
          </TabsTrigger>
          <TabsTrigger value="annual-cost" className="gap-1.5">
            <DollarSign className="h-3.5 w-3.5" />
            Annual Cost
          </TabsTrigger>
          <TabsTrigger value="damaged-assets" className="gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            Damaged Assets
          </TabsTrigger>
          <TabsTrigger value="maintenance-schedule" className="gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            Maint. Schedule
          </TabsTrigger>
          <TabsTrigger value="maintenance-history" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Maint. History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stock-summary" className="mt-4">
          <StockSummaryTab />
        </TabsContent>
        <TabsContent value="dispense-history" className="mt-4">
          <DispenseHistoryTab />
        </TabsContent>
        <TabsContent value="usage-by-subject" className="mt-4">
          <UsageBySubjectTab />
        </TabsContent>
        <TabsContent value="near-expiry-low-stock" className="mt-4">
          <NearExpiryLowStockTab />
        </TabsContent>
        <TabsContent value="annual-cost" className="mt-4">
          <AnnualCostTab />
        </TabsContent>
        <TabsContent value="damaged-assets" className="mt-4">
          <DamagedAssetsTab />
        </TabsContent>
        <TabsContent value="maintenance-schedule" className="mt-4">
          <MaintenanceScheduleTab />
        </TabsContent>
        <TabsContent value="maintenance-history" className="mt-4">
          <MaintenanceHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
