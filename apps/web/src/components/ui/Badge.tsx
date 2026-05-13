

type BadgeVariant = 'green' | 'red' | 'yellow' | 'blue' | 'gray';

const variantClasses: Record<BadgeVariant, string> = {
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  blue: 'bg-blue-100 text-blue-800',
  gray: 'bg-gray-100 text-gray-700',
};

export interface BadgeProps {
  variant: BadgeVariant;
  label: string;
}

export function Badge({ variant, label }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variantClasses[variant]}`}>
      {label}
    </span>
  );
}
