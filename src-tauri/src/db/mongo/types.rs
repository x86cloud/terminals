use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MongoURIInfo {
    pub scheme: String,
    pub hosts: Vec<String>,
    pub username: String,
    pub password: String,
    pub database: String,
    pub auth_source: String,
    pub auth_mech: String,
    pub replica_set: String,
    pub tls: bool,
    pub srv: bool,
    pub options: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MongoQuerySpec {
    pub database: String,
    pub collection: String,
    pub filter: String,
    pub projection: String,
    pub sort: String,
    pub limit: i64,
    pub skip: i64,
    pub hint: String,
    pub collation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MongoFindResult {
    pub documents: Vec<String>,
    pub count: usize,
    pub total: i64,
    pub duration_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MongoBulkOp {
    #[serde(rename = "type")]
    pub op_type: String,
    pub filter: String,
    pub document: String,
    pub upsert: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MongoTxOp {
    #[serde(rename = "type")]
    pub op_type: String,
    pub database: String,
    pub collection: String,
    pub filter: String,
    pub document: String,
    pub upsert: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MongoRoleItem {
    pub role: String,
    pub db: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MongoCreateUserReq {
    pub user: String,
    pub pwd: String,
    pub db: String,
    pub roles: Vec<MongoRoleItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MongoUpdateUserReq {
    pub user: String,
    pub db: String,
    pub pwd: String,
    pub roles: Vec<MongoRoleItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MongoCreateCollOptions {
    pub name: String,
    pub capped: bool,
    pub size: i64,
    pub max: i64,
    pub is_timeseries: bool,
    pub time_field: String,
    pub meta_field: String,
    pub granularity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MongoCloneCollReq {
    pub source_db: String,
    pub source_coll: String,
    pub target_db: String,
    pub target_coll: String,
    pub copy_data: bool,
}

