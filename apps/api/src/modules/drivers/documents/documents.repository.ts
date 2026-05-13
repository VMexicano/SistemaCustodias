import type { Database } from '../../../config/database.js';

export interface DocumentRequirement {
  id: string;
  region_id: string;
  code: string;
  name: string;
  description: string | null;
  required: boolean;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface DriverDocument {
  id: string;
  driver_id: string;
  requirement_id: string;
  file_url: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  rejection_reason: string | null;
  expires_at: Date | null;
  reviewed_at: Date | null;
  reviewed_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UpsertDocumentData {
  driverId: string;
  requirementId: string;
  fileUrl: string;
  expiresAt?: Date;
}

export class DocumentsRepository {
  constructor(private readonly db: Database) {}

  async findRequirementsByRegion(regionId: string): Promise<DocumentRequirement[]> {
    return this.db<DocumentRequirement>('document_requirements')
      .where({ region_id: regionId, active: true })
      .orderBy('name');
  }

  async findRequirementById(id: string): Promise<DocumentRequirement | undefined> {
    return this.db<DocumentRequirement>('document_requirements')
      .where({ id, active: true })
      .first();
  }

  async findByDriver(driverId: string): Promise<DriverDocument[]> {
    return this.db<DriverDocument>('driver_documents')
      .where({ driver_id: driverId });
  }

  async findById(id: string): Promise<DriverDocument | undefined> {
    return this.db<DriverDocument>('driver_documents')
      .where({ id })
      .first();
  }

  /**
   * Upsert: insert a new document or replace if one already exists for
   * the same (driver_id, requirement_id) pair.
   */
  async upsert(data: UpsertDocumentData): Promise<DriverDocument> {
    const rows = await this.db<DriverDocument>('driver_documents')
      .insert({
        driver_id: data.driverId,
        requirement_id: data.requirementId,
        file_url: data.fileUrl,
        expires_at: data.expiresAt ?? null,
        status: 'pending',
        rejection_reason: null,
        reviewed_at: null,
        reviewed_by: null,
      })
      .onConflict(['driver_id', 'requirement_id'])
      .merge({
        file_url: data.fileUrl,
        expires_at: data.expiresAt ?? null,
        status: 'pending',
        rejection_reason: null,
        reviewed_at: null,
        reviewed_by: null,
        updated_at: this.db.fn.now(),
      })
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Failed to upsert document: no row returned');
    return row;
  }

  async update(
    id: string,
    data: Partial<Pick<DriverDocument, 'status' | 'rejection_reason' | 'reviewed_at' | 'reviewed_by'>>,
  ): Promise<DriverDocument> {
    const rows = await this.db<DriverDocument>('driver_documents')
      .where({ id })
      .update({ ...data, updated_at: this.db.fn.now() })
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Failed to update document: no row returned');
    return row;
  }

  /**
   * Returns the count of required documents and how many are approved
   * for a given driver. Used to check auto-approval condition (R-DRV-003).
   */
  async countRequiredApproved(
    driverId: string,
    regionId: string,
  ): Promise<{ total: number; approved: number }> {
    // Total required docs for this region
    const totalRow = await this.db('document_requirements')
      .where({ region_id: regionId, required: true, active: true })
      .count<{ count: string }>('id as count')
      .first();

    // Approved required docs for this driver
    const approvedRow = await this.db('driver_documents as dd')
      .join('document_requirements as dr', 'dd.requirement_id', 'dr.id')
      .where('dd.driver_id', driverId)
      .where('dr.required', true)
      .where('dr.active', true)
      .where('dd.status', 'approved')
      .count<{ count: string }>('dd.id as count')
      .first();

    return {
      total: parseInt(totalRow?.count ?? '0', 10),
      approved: parseInt(approvedRow?.count ?? '0', 10),
    };
  }

  /**
   * Checks if a driver has any required document that is expired.
   */
  async hasExpiredRequiredDocs(driverId: string, regionId: string): Promise<boolean> {
    const now = new Date();
    const row = await this.db('driver_documents as dd')
      .join('document_requirements as dr', 'dd.requirement_id', 'dr.id')
      .where('dd.driver_id', driverId)
      .where('dr.required', true)
      .where('dr.active', true)
      .where('dd.expires_at', '<=', now)
      .first();

    return !!row;
  }
}
