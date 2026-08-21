import React, { useMemo, useRef } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { sql } from '@codemirror/lang-sql'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { lightEditorTheme } from './editorTheme'

export type LangKey = 'json' | 'plain' | 'sql'

function langExt(lang: LangKey) {
    switch (lang) {
        case 'json':
            return json()
        case 'sql':
            return sql()
        default:
            return []
    }
}

interface Props {
    value: string
    onChange: (v: string) => void
    lang?: LangKey
    height?: string
    minHeight?: string
    readOnly?: boolean
    placeholder?: string
    /** 单行编辑器在回车（非 Shift）时触发，参数为当前内容 */
    onEnter?: (value: string) => void
    /** Ctrl/Cmd + 回车时触发（参数为当前内容），常用于提交 */
    onModEnter?: (value: string) => void
    lineNumbers?: boolean
    bordered?: boolean
    className?: string
    style?: React.CSSProperties
}

export default function CodeEditor({
    value,
    onChange,
    lang = 'plain',
    height,
    minHeight,
    readOnly = false,
    placeholder,
    onEnter,
    onModEnter,
    lineNumbers = false,
    bordered = true,
    className,
    style,
}: Props) {
    const enterRef = useRef(onEnter)
    enterRef.current = onEnter
    const modEnterRef = useRef(onModEnter)
    modEnterRef.current = onModEnter

    const extensions = useMemo(() => {
        const arr: any[] = [EditorView.lineWrapping]
        const le = langExt(lang)
        if (le) arr.push(le)
        if (readOnly) arr.push(EditorView.editable.of(false), EditorState.readOnly.of(true))
        if (onEnter) {
            arr.push(
                EditorView.domEventHandlers({
                    keydown: (e, view) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            const v = view.state.doc.toString()
                            enterRef.current && enterRef.current(v)
                            return true
                        }
                        return false
                    },
                }),
            )
        }
        if (onModEnter) {
            arr.push(
                keymap.of([
                    {
                        key: 'Mod-Enter',
                        run: (view) => {
                            modEnterRef.current && modEnterRef.current(view.state.doc.toString())
                            return true
                        },
                    },
                ]),
            )
        }
        return arr
    }, [lang, readOnly, onEnter, onModEnter])

    const basicSetup = useMemo(
        () => ({
            lineNumbers,
            foldGutter: false,
            highlightActiveLine: !readOnly,
            highlightActiveLineGutter: !readOnly,
            autocompletion: true,
        }),
        [lineNumbers, readOnly],
    )

    return (
        <CodeMirror
            value={value}
            height={height}
            minHeight={minHeight}
            className={`${bordered ? '' : 'cm-borderless'}${className ? ' ' + className : ''}`}
            style={{
                height: height || '100%',
                minHeight: minHeight || 0,
                display: 'flex',
                flexDirection: 'column',
                flex: height ? 'none' : 1,
                ...style,
            }}
            theme={lightEditorTheme}
            basicSetup={basicSetup}
            extensions={extensions}
            onChange={onChange}
            placeholder={placeholder}
            readOnly={readOnly}
        />
    )
}
