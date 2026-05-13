

export interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => React.ReactNode;
  width?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

export function Table<T extends object>({
  columns,
  data,
  loading,
  emptyMessage = 'Sin datos',
  onRowClick,
}: TableProps<T>) {
  if (loading) {
    return (
      <div className="w-full p-4 space-y-2 animate-pulse">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded" />
        ))}
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-gray-500">
          {columns.map((col) => (
            <th
              key={String(col.key)}
              className="px-4 py-3 font-medium"
              style={col.width ? { width: col.width } : undefined}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400">
              {emptyMessage}
            </td>
          </tr>
        ) : (
          data.map((row, i) => (
            <tr
              key={i}
              className={`border-b ${onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td key={String(col.key)} className="px-4 py-3">
                  {col.render
                    ? col.render(row)
                    : String((row as Record<string, unknown>)[String(col.key)] ?? '')}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
