// No static imports — all via require() in beforeEach so factory closures run AFTER const init

const mockSetTokens = jest.fn();
const mockLogout = jest.fn();
const mockGetState = jest.fn();

jest.mock('axios', () => {
  const rqH: Array<(c: Record<string, unknown>) => Record<string, unknown>> = [];
  const rsH: Array<[(r: object) => object, (e: unknown) => unknown]> = [];
  const postFn = jest.fn();

  const instance = Object.assign(jest.fn().mockResolvedValue({ data: 'retried' }), {
    interceptors: {
      request: {
        use: (ok: (c: Record<string, unknown>) => Record<string, unknown>) => { rqH.push(ok); },
      },
      response: {
        use: (ok: (r: object) => object, err: (e: unknown) => unknown) => { rsH.push([ok, err]); },
      },
    },
  });

  return {
    default: { create: jest.fn(() => instance), post: postFn },
    create: jest.fn(() => instance),
    post: postFn,
    __rqH: rqH,
    __rsH: rsH,
    __instance: instance,
  };
});

jest.mock('../../config/env', () => ({
  ENV: { apiUrl: 'http://test-api', socketUrl: 'http://test-socket' },
}));

jest.mock('../../stores/auth.store', () => ({
  useAuthStore: { getState: mockGetState },
}));

// ── Types ─────────────────────────────────────────────────────────────────────

type AxiosMock = {
  post: jest.Mock;
  __rqH: Array<(c: Record<string, unknown>) => Record<string, unknown>>;
  __rsH: Array<[(r: object) => object, (e: unknown) => unknown]>;
  __instance: jest.Mock;
};

// ── State reset between tests ─────────────────────────────────────────────────

let axiosMod: AxiosMock;
let requestHandler: (c: Record<string, unknown>) => Record<string, unknown>;
let responseOk: (r: object) => object;
let responseErr: (e: unknown) => unknown;

function defaultAuthState() {
  return { accessToken: null as string | null, refreshToken: null as string | null, setTokens: mockSetTokens, logout: mockLogout };
}

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();

  mockGetState.mockReturnValue(defaultAuthState());

  axiosMod = require('axios') as AxiosMock;
  require('../../services/api.client');

  requestHandler = axiosMod.__rqH[0];
  [responseOk, responseErr] = axiosMod.__rsH[0];
});

// ── Request interceptor ───────────────────────────────────────────────────────

describe('api.client — request interceptor', () => {
  it('no adjunta Authorization si no hay accessToken', () => {
    const config = { headers: {} as Record<string, unknown> };
    const result = requestHandler(config);
    expect((result as typeof config).headers['Authorization']).toBeUndefined();
  });

  it('adjunta Bearer token cuando hay accessToken', () => {
    mockGetState.mockReturnValue({ ...defaultAuthState(), accessToken: 'my-token' });
    const config = { headers: {} as Record<string, unknown> };
    const result = requestHandler(config);
    expect((result as typeof config).headers['Authorization']).toBe('Bearer my-token');
  });

  it('inicializa headers si config.headers es undefined', () => {
    mockGetState.mockReturnValue({ ...defaultAuthState(), accessToken: 'tok' });
    const config = { headers: undefined } as Record<string, unknown>;
    const result = requestHandler(config);
    expect((result as { headers: Record<string, unknown> }).headers['Authorization']).toBe('Bearer tok');
  });
});

// ── Response interceptor: ok path ─────────────────────────────────────────────

describe('api.client — response interceptor ok', () => {
  it('pasa la respuesta exitosa sin modificar', () => {
    const res = { data: 'ok', status: 200 };
    expect(responseOk(res)).toBe(res);
  });
});

// ── Response interceptor: error paths ────────────────────────────────────────

describe('api.client — response interceptor error', () => {
  it('rechaza errores que no son 401', async () => {
    const error = { response: { status: 500 }, config: { _retry: false, headers: {} } };
    await expect(responseErr(error)).rejects.toBe(error);
  });

  it('rechaza si _retry ya está marcado (previene bucle infinito)', async () => {
    const error = { response: { status: 401 }, config: { _retry: true, headers: {} } };
    await expect(responseErr(error)).rejects.toBe(error);
  });

  it('llama logout si el refresh falla en 401', async () => {
    mockGetState.mockReturnValue({
      accessToken: 'old', refreshToken: 'ref-tok', setTokens: mockSetTokens, logout: mockLogout,
    });
    axiosMod.post.mockRejectedValueOnce(new Error('Refresh failed'));

    const error = { response: { status: 401 }, config: { _retry: false, headers: {} } };
    await expect(responseErr(error)).rejects.toThrow('Refresh failed');
    expect(mockLogout).toHaveBeenCalled();
  });

  it('guarda nuevos tokens si el refresh tiene éxito en 401', async () => {
    mockGetState.mockReturnValue({
      accessToken: 'old', refreshToken: 'ref-tok', setTokens: mockSetTokens, logout: mockLogout,
    });
    axiosMod.post.mockResolvedValueOnce({
      data: { data: { accessToken: 'new-access', refreshToken: 'new-refresh' } },
    });

    const error = { response: { status: 401 }, config: { _retry: false, headers: {} } };
    await responseErr(error);
    expect(mockSetTokens).toHaveBeenCalledWith('new-access', 'new-refresh');
  });
});
