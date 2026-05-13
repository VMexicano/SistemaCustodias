import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface VerticalFeatures {
  scheduling: boolean;
  multiStop: boolean;
  cargoDeclaration: boolean;
  chainOfCustody: boolean;
  temperatureLog: boolean;
  b2bAccounts: boolean;
  pricingModel: string;
}

export interface VerticalConfig {
  slug: string;
  name: string;
  features: VerticalFeatures;
}

export function useVerticalConfig() {
  return useQuery<VerticalConfig>({
    queryKey: ['vertical-config'],
    queryFn: () => api.get<VerticalConfig>('/config'),
    staleTime: 5 * 60 * 1000,
  });
}
