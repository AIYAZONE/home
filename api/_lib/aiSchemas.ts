import { z } from 'zod';

export const CopilotCardSchema = z.object({
  type: z.enum(['navigate', 'open_modal', 'apply_draft', 'open_inbox', 'copy_text']),
  label: z.string().min(1),
  description: z.string().optional(),
  payload: z.record(z.string(), z.any()).default({}),
});

export const CopilotDraftSchema = z.object({
  draftId: z.string().min(1),
  kind: z.enum(['transaction', 'transaction_import', 'budget_adjustment', 'health_action_plan', 'health_metric', 'action_item']),
  title: z.string().min(1),
  data: z.record(z.string(), z.any()),
  requiresConfirm: z.literal(true),
});

export const CopilotResponseSchema = z.object({
  summary: z.string().min(1),
  cards: z.array(CopilotCardSchema).min(1),
  drafts: z.array(CopilotDraftSchema).optional(),
  warnings: z.array(z.string()).optional(),
  meta: z
    .object({
      traceId: z.string().min(1),
      toolId: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  module: z.string().optional(),
  page: z.string().optional(),
  context: z.record(z.string(), z.any()).optional(),
});

export type CopilotResponse = z.infer<typeof CopilotResponseSchema>;
