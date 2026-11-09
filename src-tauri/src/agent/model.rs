use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProfile {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub temperature: f64,
    pub context_tokens: i32,
    pub enable_multimodal: bool,
    pub enable_thinking: bool,
    pub reasoning_effort: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ToolCallItem {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub args: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: FunctionDefinition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionDefinition {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    #[serde(default)]
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tool_calls: Vec<ToolCallItem>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub images: Vec<String>,
}

impl ChatMessage {
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: "system".to_string(),
            content: content.into(),
            reasoning_content: None,
            tool_calls: Vec::new(),
            tool_call_id: None,
            name: None,
            images: Vec::new(),
        }
    }

    pub fn assistant(
        content: impl Into<String>,
        reasoning: Option<String>,
        tool_calls: Vec<ToolCallItem>,
    ) -> Self {
        Self {
            role: "assistant".to_string(),
            content: content.into(),
            reasoning_content: reasoning.filter(|r| !r.is_empty()),
            tool_calls,
            tool_call_id: None,
            name: None,
            images: Vec::new(),
        }
    }

    pub fn tool(content: impl Into<String>, tool_call_id: impl Into<String>) -> Self {
        Self {
            role: "tool".to_string(),
            content: content.into(),
            reasoning_content: None,
            tool_calls: Vec::new(),
            tool_call_id: Some(tool_call_id.into()),
            name: None,
            images: Vec::new(),
        }
    }

    pub fn to_openai_payload(&self, enable_multimodal: bool) -> Value {
        let role = self.role.to_lowercase();
        match role.as_str() {
            "assistant" => {
                let mut obj = json!({
                    "role": "assistant",
                    "content": self.content,
                });
                if let Some(ref reasoning) = self.reasoning_content {
                    if !reasoning.is_empty() {
                        obj["reasoning_content"] = json!(reasoning);
                    }
                }
                if !self.tool_calls.is_empty() {
                    let tc_list: Vec<Value> = self
                        .tool_calls
                        .iter()
                        .map(|tc| {
                            json!({
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.name,
                                    "arguments": tc.args,
                                }
                            })
                        })
                        .collect();
                    obj["tool_calls"] = json!(tc_list);
                }
                obj
            }
            "tool" => {
                json!({
                    "role": "tool",
                    "content": self.content,
                    "tool_call_id": self.tool_call_id.clone().unwrap_or_default(),
                })
            }
            "user" => {
                if enable_multimodal && !self.images.is_empty() {
                    let mut parts: Vec<Value> = Vec::new();
                    if !self.content.trim().is_empty() {
                        parts.push(json!({
                            "type": "text",
                            "text": self.content,
                        }));
                    }
                    for img in &self.images {
                        parts.push(json!({
                            "type": "image_url",
                            "image_url": {
                                "url": img
                            }
                        }));
                    }
                    json!({
                        "role": "user",
                        "content": parts,
                    })
                } else {
                    json!({
                        "role": "user",
                        "content": self.content,
                    })
                }
            }
            _ => {
                json!({
                    "role": "system",
                    "content": self.content,
                })
            }
        }
    }
}

#[derive(Debug, Default)]
pub struct TurnStreamOutput {
    pub content: String,
    pub reasoning_content: String,
    pub tool_calls: Vec<ToolCallItem>,
}

fn build_chat_completions_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else if trimmed.ends_with("/v1")
        || trimmed.contains("/compatible-mode/v1")
        || trimmed.contains("/api/v3")
    {
        format!("{}/chat/completions", trimmed)
    } else {
        format!("{}/v1/chat/completions", trimmed)
    }
}

fn normalize_chunk_delta<'a>(accumulated: &str, chunk: &'a str) -> &'a str {
    if !accumulated.is_empty() && chunk.len() > accumulated.len() && chunk.starts_with(accumulated)
    {
        &chunk[accumulated.len()..]
    } else {
        chunk
    }
}

/// Streams a single ReAct turn from an OpenAI-compatible Chat Completions endpoint.
pub async fn stream_chat_turn<FChunk, FReasoning>(
    profile: &ModelProfile,
    messages: &[ChatMessage],
    tools: &[ToolDefinition],
    cancel_flag: &Arc<AtomicBool>,
    in_think_tag: &mut bool,
    mut on_chunk: FChunk,
    mut on_reasoning: FReasoning,
) -> Result<TurnStreamOutput, String>
where
    FChunk: FnMut(&str),
    FReasoning: FnMut(&str),
{
    if cancel_flag.load(Ordering::SeqCst) {
        return Err("用户手动停止了推导".to_string());
    }

    let endpoint = build_chat_completions_url(&profile.base_url);
    let payload_messages: Vec<Value> = messages
        .iter()
        .map(|m| m.to_openai_payload(profile.enable_multimodal))
        .collect();

    let mut body = json!({
        "model": profile.model,
        "messages": payload_messages,
        "stream": true,
        "temperature": profile.temperature,
    });

    if !tools.is_empty() {
        body["tools"] = serde_json::to_value(tools).unwrap_or_else(|_| json!([]));
    }

    if profile.enable_thinking {
        let effort = profile.reasoning_effort.trim();
        if !effort.is_empty() && effort != "none" {
            body["reasoning_effort"] = json!(effort);
        }
    }

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let mut req = client
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream");

    if !profile.api_key.trim().is_empty() {
        req = req.bearer_auth(profile.api_key.trim());
    }

    let resp = req
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("大模型请求异常: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_body = resp.text().await.unwrap_or_default();
        return Err(format!("大模型接口返回错误 ({}): {}", status, err_body));
    }

    let mut stream = resp.bytes_stream();
    let mut line_buf = String::new();
    let mut turn_content = String::new();
    let mut turn_reasoning = String::new();
    let mut stream_content_acc = String::new();
    let mut stream_reasoning_acc = String::new();
    let mut tool_calls_map: BTreeMap<usize, ToolCallItem> = BTreeMap::new();

    while let Some(item) = stream.next().await {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("用户手动停止了推导".to_string());
        }

        let bytes = item.map_err(|e| format!("读取大模型流式响应异常: {}", e))?;
        let chunk_str = String::from_utf8_lossy(&bytes);
        line_buf.push_str(&chunk_str);

        while let Some(newline_idx) = line_buf.find('\n') {
            let raw_line = line_buf[..newline_idx].trim().to_string();
            line_buf.drain(..=newline_idx);

            if raw_line.is_empty() || !raw_line.starts_with("data:") {
                continue;
            }

            let data_str = raw_line["data:".len()..].trim();
            if data_str == "[DONE]" {
                break;
            }

            let parsed: Value = match serde_json::from_str(data_str) {
                Ok(v) => v,
                Err(_) => continue,
            };

            let delta = match parsed
                .get("choices")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|first| first.get("delta"))
            {
                Some(d) => d,
                None => continue,
            };

            // 1. Extract reasoning_content / thinking
            let reasoning_raw = delta
                .get("reasoning_content")
                .and_then(|v| v.as_str())
                .or_else(|| delta.get("reasoning-content").and_then(|v| v.as_str()))
                .or_else(|| delta.get("thinking").and_then(|v| v.as_str()))
                .unwrap_or("");

            if !reasoning_raw.is_empty() {
                let delta_r = normalize_chunk_delta(&stream_reasoning_acc, reasoning_raw).to_string();
                stream_reasoning_acc.push_str(&delta_r);
                if !delta_r.is_empty() {
                    turn_reasoning.push_str(&delta_r);
                    on_reasoning(&delta_r);
                }
            }

            // 2. Extract content & handle <think>...</think> tags
            let content_raw = delta
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            if !content_raw.is_empty() {
                let mut text = normalize_chunk_delta(&stream_content_acc, content_raw).to_string();
                stream_content_acc.push_str(&text);

                if !text.is_empty() {
                    if let Some(pos) = text.find("<think>") {
                        let before = &text[..pos];
                        if !before.is_empty() {
                            turn_content.push_str(before);
                            on_chunk(before);
                        }
                        *in_think_tag = true;
                        text = text[pos + "<think>".len()..].to_string();
                    }

                    if *in_think_tag {
                        if let Some(end_pos) = text.find("</think>") {
                            let think_part = &text[..end_pos];
                            if !think_part.is_empty() {
                                turn_reasoning.push_str(think_part);
                                stream_reasoning_acc.push_str(think_part);
                                on_reasoning(think_part);
                            }
                            *in_think_tag = false;
                            let after = &text[end_pos + "</think>".len()..];
                            if !after.is_empty() {
                                turn_content.push_str(after);
                                on_chunk(after);
                            }
                        } else if !text.is_empty() {
                            turn_reasoning.push_str(&text);
                            stream_reasoning_acc.push_str(&text);
                            on_reasoning(&text);
                        }
                    } else if !text.is_empty() {
                        turn_content.push_str(&text);
                        on_chunk(&text);
                    }
                }
            }

            // 3. Accumulate streaming tool_calls
            if let Some(tc_arr) = delta.get("tool_calls").and_then(|v| v.as_array()) {
                for (fallback_idx, tc_val) in tc_arr.iter().enumerate() {
                    let idx = tc_val
                        .get("index")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as usize)
                        .unwrap_or(fallback_idx);

                    let entry = tool_calls_map.entry(idx).or_default();
                    if let Some(id_str) = tc_val.get("id").and_then(|v| v.as_str()) {
                        if !id_str.is_empty() {
                            entry.id = id_str.to_string();
                        }
                    }
                    if let Some(fn_obj) = tc_val.get("function") {
                        if let Some(name_part) = fn_obj.get("name").and_then(|v| v.as_str()) {
                            entry.name.push_str(name_part);
                        }
                        if let Some(args_part) = fn_obj.get("arguments").and_then(|v| v.as_str()) {
                            entry.args.push_str(args_part);
                        }
                    }
                }
            }
        }
    }

    let mut collected_tool_calls = Vec::new();
    for (idx, mut tc) in tool_calls_map {
        if !tc.name.trim().is_empty() {
            if tc.id.trim().is_empty() {
                tc.id = format!("call_{}", idx);
            }
            collected_tool_calls.push(tc);
        }
    }

    Ok(TurnStreamOutput {
        content: turn_content,
        reasoning_content: turn_reasoning,
        tool_calls: collected_tool_calls,
    })
}

