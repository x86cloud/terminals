package executor

import (
	"fmt"
	"strings"
	"terminal/agent/planner"
)

// BuildDAG 校验依赖合法性、执行环检测并返回拓扑分层（同层步骤无相互依赖，可并发调度）。
func BuildDAG(steps []planner.PlanStep) ([][]planner.PlanStep, error) {
	if len(steps) == 0 {
		return nil, nil
	}

	stepMap := make(map[string]planner.PlanStep)
	inDegree := make(map[string]int)
	adjList := make(map[string][]string)

	// 1. 索引所有步骤 ID 并校验唯一性
	for i, st := range steps {
		stepID := strings.TrimSpace(st.ID)
		if stepID == "" {
			stepID = fmt.Sprintf("step_%d", i+1)
			st.ID = stepID
		}
		if _, exists := stepMap[stepID]; exists {
			stepID = fmt.Sprintf("step_%d_%d", i+1, i)
			st.ID = stepID
		}
		stepMap[stepID] = st
		inDegree[stepID] = 0
	}

	// 2. 构建依赖图并校验引用的合法性
	for _, st := range steps {
		for _, depID := range st.DependsOn {
			if depID == "" {
				continue
			}
			if depID == st.ID {
				return nil, fmt.Errorf("步骤 [%s] 不能自依赖", st.ID)
			}
			if _, exists := stepMap[depID]; !exists {
				return nil, fmt.Errorf("步骤 [%s] 依赖的步骤 [%s] 不存在", st.ID, depID)
			}
			adjList[depID] = append(adjList[depID], st.ID)
			inDegree[st.ID]++
		}
	}

	// 3. Kahn 算法拓扑分层
	var queue []string
	for id, deg := range inDegree {
		if deg == 0 {
			queue = append(queue, id)
		}
	}

	var layers [][]planner.PlanStep
	visitedCount := 0

	for len(queue) > 0 {
		currentLayerIDs := queue
		queue = nil

		var currentLayer []planner.PlanStep
		for _, id := range currentLayerIDs {
			currentLayer = append(currentLayer, stepMap[id])
			visitedCount++

			for _, neighborID := range adjList[id] {
				inDegree[neighborID]--
				if inDegree[neighborID] == 0 {
					queue = append(queue, neighborID)
				}
			}
		}

		if len(currentLayer) > 0 {
			layers = append(layers, currentLayer)
		}
	}

	// 4. 环检测
	if visitedCount != len(steps) {
		return nil, fmt.Errorf("检测到计划步骤依赖存在环路 (循环依赖，共有 %d 个步骤无法被拓扑排序)", len(steps)-visitedCount)
	}

	return layers, nil
}
