#!/usr/bin/env python3
"""本机 API 冒烟：健康检查 + 流式/非流式翻译（需已保存 LLM 配置）。"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def _get(url: str, timeout: float) -> tuple[int, str]:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read().decode("utf-8", errors="replace")


def _post_json(url: str, body: dict, timeout: float) -> tuple[int, str]:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read().decode("utf-8", errors="replace")


def main() -> int:
    base = os.environ.get("RT_SMOKE_API_BASE", "http://127.0.0.1:18787").rstrip("/")
    stream_timeout = float(os.environ.get("RT_SMOKE_STREAM_TIMEOUT", "120"))
    json_timeout = float(os.environ.get("RT_SMOKE_JSON_TIMEOUT", "120"))

    print(f"BASE={base}")

    try:
        code, text = _get(f"{base}/api/health", 15.0)
    except urllib.error.URLError as e:
        print(f"FAIL: health GET: {e}", file=sys.stderr)
        return 1
    if code != 200:
        print(f"FAIL: health HTTP {code}", file=sys.stderr)
        return 1
    h = json.loads(text)
    if not h.get("ok"):
        print("FAIL: health ok!=true", file=sys.stderr)
        return 1
    if not h.get("llm_test"):
        print("FAIL: health missing llm_test (old API?)", file=sys.stderr)
        return 1
    print("OK: health")

    body = {
        "text": "smoke hello",
        "source_language": "English",
        "target_language": "Simplified Chinese",
        "source_lang_code": "en",
        "target_lang_code": "zh",
    }

    try:
        code, raw = _post_json(f"{base}/api/translate/stream", body, stream_timeout)
    except urllib.error.HTTPError as e:
        print(f"FAIL: translate/stream HTTP {e.code}: {e.read()[:500]!r}", file=sys.stderr)
        return 1
    except urllib.error.URLError as e:
        print(f"FAIL: translate/stream: {e}", file=sys.stderr)
        return 1
    if code != 200:
        print(f"FAIL: translate/stream HTTP {code} body={raw[:300]!r}", file=sys.stderr)
        return 1
    stream_empty_fallback = "翻译流未返回内容" in raw
    if not stream_empty_fallback and '"ok": true' not in raw and '"ok":true' not in raw.replace(" ", ""):
        print(f"FAIL: translate/stream no ok line: {raw[:500]!r}", file=sys.stderr)
        return 1
    if stream_empty_fallback:
        print("OK: translate/stream empty, will verify /api/translate fallback")
    else:
        print("OK: translate/stream")

    try:
        code, raw = _post_json(f"{base}/api/translate", body, json_timeout)
    except urllib.error.HTTPError as e:
        print(f"FAIL: translate HTTP {e.code}: {e.read()[:500]!r}", file=sys.stderr)
        return 1
    except urllib.error.URLError as e:
        print(f"FAIL: translate: {e}", file=sys.stderr)
        return 1
    if code != 200:
        print(f"FAIL: translate HTTP {code} body={raw[:300]!r}", file=sys.stderr)
        return 1
    j = json.loads(raw)
    if not j.get("ok") or not (j.get("translation") or "").strip():
        print(f"FAIL: translate bad JSON: {raw[:300]!r}", file=sys.stderr)
        return 1
    print("OK: translate")

    print("ALL PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
