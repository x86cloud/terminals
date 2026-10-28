import React from 'react'
export interface AppLogoProps {
    size?: number
    className?: string
    style?: React.CSSProperties
}

export default function AppLogo({
    size = 20,
}: AppLogoProps) {
    return (
        <img src="favicon.svg" style={{ width: size, height: size }} />
    )
}
