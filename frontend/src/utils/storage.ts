/**
 * 统一前端强类型 Storage 持久化管理模块
 * 规范化 localStorage 的命名空间、键枚举与类型安全存取，同时平滑兼容旧版本历史键。
 */

export const enum StorageKey {
    AppSettings = 'app_settings',
    SshFilePanelWidth = 'ssh_file_panel_width',
    RedisSidebarWidth = 'redis_sidebar_width',
    ActiveAgentSessionId = 'active_agent_session_id',
    AiSidebarWidth = 'ai_sidebar_width',
}

const STORAGE_PREFIX = 'xterminal:'

// 映射新键到历史无前缀或旧命名的键，提供透明的自动兼容与迁移
const LEGACY_KEY_MAP: Record<string, string> = {
    [StorageKey.AppSettings]: 'xterminal_app_settings',
    [StorageKey.SshFilePanelWidth]: 'ssh_file_panel_width',
    [StorageKey.RedisSidebarWidth]: 'redis_sidebar_width',
    [StorageKey.ActiveAgentSessionId]: 'active_agent_session_id',
    [StorageKey.AiSidebarWidth]: 'ai_agent_sidebar_width',
}

function resolvePrefixedKey(key: string): string {
    if (key.startsWith(STORAGE_PREFIX)) {
        return key
    }
    return `${STORAGE_PREFIX}${key}`
}

export const appStorage = {
    /**
     * 获取泛型 JSON 对象或基础值，支持透明回退并自动迁移旧键
     */
    get<T>(key: StorageKey | string, fallback: T): T {
        try {
            const prefixedKey = resolvePrefixedKey(key)
            let raw = localStorage.getItem(prefixedKey)

            // 若带前缀的新键不存在，尝试寻找旧版本的遗留键
            if (raw === null) {
                const legacyKey = LEGACY_KEY_MAP[key] || key
                raw = localStorage.getItem(legacyKey)
                if (raw !== null) {
                    // 自动无缝写回新命名空间，提升后续访问性能
                    localStorage.setItem(prefixedKey, raw)
                }
            }

            if (raw === null) {
                return fallback
            }

            try {
                return JSON.parse(raw) as T
            } catch {
                // 如果不是 JSON（纯字符串），直接返回原始值（断言类型）
                return raw as unknown as T
            }
        } catch (e) {
            console.warn(`[storage] 读取失败 key=${key}:`, e)
            return fallback
        }
    },

    /**
     * 强类型设置值（自动序列化为 JSON 字符串）
     */
    set<T>(key: StorageKey | string, value: T): void {
        try {
            const prefixedKey = resolvePrefixedKey(key)
            if (typeof value === 'string') {
                localStorage.setItem(prefixedKey, value)
            } else {
                localStorage.setItem(prefixedKey, JSON.stringify(value))
            }
        } catch (e) {
            console.error(`[storage] 写入失败 key=${key}:`, e)
        }
    },

    /**
     * 移除键值
     */
    remove(key: StorageKey | string): void {
        try {
            const prefixedKey = resolvePrefixedKey(key)
            localStorage.removeItem(prefixedKey)
            const legacyKey = LEGACY_KEY_MAP[key]
            if (legacyKey) {
                localStorage.removeItem(legacyKey)
            }
        } catch (e) {
            console.warn(`[storage] 移除失败 key=${key}:`, e)
        }
    },

    /**
     * 读取数字类型配置（如面板宽度）
     */
    getNumber(key: StorageKey | string, fallback: number): number {
        const val = this.get<number | string>(key, fallback)
        const parsed = Number(val)
        return isNaN(parsed) ? fallback : parsed
    },

    /**
     * 读取字符串类型配置
     */
    getString(key: StorageKey | string, fallback: string): string {
        const val = this.get<string>(key, fallback)
        return typeof val === 'string' ? val : fallback
    },

    /**
     * 读取布尔类型配置
     */
    getBoolean(key: StorageKey | string, fallback: boolean): boolean {
        const val = this.get<boolean | string>(key, fallback)
        if (typeof val === 'boolean') {
            return val
        }
        if (typeof val === 'string') {
            return val === 'true'
        }
        return fallback
    },
}
