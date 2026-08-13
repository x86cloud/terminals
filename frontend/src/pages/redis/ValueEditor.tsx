import React, {useState} from 'react'
import {API} from '@/api'
import {RedisSessionInfo, RedisValue} from '@/types'
import g from '@/styles/global.module.less'
import v from '@/pages/redis/ValueEditor.module.less'

export default function ValueEditor({
    session,
    value,
    selected,
    flash,
}: {
    session: RedisSessionInfo
    value: RedisValue
    selected: string
    flash: (m: string) => void
}) {
    const [field, setField] = useState('')
    const [fval, setFval] = useState('')
    const [member, setMember] = useState('')
    const [score, setScore] = useState('')
    const [pushVal, setPushVal] = useState('')

    if (value.type === 'hash') {
        return (
            <div className={v.miniEdit}>
                <div className={v.subHead}>Hash 字段</div>
                <div className={v.row}>
                    <input className={v.input} placeholder="field" value={field} onChange={(e) => setField(e.target.value)}/>
                    <input className={v.input} placeholder="value" value={fval} onChange={(e) => setFval(e.target.value)}/>
                    <button className={`${g.btn} ${g.sm}`} onClick={async () => {
                        await API.redisHashFieldSet(session.id, selected, field, fval)
                        flash('已设置字段')
                    }}>HSET</button>
                </div>
            </div>
        )
    }
    if (value.type === 'list') {
        return (
            <div className={v.miniEdit}>
                <div className={v.subHead}>List 元素</div>
                <div className={v.row}>
                    <input className={v.input} placeholder="value" value={pushVal} onChange={(e) => setPushVal(e.target.value)}/>
                    <button className={`${g.btn} ${g.sm}`} onClick={async () => {
                        await API.redisListPush(session.id, selected, pushVal, false)
                        flash('已 RPUSH')
                    }}>RPUSH</button>
                    <button className={`${g.btn} ${g.sm}`} onClick={async () => {
                        const val = await API.redisListPop(session.id, selected, true)
                        flash('LPOP: ' + val)
                    }}>LPOP</button>
                </div>
            </div>
        )
    }
    if (value.type === 'set') {
        return (
            <div className={v.miniEdit}>
                <div className={v.subHead}>Set 成员</div>
                <div className={v.row}>
                    <input className={v.input} placeholder="member" value={member} onChange={(e) => setMember(e.target.value)}/>
                    <button className={`${g.btn} ${g.sm}`} onClick={async () => {
                        await API.redisSetAdd(session.id, selected, [member])
                        flash('已 SADD')
                    }}>SADD</button>
                </div>
            </div>
        )
    }
    if (value.type === 'zset') {
        return (
            <div className={v.miniEdit}>
                <div className={v.subHead}>ZSet 成员</div>
                <div className={v.row}>
                    <input className={v.input} placeholder="member" value={member} onChange={(e) => setMember(e.target.value)}/>
                    <input className={v.inputSm} placeholder="score" value={score} onChange={(e) => setScore(e.target.value)}/>
                    <button className={`${g.btn} ${g.sm}`} onClick={async () => {
                        await API.redisZSetAdd(session.id, selected, member, Number(score) || 0)
                        flash('已 ZADD')
                    }}>ZADD</button>
                </div>
            </div>
        )
    }
    return null
}
