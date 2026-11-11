pub mod agent;
pub mod core;
pub mod db;
pub use db::mongo;
pub use db::mysql;
pub use db::postgres;
pub use db::redis;
pub use db::sqlite;
pub mod container;
pub use container::{docker, k8s};
pub mod protocol;
pub use protocol as mqtt_api;
pub mod ssh;
pub use ssh as ssh_sftp;
pub use ssh::tunnel;
pub use core::storage;
pub mod system;

use std::sync::Arc;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{DragDropEvent, Emitter, Manager, WindowEvent};

pub struct AppState {
    pub store: Arc<core::Store>,
    pub ssh: Arc<ssh_sftp::SshManager>,
    pub redis: Arc<redis::RedisManager>,
    pub mysql: Arc<mysql::MysqlManager>,
    pub postgres: Arc<postgres::PostgresManager>,
    pub mqtt_api: Arc<mqtt_api::MqttApiManager>,
    pub mongo: Arc<mongo::MongoManager>,
    pub sqlite: Arc<sqlite::SqliteManager>,
    pub docker: Arc<docker::DockerManager>,
    pub k8s: Arc<k8s::K8sManager>,
    pub agent: Arc<agent::AgentRuntime>,
}

fn restore_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let _ = storage::ensure_dirs();
    storage::log_info("xTerminal v4 (Rust/Tauri) starting up...");

    let store = Arc::new(core::Store::new().expect("failed to initialize config store"));
    let initial_settings = store.get_settings();
    let app_state = AppState {
        store: store.clone(),
        ssh: Arc::new(ssh_sftp::SshManager::new()),
        redis: Arc::new(redis::RedisManager::new()),
        mysql: Arc::new(mysql::MysqlManager::new()),
        postgres: Arc::new(postgres::PostgresManager::new()),
        mqtt_api: Arc::new(mqtt_api::MqttApiManager::new()),
        mongo: Arc::new(mongo::MongoManager::new()),
        sqlite: Arc::new(sqlite::SqliteManager::new()),
        docker: Arc::new(docker::DockerManager::new()),
        k8s: Arc::new(k8s::K8sManager::new()),
        agent: Arc::new(agent::AgentRuntime::new(initial_settings)),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            restore_main_window(app);
        }))
        .manage(app_state)
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "显示主界面", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出程序", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &sep, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::new()
                .tooltip("xTerminal")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        restore_main_window(app);
                    }
                    "quit" => {
                        core::set_app_quitting(true);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    }
                    | TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        restore_main_window(tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon().cloned() {
                tray_builder = tray_builder.icon(icon);
            }
            let _ = tray_builder.build(app);
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                if core::is_app_quitting() {
                    return;
                }
                let app = window.app_handle();
                let close_action = app
                    .try_state::<AppState>()
                    .map(|s| s.store.get_settings().close_action)
                    .unwrap_or_else(|| "ask".to_string());

                match close_action.as_str() {
                    "minimize" => {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    "quit" => {
                        core::set_app_quitting(true);
                        app.exit(0);
                    }
                    _ => {
                        api.prevent_close();
                        restore_main_window(app);
                        let _ = app.emit("app:request-close", serde_json::Value::Null);
                    }
                }
            }
            WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) => {
                let files: Vec<String> = paths
                    .iter()
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                if !files.is_empty() {
                    let _ = window.app_handle().emit(
                        "files:dropped",
                        serde_json::json!({
                            "files": files,
                            "details": serde_json::Value::Null
                        }),
                    );
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            // 1. System & Config
            system::get_app_version,
            system::check_for_updates,
            system::open_browser,
            system::hide_window,
            system::quit_app,
            system::get_app_settings,
            system::save_app_settings,
            system::list_servers,
            system::save_server,
            system::delete_server,
            system::select_private_key,
            system::select_cert_file,
            system::list_groups,
            system::save_group,
            system::delete_group,
            system::move_server_to_group,
            system::export_servers_config,
            system::import_servers_config,
            // 2. SSH & SFTP
            ssh_sftp::list_sessions,
            ssh_sftp::ssh_connect,
            ssh_sftp::ssh_connect_with_config,
            ssh_sftp::ssh_test_connection,
            ssh_sftp::ssh_disconnect,
            ssh_sftp::ssh_send_input,
            ssh_sftp::ssh_resize_terminal,
            ssh_sftp::ssh_terminal_attach,
            ssh_sftp::ssh_dashboard_stats,
            ssh_sftp::ssh_process_list,
            ssh_sftp::ssh_kill_process,
            ssh_sftp::ssh_service_list,
            ssh_sftp::ssh_control_service,
            ssh_sftp::ssh_service_logs,
            ssh_sftp::ssh_cron_list,
            ssh_sftp::ssh_save_cron_list,
            ssh_sftp::ssh_run_cron_command,
            ssh_sftp::sftp_list_dir,
            ssh_sftp::sftp_home_dir,
            ssh_sftp::sftp_make_dir,
            ssh_sftp::sftp_remove_path,
            ssh_sftp::sftp_remove_paths,
            ssh_sftp::sftp_rename_path,
            ssh_sftp::sftp_read_remote_file,
            ssh_sftp::sftp_write_remote_file,
            ssh_sftp::sftp_choose_local_files,
            ssh_sftp::sftp_choose_local_folder,
            ssh_sftp::sftp_save_mysql_file,
            ssh_sftp::sftp_read_local_file,
            ssh_sftp::sftp_write_local_file,
            ssh_sftp::sftp_read_local_file_base64,
            ssh_sftp::sftp_estimate_upload,
            ssh_sftp::sftp_estimate_upload_data,
            ssh_sftp::sftp_upload_paths,
            ssh_sftp::sftp_upload_data,
            ssh_sftp::sftp_begin_drop_upload,
            ssh_sftp::sftp_drop_upload_mkdir,
            ssh_sftp::sftp_drop_upload_write_chunk,
            ssh_sftp::sftp_finish_drop_upload,
            ssh_sftp::sftp_download_paths,
            ssh_sftp::sftp_download_to,
            ssh_sftp::sftp_list_transfers,
            ssh_sftp::sftp_cancel_transfer,
            ssh_sftp::sftp_clear_finished_transfers,
            // 3. Redis
            redis::redis_connect,
            redis::redis_test_connection,
            redis::redis_close,
            redis::redis_select_db,
            redis::redis_keys,
            redis::redis_get,
            redis::redis_set,
            redis::redis_delete,
            redis::redis_expire,
            redis::redis_rename_key,
            redis::redis_raw,
            redis::redis_db_size,
            redis::redis_mode_info,
            redis::redis_string_append,
            redis::redis_hash_field_set,
            redis::redis_hash_field_get,
            redis::redis_hash_field_del,
            redis::redis_list_push,
            redis::redis_list_pop,
            redis::redis_set_add,
            redis::redis_set_rem,
            redis::redis_zset_add,
            redis::redis_zset_rem,
            redis::redis_pipeline,
            redis::redis_transaction,
            redis::redis_publish,
            redis::redis_subscribe,
            redis::redis_psubscribe,
            redis::redis_unsubscribe,
            redis::redis_subscriptions,
            redis::redis_keyspace_notify,
            redis::redis_queue_enqueue,
            redis::redis_queue_dequeue,
            redis::redis_queue_length,
            redis::redis_slow_log,
            redis::redis_info,
            redis::redis_monitor,
            // 4. MySQL
            mysql::mysql_connect,
            mysql::mysql_test_connection,
            mysql::mysql_close,
            mysql::mysql_databases,
            mysql::mysql_tables,
            mysql::mysql_select,
            mysql::mysql_count,
            mysql::mysql_describe,
            mysql::mysql_run,
            mysql::mysql_insert,
            mysql::mysql_update,
            mysql::mysql_delete,
            mysql::mysql_export,
            mysql::mysql_export_to_file,
            mysql::mysql_import,
            mysql::mysql_import_from_file,
            mysql::mysql_create_database,
            mysql::mysql_drop_database,
            mysql::mysql_create_table,
            mysql::mysql_drop_table,
            mysql::mysql_truncate_table,
            mysql::mysql_table_status,
            mysql::mysql_indexes,
            mysql::mysql_create_index,
            mysql::mysql_drop_index,
            mysql::mysql_users,
            mysql::mysql_grants,
            mysql::mysql_create_user,
            mysql::mysql_drop_user,
            mysql::mysql_change_user_password,
            mysql::mysql_toggle_user_lock,
            mysql::mysql_grant_privileges,
            mysql::mysql_revoke_privileges,
            mysql::mysql_revoke_all_privileges,
            mysql::mysql_status,
            mysql::mysql_variables,
            mysql::mysql_process_list,
            mysql::mysql_slow_log,
            mysql::mysql_schema,
            mysql::mysql_export_json,
            mysql::mysql_import_json,
            mysql::mysql_query_csv,
            mysql::mysql_backup,
            mysql::mysql_backup_to_file,
            // 5. PostgreSQL
            postgres::postgres_test_connection,
            postgres::postgres_connect,
            postgres::postgres_close,
            postgres::postgres_databases,
            postgres::postgres_schemas,
            postgres::postgres_tables,
            postgres::postgres_sequences,
            postgres::postgres_functions,
            postgres::postgres_describe,
            postgres::postgres_table_ddl,
            postgres::postgres_select,
            postgres::postgres_count,
            postgres::postgres_insert,
            postgres::postgres_update,
            postgres::postgres_delete,
            postgres::postgres_run,
            postgres::postgres_explain,
            postgres::postgres_sessions,
            postgres::postgres_kill_session,
            postgres::postgres_status,
            postgres::postgres_roles,
            postgres::postgres_create_role,
            postgres::postgres_update_role_password,
            postgres::postgres_drop_role,
            postgres::postgres_grant_privileges,
            postgres::postgres_create_database,
            postgres::postgres_drop_database,
            postgres::postgres_create_schema,
            postgres::postgres_drop_schema,
            postgres::postgres_create_table,
            postgres::postgres_drop_table,
            postgres::postgres_truncate_table,
            postgres::postgres_export,
            postgres::postgres_export_to_file,
            postgres::postgres_import,
            postgres::postgres_import_from_file,
            // 6. MQTT & API/WS
            mqtt_api::mqtt_connect,
            mqtt_api::mqtt_close,
            mqtt_api::mqtt_publish,
            mqtt_api::mqtt_subscribe,
            mqtt_api::mqtt_unsubscribe,
            mqtt_api::mqtt_subscriptions,
            mqtt_api::mqtt_test_connection,
            mqtt_api::api_request,
            mqtt_api::load_api_tree,
            mqtt_api::save_api_tree,
            mqtt_api::choose_import_api_file,
            mqtt_api::choose_export_api_file,
            mqtt_api::ws_connect,
            mqtt_api::ws_send,
            mqtt_api::ws_close,
            // 7. MongoDB
            mongo::mongo_connect,
            mongo::mongo_close,
            mongo::mongo_parse_uri,
            mongo::mongo_test_connection,
            mongo::mongo_health_check,
            mongo::mongo_server_status,
            mongo::mongo_client_stats,
            mongo::mongo_current_ops,
            mongo::mongo_databases,
            mongo::mongo_collections,
            mongo::mongo_create_database,
            mongo::mongo_drop_database,
            mongo::mongo_create_collection,
            mongo::mongo_drop_collection,
            mongo::mongo_rename_collection,
            mongo::mongo_collection_stats,
            mongo::mongo_infer_schema,
            mongo::mongo_get_validator,
            mongo::mongo_set_validator,
            mongo::mongo_validate_document,
            mongo::mongo_find,
            mongo::mongo_count_documents,
            mongo::mongo_distinct,
            mongo::mongo_explain,
            mongo::mongo_insert_one,
            mongo::mongo_insert_many,
            mongo::mongo_update_one,
            mongo::mongo_update_many,
            mongo::mongo_replace_one,
            mongo::mongo_delete_one,
            mongo::mongo_delete_many,
            mongo::mongo_find_one_and_update,
            mongo::mongo_bulk_write,
            mongo::mongo_aggregate,
            mongo::mongo_aggregate_explain,
            mongo::mongo_run_command,
            mongo::mongo_indexes,
            mongo::mongo_create_index,
            mongo::mongo_drop_index,
            mongo::mongo_index_stats,
            mongo::mongo_transaction,
            mongo::mongo_watch,
            mongo::mongo_unwatch,
            mongo::mongo_watch_list,
            mongo::mongo_users,
            mongo::mongo_create_user,
            mongo::mongo_update_user,
            mongo::mongo_drop_user,
            mongo::mongo_create_collection_advanced,
            mongo::mongo_clone_collection,
            mongo::mongo_get_profiling_status,
            mongo::mongo_set_profiling_status,
            mongo::mongo_slow_queries,
            // 8. SQLite
            sqlite::sqlite_open_file,
            sqlite::sqlite_connect,
            sqlite::sqlite_close,
            sqlite::sqlite_info,
            sqlite::sqlite_tables,
            sqlite::sqlite_describe,
            sqlite::sqlite_select,
            sqlite::sqlite_count,
            sqlite::sqlite_indexes,
            sqlite::sqlite_run,
            sqlite::sqlite_schema,
            // 9. Docker & Compose
            docker::docker_connect,
            docker::docker_close,
            docker::docker_test_connection,
            docker::docker_ping,
            docker::docker_get_overview,
            docker::docker_list_containers,
            docker::docker_control_container,
            docker::docker_inspect_container,
            docker::docker_get_container_logs,
            docker::docker_create_container,
            docker::docker_list_images,
            docker::docker_inspect_image,
            docker::docker_pull_image,
            docker::docker_save_image,
            docker::docker_load_image,
            docker::docker_remove_image,
            docker::docker_list_volumes,
            docker::docker_create_volume,
            docker::docker_remove_volume,
            docker::docker_list_networks,
            docker::docker_create_network,
            docker::docker_remove_network,
            docker::docker_system_prune,
            docker::docker_list_compose_stacks,
            docker::docker_get_compose_stack,
            docker::docker_deploy_compose_stack,
            docker::docker_control_compose_stack,
            docker::docker_get_compose_stack_logs,
            docker::docker_list_compose_records,
            docker::docker_get_compose_record,
            docker::docker_save_compose_record,
            docker::docker_delete_compose_record,
            docker::docker_up_compose_stack,
            docker::docker_exec_start,
            docker::docker_exec_write,
            docker::docker_exec_resize,
            docker::docker_exec_close,
            // 10. Kubernetes
            k8s::k8s_connect,
            k8s::k8s_close,
            k8s::k8s_test_connection,
            k8s::k8s_parse_kubeconfig,
            k8s::k8s_ping,
            k8s::k8s_get_overview,
            k8s::k8s_list_namespaces,
            k8s::k8s_list_nodes,
            k8s::k8s_list_pods,
            k8s::k8s_get_pod_logs,
            k8s::k8s_delete_pod,
            k8s::k8s_list_deployments,
            k8s::k8s_scale_deployment,
            k8s::k8s_restart_deployment,
            k8s::k8s_delete_deployment,
            k8s::k8s_list_services,
            k8s::k8s_delete_service,
            k8s::k8s_list_ingresses,
            k8s::k8s_delete_ingress,
            k8s::k8s_list_config_maps,
            k8s::k8s_delete_config_map,
            k8s::k8s_list_secrets,
            k8s::k8s_delete_secret,
            k8s::k8s_list_pvcs,
            k8s::k8s_delete_pvc,
            k8s::k8s_create_namespace,
            k8s::k8s_delete_namespace,
            k8s::k8s_get_resource_yaml,
            k8s::k8s_exec_start,
            k8s::k8s_exec_write,
            k8s::k8s_exec_resize,
            k8s::k8s_exec_close,
            k8s::k8s_apply_yaml,
            k8s::k8s_delete_yaml,
            k8s::k8s_list_orchestration_records,
            k8s::k8s_get_orchestration_record,
            k8s::k8s_apply_orchestration,
            k8s::k8s_offline_orchestration,
            k8s::k8s_delete_orchestration_record_only,
            // 11. AI Agent (ReAct Orchestration)
            agent::agent_get_status,
            agent::agent_run_react,
            agent::agent_stop_react,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
