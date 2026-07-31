import {createRoot} from 'react-dom/client'
import './style.css'
import App from './App'

const container = document.getElementById('root')
const root = createRoot(container!)

// 不使用 StrictMode：避免开发模式下重复挂载导致 xterm 实例与 SSH 事件重复注册
root.render(<App/>)
