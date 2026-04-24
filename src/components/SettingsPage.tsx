import { ArrowLeft, CheckCircle2, Download, Trash2 } from "lucide-react";
import * as Tabs from "@radix-ui/react-tabs";
import * as Label from "@radix-ui/react-label";

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

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/80">
          <div className="mx-auto max-w-5xl px-5 py-8 md:px-10">
            <Tabs.Content value="llm" className="mx-auto max-w-2xl space-y-6 outline-none">
              <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-soft md:p-8">
                <h2 className="text-base font-semibold text-slate-900">厂商与连接</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  API Key 由本机后端保存；此处为表单示意（未接接口）。
                </p>
                <div className="mt-6 grid gap-5 sm:grid-cols-[132px_1fr] sm:items-start">
                  <div>
                    <Label.Root className="text-xs font-medium text-slate-600">厂商</Label.Root>
                    <select className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-200">
                      <option>OpenAI 兼容</option>
                      <option>DeepSeek</option>
                      <option>智谱</option>
                      <option>Moonshot</option>
                      <option>Ollama（本地）</option>
                    </select>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label.Root className="text-xs font-medium text-slate-600">
                        API Key <span className="text-rose-500">*</span>
                      </Label.Root>
                      <input
                        type="password"
                        placeholder="sk-..."
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-200"
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <Label.Root className="text-xs font-medium text-slate-600">Base URL</Label.Root>
                      <input
                        type="url"
                        placeholder="https://api.openai.com/v1"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-200"
                      />
                    </div>
                    <div>
                      <Label.Root className="text-xs font-medium text-slate-600">模型</Label.Root>
                      <input
                        type="text"
                        placeholder="gpt-4o-mini"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-200"
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-8 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-violet-500"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 shadow-soft transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    测试连接
                  </button>
                </div>
              </section>
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
