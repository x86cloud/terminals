pub mod api;
pub mod mqtt;

pub use api::*;
pub use mqtt::*;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct MqttApiManager {
    mqtt_conns: Mutex<HashMap<String, Arc<MqttConnEntry>>>,
    ws_conns: Mutex<HashMap<String, Arc<WsConnEntry>>>,
    pub api_tree_lock: Mutex<()>,
}

impl Default for MqttApiManager {
    fn default() -> Self {
        Self::new()
    }
}

impl MqttApiManager {
    pub fn new() -> Self {
        Self {
            mqtt_conns: Mutex::new(HashMap::new()),
            ws_conns: Mutex::new(HashMap::new()),
            api_tree_lock: Mutex::new(()),
        }
    }

    pub(crate) async fn get_mqtt(&self, id: &str) -> Result<Arc<MqttConnEntry>, String> {
        let guard = self.mqtt_conns.lock().await;
        guard
            .get(id)
            .cloned()
            .ok_or_else(|| "MQTT 连接不存在或已断开，请重新连接".to_string())
    }

    pub(crate) async fn insert_mqtt(&self, id: String, entry: Arc<MqttConnEntry>) {
        let mut guard = self.mqtt_conns.lock().await;
        guard.insert(id, entry);
    }

    pub async fn close_mqtt(&self, id: &str) {
        let removed = {
            let mut guard = self.mqtt_conns.lock().await;
            guard.remove(id)
        };
        if let Some(c) = removed {
            c.close().await;
        }
    }

    pub(crate) async fn get_ws(&self, id: &str) -> Result<Arc<WsConnEntry>, String> {
        let guard = self.ws_conns.lock().await;
        guard
            .get(id)
            .cloned()
            .ok_or_else(|| "WebSocket 连接不存在或已断开".to_string())
    }

    pub(crate) async fn insert_ws(&self, id: String, entry: Arc<WsConnEntry>) {
        let mut guard = self.ws_conns.lock().await;
        guard.insert(id, entry);
    }

    pub async fn close_ws(&self, id: &str) {
        let removed = {
            let mut guard = self.ws_conns.lock().await;
            guard.remove(id)
        };
        if let Some(c) = removed {
            c.close().await;
        }
    }

    pub async fn close_all(&self) {
        let mqtt_list: Vec<Arc<MqttConnEntry>> = {
            let mut guard = self.mqtt_conns.lock().await;
            guard.drain().map(|(_, v)| v).collect()
        };
        for c in mqtt_list {
            c.close().await;
        }

        let ws_list: Vec<Arc<WsConnEntry>> = {
            let mut guard = self.ws_conns.lock().await;
            guard.drain().map(|(_, v)| v).collect()
        };
        for c in ws_list {
            c.close().await;
        }
    }
}

