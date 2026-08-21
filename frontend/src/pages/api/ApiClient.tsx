import React from 'react'
import a from './ApiClient.module.less'
import sh from './apiShared.module.less'
import { useApi } from './useApi'
import ApiHistory from './ApiHistory'
import ApiConfigTabs, { ConfigBody } from './ApiConfigTabs'
import HttpRequest from './HttpRequest'
import WsClient from './WsClient'


export default function ApiClient({ onClose }: { onClose: () => void }) {
    const state = useApi()
    const { error, mode, configTab, setConfigTab } = state

    return (
        <div className={a.apiPane}>
            <ApiHistory state={state} />
            <div className={a.apiMain}>
                <HttpRequest state={state} onClose={onClose} />

                <ApiConfigTabs state={state} />
                <ConfigBody state={state} />

                {mode === 'ws' && configTab === 'messages' && <WsClient state={state} />}

                {error && <div className={sh.errorBar}>{error}</div>}
            </div>
        </div>
    )
}
