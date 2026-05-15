import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useCustodyAlertCount(): number {
  const { data = [] } = useQuery<{ id: string }[]>({
    queryKey: ['custody-alerts-count'],
    queryFn: () => api.get<{ id: string }[]>('/alerts?resolved=false'),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  return data.length;
}
