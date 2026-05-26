import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";

export function toCsv(
  data: Record<string, unknown>[],
  filename: string,
): Response {
  if (data.length === 0) {
    return new Response("", {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          const str = val === null || val === undefined ? "" : String(val);
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(","),
    ),
  ];

  return new Response(csvRows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}

export function toXlsx(
  data: Record<string, unknown>[],
  filename: string,
  sheetName = "Report",
): Response {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
    },
  });
}

export async function toPdf(
  columns: { key: string; header: string; width: number }[],
  data: Record<string, unknown>[],
  filename: string,
  title: string,
): Promise<Response> {
  const colWidths = columns.map((c) => c.width);
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const pageWidth = Math.max(totalWidth + 40, 595);
  const margin = 20;

  const pdfBuffer = await new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: [pageWidth, 842],
      margins: { top: margin, bottom: margin, left: margin, right: margin },
      bufferPages: true,
    });

    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const rowHeight = 22;
    const headerHeight = 26;
    let y = margin;

    doc.fontSize(16).font("Helvetica-Bold").text(title, margin, y, {
      width: pageWidth - margin * 2,
      align: "center",
    });
    y += 30;

    function drawHeader() {
      doc.rect(margin, y, pageWidth - margin * 2, headerHeight)
        .fill("#f0f0f0")
        .stroke();
      let x = margin + 4;
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#333");
      for (const col of columns) {
        doc.text(col.header, x, y + 6, { width: col.width - 8, lineBreak: false });
        x += col.width;
      }
      y += headerHeight;
    }

    drawHeader();

    for (const row of data) {
      if (y + rowHeight > 820) {
        doc.addPage();
        y = margin;
        drawHeader();
      }
      let x = margin + 4;
      doc.fontSize(8).font("Helvetica").fillColor("#555");
      for (const col of columns) {
        const val = row[col.key];
        const str = val === null || val === undefined ? "" : String(val);
        doc.text(str, x, y + 5, { width: col.width - 8, lineBreak: false });
        x += col.width;
      }
      y += rowHeight;
    }

    doc.end();
  });

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
    },
  });
}
