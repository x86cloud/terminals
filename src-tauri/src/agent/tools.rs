use crate::agent::store::AgentBrainStore;
use crate::agent::tool::{AgentTool, ToolCtx, ToolResult};
use async_trait::async_trait;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
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

#[allow(dead_code)]
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

#[allow(dead_code)]
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

#[allow(dead_code)]
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

#[derive(Default)]
pub struct WebSearchTool;

impl WebSearchTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl AgentTool for WebSearchTool {
    fn name(&self) -> &str {
        "web_search"
    }

    fn description(&self) -> &str {
        "Search the internet for real-time web pages and return titles, URLs, and snippets. Pair with `web_fetch` when you need to read the full page content."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search keywords or query string"
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default 6, max 10)"
                }
            },
            "required": ["query"]
        })
    }

    fn format_title(&self, arguments: &str) -> String {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let q = args
            .get("query")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        if q.is_empty() {
            "Searched the web".to_string()
        } else {
            format!("Searched the web for \"{}\"", q)
        }
    }

    async fn execute(&self, _ctx: &ToolCtx, arguments: &str) -> ToolResult {
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

        let client = match build_http_client() {
            Ok(c) => c,
            Err(e) => return ToolResult::err(e),
        };

        // Built-in zero-config search: DuckDuckGo HTML -> Bing fallback
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

/// Fetched and stripped web page content shared by WebFetchTool and Wiki URL ingest.
pub struct FetchedWebPage {
    pub url: String,
    pub title: String,
    pub content: String,
}

/// Fetches an HTTP/HTTPS web page and returns its stripped plain-text content.
pub async fn fetch_url_text(raw_url: &str, max_chars: usize) -> Result<FetchedWebPage, String> {
    let trimmed = raw_url.trim().to_string();
    let lower = trimmed.to_ascii_lowercase();
    if !lower.starts_with("http://") && !lower.starts_with("https://") {
        return Err("仅支持抓取 http:// 或 https:// 协议的网页".to_string());
    }

    let client = build_http_client()?;
    let resp = client
        .get(&trimmed)
        .header("Accept", "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8")
        .send()
        .await
        .map_err(|e| format!("请求网页失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("网页返回异常状态: {}", resp.status()));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取网页内容失败: {}", e))?;
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

    if max_chars > 0 && text.chars().count() > max_chars {
        let prefix: String = text.chars().take(max_chars).collect();
        text = format!("{}...(正文已截断)", prefix);
    }

    Ok(FetchedWebPage {
        url: trimmed,
        title,
        content: text,
    })
}

pub struct WebFetchTool;

#[async_trait]
impl AgentTool for WebFetchTool {
    fn name(&self) -> &str {
        "web_fetch"
    }

    fn description(&self) -> &str {
        "Fetch and extract plain-text body content from an HTTP/HTTPS web page, suitable for reading search results or technical documentation."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "Full URL of the web page to fetch (http:// or https:// only)"
                }
            },
            "required": ["url"]
        })
    }

    fn format_title(&self, arguments: &str) -> String {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let url = args.get("url").and_then(|v| v.as_str()).unwrap_or("").trim();
        if url.is_empty() {
            "Read URL".to_string()
        } else {
            format!("Read {}", url)
        }
    }

    async fn execute(&self, _ctx: &ToolCtx, arguments: &str) -> ToolResult {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let raw_url = args
            .get("url")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        match fetch_url_text(raw_url, 12000).await {
            Ok(page) => ToolResult::success(json!({
                "url": page.url,
                "title": page.title,
                "content": page.content,
            })),
            Err(e) => ToolResult::err(e),
        }
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
        "Search historical notes and imported documents in the user's personal knowledge base, returning matching IDs, titles, tags, summaries, and snippets."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search keywords or topic"
                },
                "tag": {
                    "type": "string",
                    "description": "Optional: filter by exact tag"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default 5)"
                }
            },
            "required": ["query"]
        })
    }

    async fn execute(&self, _ctx: &ToolCtx, arguments: &str) -> ToolResult {
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
        "Read the full Markdown content and metadata of a knowledge base note by its entry ID."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "Knowledge entry ID"
                }
            },
            "required": ["id"]
        })
    }

    async fn execute(&self, _ctx: &ToolCtx, arguments: &str) -> ToolResult {
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
