import sshIcon from '../assets/images/terminal.svg'
import redisIcon from '../assets/images/redis.svg'
import mysqlIcon from '../assets/images/mysql.svg'
import mqttIcon from '../assets/images/mqtt.svg'
import {ConnType} from '../types'

const ICONS: Record<ConnType, string> = {
    ssh: sshIcon,
    redis: redisIcon,
    mysql: mysqlIcon,
    mqtt: mqttIcon,
}

export default function ClientIcon({
                                       kind,
                                       size = 16,
                                       className = '',
                                   }: {
    kind: ConnType
    size?: number
    className?: string
}) {
    return (
        <img
            src={ICONS[kind]}
            width={size}
            height={size}
            alt={kind}
            className={`client-icon ${className}`.trim()}
        />
    )
}
