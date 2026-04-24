import { Mic, Pause, Square } from "lucide-react";
import { TopBarLanguages } from "./TopBarLanguages";

type Bubble = { id: string; original: string; translated: string };

const DEMO: Bubble[] = [
  {
    id: "1",
    original: "Let me start with the latency budget for end-to-end translation.",
    translated: "先从端到端翻译的延迟预算讲起。",
  },
  {
    id: "2",
    original: "We batch partial transcripts before calling the LLM.",
    translated: "在调用语言模型之前，我们会合并部分转写结果。",
  },
  {
    id: "3",
    original: "The layout uses a light sidebar and a calm main surface.",
    translated: "界面采用浅色侧栏与柔和的主工作区背景。",
  },
];

type Props = {
  sourceLang: string;
  targetLang: string;
  onSourceChange: (v: string) => void;
  onTargetChange: (v: string) => void;
  onStop: () => void;
};

export function LiveSessionPage({
  sourceLang,
  targetLang,
  onSourceChange,
  onTargetChange,
  onStop,
}: Props) {
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-slate-200/90 bg-white shadow-soft">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-3.5 md:px-10">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]" />
            <h1 className="text-sm font-semibold text-slate-800">同传进行中</h1>
          </div>
          <TopBarLanguages
            compact
            sourceLang={sourceLang}
            targetLang={targetLang}
            onSourceChange={onSourceChange}
            onTargetChange={onTargetChange}
          />
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto px-5 pb-36 pt-8 md:px-10">
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          {DEMO.map((b) => (
            <article
              key={b.id}
              className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-soft md:p-6"
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                原文 · ASR
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{b.original}</p>
              <div className="my-4 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-600/90">
                译文 · LLM
              </p>
              <p className="mt-2 text-base font-medium leading-relaxed text-slate-900">{b.translated}</p>
            </article>
          ))}
        </div>

        <button
          type="button"
          className="fixed bottom-32 right-5 hidden rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 shadow-card transition hover:border-slate-300 hover:text-slate-900 sm:inline-flex"
        >
          反馈
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-slate-100 via-slate-100/90 to-transparent pb-6 pt-12">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-slate-200/90 bg-white px-3 py-2.5 shadow-card sm:gap-3 sm:px-4 sm:py-3">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600 text-white shadow-soft transition hover:bg-violet-500"
            aria-label="麦克风（演示）"
          >
            <Mic className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-white hover:text-slate-900"
            aria-label="暂停（演示）"
          >
            <Pause className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 px-1">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            <span className="text-xs font-medium text-slate-500">监听中</span>
          </div>
          <div className="hidden h-8 w-px bg-slate-200 sm:block" />
          <div className="min-w-[100px] text-center font-mono text-sm tabular-nums text-slate-700">
            <span className="font-semibold text-violet-600">00:08</span>
            <span className="text-slate-400"> / 05:00</span>
          </div>
          <button
            type="button"
            onClick={onStop}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            停止
          </button>
        </div>
      </div>
    </div>
  );
}
