import { useCallback, useEffect, useState } from 'react'
import { Select, Button, Tag, App } from 'antd'
import { RotateCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { API } from '@/api'
import { errorMessage } from '@/utils'
import { MongoSessionInfo, MongoFieldInfo, MongoValidatorInfo, MongoValidationResult } from '@/types'
import CodeEditor from '@/components/CodeEditor'
import sh from '@/pages/mongo/mongoShared.module.less'

interface Props {
    session: MongoSessionInfo
    db: string
    collection: string | null
}

export default function SchemaTab({ session, db, collection }: Props) {
    const { t } = useTranslation(['db', 'common'])
    const { message } = App.useApp()
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
            setValidatorMsg(t('mongo.schema.ruleSaved', '校验规则已保存'))
            message.success(t('mongo.schema.ruleUpdated', 'Schema 校验规则已更新'))
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
        return <div className={`${sh.mongoEmpty}`}>{t('mongo.schema.selectCollHint', '请选择左侧集合以查看数据模型与 Schema')}</div>
    }

    return (
        <div>
            <div className={sh.mongoToolbar} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                <Button type="primary" size="small" icon={<RotateCw size={13} />} disabled={busy} onClick={infer}>
                    {t('mongo.schema.inferBtn', '推断字段模型')}
                </Button>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {error && <span style={{ color: '#ef4444', fontSize: 12 }}>{error}</span>}
                    <Tag color="geekblue">{t('mongo.schema.fieldsCount', { count: fields.length, defaultValue: `${fields.length} 个字段` })}</Tag>
                </span>
            </div>

            <div className={sh.mongoH} style={{ marginTop: 12 }}>{t('mongo.schema.mappingTitle', '数据模型映射（采样推断字段类型与出现率）')}</div>
            {fields.length === 0 && !busy ? (
                <div className={`${sh.mongoEmpty}`}>{t('mongo.schema.noInference', '暂无推断结果')}</div>
            ) : (
                <div className={sh.mongoGridWrap}>
                    <table className={sh.mongoTable}>
                        <thead>
                            <tr>
                                <th>{t('mongo.schema.colFieldPath', '字段路径')}</th>
                                <th>{t('mongo.schema.colMainType', '主类型')}</th>
                                <th>{t('mongo.schema.colCandidateTypes', '候选类型')}</th>
                                <th>{t('mongo.schema.colCount', '出现数')}</th>
                                <th>{t('mongo.schema.colPresence', '出现率')}</th>
                                <th>{t('mongo.schema.colRequired', '必填')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {fields.map((f) => (
                                <tr key={f.field}>
                                    <td>{f.field}</td>
                                    <td>{f.type}</td>
                                    <td>{f.types.join(', ')}</td>
                                    <td>{f.count}</td>
                                    <td>{(f.presence * 100).toFixed(1)}%</td>
                                    <td>{f.required ? <Tag color="red">{t('mongo.schema.yes', '是')}</Tag> : ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className={sh.mongoH} style={{ marginTop: 16 }}>{t('mongo.schema.rulesTitle', 'Schema 校验规则（JSON Schema / 查询表达式）')}</div>
            <label className={sh.mongoField}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('mongo.schema.validatorLabel', '校验器（validator）')}</span>
                <CodeEditor lang="json" height="180px" value={validator} onChange={setValidator}
                    placeholder='{ "$jsonSchema": { "bsonType": "object", "required": ["name"], "properties": { "name": { "bsonType": "string" } } } }' />
            </label>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginTop: 8 }}>
                <div style={{ flex: '0 0 200px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('mongo.schema.levelLabel', '校验级别')}</span>
                    <Select
                        size="small"
                        value={level}
                        onChange={setLevel}
                        options={[
                            { value: 'off', label: t('mongo.schema.levelOff', 'off (关闭)') },
                            { value: 'moderate', label: 'moderate' },
                            { value: 'strict', label: 'strict' },
                        ]}
                    />
                </div>
                <div style={{ flex: '0 0 220px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('mongo.schema.actionLabel', '校验动作')}</span>
                    <Select
                        size="small"
                        value={action}
                        onChange={setAction}
                        options={[
                            { value: 'error', label: t('mongo.schema.actionError', 'error (拒绝写入)') },
                            { value: 'warn', label: t('mongo.schema.actionWarn', 'warn (仅警告)') },
                        ]}
                    />
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <Button type="primary" size="small" disabled={validatorBusy} onClick={applyValidator}>{t('mongo.schema.saveRules', '保存校验规则')}</Button>
                {validatorMsg && <Tag color={validatorMsg.includes('已') || validatorMsg.toLowerCase().includes('saved') ? 'green' : 'red'}>{validatorMsg}</Tag>}
            </div>

            <div className={sh.mongoH} style={{ marginTop: 16 }}>{t('mongo.schema.docValidateTitle', '文档校验（用现有规则试跑，不写入数据）')}</div>
            <label className={sh.mongoField}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('mongo.schema.docValidateLabel', '待校验文档（Extended JSON）')}</span>
                <CodeEditor lang="json" height="140px" value={checkDoc} onChange={setCheckDoc} />
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <Button size="small" disabled={checkBusy} onClick={validateDoc}>{t('mongo.schema.validateBtn', '校验该文档')}</Button>
                {checkResult && (
                    checkResult.valid ? (
                        <Tag color="success">{t('mongo.schema.validPass', '通过校验')}</Tag>
                    ) : (
                        <Tag color="error">{t('mongo.schema.validFail', { error: checkResult.error, defaultValue: `校验失败：${checkResult.error}` })}</Tag>
                    )
                )}
            </div>
        </div>
    )
}
