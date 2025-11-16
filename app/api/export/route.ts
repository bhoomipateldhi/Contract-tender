import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

// Format date as d/m/Y (e.g., 15/3/2024)
function formatDateDMY(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return "";
  }
}

// Format date as text for Publication Date
function formatPublicationDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
  } catch {
    return "";
  }
}

// Escape CSV fields
function escapeCsvField(value: any): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // If field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function POST(req: Request) {
  const { items = [], format = "excel" } = await req.json();
  
  if (format === "json") return NextResponse.json(items);
  
  // CSV format matching opportunity-import-template.csv
  if (format === "csv") {
    const headers = [
      "Post Title",
      "Post Status", 
      "Opportunity Status",
      "Value",
      "NHS Organisation",
      "Supplier",
      "Document Link",
      "Document Number",
      "Publication Date",
      "Procurement Type",
      "Contract End Date"
    ];
    
    // Instruction row (row 2 of template)
    const instructionRow = [
      '"[Enter post title]"',
      '[publish/draft/pending]',
      '"[taxonomy - Use term slug or ID | Taxonomy: opportunity_type]"',
      '[number]',
      '"[relationship - Use post ID or post title | Post Types: nhs_organisation]"',
      '"[relationship - Use post ID or post title | Post Types: supplier]"',
      '"[url - Valid URL (http:// or https://)]"',
      '[text]',
      '[text]',
      '"[taxonomy - Use term slug or ID | Taxonomy: procurement_type]"',
      '"[date_picker - Date format: d/m/Y]"'
    ];
    
    const dataRows = items.map((item: any) => [
      escapeCsvField(item.title || ""),
      escapeCsvField("publish"),  // Default to publish status
      escapeCsvField(item.procurementStage || item.noticeType || ""),
      escapeCsvField(item.awardedValue || item.valueHigh || item.valueLow || ""),
      escapeCsvField(item.organisationName || ""),
      escapeCsvField(item.awardedSupplier || ""),
      escapeCsvField(item.link || ""),
      escapeCsvField(item.noticeIdentifier || item.id || ""),
      escapeCsvField(formatPublicationDate(item.publishedDate)),
      escapeCsvField(item.noticeType || ""),
      escapeCsvField(formatDateDMY(item.end || item.deadlineDate))
    ]);
    
    // Field metadata rows
    const metadataHeaders = [
      "Field Label",
      "Field Name", 
      "Field Key",
      "Field Type",
      "Required",
      "Instructions",
      "Additional Info"
    ];
    
    const metadataRows = [
      ['"Opportunity Status"', 'opportunity_status', 'field_6107d06549f14', 'taxonomy', 'No', '', '"taxonomy - Use term slug or ID | Taxonomy: opportunity_type"'],
      ['Value', 'value', 'field_6063072c297a8', 'number', 'No', '', 'number'],
      ['"NHS Organisation"', 'nhs_organisation', 'field_60643ead540e0', 'relationship', 'No', '"Choose which NHS Organisation(s) to associate with this Opportunity."', '"relationship - Use post ID or post title | Post Types: nhs_organisation"'],
      ['Supplier', 'supplier', 'field_6064a07470cb3', 'relationship', 'No', '"Choose which Supplier(s) to associate with this Opportunity."', '"relationship - Use post ID or post title | Post Types: supplier"'],
      ['"Document Link"', 'document_link', 'field_6081885a7393e', 'url', 'No', '', '"url - Valid URL (http:// or https://)"'],
      ['"Document Number"', 'document_number', 'field_6081888f7393f', 'text', 'No', '', 'text'],
      ['"Publication Date"', 'publication_date', 'field_608188b173940', 'text', 'No', '', 'text'],
      ['"Procurement Type"', 'procurement_type', 'field_64035cd6da4dd', 'taxonomy', 'No', '', '"taxonomy - Use term slug or ID | Taxonomy: procurement_type"'],
      ['"Contract End Date"', 'contract_end_date', 'field_66f2e8d742729', 'date_picker', 'No', '', '"date_picker - Date format: d/m/Y"']
    ];
    
    // Build CSV content with exact template structure
    const csvLines = [
      // UTF-8 BOM for Excel compatibility
      '\ufeff' + headers.map(h => `"${h}"`).join(","),
      instructionRow.join(","),
      // Data rows
      ...dataRows.map(row => row.join(",")),
      // Empty line before metadata section
      "",
      '"--- FIELD METADATA (DO NOT EDIT BELOW THIS LINE) ---"',
      "",
      metadataHeaders.map(h => `"${h}"`).join(","),
      ...metadataRows.map(row => row.join(","))
    ];
    
    const csvContent = csvLines.join("\n");
    
    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": 'attachment; filename="opportunities.csv"'
      }
    });
  }
  
  // Original Excel format
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Notices");
  ws.columns = [
    { header: "Title", key: "title" },
    { header: "Notice Type", key: "noticeType" },
    { header: "Status", key: "noticeStatus" },
    { header: "Source", key: "source" },
    { header: "Organisation", key: "organisationName" },
    { header: "CPV", key: "cpvCodes" },
    { header: "Value Low", key: "valueLow" },
    { header: "Value High", key: "valueHigh" },
    { header: "Awarded Value", key: "awardedValue" },
    { header: "Published", key: "publishedDate" },
    { header: "Deadline", key: "deadlineDate" },
    { header: "Link", key: "link" }
  ];
  items.forEach((i:any)=>ws.addRow(i));
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf, {
    headers: {
      "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":"attachment; filename=\"notices.xlsx\""
    }
  });
}
