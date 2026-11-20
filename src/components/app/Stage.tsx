import { useTranslation } from 'react-i18next'
import { Button } from 'antd'
import { Plus, Link as LinkIcon, BarChart2, Bot } from 'lucide-react'
import ErrorBoundary from '@/components/ErrorBoundary'
import AppLogo from '@/components/AppLogo'
import SessionWorkspace from '@/pages/ssh/SessionWorkspace'
import RedisClient from '@/pages/redis/RedisClient'
import MysqlClient from '@/pages/mysql/MysqlClient'
import PostgresClient from '@/pages/postgres/PostgresClient'
import MqttClient from '@/pages/mqtt/MqttClient'
import MongoClient from '@/pages/mongo/MongoClient'
import SqliteClient from '@/pages/sqlite/SqliteClient'
import DockerClient from '@/pages/docker/DockerClient'
import K8sClient from '@/pages/k8s/K8sClient'
import ApiClient from '@/pages/api/ApiClient'
import DevTools from '@/components/DevTools'
import AgentPage from '@/pages/agent/AgentPage'
import WikiPage from '@/pages/wiki/WikiPage'
import a from '@/components/app/Stage.module.less'
import { AppSettings } from '@/types'
import { useSession } from '@/contexts/SessionContext'

const hiddenPane = { display: 'none' as const }
const shownPane = {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    width: '100%',
    height: '100%',
}

export interface StageProps {
    nativeDrop: boolean
    settings: AppSettings
    onUpdateSettings?: (newSettings: AppSettings) => Promise<void>
    onPathChange: (sessionId: string, p: string) => void
    onNewServer: () => void
    onOpenSettings?: () => void
}

export default function Stage({
    nativeDrop,
    settings,
    onUpdateSettings,
    onPathChange,
    onNewServer,
    onOpenSettings,
}: StageProps) {
    const { t } = useTranslation(['common', 'sidebar'])
    const { sessions, tools, activeTarget, closeSession, closeTool, updateSession, openTool, setAgentAwaitingApproval } = useSession()

    const activeId = activeTarget?.kind === 'ssh' ? activeTarget.id : null
    const activeDockerId = activeTarget?.kind === 'docker' ? activeTarget.id : null
    const activeK8sId = activeTarget?.kind === 'k8s' ? activeTarget.id : null
    const activeRedisId = activeTarget?.kind === 'redis' ? activeTarget.id : null
    const activeMysqlId = activeTarget?.kind === 'mysql' ? activeTarget.id : null
    const activePostgresId = activeTarget?.kind === 'postgres' ? activeTarget.id : null
    const activeMqttId = activeTarget?.kind === 'mqtt' ? activeTarget.id : null
    const activeMongoId = activeTarget?.kind === 'mongo' ? activeTarget.id : null
    const activeSqliteId = activeTarget?.kind === 'sqlite' ? activeTarget.id : null

    return (
        <div className={a.stage}>
            {!activeTarget && (
                <div className={a.welcomePane}>
                    <div className={a.welcomeCard}>
                        <div className={a.welcomeLogo}>
                            <AppLogo size={56} />
                        </div>
                        <h1 className={a.welcomeTitle}>xTerminal</h1>
                        <p className={a.welcomeSubtitle}>
                            {t('common:welcomeSubtitle', '从左侧选择一台服务器发起连接，或创建一个新会话')}
                        </p>
                        <div className={a.welcomeActions}>
                            <Button
                                type="primary"
                                icon={<Plus size={15} />}
                                onClick={() => onNewServer()}
                            >
                                {t('sidebar:newConnection', '新建连接')}
                            </Button>
                            <Button
                                icon={<LinkIcon size={15} />}
                                onClick={() => openTool('api')}
                            >
                                {t('sidebar:tools.apiDebug', 'API 调试')}
                            </Button>
                            <Button
                                icon={<BarChart2 size={15} />}
                                onClick={() => openTool('devtools')}
                            >
                                {t('sidebar:tools.devTools', '开发工具')}
                            </Button>
                            <Button
                                icon={<Bot size={15} />}
                                onClick={() => openTool('agent')}
                            >
                                {t('sidebar:tools.agent', 'AI 智能体')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {sessions.ssh.map((s) => (
                <SessionWorkspace
                    key={s.id}
                    session={s}
                    active={s.id === activeId}
                    nativeDrop={nativeDrop}
                    onPathChange={onPathChange}
                />
            ))}

            {sessions.docker.map((s) => (
                <div key={s.id} style={s.id === activeDockerId ? shownPane : hiddenPane}>
                    <ErrorBoundary title={t('errorBoundary.docker', 'Docker 页面渲染异常')} onClose={() => void closeSession('docker', s.id)}>
                        <DockerClient
                            session={s}
                            onClose={() => void closeSession('docker', s.id)}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {sessions.k8s.map((s) => (
                <div key={s.id} style={s.id === activeK8sId ? shownPane : hiddenPane}>
                    <ErrorBoundary title={t('errorBoundary.k8s', 'Kubernetes 页面渲染异常')} onClose={() => void closeSession('k8s', s.id)}>
                        <K8sClient
                            session={s}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {sessions.redis.map((s) => (
                <div key={s.id} style={s.id === activeRedisId ? shownPane : hiddenPane}>
                    <ErrorBoundary title={t('errorBoundary.redis', 'Redis 页面渲染异常')} onClose={() => void closeSession('redis', s.id)}>
                        <RedisClient
                            session={s}
                            onClose={() => void closeSession('redis', s.id)}
                            onDbChange={(id, db, dbSize) => updateSession('redis', id, { db, dbSize })}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {sessions.mysql.map((s) => (
                <div key={s.id} style={s.id === activeMysqlId ? shownPane : hiddenPane}>
                    <ErrorBoundary title={t('errorBoundary.mysql', 'MySQL 页面渲染异常')} onClose={() => void closeSession('mysql', s.id)}>
                        <MysqlClient
                            session={s}
                            onClose={() => void closeSession('mysql', s.id)}
                            onChange={(id, database) => updateSession('mysql', id, { database })}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {sessions.postgres.map((s) => (
                <div key={s.id} style={s.id === activePostgresId ? shownPane : hiddenPane}>
                    <ErrorBoundary title={t('errorBoundary.postgres', 'PostgreSQL 页面渲染异常')} onClose={() => void closeSession('postgres', s.id)}>
                        <PostgresClient
                            session={s}
                            onClose={() => void closeSession('postgres', s.id)}
                            onChange={(id, database) => updateSession('postgres', id, { database })}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {sessions.mqtt.map((s) => (
                <div key={s.id} style={s.id === activeMqttId ? shownPane : hiddenPane}>
                    <ErrorBoundary title={t('errorBoundary.mqtt', 'MQTT 页面渲染异常')} onClose={() => void closeSession('mqtt', s.id)}>
                        <MqttClient
                            session={s}
                            onClose={() => void closeSession('mqtt', s.id)}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {sessions.mongo.map((s) => (
                <div key={s.id} style={s.id === activeMongoId ? shownPane : hiddenPane}>
                    <ErrorBoundary title={t('errorBoundary.mongo', 'MongoDB 页面渲染异常')} onClose={() => void closeSession('mongo', s.id)}>
                        <MongoClient
                            session={s}
                            onClose={() => void closeSession('mongo', s.id)}
                            onChange={(id, database) => updateSession('mongo', id, { database })}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {sessions.sqlite.map((s) => (
                <div key={s.id} style={s.id === activeSqliteId ? shownPane : hiddenPane}>
                    <ErrorBoundary title={t('errorBoundary.sqlite', 'SQLite 页面渲染异常')} onClose={() => void closeSession('sqlite', s.id)}>
                        <SqliteClient
                            session={s}
                            onClose={() => void closeSession('sqlite', s.id)}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {tools.devtools.open && (
                <div style={activeTarget?.kind === 'devtools' ? shownPane : hiddenPane}>
                    <ErrorBoundary title={t('errorBoundary.devtools', 'DevTools 页面渲染异常')} onClose={() => closeTool('devtools')}>
                        <DevTools onClose={() => closeTool('devtools')} />
                    </ErrorBoundary>
                </div>
            )}

            {tools.api.open && (
                <div style={activeTarget?.kind === 'api' ? shownPane : hiddenPane}>
                    <ErrorBoundary title={t('errorBoundary.api', 'API 页面渲染异常')} onClose={() => closeTool('api')}>
                        <ApiClient onClose={() => closeTool('api')} />
                    </ErrorBoundary>
                </div>
            )}

            {tools.agent.open && (
                <div style={activeTarget?.kind === 'agent' ? shownPane : hiddenPane}>
                    <ErrorBoundary title={t('errorBoundary.agent', 'AI 智能体页面渲染异常')}>
                        <AgentPage
                            settings={settings}
                            onOpenSettings={onOpenSettings}
                            onAwaitingApprovalChange={setAgentAwaitingApproval}
                        />
                    </ErrorBoundary>
                </div>
            )}

            {tools.wiki.open && (
                <div style={activeTarget?.kind === 'wiki' ? shownPane : hiddenPane}>
                    <ErrorBoundary title={t('errorBoundary.wiki', 'Wiki 知识库渲染异常')} onClose={() => closeTool('wiki')}>
                        <WikiPage settings={settings} onUpdateSettings={onUpdateSettings} />
                    </ErrorBoundary>
                </div>
            )}
        </div>
    )
}
