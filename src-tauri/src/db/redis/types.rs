use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RedisKeyItem {
    pub key: String,
    #[serde(rename = "type")]
    pub key_type: String,
    pub ttl: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RedisKeysResult {
    pub keys: Vec<RedisKeyItem>,
    pub cursor: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RedisValue {
    pub key: String,
    #[serde(rename = "type")]
    pub key_type: String,
    pub ttl: i64,
    pub value: String,
    pub size: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_json: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RedisCmdResult {
    pub result: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RedisPipelineResult {
    pub results: Vec<RedisCmdResult>,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RedisTransactionResult {
    pub results: Vec<RedisCmdResult>,
    pub aborted: bool,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RedisQueueItem {
    pub id: String,
    pub payload: serde_json::Value,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub empty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RedisSlowLogEntry {
    pub id: i64,
    pub timestamp: i64,
    pub duration: i64,
    pub command: String,
    pub client: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RedisMonitorInfo {
    pub breaker: String,
    pub hits: i64,
    pub misses: i64,
    pub timeouts: i64,
    pub total_conns: u32,
    pub idle_conns: u32,
    pub stale_conns: u32,
    pub mode: String,
    pub serialization: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub version: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub memory_used: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub uptime_days: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub connected_clients: String,
}

