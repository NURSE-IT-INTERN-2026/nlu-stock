"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Download, Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { importRows } from "@/lib/api";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ImportType = "items" | "categories" | "locations" | "sub-items";

const COLUMN_REF: Record<ImportType, { required: string[]; optional: string[]; sample: Record<string, string> }> = {
  items: {
    required: ["code", "name", "category"],
    optional: ["nameEn", "trackIndividually", "issueUnit", "subUnit", "conversionFactor", "minThreshold", "building", "floor", "room", "detail", "description"],
    sample: { code: "NLU-CON-001", name: "ปากกาลูกลื่น", category: "CON", issueUnit: "ชิ้น", conversionFactor: "1", minThreshold: "10" },
  },
  categories: {
    required: ["name", "category"],
    optional: ["description", "sortOrder"],
    sample: { name: "วัสดุสิ้นเปลือง", category: "CON", sortOrder: "1" },
  },
  locations: {
    required: ["building", "floor", "room"],
    optional: ["detail"],
    sample: { building: "อาคาร A", floor: "ชั้น 1", room: "ห้อง 101", detail: "ตู้ 1" },
  },
  "sub-items": {
    required: ["itemCode", "subCode"],
    optional: ["condition", "notes"],
    sample: { itemCode: "ITM001", subCode: "ITM001-01", condition: "Good", notes: "" },
  },
};

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return row;
  });
}

export function ImportTab() {
  const [importType, setImportType] = useState<ImportType>("items");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: { row: number; message: string }[] } | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      setPreview(rows.slice(0, 5));
      if (rows.length > 0) setHeaders(Object.keys(rows[0]));
    };
    reader.readAsText(f);
  }, []);

  async function downloadTemplate() {
    try {
      const res = await fetch(`/api/settings/import?type=${importType}`);
      if (!res.ok) { toast.error("Failed to download template"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${importType}-template.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download template");
    }
  }

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setResult(null);

    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length === 0) {
      toast.error("No data rows found");
      setImporting(false);
      return;
    }

    try {
      const data = await importRows(importType, rows);
      setResult(data as { imported: number; errors: { row: number; message: string }[] });
      toast.success(`Imported ${data.imported} rows`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
    setImporting(false);
  }

  return (
    <div className="flex flex-col gap-5">

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">1. เลือกประเภทและดาวน์โหลดแม่แบบ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>ประเภทข้อมูล</Label>
              <Select value={importType} onValueChange={(v) => { setImportType(v as ImportType); setPreview([]); setFile(null); setResult(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="items">พัสดุ</SelectItem>
                  <SelectItem value="categories">หมวดหมู่</SelectItem>
                  <SelectItem value="locations">สถานที่</SelectItem>
                  <SelectItem value="sub-items">รหัสย่อย</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-1" />ดาวน์โหลดแม่แบบ
            </Button>
            {/* Column reference */}
            {COLUMN_REF[importType] && (
              <div className="rounded-lg bg-muted/40 border border-border/40 p-3 space-y-2 text-xs">
                <p className="font-medium text-foreground">Columns ที่ต้องมี</p>
                <div className="flex flex-wrap gap-1">
                  {COLUMN_REF[importType].required.map((col) => (
                    <code key={col} className="rounded bg-primary/10 text-primary px-1.5 py-0.5 font-mono text-[11px]">{col} *</code>
                  ))}
                  {COLUMN_REF[importType].optional.map((col) => (
                    <code key={col} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{col}</code>
                  ))}
                </div>
                <p className="text-muted-foreground">ตัวอย่าง: <code className="font-mono text-foreground/80">{Object.entries(COLUMN_REF[importType].sample).map(([k, v]) => `${k}:${v}`).join(", ")}</code></p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">2. อัปโหลดไฟล์ CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <label
                htmlFor="csv-file-input"
                className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-sm text-muted-foreground hover:border-primary/40 hover:bg-muted/50 transition-colors w-full justify-center"
              >
                <Upload className="h-4 w-4 shrink-0" />
                <span>{file ? file.name : "คลิกเพื่อเลือกไฟล์ CSV"}</span>
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>
              {file && <p className="text-xs text-muted-foreground">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
            </div>
            <Button onClick={handleImport} disabled={!file || importing} size="sm">
              <Upload className="h-4 w-4 mr-1" />
              {importing ? "กำลังนำเข้า..." : "นำเข้าข้อมูล"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {preview.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Preview (ดูตัวอย่าง {preview.length} แถวแรก)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    {headers.map((h) => <TableHead key={h}>{h}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      {headers.map((h) => <TableCell key={h}>{row[h]}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              {result.errors.length === 0
                ? <CheckCircle2 className="h-4 w-4 text-success" />
                : <AlertCircle className="h-4 w-4 text-warning" />}
              ผลการนำเข้าข้อมูล
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 mb-3">
              <Badge variant="default" className="bg-success">นำเข้าแล้ว: {result.imported}</Badge>
              {result.errors.length > 0 && <Badge variant="destructive">ผิดพลาด: {result.errors.length}</Badge>}
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>แถว</TableHead>
                      <TableHead>ข้อผิดพลาด</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.errors.map((err, i) => (
                      <TableRow key={i}>
                        <TableCell>{err.row}</TableCell>
                        <TableCell className="text-destructive">{err.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
