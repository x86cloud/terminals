import React, { useCallback, useEffect, useState } from 'react'
import { Select, Button, Space, Tag, Alert } from 'antd'
import { RotateCw } from 'lucide-react'
import { API } from '@/api'
import { errorMessage } from '@/utils'
import { MongoSessionInfo, MongoFieldInfo, MongoValidatorInfo, MongoValidationResult } from '@/types'
import CodeEditor from '@/components/CodeEditor'
import sh from '@/pages/mongo/mongoShared.module.less'

interface Props {
    session: MongoSessionInfo
    db: string
    collection: string | null
    onNotify: (msg: string, kind?: 'info' | 'error') => void
}

export default function SchemaTab({ session, db, collection, onNotify }: Props) {
    const [fields, setFields] = useState<MongoFieldInfo[]>([])
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    // 校验规则
    const [validator, setValidator] = useState('')
    const [level, setLevel] = useState('strict')
    const [action, setAction] = useState('error')
    const [validatorBusy, setValidatorBusy] = useState(false)
    const [validatorMsg, setValidatorMsg] = useState('')

    // 文档校验
    const [checkDoc, setCheckDoc] = useState('{}')
    const [checkResult, setCheckResult] = useState<MongoValidationResult | null>(null)
    const [checkBusy, setCheckBusy] = useState(false)

    const id = session.id

    const infer = useCallback(async () => {
        if (!db || !collection) return
        setBusy(true)
        setError('')
        try {
            setFields(await API.mongoInferSchema(id, db, collection, 200))
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [id, db, collection])

    const loadValidator = useCallback(async () => {
        if (!db || !collection) return
        try {
            const v: MongoValidatorInfo = await API.mongoGetValidator(id, db, collection)
            setValidator(v.validator || '')
            setLevel(v.validationLevel || 'strict')
            setAction(v.validationAction || 'error')
        } catch {
            /* ignore */
        }
    }, [id, db, collection])

    useEffect(() => {
        setFields([])
        setValidator('')
        void infer()
        void loadValidator()
    }, [infer, loadValidator])

    const applyValidator = async () => {
        setValidatorBusy(true)
        setValidatorMsg('')
        try {
            await API.mongoSetValidator(id, db, collection!, validator, level, action)
            setValidatorMsg('校验规则已保存')
            onNotify('Schema 校验规则已更新')
        } catch (e) {
            setValidatorMsg(errorMessage(e))
        } finally {
            setValidatorBusy(false)
        }
    }

    const validateDoc = async () => {
        setCheckBusy(true)
        setCheckResult(null)
        try {
            setCheckResult(await API.mongoValidateDocument(id, db, collection!, checkDoc))
        } catch (e) {
            setCheckResult({ valid: false, error: errorMessage(e) })
        } finally {
            setCheckBusy(false)
        }
    }

    if (!collection) {
        return <div className={`${sh.mongoEmpty}`}>请选择左侧集合以查看数据模型与 Schema</div>
    }

    return (
        <div>
            <div className={sh.mongoToolbar} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                <Button type="primary" size="small" icon={<RotateCw size={13} />} disabled={busy} onClick={infer}>
                    推断字段模型
                </Button>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {error && <span style={{ color: '#ef4444', fontSize: 12 }}>{error}</span>}
                    <Tag color="geekblue">{fields.length} 个字段</Tag>
                </span>
            </div>

            <div className={sh.mongoH} style={{ marginTop: 12 }}>数据模型映射（采样推断字段类型与出现率）</div>
            {fields.length === 0 && !busy ? (
                <div className={`${sh.mongoEmpty}`}>暂无推断结果</div>
            ) : (
                <div className={sh.mongoGridWrap}>
                    <table className={sh.mongoTable}>
                        <thead>
                            <tr><th>字段路径</th><th>主类型</th><th>候选类型</th><th>出现数</th><th>出现率</th><th>必填</th></tr>
                        </thead>
                        <tbody>
                            {fields.map((f) => (
                                <tr key={f.field}>
                                    <td>{f.field}</td>
                                    <td>{f.type}</td>
                                    <td>{f.types.join(', ')}</td>
                                    <td>{f.count}</td>
                                    <td>{(f.presence * 100).toFixed(1)}%</td>
                                    <td>{f.required ? <Tag color="red">是</Tag> : ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className={sh.mongoH} style={{ marginTop: 16 }}>Schema 校验规则（JSON Schema / 查询表达式）</div>
            <label className={sh.mongoField}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>校验器（validator）</span>
                <CodeEditor lang="json" height="180px" value={validator} onChange={setValidator}
                    placeholder='{ "$jsonSchema": { "bsonType": "object", "required": ["name"], "properties": { "name": { "bsonType": "string" } } } }' />
            </label>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginTop: 8 }}>
                <div style={{ flex: '0 0 200px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>校验级别</span>
                    <Select
                        size="small"
                        value={level}
                        onChange={setLevel}
                        options={[
                            { value: 'off', label: 'off (关闭)' },
                            { value: 'moderate', label: 'moderate' },
                            { value: 'strict', label: 'strict' },
                        ]}
                    />
                </div>
                <div style={{ flex: '0 0 220px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>校验动作</span>
                    <Select
                        size="small"
                        value={action}
                        onChange={setAction}
                        options={[
                            { value: 'error', label: 'error (拒绝写入)' },
                            { value: 'warn', label: 'warn (仅警告)' },
                        ]}
                    />
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <Button type="primary" size="small" disabled={validatorBusy} onClick={applyValidator}>保存校验规则</Button>
                {validatorMsg && <Tag color={validatorMsg.includes('已') ? 'green' : 'red'}>{validatorMsg}</Tag>}
            </div>

            <div className={sh.mongoH} style={{ marginTop: 16 }}>文档校验（用现有规则试跑，不写入数据）</div>
            <label className={sh.mongoField}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>待校验文档（Extended JSON）</span>
                <CodeEditor lang="json" height="140px" value={checkDoc} onChange={setCheckDoc} />
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <Button size="small" disabled={checkBusy} onClick={validateDoc}>校验该文档</Button>
                {checkResult && (
                    checkResult.valid ? (
                        <Tag color="success">通过校验</Tag>
                    ) : (
                        <Tag color="error">校验失败：{checkResult.error}</Tag>
                    )
                )}
            </div>
        </div>
    )
}
