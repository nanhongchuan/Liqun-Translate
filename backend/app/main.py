"""Local FastAPI entrypoint: BFF, ASR orchestration, and LLM proxy (M0: health only)."""

import asyncio
import json
import os
from typing import Any, Dict, Optional

import httpx

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.asr_service import is_asr_importable, transcribe_int16_16k_mono
from app.llm_settings import key_tail_for_display, load_raw, save_raw

_API_PREFIX = "/api"

_LLM_TEST_UA = "realtime-translate/0.1 (llm-test)"
_LLM_CLIENT: Optional[httpx.AsyncClient] = None


def _llm_upstream_error_snippet(parsed: Any) -> str:
    """OpenAI 兼容 JSON 里的 error 字段（部分网关 HTTP 2xx 仍带 error）。"""
    if not isinstance(parsed, dict) or "error" not in parsed:
        return ""
    e = parsed["error"]
    if isinstance(e, dict):
        return str(e.get("message", e.get("code", e)))[:200]
    return str(e)[:200]


def _parse_model_ids(parsed: Any) -> list[str]:
    """OpenAI-compatible /models payload -> model id list."""
    if not isinstance(parsed, dict):
        return []
    data = parsed.get("data")
    if not isinstance(data, list):
        return []
    ids: list[str] = []
    for item in data:
        if isinstance(item, dict) and isinstance(item.get("id"), str):
            ids.append(item["id"])
    return ids


def _log_translate_failure(status_code: int, detail: str, model: str, text: str) -> None:
    snippet = (detail or "").replace("\n", " ")[:500]
    print(
        f"[translate] upstream failed status={status_code} model={model} "
        f"text_len={len(text)} detail={snippet}",
        flush=True,
    )


app = FastAPI(title="Realtime Translate API", version="0.1.0")


@app.on_event("startup")
async def _startup() -> None:
    global _LLM_CLIENT
    ssl_verify = os.getenv("RT_LLM_SSL_VERIFY", "").strip().lower() not in ("0", "false", "no")
    _LLM_CLIENT = httpx.AsyncClient(
        timeout=httpx.Timeout(20.0, connect=8.0),
        verify=ssl_verify,
        limits=httpx.Limits(max_keepalive_connections=8, max_connections=16),
    )


@app.on_event("shutdown")
async def _shutdown() -> None:
    global _LLM_CLIENT
    if _LLM_CLIENT is not None:
        await _LLM_CLIENT.aclose()
        _LLM_CLIENT = None


def _llm_client() -> httpx.AsyncClient:
    if _LLM_CLIENT is None:
        raise HTTPException(status_code=503, detail="语言模型连接池未就绪，请稍后重试。")
    return _LLM_CLIENT

_origins_env = os.getenv("CORS_ORIGINS", "").strip()
if _origins_env:
    _cors_origins = [o.strip() for o in _origins_env.split(",") if o.strip()]
else:
    _cors_origins = [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
    ]

# 任意本机端口的页面（Vite 随机口、内嵌/浏览器预览、4173 等）可直连 127.0.0.1:18787，不依赖同域 /api 代理
_LOCAL_ORIGIN_RE = r"^https?://(127\.0\.0\.1|localhost)(:\d+)?$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_LOCAL_ORIGIN_RE,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _asr_status() -> Dict[str, Any]:
    if not is_asr_importable():
        return {"available": False, "import_error": "faster-whisper not installed"}
    return {
        "available": True,
        "model": (os.getenv("RT_ASR_MODEL", "base") or "base").strip() or "base",
    }


@app.get(f"{_API_PREFIX}/health")
def health() -> Dict[str, Any]:
    return {
        "ok": True,
        "service": "realtime-translate-api",
        "asr": _asr_status(),
        # 供前端与「仍在跑旧版 uvicorn」时的诊断区分（旧进程无此字段且无 LLM 路由会 404）
        "llm_settings": True,
        # 含 POST /api/settings/llm/test；旧进程无此字段
        "llm_test": True,
    }


class LlmSettingsOut(BaseModel):
    vendor: str
    base_url: str
    model: str
    api_key_configured: bool
    api_key_tail: Optional[str] = None


class LlmSettingsIn(BaseModel):
    vendor: str = Field(min_length=1, max_length=64)
    base_url: str = Field(min_length=1, max_length=2000)
    model: str = Field(min_length=1, max_length=200)
    api_key: str = Field(default="")


class TranslateIn(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    source_language: str = Field(default="auto", max_length=80)
    target_language: str = Field(min_length=1, max_length=80)


class TranslateOut(BaseModel):
    ok: bool
    translation: str


@app.get(f"{_API_PREFIX}/settings/llm", response_model=LlmSettingsOut)
def get_llm_settings() -> LlmSettingsOut:
    raw = load_raw()
    key = (raw.get("api_key") or "").strip()
    return LlmSettingsOut(
        vendor=(raw.get("vendor") or "openai-compatible")[:64],
        base_url=(raw.get("base_url") or "")[:2000],
        model=(raw.get("model") or "")[:200],
        api_key_configured=bool(key),
        api_key_tail=key_tail_for_display(key),
    )


@app.post(f"{_API_PREFIX}/settings/llm")
def post_llm_settings(body: LlmSettingsIn) -> Dict[str, Any]:
    b = (body.base_url or "").strip()
    m = (body.model or "").strip()
    v = (body.vendor or "").strip()
    if not b.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=400,
            detail="Base URL 须以 http:// 或 https:// 开头",
        )
    new_key = (body.api_key or "").strip()
    raw = load_raw()
    old_key = (raw.get("api_key") or "").strip()
    if not new_key and not old_key:
        raise HTTPException(status_code=400, detail="请填写 API Key")
    final_key = new_key if new_key else old_key
    if not final_key:
        raise HTTPException(status_code=400, detail="请填写 API Key")
    save_raw(
        {
            "vendor": v,
            "base_url": b,
            "model": m,
            "api_key": final_key,
        },
    )
    return {"ok": True, "message": "saved"}


@app.post(f"{_API_PREFIX}/settings/llm/test")
def test_llm_settings(body: LlmSettingsIn) -> Dict[str, Any]:
    b = (body.base_url or "").strip()
    m = (body.model or "").strip()
    if not b.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=400,
            detail="Base URL 须以 http:// 或 https:// 开头",
        )
    new_key = (body.api_key or "").strip()
    raw = load_raw()
    old_key = (raw.get("api_key") or "").strip()
    if not new_key and not old_key:
        raise HTTPException(
            status_code=400,
            detail="请填写 API Key，或先点击「保存」再测已存 Key。",
        )
    final_key = new_key if new_key else old_key
    base = b.rstrip("/")
    ssl_verify = os.getenv("RT_LLM_SSL_VERIFY", "").strip().lower() not in ("0", "false", "no")
    headers = {
        "Authorization": f"Bearer {final_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": _LLM_TEST_UA,
    }
    try:
        with httpx.Client(timeout=25.0, verify=ssl_verify) as client:
            models_r = client.get(f"{base}/models", headers=headers)
            models_parsed: Any
            try:
                models_parsed = models_r.json()
            except (json.JSONDecodeError, TypeError, ValueError):
                models_parsed = None
            models_err = _llm_upstream_error_snippet(models_parsed)
            if 200 <= models_r.status_code < 300 and not models_err:
                model_ids = _parse_model_ids(models_parsed)
                if not model_ids:
                    return {"ok": True, "message": "连接成功，端点与 Key 有效。"}
                if m in model_ids:
                    return {"ok": True, "message": "连接成功，模型可用。"}
                preview = "、".join(model_ids[:8])
                more = " 等" if len(model_ids) > 8 else ""
                raise HTTPException(
                    status_code=400,
                    detail=f"端点与 Key 有效，但模型列表中未找到 {m}。可用模型示例：{preview}{more}",
                )
            if models_r.status_code in (401, 403):
                if models_err:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Key 或权限无效（HTTP {models_r.status_code}）：{models_err}",
                    )
                raise HTTPException(
                    status_code=400,
                    detail="Key 或权限无效（HTTP 401/403）。",
                )

            # Some OpenAI-compatible gateways do not expose /models. Fall back to
            # a minimal chat request only when model listing is unavailable.
            r = client.post(
                f"{base}/chat/completions",
                headers=headers,
                json={
                    "model": m,
                    "messages": [{"role": "user", "content": "ping"}],
                    "max_tokens": 8,
                },
            )
    except httpx.ConnectError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"无法连接：{str(exc)[:200]}",
        ) from exc
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=400,
            detail="请求超时，请检查网络与 Base URL。",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"请求失败：{str(exc)[:200]}",
        ) from exc

    try:
        parsed: Any = r.json()
    except (json.JSONDecodeError, TypeError, ValueError):
        parsed = None
    err_snip = _llm_upstream_error_snippet(parsed) if parsed is not None else ""

    if 200 <= r.status_code < 300:
        if err_snip:
            raise HTTPException(
                status_code=400,
                detail=f"端点已响应（HTTP {r.status_code}），但返回错误：{err_snip}",
            )
        return {"ok": True, "message": "连接成功，兼容端点有响应。"}
    if r.status_code in (401, 403):
        if err_snip:
            raise HTTPException(
                status_code=400,
                detail=f"Key 或权限无效（HTTP {r.status_code}）：{err_snip}",
            )
        raise HTTPException(
            status_code=400,
            detail="Key 或权限无效（HTTP 401/403）。",
        )
    if not err_snip:
        err_snip = (r.text or "")[:200]
    msg = f"端点返回 HTTP {r.status_code}"
    if err_snip.strip():
        msg += f"：{err_snip.strip()}"
    raise HTTPException(status_code=400, detail=msg)


@app.post(f"{_API_PREFIX}/translate", response_model=TranslateOut)
async def translate_text(body: TranslateIn) -> TranslateOut:
    raw = load_raw()
    base_url = (raw.get("base_url") or "").strip().rstrip("/")
    model = (raw.get("model") or "").strip()
    api_key = (raw.get("api_key") or "").strip()
    if not base_url or not model or not api_key:
        raise HTTPException(
            status_code=400,
            detail="请先在设置中保存语言模型配置。",
        )
    if not base_url.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=400,
            detail="已保存的 Base URL 无效，请在设置中检查。",
        )

    src = (body.source_language or "auto").strip() or "auto"
    tgt = (body.target_language or "").strip()
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="没有可翻译的原文。")

    max_tokens = min(220, max(48, len(text) * 3 + 24))
    try:
        r = await _llm_client().post(
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "realtime-translate/0.1 (translate)",
            },
            json={
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Translate into the target language. "
                            "Return only the translation. No explanations, markdown, or quotes."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Source language: {src}\n"
                            f"Target language: {tgt}\n\n"
                            f"Text:\n{text}"
                        ),
                    },
                ],
                "temperature": 0,
                "max_tokens": max_tokens,
            },
        )
    except httpx.ConnectError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"无法连接语言模型端点：{str(exc)[:200]}",
        ) from exc
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=400,
            detail="翻译请求超时，请检查网络或模型响应速度。",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"翻译请求失败：{str(exc)[:200]}",
        ) from exc

    try:
        parsed: Any = r.json()
    except (json.JSONDecodeError, TypeError, ValueError):
        parsed = None
    err_snip = _llm_upstream_error_snippet(parsed) if parsed is not None else ""
    if not (200 <= r.status_code < 300):
        detail = err_snip or (r.text or "")[:200]
        _log_translate_failure(r.status_code, detail, model, text)
        raise HTTPException(
            status_code=400,
            detail=f"翻译端点返回 HTTP {r.status_code}{f'：{detail}' if detail else ''}",
        )
    if err_snip:
        _log_translate_failure(r.status_code, err_snip, model, text)
        raise HTTPException(status_code=400, detail=f"翻译端点返回错误：{err_snip}")
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="翻译端点返回了非 JSON 响应。")
    choices = parsed.get("choices")
    content = ""
    if isinstance(choices, list) and choices:
        first = choices[0]
        if isinstance(first, dict):
            message = first.get("message")
            if isinstance(message, dict) and isinstance(message.get("content"), str):
                content = message["content"]
            elif isinstance(first.get("text"), str):
                content = first["text"]
    translation = content.strip()
    if not translation:
        raise HTTPException(status_code=400, detail="翻译端点未返回译文。")
    return TranslateOut(ok=True, translation=translation)


@app.websocket(f"{_API_PREFIX}/asr/ws")
async def asr_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    if not is_asr_importable():
        try:
            await websocket.send_json(
                {
                    "type": "error",
                    "message": "asr_unavailable",
                    "detail": "faster-whisper 未安装。在 backend 目录执行 pip install -r requirements.txt 后重试。",
                }
            )
        except Exception:
            pass
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
        return
    language: Optional[str] = "en"
    try:
        first = await websocket.receive()
    except WebSocketDisconnect:
        return
    if first.get("type") != "websocket.receive":
        return
    text0 = first.get("text")
    if not isinstance(text0, str):
        await websocket.close(code=1003, reason="first message must be JSON config string")
        return
    try:
        cfg = json.loads(text0)
    except json.JSONDecodeError:
        await websocket.close(code=1003, reason="invalid JSON config")
        return
    if cfg.get("type") != "config":
        await websocket.close(code=1003, reason="expected type config")
        return
    raw_lang = cfg.get("language")
    if isinstance(raw_lang, str) and raw_lang:
        language = None if raw_lang == "auto" else raw_lang

    loop = asyncio.get_running_loop()

    try:
        while True:
            msg = await websocket.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            b = msg.get("bytes")
            if not b:
                continue
            if not isinstance(b, (bytes, bytearray, memoryview)):
                continue

            def _run() -> str:
                return transcribe_int16_16k_mono(
                    bytes(b),
                    language=language,
                )

            try:
                text = await loop.run_in_executor(None, _run)
            except Exception as exc:  # noqa: BLE001
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": "asr failed",
                        "detail": str(exc)[:200],
                    }
                )
                continue

            if text:
                await websocket.send_json(
                    {
                        "type": "transcript",
                        "text": text,
                    }
                )
    except WebSocketDisconnect:
        pass
