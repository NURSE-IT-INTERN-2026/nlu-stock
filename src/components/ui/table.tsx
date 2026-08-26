"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// The report tables' look — column rules + zebra rows — as descendant selectors, so a table
// opts in with one prop instead of every th/td carrying border classes.
// ponytail: CSS-only on purpose. Structure (expandable rows, server pagination, mobile card
// lists) stays where it is; only the skin is shared.
const gridSkin = [
  "[&_th]:border-r [&_th]:border-border/70 [&_th:last-child]:border-r-0",
  "[&_td]:border-r [&_td]:border-border/60 [&_td:last-child]:border-r-0",
].join(" ")

// Separate from `grid`: a table whose tbody holds expanded detail rows has to stripe by data
// index, not by nth-child, or the extra rows flip the parity mid-list.
// :where() zeroes the selector's specificity so this lands at the same weight as a class on the
// row. Without it the descendant selector outranks TableRow's hover:/selected: backgrounds and
// the row stops reacting to the pointer.
const zebraSkin = "[&_:where(tbody_tr:nth-child(even))]:bg-muted/25"

function Table({
  className,
  grid,
  zebra,
  ...props
}: React.ComponentProps<"table"> & { grid?: boolean; zebra?: boolean }) {
  // table-fixed fits at md+ → overflow-visible: no scrollbar, and avoids the
  // overflow-x:auto→computed overflow-y:auto gotcha that hijacks sticky headers.
  const compact = className?.includes("table-fixed");
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full", compact ? "overflow-x-auto md:overflow-visible" : "overflow-x-auto")}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", grid && gridSkin, zebra && zebraSkin, className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({
  className,
  sticky,
  ...props
}: React.ComponentProps<"thead"> & { sticky?: boolean }) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "[&_tr]:border-b",
        // Sticks the row, not the thead — thead sticky is still uneven across browsers.
        // Needs its own background or body rows show through while scrolling.
        sticky &&
          "[&>tr]:sticky [&>tr]:top-0 [&>tr]:z-10 [&>tr]:bg-card [&>tr]:shadow-[0_1px_3px_rgba(0,0,0,0.08)]",
        className
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        // Datagrid density: 32px header and 32px rows. Height on th/td, never on tr —
        // a height on the row would drag the header row up to the body row's height too.
        "h-8 px-2 py-0 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        // h-8 เป็น "พื้นขั้นต่ำ" ไม่ใช่เพดาน — เซลล์ที่มีชิปหรือปุ่มข้างในยังดันแถวสูงขึ้นเองตามเนื้อหา.
        // เดิมเป็น h-9 (36px) ทั้งที่ข้อความบรรทัดเดียวสูงจริง 30.9px (line-height 22.86 + py-1)
        // ทุกแถวจึงลอยอยู่บนพื้นที่ว่าง 5px ที่ไม่มีอะไรอยู่ — วัดจากตารางออกจากคลัง 20/20 แถว
        // ติดพื้น h-9 พอดีเป๊ะ แปลว่าไม่มีแถวไหนต้องการความสูงนั้นเลย
        "h-8 px-2 py-1 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
