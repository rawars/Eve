import type { AiEditRequest, AiEditResponse } from '@eve/contracts'
import { body, error, json } from './http'
import type { AuthenticatedUser, Env } from './types'

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const MAX_CONTEXT_CHARACTERS = 750_000

const responseSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    elements: {
      type: 'array', maxItems: 250,
      items: { type: 'object', additionalProperties: true },
    },
  },
  required: ['summary', 'elements'],
} as const

export async function generateAiEdit(request: Request, env: Env, user: AuthenticatedUser, fileId: string) {
  const file = await env.DB.prepare('SELECT id FROM files WHERE id = ? AND owner_id = ?').bind(fileId, user.id).first()
  if (!file) return error('NOT_FOUND', 'File not found.', 404)
  const value = await body<AiEditRequest>(request)
  const instruction = typeof value?.instruction === 'string' ? value.instruction.trim() : ''
  const targetId = typeof value?.targetId === 'string' ? value.targetId : ''
  if (!instruction || instruction.length > 4_000) return error('INVALID_INSTRUCTION', 'Enter an instruction of up to 4,000 characters.')
  if (!targetId || !value?.context || typeof value.context !== 'object') return error('INVALID_CONTEXT', 'A selected container context is required.')
  const context = JSON.stringify(value.context)
  if (context.length > MAX_CONTEXT_CHARACTERS) return error('CONTEXT_TOO_LARGE', 'The selected structure is too large for an AI edit.', 413)

  const result = await env.AI.run(MODEL, {
    messages: [
      { role: 'system', content: `You edit a JSON canvas structure. Return the complete replacement structure for the selected root container and all descendants. Preserve the root id and type. Every child must use parentId and ultimately descend from the root. Use absolute canvas coordinates. Preserve valid existing properties unless the request changes them. Use only rectangle, circle, frame, text, or image element types. Never return markdown or commentary outside the JSON response.` },
      { role: 'user', content: `Target id: ${targetId}\nInstruction: ${instruction}\nCurrent context JSON:\n${context}` },
    ],
    response_format: { type: 'json_schema', json_schema: responseSchema },
  } as never)
  const response = (result as { response?: unknown }).response
  if (!response || typeof response !== 'object') return error('INVALID_AI_RESPONSE', 'The AI did not return a usable structure.', 502)
  const parsed = response as Partial<AiEditResponse>
  if (typeof parsed.summary !== 'string' || !Array.isArray(parsed.elements)) return error('INVALID_AI_RESPONSE', 'The AI response did not match the expected structure.', 502)
  return json({ summary: parsed.summary.slice(0, 240), elements: parsed.elements } satisfies AiEditResponse)
}
