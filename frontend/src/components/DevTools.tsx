import React, {useEffect, useMemo, useState} from 'react'
import Icon from './Icon'
import {md5} from '../utils/md5'
import g from '../styles/global.module.less'
import dt from './DevTools.module.less'

type ToolKey = 'md5' | 'timestamp' | 'base64'

const TOOLS: {key: ToolKey; label: string}[] = [
    {key: 'md5', label: 'MD5 哈希'},
    {key: 'timestamp', label: '时间戳'},
    {key: 'base64', label: 'Base64 编解码'},
]

function CopyButton({value}: {value: string}) {
    const [copied, setCopied] = useState(false)
    const onClick = async () => {
        if (!value) return
        try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
        } catch {
            /* ignore */
        }
    }
    return (
        <button className={`${g.btn} ${g.small}`} onClick={onClick} disabled={!value} title="复制">
            <Icon name="copy" size={13}/>
            {copied ? '已复制' : '复制'}
        </button>
    )
}

/* ---------------- MD5 ---------------- */
function Md5Tool() {
    const [text, setText] = useState('')
    const [upper, setUpper] = useState(false)

    const hash = useMemo(() => {
        if (!text) return ''
        return md5(text, upper)
    }, [text, upper])

    return (
        <div className={dt.tool}>
            <h3 className={dt.toolTitle}>MD5 哈希计算</h3>
            <p className={dt.desc}>输入文本后实时计算 32 位 MD5 值（支持大小写）。</p>
            <label className={dt.label}>文本</label>
            <textarea
                className={dt.textarea}
                rows={5}
                value={text}
                placeholder="在此输入需要计算哈希的文本…"
                onChange={(e) => setText(e.target.value)}
            />
            <div className={dt.optRow}>
                <label className={dt.switchInline}>
                    <input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)}/>
                    <span>大写输出</span>
                </label>
                <span className={g.spacer}/>
                <CopyButton value={hash}/>
            </div>
            <div className={dt.resultBox}>
                <code className={dt.resultText}>{hash || '—'}</code>
            </div>
        </div>
    )
}

/* ---------------- 时间戳 ---------------- */
function pad(n: number) {
    return n < 10 ? '0' + n : '' + n
}

function fmtDate(d: Date) {
    return (
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    )
}

function TimestampTool() {
    const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))
    const [nowMs, setNowMs] = useState(() => Date.now())

    useEffect(() => {
        const t = setInterval(() => {
            setNowSec(Math.floor(Date.now() / 1000))
            setNowMs(Date.now())
        }, 250)
        return () => clearInterval(t)
    }, [])

    const [toDate, setToDate] = useState('')
    const [dateResult, setDateResult] = useState('')

    const [picker, setPicker] = useState('')
    const [tsResult, setTsResult] = useState('')

    const convertToDate = (raw: string) => {
        const v = raw.trim()
        if (!v) {
            setDateResult('')
            return
        }
        const num = Number(v)
        if (!Number.isFinite(num)) {
            setDateResult('无效的时间戳')
            return
        }
        const ms = v.length >= 13 ? num : num * 1000
        const d = new Date(ms)
        if (isNaN(d.getTime())) {
            setDateResult('无效的时间戳')
            return
        }
        setDateResult(fmtDate(d))
    }

    const convertToTs = (local: string) => {
        if (!local) {
            setTsResult('')
            return
        }
        const d = new Date(local)
        if (isNaN(d.getTime())) {
            setTsResult('')
            return
        }
        setTsResult(String(Math.floor(d.getTime() / 1000)))
    }

    return (
        <div className={dt.tool}>
            <h3 className={dt.toolTitle}>时间戳转换</h3>
            <p className={dt.desc}>当前时间戳实时显示，并支持时间戳与日期互转（精确到秒）。</p>

            <div className={dt.tsRow}>
                <div className={dt.tsCard}>
                    <span className={dt.tsLabel}>秒级 (s)</span>
                    <code className={dt.tsValue}>{nowSec}</code>
                    <CopyButton value={String(nowSec)}/>
                </div>
                <div className={dt.tsCard}>
                    <span className={dt.tsLabel}>毫秒级 (ms)</span>
                    <code className={dt.tsValue}>{nowMs}</code>
                    <CopyButton value={String(nowMs)}/>
                </div>
            </div>

            <div className={dt.subWrap}>
                <h4 className={dt.subTitle}>时间戳 → 日期</h4>
                <input
                    className={dt.input}
                    value={toDate}
                    placeholder="输入时间戳，如 1764528000"
                    onChange={(e) => {
                        setToDate(e.target.value)
                        convertToDate(e.target.value)
                    }}
                />
                <div className={dt.resultBox}>
                    <code className={dt.resultText}>{dateResult || '—'}</code>
                </div>
            </div>

            <div className={dt.subWrap}>
                <h4 className={dt.subTitle}>日期 → 时间戳</h4>
                <input
                    className={dt.input}
                    type="datetime-local"
                    step={1}
                    value={picker}
                    onChange={(e) => {
                        setPicker(e.target.value)
                        convertToTs(e.target.value)
                    }}
                />
                <div className={dt.optRow}>
                    <span className={dt.tsLabel}>对应秒级时间戳</span>
                    <span className={g.spacer}/>
                    <CopyButton value={tsResult}/>
                </div>
                <div className={dt.resultBox}>
                    <code className={dt.resultText}>{tsResult || '—'}</code>
                </div>
            </div>
        </div>
    )
}

/* ---------------- Base64 ---------------- */
function toBase64(str: string) {
    try {
        return btoa(unescape(encodeURIComponent(str)))
    } catch {
        return ''
    }
}

function fromBase64(b64: string) {
    try {
        return decodeURIComponent(escape(atob(b64)))
    } catch {
        return '解码失败：不是合法的 Base64'
    }
}

function Base64Tool() {
    const [mode, setMode] = useState<'encode' | 'decode'>('encode')
    const [input, setInput] = useState('')
    const result = useMemo(() => {
        if (!input) return ''
        return mode === 'encode' ? toBase64(input) : fromBase64(input)
    }, [input, mode])

    return (
        <div className={dt.tool}>
            <h3 className={dt.toolTitle}>Base64 编解码</h3>
            <p className={dt.desc}>支持文本与 Base64 字符串的双向实时转换。</p>
            <div className={g.segmented}>
                <button className={mode === 'encode' ? g.active : ''} onClick={() => setMode('encode')}>
                    编码
                </button>
                <button className={mode === 'decode' ? g.active : ''} onClick={() => setMode('decode')}>
                    解码
                </button>
            </div>
            <label className={dt.label}>{mode === 'encode' ? '原始文本' : 'Base64 字符串'}</label>
            <textarea
                className={dt.textarea}
                rows={5}
                value={input}
                placeholder={mode === 'encode' ? '输入需要编码的文本…' : '输入需要解码的 Base64…'}
                onChange={(e) => setInput(e.target.value)}
            />
            <div className={dt.optRow}>
                <span className={dt.tsLabel}>{mode === 'encode' ? '编码结果' : '解码结果'}</span>
                <span className={g.spacer}/>
                <CopyButton value={result}/>
            </div>
            <div className={dt.resultBox}>
                <code className={dt.resultText}>{result || '—'}</code>
            </div>
        </div>
    )
}

/* ---------------- 主组件 ---------------- */
export default function DevTools({onClose}: {onClose: () => void}) {
    const [active, setActive] = useState<ToolKey>('md5')

    return (
        <div className={dt.devPane}>
            <div className={dt.devSide}>
                {TOOLS.map((t) => (
                    <button
                        key={t.key}
                        className={`${dt.devTab}${active === t.key ? ' ' + dt.active : ''}`}
                        onClick={() => setActive(t.key)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            <div className={dt.devMain}>
                <div className={dt.devHeader}>
                    <span className={dt.devHeaderTitle}>常用开发工具集</span>
                    <span className={g.spacer}/>
                    <button className={g.iconBtn} title="关闭" onClick={onClose}>
                        <Icon name="close" size={15}/>
                    </button>
                </div>
                <div className={dt.devBody}>
                    {active === 'md5' && <Md5Tool/>}
                    {active === 'timestamp' && <TimestampTool/>}
                    {active === 'base64' && <Base64Tool/>}
                </div>
            </div>
        </div>
    )
}
