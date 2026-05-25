"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface SubItemRecord {
  id: string;
  subCode: string;
  status: string;
  condition: string | null;
  notes: string | null;
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  AVAILABLE: "default",
  CHECKED_OUT: "secondary",
  DAMAGED: "destructive",
  UNDER_REPAIR: "secondary",
  LOST: "destructive",
  DISPOSED: "destructive",
  PENDING_MAINTENANCE: "secondary",
};

interface Props {
  subItems: SubItemRecord[];
}

export function ItemDetailSubcodes({ subItems }: Props) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sub-code</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Condition</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subItems.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                No sub-codes
              </TableCell>
            </TableRow>
          ) : subItems.map((sub) => (
            <TableRow key={sub.id}>
              <TableCell className="font-mono text-sm">{sub.subCode}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANTS[sub.status] || "secondary"}>
                  {sub.status.replace(/_/g, " ")}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">{sub.condition || "-"}</TableCell>
              <TableCell className="text-sm max-w-[200px] truncate">{sub.notes || "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
