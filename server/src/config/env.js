import 'dotenv/config';
import { z } from 'zod';

export const env = z.object({
  PORT: z.coerce.number().default(5000), MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/ai-mystery-room'),
  JWT_SECRET: z.string().min(16).default('development-secret-change-this'), CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  GEMINI_API_KEY: z.string().optional(), GEMINI_TEXT_MODEL: z.string().default('gemini-2.5-flash'), GEMINI_IMAGE_MODEL: z.string().default('gemini-2.0-flash-preview-image-generation'),
  GEMINI_VIDEO_MODEL: z.string().optional(), ENABLE_VIDEO: z.string().default('false'), STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  RATE_LIMIT_CASES_PER_DAY: z.coerce.number().int().positive().default(5), UPLOAD_DIR: z.string().default('./uploads')
}).superRefine((config, context) => {
  if (process.env.NODE_ENV === 'production' && config.JWT_SECRET === 'development-secret-change-this') {
    context.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'JWT_SECRET must be set to a production secret.' });
  }
}).parse(process.env);
