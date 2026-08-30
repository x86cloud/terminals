import React, { useState, useEffect } from 'react'
import {
    Play,
    Square,
    RotateCw,
    FileText,
    Search,
    Plus,
    Trash2,
    RefreshCw,
    Copy,
    Layers,
    Terminal,
    Code,
    CheckCircle,
    Sliders,
    Server,
} from 'lucide-react'
import {
    Table as AntTable,
    Button as AntButton,
    Input as AntInput,
    Space as AntSpace,
    Tag as AntTag,
    Modal as AntModal,
    Drawer as AntDrawer,
    Popconfirm as AntPopconfirm,
    Radio as AntRadio,
    Select as AntSelect,
    Switch as AntSwitch,
    message as antdMessage,
    Tooltip as AntTooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { API } from '@/api'
import CodeEditor from '@/components/CodeEditor'
import type { DockerComposeStackInfo, DockerComposeServiceInfo, DockerComposeDeployReq } from '@/types'
import s from './DockerClient.module.less'

interface Props {
    serverId: string
}

const TEMPLATES: Record<string, { name: string; yaml: string }> = {
    nginx: {
        name: 'Nginx Web 服务',
        yaml: `version: '3.8'
services:
  web:
    image: nginx:alpine
    container_name: nginx-web
    restart: always
    ports:
      - "8080:80"
    volumes:
      - web_data:/usr/share/nginx/html

volumes:
  web_data:
`,
    },
    redis: {
        name: 'Redis 缓存',
        yaml: `version: '3.8'
services:
  redis:
    image: redis:7-alpine
    container_name: redis-server
    restart: always
    command: redis-server --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  redis_data:
`,
    },
    mysql: {
        name: 'MySQL 8.0 数据库',
        yaml: `version: '3.8'
services:
  db:
    image: mysql:8.0
    container_name: mysql-db
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword123
      MYSQL_DATABASE: myapp
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql

volumes:
  mysql_data:
`,
    },
    wordpress: {
        name: 'WordPress + MySQL 完整站点',
        yaml: `version: '3.8'
services:
  db:
    image: mysql:8.0
    container_name: wp-mysql
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: somerootpass
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wp_user
      MYSQL_PASSWORD: wppassword
    volumes:
      - db_data:/var/lib/mysql

  wordpress:
    depends_on:
      - db
    image: wordpress:latest
    container_name: wp-site
    restart: always
    ports:
      - "8000:80"
    environment:
      WORDPRESS_DB_HOST: db:3306
      WORDPRESS_DB_USER: wp_user
      WORDPRESS_DB_PASSWORD: wppassword
      WORDPRESS_DB_NAME: wordpress
    volumes:
      - wp_data:/var/www/html

volumes:
  db_data:
  wp_data:
`,
    },
}

export default function ComposeTab({ serverId }: Props) {
    const [stacks, setStacks] = useState<DockerComposeStackInfo[]>([])
    const [loading, setLoading] = useState(false)
    const [filterState, setFilterState] = useState<'all' | 'running' | 'stopped'>('all')
    const [searchKw, setSearchKw] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)

    // 新建 / 部署 Stack 抽屉
    const [deployDrawer, setDeployDrawer] = useState(false)
    const [projectName, setProjectName] = useState('')
    const [yamlContent, setYamlContent] = useState(TEMPLATES.nginx.yaml)
    const [forcePull, setForcePull] = useState(false)
    const [recreate, setRecreate] = useState(true)
    const [deploying, setDeploying] = useState(false)

    // 日志抽屉
    const [logsDrawer, setLogsDrawer] = useState<{ open: boolean; projectName: string }>({
        open: false,
        projectName: '',
    })
    const [logsContent, setLogsContent] = useState('')
    const [logsTail, setLogsTail] = useState(200)
    const [logsLoading, setLogsLoading] = useState(false)

    const fetchStacks = async () => {
        setLoading(true)
        try {
            const list = await API.dockerListComposeStacks(serverId)
            setStacks(list)
        } catch (err: any) {
            antdMessage.error(`获取 Compose 项目列表失败: ${err.message || String(err)}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchStacks()
    }, [serverId])

    const handleControl = async (name: string, action: string) => {
        const hide = antdMessage.loading(`正在执行 ${action.toUpperCase()} 操作...`, 0)
        try {
            await API.dockerControlComposeStack(serverId, name, action)
            antdMessage.success(`项目 [${name}] 操作成功`)
            fetchStacks()
        } catch (err: any) {
            antdMessage.error(`操作失败: ${err.message || String(err)}`)
        } finally {
            hide()
        }
    }

    const handleDeploy = async () => {
        if (!projectName.trim()) {
            antdMessage.warning('请输入项目名称 (Project Name)')
            return
        }
        if (!yamlContent.trim()) {
            antdMessage.warning('请输入 docker-compose.yml 配置内容')
            return
        }

        setDeploying(true)
        try {
            const req: DockerComposeDeployReq = {
                projectName: projectName.trim(),
                yamlContent: yamlContent.trim(),
                envVars: {},
                forcePull,
                recreate,
            }
            await API.dockerDeployComposeStack(serverId, req)
            antdMessage.success(`Compose 项目 [${projectName}] 部署成功`)
            setDeployDrawer(false)
            setProjectName('')
            fetchStacks()
        } catch (err: any) {
            AntModal.error({
                title: 'Compose 部署失败',
                content: <div style={{ maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{err.message || String(err)}</div>,
            })
        } finally {
            setDeploying(false)
        }
    }

    const fetchLogs = async (pName: string, tail = logsTail) => {
        setLogsLoading(true)
        try {
            const content = await API.dockerGetComposeStackLogs(serverId, pName, tail)
            setLogsContent(content || '(无日志记录)')
        } catch (err: any) {
            antdMessage.error(`获取项目日志失败: ${err.message || String(err)}`)
        } finally {
            setLogsLoading(false)
        }
    }

    const openLogs = (pName: string) => {
        setLogsDrawer({ open: true, projectName: pName })
        setLogsContent('')
        fetchLogs(pName, logsTail)
    }

    const filtered = stacks.filter((s) => {
        if (filterState === 'running' && s.status !== 'running') return false
        if (filterState === 'stopped' && s.status === 'running') return false
        if (!searchKw) return true
        const kw = searchKw.toLowerCase()
        const matchName = s.name.toLowerCase().includes(kw)
        const matchService = s.services?.some(
            (svc) => svc.serviceName.toLowerCase().includes(kw) || svc.image.toLowerCase().includes(kw)
        )
        return matchName || matchService
    })

    const columns: ColumnsType<DockerComposeStackInfo> = [
        {
            title: '项目名称 (Stack Name)',
            dataIndex: 'name',
            key: 'name',
            width: 220,
            render: (name: string) => (
                <AntSpace size={8}>
                    <div
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            background: 'var(--accent-soft)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--accent)',
                        }}
                    >
                        <Layers size={16} />
                    </div>
                    <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}>{name}</span>
                </AntSpace>
            ),
        },
        {
            title: '运行状态',
            dataIndex: 'status',
            key: 'status',
            width: 140,
            render: (status: string, record) => {
                let badgeClass = s.statusStopped
                let label = '已停止'
                if (status === 'running') {
                    badgeClass = s.statusRunning
                    label = '全部运行中'
                } else if (status === 'partially_running') {
                    badgeClass = s.statusPaused
                    label = '部分运行'
                }
                return (
                    <span className={`${s.statusBadge} ${badgeClass}`}>
                        {status === 'running' && <span className={s.pulseDot} />}
                        <span>{label}</span>
                    </span>
                )
            },
        },
        {
            title: '服务与容器',
            key: 'services',
            width: 180,
            render: (_, record) => {
                const isAll = record.runningServices === record.totalServices && record.totalServices > 0
                return (
                    <AntSpace size={6}>
                        <AntTag color={isAll ? 'success' : record.runningServices > 0 ? 'warning' : 'default'}>
                            {record.runningServices} / {record.totalServices} 服务运行中
                        </AntTag>
                    </AntSpace>
                )
            },
        },
        {
            title: '创建时间 / 路径',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (createdAt: string, record) => (
                <div>
                    <div style={{ fontSize: 12, color: 'var(--text)' }}>{createdAt || '-'}</div>
                    {record.configFiles && (
                        <div
                            style={{
                                fontSize: 11,
                                color: 'var(--text-dim)',
                                fontFamily: 'var(--font-mono)',
                                marginTop: 2,
                            }}
                            title={record.configFiles}
                        >
                            {record.configFiles}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: '操作',
            key: 'actions',
            width: 220,
            fixed: 'right',
            render: (_, record) => (
                <AntSpace size={4}>
                    <AntTooltip title="启动项目所有服务">
                        <AntButton
                            size="small"
                            type="text"
                            icon={<Play size={13} color="var(--ok)" />}
                            onClick={() => handleControl(record.name, 'start')}
                        />
                    </AntTooltip>

                    <AntTooltip title="停止项目所有服务">
                        <AntButton
                            size="small"
                            type="text"
                            icon={<Square size={13} color="var(--warn)" />}
                            onClick={() => handleControl(record.name, 'stop')}
                        />
                    </AntTooltip>

                    <AntTooltip title="重启所有服务">
                        <AntButton
                            size="small"
                            type="text"
                            icon={<RotateCw size={13} color="var(--accent)" />}
                            onClick={() => handleControl(record.name, 'restart')}
                        />
                    </AntTooltip>

                    <AntTooltip title="聚合日志">
                        <AntButton
                            size="small"
                            type="text"
                            icon={<FileText size={13} />}
                            onClick={() => openLogs(record.name)}
                        />
                    </AntTooltip>

                    <AntPopconfirm
                        title="确定要销毁此 Compose 项目吗？"
                        description="将停止并删除该项目名下的所有容器与专属网络"
                        onConfirm={() => handleControl(record.name, 'down')}
                        okText="销毁 (Down)"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                    >
                        <AntTooltip title="销毁 (Compose Down)">
                            <AntButton size="small" type="text" danger icon={<Trash2 size={13} />} />
                        </AntTooltip>
                    </AntPopconfirm>
                </AntSpace>
            ),
        },
    ]

    const serviceSubColumns: ColumnsType<DockerComposeServiceInfo> = [
        {
            title: '服务名',
            dataIndex: 'serviceName',
            width: 140,
            render: (name: string) => (
                <span style={{ fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                    {name}
                </span>
            ),
        },
        {
            title: '容器名称',
            dataIndex: 'containerName',
            width: 180,
            render: (name: string, record) => (
                <span className={s.monoText} style={{ fontSize: 11.5 }}>
                    {name} <span style={{ color: 'var(--text-faint)' }}>({record.shortId})</span>
                </span>
            ),
        },
        {
            title: '镜像',
            dataIndex: 'image',
            render: (img: string) => (
                <span className={s.monoText} style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
                    {img}
                </span>
            ),
        },
        {
            title: '端口映射',
            dataIndex: 'ports',
            render: (ports: string) => (
                <span className={s.monoText} style={{ fontSize: 11.5, color: 'var(--text)' }}>
                    {ports || '-'}
                </span>
            ),
        },
        {
            title: '状态',
            dataIndex: 'state',
            width: 100,
            render: (state: string) => {
                const isRunning = state === 'running'
                return (
                    <AntTag color={isRunning ? 'success' : 'default'} style={{ margin: 0 }}>
                        {state}
                    </AntTag>
                )
            },
        },
    ]

    return (
        <div>
            {/* 顶部工具栏 */}
            <div className={s.toolbar}>
                <div className={s.toolbarLeft}>
                    <AntRadio.Group
                        value={filterState}
                        onChange={(e) => {
                            setFilterState(e.target.value)
                            setPage(1)
                        }}
                        buttonStyle="solid"
                        size="small"
                    >
                        <AntRadio.Button value="all">全部 ({stacks.length})</AntRadio.Button>
                        <AntRadio.Button value="running">
                            运行中 ({stacks.filter((s) => s.status === 'running').length})
                        </AntRadio.Button>
                        <AntRadio.Button value="stopped">
                            已停止 ({stacks.filter((s) => s.status === 'stopped').length})
                        </AntRadio.Button>
                    </AntRadio.Group>

                    <AntInput
                        placeholder="搜索 Stack 名称 / 服务名 / 镜像..."
                        prefix={<Search size={13} color="var(--text-dim)" />}
                        value={searchKw}
                        onChange={(e) => {
                            setSearchKw(e.target.value)
                            setPage(1)
                        }}
                        style={{ width: 260 }}
                        size="small"
                        allowClear
                    />
                </div>

                <div className={s.toolbarRight}>
                    <AntButton
                        type="primary"
                        icon={<Plus size={14} />}
                        size="small"
                        onClick={() => setDeployDrawer(true)}
                    >
                        新建 Stack (Deploy)
                    </AntButton>
                    <AntButton
                        icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
                        size="small"
                        onClick={fetchStacks}
                    >
                        刷新
                    </AntButton>
                </div>
            </div>

            {/* Compose 项目表格 */}
            <AntTable
                columns={columns}
                dataSource={filtered}
                rowKey="name"
                loading={loading}
                size="small"
                expandable={{
                    expandedRowRender: (record) => (
                        <div style={{ margin: '8px 0', padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 6 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-dim)' }}>
                                项目内服务列表 ({record.services?.length || 0} 个服务)
                            </div>
                            <AntTable
                                columns={serviceSubColumns}
                                dataSource={record.services || []}
                                rowKey="containerId"
                                pagination={false}
                                size="small"
                            />
                        </div>
                    ),
                    rowExpandable: (record) => (record.services?.length ?? 0) > 0,
                }}
                pagination={{
                    current: page,
                    pageSize: pageSize,
                    total: filtered.length,
                    showSizeChanger: true,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`,
                    onChange: (p, ps) => {
                        setPage(p)
                        setPageSize(ps)
                    },
                }}
            />

            {/* 新建 / 部署 Compose Stack 抽屉 */}
            <AntDrawer
                title={
                    <AntSpace size={8}>
                        <Layers size={16} color="var(--accent)" />
                        <span>部署 Docker Compose 项目 (Stack)</span>
                    </AntSpace>
                }
                open={deployDrawer}
                onClose={() => !deploying && setDeployDrawer(false)}
                size={680}
                extra={
                    <AntSpace>
                        <AntButton onClick={() => setDeployDrawer(false)} disabled={deploying}>
                            取消
                        </AntButton>
                        <AntButton type="primary" loading={deploying} onClick={handleDeploy}>
                            开始部署 (Compose Up)
                        </AntButton>
                    </AntSpace>
                }
            >
                <AntSpace direction="vertical" size={16} style={{ width: '100%' }}>
                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>
                            项目名称 (Project / Stack Name) <span style={{ color: 'var(--danger)' }}>*</span>
                        </div>
                        <AntInput
                            placeholder="例如: my-web-app (仅限小写英文、数字与横杠)"
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>
                            docker-compose.yml 编排配置 <span style={{ color: 'var(--danger)' }}>*</span>
                        </div>
                        <AntSpace size={8}>
                            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>载入常用模板:</span>
                            <AntSelect
                                size="small"
                                placeholder="选择预设模板"
                                style={{ width: 180 }}
                                onChange={(val) => {
                                    if (TEMPLATES[val]) {
                                        setYamlContent(TEMPLATES[val].yaml)
                                        if (!projectName) {
                                            setProjectName(val)
                                        }
                                    }
                                }}
                                options={Object.entries(TEMPLATES).map(([k, v]) => ({ value: k, label: v.name }))}
                            />
                        </AntSpace>
                    </div>

                    <CodeEditor
                        value={yamlContent}
                        onChange={setYamlContent}
                        lang="yaml"
                        height="380px"
                        bordered
                        placeholder="在此输入 docker-compose.yml 内容..."
                    />

                    <div
                        style={{
                            display: 'flex',
                            gap: 20,
                            padding: '10px 14px',
                            background: 'var(--bg-2)',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AntSwitch checked={forcePull} onChange={setForcePull} size="small" />
                            <span style={{ fontSize: 12 }}>强制拉取最新镜像 (Force Pull)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AntSwitch checked={recreate} onChange={setRecreate} size="small" />
                            <span style={{ fontSize: 12 }}>重建已有容器 (Recreate)</span>
                        </div>
                    </div>
                </AntSpace>
            </AntDrawer>

            {/* 聚合日志抽屉 */}
            <AntDrawer
                title={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>Compose 聚合日志: {logsDrawer.projectName}</span>
                        <AntSpace size={8}>
                            <AntSelect
                                size="small"
                                value={logsTail}
                                onChange={(val) => {
                                    setLogsTail(val)
                                    fetchLogs(logsDrawer.projectName, val)
                                }}
                                options={[
                                    { value: 100, label: '最新 100 行' },
                                    { value: 200, label: '最新 200 行' },
                                    { value: 500, label: '最新 500 行' },
                                    { value: 1000, label: '最新 1000 行' },
                                ]}
                                style={{ width: 120 }}
                            />
                            <AntButton
                                size="small"
                                icon={<RefreshCw size={12} className={logsLoading ? 'animate-spin' : ''} />}
                                onClick={() => fetchLogs(logsDrawer.projectName)}
                            >
                                刷新
                            </AntButton>
                            <AntButton
                                size="small"
                                icon={<Copy size={12} />}
                                onClick={() => {
                                    navigator.clipboard.writeText(logsContent)
                                    antdMessage.success('日志已复制')
                                }}
                            >
                                复制
                            </AntButton>
                        </AntSpace>
                    </div>
                }
                open={logsDrawer.open}
                onClose={() => setLogsDrawer({ open: false, projectName: '' })}
                size={720}
            >
                <pre className={s.logTerminal}>{logsContent}</pre>
            </AntDrawer>
        </div>
    )
}
