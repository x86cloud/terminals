import React, { useEffect, useState } from 'react'
import { Modal, Form, Input, Select, message } from 'antd'
import { Folder, FileCode } from 'lucide-react'
import { getFolderOptions } from './apiTypes'
import type { ApiState } from './useApi'

interface Props {
    state: ApiState
}

export default function SaveApiModal({ state }: Props) {
    const {
        saveModalOpen,
        setSaveModalOpen,
        saveModalMode,
        currentApiName,
        method,
        url,
        mode,
        apiTree,
        saveAsNewApi,
        saveCurrentApi,
        currentApiId,
    } = state

    const [form] = Form.useForm()
    const folderOptions = getFolderOptions(apiTree)

    useEffect(() => {
        if (saveModalOpen) {
            const defaultName = currentApiName || (mode === 'ws' ? 'WebSocket 连接' : `${method} ${url || '新接口'}`)
            form.setFieldsValue({
                name: defaultName,
                folderId: folderOptions.length > 0 ? folderOptions[0].value : undefined,
            })
        }
    }, [saveModalOpen, currentApiName, method, url, mode, form, folderOptions])

    const handleOk = async () => {
        try {
            const values = await form.validateFields()
            const name = values.name.trim()
            const folderId = values.folderId || null

            if (saveModalMode === 'save' && currentApiId) {
                saveCurrentApi(name)
                message.success('接口保存成功')
            } else {
                saveAsNewApi(name, folderId)
                message.success('已保存为新接口')
            }
            setSaveModalOpen(false)
        } catch {
            /* 校验失败 */
        }
    }

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileCode size={16} />
                    <span>{saveModalMode === 'saveAs' ? '另存为新接口' : '保存接口'}</span>
                </div>
            }
            open={saveModalOpen}
            onOk={handleOk}
            onCancel={() => setSaveModalOpen(false)}
            okText="保存"
            cancelText="取消"
            destroyOnClose
            width={480}
        >
            <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                <Form.Item
                    label="接口名称"
                    name="name"
                    rules={[{ required: true, message: '请输入接口名称' }]}
                >
                    <Input style={{ height: 34 }} placeholder="例如: 获取用户信息" autoFocus spellCheck={false} />
                </Form.Item>

                <Form.Item label="归属分组" name="folderId">
                    <Select
                        style={{ height: 34 }}
                        placeholder="选择分组 (可选，默认根目录)"
                        allowClear
                        options={[
                            { label: '（根目录 / 无分组）', value: '' },
                            ...folderOptions,
                        ]}
                    />
                </Form.Item>
            </Form>
        </Modal>
    )
}
