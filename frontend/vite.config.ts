import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    css: {
        modules: {
            // 生成的类名形如：fileName_hash（保持可读、避免冲突）
            generateScopedName: '[name]__[local]___[hash:base64:5]',
            // 仅对 *.module.less / *.module.css 启用 CSS Modules
            localsConvention: 'camelCaseOnly',
        },
        preprocessorOptions: {
            less: {
                javascriptEnabled: true,
            },
        },
    },
})
