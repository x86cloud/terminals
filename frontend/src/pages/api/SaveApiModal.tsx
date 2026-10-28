import { useEffect } from 'react'
import { Modal, Form, Input, Select } from 'antd'
import { FileCode } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getFolderOptions } from './apiTypes'
import type { ApiState } from './useApi'

interface Props {
    state: ApiState
}

export default function SaveApiModal({ state }: Props) {
    const { t } = useTranslation(['api', 'common'])
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
            const defaultName = currentApiName || (mode === 'ws' ? t('api:saveModal.defaultWs', { defaultValue: 'WebSocket 连接' }) : `${method} ${url || t('api:saveModal.newApiFallback', { defaultValue: '新接口' })}`)
            form.setFieldsValue({
                name: defaultName,
                folderId: folderOptions.length > 0 ? folderOptions[0].value : undefined,
            })
        }
    }, [saveModalOpen, currentApiName, method, url, mode, form, folderOptions, t])

    const handleOk = async () => {
        try {
            const values = await form.validateFields()
            const name = values.name.trim()
            const folderId = values.folderId || null

            if (saveModalMode === 'save' && currentApiId) {
                saveCurrentApi(name)
            } else {
                saveAsNewApi(name, folderId)
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
                    <span>{saveModalMode === 'saveAs' ? t('api:saveModal.titleSaveAs', { defaultValue: '另存为新接口' }) : t('api:saveModal.titleSave', { defaultValue: '保存接口' })}</span>
                </div>
            }
            open={saveModalOpen}
            onOk={handleOk}
            onCancel={() => setSaveModalOpen(false)}
            okText={t('common:save', { defaultValue: '保存' })}
            cancelText={t('common:cancel', { defaultValue: '取消' })}
            destroyOnHidden
            width={480}
        >
            <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                <Form.Item
                    label={t('api:saveModal.apiName', { defaultValue: '接口名称' })}
                    name="name"
                    rules={[{ required: true, message: t('api:saveModal.apiNameRequired', { defaultValue: '请输入接口名称' }) }]}
                >
                    <Input style={{ height: 34 }} placeholder={t('api:saveModal.apiNamePlaceholder', { defaultValue: '例如: 获取用户信息' })} autoFocus spellCheck={false} />
                </Form.Item>

                <Form.Item label={t('api:saveModal.belongFolder', { defaultValue: '归属分组' })} name="folderId">
                    <Select
                        style={{ height: 34 }}
                        placeholder={t('api:saveModal.selectFolderPlaceholder', { defaultValue: '选择分组 (可选，默认根目录)' })}
                        allowClear
                        options={[
                            { label: t('api:saveModal.rootFolderOption', { defaultValue: '（根目录 / 无分组）' }), value: '' },
                            ...folderOptions,
                        ]}
                    />
                </Form.Item>
            </Form>
        </Modal>
    )
}
