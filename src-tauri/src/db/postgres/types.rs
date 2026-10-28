use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PostgresSessionInfo {
    pub id: String,
    pub server_id: String,
    pub title: String,
    pub host: String,
    pub port: i32,
    pub database: String,
    pub schema: String,
    pub connected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PostgresQueryResult {
    pub columns: Vec<String>,
    pub column_types: Vec<String>,
    pub rows: Vec<Map<String, Value>>,
    pub affected: i64,
    pub duration_ms: i64,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PgDatabase {
    pub name: String,
    pub owner: String,
    pub encoding: String,
    pub collate: String,
    pub size: String,
    pub size_bytes: i64,
    pub table_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PgSchema {
    pub name: String,
    pub owner: String,
    pub table_count: i32,
    pub view_count: i32,
    pub function_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PgTable {
    pub name: String,
    pub schema: String,
    #[serde(rename = "type")]
    pub table_type: String,
    pub row_count: i64,
    pub total_size: String,
    pub table_size: String,
    pub index_size: String,
    pub comment: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PgColumn {
    pub name: String,
    pub ordinal_pos: i32,
    pub data_type: String,
    pub udt_name: String,
    pub is_nullable: bool,
    pub default_val: String,
    pub is_primary_key: bool,
    pub is_foreign_key: bool,
    #[serde(skip_serializing_if = "is_zero_i32")]
    pub char_max_length: i32,
    #[serde(skip_serializing_if = "is_zero_i32")]
    pub num_precision: i32,
    #[serde(skip_serializing_if = "is_zero_i32")]
    pub num_scale: i32,
    pub comment: String,
}

pub fn is_zero_i32(v: &i32) -> bool {
    *v == 0
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PgIndex {
    pub name: String,
    pub table: String,
    pub schema: String,
    pub def: String,
    pub is_primary: bool,
    pub is_unique: bool,
    pub columns: Vec<String>,
    pub size: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PgConstraint {
    pub name: String,
    #[serde(rename = "type")]
    pub constraint_type: String,
    pub def: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub foreign_table: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub foreign_schema: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub foreign_column: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PgSequence {
    pub name: String,
    pub schema: String,
    pub data_type: String,
    pub start_value: i64,
    pub min_value: i64,
    pub max_value: i64,
    pub increment: i64,
    pub current_value: i64,
    pub last_value: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PgFunction {
    pub name: String,
    pub schema: String,
    pub result_type: String,
    pub arg_types: String,
    pub arg_names: Vec<String>,
    pub language: String,
    pub def: String,
    pub comment: String,
    pub is_proc: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PgSession {
    pub pid: i32,
    pub user: String,
    pub database: String,
    pub client_addr: String,
    pub client_port: i32,
    pub backend_start: String,
    pub query_start: String,
    pub state_change: String,
    pub wait_event_type: String,
    pub wait_event: String,
    pub state: String,
    pub query: String,
    pub duration_sec: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PgRole {
    pub name: String,
    #[serde(rename = "super")]
    pub is_super: bool,
    pub inherit: bool,
    pub create_role: bool,
    pub create_db: bool,
    pub can_login: bool,
    pub replication: bool,
    pub conn_limit: i32,
    pub valid_until: String,
    pub member_of: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PgStatus {
    pub version: String,
    pub uptime: String,
    pub active_connections: i32,
    pub max_connections: i32,
    pub database_size: String,
    pub cache_hit_ratio: String,
    pub tps: i64,
    pub deadlocks: i64,
    pub temp_files: i64,
    pub temp_bytes: String,
}

