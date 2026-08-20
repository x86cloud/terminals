package skills

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"terminal/agent/store"

	"gopkg.in/yaml.v3"
)

type SkillFrontMatter struct {
	Name        string `yaml:"name" json:"name"`
	Description string `yaml:"description" json:"description"`
	Context     string `yaml:"context" json:"context,omitempty"`
	Agent       string `yaml:"agent" json:"agent,omitempty"`
	Model       string `yaml:"model" json:"model,omitempty"`
}

type Skill struct {
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Instructions string   `json:"instructions"`
	Tools        []string `json:"tools,omitempty"`
	Context      string   `json:"context,omitempty"`
	Path         string   `json:"path,omitempty"`
}

type SkillsRegistry struct {
	mu        sync.RWMutex
	skillsDir string
	store     *store.Store
}

// GetDefaultSkillsDir returns the standard skills directory (%APPDATA%/xClient/skills or ~/.config/xClient/skills)
func GetDefaultSkillsDir() string {
	home, err := os.UserConfigDir()
	if err != nil {
		home = "."
	}
	dir := filepath.Join(home, "xClient", "skills")
	_ = os.MkdirAll(dir, 0o755)
	return dir
}

func NewSkillsRegistry(st *store.Store) *SkillsRegistry {
	skillsDir := GetDefaultSkillsDir()
	return &SkillsRegistry{
		skillsDir: skillsDir,
		store:     st,
	}
}

func (r *SkillsRegistry) SetSkillsDir(dir string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if dir != "" {
		_ = os.MkdirAll(dir, 0o755)
		r.skillsDir = dir
	}
}

func (r *SkillsRegistry) GetSkillsDir() string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.skillsDir
}

// ParseSkillFile parses a SKILL.md file with YAML FrontMatter and markdown body
func ParseSkillFile(filePath string) (*Skill, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}
	content := string(data)

	var fm SkillFrontMatter
	instructions := content

	// Parse YAML FrontMatter if present (surrounded by ---)
	if strings.HasPrefix(strings.TrimSpace(content), "---") {
		trimmed := strings.TrimSpace(content)
		// Find second ---
		rest := strings.TrimPrefix(trimmed, "---")
		idx := strings.Index(rest, "---")
		if idx >= 0 {
			fmStr := rest[:idx]
			instructions = strings.TrimSpace(rest[idx+3:])
			_ = yaml.Unmarshal([]byte(fmStr), &fm)
		}
	}

	skillName := fm.Name
	if skillName == "" {
		// Fallback to directory name
		skillName = filepath.Base(filepath.Dir(filePath))
	}

	skillDesc := fm.Description
	if skillDesc == "" {
		// Extract first line of instructions
		lines := strings.Split(instructions, "\n")
		for _, l := range lines {
			l = strings.TrimSpace(strings.TrimPrefix(l, "#"))
			if l != "" {
				skillDesc = l
				break
			}
		}
	}

	return &Skill{
		Name:         skillName,
		Description:  skillDesc,
		Instructions: instructions,
		Context:      fm.Context,
		Path:         filePath,
	}, nil
}

func (r *SkillsRegistry) List() []Skill {
	r.mu.RLock()
	dir := r.skillsDir
	r.mu.RUnlock()

	var list []Skill
	if dir == "" {
		return list
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return list
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		skillFilePath := filepath.Join(dir, entry.Name(), "SKILL.md")
		if _, err := os.Stat(skillFilePath); err != nil {
			continue
		}

		skill, err := ParseSkillFile(skillFilePath)
		if err == nil && skill != nil {
			list = append(list, *skill)
		}
	}

	return list
}

func (r *SkillsRegistry) Get(name string) (*Skill, error) {
	r.mu.RLock()
	dir := r.skillsDir
	r.mu.RUnlock()

	if dir == "" {
		return nil, fmt.Errorf("未配置技能目录")
	}

	// 1. Direct path check: dir/name/SKILL.md
	directPath := filepath.Join(dir, name, "SKILL.md")
	if _, err := os.Stat(directPath); err == nil {
		return ParseSkillFile(directPath)
	}

	// 2. Scan all subdirectories to match FrontMatter Name
	list := r.List()
	for _, s := range list {
		if strings.EqualFold(s.Name, name) {
			return &s, nil
		}
	}

	return nil, fmt.Errorf("未找到本地技能包 [%s]", name)
}
