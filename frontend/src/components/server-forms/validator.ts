import { ServerConfig } from '@/types'

export function validateServerForm(cfg: ServerConfig): string | null {
    if (!cfg.name?.trim()) {
        return '请输入连接名称'
    }

    if (cfg.type === 'k8s') {
        if (!cfg.k8sAuthMode || cfg.k8sAuthMode === 'kubeconfig') {
            if (!cfg.k8sKubeconfigData?.trim() && !cfg.k8sKubeconfigPath?.trim()) {
                return '请粘贴 Kubeconfig 内容或选择本地 Kubeconfig 文件'
            }
        } else {
            if (!cfg.k8sApiServer?.trim() && !cfg.host?.trim()) {
                return '请输入 Kubernetes API Server 地址 (如 https://192.168.1.100:6443)'
            }
        }
        return null
    }

    if (cfg.type === 'sqlite') {
        if (!cfg.sqlitePath?.trim()) {
            return '请选择或输入 SQLite 数据库文件路径'
        }
        return null
    }

    if (cfg.type === 'docker') {
        if (cfg.dockerEndpointType === 'ssh') {
            if (!cfg.dockerSshHost?.trim() && !cfg.host?.trim()) {
                return '请输入 SSH 跳板主机地址'
            }
        } else if (cfg.dockerEndpointType === 'tcp') {
            if (!cfg.host?.trim()) {
                return '请输入 Docker 守护进程主机地址 (Host)'
            }
            const port = Number(cfg.port)
            if (!port || isNaN(port) || port < 1 || port > 65535) {
                return '请输入有效的 TCP 端口号 (1 - 65535)'
            }
        }
        return null
    }

    if (cfg.type === 'mongo' && cfg.mongoAuthMode === 'uri') {
        if (!cfg.mongoURI?.trim() && !cfg.mongoUri?.trim()) {
            return '请输入 MongoDB 连接 URI (如 mongodb://localhost:27017)'
        }
        return null
    }

    if (!cfg.host?.trim()) {
        return '请输入服务器主机地址 (Host)'
    }

    const port = Number(cfg.port)
    if (!port || isNaN(port) || port < 1 || port > 65535) {
        return '请输入有效的端口号 (1 - 65535)'
    }

    if (cfg.type === 'ssh' && cfg.authType === 'key') {
        if (!cfg.privateKey?.trim()) {
            return '请选择或输入 SSH 私钥文件路径或 PEM 内容'
        }
    }

    return null
}
