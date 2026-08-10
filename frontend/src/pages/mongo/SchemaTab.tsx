import React, {useCallback, useEffect, useState} from 'react'
import Icon from '../../components/Icon'
import {API} from '../../api'
import {errorMessage} from '../../utils'
import {MongoSessionInfo, MongoFieldInfo, MongoValidatorInfo, MongoValidationResult} from '../../types'
import CodeEditor from '../../components/CodeEditor'
import sh from './mongoShared.module.less'
import g from '../../styles/global.module.less'

interface Props {
    session: MongoSessionInfo
    db: string
    collection: string | null
    onNotify: (msg: string, kind?: 'info' | 'error') => void
}

export default function SchemaTab({session, db, collection, onNotify}: Props) {
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
            setCheckResult({valid: false, error: errorMessage(e)})
        } finally {
            setCheckBusy(false)
        }
    }

    if (!collection) {
        return <div className={`${sh.mongoEmpty}`}>请选择左侧集合以查看数据模型与 Schema</div>
    }

    return (
        <div>
            <div className={sh.mongoToolbar}>
                <button className={`${g.btn} ${g.primary}`} disabled={busy} onClick={infer}>
                    <Icon name="refresh" size={13}/> 推断字段模型
                </button>
                <span className={g.spacer}/>
                {error && <span className={g.formError}>{error}</span>}
                <span className={sh.mongoBadge}>{fields.length} 个字段</span>
            </div>

            <div className={sh.mongoH}>数据模型映射（采样推断字段类型与出现率）</div>
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
                                <td>{f.required ? '✓' : ''}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className={sh.mongoH}>Schema 校验规则（JSON Schema / 查询表达式）</div>
            <label className={sh.mongoField}>
                <span>校验器（validator）</span>
                <CodeEditor lang="json" height="180px" value={validator} onChange={setValidator}
                            placeholder='{ "$jsonSchema": { "bsonType": "object", "required": ["name"], "properties": { "name": { "bsonType": "string" } } } }'/>
            </label>
            <div className={sh.mongoRow} style={{gap: 16}}>
                <label className={sh.mongoField} style={{flex: '0 0 200px'}}>
                    <span>校验级别</span>
                    <select className={sh.mongoSelect} value={level} onChange={e => setLevel(e.target.value)}>
                        <option value="off">off（关闭）</option>
                        <option value="moderate">moderate</option>
                        <option value="strict">strict</option>
                    </select>
                </label>
                <label className={sh.mongoField} style={{flex: '0 0 220px'}}>
                    <span>校验动作</span>
                    <select className={sh.mongoSelect} value={action} onChange={e => setAction(e.target.value)}>
                        <option value="error">error（拒绝写入）</option>
                        <option value="warn">warn（仅警告）</option>
                    </select>
                </label>
            </div>
            <div className={sh.mongoRow}>
                <button className={`${g.btn} ${g.primary}`} disabled={validatorBusy} onClick={applyValidator}>保存校验规则</button>
                {validatorMsg && <span className={validatorMsg.includes('已') ? sh.mongoBadge : g.formError}>{validatorMsg}</span>}
            </div>

            <div className={sh.mongoH}>文档校验（用现有规则试跑，不写入数据）</div>
            <label className={sh.mongoField}>
                <span>待校验文档（Extended JSON）</span>
                <CodeEditor lang="json" height="140px" value={checkDoc} onChange={setCheckDoc}/>
            </label>
            <div className={sh.mongoRow}>
                <button className={g.btn} disabled={checkBusy} onClick={validateDoc}>校验该文档</button>
                {checkResult && (
                    checkResult.valid ? (
                        <span className={`${sh.mongoBadge} ok`}>通过校验</span>
                    ) : (
                        <span className={`${sh.mongoBadge} danger`}>校验失败：{checkResult.error}</span>
                    )
                )}
            </div>
        </div>
    )
}
