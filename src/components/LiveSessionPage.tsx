import { useCallback, useEffect, useRef, useState } from "react";
import { AudioWaveform, ChevronDown, HelpCircle } from "lucide-react";
import { apiUrl } from "../apiBase";
import { useLiveAsr } from "../hooks/useLiveAsr";
import { SessionTextPanel } from "./SessionTextPanel";
import { TopBarLanguages, getLangLabel } from "./TopBarLanguages";

type SessionState = "LIVE" | "PAUSED";

type Props = {
  sourceLang: string;
  targetLang: string;
  onSourceChange: (v: string) => void;
  onTargetChange: (v: string) => void;
  onSwapLangs: () => void;
  onStop: () => void;
};

const EXPORT_NO_TRANSLATION = "（暂无译文）";

/** 听写稳定后多久发一批翻译（合并 ASR 碎片，避免逐字打 API） */
const TRANSLATE_STABLE_MS = 420;
/**
 * 自「有待译内容」起，最多多久强制发一批（长句不换气时仍能看到准实时更新）
 * 与 TRANSLATE_STABLE_MS 配合，避免无停顿时永远不译
 */
const TRANSLATE_MAX_LAG_MS = 1100;

async function readApiError(r: Response): Promise<string> {
  const text = await r.text();
  if (!text.trim()) return "请求失败";
  try {
    const parsed = JSON.parse(text) as { detail?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
    if (parsed.detail != null) return JSON.stringify(parsed.detail).slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
  return "请求失败";
}

export function LiveSessionPage({
  sourceLang,
  targetLang,
  onSourceChange,
  onTargetChange,
  onSwapLangs,
  onStop,
}: Props) {
  const [sessionState, setSessionState] = useState<SessionState>("LIVE");
  const [translation, setTranslation] = useState("");
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [translationPending, setTranslationPending] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [asrRestartKey, setAsrRestartKey] = useState(0);
  const isLive = sessionState === "LIVE";
  const isLiveRef = useRef(isLive);
  isLiveRef.current = isLive;
  const pausedAccumulatedRef = useRef(0);
  const liveSegmentStartRef = useRef<number | null>(Date.now());
  /** 已完整对应到译区的原文前缀（仅在一次翻译成功后推进，避免逐字/逐词打 LLM） */
  const translatedSourceAnchorRef = useRef("");
  const latestTranscriptRef = useRef("");
  const translateInFlightRef = useRef(false);
  const translateStableTimerRef = useRef<number | null>(null);
  const translateMaxLagTimerRef = useRef<number | null>(null);
  const uncommittedSinceRef = useRef<number | null>(null);
  const translationRef = useRef("");
  const armTranslationRef = useRef<() => void>(() => {});
  const { status: asrStatus, errorMessage: asrError, transcript, asrMode } = useLiveAsr(
    {
      enabled: isLive,
      language: sourceLang,
      restartKey: asrRestartKey,
    },
  );

  const transcriptBody =
    transcript
      || (asrStatus === "connecting" || asrStatus === "listening"
        ? (asrStatus === "connecting" ? "正在连接麦克风…" : "正在听写…")
        : isLive
          ? "等待语音输入"
          : "已暂停");

  const hasTranscript = Boolean(transcript.trim());
  const isActivelyCapturing =
    isLive && (asrStatus === "connecting" || asrStatus === "listening");
  const showCaptureHintMotion = isActivelyCapturing && !hasTranscript;

  const hasTranslation = Boolean(translation.trim());
  const isAsrError = isLive && asrStatus === "error";
  const translationBody =
    translation.trim()
      || (isLive
        ? (hasTranscript
          ? (translationPending ? "正在翻译…" : "等待翻译")
          : "原文出现后开始翻译")
        : "已暂停");

  const showTranslationBreathe =
    isLive
    && hasTranscript
    && !hasTranslation
    && (translationPending || asrStatus === "connecting" || asrStatus === "listening");

  useEffect(() => {
    translationRef.current = translation;
  }, [translation]);

  useEffect(() => {
    setTranslation("");
    setTranslationError(null);
    translatedSourceAnchorRef.current = "";
    uncommittedSinceRef.current = null;
  }, [sourceLang, targetLang]);

  useEffect(() => {
    latestTranscriptRef.current = transcript;
  }, [transcript]);

  function getPendingFromTranscript(
    text: string,
  ): { toTranslate: string; fullSnapshot: string } | null {
    const t = text.trim();
    if (!t) return null;
    let anchor = translatedSourceAnchorRef.current;
    if (anchor && !t.startsWith(anchor)) {
      anchor = "";
    }
    const toTranslate = (anchor ? t.slice(anchor.length) : t).trim();
    if (!toTranslate) return null;
    return { toTranslate, fullSnapshot: t };
  }

  const runTranslate = useCallback(
    async () => {
      if (!isLiveRef.current) return;
      if (translateStableTimerRef.current != null) {
        window.clearTimeout(translateStableTimerRef.current);
        translateStableTimerRef.current = null;
      }
      if (translateMaxLagTimerRef.current != null) {
        window.clearTimeout(translateMaxLagTimerRef.current);
        translateMaxLagTimerRef.current = null;
      }
      if (translateInFlightRef.current) return;

      const pending0 = getPendingFromTranscript(latestTranscriptRef.current);
      if (!pending0) {
        uncommittedSinceRef.current = null;
        setTranslationPending(false);
        return;
      }
      const { toTranslate, fullSnapshot } = pending0;

      translateInFlightRef.current = true;
      setTranslationPending(true);
      try {
        const r = await fetch(apiUrl("/api/translate"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: toTranslate,
            source_language: getLangLabel(sourceLang),
            target_language: getLangLabel(targetLang),
          }),
        });
        if (!r.ok) {
          throw new Error(await readApiError(r));
        }
        const data = (await r.json()) as { translation?: string };
        const next = (data.translation || "").trim();
        if (next) {
          translatedSourceAnchorRef.current = fullSnapshot;
          setTranslation((prev) => {
            if (!prev.trim()) return next;
            return `${prev.trim()}\n${next}`;
          });
          setTranslationError(null);
        } else {
          setTranslationError("翻译端点未返回译文。");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "翻译失败";
        if (!translationRef.current.trim()) {
          setTranslationError(message);
        }
      } finally {
        translateInFlightRef.current = false;
        uncommittedSinceRef.current = null;
        armTranslationRef.current();
        const after = getPendingFromTranscript(latestTranscriptRef.current);
        if (!after) {
          setTranslationPending(false);
        }
      }
    },
    [sourceLang, targetLang],
  );

  function clearTranslateTimers() {
    if (translateStableTimerRef.current != null) {
      window.clearTimeout(translateStableTimerRef.current);
      translateStableTimerRef.current = null;
    }
    if (translateMaxLagTimerRef.current != null) {
      window.clearTimeout(translateMaxLagTimerRef.current);
      translateMaxLagTimerRef.current = null;
    }
  }

  const armTranslation = () => {
    if (!isLiveRef.current) return;
    clearTranslateTimers();

    const text = latestTranscriptRef.current.trim();
    if (!text) {
      uncommittedSinceRef.current = null;
      return;
    }

    const pending = getPendingFromTranscript(text);
    if (!pending) {
      uncommittedSinceRef.current = null;
      return;
    }

    if (uncommittedSinceRef.current == null) {
      uncommittedSinceRef.current = Date.now();
    }
    const since = uncommittedSinceRef.current;
    const lagRemaining = Math.max(0, TRANSLATE_MAX_LAG_MS - (Date.now() - since));

    const fire = () => {
      void runTranslate();
    };
    translateStableTimerRef.current = window.setTimeout(fire, TRANSLATE_STABLE_MS);
    translateMaxLagTimerRef.current = window.setTimeout(fire, lagRemaining);
  };

  armTranslationRef.current = armTranslation;

  useEffect(() => {
    if (!isLive) {
      clearTranslateTimers();
      uncommittedSinceRef.current = null;
      setTranslationPending(false);
      return;
    }
    const text = transcript.trim();
    if (!text) {
      setTranslation("");
      setTranslationError(null);
      setTranslationPending(false);
      translatedSourceAnchorRef.current = "";
      uncommittedSinceRef.current = null;
      clearTranslateTimers();
      return;
    }
    armTranslation();
    return () => {
      clearTranslateTimers();
    };
  }, [isLive, transcript, sourceLang, targetLang]);

  useEffect(() => {
    liveSegmentStartRef.current = Date.now();
    pausedAccumulatedRef.current = 0;
  }, []);

  useEffect(() => {
    if (sessionState !== "LIVE") return;
    liveSegmentStartRef.current = Date.now();
    const id = window.setInterval(() => {
      const start = liveSegmentStartRef.current;
      if (start == null) return;
      setElapsedMs(pausedAccumulatedRef.current + (Date.now() - start));
    }, 200);
    return () => clearInterval(id);
  }, [sessionState]);

  const togglePause = useCallback(() => {
    setSessionState((prev) => {
      if (prev === "LIVE") {
        const start = liveSegmentStartRef.current;
        if (start != null) {
          pausedAccumulatedRef.current += Date.now() - start;
        }
        liveSegmentStartRef.current = null;
        setElapsedMs(pausedAccumulatedRef.current);
        return "PAUSED";
      }
      liveSegmentStartRef.current = Date.now();
      return "LIVE";
    });
  }, []);

  const retryMicrophone = useCallback(() => {
    setSessionState("LIVE");
    setAsrRestartKey((v) => v + 1);
  }, []);

  const showVoiceHelp = useCallback(() => {
    window.alert(
      [
        "麦克风仍不可用时，请依次检查：",
        "1. 地址栏/页面权限里允许 http://127.0.0.1:5173 使用麦克风。",
        "2. macOS「系统设置 > 隐私与安全性 > 麦克风」里允许当前应用访问麦克风。",
        "3. 如果刚打开系统权限，请重启当前应用，macOS 通常要重启后才把麦克风权限交给进程。",
        "4. 如果内置浏览器仍不可用，请用 Chrome / Safari 打开 http://127.0.0.1:5173。",
        "5. 关闭正在占用麦克风的会议、录音或浏览器页面，再回到本页点击「重试麦克风」。",
      ].join("\n"),
    );
  }, []);

  const exportSession = useCallback(() => {
    const src = getLangLabel(sourceLang);
    const tgt = getLangLabel(targetLang);
    const orig = transcript.trim() || "（无原文）";
    const trans = translation.trim() || EXPORT_NO_TRANSLATION;
    const body = `# 实时翻译会话\n\n## 原文（${src}）\n\n${orig}\n\n## 译文（${tgt}）\n\n${trans}\n`;
    const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "session-export.md";
    a.click();
    URL.revokeObjectURL(url);
  }, [sourceLang, targetLang, transcript, translation]);

  const sourceName = getLangLabel(sourceLang);
  const targetName = getLangLabel(targetLang);

  const sourceFootnote = isLive
    ? (asrStatus === "listening"
      ? (asrMode === "faster_whisper"
        ? "本机转写"
        : asrMode === "browser"
          ? "浏览器识别"
          : "听写中")
      : asrStatus === "connecting"
        ? "请允许麦克风访问"
        : "")
    : "";

  const translationFootnote = isLive
    ? (asrStatus === "listening"
      ? (asrMode === "faster_whisper"
        ? "使用设置中的语言模型生成译文"
        : asrMode === "browser"
          ? "使用设置中的语言模型生成译文"
          : "随原文更新")
      : asrStatus === "connecting"
        ? "连接中"
        : "")
    : "";

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-gradient-to-br from-sky-50/90 via-violet-50/50 to-white">
      <header className="shrink-0 border-b border-white/60 bg-white/80 shadow-soft backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3.5 md:px-10">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full shadow-[0_0_0_3px_rgba(16,185,129,0.2)] ${
                isLive ? "bg-emerald-500" : "bg-amber-400"
              }`}
            />
            <h1 className="truncate text-sm font-semibold text-slate-800">实时会话</h1>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 md:flex-1 md:justify-center">
            <TopBarLanguages
              compact
              sourceLang={sourceLang}
              targetLang={targetLang}
              onSourceChange={onSourceChange}
              onTargetChange={onTargetChange}
              onSwapLangs={onSwapLangs}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm">
              <AudioWaveform className="h-4 w-4 shrink-0 text-violet-500" aria-hidden />
              <select
                className="cursor-pointer bg-transparent py-1 text-sm font-medium text-slate-700 outline-none"
                defaultValue="realtime"
                aria-label="处理模式"
              >
                <option value="realtime">实时</option>
              </select>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
              aria-label="帮助"
              title="帮助"
              onClick={() =>
                window.alert(
                  "开始后会请求麦克风权限。暂停会停止听写；继续后接着记录。",
                )
              }
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto px-5 pb-40 pt-8 md:px-10">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          <SessionTextPanel
            title={`原文（${sourceName}）`}
            role="source"
            copyValue={transcript}
            body={transcriptBody}
            hasContent={hasTranscript}
            showPlaceholderBreathe={showCaptureHintMotion}
            isLive={isLive}
            footnote={sourceFootnote}
            errorText={asrError}
            elapsedMs={elapsedMs}
          />

          <SessionTextPanel
            title={`译文（${targetName}）`}
            role="translation"
            copyValue={translation.trim() || translationBody}
            body={translationBody}
            hasContent={hasTranslation}
            showPlaceholderBreathe={showTranslationBreathe}
            isLive={isLive}
            footnote={translationFootnote}
            errorText={translationError}
            elapsedMs={elapsedMs}
          />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-white via-white/95 to-transparent pb-5 pt-16">
        <div className="pointer-events-auto flex w-full max-w-3xl flex-wrap items-center justify-center gap-2 px-5 sm:justify-between">
          <button
            type="button"
            onClick={isAsrError ? retryMicrophone : togglePause}
            className="order-1 inline-flex min-h-11 min-w-[9.5rem] items-center justify-center rounded-2xl bg-violet-600 px-6 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:bg-violet-500 sm:order-none"
          >
            {isAsrError ? "重试麦克风" : isLive ? "暂停" : "继续"}
          </button>
          <button
            type="button"
            onClick={exportSession}
            className="order-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 sm:order-none"
          >
            导出
          </button>
          <div className="order-3 flex w-full items-center justify-center gap-2 sm:order-none sm:w-auto">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              title="麦克风排查"
              onClick={showVoiceHelp}
            >
              语音
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
            <button
              type="button"
              onClick={onStop}
              className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
            >
              结束
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
