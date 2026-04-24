import {
  AudioWaveform,
  FolderOpen,
  Mic,
  Moon,
  Star,
  Sun,
  Users,
} from "lucide-react";
import { TopBarLanguages } from "./TopBarLanguages";

type Props = {
  sourceLang: string;
  targetLang: string;
  onSourceChange: (v: string) => void;
  onTargetChange: (v: string) => void;
  onSwapLangs: () => void;
  onStart: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
};

export function LandingPage({
  sourceLang,
  targetLang,
  onSourceChange,
  onTargetChange,
  onSwapLangs,
  onStart,
  darkMode,
  onToggleDark,
}: Props) {
  const surface = darkMode ? "bg-slate-950 text-slate-100" : "bg-[#fafbfc] text-slate-900";
  const headerBg = darkMode ? "border-slate-800 bg-slate-900/90" : "border-slate-200/90 bg-white/90";
  const cardBg = darkMode
    ? "border-slate-700/80 bg-slate-900/60 shadow-none"
    : "border-slate-200/80 bg-white shadow-sm";
  const subtext = darkMode ? "text-slate-400" : "text-slate-500";
  const tipBar = darkMode
    ? "border-violet-900/40 bg-violet-950/50 text-violet-100"
    : "border-violet-100 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 text-violet-900";

  return (
    <div className={`relative flex h-full min-h-0 flex-col ${surface}`}>
      <header
        className={`relative z-10 shrink-0 border-b backdrop-blur-md ${headerBg}`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 md:px-10">
          <div className="w-9 shrink-0 sm:w-10" aria-hidden />
          <div className="absolute inset-x-0 flex justify-center px-14 sm:px-16">
            <div className="pointer-events-auto">
              <TopBarLanguages
                variant="toolbar"
                sourceLang={sourceLang}
                targetLang={targetLang}
                onSourceChange={onSourceChange}
                onTargetChange={onTargetChange}
                onSwapLangs={onSwapLangs}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleDark}
            className={`relative z-10 shrink-0 rounded-full p-2.5 transition ${
              darkMode
                ? "bg-slate-800 text-amber-300 hover:bg-slate-700"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
            aria-label={darkMode ? "切换为浅色" : "切换为深色"}
            title={darkMode ? "浅色" : "深色"}
          >
            {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-8 sm:px-6 md:px-10 md:pb-16 md:pt-10">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-14 xl:gap-16">
            <div className="order-2 flex flex-col items-center text-center lg:order-1 lg:items-start lg:text-left">
              <h1
                className={`max-w-[14ch] font-display text-[2.35rem] leading-[1.2] sm:max-w-none sm:text-5xl md:text-[3.25rem] md:leading-[1.15] ${
                  darkMode ? "" : ""
                } bg-gradient-to-br from-sky-600 via-violet-600 to-violet-700 bg-clip-text text-transparent`}
              >
                让沟通
                <br />
                无国界·更实时
              </h1>
              <p className={`mt-4 max-w-md text-[15px] leading-relaxed sm:text-base ${subtext}`}>
                实时语音翻译，跨越语言障碍，让交流更自然
              </p>
              <button
                type="button"
                onClick={onStart}
                className="mt-8 inline-flex h-[3.25rem] min-w-[13rem] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-10 text-base font-semibold text-white shadow-lg shadow-violet-500/30 ring-1 ring-white/20 transition hover:from-violet-500 hover:to-indigo-500 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 active:scale-[0.99]"
              >
                <Mic className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                开始同传
              </button>
              <div className={`mt-4 flex items-center gap-2 text-sm ${subtext}`}>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                麦克风已就绪，点击按钮开始同传
              </div>
            </div>

            <div className="order-1 flex justify-center lg:order-2 lg:justify-end">
              <div className="relative aspect-square w-full max-w-[min(100%,20rem)] sm:max-w-xs md:max-w-sm">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-200/40 via-sky-100/50 to-transparent blur-2xl dark:from-violet-900/30 dark:via-slate-800/50" />
                <div className="absolute inset-[8%] rounded-full border border-violet-200/30 dark:border-violet-700/30" />
                <div className="absolute inset-[18%] rounded-full border border-sky-200/25 dark:border-sky-800/30" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div
                    className={`flex h-36 w-36 flex-col items-center justify-center rounded-[2rem] shadow-xl sm:h-40 sm:w-40 ${
                      darkMode
                        ? "bg-gradient-to-br from-slate-800 to-slate-900 ring-1 ring-slate-600"
                        : "bg-gradient-to-br from-white to-violet-50 ring-1 ring-violet-100"
                    }`}
                  >
                    <div className="rounded-2xl bg-gradient-to-br from-sky-500 to-violet-600 p-[0.65rem] text-white shadow-md">
                      <AudioWaveform className="h-14 w-14 sm:h-16 sm:w-16" strokeWidth={1.25} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:mt-20 lg:grid-cols-4 lg:gap-5">
            <article className={`rounded-2xl border p-5 ${cardBg}`}>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-950/80 dark:text-violet-300">
                <AudioWaveform className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">多语言支持</h3>
              <p className={`mt-1.5 text-xs leading-relaxed ${subtext}`}>100+ 语种互译</p>
            </article>
            <article className={`rounded-2xl border p-5 ${cardBg}`}>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/80 dark:text-emerald-300">
                <FolderOpen className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">历史记录</h3>
              <p className={`mt-1.5 text-xs leading-relaxed ${subtext}`}>随时查看翻译内容</p>
            </article>
            <article className={`rounded-2xl border p-5 ${cardBg}`}>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/80 dark:text-amber-300">
                <Star className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">收藏短语</h3>
              <p className={`mt-1.5 text-xs leading-relaxed ${subtext}`}>常用表达一键收藏</p>
            </article>
            <article className={`rounded-2xl border p-5 ${cardBg}`}>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-950/80 dark:text-sky-300">
                <Users className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">实时同传</h3>
              <p className={`mt-1.5 text-xs leading-relaxed ${subtext}`}>边说边译，毫秒级响应</p>
            </article>
          </div>

          <div
            className={`mt-10 flex items-start gap-3 rounded-2xl border px-4 py-3.5 sm:mt-12 sm:items-center sm:px-5 ${tipBar}`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/80 text-lg dark:bg-slate-800/80">
              💡
            </span>
            <p className="text-left text-[13px] leading-relaxed sm:text-sm">
              <span className="font-semibold">使用小贴士：</span>
              在安静环境中说话，保持语速适中，可获得更准确的翻译效果哦~
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
