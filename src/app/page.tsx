import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, AlertTriangle, Wrench, BarChart3 } from "lucide-react";

export default async function DashboardPage() {
  const now = new Date();
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const [lowStockRows, nearExpiry, overdueMaint, totalItems] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) FROM items WHERE "availableQty" < "minThreshold" AND "isActive" = true
    `,
    prisma.lot.count({
      where: { expiryDate: { gte: now, lte: in90Days } },
    }),
    prisma.item.count({
      where: { nextMaintenanceDate: { lt: now }, isActive: true },
    }),
    prisma.item.count({ where: { isActive: true } }),
  ]);

  const lowStock = Number(lowStockRows[0]?.count ?? 0);

  const cards = [
    { title: "Low Stock", value: lowStock, icon: AlertTriangle, color: "text-orange-500" },
    { title: "Near Expiry", value: nearExpiry, icon: Package, color: "text-info-500" },
    { title: "Overdue Maintenance", value: overdueMaint, icon: Wrench, color: "text-danger-500" },
    { title: "Total Items", value: totalItems, icon: BarChart3, color: "text-teal-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{card.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
