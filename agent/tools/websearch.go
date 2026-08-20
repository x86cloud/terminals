package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"terminal/agent/guard"

	"github.com/cloudwego/eino/components/tool/utils"
)

type WebSearchInput struct {
	Query string `json:"query" jsonschema:"description=要在搜索引擎中检索的问题或关键词"`
}

type SearchResultItem struct {
	Title   string `json:"title"`
	Link    string `json:"link"`
	Snippet string `json:"snippet"`
}

type WebSearchOutput struct {
	Query   string             `json:"query"`
	Results []SearchResultItem `json:"results"`
}

func RegisterWebSearchTool(bus *ToolBus) error {
	searchTool, err := utils.InferTool("web_search", "使用互联网搜索引擎检索最新网页信息与技术文档",
		func(ctx context.Context, input *WebSearchInput) (*WebSearchOutput, error) {
			q := strings.TrimSpace(input.Query)
			if q == "" {
				return nil, fmt.Errorf("搜索关键词不能为空")
			}

			client := &http.Client{Timeout: 10 * time.Second}
			searchURL := fmt.Sprintf("https://api.duckduckgo.com/?q=%s&format=json&no_html=1&skip_disambig=1", url.QueryEscape(q))

			req, err := http.NewRequestWithContext(ctx, "GET", searchURL, nil)
			if err != nil {
				return nil, err
			}
			req.Header.Set("User-Agent", "xClient-Agent/2.0")

			resp, err := client.Do(req)
			if err != nil {
				// Fallback generic search result
				return &WebSearchOutput{
					Query: q,
					Results: []SearchResultItem{
						{
							Title:   fmt.Sprintf("搜索: %s", q),
							Link:    fmt.Sprintf("https://www.google.com/search?q=%s", url.QueryEscape(q)),
							Snippet: "联网搜索请求已发送，如网络受限可结合本地运维工具排查。",
						},
					},
				}, nil
			}
			defer resp.Body.Close()

			body, _ := io.ReadAll(resp.Body)
			var ddgResp struct {
				AbstractText  string `json:"AbstractText"`
				AbstractURL   string `json:"AbstractURL"`
				Heading       string `json:"Heading"`
				RelatedTopics []struct {
					Text     string `json:"Text"`
					FirstURL string `json:"FirstURL"`
				} `json:"RelatedTopics"`
			}
			_ = json.Unmarshal(body, &ddgResp)

			var results []SearchResultItem
			if ddgResp.AbstractText != "" {
				results = append(results, SearchResultItem{
					Title:   ddgResp.Heading,
					Link:    ddgResp.AbstractURL,
					Snippet: ddgResp.AbstractText,
				})
			}
			for _, rt := range ddgResp.RelatedTopics {
				if rt.Text != "" && len(results) < 5 {
					results = append(results, SearchResultItem{
						Title:   rt.Text,
						Link:    rt.FirstURL,
						Snippet: rt.Text,
					})
				}
			}

			if len(results) == 0 {
				results = append(results, SearchResultItem{
					Title:   q,
					Link:    fmt.Sprintf("https://duckduckgo.com/?q=%s", url.QueryEscape(q)),
					Snippet: fmt.Sprintf("未在即时摘要中命中明确条目，请参考官方文档进一步验证。"),
				})
			}

			return &WebSearchOutput{
				Query:   q,
				Results: results,
			}, nil
		})
	if err != nil {
		return err
	}

	bus.Register(&RegisteredTool{
		Name:        "web_search",
		Description: "使用互联网搜索引擎检索最新网页信息与技术文档",
		BaseTool:    searchTool,
		Level:       guard.LevelAllow,
	})
	return nil
}
