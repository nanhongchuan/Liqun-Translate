import { useCallback, useEffect, useRef, useState } from "react";
import { AudioWaveform, ChevronDown, HelpCircle } from "lucide-react";
import { apiUrl } from "../apiBase";
import { useLiveAsr } from "../hooks/useLiveAsr";
import { SessionTextPanel } from "./SessionTextPanel";
import { TopBarLanguages, getLangLabel, getLangLlmName } from "./TopBarLanguages";

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

/** 翻译前短缓冲：等 ASR 片段稍微稳定，避免把单字/半个短语送给模型。 */
const TRANSLATE_STABLE_MS = 650;
/**
 * 自出现未跟上译文的原文起，最迟多久发请求（长句不换气时仍能更新）
 */
const TRANSLATE_MAX_LAG_MS = 1800;
const MIN_SOURCE_DELTA_CHARS = 10;
const MIN_SOURCE_DELTA_LATIN_CHARS = 22;
const STREAM_DRAFT_FLUSH_MS = 90;

function isEmptyTranslationStreamMessage(msg: string): boolean {
  return /翻译流未返回内容|翻译端点未返回译文|翻译未返回内容/.test(msg);
}

/** 对过短、旧版后端留下的「无法连接或超时：」等提示补充自助排查（多行，见 SessionTextPanel pre-line） */
function enrichTranslationErrorDetail(msg: string): string {
  const t = msg.trim();
  if (!t) {
    return msg;
  }
  if (
    t.length < 56
    && /无法连接|或超时[：:]\s*$|等待超时[（(]?[：:]?\s*$|Read timed|Connection|ConnectTimeout|Max retries/i
      .test(
        t,
      )
  ) {
    return `${t}\n\n请确认：① 在运行「npm run api」的终端按 Ctrl+C 结束旧进程后再启动，使新代码生效；② 根目录执行「npm run api:smoke」应出现 ALL PASSED；③ 浏览器打开 http://127.0.0.1:18787/api/health 应含 \"llm_translate\":\"requests\"；④ 仍失败时检查「设置」里语言模型 Base URL 与 Key，需要代理可为 API 进程设置 RT_LLM_HTTPS_PROXY。`;
  }
  return msg;
}

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

/** 与 /api/translate 的备用重试为同一套后端流式逻辑，去重同义提示。 */
function mergeStreamAndTranslateFallbackError(
  main: string,
  fallback: string | null | undefined,
): string {
  if (!fallback?.trim()) {
    return main;
  }
  if (fallback === main || main.includes(fallback) || fallback.includes(main)) {
    return main;
  }
  return `${main}（重试：${fallback}）`;
}

/**
 * 一轮翻译以 sentAtRequest 为「原文快照」发往后端；若返回时原文字符串已变长（仍在同一段上追加），
 * 该译文对快照仍有效，应落库并继续展示，并触发对更长原文的后续翻译。若原文已非前缀（如整段重识别），
 * 本轮结果丢弃，只保留已提交的译文。
 */
function shouldApplyThisRound(
  sentAtRequest: string,
  currentSrc: string,
  result: string,
): boolean {
  if (!result.trim()) {
    return false;
  }
  if (currentSrc === sentAtRequest) {
    return true;
  }
  if (currentSrc.length > sentAtRequest.length && currentSrc.startsWith(sentAtRequest)) {
    return true;
  }
  return false;
}

function sourceDeltaForNextRound(snapshot: string, appliedSource: string): {
  incremental: boolean;
  requestText: string;
  previousSource: string;
} {
  const applied = appliedSource.trim();
  if (!applied || !snapshot.startsWith(applied)) {
    return { incremental: false, requestText: snapshot, previousSource: "" };
  }
  const delta = snapshot.slice(applied.length).trim();
  if (!delta) {
    return { incremental: false, requestText: snapshot, previousSource: "" };
  }
  return { incremental: true, requestText: delta, previousSource: applied };
}

function composeIncrementalTranslation(base: string, next: string): string {
  const a = base.trim();
  const b = next.trim();
  if (!a) return b;
  if (!b) return a;
  if (/\s$/.test(base) || /^[,.;:!?，。！？；：、）\])}]/.test(b)) {
    return `${a}${b}`;
  }
  if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]$/.test(a) || /^[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(b)) {
    return `${a}${b}`;
  }
  return `${a} ${b}`;
}

function sourceEndsAtBoundary(text: string): boolean {
  return /[。！？!?；;：:\n]$/.test(text.trim());
}

function shouldTranslateSourceDelta(
  snapshot: string,
  appliedSource: string,
  uncommittedSince: number,
): boolean {
  const src = snapshot.trim();
  if (!src || src === appliedSource.trim()) {
    return false;
  }
  if (Date.now() - uncommittedSince >= TRANSLATE_MAX_LAG_MS) {
    return true;
  }
  if (sourceEndsAtBoundary(src)) {
    return true;
  }
  const delta = src.startsWith(appliedSource.trim())
    ? src.slice(appliedSource.trim().length).trim()
    : src;
  const normalized = delta.replace(/\s+/g, "");
  if (!normalized) {
    return false;
  }
  if (/^[\x00-\x7F]+$/.test(normalized)) {
    return normalized.length >= MIN_SOURCE_DELTA_LATIN_CHARS;
  }
  return normalized.length >= MIN_SOURCE_DELTA_CHARS;
}

/** 读取 /api/translate/stream 的 NDJSON：{c} 多次，{ok:true} 结束，{e} 错误 */
async function consumeTranslateNdjsonStream(
  r: Response,
  onDelta: (full: string) => void,
  isStale: () => boolean,
): Promise<void> {
  if (!r.body) {
    throw new Error("无响应体");
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buffer = "";
  let accum = "";
  let sawOk = false;
  while (true) {
    const { done, value } = await reader.read();
    if (isStale()) {
      return;
    }
    if (done) {
      break;
    }
    buffer += dec.decode(value, { stream: true });
    for (;;) {
      const ix = buffer.indexOf("\n");
      if (ix < 0) {
        break;
      }
      const line = buffer.slice(0, ix);
      buffer = buffer.slice(ix + 1);
      if (!line.trim()) {
        continue;
      }
      let o: { c?: string; e?: string; ok?: boolean };
      try {
        o = JSON.parse(line) as { c?: string; e?: string; ok?: boolean };
      } catch {
        throw new Error("翻译流解析失败。");
      }
      if (isStale()) {
        return;
      }
      if (typeof o.e === "string" && o.e) {
        throw new Error(o.e);
      }
      if (typeof o.c === "string") {
        accum += o.c;
        onDelta(accum);
      }
      if (o.ok === true) {
        sawOk = true;
        return;
      }
    }
  }
  if (buffer.trim() && !sawOk) {
    try {
      const o = JSON.parse(buffer) as { e?: string; ok?: boolean };
      if (o.e) {
        throw new Error(o.e);
      }
      if (o.ok === true) {
        sawOk = true;
      }
    } catch (e) {
      if (e instanceof Error && e.message !== "翻译流解析失败。") {
        throw e;
      }
    }
  }
  if (isStale()) {
    return;
  }
  if (!sawOk) {
    throw new Error("翻译流意外结束。");
  }
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
  const [translationDraft, setTranslationDraft] = useState("");
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [translationPending, setTranslationPending] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [asrRestartKey, setAsrRestartKey] = useState(0);
  const isLive = sessionState === "LIVE";
  const isLiveRef = useRef(isLive);
  isLiveRef.current = isLive;
  const pausedAccumulatedRef = useRef(0);
  const liveSegmentStartRef = useRef<number | null>(Date.now());
  const latestTranscriptRef = useRef("");
  /** 与当前译文已对齐的原文；整段模式下一一对应，非前缀增量 */
  const lastAppliedSourceRef = useRef("");
  const translateInFlightRef = useRef(false);
  /** 当前正在请求 LLM 的原文快照；用于避免「原文仅变长」时反复 abort 流式翻译。 */
  const translateFlightSourceRef = useRef("");
  const translateStableTimerRef = useRef<number | null>(null);
  const translateMaxLagTimerRef = useRef<number | null>(null);
  const uncommittedSinceRef = useRef<number | null>(null);
  const translationRef = useRef("");
  const translationCommittedRef = useRef("");
  const translationDraftRef = useRef("");
  const streamAbortRef = useRef<AbortController | null>(null);
  const streamGenRef = useRef(0);
  const armTranslationRef = useRef<() => void>(() => {});
  const { status: asrStatus, errorMessage: asrError, transcript, asrMode, clearTranscript } = useLiveAsr(
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

  const visibleTranslation = composeIncrementalTranslation(translation, translationDraft);
  const hasTranslation = Boolean(visibleTranslation.trim());
  const isAsrError = isLive && asrStatus === "error";
  const translationBody =
    visibleTranslation.trim()
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
    translationDraftRef.current = translationDraft;
  }, [translationDraft]);

  useEffect(() => {
    streamAbortRef.current?.abort();
    streamGenRef.current += 1;
    setTranslation("");
    setTranslationDraft("");
    setTranslationError(null);
    lastAppliedSourceRef.current = "";
    translationCommittedRef.current = "";
    uncommittedSinceRef.current = null;
  }, [sourceLang, targetLang]);

  useEffect(() => {
    latestTranscriptRef.current = transcript;
  }, [transcript]);

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

      const snapshot = latestTranscriptRef.current.trim();
      if (!snapshot) {
        uncommittedSinceRef.current = null;
        setTranslationPending(false);
        return;
      }
      if (snapshot === lastAppliedSourceRef.current) {
        uncommittedSinceRef.current = null;
        setTranslationPending(false);
        return;
      }

      if (translateInFlightRef.current) {
        const inflight = translateFlightSourceRef.current;
        if (snapshot === inflight) {
          return;
        }
        if (inflight && snapshot.startsWith(inflight)) {
          return;
        }
      }

      streamAbortRef.current?.abort();
      const myId = ++streamGenRef.current;
      const ac = new AbortController();
      streamAbortRef.current = ac;
      const sentSnapshot = snapshot;
      const committedAtRequest = translationCommittedRef.current.trim();
      const plan = sourceDeltaForNextRound(snapshot, lastAppliedSourceRef.current);
      const incremental = plan.incremental && Boolean(committedAtRequest);

      translateInFlightRef.current = true;
      translateFlightSourceRef.current = sentSnapshot;
      setTranslationPending(true);
      const previousVisibleTranslation =
        composeIncrementalTranslation(translationRef.current, translationDraftRef.current).trim()
        || committedAtRequest;
      let streamed = "";
      const translatePayload = JSON.stringify({
        text: incremental ? plan.requestText : sentSnapshot,
        source_language: getLangLlmName(sourceLang),
        target_language: getLangLlmName(targetLang),
        source_lang_code: sourceLang,
        target_lang_code: targetLang,
        previous_source_text: incremental ? plan.previousSource : undefined,
        previous_translation_text: incremental ? committedAtRequest : undefined,
      });
      const composeResult = (next: string) =>
        incremental ? composeIncrementalTranslation(committedAtRequest, next) : next.trim();
      const applyNonStreamResult = async (res: Response) => {
        if (!res.ok) {
          throw new Error(await readApiError(res));
        }
        const data = (await res.json()) as { translation?: string };
        const next = (data.translation || "").trim();
        if (myId !== streamGenRef.current) {
          return;
        }
        const nowSrc = latestTranscriptRef.current.trim();
        if (next && shouldApplyThisRound(sentSnapshot, nowSrc, next)) {
          const composed = composeResult(next);
          lastAppliedSourceRef.current = sentSnapshot;
          translationCommittedRef.current = composed;
          setTranslation(composed);
          setTranslationDraft("");
          setTranslationError(null);
        } else if (next) {
          // 不纳入已对齐的提交时，仍宜展示：优先已稳定译文，否则用本轮（避免重识别后把译区清成空）
          setTranslation(translationCommittedRef.current.trim() || composeResult(next));
          setTranslationDraft("");
          setTranslationError(null);
        } else {
          setTranslation(previousVisibleTranslation);
          setTranslationDraft("");
          setTranslationError("翻译端点未返回译文。");
        }
      };

      /**
       * 备用：POST /api/translate 与流式在服务端同一路径（流式 /chat/completions 聚合）；
       * 用于 404/HTTP 错、或流式体解析异常时。
       */
      const tryNonStreamOnly = async (): Promise<void> => {
        const r2 = await fetch(apiUrl("/api/translate"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: translatePayload,
          signal: ac.signal,
        });
        await applyNonStreamResult(r2);
      };

      try {
        const r = await fetch(apiUrl("/api/translate/stream"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: translatePayload,
          signal: ac.signal,
        });
        if (r.status === 404 || r.status === 405) {
          void r.body?.cancel();
          await tryNonStreamOnly();
          return;
        }
        if (!r.ok) {
          try {
            await tryNonStreamOnly();
            return;
          } catch {
            throw new Error(await readApiError(r));
          }
        }
        await consumeTranslateNdjsonStream(
          r,
          (full) => {
            if (myId !== streamGenRef.current) {
              return;
            }
            streamed = full;
            if (full.trim()) {
              if (incremental) {
                setTranslationDraft(full.trim());
              } else {
                setTranslationDraft(composeResult(full));
              }
              setTranslationError(null);
            }
          },
          () => myId !== streamGenRef.current,
        );
        if (myId !== streamGenRef.current) {
          return;
        }
        const nowSrc = latestTranscriptRef.current.trim();
        const done = streamed.trim();
        if (done && shouldApplyThisRound(sentSnapshot, nowSrc, done)) {
          const composed = composeResult(done);
          lastAppliedSourceRef.current = sentSnapshot;
          translationCommittedRef.current = composed;
          setTranslation(composed);
          setTranslationDraft("");
          setTranslationError(null);
        } else if (done) {
          setTranslation(translationCommittedRef.current.trim() || composeResult(done));
          setTranslationDraft("");
          setTranslationError(null);
        } else {
          setTranslation(previousVisibleTranslation);
          setTranslationDraft("");
          setTranslationError(null);
        }
      } catch (error) {
        const aborted = error instanceof DOMException && error.name === "AbortError"
          || (error instanceof Error && error.name === "AbortError");
        if (aborted) {
          if (myId !== streamGenRef.current) {
            return;
          }
          setTranslation(previousVisibleTranslation || composeResult(streamed));
          setTranslationDraft("");
          return;
        }
        const message = error instanceof Error ? error.message : "翻译失败";
        if (myId === streamGenRef.current) {
          let fallbackMessage: string | null = null;
          try {
            await tryNonStreamOnly();
            return;
          } catch (e2) {
            fallbackMessage = e2 instanceof Error ? e2.message : String(e2);
          }
          setTranslation(previousVisibleTranslation || composeResult(streamed));
          setTranslationDraft("");
          if (isEmptyTranslationStreamMessage(fallbackMessage)) {
            setTranslationError(null);
            return;
          }
          setTranslationError(
            enrichTranslationErrorDetail(
              mergeStreamAndTranslateFallbackError(message, fallbackMessage),
            ),
          );
        }
      } finally {
        if (myId === streamGenRef.current) {
          translateInFlightRef.current = false;
          translateFlightSourceRef.current = "";
        }
        uncommittedSinceRef.current = null;
        armTranslationRef.current();
        const latest = latestTranscriptRef.current.trim();
        if (myId === streamGenRef.current) {
          if (!latest || latest === lastAppliedSourceRef.current) {
            setTranslationPending(false);
          }
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
    if (text === lastAppliedSourceRef.current) {
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
      setTranslationPending(false);
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

  const clearSession = useCallback(() => {
    streamAbortRef.current?.abort();
    streamGenRef.current += 1;
    translateInFlightRef.current = false;
    translateFlightSourceRef.current = "";
    if (translateStableTimerRef.current != null) {
      window.clearTimeout(translateStableTimerRef.current);
      translateStableTimerRef.current = null;
    }
    if (translateMaxLagTimerRef.current != null) {
      window.clearTimeout(translateMaxLagTimerRef.current);
      translateMaxLagTimerRef.current = null;
    }
    clearTranscript();
    latestTranscriptRef.current = "";
    lastAppliedSourceRef.current = "";
    translationCommittedRef.current = "";
    uncommittedSinceRef.current = null;
    setTranslation("");
    setTranslationError(null);
    setTranslationPending(false);
  }, [clearTranscript]);

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
          <button
            type="button"
            onClick={clearSession}
            className="order-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-amber-200 hover:bg-amber-50/80 hover:text-amber-900 sm:order-none"
            title="清空当前已录入的原文与译文，不影响暂停/继续与麦克风"
          >
            清空
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
