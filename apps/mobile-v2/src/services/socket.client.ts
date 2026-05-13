import { io, Socket } from 'socket.io-client';
import { ENV } from '../config/env';
import { useAuthStore } from '../stores/auth.store';

export type SocketNamespace = 'passenger' | 'driver';

const sockets: Partial<Record<SocketNamespace, Socket>> = {};

export function getSocket(namespace: SocketNamespace): Socket {
  const existing = sockets[namespace];
  if (existing?.connected) return existing;

  const { accessToken } = useAuthStore.getState();

  const socket = io(`${ENV.socketUrl}/${namespace}`, {
    auth: { token: accessToken },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  sockets[namespace] = socket;
  return socket;
}

export function disconnectSocket(namespace?: SocketNamespace): void {
  if (namespace) {
    sockets[namespace]?.disconnect();
    delete sockets[namespace];
  } else {
    (Object.values(sockets) as Socket[]).forEach((s) => s.disconnect());
    Object.keys(sockets).forEach((k) => delete sockets[k as SocketNamespace]);
  }
}
