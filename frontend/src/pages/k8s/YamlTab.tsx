import React, { useState } from 'react'
import { Space, Button, message, Tag } from 'antd'
import {
  Code,
  Copy,
  RotateCcw,
  Sparkles,
  Play,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import K8sYamlGenerateModal from './K8sYamlGenerateModal'
import { API } from '@/api'
import s from './K8sClient.module.less'

interface Props {
  serverId: string
  currentNamespace: string
}

export default function YamlTab({ serverId, currentNamespace }: Props) {
  const [yamlText, setYamlText] = useState('')
  const [generateModalOpen, setGenerateModalOpen] = useState(false)
  const [deploying, setDeploying] = useState(false)

  const handleDeploy = async () => {
    if (!yamlText.trim()) {
      message.warning('请先输入或通过 AI 生成要部署的 YAML 内容')
      return
    }

    setDeploying(true)
    try {
      const results = await API.k8sApplyYAML(serverId, yamlText)
      if (!results || results.length === 0) {
        message.warning('未检测到有效的 Kubernetes 资源定义')
        return
      }

      const failures = results.filter((r) => r.action === 'failed')
      const successes = results.filter((r) => r.action !== 'failed')

      if (failures.length === 0) {
        const summary = successes
          .map((r) => `${r.kind}/${r.name} (${r.action === 'created' ? '已创建' : '已更新'})`)
          .join('、')
        message.success(`部署成功: ${summary}`, 4)
      } else if (successes.length === 0) {
        const detail = failures.map((r) => `${r.kind}/${r.name || '未知'}: ${r.message}`).join('; ')
        message.error(`部署失败: ${detail}`, 5)
      } else {
        const succSummary = successes.map((r) => `${r.kind}/${r.name}`).join('、')
        const failSummary = failures.map((r) => `${r.kind}/${r.name}: ${r.message}`).join('; ')
        message.warning(`部分成功 (${successes.length} 成功, ${failures.length} 失败)。成功: ${succSummary}；失败: ${failSummary}`, 6)
      }
    } catch (err: any) {
      message.error(`部署执行异常: ${err.message || String(err)}`, 5)
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 14 }}>
      {/* 顶栏控制 */}
      <div className={s.toolbar}>
        <div className={s.toolbarLeft}>
          <Space size={8}>
            <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}>
              YAML 资源编排
            </span>
          </Space>
        </div>

        <div className={s.toolbarRight}>
          <Button
            type="primary"
            size="small"
            icon={<Play size={12} />}
            style={{ background: 'var(--ok, #52c41a)', borderColor: 'var(--ok, #52c41a)' }}
            loading={deploying}
            disabled={!yamlText.trim()}
            onClick={handleDeploy}
          >
            {deploying ? '正在部署...' : '部署'}
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<Sparkles size={13} />}
            onClick={() => setGenerateModalOpen(true)}
          >
            AI 生成
          </Button>
          <Button
            size="small"
            icon={<RotateCcw size={12} />}
            onClick={() => setYamlText('')}
          >
            清空
          </Button>
          <Button
            size="small"
            icon={<Copy size={12} />}
            onClick={() => {
              if (!yamlText) {
                message.info('当前没有可复制的 YAML 内容')
                return
              }
              navigator.clipboard.writeText(yamlText)
            }}
          >
            复制
          </Button>
        </div>
      </div>

      {/* 编辑区域 */}
      <div style={{ flex: 1, minHeight: 480, display: 'flex', flexDirection: 'column' }}>
        <CodeEditor
          value={yamlText}
          onChange={setYamlText}
          lang="yaml"
          bordered
          height="560px"
          minHeight="560px"
          placeholder="在此粘贴、编写或使用「AI 生成 YAML」创建 Kubernetes 资源清单 (支持多资源 --- 分隔)..."
        />
      </div>

      {/* AI 生成 YAML 模态框 */}
      <K8sYamlGenerateModal
        open={generateModalOpen}
        onClose={() => setGenerateModalOpen(false)}
        onGenerated={(newYaml) => setYamlText(newYaml)}
        serverId={serverId}
        currentNamespace={currentNamespace}
      />
    </div>
  )
}
