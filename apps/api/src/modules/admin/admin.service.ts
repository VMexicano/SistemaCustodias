import type { AdminRepository, GetListFilters, AdminStats, AdminTripRow, AdminDriverRow, AdminUserRow, SystemErrorLog, PaginatedResult } from './admin.repository.js';

// ---------------------------------------------------------------------------
// AdminService
// ---------------------------------------------------------------------------

export class AdminService {
  constructor(private readonly adminRepo: AdminRepository) {}

  async getStats(): Promise<AdminStats> {
    return this.adminRepo.getStats();
  }

  async getTrips(filters: GetListFilters): Promise<PaginatedResult<AdminTripRow>> {
    return this.adminRepo.getTrips(filters);
  }

  async getDrivers(filters: GetListFilters): Promise<PaginatedResult<AdminDriverRow>> {
    return this.adminRepo.getDrivers(filters);
  }

  async updateDriverStatus(driverId: string, status: string): Promise<void> {
    return this.adminRepo.updateDriverStatus(driverId, status);
  }

  async getUsers(filters: GetListFilters): Promise<PaginatedResult<AdminUserRow>> {
    return this.adminRepo.getUsers(filters);
  }

  async searchUserByPhone(phone: string): Promise<AdminUserRow[]> {
    return this.adminRepo.searchUserByPhone(phone);
  }

  async getErrors(resolved: boolean): Promise<SystemErrorLog[]> {
    return this.adminRepo.getErrors(resolved);
  }

  async resolveError(id: string): Promise<SystemErrorLog> {
    return this.adminRepo.resolveError(id);
  }
}
