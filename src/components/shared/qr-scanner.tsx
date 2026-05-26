"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Camera, Keyboard } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

export function QrScanner({ open, onClose, onScan }: Props) {
  const [manualMode, setManualMode] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const scannerRef = useRef<any>(null);
  const startedRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  onScanRef.current = onScan;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || manualMode) return;

    let cancelled = false;

    const stopScanner = async () => {
      if (scannerRef.current && startedRef.current) {
        try {
          await scannerRef.current.stop();
          scannerRef.current.clear();
        } catch {}
        scannerRef.current = null;
        startedRef.current = false;
      }
    };

    const start = async () => {
      if (startedRef.current) return;
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode("qr-reader");
        scannerRef.current = scanner;
        startedRef.current = true;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decoded: string) => {
            onScanRef.current(decoded);
            toast.success(`Scanned: ${decoded}`);
            stopScanner();
            onCloseRef.current();
          },
          () => {}
        );
      } catch {
        if (!cancelled) {
          toast.error("Cannot access camera. Use manual input.");
          setManualMode(true);
        }
      }
    };
    start();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [open, manualMode]);

  const handleManualSubmit = () => {
    const code = manualCode.trim();
    if (code) {
      onScan(code);
      setManualCode("");
      onClose();
    }
  };

  const handleClose = () => {
    setManualCode("");
    setManualMode(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Scan QR Code
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setManualMode(!manualMode)}
            >
              {manualMode ? <Camera className="h-4 w-4 mr-1" /> : <Keyboard className="h-4 w-4 mr-1" />}
              {manualMode ? "Camera" : "Manual"}
            </Button>
          </DialogTitle>
        </DialogHeader>

        {manualMode ? (
          <div className="space-y-3">
            <Input
              placeholder="Enter item code..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
              autoFocus
            />
            <Button className="w-full" onClick={handleManualSubmit} disabled={!manualCode.trim()}>
              Search
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div
              id="qr-reader"
              className="w-full min-h-[300px] rounded-lg overflow-hidden bg-muted"
            />
            <p className="text-xs text-center text-muted-foreground">
              Point camera at QR code on item
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
