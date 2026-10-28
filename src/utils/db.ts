/**
 * 比较数据库单元格原始值与编辑输入值是否等价。
 * 解决数字类型（如 100 与 "100"）、布尔类型（如 true 与 "true"）、NULL 等因为类型差异误判为已修改的问题。
 */
export function isSameCellValue(origVal: any, newVal: any): boolean {
    const isOrigNull = origVal === null || origVal === undefined
    const isNewNull = newVal === null || newVal === undefined

    // 两者皆为 NULL / undefined
    if (isOrigNull && isNewNull) return true
    if (isOrigNull !== isNewNull) return false

    // 严格全等（同类型同值）
    if (origVal === newVal) return true

    // 原始值为数字类型，或编辑值为数字格式
    if (typeof origVal === 'number' || (typeof origVal === 'string' && !isNaN(Number(origVal)) && origVal.trim() !== '')) {
        const sOrig = String(origVal).trim()
        const sNew = String(newVal).trim()
        if (sOrig === sNew) return true

        const nOrig = Number(origVal)
        const nNew = Number(newVal)
        if (!isNaN(nOrig) && !isNaN(nNew) && sNew !== '' && sOrig !== '') {
            return nOrig === nNew
        }
    }

    // 原始值为布尔类型
    if (typeof origVal === 'boolean') {
        const s = String(newVal).trim().toLowerCase()
        if (origVal === true && (s === 'true' || s === '1' || s === 't')) return true
        if (origVal === false && (s === 'false' || s === '0' || s === 'f')) return true
        return false
    }

    // 原始值为复杂对象（JSON / Array）
    if (typeof origVal === 'object') {
        try {
            if (JSON.stringify(origVal) === String(newVal).trim()) return true
        } catch {}
    }

    // 字符串比较
    return String(origVal).trim() === String(newVal).trim()
}

/**
 * 将编辑输入的字符串还原为对应原始值的类型（数字、布尔等）
 */
export function coerceCellValue(origVal: any, val: any, isNull: boolean): any {
    if (isNull || val === null || val === undefined) return null

    if (typeof origVal === 'number') {
        const s = String(val).trim()
        if (s !== '' && !isNaN(Number(s))) {
            const n = Number(s)
            if (Number.isSafeInteger(n) || s.includes('.')) {
                return n
            }
        }
        return s
    }

    if (typeof origVal === 'boolean') {
        const s = String(val).trim().toLowerCase()
        if (s === 'true' || s === '1') return true
        if (s === 'false' || s === '0') return false
    }

    return val
}
