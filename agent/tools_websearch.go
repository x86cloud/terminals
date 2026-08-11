package agent

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/components/tool/utils"
)

type WebSearchInput struct {
	Query string `json:"query" jsonschema:"description=联网搜索关键词，例如: Go 1.22 新特性"`
}

type SearchResultItem struct {
	Title   string `json:"title"`
	Snippet string `json:"snippet"`
	URL     string `json:"url"`
}

type WebSearchResult struct {
	Query   string             `json:"query"`
	Results []SearchResultItem `json:"results"`
	Source  string             `json:"source"`
}

func createWebHTTPClient() *http.Client {
	jar, _ := cookiejar.New(nil)
	return &http.Client{
		Timeout: 12 * time.Second,
		Jar:     jar,
	}
}

func searchDuckDuckGo(client *http.Client, query string) ([]SearchResultItem, int, error) {
	reqURL := "https://html.duckduckgo.com/html/?q=" + url.QueryEscape(query)
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, 0, err
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
	req.Header.Set("Sec-Ch-Ua", `"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"`)
	req.Header.Set("Sec-Ch-Ua-Mobile", "?0")
	req.Header.Set("Sec-Ch-Ua-Platform", `"Windows"`)

	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, resp.StatusCode, fmt.Errorf("DuckDuckGo HTTP status: %d", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}

	htmlContent := string(bodyBytes)
	results := parseDuckDuckGoHTML(htmlContent)
	return results, resp.StatusCode, nil
}

func parseDuckDuckGoHTML(htmlContent string) []SearchResultItem {
	var items []SearchResultItem

	linkRegex := regexp.MustCompile(`(?s)<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>`)
	snippetRegex := regexp.MustCompile(`(?s)<a[^>]*class="result__snippet"[^>]*>(.*?)</a>`)

	linkMatches := linkRegex.FindAllStringSubmatch(htmlContent, -1)
	snippetMatches := snippetRegex.FindAllStringSubmatch(htmlContent, -1)

	minLen := len(linkMatches)
	if len(snippetMatches) < minLen {
		minLen = len(snippetMatches)
	}

	for i := 0; i < minLen && len(items) < 5; i++ {
		rawURL := linkMatches[i][1]
		title := stripHTML(linkMatches[i][2])
		snippet := stripHTML(snippetMatches[i][1])

		actualURL := rawURL
		if strings.Contains(rawURL, "uddg=") {
			if parsed, err := url.Parse(rawURL); err == nil {
				if uddg := parsed.Query().Get("uddg"); uddg != "" {
					actualURL = uddg
				}
			}
		}

		if title != "" && actualURL != "" {
			items = append(items, SearchResultItem{
				Title:   title,
				Snippet: snippet,
				URL:     actualURL,
			})
		}
	}
	return items
}

func fallbackBingSearch(client *http.Client, query string) ([]SearchResultItem, error) {
	reqURL := "https://cn.bing.com/search?q=" + url.QueryEscape(query)
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Bing HTTP status: %d", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	htmlContent := string(bodyBytes)
	results := parseBingHTML(htmlContent)
	return results, nil
}

func parseBingHTML(htmlContent string) []SearchResultItem {
	var items []SearchResultItem

	algoRegex := regexp.MustCompile(`(?s)<li[^>]*class="b_algo"[^>]*>.*?<h2><a[^>]*href="([^"]+)"[^>]*>(.*?)</a></h2>(.*?)</li>`)
	snippetRegex := regexp.MustCompile(`(?s)<p[^>]*>(.*?)</p>`)

	matches := algoRegex.FindAllStringSubmatch(htmlContent, -1)
	for _, match := range matches {
		if len(items) >= 5 {
			break
		}
		rawURL := match[1]
		title := stripHTML(match[2])
		innerContent := match[3]

		snippet := ""
		if snipMatch := snippetRegex.FindStringSubmatch(innerContent); len(snipMatch) > 1 {
			snippet = stripHTML(snipMatch[1])
		}

		if title != "" && rawURL != "" {
			items = append(items, SearchResultItem{
				Title:   title,
				Snippet: snippet,
				URL:     rawURL,
			})
		}
	}

	return items
}

func stripHTML(str string) string {
	re := regexp.MustCompile(`<[^>]*>`)
	cleaned := re.ReplaceAllString(str, "")
	cleaned = strings.ReplaceAll(cleaned, "&nbsp;", " ")
	cleaned = strings.ReplaceAll(cleaned, "&quot;", "\"")
	cleaned = strings.ReplaceAll(cleaned, "&amp;", "&")
	cleaned = strings.ReplaceAll(cleaned, "&lt;", "<")
	cleaned = strings.ReplaceAll(cleaned, "&gt;", ">")
	cleaned = strings.ReplaceAll(cleaned, "&#39;", "'")
	return strings.TrimSpace(cleaned)
}

func BuildWebSearchTool(wm *WorkspaceManager) (tool.InvokableTool, error) {
	httpClient := createWebHTTPClient()

	searchFunc := func(ctx context.Context, input *WebSearchInput) (*WebSearchResult, error) {
		query := strings.TrimSpace(input.Query)
		if query == "" {
			return &WebSearchResult{Query: query, Results: []SearchResultItem{}, Source: "none"}, nil
		}

		if wm != nil {
			wm.EmitToolStart("web_search", fmt.Sprintf("🌐 正在联网搜索 [%s]...", query))
		}

		// Try Primary Engine: DuckDuckGo
		results, statusCode, err := searchDuckDuckGo(httpClient, query)
		if err == nil && statusCode == http.StatusOK && len(results) > 0 {
			return &WebSearchResult{
				Query:   query,
				Results: results,
				Source:  "DuckDuckGo",
			}, nil
		}

		// Fallback Engine: Bing Search
		bingResults, bingErr := fallbackBingSearch(httpClient, query)
		if bingErr == nil && len(bingResults) > 0 {
			return &WebSearchResult{
				Query:   query,
				Results: bingResults,
				Source:  "Bing (Fallback)",
			}, nil
		}

		return &WebSearchResult{
			Query:   query,
			Results: []SearchResultItem{},
			Source:  "empty",
		}, nil
	}

	return utils.InferTool("web_search", "在互联网上搜索实时网页信息、技术文档与最新新闻。输入搜索关键词，返回最相关的网页标题、摘要与URL链接。", searchFunc)
}
