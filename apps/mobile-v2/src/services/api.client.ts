import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { ENV } from '../config/env';
import { useAuthStore } from '../stores/auth.store';

export const apiClient: AxiosInstance = axios.create({
  baseURL: ENV.apiUrl,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { accessToken } = useAuthStore.getState();
    if (accessToken) {
      config.headers = config.headers ?? {};
      config.headers['Authorization'] = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error: unknown) => Promise.reject(error)
);

let isRefreshing = false;
type QueueEntry = { resolve: (token: string) => void; reject: (reason: unknown) => void };
let failedQueue: QueueEntry[] = [];

function processQueue(error: unknown, token: string | null): void {
  failedQueue.forEach((entry) => {
    if (error) entry.reject(error);
    else entry.resolve(token!);
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: { response?: { status: number }; config: InternalAxiosRequestConfig & { _retry?: boolean } }) => {
    const originalRequest = error.config;
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers['Authorization'] = `Bearer ${token}`;
        return apiClient(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    const { refreshToken, setTokens, logout } = useAuthStore.getState();

    try {
      const response = await axios.post<{ data: { accessToken: string; refreshToken: string } }>(
        `${ENV.apiUrl}/auth/refresh`,
        { refreshToken }
      );
      const { accessToken: newAccess, refreshToken: newRefresh } = response.data.data;
      setTokens(newAccess, newRefresh);
      processQueue(null, newAccess);
      originalRequest.headers['Authorization'] = `Bearer ${newAccess}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      logout();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
