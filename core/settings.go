package core

type AppSettings struct {
	ThemeMode        string `json:"themeMode"`
	FontFamily       string `json:"fontFamily"`
	FontSize         string `json:"fontSize"`
	AutoConnect      bool   `json:"autoConnect"`
	DbDefaultLimit   string `json:"dbDefaultLimit"`
	GlobalFontFamily string `json:"globalFontFamily"`
}

func DefaultAppSettings() AppSettings {
	return AppSettings{
		ThemeMode:        "light",
		FontFamily:       "Consolas",
		FontSize:         "13",
		AutoConnect:      false,
		DbDefaultLimit:   "50",
		GlobalFontFamily: "system",
	}
}
