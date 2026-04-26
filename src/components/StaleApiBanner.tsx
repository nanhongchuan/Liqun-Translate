import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { apiUrl } from "../apiBase";

const SESSION_DISMISS = "rt_stale_api_banner_dismissed_v1";

/**
 * 本机 127.0.0.1:18787 上常残留未重启的 uvicorn：无 llm_translate 字段，翻译会报「无法连接或超时：」。
 * 与当前仓库代码启动的 API 区分，避免用户误以为前端有 bug。
 */
export function StaleApiBanner() {
  const [stale, setStale] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(SESSION_DISMISS) === "1",
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(apiUrl("/api/health"));
        if (!r.ok) {
          if (!cancelled) setStale(false);
          return;
        }
        const j = (await r.json()) as { ok?: boolean; llm_translate?: string };
        if (cancelled) return;
        if (j.ok === true && j.llm_translate == null) {
          setStale(true);
        } else {
          setStale(false);
        }
      } catch {
        if (!cancelled) setStale(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (dismissed || stale !== true) {
    return null;
  }

  return (
    <div
      className="flex shrink-0 items-start gap-2 border-b border-rose-200/90 bg-rose-50 px-3 py-2.5 text-sm text-rose-950 md:px-4"
      role="status"
    >
      <p className="min-w-0 flex-1 leading-relaxed">
        <span className="font-semibold">本机 API 需重启。</span>
        当前连到的服务<strong>没有</strong> <code className="rounded bg-rose-100/80 px-1">llm_translate</code>{" "}
        字段，是<strong>旧进程</strong>，翻译会反复出现「无法连接或超时：」。请在运行
        <code className="mx-0.5 rounded bg-rose-100/80 px-1">npm run api</code>
        的终端按 <kbd className="rounded border border-rose-300/80 bg-white px-1.5">Ctrl+C</kbd> 结束，再执行
        <code className="mx-0.5 rounded bg-rose-100/80 px-1">npm run api</code>。
        用浏览器打开{" "}
        <a
          className="font-medium underline decoration-rose-400 underline-offset-2"
          href="http://127.0.0.1:18787/api/health"
          target="_blank"
          rel="noreferrer"
        >
          /api/health
        </a>{" "}
        应能看到 <code className="whitespace-nowrap rounded bg-rose-100/80 px-1">llm_translate: requests</code>。
      </p>
      <button
        type="button"
        className="shrink-0 rounded-lg p-1 text-rose-600 transition hover:bg-rose-100/80"
        aria-label="本次会话内不再显示"
        title="本次会话内不再显示"
        onClick={() => {
          sessionStorage.setItem(SESSION_DISMISS, "1");
          setDismissed(true);
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
