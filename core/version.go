package core

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Injected via ldflags during build:
// -ldflags "-X 'terminal/core.Version=v1.0.5' -X 'terminal/core.GitCommit=b7e78b2' -X 'terminal/core.BuildDate=2026-09-08'"
var (
	Version   = "v1.0.5"
	GitCommit = "dev"
	BuildDate = ""
)

type AppVersionInfo struct {
	Version   string `json:"version"`
	GitCommit string `json:"gitCommit"`
	BuildDate string `json:"buildDate"`
	GoVersion string `json:"goVersion"`
	Platform  string `json:"platform"`
}

type UpdateCheckResult struct {
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	HasUpdate      bool   `json:"hasUpdate"`
	ReleaseURL     string `json:"releaseUrl"`
	RepoURL        string `json:"repoUrl"`
	CheckedAt      string `json:"checkedAt"`
	ErrorMessage   string `json:"errorMessage,omitempty"`
}

func GetAppVersionInfo() AppVersionInfo {
	return AppVersionInfo{
		Version:   Version,
		GitCommit: GitCommit,
		BuildDate: BuildDate,
		GoVersion: runtime.Version(),
		Platform:  fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH),
	}
}

type gitHubTagItem struct {
	Name string `json:"name"`
}

func CheckForUpdates() UpdateCheckResult {
	repoURL := "https://github.com/x86cloud/terminals"
	nowStr := time.Now().Format("2006-01-02 15:04:05")

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	req, err := http.NewRequest("GET", "https://api.github.com/repos/x86cloud/terminals/tags?per_page=5", nil)
	if err != nil {
		return UpdateCheckResult{
			CurrentVersion: Version,
			RepoURL:        repoURL,
			CheckedAt:      nowStr,
			ErrorMessage:   fmt.Sprintf("创建请求失败: %v", err),
		}
	}

	req.Header.Set("User-Agent", "xClient-Terminal/"+Version)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := client.Do(req)
	if err != nil {
		return UpdateCheckResult{
			CurrentVersion: Version,
			RepoURL:        repoURL,
			CheckedAt:      nowStr,
			ErrorMessage:   fmt.Sprintf("连接 GitHub API 失败，请检查网络设置: %v", err),
		}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return UpdateCheckResult{
			CurrentVersion: Version,
			RepoURL:        repoURL,
			CheckedAt:      nowStr,
			ErrorMessage:   fmt.Sprintf("GitHub 返回状态异常 (%d): 可能遇到 API 请求速率限制，请稍后重试", resp.StatusCode),
		}
	}

	var tags []gitHubTagItem
	if err := json.NewDecoder(resp.Body).Decode(&tags); err != nil {
		return UpdateCheckResult{
			CurrentVersion: Version,
			RepoURL:        repoURL,
			CheckedAt:      nowStr,
			ErrorMessage:   fmt.Sprintf("解析版本数据失败: %v", err),
		}
	}

	if len(tags) == 0 {
		return UpdateCheckResult{
			CurrentVersion: Version,
			LatestVersion:  Version,
			HasUpdate:      false,
			ReleaseURL:     repoURL + "/releases",
			RepoURL:        repoURL,
			CheckedAt:      nowStr,
		}
	}

	latestTag := tags[0].Name
	hasUpdate := CompareVersions(Version, latestTag) < 0

	releaseURL := repoURL + "/releases/tag/" + latestTag

	return UpdateCheckResult{
		CurrentVersion: Version,
		LatestVersion:  latestTag,
		HasUpdate:      hasUpdate,
		ReleaseURL:     releaseURL,
		RepoURL:        repoURL,
		CheckedAt:      nowStr,
	}
}

// CompareVersions 比较两个版本号。
// 返回: -1 当 v1 < v2; 0 当 v1 == v2; 1 当 v1 > v2
func CompareVersions(v1, v2 string) int {
	clean1 := strings.TrimPrefix(strings.TrimPrefix(v1, "v"), "V")
	clean2 := strings.TrimPrefix(strings.TrimPrefix(v2, "v"), "V")

	// 处理 dev 或空情况
	if clean1 == "dev" && clean2 != "dev" {
		return -1
	}
	if clean1 != "dev" && clean2 == "dev" {
		return 1
	}

	parts1 := parseSemVer(clean1)
	parts2 := parseSemVer(clean2)

	maxLen := len(parts1)
	if len(parts2) > maxLen {
		maxLen = len(parts2)
	}

	for i := 0; i < maxLen; i++ {
		val1 := 0
		if i < len(parts1) {
			val1 = parts1[i]
		}
		val2 := 0
		if i < len(parts2) {
			val2 = parts2[i]
		}
		if val1 < val2 {
			return -1
		}
		if val1 > val2 {
			return 1
		}
	}

	return 0
}

func parseSemVer(ver string) []int {
	// 去除 pre-release 尾缀，例如 1.0.3-beta -> 1.0.3
	mainVer := strings.Split(ver, "-")[0]
	segments := strings.Split(mainVer, ".")
	res := make([]int, 0, len(segments))
	for _, s := range segments {
		n, _ := strconv.Atoi(s)
		res = append(res, n)
	}
	return res
}

// OpenBrowser 在操作系统默认浏览器中打开指定链接。
func OpenBrowser(targetURL string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", targetURL)
	case "darwin":
		cmd = exec.Command("open", targetURL)
	default:
		cmd = exec.Command("xdg-open", targetURL)
	}
	return cmd.Start()
}
