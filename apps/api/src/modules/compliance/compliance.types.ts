export interface ChainOfCustodyReport {
  reportId: string;
  generatedAt: string;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    custodyType: string;
    custodyTypeSlug: string;
    pickupAddress: Record<string, unknown>;
    deliveryAddress: Record<string, unknown>;
    notes: string | null;
    createdAt: string;
    completedAt: string | null;
  };
  client: {
    id: string;
    name: string;
    companyName: string | null;
    rfc: string | null;
  };
  team: {
    custodio: { id: string; name: string; licenseNumber: string | null } | null;
    copiloto: { id: string; name: string; licenseNumber: string | null } | null;
    vehicle: { id: string; plate: string; make: string | null; model: string; year: number } | null;
  };
  valueDeclaration: {
    custodyType: string;
    declaredValue: Record<string, unknown> | null;
    insurancePolicyId: string | null;
    verifiedAt: string | null;
    verifiedBy: string | null;
  } | null;
  transitions: TransitionRecord[];
  alerts: AlertRecord[];
  integrity: {
    hash: string;
    algorithm: 'sha256';
  };
}

export interface TransitionRecord {
  id: string;
  fromStatus: string;
  toStatus: string;
  actor: {
    id: string | null;
    role: string | null;
    name: string | null;
  };
  location: { lat: number; lng: number } | null;
  notes: string | null;
  hasSignature: boolean;
  signatureData: string | null;
  createdAt: string;
}

export interface AlertRecord {
  id: string;
  alertType: string;
  severity: string;
  description: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface SignatureRecord {
  id: string;
  fromStatus: string;
  toStatus: string;
  actor: {
    id: string | null;
    role: string | null;
    name: string | null;
  };
  signatureData: string;
  createdAt: string;
}
