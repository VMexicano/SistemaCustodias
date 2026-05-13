import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface PendingApprovalTrip {
  id: string;
  passenger_id: string;
  passenger_phone: string;
  origin_address: string;
  destination_address: string;
  estimated_fare: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  wait_minutes: number;
}

export interface PendingApprovalsResponse {
  data: PendingApprovalTrip[];
  total: number;
  limit: number;
  offset: number;
}

export function usePendingApprovals(limit = 20, offset = 0) {
  const { data, isLoading } = useQuery<PendingApprovalsResponse>({
    queryKey: ['pending-approvals', limit, offset],
    queryFn: () =>
      api.get<PendingApprovalsResponse>(
        `/admin/trips/pending-approval?limit=${limit}&offset=${offset}`,
      ),
    staleTime: 30_000,
  });

  return {
    data: data?.data ?? [],
    total: data?.total ?? 0,
    isLoading,
  };
}
