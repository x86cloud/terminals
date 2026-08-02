import a from './ApiClient.module.less'
import sh from './api/apiShared.module.less'
import {useApi} from './api/useApi'
import ApiHistory from './api/ApiHistory'
import ApiConfigTabs, {ConfigBody} from './api/ApiConfigTabs'
import HttpRequest from './api/HttpRequest'
import WsClient from './api/WsClient'

export default function ApiClient({onClose}: { onClose: () => void }) {
    const state = useApi()
    const {error, mode, configTab, setConfigTab} = state

    return (
        <div className={a.apiPane}>
            <ApiHistory state={state}/>
            <div className={a.apiMain}>
                <HttpRequest state={state} onClose={onClose}/>

                <ApiConfigTabs state={state}/>
                <ConfigBody state={state}/>

                {mode === 'ws' && configTab === 'messages' && <WsClient state={state}/>}

                {error && <div className={sh.errorBar}>{error}</div>}
            </div>
        </div>
    )
}
