// electron/ai-engine.ts
// Multi-provider AI engine: Groq (free) → Gemini (free)

import { ipcMain } from 'electron';
import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `You are a real-time AI interview assistant.
The user is in a live job interview. Answer clearly and confidently.

Rules:
- Keep answers under 120 words for general/behavioral questions
- For coding questions: give approach first, then clean code with comments
- For system design: give high-level architecture briefly
- Sound natural and human — like a confident candidate
- Never start with "Certainly!", "Great question!", or "Of course!"
- Be direct, specific, and concise`;

export function registerAIHandlers() {

  // Setup providers
  const groq = process.env.GROQ_API_KEY
    ? new Groq({ apiKey: process.env.GROQ_API_KEY })
    : null;

  const gemini = process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;

  ipcMain.handle('ai:get-answer', async (_event, question: string) => {
    // Route stream events back to the window that invoked the handler,
    // so both the overlay window AND the main dashboard can use triggerAnswer.
    const sender = _event.sender;

    // ── PROVIDER 1: Groq (fastest free option) ──
    if (groq) {
      try {
        console.log('[AI] Using Groq...');

        const stream = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: question }
          ],
          stream: true,
          max_tokens: 500,
          temperature: 0.7,
        });

        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || '';

          if (text) {
            sender.send('ai:answer-chunk', text);
          }
        }

        sender.send('ai:answer-done');
        return;

      } catch (err: any) {
        console.warn('[AI] Groq failed:', err.message, '— trying Gemini...');
      }
    }

    // ── PROVIDER 2: Gemini (free fallback) ──
    if (gemini) {
      try {
        console.log('[AI] Using Gemini...');

        const model = gemini.getGenerativeModel({
          model: 'gemini-2.0-flash',
          systemInstruction: SYSTEM_PROMPT,
        });

        const result = await model.generateContentStream(question);

        for await (const chunk of result.stream) {
          const text = chunk.text();

          if (text) {
            sender.send('ai:answer-chunk', text);
          }
        }

        sender.send('ai:answer-done');
        return;

      } catch (err: any) {
        console.warn('[AI] Gemini failed:', err.message);
      }
    }

    // ── NO PROVIDERS AVAILABLE ──
    console.error('[AI] All providers failed');

    sender.send(
      'ai:answer-chunk',
      '⚠️ No AI provider available.\nCheck your GROQ_API_KEY or GEMINI_API_KEY in .env'
    );

    sender.send('ai:answer-done');
  });
}