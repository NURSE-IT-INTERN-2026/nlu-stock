"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Pagination } from "./pagination";
import { USAGE_TYPE_LABELS } from "@/lib/constants";

interface RecentDispenseRecord {
  id: string;
  dispensedAt: string;
  quantity: number;
  item: { id: string; code: string; name: string };
  staff: { name: string };
  usageType: string | null;
  usageNote: string | null;
}

interface RecentDispenseTableProps {
  data: RecentDispenseRecord[];
}

const PAGE_SIZE = 5;

export function RecentDispenseTable({ data }: RecentDispenseTableProps) {
  const router = useRouter();
  const [page, setPage] = useState(1);

  const sliced = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-foreground">
          Recent Dispense
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No records</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="hidden sm:table-cell">Staff</TableHead>
                  <TableHead className="hidden md:table-cell">Usage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sliced.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/items/${r.item.id}`)}
                  >
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground font-light">
                      {format(new Date(r.dispensedAt), "dd MMM HH:mm")}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="font-mono text-foreground font-semibold underline decoration-primary/30 underline-offset-2">{r.item.code}</span>{" "}
                      <span className="hidden sm:inline text-foreground/80 font-medium">{r.item.name}</span>
                    </TableCell>
                    <TableCell className="text-right text-sm text-foreground font-bold">{r.quantity}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-foreground/80 font-medium">{r.staff.name}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground font-light">
                      {r.usageType ? USAGE_TYPE_LABELS[r.usageType] ?? r.usageType : <span className="text-muted-foreground/50">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination page={page} total={data.length} pageSize={PAGE_SIZE} onChange={setPage} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
