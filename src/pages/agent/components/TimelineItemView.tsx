import type { ApprovalDecision, TimelineItem } from '../agentTypes'
import ApprovalCard from './ApprovalCard'
import AskUserCard from './AskUserCard'
import AssistantMarkdown from './AssistantMarkdown'
import PlanChecklist from './PlanChecklist'
import SubAgentRunCard from './SubAgentRunCard'
import TerminalCard from './TerminalCard'
import ThoughtBlock from './ThoughtBlock'
import ToolLine from './ToolLine'

interface Props {
    item: TimelineItem
    onRespondApproval: (approvalId: string, decision: ApprovalDecision) => Promise<void>
    onRespondAskUser: (askId: string, answers: Record<string, any>) => Promise<void>
}

export default function TimelineItemView({
    item,
    onRespondApproval,
    onRespondAskUser,
}: Props) {
    switch (item.kind) {
        case 'thought':
            return (
                <ThoughtBlock
                    text={item.text}
                    durationMs={item.durationMs}
                    streaming={item.streaming}
                />
            )
        case 'content':
            return <AssistantMarkdown content={item.text} streaming={item.streaming} />
        case 'tool':
            return (
                <ToolLine
                    tool={item.tool}
                    title={item.title}
                    args={item.args}
                    observation={item.observation}
                    result={item.result}
                    error={item.error}
                    status={item.status}
                    durationMs={item.durationMs}
                />
            )
        case 'exec':
            return (
                <TerminalCard
                    command={item.command}
                    stdout={item.stdout}
                    stderr={item.stderr}
                    exitCode={item.exitCode}
                    durationMs={item.durationMs}
                    truncated={item.truncated}
                    status={item.status}
                />
            )
        case 'approval':
            return (
                <ApprovalCard
                    approvalId={item.approvalId}
                    approvalKind={item.approvalKind}
                    command={item.command}
                    risk={item.risk}
                    reason={item.reason}
                    filePath={item.filePath}
                    writeMode={item.writeMode}
                    existed={item.existed}
                    bytes={item.bytes}
                    preview={item.preview}
                    previewTruncated={item.previewTruncated}
                    mainVerdict={item.mainVerdict}
                    canAlwaysAllow={item.canAlwaysAllow}
                    decision={item.decision}
                    by={item.by}
                    status={item.status}
                    onRespond={onRespondApproval}
                />
            )
        case 'ask_user':
            return (
                <AskUserCard
                    askId={item.askId}
                    questions={item.questions}
                    answers={item.answers}
                    cancelled={item.cancelled}
                    status={item.status}
                    onRespond={onRespondAskUser}
                />
            )
        case 'plan':
            return <PlanChecklist steps={item.steps} />
        case 'subagent_run':
            return (
                <SubAgentRunCard
                    item={item}
                    onRespondApproval={onRespondApproval}
                    onRespondAskUser={onRespondAskUser}
                />
            )
        default:
            return null
    }
}
