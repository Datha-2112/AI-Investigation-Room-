import {z} from 'zod';
export const registerSchema=z.object({email:z.email().transform(v=>v.toLowerCase()),displayName:z.string().trim().min(2).max(40),password:z.string().min(8)});
export const loginSchema=z.object({email:z.email().transform(v=>v.toLowerCase()),password:z.string().min(1)});
export const caseSchema=z.object({scenario:z.string().trim().min(20).max(500),difficulty:z.enum(['Easy','Medium','Hard']).default('Medium'),tone:z.enum(['Realistic','Noir','Cozy']).default('Realistic')});
export const notesSchema=z.object({notes:z.string().max(5000).optional(),viewedEvidence:z.array(z.string()).optional(),pinnedEvidence:z.array(z.string()).optional()});
export const accuseSchema=z.object({suspectId:z.string().min(1),reasoning:z.string().max(1000).default('')});
