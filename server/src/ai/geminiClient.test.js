import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toGeminiSchema } from './geminiClient.js';

describe('Gemini response schemas', () => {
  it('converts Zod object schemas to the supported JSON schema subset', () => {
    const result = toGeminiSchema(z.object({
      title: z.string().min(1),
      suspects: z.array(z.object({ id: z.string() })).min(2)
    }));

    expect(result.type).toBe('object');
    expect(result.required).toContain('title');
    expect(result.properties.suspects.items.properties.id.type).toBe('string');
    expect(JSON.stringify(result)).not.toContain('$schema');
    expect(JSON.stringify(result)).not.toContain('additionalProperties');
  });
});
