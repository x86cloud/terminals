import { AppSettings } from '../types'

export const DEFAULT_SETTINGS: AppSettings = {
    themeMode: 'light',
    fontFamily: 'Consolas',
    fontSize: '13',
    autoConnect: false,
    dbDefaultLimit: '50',
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
