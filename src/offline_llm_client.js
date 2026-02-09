/**
 * offline_llm_client.js — PRODUCTION
 * OpenAI-compatible LLM client for sovereign offline operation.
 * NO FALLBACK. Queries fail if LLM is unreachable.
 *
 * Supports: Ollama, vLLM, NVIDIA NIM, llama.cpp — any OpenAI-compatible server.
 */

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'http://llm:11434/v1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'ollama';
const LLM_MODEL_ID = process.env.LLM_MODEL_ID || 'llama3.2';
const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '120000', 10);

/**
 * Call a local OpenAI-compatible chat completion endpoint.
 * Returns the raw text content from the LLM.
 * Throws on failure — NO SILENT DEGRADATION.
 */
export async function chatCompletion({ system, user, temperature = 0, maxTokens = 512 }) {
  const url = `${OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`;
  const body = {
    model: LLM_MODEL_ID,
    temperature,
    top_p: 1,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`LLM HTTP ${res.status}: ${errText.slice(0, 300)}`);
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM returned empty content');

    return content.trim();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`LLM timed out after ${LLM_TIMEOUT_MS}ms — model may be loading or overloaded`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Call LLM and parse JSON from response.
 */
export async function chatCompletionJSON({ system, user, temperature = 0, maxTokens = 1024 }) {
  const raw = await chatCompletion({ system, user, temperature, maxTokens });
  let jsonStr = raw;
  const codeBlock = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlock) jsonStr = codeBlock[1].trim();
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) jsonStr = jsonMatch[0];
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`LLM did not return valid JSON: ${raw.slice(0, 200)}`);
  }
}

/**
 * Check if the LLM endpoint is reachable.
 */
export async function checkLLMHealth() {
  try {
    const url = `${OPENAI_BASE_URL.replace(/\/$/, '')}/models`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        signal: controller.signal
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      return { ok: true, models: data?.data?.map(m => m.id) || [] };
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
