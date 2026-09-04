import React, { createContext, useContext } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface ThemeContextValue {
    themeMode: ThemeMode
    isDark: boolean
    toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeContextValue>({
    themeMode: 'light',
    isDark: false,
    toggleTheme: () => {},
})

export const useTheme = () => useContext(ThemeContext)
