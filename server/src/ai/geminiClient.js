import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errors.js';

const ai = env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }) : null;

export function toGeminiSchema(schema) {
  const jsonSchema = z.toJSONSchema(schema);
  const clean = (value) => {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !['$schema', 'additionalProperties', 'minLength', 'maxLength', 'minItems', 'maxItems'].includes(key))
      .map(([key, child]) => [key, clean(child)]));
  };
  return clean(jsonSchema);
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function generateJson(prompt, schema) {
  if (!ai) throw new AppError(503, 'AI_UNAVAILABLE', 'Case generation is temporarily unavailable. Please try again later.');
  let repairPrompt = '';
  let lastError;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await pause(500 * (2 ** (attempt - 1)));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await ai.models.generateContent({
        model: env.GEMINI_TEXT_MODEL,
        contents: prompt + repairPrompt,
        config: {
          abortSignal: controller.signal,
          httpOptions: { timeout: 60_000 },
          responseMimeType: 'application/json',
          responseSchema: toGeminiSchema(schema)
        }
      });
      const parsed = JSON.parse(response.text || '');
      return schema.parse(parsed);
    } catch (error) {
      lastError = error;
      repairPrompt = '\nReturn corrected JSON only. Previous response failed parsing or validation: ' + String(error.message).slice(0, 800);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error('Gemini returned no valid JSON.');
}
