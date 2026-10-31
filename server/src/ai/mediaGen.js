import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function createImage(prompt) {
  if (!env.GEMINI_API_KEY) throw new Error('Gemini image generation is not configured.');
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  let lastError;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await pause(500);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await ai.models.generateContent({
        model: env.GEMINI_IMAGE_MODEL,
        contents: prompt,
        config: {
          abortSignal: controller.signal,
          httpOptions: { timeout: 90_000 },
          responseModalities: ['IMAGE', 'TEXT']
        }
      });
      const part = response.candidates?.[0]?.content?.parts?.find((candidate) => candidate.inlineData?.data);
      if (!part) throw new Error('Gemini did not return an image.');

      const directory = path.resolve(env.UPLOAD_DIR);
      await fs.mkdir(directory, { recursive: true });
      const extension = part.inlineData.mimeType === 'image/jpeg' ? '.jpg' : '.png';
      const name = crypto.randomUUID() + extension;
      await fs.writeFile(path.join(directory, name), Buffer.from(part.inlineData.data, 'base64'));
      return '/uploads/' + name;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error('Image generation failed.');
}
