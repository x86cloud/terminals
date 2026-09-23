package core

import (
	"fmt"
	"sync"
	"testing"
)

func TestConcurrentMapBasics(t *testing.T) {
	cm := NewConcurrentMap[string, int]()

	if cm.Len() != 0 {
		t.Fatalf("expected len 0, got %d", cm.Len())
	}

	cm.Set("a", 100)
	cm.Set("b", 200)

	if val, ok := cm.Get("a"); !ok || val != 100 {
		t.Errorf("expected get a=100, got %d (ok=%v)", val, ok)
	}

	if _, ok := cm.Get("c"); ok {
		t.Errorf("expected c not found")
	}

	// GetOrSet
	actual, loaded := cm.GetOrSet("a", 999)
	if !loaded || actual != 100 {
		t.Errorf("expected loaded existing a=100, got %d (loaded=%v)", actual, loaded)
	}

	actual, loaded = cm.GetOrSet("c", 300)
	if loaded || actual != 300 {
		t.Errorf("expected loaded=false and actual=300 for c, got %d (loaded=%v)", actual, loaded)
	}

	if cm.Len() != 3 {
		t.Errorf("expected len 3, got %d", cm.Len())
	}

	// Range
	visited := make(map[string]int)
	cm.Range(func(k string, v int) bool {
		visited[k] = v
		return true
	})
	if len(visited) != 3 || visited["a"] != 100 || visited["b"] != 200 || visited["c"] != 300 {
		t.Errorf("unexpected visited map: %v", visited)
	}

	// Range early stop
	count := 0
	cm.Range(func(k string, v int) bool {
		count++
		return false
	})
	if count != 1 {
		t.Errorf("expected count 1 for early break, got %d", count)
	}

	// GetAndDelete
	val, ok := cm.GetAndDelete("a")
	if !ok || val != 100 {
		t.Errorf("expected get and delete a=100, got %d (ok=%v)", val, ok)
	}
	if _, ok := cm.Get("a"); ok {
		t.Errorf("expected a deleted")
	}

	// Keys & Values
	keys := cm.Keys()
	vals := cm.Values()
	if len(keys) != 2 || len(vals) != 2 {
		t.Errorf("expected 2 keys and 2 values, got keys=%d vals=%d", len(keys), len(vals))
	}

	// Clear
	cm.Clear()
	if cm.Len() != 0 {
		t.Errorf("expected len 0 after clear, got %d", cm.Len())
	}
}

func TestConcurrentMapConcurrency(t *testing.T) {
	cm := NewConcurrentMap[int, string]()
	const workers = 20
	const iterations = 1000

	var wg sync.WaitGroup
	wg.Add(workers * 2)

	// 并发写
	for w := 0; w < workers; w++ {
		workerID := w
		go func() {
			defer wg.Done()
			for i := 0; i < iterations; i++ {
				key := (workerID * iterations) + i
				cm.Set(key, fmt.Sprintf("val-%d", key))
			}
		}()
	}

	// 并发读与遍历
	for w := 0; w < workers; w++ {
		go func() {
			defer wg.Done()
			for i := 0; i < iterations; i++ {
				_, _ = cm.Get(i)
				if i%100 == 0 {
					_ = cm.Len()
				}
			}
		}()
	}

	wg.Wait()

	if cm.Len() != workers*iterations {
		t.Errorf("expected len %d, got %d", workers*iterations, cm.Len())
	}
}
