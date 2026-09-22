import { copyText } from "../clipboard";
import { cellText, downloadCsv } from "../csv";
import type { CellValue, TablePayload } from "../types";

interface DataTableProps {
  title: string;
  eyebrow: string;
  table: TablePayload;
  filename: string;
  limit?: number;
  embedded?: boolean;
  /** 지정하면 행 클릭 시 해당 컬럼의 숫자 값을 클립보드에 복사 */
  copyColumn?: string;
}

function valueTone(value: CellValue) {
  const text = String(value ?? "");
  if (text.includes("공세") || text.includes("익절") || text.startsWith("매도")) return "tone-positive";
  if (text.includes("손절") || text.startsWith("매수")) return "tone-negative";
  if (text.includes("안전") || text.includes("보유중")) return "tone-muted";
  return "";
}

export function DataTable({ title, eyebrow, table, filename, limit = 100, embedded = false, copyColumn }: DataTableProps) {
  const visibleRows = limit > 0 ? table.rows.slice(-limit).reverse() : table.rows;

  const copyRowValue = (row: Record<string, CellValue>) => {
    if (!copyColumn) return;
    const value = row[copyColumn];
    if (typeof value !== "number") return;
    copyText(value.toFixed(2));
  };

  return (
    <section className={`table-card${embedded ? " embedded" : ""}`}>
      <header className="section-heading table-heading">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <div className="table-actions">
          <span>최근 {visibleRows.length.toLocaleString()}행 · 전체 {table.rows.length.toLocaleString()}행</span>
          <button type="button" onClick={() => downloadCsv(table, filename)} disabled={!table.rows.length}>DOWNLOAD CSV</button>
        </div>
      </header>
      <div className="table-scroll">
        {visibleRows.length ? (
          <table>
            <thead>
              <tr>{table.columns.map((column) => <th key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {visibleRows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={copyColumn ? "copyable" : ""}
                  title={copyColumn ? `클릭하면 ${copyColumn} 복사` : undefined}
                  onClick={() => copyRowValue(row)}
                >
                  {table.columns.map((column) => <td key={column} className={valueTone(row[column])}>{cellText(row[column])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty-table">NO DATA</div>}
      </div>
    </section>
  );
}
