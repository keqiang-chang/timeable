/* DeepSeek 客户端（OpenAI 兼容接口）
 *
 * 已实测：api.deepseek.com 返回了 CORS 头，浏览器可以直接调用，
 * 不需要额外的后端代理。API Key 只保存在使用者的手机上。
 */

window.TT = window.TT || {};

TT.AI = (function () {
"use strict";

const DEFAULT_BASE = "https://api.deepseek.com";
const MODELS = [
  { id: "deepseek-chat", label: "deepseek-chat（快，日常够用）" },
  { id: "deepseek-reasoner", label: "deepseek-reasoner（慢，推理更强）" },
];

class AIError extends Error {
  constructor(message, kind) {
    super(message);
    this.name = "AIError";
    this.kind = kind;
  }
}

function fromStatus(status, body) {
  const tail = (body || "").slice(0, 180);
  if (status === 401) return new AIError("API Key 不对或已失效，到「我的 → DeepSeek」重新填一次。", "auth");
  if (status === 402) return new AIError("DeepSeek 账户余额不足，去平台充点钱再试。", "balance");
  if (status === 429) return new AIError("请求太频繁了，歇十几秒再试。", "rate");
  if (status === 400) return new AIError("请求被拒绝：" + tail, "bad");
  if (status >= 500) return new AIError("DeepSeek 服务暂时不可用（HTTP " + status + "），稍后再试。", "server");
  return new AIError("请求失败（HTTP " + status + "）：" + tail, "http");
}

async function readStream(res, onDelta) {
  const reader = res.body.getReader();
  const dec = new TextDecoder("utf-8");
  let buf = "";
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, "");
      buf = buf.slice(nl + 1);
      if (!line || line.startsWith(":")) continue;
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return full;
      let j;
      try { j = JSON.parse(payload); } catch (e) { continue; }
      const ch = j.choices && j.choices[0];
      const piece = (ch && (ch.delta ? ch.delta.content : ch.message && ch.message.content)) || "";
      if (piece) { full += piece; if (onDelta) onDelta(piece, full); }
    }
  }
  return full;
}

/** 发一次请求。stream=true 时逐段回调 onDelta。 */
async function chat(opts) {
  const { cfg, messages, stream, json, temperature, signal, onDelta } = opts;
  const base = String(cfg.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
  if (!cfg.apiKey) {
    throw new AIError("还没有填 API Key。到「我的 → DeepSeek」里填一个。", "nokey");
  }

  const body = {
    model: cfg.model || "deepseek-chat",
    messages,
    stream: !!stream,
  };
  if (json) body.response_format = { type: "json_object" };
  if (typeof temperature === "number") body.temperature = temperature;

  let res;
  try {
    res = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + cfg.apiKey,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e && e.name === "AbortError") throw e;
    throw new AIError("连不上 DeepSeek。检查手机有没有网，或者确认「接口地址」没填错。", "network");
  }

  if (!res.ok) {
    let txt = "";
    try { txt = await res.text(); } catch (e) {}
    throw fromStatus(res.status, txt);
  }

  if (!stream) {
    const j = await res.json();
    const c = j.choices && j.choices[0];
    return (c && ((c.message && c.message.content) || c.text)) || "";
  }
  return readStream(res, onDelta);
}

/** 让模型返回 JSON，并容错掉 ``` 包裹和前后废话。 */
async function askJSON(opts) {
  const raw = await chat(Object.assign({}, opts, { json: true, temperature: 0.7 }));
  let s = String(raw).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try {
    return JSON.parse(s);
  } catch (e) {
    throw new AIError("模型返回的内容不是合法 JSON，再点一次「重新生成」试试。", "parse");
  }
}

return { chat, askJSON, AIError, DEFAULT_BASE, MODELS };
})();
