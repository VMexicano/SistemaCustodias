import { act } from 'react';
import { useAuthStore } from '../../stores/auth.store';

function getStore() {
  return useAuthStore.getState();
}

beforeEach(() => {
  act(() => {
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      userId: null,
      role: null,
    });
  });
});

describe('auth.store', () => {
  it('estado inicial es null en todos los campos', () => {
    const s = getStore();
    expect(s.accessToken).toBeNull();
    expect(s.refreshToken).toBeNull();
    expect(s.userId).toBeNull();
    expect(s.role).toBeNull();
  });

  it('setTokens almacena access y refresh token', () => {
    act(() => getStore().setTokens('access-123', 'refresh-456'));
    const s = getStore();
    expect(s.accessToken).toBe('access-123');
    expect(s.refreshToken).toBe('refresh-456');
  });

  it('setUser almacena userId y role passenger', () => {
    act(() => getStore().setUser('user-1', 'passenger'));
    const s = getStore();
    expect(s.userId).toBe('user-1');
    expect(s.role).toBe('passenger');
  });

  it('setUser almacena userId y role driver', () => {
    act(() => getStore().setUser('user-2', 'driver'));
    expect(getStore().role).toBe('driver');
  });

  it('logout limpia todos los campos', () => {
    act(() => {
      getStore().setTokens('access-123', 'refresh-456');
      getStore().setUser('user-1', 'passenger');
      getStore().logout();
    });
    const s = getStore();
    expect(s.accessToken).toBeNull();
    expect(s.refreshToken).toBeNull();
    expect(s.userId).toBeNull();
    expect(s.role).toBeNull();
  });

  it('setTokens no afecta userId ni role', () => {
    act(() => {
      getStore().setUser('user-1', 'driver');
      getStore().setTokens('new-access', 'new-refresh');
    });
    const s = getStore();
    expect(s.userId).toBe('user-1');
    expect(s.role).toBe('driver');
  });

  it('setUser no afecta tokens', () => {
    act(() => {
      getStore().setTokens('tok-a', 'tok-r');
      getStore().setUser('user-2', 'passenger');
    });
    const s = getStore();
    expect(s.accessToken).toBe('tok-a');
    expect(s.refreshToken).toBe('tok-r');
  });
});
