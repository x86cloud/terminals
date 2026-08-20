package planner

import (
	"sync"
)

type PlanGate struct {
	mu           sync.RWMutex
	pendingPlans map[string]*Plan
	activePlans  map[string]*Plan
	exemptions   map[string]map[string]bool // planID -> stepID -> exempted
}

func NewPlanGate() *PlanGate {
	return &PlanGate{
		pendingPlans: make(map[string]*Plan),
		activePlans:  make(map[string]*Plan),
		exemptions:   make(map[string]map[string]bool),
	}
}

func (pg *PlanGate) Submit(p *Plan) {
	pg.mu.Lock()
	defer pg.mu.Unlock()
	pg.pendingPlans[p.ID] = p
	pg.activePlans[p.ID] = p
	pg.exemptions[p.ID] = make(map[string]bool)
}

func (pg *PlanGate) Get(planID string) *Plan {
	pg.mu.RLock()
	defer pg.mu.RUnlock()
	return pg.activePlans[planID]
}

func (pg *PlanGate) ExemptStep(planID, stepID string) {
	pg.mu.Lock()
	defer pg.mu.Unlock()
	if exMap, ok := pg.exemptions[planID]; ok {
		exMap[stepID] = true
	}
}

func (pg *PlanGate) IsStepExempted(planID, stepID string) bool {
	pg.mu.RLock()
	defer pg.mu.RUnlock()
	if exMap, ok := pg.exemptions[planID]; ok {
		return exMap[stepID]
	}
	return false
}

func (pg *PlanGate) Approve(planID string) (*Plan, bool) {
	pg.mu.Lock()
	defer pg.mu.Unlock()
	p, ok := pg.pendingPlans[planID]
	if ok {
		delete(pg.pendingPlans, planID)
	} else {
		p, ok = pg.activePlans[planID]
	}
	return p, ok
}
