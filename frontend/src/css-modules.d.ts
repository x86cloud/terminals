// CSS Modules 类型声明（.module.less / .module.css）
declare module '*.module.less' {
    const classes: { readonly [key: string]: string }
    export default classes
}

declare module '*.module.css' {
    const classes: { readonly [key: string]: string }
    export default classes
}
