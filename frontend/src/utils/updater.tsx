import { useEffect } from 'react'
import { App } from 'antd'
import type { MessageInstance } from 'antd/es/message/interface'
import { API } from '@/api'

/**
 * 静默检查新版本并在发现新版本时弹出消息提醒
 */
export async function checkUpdateSilently(msgApi?: MessageInstance): Promise<void> {
    try {
        const res = await API.checkForUpdates()
        if (res && res.hasUpdate && res.latestVersion && msgApi) {
            msgApi.info({
                content: (
                    <span
                        style={{ cursor: 'pointer', textDecoration: 'underline' }}
                        onClick={() => {
                            const url = res.releaseUrl || res.repoUrl || 'https://github.com/x86cloud/terminals/releases'
                            void API.openBrowser(url)
                        }}
                    >
                        发现新版本 {res.latestVersion}，点击更新
                    </span>
                ),
                duration: 8,
                key: 'app_update_notification',
            })
        }
    } catch {
        // 静默失败，不打扰用户正常启动使用
    }
}

/**
 * 软件启动后静默检查新版本的 Hook
 * @param delayMs 延迟毫秒数，默认 2500ms，避免与冷启动首屏加载争抢资源
 */
export function useStartupUpdateCheck(delayMs: number = 2500) {
    const { message } = App.useApp()

    useEffect(() => {
        const timer = setTimeout(() => {
            void checkUpdateSilently(message)
        }, delayMs)

        return () => clearTimeout(timer)
    }, [delayMs, message])
}
