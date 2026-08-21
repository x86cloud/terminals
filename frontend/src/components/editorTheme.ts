import {EditorView} from '@codemirror/view'
import {HighlightStyle, syntaxHighlighting} from '@codemirror/language'
import {tags as t} from '@lezer/highlight'

/**
 * 响应全域动态主题的 CodeMirror 编辑器主题。
 * 关联 var(--bg-1)、var(--text)、var(--text-dim) 与 var(--accent) CSS 变量，
 * 使得代码区与左侧 gutter 行号在浅色/暗色主题切换时自动无缝变色。
 */
const baseTheme = EditorView.theme(
    {
        '&': {
            color: 'var(--text, #1f2733)',
            backgroundColor: 'var(--bg-1, #ffffff)',
            fontSize: '13px',
        },
        '&.cm-focused': {
            outline: 'none !important',
        },
        '.cm-content': {
            fontFamily:
                "'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace",
            caretColor: 'var(--accent, #3370ff)',
        },
        '.cm-cursor, .cm-dropCursor': {
            borderLeftColor: 'var(--accent, #3370ff)',
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
            {
                backgroundColor: 'var(--accent-dim-2, rgba(51, 112, 255, 0.18))',
            },
        '.cm-gutters': {
            backgroundColor: 'var(--bg-1, #ffffff)',
            color: 'var(--text-dim, #6b7686)',
            border: 'none',
            borderRight: '1px solid var(--border, #d4dbe6)',
            borderTopLeftRadius: 'inherit',
            borderBottomLeftRadius: 'inherit',
        },
        '.cm-gutterElement': {
            color: 'var(--text-dim, #6b7686)',
        },
        '.cm-activeLine': {
            backgroundColor: 'var(--accent-soft, rgba(51, 112, 255, 0.06))',
        },
        '.cm-activeLineGutter': {
            backgroundColor: 'var(--accent-soft, rgba(51, 112, 255, 0.06))',
            color: 'var(--accent, #3370ff)',
            fontWeight: '600',
        },
        '.cm-selectionMatch': {
            backgroundColor: 'var(--accent-dim-2, rgba(51, 112, 255, 0.12))',
        },
        '.cm-placeholder': {
            color: 'var(--text-faint, #aab3c0)',
        },
    },
)

const highlightStyle = HighlightStyle.define([
    {tag: t.comment, color: 'var(--text-faint, #8a94a6)', fontStyle: 'italic'},
    {tag: [t.keyword, t.operator, t.modifier], color: 'var(--accent-dim, #255cd8)'},
    {tag: [t.string, t.special(t.string)], color: 'var(--ok, #2f9e44)'},
    {tag: [t.number, t.bool, t.null, t.atom], color: 'var(--warn, #c97a1a)'},
    {tag: [t.propertyName, t.attributeName], color: 'var(--accent, #3370ff)'},
    {tag: [t.variableName], color: 'var(--text, #1f2733)'},
    {tag: [t.typeName, t.className], color: 'var(--warn, #b5731a)'},
    {tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--accent-dim, #255cd8)'},
    {tag: [t.bracket, t.punctuation, t.separator], color: 'var(--text-dim, #6b7686)'},
    {tag: t.invalid, color: 'var(--danger, #d6453f)'},
])

export const lightEditorTheme = [baseTheme, syntaxHighlighting(highlightStyle)]
