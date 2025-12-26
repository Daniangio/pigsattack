const trimTrailingSlash = (value) => (value ? value.replace(/\/+$/, "") : "");
const ensureLeadingSlash = (value) => (value.startsWith("/") ? value : `/${value}`);

const resolveApiBaseUrl = () => {
  const envValue = trimTrailingSlash(import.meta.env.VITE_API_URL);
  if (envValue) return envValue;
  if (typeof window === "undefined") return "http://localhost:8000";
  const isDev = import.meta.env.DEV;
  if (isDev && window.location.hostname) {
    const targetPort = "8000";
    if (window.location.port && window.location.port !== targetPort) {
      return `${window.location.protocol}//${window.location.hostname}:${targetPort}`;
    }
  }
  return window.location.origin;
};

const resolveWsBaseUrl = () => {
  const envValue = trimTrailingSlash(import.meta.env.VITE_WS_URL);
  if (envValue) return envValue;
  if (typeof window === "undefined") return "ws://localhost:8000";
  const isDev = import.meta.env.DEV;
  const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
  if (isDev && window.location.hostname) {
    const targetPort = "8000";
    if (window.location.port && window.location.port !== targetPort) {
      return `${wsProtocol}://${window.location.hostname}:${targetPort}`;
    }
  }
  return `${wsProtocol}://${window.location.host}`;
};

export const apiBaseUrl = resolveApiBaseUrl();
export const wsBaseUrl = resolveWsBaseUrl();

export const buildApiUrl = (path) => `${apiBaseUrl}${ensureLeadingSlash(path)}`;
export const buildWsUrl = (path) => `${wsBaseUrl}${ensureLeadingSlash(path)}`;
