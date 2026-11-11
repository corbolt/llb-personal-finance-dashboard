import { formatAmount } from "@/lib/money";

/** The table twin of a chart: one row per x position, one column per series. */
export function DataTable({
  caption,
  rowHeader,
  columns,
  rows,
}: {
  caption: string;
  /** Heading of the first column, e.g. "Month". */
  rowHeader: string;
  columns: string[];
  rows: Array<{ label: string; values: Array<number | null> }>;
}) {
  return (
    <table className="w-full text-[13px]">
      <caption className="sr-only">{caption}</caption>
      <thead className="sticky top-0 bg-surface text-left text-ink-2">
        <tr className="border-b border-hairline">
          <th scope="col" className="py-2 pr-4 font-medium">
            {rowHeader}
          </th>
          {columns.map((column) => (
            <th key={column} scope="col" className="py-2 pl-4 text-right font-medium">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-b border-hairline last:border-0">
            <th scope="row" className="py-1.5 pr-4 text-left font-normal text-ink-2">
              {row.label}
            </th>
            {row.values.map((value, index) => (
              <td key={index} className="py-1.5 pl-4 text-right text-ink tabular">
                {value === null ? "–" : formatAmount(value)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
