import React from 'react'
import a from './ApiClient.module.less'
import sh from './apiShared.module.less'
import { useApi } from './useApi'
import ApiTreeList from './ApiTreeList'
import SaveApiModal from './SaveApiModal'
import ApiConfigTabs, { ConfigBody } from './ApiConfigTabs'
import { HttpToolbar, HttpResponseArea } from './HttpRequest'
import WsClient from './WsClient'

export default function ApiClient({ onClose }: { onClose: () => void }) {
    const state = useApi()
    const { error, mode, configTab } = state

    return (
        <div className={a.apiPane}>
            {/* 左侧树形接口列表 */}
            <ApiTreeList state={state} />

            <div className={a.apiMain}>
                {/* 1. 顶部请求工具栏 (URL / 方法 / 保存 / 发送) */}
                <HttpToolbar state={state} onClose={onClose} />

                {/* 2. 请求配置参数区 (Params / 请求头 / 请求体 / 鉴权 / 选项) */}
                <ApiConfigTabs state={state} />
                <ConfigBody state={state} />

                {/* 3. 响应结果区（HTTP 响应报文与响应体 / WS 消息流） */}
                {mode === 'http' && <HttpResponseArea state={state} />}
                {mode === 'ws' && configTab === 'messages' && <WsClient state={state} />}

                {error && <div className={sh.errorBar}>{error}</div>}
            </div>

            {/* 保存 / 另存为接口弹窗 */}
            <SaveApiModal state={state} />
        </div>
    )
}
