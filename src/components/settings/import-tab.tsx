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
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Import Data</h3>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">1. Select Type & Download Template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Import Type</Label>
              <Select value={importType} onValueChange={(v) => { setImportType(v as ImportType); setPreview([]); setFile(null); setResult(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="items">Items</SelectItem>
                  <SelectItem value="categories">Categories</SelectItem>
                  <SelectItem value="locations">Locations</SelectItem>
                  <SelectItem value="sub-items">Sub-codes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-1" />Download Template
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">2. Upload CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="text-sm file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
              {file && <p className="text-xs text-muted-foreground mt-1">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
            </div>
            <Button onClick={handleImport} disabled={!file || importing} size="sm">
              <Upload className="h-4 w-4 mr-1" />
              {importing ? "Importing..." : "Import"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {preview.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Preview (first {preview.length} rows)
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
                ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                : <AlertCircle className="h-4 w-4 text-yellow-600" />}
              Import Result
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 mb-3">
              <Badge variant="default" className="bg-green-600">Imported: {result.imported}</Badge>
              {result.errors.length > 0 && <Badge variant="destructive">Errors: {result.errors.length}</Badge>}
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Error</TableHead>
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
