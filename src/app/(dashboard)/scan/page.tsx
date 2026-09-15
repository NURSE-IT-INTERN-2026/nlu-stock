"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QrScanner } from "@/components/shared/qr-scanner";
import { parseScannedCode } from "@/lib/constants";

// Where a borrower lands when they have no item in hand. They reach the app by scanning a
// label, so the only thing this page owes them is the way to scan the next one — a รายการพัสดุ
// to browse is what the flow deliberately does NOT have: staff pick from a list, borrowers
// scan what is already in front of them.
export default function ScanPage() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-6 py-12 text-center">
      <div className="grid size-20 place-items-center rounded-3xl bg-primary/10 text-primary">
        <QrCode className="size-10" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">สแกน QR บนพัสดุ</h2>
        <p className="text-sm text-muted-foreground">
          สแกนป้ายบนพัสดุเพื่อดูรายละเอียดและกดยืม
        </p>
      </div>

      <Card className="w-full">
        <CardContent className="px-4">
          <Button className="w-full" onClick={() => setOpen(true)}>
            <QrCode className="mr-1 size-4" />
            เปิดกล้องสแกน
          </Button>
        </CardContent>
      </Card>

      <QrScanner
        open={open}
        onClose={() => setOpen(false)}
        // The payload is a full URL on newly printed labels and a bare code on the ones
        // already stuck to shelves; parseScannedCode accepts both and pulls ?copy= out.
        onScan={(raw) => {
          const { code, copy } = parseScannedCode(raw);
          router.push(`/items/${encodeURIComponent(code)}${copy ? `?copy=${encodeURIComponent(copy)}` : ""}`);
        }}
      />
    </div>
  );
}
