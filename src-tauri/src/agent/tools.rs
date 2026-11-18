use crate::agent::store::AgentBrainStore;
use crate::agent::tool::{AgentTool, ToolResult};
use crate::core::AppSettings;
use async_trait::async_trait;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{Arc, RwLock};
use std::time::Duration;
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchItem {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

fn build_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))
}

fn decode_html_entities(input: &str) -> String {
    input
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&nbsp;", " ")
}

fn strip_html_tags(input: &str) -> String {
    let re_tags = Regex::new(r"<[^>]+>").expect("valid tag regex");
    let without_tags = re_tags.replace_all(input, " ");
    let decoded = decode_html_entities(&without_tags);
    let re_ws = Regex::new(r"\s+").expect("valid ws regex");
    re_ws.replace_all(decoded.trim(), " ").to_string()
}

fn clean_ddg_url(raw_href: &str) -> String {
    let href = decode_html_entities(raw_href.trim());
    let full = if href.starts_with("//") {
        format!("https:{}", href)
    } else if href.starts_with('/') {
        format!("https://duckduckgo.com{}", href)
    } else {
        href
    };
    if let Ok(parsed) = Url::parse(&full) {
        if parsed.host_str().unwrap_or("").contains("duckduckgo.com") {
            for (k, v) in parsed.query_pairs() {
                if k == "uddg" && !v.is_empty() {
                    return v.to_string();
                }
            }
        }
    }
    full
}

async fn search_tavily(
    client: &reqwest::Client,
    api_key: &str,
    query: &str,
    max_results: usize,
) -> Result<Vec<WebSearchItem>, String> {
    let resp = client
        .post("https://api.tavily.com/search")
        .json(&json!({
            "api_key": api_key,
            "query": query,
            "max_results": max_results,
            "include_answer": false,
        }))
        .send()
        .await
        .map_err(|e| format!("Tavily 请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Tavily 返回异常状态: {}", resp.status()));
    }
    let val: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析 Tavily 响应失败: {}", e))?;
    let mut items = Vec::new();
    if let Some(arr) = val.get("results").and_then(|v| v.as_array()) {
        for r in arr.iter().take(max_results) {
            let title = r.get("title").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let url = r.get("url").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let snippet = r.get("content").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            if !url.is_empty() {
                items.push(WebSearchItem { title, url, snippet });
            }
        }
    }
    Ok(items)
}

async fn search_serper(
    client: &reqwest::Client,
    api_key: &str,
    query: &str,
    max_results: usize,
) -> Result<Vec<WebSearchItem>, String> {
    let resp = client
        .post("https://google.serper.dev/search")
        .header("X-API-KEY", api_key)
        .json(&json!({ "q": query, "num": max_results }))
        .send()
        .await
        .map_err(|e| format!("Serper 请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Serper 返回异常状态: {}", resp.status()));
    }
    let val: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析 Serper 响应失败: {}", e))?;
    let mut items = Vec::new();
    if let Some(arr) = val.get("organic").and_then(|v| v.as_array()) {
        for r in arr.iter().take(max_results) {
            let title = r.get("title").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let url = r.get("link").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let snippet = r.get("snippet").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            if !url.is_empty() {
                items.push(WebSearchItem { title, url, snippet });
            }
        }
    }
    Ok(items)
}

async fn search_searxng(
    client: &reqwest::Client,
    endpoint: &str,
    query: &str,
    max_results: usize,
) -> Result<Vec<WebSearchItem>, String> {
    let base = endpoint.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("SearXNG 服务地址不能为空".to_string());
    }
    let url = format!("{}/search", base);
    let resp = client
        .get(&url)
        .query(&[("q", query), ("format", "json")])
        .send()
        .await
        .map_err(|e| format!("SearXNG 请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("SearXNG 返回异常状态: {}", resp.status()));
    }
    let val: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析 SearXNG 响应失败: {}", e))?;
    let mut items = Vec::new();
    if let Some(arr) = val.get("results").and_then(|v| v.as_array()) {
        for r in arr.iter().take(max_results) {
            let title = r.get("title").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let url = r.get("url").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let snippet = r.get("content").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            if !url.is_empty() {
                items.push(WebSearchItem { title, url, snippet });
            }
        }
    }
    Ok(items)
}

async fn search_duckduckgo_html(
    client: &reqwest::Client,
    query: &str,
    max_results: usize,
) -> Result<Vec<WebSearchItem>, String> {
    let resp = client
        .get("https://html.duckduckgo.com/html/")
        .query(&[("q", query)])
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .send()
        .await
        .map_err(|e| format!("DuckDuckGo 搜索请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("DuckDuckGo 返回状态: {}", resp.status()));
    }
    let html = resp
        .text()
        .await
        .map_err(|e| format!("读取 DuckDuckGo 响应失败: {}", e))?;

    let re_block = Regex::new(
        r#"(?s)<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)</a>.*?(?:<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</a>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</div>)?"#,
    )
    .expect("valid ddg regex");

    let mut items = Vec::new();
    for cap in re_block.captures_iter(&html) {
        let raw_href = cap.get(1).map(|m| m.as_str()).unwrap_or("");
        let title_raw = cap.get(2).map(|m| m.as_str()).unwrap_or("");
        let snip_raw = cap
            .get(3)
            .or_else(|| cap.get(4))
            .map(|m| m.as_str())
            .unwrap_or("");

        let url = clean_ddg_url(raw_href);
        let title = strip_html_tags(title_raw);
        let snippet = strip_html_tags(snip_raw);
        if !title.is_empty() && (url.starts_with("http://") || url.starts_with("https://")) {
            items.push(WebSearchItem {
                title,
                url,
                snippet,
            });
            if items.len() >= max_results {
                break;
            }
        }
    }
    Ok(items)
}

async fn search_bing_html(
    client: &reqwest::Client,
    query: &str,
    max_results: usize,
) -> Result<Vec<WebSearchItem>, String> {
    let resp = client
        .get("https://www.bing.com/search")
        .query(&[("q", query), ("setlang", "zh-CN")])
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .send()
        .await
        .map_err(|e| format!("Bing 搜索请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Bing 返回状态: {}", resp.status()));
    }
    let html = resp
        .text()
        .await
        .map_err(|e| format!("读取 Bing 响应失败: {}", e))?;

    let re_item = Regex::new(
        r#"(?s)<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>.*?<h2[^>]*>.*?<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>.*?</h2>.*?(?:<p[^>]*>(.*?)</p>)?.*?</li>"#,
    )
    .expect("valid bing regex");

    let mut items = Vec::new();
    for cap in re_item.captures_iter(&html) {
        let url = decode_html_entities(cap.get(1).map(|m| m.as_str()).unwrap_or("").trim());
        let title = strip_html_tags(cap.get(2).map(|m| m.as_str()).unwrap_or(""));
        let snippet = strip_html_tags(cap.get(3).map(|m| m.as_str()).unwrap_or(""));
        if !title.is_empty() && (url.starts_with("http://") || url.starts_with("https://")) {
            items.push(WebSearchItem {
                title,
                url,
                snippet,
            });
            if items.len() >= max_results {
                break;
            }
        }
    }
    Ok(items)
}

pub struct WebSearchTool {
    settings: Arc<RwLock<AppSettings>>,
}

impl WebSearchTool {
    pub fn new(settings: Arc<RwLock<AppSettings>>) -> Self {
        Self { settings }
    }
}

#[async_trait]
impl AgentTool for WebSearchTool {
    fn name(&self) -> &str {
        "web_search"
    }

    fn description(&self) -> &str {
        "搜索互联网实时网页信息，返回网页标题、URL 和摘要。需要进一步阅读全文时，可配合 web_fetch 使用。"
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "搜索关键词或查询语句"
                },
                "max_results": {
                    "type": "integer",
                    "description": "返回结果数量上限（默认 6，最大 10）"
                }
            },
            "required": ["query"]
        })
    }

    async fn execute(&self, _session_id: &str, arguments: &str) -> ToolResult {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if query.is_empty() {
            return ToolResult::err("搜索关键词 query 不能为空");
        }
        let max_results = args
            .get("max_results")
            .and_then(|v| v.as_u64())
            .unwrap_or(6)
            .clamp(1, 10) as usize;

        let (provider, api_key, endpoint) = {
            let guard = self.settings.read();
            match guard {
                Ok(cfg) => (
                    cfg.ai_search_provider.trim().to_lowercase(),
                    cfg.ai_search_api_key.trim().to_string(),
                    cfg.ai_search_endpoint.trim().to_string(),
                ),
                Err(_) => ("builtin".to_string(), String::new(), String::new()),
            }
        };

        let client = match build_http_client() {
            Ok(c) => c,
            Err(e) => return ToolResult::err(e),
        };

        // Try configured external provider first if selected
        if provider == "tavily" && !api_key.is_empty() {
            match search_tavily(&client, &api_key, &query, max_results).await {
                Ok(res) if !res.is_empty() => {
                    return ToolResult::success(json!({ "provider": "tavily", "results": res }));
                }
                Ok(_) => {}
                Err(e) => return ToolResult::err(e),
            }
        } else if provider == "serper" && !api_key.is_empty() {
            match search_serper(&client, &api_key, &query, max_results).await {
                Ok(res) if !res.is_empty() => {
                    return ToolResult::success(json!({ "provider": "serper", "results": res }));
                }
                Ok(_) => {}
                Err(e) => return ToolResult::err(e),
            }
        } else if provider == "searxng" && !endpoint.is_empty() {
            match search_searxng(&client, &endpoint, &query, max_results).await {
                Ok(res) if !res.is_empty() => {
                    return ToolResult::success(json!({ "provider": "searxng", "results": res }));
                }
                Ok(_) => {}
                Err(e) => return ToolResult::err(e),
            }
        }

        // Built-in zero-config search: try Bing CN/Global & DuckDuckGo HTML
        if let Ok(items) = search_duckduckgo_html(&client, &query, max_results).await {
            if !items.is_empty() {
                return ToolResult::success(json!({
                    "provider": "duckduckgo",
                    "results": items,
                }));
            }
        }
        match search_bing_html(&client, &query, max_results).await {
            Ok(items) => ToolResult::success(json!({
                "provider": "bing",
                "results": items,
            })),
            Err(e) => ToolResult::err(format!("联网搜索失败: {}", e)),
        }
    }
}

pub struct WebFetchTool;

#[async_trait]
impl AgentTool for WebFetchTool {
    fn name(&self) -> &str {
        "web_fetch"
    }

    fn description(&self) -> &str {
        "抓取指定 HTTP/HTTPS 网页的正文纯文本内容，适合精读搜索结果页面或技术文档。"
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "要抓取的网页完整 URL（仅支持 http:// 或 https://）"
                }
            },
            "required": ["url"]
        })
    }

    async fn execute(&self, _session_id: &str, arguments: &str) -> ToolResult {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let raw_url = args
            .get("url")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let lower = raw_url.to_ascii_lowercase();
        if !lower.starts_with("http://") && !lower.starts_with("https://") {
            return ToolResult::err("仅支持抓取 http:// 或 https:// 协议的网页");
        }

        let client = match build_http_client() {
            Ok(c) => c,
            Err(e) => return ToolResult::err(e),
        };
        let resp = match client
            .get(&raw_url)
            .header("Accept", "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8")
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => return ToolResult::err(format!("请求网页失败: {}", e)),
        };

        if !resp.status().is_success() {
            return ToolResult::err(format!("网页返回异常状态: {}", resp.status()));
        }

        let bytes = match resp.bytes().await {
            Ok(b) => b,
            Err(e) => return ToolResult::err(format!("读取网页内容失败: {}", e)),
        };
        let capped = if bytes.len() > 1024 * 1024 {
            &bytes[..1024 * 1024]
        } else {
            &bytes[..]
        };
        let raw_html = String::from_utf8_lossy(capped).to_string();

        let re_title = Regex::new(r"(?is)<title[^>]*>(.*?)</title>").expect("title regex");
        let title = re_title
            .captures(&raw_html)
            .and_then(|c| c.get(1))
            .map(|m| strip_html_tags(m.as_str()))
            .unwrap_or_default();

        let mut cleaned_html = raw_html;
        for tag in ["script", "style", "noscript", "svg", "nav", "footer"] {
            let pat = format!(r"(?is)<{}[^>]*>.*?</{}>", tag, tag);
            if let Ok(re) = Regex::new(&pat) {
                cleaned_html = re.replace_all(&cleaned_html, " ").to_string();
            }
        }
        let mut text = strip_html_tags(&cleaned_html);

        const MAX_TEXT_CHARS: usize = 12000;
        if text.chars().count() > MAX_TEXT_CHARS {
            let prefix: String = text.chars().take(MAX_TEXT_CHARS).collect();
            text = format!("{}...(正文已截断)", prefix);
        }

        ToolResult::success(json!({
            "url": raw_url,
            "title": title,
            "content": text,
        }))
    }
}

pub struct KnowledgeSearchTool {
    store: Arc<AgentBrainStore>,
}

impl KnowledgeSearchTool {
    pub fn new(store: Arc<AgentBrainStore>) -> Self {
        Self { store }
    }
}

#[async_trait]
impl AgentTool for KnowledgeSearchTool {
    fn name(&self) -> &str {
        "knowledge_search"
    }

    fn description(&self) -> &str {
        "检索用户个人“第二大脑”知识库中的历史沉淀笔记与导入文档，返回匹配条目 ID、标题、标签、摘要与片段。"
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "检索关键词或问题主题"
                },
                "tag": {
                    "type": "string",
                    "description": "可选：按标签精确过滤"
                },
                "limit": {
                    "type": "integer",
                    "description": "最多返回条数（默认 5）"
                }
            },
            "required": ["query"]
        })
    }

    async fn execute(&self, _session_id: &str, arguments: &str) -> ToolResult {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
        let tag = args.get("tag").and_then(|v| v.as_str());
        let limit = args
            .get("limit")
            .and_then(|v| v.as_u64())
            .unwrap_or(5)
            .clamp(1, 20) as usize;

        match self.store.search_notes(query, tag, limit) {
            Ok(hits) => ToolResult::success(json!({ "hits": hits })),
            Err(e) => ToolResult::err(e),
        }
    }
}

pub struct KnowledgeGetTool {
    store: Arc<AgentBrainStore>,
}

impl KnowledgeGetTool {
    pub fn new(store: Arc<AgentBrainStore>) -> Self {
        Self { store }
    }
}

#[async_trait]
impl AgentTool for KnowledgeGetTool {
    fn name(&self) -> &str {
        "knowledge_get"
    }

    fn description(&self) -> &str {
        "根据知识条目 ID 读取第二大脑知识库笔记的完整 Markdown 正文与元数据。"
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "知识条目 ID"
                }
            },
            "required": ["id"]
        })
    }

    async fn execute(&self, _session_id: &str, arguments: &str) -> ToolResult {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("").trim();
        if id.is_empty() {
            return ToolResult::err("知识条目 ID 不能为空");
        }
        match self.store.get_note(id) {
            Ok(Some(note)) => ToolResult::success(json!(note)),
            Ok(None) => ToolResult::err(format!("未找到 ID 为 {} 的知识条目", id)),
            Err(e) => ToolResult::err(e),
        }
    }
}
