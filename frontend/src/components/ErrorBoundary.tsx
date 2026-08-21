import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Button, Result, Space } from 'antd'
import s from './ErrorBoundary.module.less'

interface Props {
    children: ReactNode
    title?: string
    onClose?: () => void
}

interface State {
    hasError: boolean
    error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    }

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error in component:', error, errorInfo)
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null })
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className={s.errorContainer}>
                    <Result
                        status="error"
                        title={this.props.title || '页面渲染异常'}
                        subTitle={this.state.error?.message || '发生了未捕获的渲染错误'}
                        extra={
                            <Space size={12}>
                                <Button type="primary" onClick={this.handleReset}>
                                    重试加载
                                </Button>
                                {this.props.onClose && (
                                    <Button onClick={this.props.onClose}>
                                        关闭标签页
                                    </Button>
                                )}
                            </Space>
                        }
                    />
                </div>
            )
        }

        return this.props.children
    }
}
