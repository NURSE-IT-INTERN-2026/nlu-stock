"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-1 text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
        // Like `default`, but the fill is a sliding TabsIndicator painted in the caller's event
        // colour. Used by the report tabs, where each segment owns a colour that its table header
        // and cards reuse — the connected track reads as one switch, which free-standing pills
        // did not once they sat alone in a row. `relative` is what the indicator positions against.
        // overflow-x-auto: สี่ช่องกับป้ายไทยยาวๆ ไม่พอในรางเดียวบนจอ 320px — เลื่อนแนวนอน
        // ดีกว่าบีบตัวอักษรจนตกขอบราง
        // justify-start ทับ justify-center ของ base: flex ที่ justify-center แล้วเนื้อในล้น จะดัน
        // ส่วนเกินออกทั้งสองข้างเท่าๆ กัน ฝั่งซ้ายที่ล้นออกไปเลื่อนกลับมาไม่ได้ (scrollLeft ติดลบไม่ได้)
        // — ช่องแรกจึงหายไปจากจอถาวรพร้อมชิปที่เลือกอยู่ ทั้งที่ scrollLeft ยังเป็น 0
        // แถบ scrollbar ในรางสูง 32px กินที่จนอ่านเป็นเส้นขีดกลางปุ่ม ซ่อนไว้ — ช่องที่โผล่ครึ่งตัว
        // ริมขอบคือ affordance ที่บอกว่าเลื่อนได้อยู่แล้ว
        segment:
          "relative justify-start overflow-x-auto rounded-full bg-(--track) [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        // segment: the fill is the indicator sliding underneath, so the tab itself stays
        // transparent and only flips its label to --chip-fg (the event colour) against the
        // --chip card fill. The group-scoped selector is what outranks `data-active:bg-background`.
        // shrink-0 คู่กับ flex-1 ของ base: กว้างพอก็ยืดแบ่งเท่าๆ กันเต็มราง แคบไปก็ดันให้รางเลื่อน
        // แทนที่จะหดจนป้ายล้น
        "group-data-[variant=segment]/tabs-list:shrink-0 group-data-[variant=segment]/tabs-list:px-3 group-data-[variant=segment]/tabs-list:after:hidden",
        "group-data-[variant=segment]/tabs-list:data-active:border-transparent group-data-[variant=segment]/tabs-list:data-active:bg-transparent group-data-[variant=segment]/tabs-list:data-active:text-(--chip-fg) dark:group-data-[variant=segment]/tabs-list:data-active:border-transparent dark:group-data-[variant=segment]/tabs-list:data-active:bg-transparent dark:group-data-[variant=segment]/tabs-list:data-active:text-(--chip-fg)",
        className
      )}
      {...props}
    />
  )
}

/**
 * The moving fill behind the active tab of a `variant="segment"` list. Render it as the FIRST
 * child of the list: both it and the tabs are positioned, so the tabs must come later in the
 * DOM to paint their labels above it. Colour comes from `--chip` on the list.
 *
 * data-activation-direction is "none" until the user switches tabs, so keying the transition on
 * left/right is what keeps the first paint from sliding in from the edge.
 */
function TabsIndicator({ className, ...props }: TabsPrimitive.Indicator.Props) {
  return (
    <TabsPrimitive.Indicator
      data-slot="tabs-indicator"
      className={cn(
        "pointer-events-none absolute top-1 left-0 h-[calc(100%-0.5rem)] w-(--active-tab-width)",
        "translate-x-(--active-tab-left) rounded-full bg-(--chip) shadow-sm",
        "data-[activation-direction=left]:transition-[translate,width] data-[activation-direction=right]:transition-[translate,width] duration-200 ease-out",
        "motion-reduce:transition-none",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsIndicator, tabsListVariants }
