import type { CellValue, TablePayload } from "./types";

export function cellText(value: CellValue) {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  if (typeof value === "boolean") return value ? "ON" : "OFF";
  return String(value);
}

export function downloadCsv(table: TablePayload, filename: string) {
  const escape = (value: CellValue) => `"${cellText(value).replaceAll('"', '""')}"`;
  const lines = [
    table.columns.map((column) => escape(column)).join(","),
    ...table.rows.map((row) => table.columns.map((column) => escape(row[column])).join(",")),
  ];
  const blob = new Blob(["﻿", lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
