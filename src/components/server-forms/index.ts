import React from 'react'
import { ConnType } from '@/types'
import { ServerFormProps } from './types'
import { SshForm } from './SshForm'
import { DockerForm } from './DockerForm'
import { K8sForm } from './K8sForm'
import { RedisForm } from './RedisForm'
import { MysqlForm } from './MysqlForm'
import { PostgresForm } from './PostgresForm'
import { MongoForm } from './MongoForm'
import { SqliteForm } from './SqliteForm'
import { MqttForm } from './MqttForm'

export * from './types'
export * from './defaults'
export * from './validator'
export * from './BasicFields'

export const serverFormComponents: Record<ConnType, React.FC<ServerFormProps>> = {
    ssh: SshForm,
    docker: DockerForm,
    k8s: K8sForm,
    redis: RedisForm,
    mysql: MysqlForm,
    postgres: PostgresForm,
    mongo: MongoForm,
    sqlite: SqliteForm,
    mqtt: MqttForm,
}
