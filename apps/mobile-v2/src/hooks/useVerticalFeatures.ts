import { useVerticalStore, VerticalFeatures } from '../stores/vertical.store';

export function useVerticalFeatures(): VerticalFeatures {
  return useVerticalStore((s) => s.features);
}
