import { useEffect, useMemo, useState, useTransition } from 'react'
import { Button, Input, Switch, Segmented } from 'antd'
import { Copy, Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { md5 } from '@/utils/md5'
import { downloadText, toBase64, fromBase64 } from '@/utils'
import CodeEditor from '@/components/CodeEditor'
import g from '@/styles/global.module.less'
import dt from '@/components/DevTools.module.less'

type ToolKey = 'md5' | 'timestamp' | 'base64' | 'json'

function CopyButton({ value }: { value: string }) {
    const { t } = useTranslation(['devtools', 'common'])
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
        <Button size="small" icon={<Copy size={13} />} onClick={onClick} disabled={!value}>
            {copied ? t('devtools:copied', { defaultValue: '已复制' }) : t('devtools:copy', { defaultValue: '复制' })}
        </Button>
    )
}

/* ---------------- MD5 ---------------- */
function Md5Tool() {
    const { t } = useTranslation(['devtools', 'common'])
    const [text, setText] = useState('')
    const [upper, setUpper] = useState(false)

    const hash = useMemo(() => {
        if (!text) return ''
        return md5(text, upper)
    }, [text, upper])

    return (
        <div className={dt.tool}>
            <h3 className={dt.toolTitle}>{t('devtools:md5.title', { defaultValue: 'MD5 哈希计算' })}</h3>
            <p className={dt.desc}>{t('devtools:md5.desc', { defaultValue: '输入文本后实时计算 32 位 MD5 值（支持大小写）。' })}</p>
            <label className={dt.label}>{t('devtools:md5.label', { defaultValue: '文本' })}</label>
            <Input.TextArea
                rows={5}
                value={text}
                placeholder={t('devtools:md5.placeholder', { defaultValue: '在此输入需要计算哈希的文本…' })}
                onChange={(e) => setText(e.target.value)}
            />
            <div className={dt.optRow}>
                <label className={dt.switchInline} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Switch size="small" checked={upper} onChange={setUpper} />
                    <span>{t('devtools:md5.uppercase', { defaultValue: '大写输出' })}</span>
                </label>
                <span className={g.spacer} />
                <CopyButton value={hash} />
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
    const { t } = useTranslation(['devtools', 'common'])
    const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))
    const [nowMs, setNowMs] = useState(() => Date.now())

    useEffect(() => {
        const timer = setInterval(() => {
            setNowSec(Math.floor(Date.now() / 1000))
            setNowMs(Date.now())
        }, 250)
        return () => clearInterval(timer)
    }, [])

    const [toDate, setToDate] = useState('')
    const [dateResult, setDateResult] = useState('')

    const [picker, setPicker] = useState('')
    const [tsResult, setTsResult] = useState('')

    const invalidTsText = t('devtools:timestamp.invalidTs', { defaultValue: '无效的时间戳' })

    const convertToDate = (raw: string) => {
        const v = raw.trim()
        if (!v) {
            setDateResult('')
            return
        }
        const num = Number(v)
        if (!Number.isFinite(num)) {
            setDateResult(invalidTsText)
            return
        }
        const ms = v.length >= 13 ? num : num * 1000
        const d = new Date(ms)
        if (isNaN(d.getTime())) {
            setDateResult(invalidTsText)
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
            <h3 className={dt.toolTitle}>{t('devtools:timestamp.title', { defaultValue: '时间戳转换' })}</h3>
            <p className={dt.desc}>{t('devtools:timestamp.desc', { defaultValue: '当前时间戳实时显示，并支持时间戳与日期互转（精确到秒）。' })}</p>

            <div className={dt.tsRow}>
                <div className={dt.tsCard}>
                    <span className={dt.tsLabel}>{t('devtools:timestamp.secLabel', { defaultValue: '秒级 (s)' })}</span>
                    <code className={dt.tsValue}>{nowSec}</code>
                    <CopyButton value={String(nowSec)} />
                </div>
                <div className={dt.tsCard}>
                    <span className={dt.tsLabel}>{t('devtools:timestamp.msLabel', { defaultValue: '毫秒级 (ms)' })}</span>
                    <code className={dt.tsValue}>{nowMs}</code>
                    <CopyButton value={String(nowMs)} />
                </div>
            </div>

            <div className={dt.subWrap}>
                <h4 className={dt.subTitle}>{t('devtools:timestamp.subTitleTsToDate', { defaultValue: '时间戳 → 日期' })}</h4>
                <Input
                    value={toDate}
                    placeholder={t('devtools:timestamp.tsPlaceholder', { defaultValue: '输入时间戳，如 1764528000' })}
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
                <h4 className={dt.subTitle}>{t('devtools:timestamp.subTitleDateToTs', { defaultValue: '日期 → 时间戳' })}</h4>
                <Input
                    type="datetime-local"
                    step={1}
                    value={picker}
                    onChange={(e) => {
                        setPicker(e.target.value)
                        convertToTs(e.target.value)
                    }}
                />
                <div className={dt.optRow}>
                    <span className={dt.tsLabel}>{t('devtools:timestamp.correspSecTs', { defaultValue: '对应秒级时间戳' })}</span>
                    <span className={g.spacer} />
                    <CopyButton value={tsResult} />
                </div>
                <div className={dt.resultBox}>
                    <code className={dt.resultText}>{tsResult || '—'}</code>
                </div>
            </div>
        </div>
    )
}

/* ---------------- Base64 ---------------- */
function safeFromBase64(b64: string, decodeErrText: string) {
    try {
        return fromBase64(b64)
    } catch {
        return decodeErrText
    }
}

function Base64Tool() {
    const { t } = useTranslation(['devtools', 'common'])
    const [mode, setMode] = useState<'encode' | 'decode'>('encode')
    const [input, setInput] = useState('')
    const decodeErrorText = t('devtools:base64.decodeError', { defaultValue: '解码失败：不是合法的 Base64' })
    const result = useMemo(() => {
        if (!input) return ''
        return mode === 'encode' ? toBase64(input) : safeFromBase64(input, decodeErrorText)
    }, [input, mode, decodeErrorText])

    return (
        <div className={dt.tool}>
            <h3 className={dt.toolTitle}>{t('devtools:base64.title', { defaultValue: 'Base64 编解码' })}</h3>
            <p className={dt.desc}>{t('devtools:base64.desc', { defaultValue: '支持文本与 Base64 字符串的双向实时转换。' })}</p>
            <Segmented
                value={mode}
                onChange={(v) => setMode(v as 'encode' | 'decode')}
                options={[
                    { label: t('devtools:base64.modeEncode', { defaultValue: '编码' }), value: 'encode' },
                    { label: t('devtools:base64.modeDecode', { defaultValue: '解码' }), value: 'decode' },
                ]}
                style={{ marginBottom: 8 }}
            />
            <label className={dt.label}>
                {mode === 'encode'
                    ? t('devtools:base64.rawText', { defaultValue: '原始文本' })
                    : t('devtools:base64.base64Str', { defaultValue: 'Base64 字符串' })}
            </label>
            <Input.TextArea
                rows={5}
                value={input}
                placeholder={
                    mode === 'encode'
                        ? t('devtools:base64.encodePlaceholder', { defaultValue: '输入需要编码的文本…' })
                        : t('devtools:base64.decodePlaceholder', { defaultValue: '输入需要解码的 Base64…' })
                }
                onChange={(e) => setInput(e.target.value)}
            />
            <div className={dt.optRow}>
                <span className={dt.tsLabel}>
                    {mode === 'encode'
                        ? t('devtools:base64.encodeResult', { defaultValue: '编码结果' })
                        : t('devtools:base64.decodeResult', { defaultValue: '解码结果' })}
                </span>
                <span className={g.spacer} />
                <CopyButton value={result} />
            </div>
            <div className={dt.resultBox}>
                <code className={dt.resultText}>{result || '—'}</code>
            </div>
        </div>
    )
}

/* ---------------- JSON 格式化 ---------------- */
function findPos(msg: string): number | null {
    const m = /position (\d+)/.exec(msg)
    return m ? Number(m[1]) : null
}

function locate(str: string, pos: number) {
    let line = 1
    let col = 1
    const max = Math.min(pos, str.length)
    for (let i = 0; i < max; i++) {
        if (str.charCodeAt(i) === 10) {
            line++
            col = 1
        } else {
            col++
        }
    }
    return { line, col }
}

function JsonTool() {
    const { t } = useTranslation(['devtools', 'common'])
    const [input, setInput] = useState('')
    const [error, setError] = useState('')
    const [isPending, startTransition] = useTransition()

    const run = (mode: 'format' | 'minify') => {
        if (!input.trim()) {
            setError('')
            return
        }
        startTransition(() => {
            try {
                const parsed = JSON.parse(input)
                const text =
                    mode === 'format'
                        ? JSON.stringify(parsed, null, 2)
                        : JSON.stringify(parsed)
                setInput(text)
                setError('')
            } catch (e: any) {
                const msg = e?.message || String(e)
                const pos = findPos(msg)
                let detail = msg
                if (pos != null) {
                    const { line, col } = locate(input, pos)
                    detail = t('devtools:json.syntaxErrorDetail', {
                        defaultValue: `${msg}（出错位置 ${pos}，第 ${line} 行第 ${col} 列）`,
                        msg,
                        pos,
                        line,
                        col,
                    })
                }
                setError(detail)
            }
        })
    }

    return (
        <div className={dt.tool}>
            <h3 className={dt.toolTitle}>{t('devtools:json.title', { defaultValue: 'JSON 格式化' })}</h3>
            <p className={dt.desc}>
                {t('devtools:json.desc', { defaultValue: '在原文件上就地格式化或压缩，操作完成后直接更新内容；自动校验语法并定位错误行列，支持大文件。' })}
            </p>

            <div className={dt.editorWrap}>
                <CodeEditor
                    value={input}
                    onChange={(val) => {
                        setInput(val)
                        if (error) setError('')
                    }}
                    lang="json"
                    minHeight="320px"
                    height="520px"
                    placeholder={t('devtools:json.placeholder', { defaultValue: '在此粘贴 / 编辑 JSON 字符串…' })}
                />
            </div>

            <div className={dt.jsonActions} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <Button type="primary" size="small" loading={isPending} disabled={isPending || !input.trim()} onClick={() => run('format')}>
                    {t('devtools:json.format', { defaultValue: '格式化' })}
                </Button>
                <Button size="small" loading={isPending} disabled={isPending || !input.trim()} onClick={() => run('minify')}>
                    {t('devtools:json.compress', { defaultValue: '压缩' })}
                </Button>
                <span className={g.spacer} />
                <CopyButton value={input} />
                <Button size="small" icon={<Download size={13} />} disabled={!input.trim()} onClick={() => downloadText('formatted.json', input)}>
                    {t('devtools:download', { defaultValue: '下载' })}
                </Button>
            </div>

            {error && <div className={dt.jsonError}>{error}</div>}
        </div>
    )
}

/* ---------------- 主组件 ---------------- */
export default function DevTools({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation(['devtools', 'common'])
    const [active, setActive] = useState<ToolKey>('md5')

    const tools: { key: ToolKey; label: string }[] = useMemo(() => [
        { key: 'md5', label: t('devtools:tabs.md5', { defaultValue: 'MD5 哈希' }) },
        { key: 'timestamp', label: t('devtools:tabs.timestamp', { defaultValue: '时间戳' }) },
        { key: 'base64', label: t('devtools:tabs.base64', { defaultValue: 'Base64 编解码' }) },
        { key: 'json', label: t('devtools:tabs.json', { defaultValue: 'JSON 格式化' }) },
    ], [t])

    return (
        <div className={dt.devPane}>
            <div className={dt.devSide}>
                {tools.map((item) => (
                    <Button
                        key={item.key}
                        block
                        type={active === item.key ? 'primary' : 'text'}
                        className={dt.devSideBtn}
                        onClick={() => setActive(item.key)}
                    >
                        {item.label}
                    </Button>
                ))}
            </div>
            <div className={dt.devMain}>
                <div className={dt.devBody}>
                    {active === 'md5' && <Md5Tool />}
                    {active === 'timestamp' && <TimestampTool />}
                    {active === 'base64' && <Base64Tool />}
                    {active === 'json' && <JsonTool />}
                </div>
            </div>
        </div>
    )
}
