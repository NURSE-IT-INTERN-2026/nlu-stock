"use client";

import { useEffect, useRef, useState } from "react";
import type { BarcodeDetector, BarcodeDetectorOptions } from "barcode-detector/ponyfill";
import {
  DIALOG_SHELL,
  DIALOG_BODY,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Camera, Keyboard } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

type DetectorCtor = new (options?: BarcodeDetectorOptions) => BarcodeDetector;

/**
 * Chrome และ Android ที่นี่คือเครื่องที่สแกนของจริง ทั้งคู่มี BarcodeDetector ในตัว
 * browser อยู่แล้ว — ใช้ของ native ก็ไม่ต้องโหลดอะไรเพิ่มเลยสักไบต์. Safari ยังไม่มี
 * เลยดึง ponyfill (zxing-wasm) มาเฉพาะตอนที่ไม่มีของ native จริงๆ ไม่ให้ iPhone
 * ตกไปเหลือแค่พิมพ์รหัสมือ
 */
async function loadDetector(): Promise<BarcodeDetector> {
  const native = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  const Ctor = native ?? (await import("barcode-detector/ponyfill")).BarcodeDetector;
  return new Ctor({ formats: ["qr_code"] });
}

const SCAN_INTERVAL_MS = 150;

export function QrScanner({ open, onClose, onScan }: Props) {
  const [manualMode, setManualMode] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open || manualMode) return;

    let cancelled = false;
    let stream: MediaStream | null = null;

    const stopCamera = () => {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    };

    const start = async () => {
      try {
        const [detector, media] = await Promise.all([
          loadDetector(),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }),
        ]);
        stream = media;
        // dialog อาจปิดไปแล้วระหว่างรอ permission prompt — ถ้าไม่เช็ค กล้องจะค้างเปิดทิ้งไว้
        if (cancelled) return stopCamera();

        const video = videoRef.current;
        if (!video) return stopCamera();
        video.srcObject = media;
        await video.play();

        // วนแบบ await ต่อกันไปเรื่อยๆ แทน setInterval เพราะ detect() เป็น async —
        // ถ้าเครื่องช้ากว่า interval งานจะซ้อนกันจนกล้องหน่วง
        while (!cancelled) {
          try {
            const [hit] = await detector.detect(video);
            if (hit) {
              stopCamera();
              onScanRef.current(hit.rawValue);
              toast.success(`สแกนสำเร็จ: ${hit.rawValue}`);
              onCloseRef.current();
              return;
            }
          } catch {
            // เฟรมที่อ่านไม่ออกเป็นเรื่องปกติของการสแกน ไม่ใช่ error ที่ต้องบอกใคร
          }
          await new Promise((r) => setTimeout(r, SCAN_INTERVAL_MS));
        }
      } catch {
        stopCamera();
        if (!cancelled) {
          toast.error("เข้าถึงกล้องไม่ได้ กรุณาพิมพ์รหัสด้วยตนเอง");
          setManualMode(true);
        }
      }
    };
    start();

    return () => {
      cancelled = true;
      stopCamera();
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
      {/* Fixed: the body swaps between a 300px camera and the manual-code form. */}
      <DialogContent className={cn(DIALOG_SHELL, "sm:max-w-md")}>
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center justify-between">
            สแกน QR Code
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setManualMode(!manualMode)}
            >
              {manualMode ? <Camera className="h-4 w-4 mr-1" /> : <Keyboard className="h-4 w-4 mr-1" />}
              {manualMode ? "กล้อง" : "พิมพ์รหัส"}
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className={cn(DIALOG_BODY, "px-1")}>
        {manualMode ? (
          <div className="space-y-3">
            <Input
              placeholder="กรอกรหัสพัสดุ..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
              autoFocus
            />
            <Button className="w-full" onClick={handleManualSubmit} disabled={!manualCode.trim()}>
              ค้นหา
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <video
              ref={videoRef}
              // playsInline กันไม่ให้ iOS ยึดวิดีโอไปเล่นเต็มจอทับ dialog
              playsInline
              muted
              className="w-full min-h-[300px] rounded-lg bg-muted object-cover"
            />
            <p className="text-xs text-center text-muted-foreground">
              นำกล้องไปที่ QR Code บนพัสดุ
            </p>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
