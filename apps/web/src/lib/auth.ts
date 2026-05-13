// Stores JWT in memory (not localStorage — secure for admin panel)
let _token: string | null = null;

export const auth = {
  getToken: () => _token,
  setToken: (token: string) => { _token = token; },
  clearToken: () => { _token = null; },
  isAuthenticated: () => _token !== null,
};
