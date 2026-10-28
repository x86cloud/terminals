import { useTranslation } from 'react-i18next'
import ErrorBoundary from '@/components/ErrorBoundary'
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
import WikiClient from '@/pages/wiki/WikiClient'
import AiAgentPanel from '@/pages/agent/AiAgentPanel'
import DevTools from '@/components/DevTools'
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
}

export default function Stage({
    nativeDrop,
    settings,
    onUpdateSettings,
    onPathChange,
}: StageProps) {
    const { t } = useTranslation('common')
    const { sessions, tools, activeTarget, closeSession, closeTool, updateSession } = useSession()

    const activeId = activeTarget?.kind === 'ssh' ? activeTarget.id : null
    const activeDockerId = activeTarget?.kind === 'docker' ? activeTarget.id : null
    const activeK8sId = activeTarget?.kind === 'k8s' ? activeTarget.id : null
    const activeRedisId = activeTarget?.kind === 'redis' ? activeTarget.id : null
    const activeMysqlId = activeTarget?.kind === 'mysql' ? activeTarget.id : null
    const activePostgresId = activeTarget?.kind === 'postgres' ? activeTarget.id : null
    const activeMqttId = activeTarget?.kind === 'mqtt' ? activeTarget.id : null
    const activeMongoId = activeTarget?.kind === 'mongo' ? activeTarget.id : null
    const activeSqliteId = activeTarget?.kind === 'sqlite' ? activeTarget.id : null

    const isAiAgentActive = !activeTarget || activeTarget.kind === 'aiAgent'

    return (
        <div className={a.stage}>
            <div style={isAiAgentActive ? shownPane : hiddenPane}>
                <ErrorBoundary title={t('errorBoundary.aiAgent', 'AI 智能体渲染异常')}>
                    <AiAgentPanel
                        settings={settings}
                        onUpdateSettings={onUpdateSettings}
                    />
                </ErrorBoundary>
            </div>

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

            {tools.wiki.open && (
                <div style={activeTarget?.kind === 'wiki' ? shownPane : hiddenPane}>
                    <ErrorBoundary title={t('errorBoundary.wiki', '知识库页面渲染异常')} onClose={() => closeTool('wiki')}>
                        <WikiClient onClose={() => closeTool('wiki')} />
                    </ErrorBoundary>
                </div>
            )}
        </div>
    )
}
