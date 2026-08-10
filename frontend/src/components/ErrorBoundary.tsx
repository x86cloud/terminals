import React, { Component, ErrorInfo, ReactNode } from 'react'

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
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '32px',
                    backgroundColor: 'var(--bg-primary, #1e1e1e)',
                    color: 'var(--text-primary, #ffffff)',
                    height: '100%',
                    boxSizing: 'border-box',
                    textAlign: 'center',
                }}>
                    <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚠️</div>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 600 }}>
                        {this.props.title || '页面渲染异常'}
                    </h3>
                    <p style={{
                        maxWidth: '500px',
                        margin: '0 0 20px 0',
                        fontSize: '13px',
                        color: 'var(--text-secondary, #aaaaaa)',
                        wordBreak: 'break-word',
                        lineHeight: 1.5,
                        backgroundColor: 'rgba(0,0,0,0.2)',
                        padding: '12px',
                        borderRadius: '6px',
                        fontFamily: 'monospace',
                    }}>
                        {this.state.error?.message || '发生了未捕获的渲染错误'}
                    </p>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            onClick={this.handleReset}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '4px',
                                border: 'none',
                                backgroundColor: 'var(--accent-color, #1890ff)',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: '13px',
                            }}
                        >
                            重试加载
                        </button>
                        {this.props.onClose && (
                            <button
                                onClick={this.props.onClose}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '4px',
                                    border: '1px solid var(--border-color, #444)',
                                    backgroundColor: 'transparent',
                                    color: 'var(--text-primary, #fff)',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                }}
                            >
                                关闭标签页
                            </button>
                        )}
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}
