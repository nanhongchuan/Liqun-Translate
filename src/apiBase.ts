/**
 * 与 `package.json` 中 `npm run api` 的 `--port` 保持一致。
 * 未安装 FastAPI 时仅影响运行，不影响构建。
 */
export const DEFAULT_LOCAL_API_ORIGIN = "http://127.0.0.1:18787";

export function trimApiBase(s: string | undefined): string {
  if (!s) return "";
  return s.replace(/\/$/, "");
}

/**
 * 浏览器内 REST 地址（WebSocket 另见 useLiveAsr）。
 * - `VITE_API_BASE` 优先，用于直连自定义端口/主机（不经 Vite 代理时）。
 * - 未设置时：使用同源相对路径 `/api/...`，由 `vite` / `vite preview` 的 `server.proxy` 转到本机 18787。
 *   这样可避免 Cursor/内嵌预览等环境拦截对 `127.0.0.1:18787` 的跨端口请求，从而误报「网络错误」。
 */
export function apiUrl(relativePath: string): string {
  const p = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  const fromEnv = trimApiBase(import.meta.env.VITE_API_BASE);
  if (fromEnv) return `${fromEnv}${p}`;
  return p;
}
