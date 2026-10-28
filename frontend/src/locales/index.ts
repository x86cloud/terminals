
import zhCommon from './zh-CN/common.json'
import zhTitlebar from './zh-CN/titlebar.json'
import zhSidebar from './zh-CN/sidebar.json'
import zhSettings from './zh-CN/settings.json'
import zhServer from './zh-CN/server.json'
import zhSsh from './zh-CN/ssh.json'
import zhFile from './zh-CN/file.json'
import zhDb from './zh-CN/db.json'
import zhRedis from './zh-CN/redis.json'
import zhDocker from './zh-CN/docker.json'
import zhK8s from './zh-CN/k8s.json'
import zhAgent from './zh-CN/agent.json'
import zhApi from './zh-CN/api.json'
import zhDevtools from './zh-CN/devtools.json'
import zhWiki from './zh-CN/wiki.json'

import enCommon from './en-US/common.json'
import enTitlebar from './en-US/titlebar.json'
import enSidebar from './en-US/sidebar.json'
import enSettings from './en-US/settings.json'
import enServer from './en-US/server.json'
import enSsh from './en-US/ssh.json'
import enFile from './en-US/file.json'
import enDb from './en-US/db.json'
import enRedis from './en-US/redis.json'
import enDocker from './en-US/docker.json'
import enK8s from './en-US/k8s.json'
import enAgent from './en-US/agent.json'
import enApi from './en-US/api.json'
import enDevtools from './en-US/devtools.json'
import enWiki from './en-US/wiki.json'

export type SupportedLanguage = 'system' | 'zh-CN' | 'en-US'
export type ConcreteLanguage = 'zh-CN' | 'en-US'

export const resources = {
    'zh-CN': {
        common: zhCommon,
        titlebar: zhTitlebar,
        sidebar: zhSidebar,
        settings: zhSettings,
        server: zhServer,
        ssh: zhSsh,
        file: zhFile,
        db: zhDb,
        redis: zhRedis,
        docker: zhDocker,
        k8s: zhK8s,
        agent: zhAgent,
        api: zhApi,
        devtools: zhDevtools,
        wiki: zhWiki,
    },
    'en-US': {
        common: enCommon,
        titlebar: enTitlebar,
        sidebar: enSidebar,
        settings: enSettings,
        server: enServer,
        ssh: enSsh,
        file: enFile,
        db: enDb,
        redis: enRedis,
        docker: enDocker,
        k8s: enK8s,
        agent: enAgent,
        api: enApi,
        devtools: enDevtools,
        wiki: enWiki,
    },
} as const

