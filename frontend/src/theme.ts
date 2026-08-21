import { theme, type ThemeConfig } from 'antd'

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
            colorBorder: isDark ? '#2d333b' : '#e5e7eb',
            colorBorderSecondary: isDark ? '#22262d' : '#f3f4f6',
            colorText: isDark ? '#e5e7eb' : '#1f2937',
            colorTextSecondary: isDark ? '#9ca3af' : '#6b7280',
            colorTextTertiary: isDark ? '#6b7280' : '#9ca3af',
            colorTextQuaternary: isDark ? '#4b5563' : '#d1d5db',
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
                headerBg: isDark ? '#20242b' : '#f9fafb',
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
                colorBorderSecondary: isDark ? '#2d333b' : '#f0f0f0',
            },
            Collapse: {
                colorBgContainer: isDark ? '#1b1e23' : '#fafafa',
                colorBorder: isDark ? '#2d333b' : '#d9d9d9',
            },
            Dropdown: {
                colorBgElevated: isDark ? '#22262d' : '#ffffff',
            },
            Menu: {
                colorBgContainer: isDark ? '#22262d' : '#ffffff',
                colorBgElevated: isDark ? '#22262d' : '#ffffff',
            },
            Segmented: {
                trackBg: isDark ? '#141619' : '#f5f5f5',
                itemSelectedBg: isDark ? '#2d333b' : '#ffffff',
            },
            Radio: {
                buttonBg: isDark ? '#1b1e23' : '#ffffff',
                buttonCheckedBg: isDark ? '#255cd8' : '#3b82f6',
                buttonSolidCheckedBg: isDark ? '#255cd8' : '#3b82f6',
            },
            Tooltip: {
                colorBgSpotlight: isDark ? '#2d333b' : '#333333',
            },
        },
    }
}
