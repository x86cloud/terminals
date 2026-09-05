import React, { useRef, useEffect, useState, useMemo } from 'react'
import { Dropdown, Button, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import { X, ChevronDown, Check } from 'lucide-react'
import s from './TabBar.module.less'

export interface TabItem {
    key: string
    label: React.ReactNode
    icon?: React.ReactNode
    closable?: boolean // 默认为 true
    dotOn?: boolean
    extra?: React.ReactNode
    disabled?: boolean
}

export interface TabBarProps {
    items: TabItem[]
    activeKey: string | null
    onChange: (key: string) => void
    onClose?: (key: string) => void
    onCloseAll?: () => void
    onCloseLeft?: (key: string) => void
    onCloseRight?: (key: string) => void
    extraRight?: React.ReactNode
    className?: string
    style?: React.CSSProperties
    size?: 'small' | 'middle'
}

export default function TabBar({
    items,
    activeKey,
    onChange,
    onClose,
    onCloseAll,
    onCloseLeft,
    onCloseRight,
    extraRight,
    className = '',
    style,
    size = 'middle',
}: TabBarProps) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const tabRefs = useRef<Record<string, HTMLDivElement | null>>({})
    const [hasOverflow, setHasOverflow] = useState(false)

    // 监听容器大小和内容宽度以检测是否溢出
    useEffect(() => {
        const el = scrollRef.current
        if (!el) return

        const checkOverflow = () => {
            setHasOverflow(el.scrollWidth > el.clientWidth + 1)
        }

        checkOverflow()
        const ro = new ResizeObserver(checkOverflow)
        ro.observe(el)
        return () => ro.disconnect()
    }, [items])

    // 当 activeKey 变化时自动滚动至视口可见
    useEffect(() => {
        if (activeKey && tabRefs.current[activeKey]) {
            tabRefs.current[activeKey]?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'nearest',
            })
        }
    }, [activeKey])

    // 鼠标滚轮横向滚动
    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (scrollRef.current && e.deltaY !== 0) {
            scrollRef.current.scrollLeft += e.deltaY
        }
    }

    // 内部通用关闭逻辑
    const executeClose = (key: string) => {
        onClose?.(key)
    }

    const executeCloseAll = () => {
        if (onCloseAll) {
            onCloseAll()
        } else if (onClose) {
            items.filter((i) => i.closable !== false).forEach((i) => onClose(i.key))
        }
    }

    const executeCloseLeft = (targetKey: string) => {
        if (onCloseLeft) {
            onCloseLeft(targetKey)
        } else if (onClose) {
            const idx = items.findIndex((i) => i.key === targetKey)
            if (idx > 0) {
                items
                    .slice(0, idx)
                    .filter((i) => i.closable !== false)
                    .forEach((i) => onClose(i.key))
            }
        }
    }

    const executeCloseRight = (targetKey: string) => {
        if (onCloseRight) {
            onCloseRight(targetKey)
        } else if (onClose) {
            const idx = items.findIndex((i) => i.key === targetKey)
            if (idx >= 0 && idx < items.length - 1) {
                items
                    .slice(idx + 1)
                    .filter((i) => i.closable !== false)
                    .forEach((i) => onClose(i.key))
            }
        }
    }

    // 构建右键上下文菜单
    const getContextMenuItems = (item: TabItem, index: number): MenuProps['items'] => {
        const isClosable = item.closable !== false
        const hasLeftClosable = items.slice(0, index).some((i) => i.closable !== false)
        const hasRightClosable = items.slice(index + 1).some((i) => i.closable !== false)
        const hasAnyClosable = items.some((i) => i.closable !== false)

        return [
            {
                key: 'close',
                label: '关闭',
                disabled: !isClosable,
                onClick: () => executeClose(item.key),
            },
            {
                key: 'closeAll',
                label: '全部关闭',
                disabled: !hasAnyClosable,
                onClick: () => executeCloseAll(),
            },
            {
                key: 'closeLeft',
                label: '关闭左侧',
                disabled: !hasLeftClosable,
                onClick: () => executeCloseLeft(item.key),
            },
            {
                key: 'closeRight',
                label: '关闭右侧',
                disabled: !hasRightClosable,
                onClick: () => executeCloseRight(item.key),
            },
        ]
    }

    // 构建右侧下拉溢出菜单
    const overflowMenuItems: MenuProps['items'] = useMemo(() => {
        return items.map((item) => {
            const isActive = item.key === activeKey
            const isClosable = item.closable !== false

            return {
                key: item.key,
                label: (
                    <div className={s.dropdownMenuItem}>
                        <div className={s.itemLeft}>
                            {item.icon}
                            {item.dotOn !== undefined && (
                                <span className={`${s.dot}${item.dotOn ? ' ' + s.on : ''}`} />
                            )}
                            <span className={s.itemTitle} style={{ fontWeight: isActive ? 600 : 400 }}>
                                {item.label}
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isActive && <Check size={13} style={{ color: 'var(--accent)' }} />}
                            {isClosable && (
                                <Button
                                    type="text"
                                    size="small"
                                    className={s.tabCloseBtn}
                                    icon={<X size={10} />}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        executeClose(item.key)
                                    }}
                                />
                            )}
                        </div>
                    </div>
                ),
                onClick: () => onChange(item.key),
            }
        })
    }, [items, activeKey])

    return (
        <div className={`${s.container} ${s[size]} ${className}`} style={style}>
            {/* 可滚动 Tab 区域 */}
            <div className={s.scrollArea} ref={scrollRef} onWheel={handleWheel}>
                {items.map((item, index) => {
                    const isActive = item.key === activeKey
                    const isClosable = item.closable !== false

                    return (
                        <Dropdown
                            key={item.key}
                            menu={{ items: getContextMenuItems(item, index) }}
                            trigger={['contextMenu']}
                        >
                            <div
                                ref={(el) => (tabRefs.current[item.key] = el)}
                                className={`${s.tabItem}${isActive ? ' ' + s.active : ''}${item.disabled ? ' ' + s.disabled : ''
                                    }`}
                                onClick={() => !item.disabled && onChange(item.key)}
                            >
                                {item.icon}
                                {item.dotOn !== undefined && (
                                    <span className={`${s.dot}${item.dotOn ? ' ' + s.on : ''}`} />
                                )}
                                <span className={s.tabTitle}>{item.label}</span>
                                {item.extra}
                                {isClosable && <Button
                                    size="small"
                                    type="text"
                                    className={s.tabCloseBtn}
                                    icon={<X size={11} />}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        executeClose(item.key)
                                    }}
                                />}
                            </div>
                        </Dropdown>
                    )
                })}
            </div>

            {/* 右侧操作区：溢出下拉菜单 + 自定义额外操作 */}
            {(hasOverflow || extraRight) && (
                <div className={s.actionArea}>
                    {hasOverflow && (
                        <Dropdown
                            menu={{ items: overflowMenuItems }}
                            trigger={['click']}
                            placement="bottomRight"
                        >
                            <Tooltip title="查看全部标签页">
                                <Button
                                    size="small"
                                    type="text"
                                    className={s.moreBtn}
                                    icon={<ChevronDown size={14} />}
                                />
                            </Tooltip>
                        </Dropdown>
                    )}
                    {extraRight}
                </div>
            )}
        </div>
    )
}
