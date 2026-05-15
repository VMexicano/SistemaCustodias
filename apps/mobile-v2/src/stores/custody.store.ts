import { create } from 'zustand';

export interface CustodyType {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  valueDeclarationSchema: Record<string, unknown>;
}

export interface AddressValue {
  street: string;
  city: string;
  state: string;
  lat?: number;
  lng?: number;
}

export interface NewOrderDraft {
  custodyTypeId: string;
  custodyTypeName: string;
  valueDeclarationSchema: Record<string, unknown>;
  pickupAddress?: AddressValue;
  deliveryAddress?: AddressValue;
}

interface CustodyState {
  activeOrderId: string | null;
  draft: Partial<NewOrderDraft>;
  setActiveOrderId: (id: string | null) => void;
  setDraft: (patch: Partial<NewOrderDraft>) => void;
  clearDraft: () => void;
}

export const useCustodyStore = create<CustodyState>()((set) => ({
  activeOrderId: null,
  draft: {},
  setActiveOrderId: (id) => set({ activeOrderId: id }),
  setDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  clearDraft: () => set({ draft: {}, activeOrderId: null }),
}));
