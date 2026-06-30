import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';

const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 8000;

const DEFAULT_SYSTEM = `You are a helpful assistant for the Onix Engineering Consultancy ERP web app.
Answer clearly and concisely. You help with tasks, projects, HR, contracts, clients, and general ERP usage.
If you are unsure about company-specific data, say you do not have access to live database records and suggest where in the app the user might look.
Do not invent private or sensitive data about employees or clients.`;

function trimMessages(
  raw: unknown,
): { role: 'user' | 'assistant'; content: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of raw.slice(-MAX_MESSAGES)) {
    if (!m || typeof m !== 'object') continue;
    const role = (m as { role?: string }).role;
    const content = String((m as { content?: string }).content ?? '').trim();
    if (!content) continue;
    if (role !== 'user' && role !== 'assistant') continue;
    out.push({
      role,
      content: content.slice(0, MAX_MESSAGE_CHARS),
    });
  }
  return out;
}

async function callGroq(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.5,
      max_tokens: 2048,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err =
      (data?.error as { message?: string } | undefined)?.message ||
      `Groq HTTP ${res.status}`;
    throw new Error(err);
  }
  const choices = data?.choices as { message?: { content?: string } }[] | undefined;
  const text = choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty response from Groq');
  return text;
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
): Promise<string> {
  const contents: { role: string; parts: { text: string }[] }[] = [];
  for (const m of messages) {
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    });
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 2048,
      },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err =
      (data?.error as { message?: string } | undefined)?.message ||
      `Gemini HTTP ${res.status}`;
    throw new Error(err);
  }
  const candidates = data?.candidates as
    | { content?: { parts?: { text?: string }[] } }[]
    | undefined;
  const parts = candidates?.[0]?.content?.parts;
  const text = parts?.map((p) => p.text || '').join('').trim();
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

/** GET — whether server-side AI is configured (no secrets exposed). */
export const getAiAssistantStatus = async (
  _req: AuthRequest,
  res: Response,
): Promise<void> => {
  const groq = Boolean(process.env.GROQ_API_KEY?.trim());
  const gemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  const provider = groq ? 'groq' : gemini ? 'gemini' : 'none';
  res.json({
    success: true,
    data: {
      configured: provider !== 'none',
      provider,
    },
  });
};

/** POST — proxy chat to Groq (free tier) or Google Gemini (free tier). */
export const postAiAssistantChat = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const groqKey = process.env.GROQ_API_KEY?.trim();
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    const groqModel =
      process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile';
    const geminiModel =
      process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash';

    if (!groqKey && !geminiKey) {
      res.status(503).json({
        success: false,
        code: 'NO_AI_PROVIDER',
        message:
          'AI assistant is not configured. Set GROQ_API_KEY or GEMINI_API_KEY on the server (see AI_ASSISTANT_README in the frontend repo).',
      });
      return;
    }

    const body = req.body as {
      messages?: unknown;
      pageContext?: string;
    };
    const messages = trimMessages(body?.messages);
    if (messages.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Provide a non-empty messages array with user/assistant roles.',
      });
      return;
    }
    if (messages[messages.length - 1].role !== 'user') {
      res.status(400).json({
        success: false,
        message: 'Last message must be from the user.',
      });
      return;
    }

    const pageContext =
      typeof body.pageContext === 'string'
        ? body.pageContext.trim().slice(0, 2000)
        : '';
    const systemPrompt = pageContext
      ? `${DEFAULT_SYSTEM}\n\nCurrent UI context: ${pageContext}`
      : DEFAULT_SYSTEM;

    let reply: string;
    let provider: 'groq' | 'gemini';
    if (groqKey) {
      provider = 'groq';
      reply = await callGroq(groqKey, groqModel, systemPrompt, messages);
    } else {
      provider = 'gemini';
      reply = await callGemini(geminiKey!, geminiModel, systemPrompt, messages);
    }

    res.json({
      success: true,
      data: {
        reply,
        provider,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Chat failed';
    console.error('❌ AI assistant chat error:', message);
    res.status(502).json({
      success: false,
      message,
    });
  }
};
