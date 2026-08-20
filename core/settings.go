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
	AiMaxContextTokens      int     `json:"aiMaxContextTokens"`
	AiCompressionStrategy   string  `json:"aiCompressionStrategy"` // "summary" | "sliding"
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
		AiMaxContextTokens:      4096,
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
