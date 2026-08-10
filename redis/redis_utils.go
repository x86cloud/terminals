package redis

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/redis/go-redis/v9"
)

// ===================== 辅助 =====================

func toInterfaces(parts []string) []interface{} {
	out := make([]interface{}, len(parts))
	for i, p := range parts {
		out[i] = p
	}
	return out
}

func errToString(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, redis.Nil) {
		return "nil"
	}
	return err.Error()
}

func formatRedisResult(v any) string {
	switch val := v.(type) {
	case nil:
		return "(nil)"
	case string:
		return val
	case []byte:
		return string(val)
	case int64:
		return strconv.FormatInt(val, 10)
	case float64:
		return strconv.FormatFloat(val, 'f', -1, 64)
	case []any:
		parts := make([]string, 0, len(val))
		for _, item := range val {
			parts = append(parts, formatRedisResult(item))
		}
		return "[" + strings.Join(parts, ", ") + "]"
	case map[string]any:
		parts := make([]string, 0, len(val))
		for k, item := range val {
			parts = append(parts, fmt.Sprintf("%v: %v", k, formatRedisResult(item)))
		}
		return "{" + strings.Join(parts, ", ") + "}"
	case map[interface{}]interface{}:
		parts := make([]string, 0, len(val))
		for k, item := range val {
			parts = append(parts, fmt.Sprintf("%v: %v", k, formatRedisResult(item)))
		}
		return "{" + strings.Join(parts, ", ") + "}"
	default:
		return fmt.Sprintf("%v", val)
	}
}

func formatCmds(args []string) string {
	return strings.Join(args, " ")
}

// ---- 文本解析辅助（与前端格式互转） ----

func splitLines(s string) []string {
	s = strings.TrimRight(s, "\n")
	if s == "" {
		return []string{}
	}
	return strings.Split(s, "\n")
}

// pairsToMap 把 "k1\nv1\nk2\nv2" 解析为 map。
func pairsToMap(s string) map[string]string {
	lines := strings.Split(s, "\n")
	m := make(map[string]string)
	for i := 0; i+1 < len(lines); i += 2 {
		m[lines[i]] = lines[i+1]
	}
	return m
}

// zsetToPairs 把 "m1\ns1\nm2\ns2" 解析为 [member, score] 对。
func zsetToPairs(s string) [][2]string {
	lines := strings.Split(s, "\n")
	out := make([][2]string, 0, len(lines)/2)
	for i := 0; i+1 < len(lines); i += 2 {
		out = append(out, [2]string{lines[i], lines[i+1]})
	}
	return out
}
