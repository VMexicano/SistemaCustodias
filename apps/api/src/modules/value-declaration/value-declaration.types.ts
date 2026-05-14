export interface ValueDeclaration {
  id: string;
  order_id: string;
  custody_type_id: string;
  declared_value: Record<string, unknown>;
  insurance_policy_id: string | null;
  verified_by: string | null;
  verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ValueDeclarationDTO {
  id: string;
  orderId: string;
  custodyTypeId: string;
  declaredValue: Record<string, unknown>;
  insurancePolicyId: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustodyType {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  value_declaration_schema: Record<string, unknown>;
  active: boolean;
  created_at: Date;
}

export interface CustodyTypeDTO {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  valueDeclarationSchema: Record<string, unknown>;
}

export interface UpsertDeclarationInput {
  orderId: string;
  actorUserId: string;
  declaredValue: Record<string, unknown>;
  insurancePolicyId?: string;
}
