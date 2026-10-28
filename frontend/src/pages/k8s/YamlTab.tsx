import { useState, useEffect, useMemo } from 'react'
import {
  Table,
  Space,
  Tag,
  Button,
  Input,
  Drawer,
  Modal,
  Popconfirm,
  Checkbox,
  Radio,
  Tooltip,
  Dropdown,
  App,
  Empty,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  Play,
  Square,
  Edit3,
  Trash2,
  Plus,
  RefreshCw,
  Copy,
  Sparkles,
  RotateCcw,
  Sliders,
  Box,
  Network,
  FileCode,
  Layers,
  AlertCircle,
  MoreHorizontal,
  Search,
  ExternalLink,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import CodeEditor from '@/components/CodeEditor'
import K8sYamlGenerateModal from './K8sYamlGenerateModal'
import { API } from '@/api'
import { copyText } from '@/utils'
import type { K8sOrchestrationRecord } from '@/types'
import s from './K8sClient.module.less'

interface Props {
  serverId: string
  currentNamespace: string
  onNavigateToResource?: (kind: string, name: string, namespace?: string) => void
}

const DEFAULT_ORCHESTRATION_TEMPLATE = (namespace: string) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: demo-app
  namespace: ${namespace && namespace !== '_all' ? namespace : 'default'}
  labels:
    app: demo-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: demo-app
  template:
    metadata:
      labels:
        app: demo-app
    spec:
      containers:
      - name: web
        image: nginx:alpine
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: demo-app-service
  namespace: ${namespace && namespace !== '_all' ? namespace : 'default'}
spec:
  type: ClusterIP
  selector:
    app: demo-app
  ports:
  - port: 80
    targetPort: 80
`

export default function YamlTab({ serverId, currentNamespace, onNavigateToResource }: Props) {
  const { t } = useTranslation(['k8s', 'common'])
  const { message } = App.useApp()
  const [records, setRecords] = useState<K8sOrchestrationRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [searchKw, setSearchKw] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'deployed' | 'not_deployed'>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [deployingId, setDeployingId] = useState<string | null>(null)

  // 抽屉状态 (新建 / 编辑)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [currentRecord, setCurrentRecord] = useState<K8sOrchestrationRecord | null>(null)
  const [formName, setFormName] = useState('')
  const [formYaml, setFormYaml] = useState('')
  const [saving, setSaving] = useState(false)
  const [aiModalOpen, setAiModalOpen] = useState(false)

  // 下线资源二次确认模态框
  const [offlineModal, setOfflineModal] = useState<{
    open: boolean
    record: K8sOrchestrationRecord | null
    deleteLocal: boolean
    loading: boolean
  }>({
    open: false,
    record: null,
    deleteLocal: false,
    loading: false,
  })

  const fetchRecords = async () => {
    setLoading(true)
    try {
      const list = await API.k8sListOrchestrationRecords(serverId)
      setRecords(list)
    } catch (err: any) {
      message.error(t('k8s:yaml.fetchFail', { error: err.message || String(err) }))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecords()
  }, [serverId])

  // 打开新建抽屉
  const handleOpenCreateDrawer = () => {
    setCurrentRecord(null)
    setFormName('')
    const targetNs = currentNamespace && currentNamespace !== '_all' ? currentNamespace : 'default'
    setFormYaml(DEFAULT_ORCHESTRATION_TEMPLATE(targetNs))
    setDrawerOpen(true)
  }

  // 打开编辑抽屉
  const handleOpenEditDrawer = (rec: K8sOrchestrationRecord) => {
    setCurrentRecord(rec)
    setFormName(rec.name)
    setFormYaml(rec.yamlContent || '')
    setDrawerOpen(true)
  }

  // 部署并保存到本地（强一致性：后验落盘）
  const handleSaveAndApply = async () => {
    const trimmedName = formName.trim()
    const trimmedYaml = formYaml.trim()

    if (!trimmedName) {
      message.warning(t('k8s:yaml.reqName'))
      return
    }
    if (!trimmedYaml) {
      message.warning(t('k8s:yaml.reqYaml'))
      return
    }

    setSaving(true)
    try {
      const payload: K8sOrchestrationRecord = {
        id: currentRecord?.id || '',
        serverId,
        name: trimmedName,
        namespace: currentRecord?.namespace || (currentNamespace && currentNamespace !== '_all' ? currentNamespace : 'default'),
        yamlContent: trimmedYaml,
        status: 'deployed',
        resources: null,
        resourcesSummary: '',
        createdAt: currentRecord?.createdAt || '',
        updatedAt: '',
      }

      const results = await API.k8sApplyOrchestration(serverId, payload)
      if (!results || results.length === 0) {
        message.warning(t('k8s:yaml.invalidYaml'))
        return
      }

      const failures = results.filter((r) => r.action === 'failed')
      const successes = results.filter((r) => r.action !== 'failed')

      if (failures.length === 0) {
        message.success(t('k8s:yaml.deploySuccess', { name: trimmedName, count: successes.length }))
      } else if (successes.length === 0) {
        const detail = failures.map((r) => `${r.kind}/${r.name || t('common.unknown')}: ${r.message}`).join('; ')
        message.error(t('k8s:yaml.deployFail', { detail }), 6)
        return
      } else {
        message.warning(
          t('k8s:yaml.deployPartial', { successCount: successes.length, failCount: failures.length }),
          5,
        )
      }

      setDrawerOpen(false)
      await fetchRecords()
    } catch (err: any) {
      message.error(t('k8s:yaml.deployFail', { detail: err.message || String(err) }), 6)
    } finally {
      setSaving(false)
    }
  }

  // 列表行一键部署
  const handleRowDeploy = async (rec: K8sOrchestrationRecord) => {
    setDeployingId(rec.id)
    try {
      const results = await API.k8sApplyOrchestration(serverId, rec)
      const failures = results?.filter((r) => r.action === 'failed') || []
      const successes = results?.filter((r) => r.action !== 'failed') || []

      if (failures.length === 0) {
        message.success(t('k8s:yaml.deploySyncSuccess', { name: rec.name, count: successes.length }))
      } else if (successes.length === 0) {
        const detail = failures.map((r) => `${r.kind}/${r.name || t('common.unknown')}: ${r.message}`).join('; ')
        message.error(t('k8s:yaml.deploySyncFail', { detail }), 6)
      } else {
        message.warning(t('k8s:yaml.deploySyncPartial', { name: rec.name, successCount: successes.length, failCount: failures.length }))
      }
      await fetchRecords()
    } catch (err: any) {
      message.error(t('k8s:yaml.deployEx', { error: err.message || String(err) }))
    } finally {
      setDeployingId(null)
    }
  }

  // 打开下线确认弹窗
  const handleOpenOfflineModal = (rec: K8sOrchestrationRecord) => {
    setOfflineModal({
      open: true,
      record: rec,
      deleteLocal: false,
      loading: false,
    })
  }

  // 确认下线集群资源
  const handleConfirmOffline = async () => {
    if (!offlineModal.record) return
    setOfflineModal((prev) => ({ ...prev, loading: true }))
    try {
      const results = await API.k8sOfflineOrchestration(
        serverId,
        offlineModal.record.id,
        offlineModal.deleteLocal,
      )

      const failures = results?.filter((r) => r.action === 'failed') || []

      if (failures.length === 0) {
        message.success(
          t('k8s:yaml.offlineSuccess', {
            name: offlineModal.record.name,
            detail: offlineModal.deleteLocal ? t('k8s:yaml.offlineDetailDeleted') : t('k8s:yaml.offlineDetailMarked'),
          }),
          4,
        )
      } else {
        const failMsg = failures.map((f) => `${f.kind}/${f.name}: ${f.message}`).join('; ')
        message.warning(t('k8s:yaml.offlinePartialFail', { failMsg }), 5)
      }

      setOfflineModal({ open: false, record: null, deleteLocal: false, loading: false })
      await fetchRecords()
    } catch (err: any) {
      message.error(t('k8s:yaml.offlineFail', { error: err.message || String(err) }))
      setOfflineModal((prev) => ({ ...prev, loading: false }))
    }
  }

  // 仅删除本地记录（不下线集群资源）
  const handleDeleteRecordOnly = async (rec: K8sOrchestrationRecord) => {
    try {
      await API.k8sDeleteOrchestrationRecordOnly(rec.id)
      message.success(t('k8s:yaml.deleteLocalSuccess', { name: rec.name }))
      await fetchRecords()
    } catch (err: any) {
      message.error(t('k8s:yaml.deleteLocalFail', { error: err.message || String(err) }))
    }
  }

  // 资源 Kind 渲染对应图标
  const renderKindIcon = (kind: string) => {
    const k = (kind || '').toLowerCase()
    if (['deployment', 'statefulset', 'daemonset', 'replicaset'].includes(k)) {
      return <Sliders size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
    }
    if (k === 'pod') {
      return <Box size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
    }
    if (['service', 'ingress', 'endpoints'].includes(k)) {
      return <Network size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
    }
    if (['configmap', 'secret', 'persistentvolumeclaim', 'pvc'].includes(k)) {
      return <FileCode size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
    }
    return <Layers size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
  }

  // 过滤数据
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // 状态筛选
      if (statusFilter !== 'all' && r.status !== statusFilter) {
        return false
      }
      // 搜索关键字筛选
      if (!searchKw.trim()) return true
      const kw = searchKw.toLowerCase()
      if (r.name.toLowerCase().includes(kw)) return true
      if (r.namespace.toLowerCase().includes(kw)) return true
      if (r.resourcesSummary?.toLowerCase().includes(kw)) return true
      if (r.resources?.some((res) => res.name.toLowerCase().includes(kw) || res.kind.toLowerCase().includes(kw))) {
        return true
      }
      return false
    })
  }, [records, statusFilter, searchKw])

  const columns: ColumnsType<K8sOrchestrationRecord> = [
    {
      title: t('k8s:yaml.colName'),
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name: string, record) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>{name}</span>
            <Tooltip title={t('common.copy')}>
              <Button
                type="text"
                size="small"
                icon={<Copy size={11} />}
                style={{ padding: 0, width: 16, height: 16, color: 'var(--text-faint)' }}
                onClick={async (e) => {
                  e.stopPropagation()
                  if (await copyText(name)) {
                    message.success(t('k8s:yaml.copiedRecordName'))
                  }
                }}
              />
            </Tooltip>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2, fontFamily: 'monospace' }}>
            ID: {record.id.slice(0, 8)}...
          </div>
        </div>
      ),
    },
    {
      title: t('k8s:yaml.colDefaultNamespace'),
      dataIndex: 'namespace',
      key: 'namespace',
      width: 140,
      render: (ns: string) => <Tag color="blue">{ns || 'default'}</Tag>,
    },
    {
      title: t('k8s:yaml.colClusterStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => {
        const isDeployed = status === 'deployed'
        return isDeployed ? (
          <Tag color="success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span className={s.onlineDot} style={{ width: 5, height: 5 }} />
            <span>{t('k8s:yaml.statusDeployed')}</span>
          </Tag>
        ) : (
          <Tag color="default" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-faint)' }} />
            <span>{t('k8s:yaml.statusOffline')}</span>
          </Tag>
        )
      },
    },
    {
      title: t('k8s:yaml.colResourcesNav'),
      key: 'resources',
      render: (_, record) => {
        const resList = record.resources || []
        if (resList.length === 0) {
          return <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>{record.resourcesSummary || '-'}</span>
        }
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {resList.map((res, idx) => (
              <Tooltip
                key={`${res.kind}-${res.name}-${idx}`}
                title={t('k8s:yaml.resTooltip', { kind: res.kind, name: res.name, namespace: res.namespace || record.namespace })}
              >
                <Tag
                  style={{
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: 'var(--bg-2)',
                    borderColor: 'var(--border)',
                    color: 'var(--text)',
                    fontSize: 12,
                    margin: 0,
                    transition: 'all 0.2s',
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onNavigateToResource?.(res.kind, res.name, res.namespace || record.namespace)
                  }}
                >
                  {renderKindIcon(res.kind)}
                  <span style={{ fontWeight: 600, color: 'var(--accent)', marginRight: 4 }}>{res.kind}</span>
                  <span style={{ fontFamily: 'monospace' }}>{res.name}</span>
                  <ExternalLink size={10} style={{ marginLeft: 4, opacity: 0.6 }} />
                </Tag>
              </Tooltip>
            ))}
          </div>
        )
      },
    },
    {
      title: t('k8s:yaml.colLastUpdated'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: (tVal: string) => (
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {tVal ? new Date(tVal).toLocaleString() : '-'}
        </span>
      ),
    },
    {
      title: t('common.action'),
      key: 'action',
      width: 190,
      render: (_, record) => {
        const isDeploying = deployingId === record.id
        const isDeployed = record.status === 'deployed'

        const moreMenuItems: any[] = [
          ...(isDeployed
            ? [
                {
                  key: 'redeploy',
                  label: t('k8s:yaml.redeploy'),
                  icon: <RotateCcw size={13} />,
                  disabled: isDeploying,
                  onClick: () => handleRowDeploy(record),
                },
              ]
            : []),
          {
            key: 'copy_yaml',
            label: t('k8s:yaml.copyYamlContent'),
            icon: <Copy size={13} />,
            onClick: async () => {
              if (await copyText(record.yamlContent)) {
                message.success(t('k8s:yaml.copiedYaml'))
              }
            },
          },
          {
            type: 'divider' as const,
          },
          {
            key: 'delete_local_only',
            danger: true,
            label: (
              <Popconfirm
                title={t('k8s:yaml.deleteLocalConfirmTitle')}
                description={t('k8s:yaml.deleteLocalConfirmDesc')}
                okText={t('k8s:yaml.deleteLocalConfirmOk')}
                cancelText={t('common.cancel')}
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDeleteRecordOnly(record)}
              >
                <div style={{ color: 'var(--danger, #ff4d4f)' }}>{t('k8s:yaml.deleteLocalOnly')}</div>
              </Popconfirm>
            ),
            icon: <Trash2 size={13} />,
          },
        ]

        return (
          <Space size={6}>
            {isDeployed ? (
              <Tooltip title={t('k8s:yaml.offlineTooltip')}>
                <Button
                  size="small"
                  danger
                  icon={<Square size={12} />}
                  onClick={() => handleOpenOfflineModal(record)}
                >
                  {t('k8s:yaml.offlineBtn')}
                </Button>
              </Tooltip>
            ) : (
              <Tooltip title={t('k8s:yaml.deployTooltip')}>
                <Button
                  type="primary"
                  size="small"
                  icon={<Play size={12} />}
                  loading={isDeploying}
                  style={{
                    background: 'var(--ok, #52c41a)',
                    borderColor: 'var(--ok, #52c41a)',
                  }}
                  onClick={() => handleRowDeploy(record)}
                >
                  {t('k8s:yaml.deployBtn')}
                </Button>
              </Tooltip>
            )}

            <Tooltip title={t('k8s:yaml.editTooltip')}>
              <Button
                size="small"
                icon={<Edit3 size={12} />}
                onClick={() => handleOpenEditDrawer(record)}
              >
                {t('common.edit')}
              </Button>
            </Tooltip>

            <Dropdown menu={{ items: moreMenuItems }} trigger={['click']}>
              <Button size="small" icon={<MoreHorizontal size={13} />} />
            </Dropdown>
          </Space>
        )
      },
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 14 }}>
      {/* 顶部工具栏 */}
      <div className={s.toolbar}>
        <div className={s.toolbarLeft}>
          <Button
            type="primary"
            icon={<Plus size={13} />}
            onClick={handleOpenCreateDrawer}
          >
            {t('k8s:yaml.newBtn')}
          </Button>

          <Input
            prefix={<Search size={14} color="var(--text-dim)" />}
            placeholder={t('k8s:yaml.searchBarPlaceholder')}
            value={searchKw}
            onChange={(e) => setSearchKw(e.target.value)}
            allowClear
            style={{ width: 280 }}
          />

          <Radio.Group
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            buttonStyle="solid"
            size="middle"
          >
            <Radio.Button value="all">{t('k8s:yaml.filterAll', { count: records.length })}</Radio.Button>
            <Radio.Button value="deployed">
              {t('k8s:yaml.filterDeployed', { count: records.filter((r) => r.status === 'deployed').length })}
            </Radio.Button>
            <Radio.Button value="not_deployed">
              {t('k8s:yaml.filterOffline', { count: records.filter((r) => r.status !== 'deployed').length })}
            </Radio.Button>
          </Radio.Group>
        </div>

        <div className={s.toolbarRight}>
          <Tooltip title={t('k8s:yaml.refreshTooltip')}>
            <Button
              icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
              onClick={fetchRecords}
            />
          </Tooltip>
        </div>
      </div>

      {/* 编排列表表格 */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Table<K8sOrchestrationRecord>
          columns={columns}
          dataSource={filteredRecords}
          rowKey="id"
          loading={loading}
          size="middle"
          pagination={{
            current: page,
            pageSize,
            total: filteredRecords.length,
            onChange: (p, ps) => {
              setPage(p)
              setPageSize(ps)
            },
            showSizeChanger: true,
            showTotal: (total) => t('k8s:yaml.totalRecords', { total }),
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <div style={{ color: 'var(--text-dim)', marginBottom: 8 }}>{t('k8s:yaml.emptyText')}</div>
                }
              />
            ),
          }}
        />
      </div>

      {/* 新建 / 编辑编排抽屉 */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers size={16} color="var(--accent)" />
            <span>{currentRecord ? t('k8s:yaml.drawerTitleEdit', { name: formName || currentRecord.name }) : t('k8s:yaml.drawerTitleNew')}</span>
            {currentRecord && (
              <Tag
                color={currentRecord.status === 'deployed' ? 'success' : 'default'}
                style={{ marginLeft: 4 }}
              >
                {currentRecord.status === 'deployed' ? t('k8s:yaml.statusDeployed') : t('k8s:yaml.statusOffline')}
              </Tag>
            )}
          </div>
        }
        width={860}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Space size={8}>
            <Button
              type="primary"
              size="small"
              icon={<Sparkles size={13} />}
              onClick={() => setAiModalOpen(true)}
            >
              {t('k8s:yaml.aiGenerateBtn')}
            </Button>
            <Button
              size="small"
              icon={<RotateCcw size={12} />}
              onClick={() => setFormYaml('')}
            >
              {t('common.clear')}
            </Button>
            <Button
              size="small"
              icon={<Copy size={12} />}
              onClick={async () => {
                if (!formYaml) {
                  message.info(t('k8s:yaml.noYamlToCopy'))
                  return
                }
                if (await copyText(formYaml)) {
                  message.success(t('k8s:yaml.copiedYaml'))
                }
              }}
            >
              {t('common.copy')}
            </Button>
          </Space>
        }
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '6px 0' }}>
            <Button onClick={() => setDrawerOpen(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button
              type="primary"
              icon={<Play size={13} />}
              loading={saving}
              style={{
                background: 'var(--ok, #52c41a)',
                borderColor: 'var(--ok, #52c41a)',
              }}
              onClick={handleSaveAndApply}
            >
              {saving
                ? t('k8s:yaml.validatingAndDeploying')
                : currentRecord?.status === 'deployed'
                  ? t('k8s:yaml.saveAndRedeploy')
                  : t('k8s:yaml.saveAndDeploy')}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
          {/* 元信息表单 */}
          <div>
            <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
              {t('k8s:yaml.nameRequired')} <span style={{ color: 'var(--danger, #ff4d4f)' }}>*</span>
            </div>
            <Input
              placeholder={t('k8s:yaml.nameExamplePlaceholder')}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>

          {/* YAML 编辑器 */}
          <div style={{ flex: 1, minHeight: 480, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              {t('k8s:yaml.yamlFileRequired')}<span style={{ color: 'var(--danger, #ff4d4f)' }}>*</span>
            </div>
            <CodeEditor
              value={formYaml}
              onChange={setFormYaml}
              lang="yaml"
              bordered
              height="100%"
              minHeight="480px"
              placeholder={t('k8s:yaml.editorInputPlaceholder')}
            />
          </div>
        </div>
      </Drawer>

      {/* 下线资源二次确认模态框 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger, #ff4d4f)' }}>
            <AlertCircle size={18} />
            <span>{t('k8s:yaml.offlineConfirmTitle')}</span>
          </div>
        }
        open={offlineModal.open}
        onCancel={() =>
          !offlineModal.loading &&
          setOfflineModal({ open: false, record: null, deleteLocal: false, loading: false })
        }
        footer={[
          <Button
            key="cancel"
            onClick={() => setOfflineModal({ open: false, record: null, deleteLocal: false, loading: false })}
            disabled={offlineModal.loading}
          >
            {t('common.cancel')}
          </Button>,
          <Button
            key="confirm"
            danger
            type="primary"
            loading={offlineModal.loading}
            onClick={handleConfirmOffline}
          >
            {t('k8s:yaml.confirmOfflineBtn')}
          </Button>,
        ]}
      >
        <div style={{ padding: '10px 0' }}>
          <div style={{ marginBottom: 12, fontSize: 13.5, lineHeight: 1.6 }}>
            {t('k8s:yaml.offlineConfirmQuestion', { name: offlineModal.record?.name })}
          </div>

          <div
            style={{
              padding: '10px 12px',
              background: 'var(--bg-2)',
              borderRadius: 6,
              border: '1px solid var(--border)',
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>{t('k8s:yaml.offlineResourcesListLabel')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {offlineModal.record?.resources && offlineModal.record.resources.length > 0 ? (
                offlineModal.record.resources.map((res, idx) => (
                  <Tag key={idx} color="red">
                    {res.kind}/{res.name}
                  </Tag>
                ))
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                  {offlineModal.record?.resourcesSummary || t('k8s:yaml.noParsedResources')}
                </span>
              )}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <Checkbox
              checked={offlineModal.deleteLocal}
              onChange={(e) =>
                setOfflineModal((prev) => ({ ...prev, deleteLocal: e.target.checked }))
              }
            >
              <span style={{ fontWeight: 500 }}>{t('k8s:yaml.offlineAlsoDeleteLocal')}</span>
            </Checkbox>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4, marginLeft: 22 }}>
              {t('k8s:yaml.offlineAlsoDeleteLocalTip')}
            </div>
          </div>
        </div>
      </Modal>

      {/* AI 生成 YAML 模态框 */}
      <K8sYamlGenerateModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onGenerated={(newYaml) => {
          setFormYaml(newYaml)
          if (!formName.trim()) {
            setFormName('ai-generated-stack')
          }
        }}
        serverId={serverId}
        currentNamespace={currentNamespace && currentNamespace !== '_all' ? currentNamespace : 'default'}
      />
    </div>
  )
}
