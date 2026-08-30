package core

type AppSettings struct {
	ThemeMode               string  `json:"themeMode"`
	FontFamily              string  `json:"fontFamily"`
	FontSize                string  `json:"fontSize"`
	AutoConnect             bool    `json:"autoConnect"`
	DbDefaultLimit          string  `json:"dbDefaultLimit"`
	GlobalFontFamily        string  `json:"globalFontFamily"`
	AiBaseURL               string  `json:"aiBaseUrl"`
	AiAPIKey                string  `json:"aiApiKey"`
	AiModel                 string  `json:"aiModel"`
	AiTemperature           float64 `json:"aiTemperature"`
	AiModelContextTokens    int     `json:"aiModelContextTokens"`  // 模型上下文窗口总长度 (如 131072 / 128k, 65536 / 64k)
	AiContextCompressRatio  int     `json:"aiContextCompressRatio"` // 压缩触发百分比 (例如 80 即 80%)
	AiMaxContextTokens      int     `json:"aiMaxContextTokens"`    // 实际触发 Token 数
	AiCompressionStrategy   string  `json:"aiCompressionStrategy"` // "none" | "summary" | "sliding"
	AiEnableMultimodal      bool    `json:"aiEnableMultimodal"`
	AiSystemPrompt          string  `json:"aiSystemPrompt"`
	AiWorkspaceDir          string  `json:"aiWorkspaceDir"`
	AiEnableWebSearch       bool    `json:"aiEnableWebSearch"`
	AiEnablePermissionGuard bool    `json:"aiEnablePermissionGuard"`
	AiBlockHighRiskCommands bool    `json:"aiBlockHighRiskCommands"`
	AiEnableThinking        bool    `json:"aiEnableThinking"`
	AiReasoningEffort       string  `json:"aiReasoningEffort"` // "low" | "medium" | "high"
	AiEnableVerifier        bool    `json:"aiEnableVerifier"`
	AiMaxParallel           int     `json:"aiMaxParallel"`
}

func DefaultAppSettings() AppSettings {
	return AppSettings{
		ThemeMode:               "light",
		FontFamily:              "Consolas",
		FontSize:                "13",
		AutoConnect:             false,
		DbDefaultLimit:          "50",
		GlobalFontFamily:        "system",
		AiBaseURL:               "https://api.deepseek.com",
		AiAPIKey:                "",
		AiModel:                 "deepseek-v4-flash",
		AiTemperature:           0.7,
		AiModelContextTokens:    65536,
		AiContextCompressRatio:  80,
		AiMaxContextTokens:      52428,
		AiCompressionStrategy:   "summary",
		AiEnableMultimodal:      false,
		AiSystemPrompt:          "你是一个有用的 AI 助手，能够回答用户的各种技术与日常问题，并给出精准优雅的解答。",
		AiEnablePermissionGuard: true,
		AiBlockHighRiskCommands: true,
		AiEnableThinking:        false,
		AiReasoningEffort:       "medium",
		AiEnableVerifier:        false,
		AiMaxParallel:           4,
	}
}
