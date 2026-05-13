

interface PaginationProps {
  page: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, total, limit, onChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex items-center gap-3 text-sm text-gray-600">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-gray-50 transition-colors"
      >
        Anterior
      </button>
      <span>
        {page} / {totalPages}
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-gray-50 transition-colors"
      >
        Siguiente
      </button>
      <span className="ml-2 text-gray-400">{total} registros</span>
    </div>
  );
}
