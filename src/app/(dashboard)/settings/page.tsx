"use client";

import { useState } from "react";
import { CategoriesTab } from "@/components/settings/categories-tab";
import { LocationsTab } from "@/components/settings/locations-tab";
import { ItemsMasterTab } from "@/components/settings/items-master-tab";
import { UsersTab } from "@/components/settings/users-tab";
import { ImportTab } from "@/components/settings/import-tab";
import { Package, Tag, MapPin, Users, Upload } from "lucide-react";

const TABS = [
  { value: "items", label: "รายการพัสดุ", icon: Package, component: ItemsMasterTab },
  { value: "categories", label: "หมวดหมู่", icon: Tag, component: CategoriesTab },
  { value: "locations", label: "สถานที่", icon: MapPin, component: LocationsTab },
  { value: "users", label: "ผู้ใช้งาน", icon: Users, component: UsersTab },
  { value: "import", label: "นำเข้าข้อมูล", icon: Upload, component: ImportTab },
] as const;

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("items");

  return (
    <div className="space-y-0">
      {/* Page header */}
      <div className="pb-6">
        <h1 className="text-xl font-semibold tracking-tight">ตั้งค่าระบบ</h1>
        <p className="text-sm text-muted-foreground mt-1">จัดการพัสดุ หมวดหมู่ สถานที่ และผู้ใช้งาน</p>
      </div>

      {/* Horizontal tabs */}
      <div className="border-b mb-6">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map(({ value, label, icon: Icon }) => {
            const isActive = activeTab === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setActiveTab(value)}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content area */}
      <div>
        {TABS.map(({ value, component: Component }) => (
          <div key={value} className={activeTab === value ? "" : "hidden"}>
            <Component />
          </div>
        ))}
      </div>
    </div>
  );
}
