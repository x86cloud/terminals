import { theme, type ThemeConfig } from 'antd'
import type { ITheme } from '@xterm/xterm'

export function getAntdTheme(themeMode: 'dark' | 'light' | 'system' = 'dark'): ThemeConfig {
    const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = themeMode === 'dark' || (themeMode === 'system' && prefersDark)

    return {
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
            colorPrimary: '#3b82f6',
            colorInfo: '#3b82f6',
            colorSuccess: '#10b981',
            colorWarning: '#f59e0b',
            colorError: '#ef4444',
            borderRadius: 6,
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif',
            colorBgBase: isDark ? '#141619' : '#ffffff',
            colorBgContainer: isDark ? '#1b1e23' : '#ffffff',
            colorBgElevated: isDark ? '#22262d' : '#ffffff',
            colorBorder: isDark ? '#2d333b' : '#e2e8f0',
            colorBorderSecondary: isDark ? '#22262d' : '#f1f3f5',
            colorText: isDark ? '#e5e7eb' : '#1f2733',
            colorTextSecondary: isDark ? '#9ca3af' : '#667085',
            colorTextTertiary: isDark ? '#6b7280' : '#98a2b3',
            colorTextQuaternary: isDark ? '#4b5563' : '#d0d5dd',
        },
        components: {
            Button: {
                controlHeight: 32,
                borderRadius: 6,
            },
            Input: {
                controlHeight: 32,
                borderRadius: 6,
                colorBgContainer: isDark ? '#181a1f' : '#ffffff',
            },
            InputNumber: {
                controlHeight: 32,
                borderRadius: 6,
                colorBgContainer: isDark ? '#181a1f' : '#ffffff',
            },
            Select: {
                controlHeight: 32,
                borderRadius: 6,
                colorBgContainer: isDark ? '#181a1f' : '#ffffff',
                colorBgElevated: isDark ? '#22262d' : '#ffffff',
            },
            Modal: {
                borderRadiusLG: 10,
                colorBgElevated: isDark ? '#1e2228' : '#ffffff',
                headerBg: isDark ? '#1e2228' : '#ffffff',
            },
            Table: {
                borderRadius: 6,
                colorBgContainer: isDark ? '#181a1f' : '#ffffff',
                headerBg: isDark ? '#20242b' : '#f8f9fa',
            },
            Tabs: {
                cardHeight: 34,
            },
            Tree: {
                colorBgContainer: 'transparent',
            },
            Drawer: {
                colorBgElevated: isDark ? '#181a1f' : '#ffffff',
            },
            Card: {
                colorBgContainer: isDark ? '#1e2228' : '#ffffff',
                colorBorderSecondary: isDark ? '#2d333b' : '#eaecf0',
            },
            Collapse: {
                colorBgContainer: isDark ? '#1b1e23' : '#f8f9fa',
                colorBorder: isDark ? '#2d333b' : '#e2e8f0',
            },
            Dropdown: {
                colorBgElevated: isDark ? '#22262d' : '#ffffff',
            },
            Menu: {
                colorBgContainer: isDark ? '#22262d' : '#ffffff',
                colorBgElevated: isDark ? '#22262d' : '#ffffff',
            },
            Segmented: {
                trackBg: isDark ? '#141619' : '#f0f2f5',
                itemSelectedBg: isDark ? '#2d333b' : '#ffffff',
            },
            Radio: {
                buttonBg: isDark ? '#1b1e23' : '#ffffff',
                buttonCheckedBg: isDark ? '#1b1e23' : '#ffffff',
                buttonSolidCheckedBg: isDark ? '#255cd8' : '#3370ff',
                buttonSolidCheckedColor: '#ffffff',
                buttonSolidCheckedHoverBg: isDark ? '#1d4ed8' : '#2563eb',
                buttonSolidCheckedActiveBg: isDark ? '#1e40af' : '#1d4ed8',
            },
            Tooltip: {
                colorBgSpotlight: isDark ? '#2d333b' : '#333333',
            },
        },
    }
}

export const LIGHT_TERM_THEME: ITheme = {
    background: '#fcfdfd',
    foreground: '#1f2733',
    cursor: '#255cd8',
    selectionBackground: '#dbeafe',
    black: '#1f2733',
    red: '#d6453f',
    green: '#1c8830',
    yellow: '#9a6700',
    blue: '#0969da',
    magenta: '#8250df',
    cyan: '#1c8fc4',
    white: '#6b7686',
    brightBlack: '#6b7686',
    brightRed: '#e5534b',
    brightGreen: '#2a8536',
    brightYellow: '#bf8700',
    brightBlue: '#218bff',
    brightMagenta: '#a371f7',
    brightCyan: '#39c5de',
    brightWhite: '#1f2733',
}

export const DARK_TERM_THEME: ITheme = {
    background: '#141619',
    foreground: '#e1e4ea',
    cursor: '#29b6f6',
    selectionBackground: '#304d6d',
    black: '#141619',
    red: '#ef5350',
    green: '#66bb6a',
    yellow: '#ffa726',
    blue: '#42a5f5',
    magenta: '#ab47bc',
    cyan: '#26c6da',
    white: '#e1e4ea',
    brightBlack: '#606673',
    brightRed: '#ff7371',
    brightGreen: '#81c784',
    brightYellow: '#ffb74d',
    brightBlue: '#64b5f6',
    brightMagenta: '#ba68c8',
    brightCyan: '#4dd0e1',
    brightWhite: '#ffffff',
}

export function getTerminalTheme(isDark: boolean): ITheme {
    return isDark ? DARK_TERM_THEME : LIGHT_TERM_THEME
}

