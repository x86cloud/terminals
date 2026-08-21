package verifier

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"terminal/agent/router"

	"github.com/cloudwego/eino/schema"
)

type VerdictStatus string

const (
	VerdictPass    VerdictStatus = "pass"
	VerdictFail    VerdictStatus = "fail"
	VerdictPartial VerdictStatus = "partial"
)

type Verdict struct {
	Status        VerdictStatus `json:"status"`                   // pass | fail | partial
	Reason        string        `json:"reason,omitempty"`
	FixSuggestion string        `json:"fix_suggestion,omitempty"`
	Confidence    float64       `json:"confidence,omitempty"`     // 0~1
	Class         string        `json:"class,omitempty"`          // transient | permanent | fatal
}

type Verifier struct {
	mu      sync.RWMutex
	router  *router.ModelRouter
	enabled bool
}

func NewVerifier(r *router.ModelRouter) *Verifier {
	return &Verifier{
		router:  r,
		enabled: false,
	}
}

func (v *Verifier) SetEnabled(enabled bool) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.enabled = enabled
}

func (v *Verifier) IsEnabled() bool {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return v.enabled
}

func (v *Verifier) Verify(ctx context.Context, expectedOut string, actualOut any, execErr string) Verdict {
	// 第一段：快速规则校验
	vd := v.ruleVerify(expectedOut, actualOut, execErr)
	if vd.Status != VerdictPass && vd.Status != VerdictPartial {
		return vd
	}

	// 第二段：可选模型语义校验（需 enabled 开启）
	v.mu.RLock()
	enabled := v.enabled
	r := v.router
	v.mu.RUnlock()

	if enabled && r != nil && strings.TrimSpace(expectedOut) != "" {
		modelRes, err := r.Resolve(ctx, router.RoleVerifier)
		if err != nil || modelRes == nil || modelRes.Model == nil {
			modelRes, err = r.Resolve(ctx, router.RoleDefault)
		}

		if err == nil && modelRes != nil && modelRes.Model != nil {
			timeoutCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			defer cancel()

			outStr := fmt.Sprintf("%v", actualOut)
			mv, modelErr := v.modelVerify(timeoutCtx, modelRes, expectedOut, outStr)
			if modelErr == nil {
				return mv
			}
			// 模型校验超时或异常降级返回规则校验结果
		}
	}

	return vd
}

func (v *Verifier) ruleVerify(expectedOut string, actualOut any, execErr string) Verdict {
	if execErr != "" {
		lowerErr := strings.ToLower(execErr)
		class := "permanent"
		if strings.Contains(lowerErr, "timeout") || strings.Contains(lowerErr, "refused") || strings.Contains(lowerErr, "reset") || strings.Contains(lowerErr, "temporary") {
			class = "transient"
		} else if strings.Contains(lowerErr, "forbidden") || strings.Contains(lowerErr, "canceled") || strings.Contains(lowerErr, "killed") {
			class = "fatal"
		}

		return Verdict{
			Status:        VerdictFail,
			Reason:        fmt.Sprintf("执行返回错误: %s", execErr),
			FixSuggestion: "请检查目标主机连通性、执行参数或权限配置",
			Class:         class,
			Confidence:    0.9,
		}
	}

	if actualOut == nil {
		if expectedOut != "" {
			return Verdict{
				Status:        VerdictPartial,
				Reason:        "执行结果为空",
				FixSuggestion: "请确认目标资源或数据是否存在",
				Class:         "permanent",
				Confidence:    0.7,
			}
		}
		return Verdict{Status: VerdictPass, Confidence: 1.0}
	}

	outStr := fmt.Sprintf("%v", actualOut)
	lowerOut := strings.ToLower(outStr)

	if strings.Contains(lowerOut, "fatal error") || strings.Contains(lowerOut, "permission denied") || strings.Contains(lowerOut, "syntax error") || strings.Contains(lowerOut, "no such file or directory") {
		return Verdict{
			Status:        VerdictFail,
			Reason:        "输出内容包含明确失败关键字 (SyntaxError/PermissionDenied/NotFound)",
			FixSuggestion: "请检查路径存在性、语法有效性或执行权限",
			Class:         "permanent",
			Confidence:    0.85,
		}
	}

	return Verdict{
		Status:     VerdictPass,
		Confidence: 0.95,
	}
}

func (v *Verifier) modelVerify(ctx context.Context, modelRes *router.ResolvedModel, expectedOut, actualOut string) (Verdict, error) {
	prompt := fmt.Sprintf(`请评估以下执行结果是否满足预期目标：
【预期目标】: %s
【实际输出】: %s

请返回纯 JSON 格式：
{
  "status": "pass" | "fail" | "partial",
  "reason": "原因解释",
  "fix_suggestion": "若未通过时的修复或调优建议",
  "confidence": 0.95,
  "class": "transient" | "permanent" | "fatal"
}`, expectedOut, actualOut)

	resp, err := modelRes.Model.Generate(ctx, []*schema.Message{
		schema.SystemMessage("你是一个严谨客观的执行结果验证器。只输出纯 JSON，不要包含任何 markdown 代码块以外的说明。"),
		schema.UserMessage(prompt),
	})
	if err != nil || resp == nil || resp.Content == "" {
		return Verdict{}, fmt.Errorf("模型校验生成失败: %w", err)
	}

	clean := strings.TrimSpace(resp.Content)
	clean = strings.TrimPrefix(clean, "```json")
	clean = strings.TrimPrefix(clean, "```")
	clean = strings.TrimSuffix(clean, "```")
	clean = strings.TrimSpace(clean)

	var res Verdict
	if err := json.Unmarshal([]byte(clean), &res); err != nil {
		return Verdict{}, fmt.Errorf("解析模型校验 JSON 失败: %w", err)
	}

	if res.Status == "" {
		res.Status = VerdictPass
	}
	return res, nil
}
