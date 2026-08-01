import {EditorView} from '@codemirror/view'
import {HighlightStyle, syntaxHighlighting} from '@codemirror/language'
import {tags as t} from '@lezer/highlight'

/**
 * 浅色编辑器主题，与应用（@bg-1 白底 + 蓝色强调）的配色保持一致。
 * 用于替换原先的 dracula 暗色主题——暗色主题在浅色背景上会导致文字看不清。
 *
 * 直接基于已安装的 @codemirror/view + @codemirror/language 构建，
 * 避免额外引入 @uiw/codemirror-themes 依赖。
 */
const baseTheme = EditorView.theme(
    {
        '&': {
            color: '#1f2733',
            backgroundColor: '#ffffff',
            fontSize: '13px',
        },
        '.cm-content': {
            fontFamily:
                "'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace",
            caretColor: '#1c8fc4',
        },
        '.cm-cursor, .cm-dropCursor': {
            borderLeftColor: '#1c8fc4',
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
            {
                backgroundColor: 'rgba(28, 143, 196, 0.18)',
            },
        '.cm-gutters': {
            backgroundColor: '#ffffff',
            color: '#aab3c0',
            border: 'none',
        },
        '.cm-activeLine': {
            backgroundColor: 'rgba(28, 143, 196, 0.06)',
        },
        '.cm-activeLineGutter': {
            backgroundColor: 'rgba(28, 143, 196, 0.06)',
        },
        '.cm-selectionMatch': {
            backgroundColor: 'rgba(28, 143, 196, 0.12)',
        },
        '.cm-placeholder': {
            color: '#aab3c0',
        },
    },
    {dark: false},
)

const highlightStyle = HighlightStyle.define([
    {tag: t.comment, color: '#8a94a6', fontStyle: 'italic'},
    {tag: [t.keyword, t.operator, t.modifier], color: '#1577a6'},
    {tag: [t.string, t.special(t.string)], color: '#2f9e44'},
    {tag: [t.number, t.bool, t.null, t.atom], color: '#c97a1a'},
    {tag: [t.propertyName, t.attributeName], color: '#1c8fc4'},
    {tag: [t.variableName], color: '#1f2733'},
    {tag: [t.typeName, t.className], color: '#b5731a'},
    {tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#1577a6'},
    {tag: [t.bracket, t.punctuation, t.separator], color: '#6b7686'},
    {tag: t.invalid, color: '#d6453f'},
])

export const lightEditorTheme = [baseTheme, syntaxHighlighting(highlightStyle)]
