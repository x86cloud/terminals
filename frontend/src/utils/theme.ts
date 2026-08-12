import { AppSettings } from '../types'

export const DEFAULT_SETTINGS: AppSettings = {
    themeMode: 'light',
    fontFamily: 'Consolas',
    fontSize: '13',
    autoConnect: false,
    dbDefaultLimit: '50',
    globalFontFamily: 'system',
}

const GLOBAL_FONT_MAP: Record<string, string> = {
    system: '"Microsoft YaHei UI", "Segoe UI", system-ui, -apple-system, sans-serif',
    msyh: '"Microsoft YaHei UI", sans-serif',
    segoe: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
    inter: '"Inter", system-ui, -apple-system, sans-serif',
    harmony: '"HarmonyOS Sans SC", "Microsoft YaHei UI", sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace',
}

export function applyGlobalFont(fontKey?: string) {
    const key = fontKey || 'system'
    const fontStr = GLOBAL_FONT_MAP[key] || GLOBAL_FONT_MAP.system
    document.documentElement.style.setProperty('--font-family', fontStr)
}

export function applyThemeMode(mode: 'light' | 'dark' | 'system') {
    let resolved: 'light' | 'dark' = 'light'
    if (mode === 'system') {
        const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        resolved = isDark ? 'dark' : 'light'
    } else if (mode === 'dark') {
        resolved = 'dark'
    }
    document.documentElement.setAttribute('data-theme', resolved)

    // 同步更新 Windows 原生 TitleBar 颜色主题
    const win = window as any
    if (win.go?.main?.App?.SetNativeTheme) {
        win.go.main.App.SetNativeTheme(mode).catch(() => undefined)
    }
}

export function getCachedSettings(): AppSettings {
    try {
        const raw = localStorage.getItem('xclient_app_settings')
        if (raw) {
            const parsed = JSON.parse(raw)
            return { ...DEFAULT_SETTINGS, ...parsed }
        }
    } catch {
        // ignore
    }
    return DEFAULT_SETTINGS
}

export function setCachedSettings(settings: AppSettings) {
    try {
        localStorage.setItem('xclient_app_settings', JSON.stringify(settings))
    } catch {
        // ignore
    }
}
