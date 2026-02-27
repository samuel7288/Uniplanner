import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const PAGE_MARGIN_MM = 8;

export function getCurrentSemesterLabel(date = new Date()): string {
  const year = date.getFullYear();
  const cycle = date.getMonth() < 6 ? "S1" : "S2";
  return `${year}-${cycle}`;
}

export function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/-+/g, "-");
}

export async function exportToPDF(element: HTMLElement, filename: string): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
  });

  const imageData = canvas.toDataURL("image/png");
  const orientation = canvas.width > canvas.height ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const printableWidth = pageWidth - PAGE_MARGIN_MM * 2;
  const printableHeight = pageHeight - PAGE_MARGIN_MM * 2;
  const imageHeight = (canvas.height * printableWidth) / canvas.width;

  let heightLeft = imageHeight;
  let positionY = PAGE_MARGIN_MM;

  pdf.addImage(imageData, "PNG", PAGE_MARGIN_MM, positionY, printableWidth, imageHeight);
  heightLeft -= printableHeight;

  while (heightLeft > 0) {
    pdf.addPage();
    positionY = PAGE_MARGIN_MM - (imageHeight - heightLeft);
    pdf.addImage(imageData, "PNG", PAGE_MARGIN_MM, positionY, printableWidth, imageHeight);
    heightLeft -= printableHeight;
  }

  pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
