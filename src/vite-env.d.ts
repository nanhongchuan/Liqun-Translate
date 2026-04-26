/// <reference types="vite/client" />

/** 本机 API 根 URL（如 `http://127.0.0.1:18787`）。不设时：`vite` 开发模式会默认直连 18787；`vite preview` / 生产包用相对路径 `/api`（需代理或此变量直连）。 */
/** 设为 `true` 时，本机 ASR 不可用才回退到需联网的浏览器语音识别（默认关闭，保证离线可用）。 */
interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_ENABLE_BROWSER_STT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
