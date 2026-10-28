import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCNLocale from 'antd/locale/zh_CN'
import enUSLocale from 'antd/locale/en_US'
import type { Locale } from 'antd/es/locale'
import { resources, type SupportedLanguage, type ConcreteLanguage } from './locales'

export type { SupportedLanguage, ConcreteLanguage }

/**
 * 将偏好语言（含 system）解析为具体的 zh-CN 或 en-US
 */
export function getResolvedLanguage(lang?: string): ConcreteLanguage {
    if (!lang || lang === 'system') {
        if (typeof window !== 'undefined' && window.navigator) {
            const navLang = (window.navigator.languages?.[0] || window.navigator.language || '').toLowerCase()
            if (navLang.startsWith('zh')) {
                return 'zh-CN'
            }
            return 'en-US'
        }
        return 'zh-CN'
    }
    return lang === 'en-US' ? 'en-US' : 'zh-CN'
}

/**
 * 获取对应语言的 Ant Design 语言包
 */
export function getAntdLocale(lang?: string): Locale {
    const concrete = getResolvedLanguage(lang)
    return concrete === 'en-US' ? enUSLocale : zhCNLocale
}

/**
 * 切换全局 i18n 语言
 */
export async function changeAppLanguage(lang?: string): Promise<void> {
    const target = getResolvedLanguage(lang)
    await i18n.changeLanguage(target)
}

// 初始化 i18next 实例
if (!i18n.isInitialized) {
    void i18n
        .use(initReactI18next)
        .init({
            resources,
            lng: getResolvedLanguage(),
            fallbackLng: 'zh-CN',
            defaultNS: 'common',
            interpolation: {
                escapeValue: false, // React 已经自带 XSS 防御
            },
        })
}

/**
 * 门面函数 t：支持非 React 组件环境中调用
 */
export const t = i18n.t.bind(i18n)

export default i18n
