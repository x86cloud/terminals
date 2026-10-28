import { ServerConfig, ServerGroup } from '@/types'

export interface ServerFormProps {
    form: ServerConfig
    update: (patch: Partial<ServerConfig>) => void
    groups: ServerGroup[]
    setError: (msg: string) => void
    setTestResult: (res: { success?: boolean; message?: string } | null) => void
}
