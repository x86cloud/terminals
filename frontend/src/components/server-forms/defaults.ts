import { ConnType, ServerConfig, emptyServer } from '@/types'

export const defaultPortMap: Record<ConnType, number> = {
    ssh: 22,
    redis: 6379,
    mysql: 3306,
    postgres: 5432,
    mqtt: 1883,
    mongo: 27017,
    sqlite: 0,
    docker: 0,
    k8s: 6443,
}

export function initServerForm(initial: ServerConfig | null): ServerConfig {
    const base = initial ? { ...initial } : emptyServer()
    if (!base.type) base.type = 'ssh'
    if (!base.port) {
        base.port = defaultPortMap[base.type] || 22
    }
    if (base.type === 'k8s') {
        if (!base.k8sAuthMode) base.k8sAuthMode = 'kubeconfig'
    }
    if (!base.username && (base.type === 'ssh' || base.type === 'mysql')) base.username = 'root'
    if (!base.username && base.type === 'postgres') base.username = 'postgres'
    return base
}

export function getSwitchedTypePatch(t: ConnType, currentForm: ServerConfig): Partial<ServerConfig> {
    const defaultPort = defaultPortMap[t] || 0
    const isCurrentDefault = !currentForm.port || Object.values(defaultPortMap).includes(currentForm.port)

    return {
        type: t,
        k8sAuthMode: t === 'k8s' ? (currentForm.k8sAuthMode || 'kubeconfig') : currentForm.k8sAuthMode,
        port: isCurrentDefault ? defaultPort : currentForm.port,
        username:
            t === 'postgres'
                ? currentForm.username || 'postgres'
                : t === 'redis' || t === 'mqtt' || t === 'sqlite' || t === 'docker' || t === 'k8s'
                    ? ''
                    : currentForm.username || 'root',
    }
}
