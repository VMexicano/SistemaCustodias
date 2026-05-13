import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'auth-store' });

const mmkvStorage = {
  getItem: (name: string): string | null => storage.getString(name) ?? null,
  setItem: (name: string, value: string): void => storage.set(name, value),
  removeItem: (name: string): void => storage.delete(name),
};

export type UserRole = 'passenger' | 'driver';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  role: UserRole | null;
  setTokens: (access: string, refresh: string) => void;
  setUser: (userId: string, role: UserRole) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      userId: null,
      role: null,
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setUser: (userId, role) => set({ userId, role }),
      logout: () => set({ accessToken: null, refreshToken: null, userId: null, role: null }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);
