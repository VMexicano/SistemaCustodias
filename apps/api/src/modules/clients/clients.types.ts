export interface Client {
  id: string;
  user_id: string;
  company_id: string | null;
  company_name: string | null;
  rfc: string | null;
  contact_name: string;
  credit_limit_mxn: string;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ClientDTO {
  id: string;
  userId: string;
  companyId: string | null;
  companyName: string | null;
  rfc: string | null;
  contactName: string;
  creditLimitMxn: number;
  createdAt: string;
}

export interface CreateClientInput {
  userId: string;
  companyId?: string;
  companyName?: string;
  rfc?: string;
  contactName: string;
  creditLimitMxn?: number;
}

export interface UpdateClientInput {
  companyName?: string;
  rfc?: string;
  contactName?: string;
  creditLimitMxn?: number;
}
