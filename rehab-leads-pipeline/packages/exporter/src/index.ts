import * as XLSX from "xlsx";

export interface LeadRow {
  center_name: string;
  website: string;
  full_name: string;
  title: string;
  email: string;
  email_status: string;
  linkedin_url: string;
  organization: string;
}

export function buildWorkbook(leads: LeadRow[]): XLSX.WorkBook {
  const ws = XLSX.utils.json_to_sheet(leads);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  return wb;
}

export function toXlsxBuffer(leads: LeadRow[]): Buffer {
  const wb = buildWorkbook(leads);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function toCsvString(leads: LeadRow[]): string {
  const wb = buildWorkbook(leads);
  return XLSX.utils.sheet_to_csv(wb.Sheets["Leads"]!);
}
