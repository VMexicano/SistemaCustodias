// Shared types across apps — populated in Sprint 2+
export type UUID = string;
export type ISODateString = string;

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
};
