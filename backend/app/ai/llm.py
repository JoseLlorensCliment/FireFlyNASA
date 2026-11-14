"""Generative-model adapter (JSON answers for the RAG assistant).

LLM_PROVIDER=gemini (default): Gemini API, model GEMINI_MODEL (default gemini-3.8-flash),
                               called through google-genai `models.generate_content`.
LLM_PROVIDER=groq            : legacy option kept from the first prototype.
"""
from __future__ import annotations

import json

from app.core.config import get_settings


class LLMUnavailable(RuntimeError):
    pass


def _parse(content: str) -> dict:
    content = (content or "").strip()
    if content.startswith("```"):  # tolerate fenced JSON
        content = content.strip("`")
        content = content[content.find("{"):]
    try:
        return json.loads(content or "{}")
    except json.JSONDecodeError as exc:
        raise LLMUnavailable("The model returned malformed JSON") from exc


def _gemini(system: str, user: str, max_tokens: int) -> tuple[dict, str]:
    s = get_settings()
    if not s.gemini_api_key:
        raise LLMUnavailable("GEMINI_API_KEY is not set. Add it to .env to enable generated answers.")
    from google import genai
    from google.genai import types

    cfg = {"system_instruction": system, "response_mime_type": "application/json", "max_output_tokens": max_tokens}
    if s.gemini_thinking_level:
        cfg["thinking_config"] = types.ThinkingConfig(thinking_level=s.gemini_thinking_level.upper())
    try:
        client = genai.Client(api_key=s.gemini_api_key)
        resp = client.models.generate_content(model=s.gemini_model, contents=user,
                                              config=types.GenerateContentConfig(**cfg))
    except Exception as exc:  # noqa: BLE001 - surface provider errors (quota, auth, model name)
        raise LLMUnavailable(f"Gemini request failed: {exc}") from exc
    return _parse(resp.text), s.gemini_model


def _groq(system: str, user: str, temperature: float, max_tokens: int) -> tuple[dict, str]:
    s = get_settings()
    if not s.groq_api_key:
        raise LLMUnavailable("GROQ_API_KEY is not set. Add it to .env to enable generated answers.")
    from groq import Groq

    try:
        resp = Groq(api_key=s.groq_api_key).chat.completions.create(
            model=s.groq_model, temperature=temperature, max_tokens=max_tokens,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_object"})
    except Exception as exc:  # noqa: BLE001
        raise LLMUnavailable(f"Groq request failed: {exc}") from exc
    return _parse(resp.choices[0].message.content), s.groq_model


def complete_json(system: str, user: str, temperature: float = 0.1, max_tokens: int = 8192) -> tuple[dict, str]:
    """Return (parsed JSON object, model id)."""
    provider = get_settings().llm_provider
    if provider == "gemini":
        return _gemini(system, user, max_tokens)
    if provider == "groq":
        return _groq(system, user, temperature, max_tokens)
    raise LLMUnavailable(f"Unsupported LLM_PROVIDER '{provider}' (use gemini or groq)")
