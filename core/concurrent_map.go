package core

import "sync"

// ConcurrentMap 是一个强类型、线程安全的泛型字典容器，避免无类型 sync.Map 带来的堆装箱与运行时动态类型断言。
type ConcurrentMap[K comparable, V any] struct {
	mu sync.RWMutex
	m  map[K]V
}

// NewConcurrentMap 创建并初始化一个 ConcurrentMap。
func NewConcurrentMap[K comparable, V any]() *ConcurrentMap[K, V] {
	return &ConcurrentMap[K, V]{
		m: make(map[K]V),
	}
}

func (c *ConcurrentMap[K, V]) initIfNeeded() {
	if c.m == nil {
		c.m = make(map[K]V)
	}
}

// Get 读取指定键的值。如果存在返回对应强类型值与 true，否则返回零值与 false。
func (c *ConcurrentMap[K, V]) Get(k K) (V, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.m == nil {
		var zero V
		return zero, false
	}
	v, ok := c.m[k]
	return v, ok
}

// Set 写入指定键值对。
func (c *ConcurrentMap[K, V]) Set(k K, v V) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.initIfNeeded()
	c.m[k] = v
}

// Delete 删除指定键。
func (c *ConcurrentMap[K, V]) Delete(k K) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.m != nil {
		delete(c.m, k)
	}
}

// GetAndDelete 获取并删除指定键。
func (c *ConcurrentMap[K, V]) GetAndDelete(k K) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.m == nil {
		var zero V
		return zero, false
	}
	v, ok := c.m[k]
	if ok {
		delete(c.m, k)
	}
	return v, ok
}

// GetOrSet 若键存在则返回已有值；若不存在则存入 defaultVal 并返回 defaultVal。
// loaded 表示是否是读取到了已有值。
func (c *ConcurrentMap[K, V]) GetOrSet(k K, defaultVal V) (actual V, loaded bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.initIfNeeded()
	if v, ok := c.m[k]; ok {
		return v, true
	}
	c.m[k] = defaultVal
	return defaultVal, false
}

// Range 遍历容器中所有的键值对。如果 fn 返回 false，则中止遍历。
func (c *ConcurrentMap[K, V]) Range(fn func(k K, v V) bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.m == nil {
		return
	}
	for k, v := range c.m {
		if !fn(k, v) {
			break
		}
	}
}

// Keys 获取当前所有键的快照切片。
func (c *ConcurrentMap[K, V]) Keys() []K {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.m == nil {
		return []K{}
	}
	keys := make([]K, 0, len(c.m))
	for k := range c.m {
		keys = append(keys, k)
	}
	return keys
}

// Values 获取当前所有值的快照切片。
func (c *ConcurrentMap[K, V]) Values() []V {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.m == nil {
		return []V{}
	}
	vals := make([]V, 0, len(c.m))
	for _, v := range c.m {
		vals = append(vals, v)
	}
	return vals
}

// Len 获取容器中键值对数量。
func (c *ConcurrentMap[K, V]) Len() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.m == nil {
		return 0
	}
	return len(c.m)
}

// Clear 清空容器。
func (c *ConcurrentMap[K, V]) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.m = make(map[K]V)
}
