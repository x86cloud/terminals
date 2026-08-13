import React from 'react'
import g from '@/styles/global.module.less'
import my from '@/pages/mysql/StatusPanel.module.less'
import {Grid} from '@/pages/mysql/mysqlTypes'
import StatusCard from '@/pages/mysql/StatusCard'

export default function StatusPanel({
    status,
    variables,
    processList,
    slowLog,
    busy,
    onRefresh,
}: {
    status: Record<string, any>
    variables: Record<string, any>
    processList: Record<string, any>[]
    slowLog: Record<string, any>[]
    busy: boolean
    onRefresh: () => void
}) {
    return (
        <div className={my.mgmtWrap}>
            <div className={my.mgmtHead}>
                服务器状态监控
                <span className={g.spacer}/>
                <button className={`${g.btn} ${g.xs}`} onClick={onRefresh} disabled={busy}>刷新</button>
            </div>
            <div className={my.statusGrid}>
                <StatusCard title="连接数 (Threads)" value={status['Threads_connected']}/>
                <StatusCard title="运行查询 (Running)" value={status['Threads_running']}/>
                <StatusCard title="慢查询数" value={status['Slow_queries']}/>
                <StatusCard title="QPS (Questions)" value={status['Questions']}/>
                <StatusCard title="查询缓存命中" value={status['Qcache_hits']}/>
                <StatusCard title="表锁等待" value={status['Table_locks_waited']}/>
            </div>
            <div className={my.statusSection}>当前进程 (SHOW PROCESSLIST)</div>
            <Grid columns={['Id', 'User', 'Host', 'db', 'Command', 'Time', 'State', 'Info']}
                  rows={processList.map((p) => ({
                      Id: p['Id'], User: p['User'], Host: p['Host'], db: p['db'],
                      Command: p['Command'], Time: p['Time'], State: p['State'], Info: p['Info'],
                  }))}/>
            <div className={my.statusSection}>慢查询日志</div>
            <Grid columns={['start_time', 'user_host', 'query_time', 'lock_time', 'rows_examined', 'sql_text']}
                  rows={slowLog.map((s) => ({
                      start_time: s['start_time'], user_host: s['user_host'], query_time: s['query_time'],
                      lock_time: s['lock_time'], rows_examined: s['rows_examined'], sql_text: s['sql_text'],
                  }))}/>
            <div className={my.statusSection}>关键变量</div>
            <Grid columns={['Variable_name', 'Value']}
                  rows={Object.entries(variables).filter(([k]) =>
                      /(max_connections|character_set_server|version|innodb_buffer_pool_size|slow_query_log|long_query_time)/i.test(k)
                  ).map(([k, v]) => ({Variable_name: k, Value: v}))}/>
        </div>
    )
}
