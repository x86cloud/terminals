import type { AgentMode, ApprovalDecision, PlanChecklistItem, StepNode } from '@/types'

export type { AgentMode, ApprovalDecision, PlanChecklistItem }

export interface SubAgentReport {
    status: string
    summary: string
    commands?: string[]
    keyOutput?: string
    conclusion?: string
}

export interface AskQuestionItem {
    id?: string
    question: string
    options?: string[]
    multiSelect?: boolean
}

export type TimelineItem =
    | {
          kind: 'thought'
          id: string
          title: string
          text: string
          durationMs: number
          streaming?: boolean
      }
    | {
          kind: 'content'
          id: string
          text: string
          streaming?: boolean
      }
    | {
          kind: 'tool'
          id: string
          tool: string
          title: string
          args: any
          result?: any
          error?: string
          observation?: string
          status: 'running' | 'completed' | 'failed' | 'cancelled'
          durationMs: number
      }
    | {
          kind: 'exec'
          id: string
          command: string
          reason: string
          stdout: string
          stderr: string
          exitCode: number
          durationMs: number
          truncated: boolean
          status: 'running' | 'completed' | 'failed' | 'cancelled'
      }
    | {
          kind: 'approval'
          id: string
          approvalId: string
          stepId: string
          approvalKind?: 'local_write' | string
          command: string
          risk: 'modify' | 'danger' | string
          reason: string
          filePath?: string
          writeMode?: string
          existed?: boolean
          bytes?: number
          preview?: string
          previewTruncated?: boolean
          mainVerdict?: string | null
          canAlwaysAllow: boolean
          decision?: ApprovalDecision
          by?: 'main' | 'user' | 'whitelist' | string
          status: 'waiting' | 'completed' | 'failed'
          durationMs: number
      }
    | {
          kind: 'ask_user'
          id: string
          askId: string
          stepId: string
          questions: AskQuestionItem[]
          answers?: Record<string, any>
          cancelled?: boolean
          status: 'waiting' | 'completed' | 'failed'
      }
    | {
          kind: 'plan'
          id: string
          steps: PlanChecklistItem[]
      }
    | {
          kind: 'subagent_run'
          id: string
          subRunId: string
          agentId: string
          name: string
          host: string
          task: string
          status: 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled'
          durationMs: number
          startedAt?: number
          report?: SubAgentReport
          error?: string
          children: TimelineItem[]
      }

export interface ChatTurn {
    id: string
    role: 'user' | 'assistant'
    content: string
    items: TimelineItem[]
    streaming?: boolean
    error?: string
    createdAt: number
}

export function stepNodesToTimeline(nodes: StepNode[]): TimelineItem[] {
    const out: TimelineItem[] = []
    for (const n of nodes) {
        const d = (n.data || {}) as Record<string, any>
        switch (n.kind) {
            case 'thought':
                out.push({
                    kind: 'thought',
                    id: n.id,
                    title: n.title || 'Thought',
                    text: String(d.text || ''),
                    durationMs: n.durationMs || 0,
                    streaming: false,
                })
                break
            case 'content':
                out.push({
                    kind: 'content',
                    id: n.id,
                    text: String(d.text || ''),
                    streaming: false,
                })
                break
            case 'exec':
                out.push({
                    kind: 'exec',
                    id: n.id,
                    command: String(d.command || n.title || ''),
                    reason: String(d.reason || ''),
                    stdout: String(d.stdout || ''),
                    stderr: String(d.stderr || ''),
                    exitCode: typeof d.exitCode === 'number' ? d.exitCode : 0,
                    durationMs: n.durationMs || d.durationMs || 0,
                    truncated: Boolean(d.truncated),
                    status: (n.status as any) || 'completed',
                })
                break
            case 'approval':
                out.push({
                    kind: 'approval',
                    id: n.id,
                    approvalId: String(d.approvalId || n.id),
                    stepId: String(d.stepId || ''),
                    approvalKind: d.kind ? String(d.kind) : undefined,
                    command: String(d.command || n.title || ''),
                    risk: String(d.risk || 'modify'),
                    reason: String(d.reason || ''),
                    filePath: d.filePath ? String(d.filePath) : undefined,
                    writeMode: d.writeMode ? String(d.writeMode) : undefined,
                    existed: typeof d.existed === 'boolean' ? d.existed : undefined,
                    bytes: typeof d.bytes === 'number' ? d.bytes : undefined,
                    preview: typeof d.preview === 'string' ? d.preview : undefined,
                    previewTruncated: Boolean(d.previewTruncated),
                    mainVerdict: d.mainVerdict ?? null,
                    canAlwaysAllow: d.risk === 'modify' || d.kind === 'local_write',
                    decision: d.decision,
                    by: d.by,
                    status: n.status === 'failed' ? 'failed' : 'completed',
                    durationMs: n.durationMs || 0,
                })
                break
            case 'ask_user':
                out.push({
                    kind: 'ask_user',
                    id: n.id,
                    askId: String(d.askId || n.id),
                    stepId: String(d.stepId || ''),
                    questions: Array.isArray(d.questions) ? d.questions : [],
                    answers: d.answers,
                    status: n.status === 'failed' ? 'failed' : 'completed',
                })
                break
            case 'plan': {
                const nextSteps = Array.isArray(d.steps) ? d.steps : []
                const existingIdx = out.findIndex((it) => it.kind === 'plan')
                if (existingIdx !== -1) {
                    const existing = out[existingIdx]
                    if (existing.kind === 'plan') {
                        out[existingIdx] = { ...existing, steps: nextSteps }
                    }
                } else {
                    out.push({
                        kind: 'plan',
                        id: n.id,
                        steps: nextSteps,
                    })
                }
                break
            }
            case 'subagent_run':
                out.push({
                    kind: 'subagent_run',
                    id: n.id,
                    subRunId: String(d.subRunId || n.id),
                    agentId: String(d.agentId || n.agentId || ''),
                    name: String(d.name || d.agentId || n.agentId || ''),
                    host: String(d.host || ''),
                    task: String(d.task || n.title || ''),
                    status: (n.status as any) || 'completed',
                    durationMs: n.durationMs || 0,
                    report: d.report,
                    error: d.error,
                    children: stepNodesToTimeline(n.children || []),
                })
                break
            case 'tool':
            default:
                out.push({
                    kind: 'tool',
                    id: n.id,
                    tool: String(d.tool || n.title || 'tool'),
                    title: n.title || String(d.tool || 'tool'),
                    args: d.args ?? {},
                    result: d.result,
                    error: d.error,
                    observation: d.observation,
                    status: (n.status as any) || 'completed',
                    durationMs: n.durationMs || 0,
                })
                break
        }
    }
    return out
}
