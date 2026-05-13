import { useState, useEffect } from 'react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar...',
  debounceMs = 300,
}: SearchInputProps) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    const t = setTimeout(() => onChange(local), debounceMs);
    return () => clearTimeout(t);
  }, [local, debounceMs, onChange]);

  return (
    <input
      type="text"
      className="border rounded px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
      placeholder={placeholder}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
    />
  );
}
