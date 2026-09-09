import React, { useState, useEffect, useMemo } from 'react'
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
  message,
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
import CodeEditor from '@/components/CodeEditor'
import K8sYamlGenerateModal from './K8sYamlGenerateModal'
import { API } from '@/api'
import type { K8sOrchestrationRecord, K8sResourceItemSummary } from '@/types'
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
      message.error(`获取本地编排记录失败: ${err.message || String(err)}`)
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
      message.warning('请输入编排名称')
      return
    }
    if (!trimmedYaml) {
      message.warning('请输入有效的 Kubernetes YAML 清单内容')
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
        message.warning('YAML 未包含可部署的有效 Kubernetes 资源')
        return
      }

      const failures = results.filter((r) => r.action === 'failed')
      const successes = results.filter((r) => r.action !== 'failed')

      if (failures.length === 0) {
        message.success(`编排 [${trimmedName}] 部署并保存成功！已应用 ${successes.length} 项资源`)
      } else if (successes.length === 0) {
        const detail = failures.map((r) => `${r.kind}/${r.name || '未知'}: ${r.message}`).join('; ')
        message.error(`部署失败: ${detail}。配置未保存，请修正后重试。`, 6)
        return
      } else {
        message.warning(
          `部分部署成功 (${successes.length} 成功, ${failures.length} 失败)，已保存当前编排至本地。`,
          5,
        )
      }

      setDrawerOpen(false)
      await fetchRecords()
    } catch (err: any) {
      message.error(`部署失败: ${err.message || String(err)}。配置未保存，请修正后重试。`, 6)
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
        message.success(`编排 [${rec.name}] 部署成功！已同步 ${successes.length} 项资源`)
      } else if (successes.length === 0) {
        const detail = failures.map((r) => `${r.kind}/${r.name || '未知'}: ${r.message}`).join('; ')
        message.error(`部署失败: ${detail}`, 6)
      } else {
        message.warning(`编排 [${rec.name}] 部分同步成功 (${successes.length} 成功, ${failures.length} 失败)`)
      }
      await fetchRecords()
    } catch (err: any) {
      message.error(`部署执行异常: ${err.message || String(err)}`)
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
      const successes = results?.filter((r) => r.action !== 'failed') || []

      if (failures.length === 0) {
        message.success(
          `编排 [${offlineModal.record.name}] 集群资源已下线！${offlineModal.deleteLocal ? '本地记录已删除。' : '本地记录已标记为未部署。'}`,
          4,
        )
      } else {
        const failMsg = failures.map((f) => `${f.kind}/${f.name}: ${f.message}`).join('; ')
        message.warning(`部分资源下线失败: ${failMsg}`, 5)
      }

      setOfflineModal({ open: false, record: null, deleteLocal: false, loading: false })
      await fetchRecords()
    } catch (err: any) {
      message.error(`下线资源失败: ${err.message || String(err)}`)
      setOfflineModal((prev) => ({ ...prev, loading: false }))
    }
  }

  // 仅删除本地记录（不下线集群资源）
  const handleDeleteRecordOnly = async (rec: K8sOrchestrationRecord) => {
    try {
      await API.k8sDeleteOrchestrationRecordOnly(rec.id)
      message.success(`编排本地配置 [${rec.name}] 已删除`)
      await fetchRecords()
    } catch (err: any) {
      message.error(`删除本地配置失败: ${err.message || String(err)}`)
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
      title: '编排名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name: string, record) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>{name}</span>
            <Tooltip title="复制编排名称">
              <Button
                type="text"
                size="small"
                icon={<Copy size={11} />}
                style={{ padding: 0, width: 16, height: 16, color: 'var(--text-faint)' }}
                onClick={(e) => {
                  e.stopPropagation()
                  navigator.clipboard.writeText(name)
                  message.success('编排名称已复制')
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
      title: '默认命名空间',
      dataIndex: 'namespace',
      key: 'namespace',
      width: 140,
      render: (ns: string) => <Tag color="blue">{ns || 'default'}</Tag>,
    },
    {
      title: '集群部署状态',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => {
        const isDeployed = status === 'deployed'
        return isDeployed ? (
          <Tag color="success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span className={s.onlineDot} style={{ width: 5, height: 5 }} />
            <span>已部署</span>
          </Tag>
        ) : (
          <Tag color="default" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-faint)' }} />
            <span>已下线</span>
          </Tag>
        )
      },
    },
    {
      title: '包含资源 (点击跳转定位)',
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
                title={`点击跳转并定位 ${res.kind}: ${res.name} (命名空间: ${res.namespace || record.namespace})`}
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
      title: '最后更新',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: (t: string) => (
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {t ? new Date(t).toLocaleString() : '-'}
        </span>
      ),
    },
    {
      title: '操作',
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
                  label: '重新应用/同步部署',
                  icon: <RotateCcw size={13} />,
                  disabled: isDeploying,
                  onClick: () => handleRowDeploy(record),
                },
              ]
            : []),
          {
            key: 'copy_yaml',
            label: '复制 YAML 内容',
            icon: <Copy size={13} />,
            onClick: () => {
              navigator.clipboard.writeText(record.yamlContent)
              message.success('YAML 内容已复制到剪贴板')
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
                title="确定仅删除本地编排记录？"
                description="集群中已运行的实际资源不会受到影响，仅移除此客户端记录。"
                okText="删除本地记录"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDeleteRecordOnly(record)}
              >
                <div style={{ color: 'var(--danger, #ff4d4f)' }}>仅删除本地记录</div>
              </Popconfirm>
            ),
            icon: <Trash2 size={13} />,
          },
        ]

        return (
          <Space size={6}>
            {isDeployed ? (
              <Tooltip title="从集群中下线清理相关声明资源">
                <Button
                  size="small"
                  danger
                  icon={<Square size={12} />}
                  onClick={() => handleOpenOfflineModal(record)}
                >
                  下线
                </Button>
              </Tooltip>
            ) : (
              <Tooltip title="将当前 YAML 清单部署至集群">
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
                  部署
                </Button>
              </Tooltip>
            )}

            <Tooltip title="编辑 YAML 内容或元信息">
              <Button
                size="small"
                icon={<Edit3 size={12} />}
                onClick={() => handleOpenEditDrawer(record)}
              >
                编辑
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
            新建编排
          </Button>

          <Input
            prefix={<Search size={14} color="var(--text-dim)" />}
            placeholder="搜索编排名称 / 资源类型 / 资源名称..."
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
            <Radio.Button value="all">全部 ({records.length})</Radio.Button>
            <Radio.Button value="deployed">
              已部署 ({records.filter((r) => r.status === 'deployed').length})
            </Radio.Button>
            <Radio.Button value="not_deployed">
              已下线 ({records.filter((r) => r.status !== 'deployed').length})
            </Radio.Button>
          </Radio.Group>
        </div>

        <div className={s.toolbarRight}>
          <Tooltip title="刷新编排列表">
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
            showTotal: (total) => `共 ${total} 条编排记录`,
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <div style={{ color: 'var(--text-dim)', marginBottom: 8 }}>暂无 YAML 资源编排记录</div>
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
            <span>{currentRecord ? `编辑资源编排: ${formName || currentRecord.name}` : '新建 Kubernetes 资源编排'}</span>
            {currentRecord && (
              <Tag
                color={currentRecord.status === 'deployed' ? 'success' : 'default'}
                style={{ marginLeft: 4 }}
              >
                {currentRecord.status === 'deployed' ? '已部署' : '已下线'}
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
              AI 生成 YAML
            </Button>
            <Button
              size="small"
              icon={<RotateCcw size={12} />}
              onClick={() => setFormYaml('')}
            >
              清空
            </Button>
            <Button
              size="small"
              icon={<Copy size={12} />}
              onClick={() => {
                if (!formYaml) {
                  message.info('当前没有可复制的 YAML 内容')
                  return
                }
                navigator.clipboard.writeText(formYaml)
                message.success('YAML 内容已复制到剪贴板')
              }}
            >
              复制
            </Button>
          </Space>
        }
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '6px 0' }}>
            <Button onClick={() => setDrawerOpen(false)} disabled={saving}>
              取消
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
                ? '正在部署验证...'
                : currentRecord?.status === 'deployed'
                  ? '保存并重新部署'
                  : '保存并部署'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
          {/* 元信息表单 */}
          <div>
            <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
              编排名称 <span style={{ color: 'var(--danger, #ff4d4f)' }}>*</span>
            </div>
            <Input
              placeholder="例如: nginx-web-stack, redis-cluster"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>

          {/* YAML 编辑器 */}
          <div style={{ flex: 1, minHeight: 480, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              编排文件<span style={{ color: 'var(--danger, #ff4d4f)' }}>*</span>
            </div>
            <CodeEditor
              value={formYaml}
              onChange={setFormYaml}
              lang="yaml"
              bordered
              height="100%"
              minHeight="480px"
              placeholder="在此粘贴、编写或使用「AI 生成 YAML」创建 Kubernetes 资源清单 (支持多资源 --- 分隔)..."
            />
          </div>
        </div>
      </Drawer>

      {/* 下线资源二次确认模态框 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger, #ff4d4f)' }}>
            <AlertCircle size={18} />
            <span>下线集群资源确认</span>
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
            取消
          </Button>,
          <Button
            key="confirm"
            danger
            type="primary"
            loading={offlineModal.loading}
            onClick={handleConfirmOffline}
          >
            确认下线资源
          </Button>,
        ]}
      >
        <div style={{ padding: '10px 0' }}>
          <div style={{ marginBottom: 12, fontSize: 13.5, lineHeight: 1.6 }}>
            确定要下线编排 <strong>[{offlineModal.record?.name}]</strong> 声明的所有集群资源吗？
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
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>即将下线删除的资源：</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {offlineModal.record?.resources && offlineModal.record.resources.length > 0 ? (
                offlineModal.record.resources.map((res, idx) => (
                  <Tag key={idx} color="red">
                    {res.kind}/{res.name}
                  </Tag>
                ))
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                  {offlineModal.record?.resourcesSummary || '未解析出明确资源'}
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
              <span style={{ fontWeight: 500 }}>同时删除本地编排配置文件</span>
            </Checkbox>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4, marginLeft: 22 }}>
              未勾选时：仅从 Kubernetes 集群中清理资源，本地编排配置将保留并标记为「未部署/已下线」，方便日后重新部署。
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
