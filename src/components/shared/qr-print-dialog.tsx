"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer } from "lucide-react";
import QRCode from "qrcode";

export interface QrPrintItem {
  code: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  items: QrPrintItem[];
}

type LabelSize = "small" | "medium" | "large";

const LABEL_SIZES: Record<LabelSize, { width: number; height: number; qr: number; fontSize: number }> = {
  small: { width: 120, height: 80, qr: 60, fontSize: 8 },
  medium: { width: 180, height: 120, qr: 80, fontSize: 10 },
  large: { width: 240, height: 160, qr: 110, fontSize: 12 },
};

export function QrPrintDialog({ open, onClose, items }: Props) {
  const [size, setSize] = useState<LabelSize>("medium");
  const [qrImages, setQrImages] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!open || items.length === 0) return;

    const generate = async () => {
      const map = new Map<string, string>();
      for (const item of items) {
        if (!map.has(item.code)) {
          const url = await QRCode.toDataURL(item.code, {
            width: 200,
            margin: 1,
            color: { dark: "#000000", light: "#ffffff" },
          });
          map.set(item.code, url);
        }
      }
      setQrImages(map);
    };
    generate();
  }, [open, items]);

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;

    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const label = LABEL_SIZES[size];
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Labels</title>
        <style>
          @page { margin: 5mm; }
          body { margin: 0; padding: 5mm; }
          .grid {
            display: flex;
            flex-wrap: wrap;
            gap: 3mm;
          }
          .label {
            width: ${label.width}px;
            height: ${label.height}px;
            border: 1px solid #ccc;
            border-radius: 4px;
            display: flex;
            align-items: center;
            padding: 4px;
            gap: 4px;
            box-sizing: border-box;
            page-break-inside: avoid;
          }
          .label img {
            width: ${label.qr}px;
            height: ${label.qr}px;
            flex-shrink: 0;
          }
          .label-text {
            flex: 1;
            min-width: 0;
            overflow: hidden;
          }
          .label-code {
            font-family: monospace;
            font-size: ${label.fontSize}px;
            font-weight: bold;
            word-break: break-all;
          }
          .label-name {
            font-size: ${label.fontSize - 2}px;
            color: #555;
            word-break: break-word;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
        </style>
      </head>
      <body>
        <div class="grid">
          ${items
            .map((item) => {
              const img = qrImages.get(item.code) ?? "";
              return `
                <div class="label">
                  <img src="${img}" alt="QR" />
                  <div class="label-text">
                    <div class="label-code">${esc(item.code)}</div>
                    <div class="label-name">${esc(item.name)}</div>
                  </div>
                </div>`;
            })
            .join("")}
        </div>
      </body>
      </html>
    `);
    win.document.close();
    win.onload = () => {
      win.print();
    };
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Print QR Labels</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Label Size</Label>
            <Select value={size} onValueChange={(v) => setSize(v as LabelSize)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small (120 x 80 mm)</SelectItem>
                <SelectItem value="medium">Medium (180 x 120 mm)</SelectItem>
                <SelectItem value="large">Large (240 x 160 mm)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-sm text-muted-foreground">
            {items.length} label(s) will be printed
          </p>

          {/* Preview grid */}
          <div
            className="flex flex-wrap gap-2 border rounded-md p-3 bg-muted/30 max-h-[300px] overflow-y-auto"
          >
            {items.map((item) => (
              <div
                key={item.code}
                className="flex items-center gap-1.5 border rounded p-1.5 bg-white dark:bg-card"
                style={{
                  width: LABEL_SIZES[size].width * 0.5,
                }}
              >
                {qrImages.get(item.code) && (
                  <img
                    src={qrImages.get(item.code)}
                    alt="QR"
                    className="w-10 h-10 flex-shrink-0"
                  />
                )}
                <div className="min-w-0 text-[7px] leading-tight">
                  <div className="font-mono font-bold truncate">{item.code}</div>
                  <div className="text-muted-foreground truncate">{item.name}</div>
                </div>
              </div>
            ))}
          </div>

          <Button className="w-full" onClick={handlePrint} disabled={items.length === 0}>
            <Printer className="h-4 w-4 mr-1" />
            Print Labels
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
