import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronDown, Download, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import * as Tabs from "@radix-ui/react-tabs";
import * as Label from "@radix-ui/react-label";

import { apiUrl } from "../apiBase";

const LLM_VENDORS = [
  { value: "openai-compatible", label: "OpenAI 兼容" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "zhipu", label: "智谱" },
  { value: "moonshot", label: "Moonshot" },
  { value: "ollama", label: "Ollama（本地）" },
] as const;

type LlmGetResponse = {
  vendor: string;
  base_url: string;
  model: string;
  api_key_configured: boolean;
  api_key_tail: string | null;
};

const LLM_SETTINGS_PATH = "/api/settings/llm";
const LLM_TEST_PATH = "/api/settings/llm/test";

/** 本地 session 草稿：断网、保存失败或刷新后尽量保留已填内容（单用户本机场景）。 */
const LLM_DRAFT_KEY = "rt_llm_settings_draft_v1";
const DRAFT_FRESH_MS = 3 * 60 * 1000;

type LlmDraftStored = {
  v: 1;
  vendor: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  updatedAt: number;
};

function readLlmDraft(): LlmDraftStored | null {
  try {
    const raw = sessionStorage.getItem(LLM_DRAFT_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<LlmDraftStored>;
    if (o.v !== 1 || typeof o.updatedAt !== "number") return null;
    return {
      v: 1,
      vendor: typeof o.vendor === "string" ? o.vendor : "openai-compatible",
      baseUrl: typeof o.baseUrl === "string" ? o.baseUrl : "",
      model: typeof o.model === "string" ? o.model : "",
      apiKey: typeof o.apiKey === "string" ? o.apiKey : "",
      updatedAt: o.updatedAt,
    };
  } catch {
    return null;
  }
}

function writeLlmDraft(p: { vendor: string; baseUrl: string; model: string; apiKey: string }): void {
  try {
    const payload: LlmDraftStored = {
      v: 1,
      vendor: p.vendor,
      baseUrl: p.baseUrl,
      model: p.model,
      apiKey: p.apiKey,
      updatedAt: Date.now(),
    };
    sessionStorage.setItem(LLM_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // 隐私模式或配额
  }
}

function clearLlmDraft(): void {
  try {
    sessionStorage.removeItem(LLM_DRAFT_KEY);
  } catch {
    // ignore
  }
}

function formatApiErrorDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg?: string }).msg ?? "");
        }
        return "";
      })
      .filter(Boolean)
      .join("；");
  }
  if (detail != null && typeof detail === "object") {
    try {
      return JSON.stringify(detail).slice(0, 300);
    } catch {
      return "操作失败";
    }
  }
  return "操作失败";
}

type LlmActionBody = { ok?: boolean; message?: string; detail?: unknown };

/** 解析 FastAPI JSON 或非 JSON（代理 HTML 等），避免误显示「操作失败」。 */
async function readLlmActionBody(r: Response): Promise<LlmActionBody> {
  const text = await r.text();
  const t = text.trim();
  if (!t) return {};
  try {
    return JSON.parse(text) as LlmActionBody;
  } catch {
    return { detail: t.length > 400 ? `${t.slice(0, 400)}…` : t };
  }
}

function messageForLlmApiFailure(status: number, detail: unknown): string {
  if (status === 404 || detail === "Not Found") {
    return "本机未提供该 LLM 接口，或 18787 上仍是未包含「测试连接」等路由的旧版 API。请结束占端口的旧 uvicorn 后，在项目根目录执行 npm run api（与 npm run dev 同时运行）再重试。若用生产包预览，请配置 VITE_API_BASE 或反代 /api。";
  }
  return formatApiErrorDetail(detail);
}

/** 本机 18787 有进程但为旧版 API（无 LLM 设置路由）时给出明确提示。 */
async function messageIfStaleLlmProcess(): Promise<string | null> {
  try {
    const h = await fetch(apiUrl("/api/health"), {
      cache: "no-store",
    });
    if (!h.ok) return null;
    const j = (await h.json()) as {
      ok?: boolean;
      service?: string;
      llm_settings?: boolean;
    };
    if (j.ok === true && j.service === "realtime-translate-api" && j.llm_settings !== true) {
      return "本机 18787 上仍是旧版 API 进程，没有 LLM 设置接口。请结束占用该端口的旧 uvicorn 后，在本项目根目录重新执行 npm run api。";
    }
  } catch {
    // 不可达
  }
  return null;
}

/** 「测试连接」POST 返回 404：多为 18787 上旧版 uvicorn 无该路由。 */
async function messageForLlmTestRoute404(): Promise<string> {
  const stale = await messageIfStaleLlmProcess();
  if (stale) return stale;
  try {
    const h = await fetch(apiUrl("/api/health"), { cache: "no-store" });
    if (!h.ok) {
      return messageForLlmApiFailure(404, "Not Found");
    }
    const j = (await h.json()) as { llm_test?: boolean };
    if (j.llm_test !== true) {
      return "本机 18787 上的 API 仍是旧版，没有「测试连接」路由。请在运行它的终端按 Ctrl+C 结束进程，在项目根目录重新执行 npm run api；再执行 npm run api:verify 应输出 OK，然后刷新本页后重试。";
    }
  } catch {
    // ignore
  }
  return messageForLlmApiFailure(404, "Not Found");
}

function LlmSettingsSection() {
  const [vendor, setVendor] = useState("openai-compatible");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [hasStoredKey, setHasStoredKey] = useState(false);
  /** 为 false 且本机已存 Key 时显示占位条；为 true 时显示真实输入框。 */
  const [apiKeyEditing, setApiKeyEditing] = useState(false);
  /** 编辑模式下：眼睛切换明文 / 密文。 */
  const [showKeyPlaintext, setShowKeyPlaintext] = useState(false);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const [apiKeyTail, setApiKeyTail] = useState<string | null>(null);
  /** 未连上本机 API 时的说明（非“报错”，不阻断填表与后续保存） */
  const [loadInfo, setLoadInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadInfo(null);
      const applyDraftIfAny = () => {
        const draft = readLlmDraft();
        if (!draft) return;
        setVendor(
          LLM_VENDORS.some((v) => v.value === draft.vendor)
            ? draft.vendor
            : "openai-compatible",
        );
        setBaseUrl(draft.baseUrl);
        setModel(draft.model);
        setApiKey(draft.apiKey);
        setApiKeyEditing(!!draft.apiKey.trim());
        setShowKeyPlaintext(false);
      };
      /**
       * 保存成功后 debounce 会在 session 里写入「与当前表单一致 + 空 Key」的草稿；若刷新时仍新鲜，
       * 不得用该草稿盖掉服务端已持久化的 Base URL / 模型（否则测试/再保存会用到空或旧值）。
       */
      const applyFreshDraftOverServer = (server: LlmGetResponse) => {
        const draft = readLlmDraft();
        if (!draft || Date.now() - draft.updatedAt >= DRAFT_FRESH_MS) return;
        const sameAsServer =
          draft.baseUrl.trim() === (server.base_url ?? "").trim() &&
          draft.model.trim() === (server.model ?? "").trim() &&
          draft.vendor === server.vendor;
        if (server.api_key_configured && !draft.apiKey.trim() && sameAsServer) {
          return;
        }
        setVendor(
          LLM_VENDORS.some((v) => v.value === draft.vendor)
            ? draft.vendor
            : "openai-compatible",
        );
        setBaseUrl(draft.baseUrl);
        setModel(draft.model);
        if (!server.api_key_configured) {
          setApiKey(draft.apiKey);
          setApiKeyEditing(true);
          setShowKeyPlaintext(false);
        } else if (draft.apiKey.trim()) {
          setApiKey(draft.apiKey);
          setApiKeyEditing(true);
          setShowKeyPlaintext(false);
        }
      };
      try {
        const r = await fetch(apiUrl(LLM_SETTINGS_PATH));
        if (!r.ok) {
          if (!cancelled) {
            const stale = r.status === 404 ? await messageIfStaleLlmProcess() : null;
            setLoadInfo(
              stale ??
                "当前未连上本机服务，因此暂时读不到已保存的 LLM 配置。请在项目根目录另开终端执行 npm run api，与 npm run dev 同时保持运行，然后刷新本页。",
            );
            applyDraftIfAny();
          }
          return;
        }
        const d = (await r.json()) as LlmGetResponse;
        if (cancelled) return;
        setVendor(
          LLM_VENDORS.some((v) => v.value === d.vendor) ? d.vendor : "openai-compatible",
        );
        setBaseUrl(d.base_url ?? "");
        setModel(d.model ?? "");
        setHasStoredKey(!!d.api_key_configured);
        setApiKeyTail(d.api_key_tail);
        setLoadInfo(null);
        applyFreshDraftOverServer(d);
        if (d.api_key_configured) {
          const draft = readLlmDraft();
          const fresh = draft && Date.now() - draft.updatedAt < DRAFT_FRESH_MS;
          const draftHasKey = Boolean(fresh && draft.apiKey.trim());
          if (!draftHasKey) {
            setApiKey("");
            setApiKeyEditing(false);
          } else {
            setApiKeyEditing(true);
          }
          setShowKeyPlaintext(false);
        } else {
          setApiKeyEditing(true);
        }
      } catch {
        if (!cancelled) {
          setLoadInfo(
            "网络未通或本机 API 未启动，暂时读不到已保存项。在根目录执行 npm run api 并保持运行，再刷新本页即可。",
          );
          applyDraftIfAny();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    const t = window.setTimeout(() => {
      writeLlmDraft({ vendor, baseUrl, model, apiKey });
    }, 400);
    return () => window.clearTimeout(t);
  }, [vendor, baseUrl, model, apiKey, loading]);

  const save = useCallback(async () => {
    setSaveOk(null);
    setSaveError(null);
    setSaving(true);
    try {
      const r = await fetch(apiUrl(LLM_SETTINGS_PATH), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor,
          base_url: baseUrl.trim(),
          model: model.trim(),
          api_key: apiKey,
        }),
      });
      const j = await readLlmActionBody(r);
      if (!r.ok) {
        const stale = r.status === 404 ? await messageIfStaleLlmProcess() : null;
        setSaveError(
          stale ?? messageForLlmApiFailure(r.status, j.detail),
        );
        return;
      }
      if (j.ok) {
        clearLlmDraft();
        setSaveOk("已保存到本机。");
        setApiKey("");
        setApiKeyEditing(false);
        setShowKeyPlaintext(false);
        setHasStoredKey(true);
        setLoadInfo(null);
        const r2 = await fetch(apiUrl(LLM_SETTINGS_PATH));
        if (r2.ok) {
          const d = (await r2.json()) as LlmGetResponse;
          setApiKeyTail(d.api_key_tail);
        }
        window.setTimeout(() => setSaveOk(null), 5000);
      } else {
        setSaveError("保存返回异常，请重试或查看本机 API 终端输出。");
      }
    } catch {
      setSaveError("网络错误，请重试。");
    } finally {
      setSaving(false);
    }
  }, [apiKey, baseUrl, model, vendor]);

  const testConnection = useCallback(async () => {
    setTestOk(null);
    setTestError(null);
    setTesting(true);
    try {
      const r = await fetch(apiUrl(LLM_TEST_PATH), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor,
          base_url: baseUrl.trim(),
          model: model.trim(),
          api_key: apiKey,
        }),
      });
      const j = await readLlmActionBody(r);
      if (!r.ok) {
        if (r.status === 404) {
          setTestError(await messageForLlmTestRoute404());
        } else {
          setTestError(messageForLlmApiFailure(r.status, j.detail));
        }
        return;
      }
      if (j.ok) {
        setTestOk(
          typeof j.message === "string" && j.message
            ? j.message
            : "连接成功。",
        );
        return;
      }
      setTestError("测试返回异常，请重试。");
    } catch {
      setTestError("网络错误。请确认已执行 npm run api，且与 npm run dev 同时运行。");
    } finally {
      setTesting(false);
    }
  }, [apiKey, baseUrl, model, vendor]);

  const showStoredKeyBar = hasStoredKey && !apiKey.trim() && !apiKeyEditing;

  return (
    <section className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-200/90 bg-white p-6 shadow-soft md:p-8">
      <h2 className="text-base font-semibold text-slate-900">翻译模型</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">
        用于生成会话译文；API Key 仅保存在本机。
      </p>
      {loadInfo && (
        <p className="mt-2 rounded-lg border border-slate-200/90 bg-slate-100/90 px-3 py-2 text-sm leading-relaxed text-slate-600">
          {loadInfo}
        </p>
      )}
      {saveError && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          {saveError}
        </p>
      )}
      {saveOk && (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
          {saveOk}
        </p>
      )}
      {testError && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          {testError}
        </p>
      )}
      {testOk && (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
          {testOk}
        </p>
      )}
      <div className="mt-6 grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-[minmax(0,132px)_minmax(0,1fr)] sm:items-start">
        <div className="min-w-0">
          <Label.Root className="text-xs font-medium text-slate-600">厂商</Label.Root>
          <div className="relative mt-1.5">
            <select
              className="mt-0 w-full min-w-0 appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-10 text-sm text-slate-800 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-200 disabled:opacity-50"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              disabled={loading}
              aria-label="厂商"
            >
              {LLM_VENDORS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden
            />
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <div className="min-w-0">
            <Label.Root className="text-xs font-medium text-slate-600">
              API Key <span className="text-rose-500">*</span>
            </Label.Root>
            {showStoredKeyBar ? (
              <div className="relative mt-1.5 w-full min-w-0">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setApiKeyEditing(true);
                    setApiKey("");
                    setShowKeyPlaintext(false);
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => apiKeyInputRef.current?.focus());
                    });
                  }}
                  className="flex w-full min-w-0 items-center rounded-xl border border-slate-200 bg-slate-50/90 py-2.5 pl-3 pr-12 text-left text-sm outline-none transition hover:border-slate-300 hover:bg-slate-50 focus-visible:border-violet-300 focus-visible:ring-2 focus-visible:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div
                    role="presentation"
                    aria-hidden
                    className="pointer-events-none min-h-[18px] min-w-0 flex-1 self-stretch rounded-sm"
                    style={{
                      backgroundImage:
                        "radial-gradient(circle at center, rgb(148 163 184) 1.15px, transparent 1.35px)",
                      backgroundSize: "11px 100%",
                      backgroundRepeat: "repeat-x",
                      backgroundPosition: "left center",
                    }}
                  />
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setApiKeyEditing(true);
                    setApiKey("");
                    setShowKeyPlaintext(false);
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => apiKeyInputRef.current?.focus());
                    });
                  }}
                  className="absolute inset-y-0 right-1 z-10 flex w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 outline-none hover:bg-white/90 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-50"
                  aria-label={
                    apiKeyTail ? `更换已保存密钥，当前尾号 ${apiKeyTail}` : "更换已保存密钥"
                  }
                  title={apiKeyTail ? `更换密钥，当前尾号 ${apiKeyTail}` : "更换密钥"}
                >
                  <Pencil className="h-[1.125rem] w-[1.125rem]" aria-hidden />
                </button>
              </div>
            ) : (
              <div className="relative mt-1.5 w-full min-w-0">
                <input
                  ref={apiKeyInputRef}
                  id="llm-api-key"
                  type={showKeyPlaintext ? "text" : "password"}
                  placeholder={hasStoredKey ? "留空沿用已存密钥；更换请粘贴新 Key" : "sk-..."}
                  className={`box-border w-full min-w-0 rounded-xl border border-slate-200 bg-white py-2.5 pl-3 text-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-200 disabled:opacity-50 ${
                    apiKey.trim() ? "pr-12" : "pr-3"
                  }`}
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                  }}
                  onBlur={() => {
                    if (hasStoredKey && !apiKey.trim()) {
                      setApiKeyEditing(false);
                      setShowKeyPlaintext(false);
                    }
                  }}
                  disabled={loading}
                />
                {apiKey.trim() ? (
                  <button
                    type="button"
                    disabled={loading}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setShowKeyPlaintext((v) => !v);
                      requestAnimationFrame(() => apiKeyInputRef.current?.focus());
                    }}
                    className="absolute inset-y-0 right-1 z-10 flex w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 outline-none hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-50"
                    aria-label={showKeyPlaintext ? "隐藏新 Key" : "显示新 Key"}
                    title={showKeyPlaintext ? "隐藏新 Key" : "显示新 Key"}
                  >
                    {showKeyPlaintext ? <EyeOff className="h-[1.125rem] w-[1.125rem]" /> : <Eye className="h-[1.125rem] w-[1.125rem]" />}
                  </button>
                ) : null}
              </div>
            )}
            {hasStoredKey && apiKeyEditing && !apiKey.trim() ? (
              <p className="mt-1 text-xs text-slate-500">留空并保存将沿用本机已存的完整密钥。</p>
            ) : null}
          </div>
          <div className="min-w-0">
            <Label.Root className="text-xs font-medium text-slate-600" htmlFor="llm-base-url">
              Base URL <span className="text-rose-500">*</span>
            </Label.Root>
            <input
              id="llm-base-url"
              type="url"
              placeholder="https://api.openai.com/v1"
              className="mt-1.5 box-border w-full min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-200 disabled:opacity-50"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="min-w-0">
            <Label.Root className="text-xs font-medium text-slate-600" htmlFor="llm-model">
              模型 <span className="text-rose-500">*</span>
            </Label.Root>
            <input
              id="llm-model"
              type="text"
              placeholder="gpt-4o-mini"
              className="mt-1.5 box-border w-full min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-200 disabled:opacity-50"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={save}
          disabled={loading || saving}
          className="rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存"}
        </button>
        <button
          type="button"
          className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 shadow-soft transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={testConnection}
          disabled={loading || testing || saving}
        >
          {testing ? "测试中…" : "测试连接"}
        </button>
      </div>
    </section>
  );
}

type Props = {
  onBack: () => void;
};

export function SettingsPage({ onBack }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-slate-200/90 bg-white shadow-soft">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-4 md:px-10">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border border-transparent px-2 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </button>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">设置</h1>
        </div>
      </header>

      <Tabs.Root defaultValue="llm" className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-slate-200/90 bg-white">
          <div className="mx-auto max-w-5xl px-5 py-3 md:px-10">
            <Tabs.List className="inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-slate-100/90 p-1 ring-1 ring-slate-200/60">
              {[
                { id: "llm", label: "语言模型" },
                { id: "asr", label: "ASR 集成" },
                { id: "transcribe", label: "转写" },
                { id: "translate", label: "翻译" },
                { id: "about", label: "关于" },
              ].map((t) => (
                <Tabs.Trigger
                  key={t.id}
                  value={t.id}
                  className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-slate-600 outline-none transition data-[state=active]:bg-white data-[state=active]:font-semibold data-[state=active]:text-violet-800 data-[state=active]:shadow-soft hover:text-slate-900"
                >
                  {t.label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-slate-50/80">
          <div className="mx-auto box-border w-full min-w-0 max-w-5xl px-5 py-8 md:px-10">
            <Tabs.Content value="llm" className="mx-auto w-full min-w-0 max-w-2xl space-y-6 outline-none">
              <LlmSettingsSection />
            </Tabs.Content>

            <Tabs.Content value="asr" className="mx-auto max-w-2xl outline-none">
              <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-soft md:p-8">
                <h2 className="text-base font-semibold text-slate-900">ASR 模型</h2>
                <p className="mt-1 text-sm text-slate-500">来自远端 Manifest 的列表示意。</p>
                <ul className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100 bg-slate-50/50">
                  <li className="flex flex-wrap items-center gap-4 bg-white px-4 py-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-lg">
                      🗣️
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">faster-whisper · small</p>
                      <p className="text-xs text-slate-500">推荐入门档位</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-100/80">
                      已安装
                    </span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      卸载
                    </button>
                  </li>
                  <li className="flex flex-wrap items-center gap-4 bg-white px-4 py-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-lg">
                      🧠
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">faster-whisper · medium</p>
                      <p className="text-xs text-slate-500">更高准确度</p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-soft transition hover:bg-violet-500"
                    >
                      <Download className="h-3.5 w-3.5" />
                      安装
                    </button>
                  </li>
                </ul>
              </section>
            </Tabs.Content>

            <Tabs.Content value="transcribe" className="mx-auto max-w-2xl outline-none">
              <section className="rounded-2xl border border-slate-200/90 bg-white p-6 text-sm leading-relaxed text-slate-600 shadow-soft md:p-8">
                <p className="font-semibold text-slate-900">转写设置</p>
                <p className="mt-2 text-slate-500">
                  默认 ASR 模型、VAD 与分段参数将在此配置（高阶项可后续迭代）。
                </p>
              </section>
            </Tabs.Content>

            <Tabs.Content value="translate" className="mx-auto max-w-2xl outline-none">
              <section className="rounded-2xl border border-slate-200/90 bg-white p-6 text-sm leading-relaxed text-slate-600 shadow-soft md:p-8">
                <p className="font-semibold text-slate-900">翻译设置</p>
                <p className="mt-2 text-slate-500">合并窗口、术语表、语气等策略可在此暴露（占位）。</p>
              </section>
            </Tabs.Content>

            <Tabs.Content value="about" className="mx-auto max-w-2xl outline-none">
              <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-soft md:p-8">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">关于 · 数据说明</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">
                      版本 UI 原型 0.0.1。麦克风音频默认不出网；仅翻译相关文本发往您配置的 LLM 端点。
                    </p>
                  </div>
                </div>
              </section>
            </Tabs.Content>
          </div>
        </div>
      </Tabs.Root>
    </div>
  );
}
