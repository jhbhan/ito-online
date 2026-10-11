import { z } from 'zod';
import starter from './starter.json';

const PromptPackSchema = z.object({
  schemaVersion: z.literal(1), id: z.string(), name: z.string(),
  prompts: z.array(z.object({ id: z.string(), text: z.string(), lowLabel: z.string(), highLabel: z.string(), category: z.string().optional() })),
});
const pack = PromptPackSchema.parse(starter);
export const promptPackName = pack.name;
export const prompts = pack.prompts;
