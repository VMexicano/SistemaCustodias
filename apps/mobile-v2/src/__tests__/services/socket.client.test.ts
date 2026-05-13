// Factory self-contained — no external variable references
jest.mock('socket.io-client', () => {
  const socket = {
    connected: false,
    disconnect: jest.fn(),
    on: jest.fn(),
    emit: jest.fn(),
  };
  return { io: jest.fn(() => socket), __socket: socket };
});

jest.mock('../../config/env', () => ({
  ENV: { apiUrl: 'http://test-api', socketUrl: 'http://test-socket' },
}));

jest.mock('../../stores/auth.store', () => ({
  useAuthStore: { getState: jest.fn(() => ({ accessToken: 'test-token' })) },
}));

type SocketIOMock = {
  io: jest.Mock;
  __socket: { connected: boolean; disconnect: jest.Mock; on: jest.Mock; emit: jest.Mock };
};

type SocketClientModule = typeof import('../../services/socket.client');

let getSocket: SocketClientModule['getSocket'];
let disconnectSocket: SocketClientModule['disconnectSocket'];
let socketIo: SocketIOMock;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();

  socketIo = require('socket.io-client') as SocketIOMock;
  socketIo.__socket.connected = false;

  const mod = require('../../services/socket.client') as SocketClientModule;
  getSocket = mod.getSocket;
  disconnectSocket = mod.disconnectSocket;
});

describe('socket.client — getSocket', () => {
  it('crea un socket nuevo para namespace passenger', () => {
    getSocket('passenger');
    expect(socketIo.io).toHaveBeenCalledWith(
      'http://test-socket/passenger',
      expect.objectContaining({
        auth: { token: 'test-token' },
        transports: ['websocket'],
      })
    );
  });

  it('crea un socket nuevo para namespace driver', () => {
    getSocket('driver');
    expect(socketIo.io).toHaveBeenCalledWith('http://test-socket/driver', expect.any(Object));
  });

  it('reutiliza socket existente si ya está conectado', () => {
    socketIo.__socket.connected = true;
    const s1 = getSocket('passenger');
    const s2 = getSocket('passenger');
    expect(socketIo.io).toHaveBeenCalledTimes(1);
    expect(s1).toBe(s2);
  });

  it('crea nuevo socket si el existente está desconectado', () => {
    socketIo.__socket.connected = false;
    getSocket('passenger');
    getSocket('passenger');
    expect(socketIo.io).toHaveBeenCalledTimes(2);
  });
});

describe('socket.client — disconnectSocket', () => {
  it('desconecta y elimina el namespace especificado', () => {
    getSocket('passenger');
    disconnectSocket('passenger');
    expect(socketIo.__socket.disconnect).toHaveBeenCalled();
  });

  it('desconecta todos los namespaces si no se especifica ninguno', () => {
    getSocket('passenger');
    getSocket('driver');
    disconnectSocket();
    expect(socketIo.__socket.disconnect).toHaveBeenCalled();
  });

  it('no lanza error si se llama sin sockets activos', () => {
    expect(() => disconnectSocket()).not.toThrow();
    expect(() => disconnectSocket('passenger')).not.toThrow();
  });
});
