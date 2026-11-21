import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function exportCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
): void {
  const escape = (value: string | number): string => {
    const s = String(value ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const content = [headers, ...rows]
    .map((row) => row.map(escape).join(","))
    .join("\r\n");
  // Prepend UTF-8 BOM so Excel opens the file with correct encoding.
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  triggerDownload(filename, blob);
}

export function exportPdf(
  filename: string,
  title: string,
  headers: string[],
  rows: (string | number)[][],
): void {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(title, 14, 15);
  autoTable(doc, {
    startY: 20,
    head: [headers],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [219, 0, 17], textColor: 255 },
  });
  doc.save(filename);
}