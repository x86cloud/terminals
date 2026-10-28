use crate::ssh::tunnel::exec_ssh_command;
use crate::ssh::types::{
    format_uptime, is_cron_expression, is_virtual_fs, is_virtual_net, parse_proc_stat_cpu,
    shell_quote, SSHCPUInfo, SSHCronItem, SSHDashboardInfo, SSHDiskUsage, SSHNetInterface,
    SSHProcessInfo, SSHServiceInfo,
};
use crate::AppState;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use std::collections::HashMap;
use tauri::State;

#[tauri::command]
pub async fn ssh_dashboard_stats(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<SSHDashboardInfo, String> {
    let session = state.ssh.get_session(&session_id).await?;
    let cmd = r#"LC_ALL=C LANG=C sh -c '
echo "===HOSTNAME==="; hostname 2>/dev/null || uname -n
echo "===UNAME==="; uname -sr 2>/dev/null
echo "===UPTIME==="; uptime 2>/dev/null
echo "===PROCUPTIME==="; cat /proc/uptime 2>/dev/null
echo "===STAT1==="; cat /proc/stat 2>/dev/null | head -n 1
sleep 0.2
echo "===STAT2==="; cat /proc/stat 2>/dev/null | head -n 1
echo "===CPUINFO==="; grep -c "^processor" /proc/cpuinfo 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null
echo "===MEMINFO==="; cat /proc/meminfo 2>/dev/null
echo "===DF==="; df -P -k -T 2>/dev/null || df -P -k 2>/dev/null
echo "===NETDEV==="; cat /proc/net/dev 2>/dev/null
echo "===IPADDR==="; ip -4 -o addr show 2>/dev/null || ifconfig 2>/dev/null
'"#;

    let raw = session
        .exec_combined(cmd)
        .await
        .map_err(|e| format!("获取仪表盘数据失败: {}", e))?;

    let mut info = SSHDashboardInfo {
        cpu: SSHCPUInfo {
            usage_percent: 0.0,
            cores: 1,
            load_avg: vec![0.0, 0.0, 0.0],
        },
        ..Default::default()
    };

    let mut sections: HashMap<String, Vec<String>> = HashMap::new();
    let mut current_section = String::new();
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("===") && trimmed.ends_with("===") {
            current_section = trimmed.trim_matches('=').to_string();
            continue;
        }
        if !current_section.is_empty() {
            sections
                .entry(current_section.clone())
                .or_default()
                .push(line.to_string());
        }
    }

    if let Some(lines) = sections.get("HOSTNAME") {
        if let Some(first) = lines.first() {
            info.hostname = first.trim().to_string();
        }
    }
    if let Some(lines) = sections.get("UNAME") {
        if let Some(first) = lines.first() {
            info.os = first.trim().to_string();
        }
    }

    let mut up_raw_str = String::new();
    let mut proc_up_str = String::new();
    if let Some(lines) = sections.get("UPTIME") {
        if let Some(first) = lines.first() {
            up_raw_str = first.trim().to_string();
            if let Some(idx) = up_raw_str.find("load average:") {
                let load_part = &up_raw_str[idx + "load average:".len()..];
                for (i, p) in load_part.split(',').take(3).enumerate() {
                    if let Ok(v) = p.trim().parse::<f64>() {
                        info.cpu.load_avg[i] = v;
                    }
                }
            }
        }
    }
    if let Some(lines) = sections.get("PROCUPTIME") {
        if let Some(first) = lines.first() {
            proc_up_str = first.trim().to_string();
        }
    }
    info.uptime = format_uptime(&up_raw_str, &proc_up_str);

    if let Some(lines) = sections.get("CPUINFO") {
        if let Some(first) = lines.first() {
            if let Ok(cores) = first.trim().parse::<i32>() {
                if cores > 0 {
                    info.cpu.cores = cores;
                }
            }
        }
    }

    if let (Some(s1), Some(s2)) = (sections.get("STAT1"), sections.get("STAT2")) {
        if let (Some(l1), Some(l2)) = (s1.first(), s2.first()) {
            let (t1, i1) = parse_proc_stat_cpu(l1);
            let (t2, i2) = parse_proc_stat_cpu(l2);
            if t2 > t1 {
                let diff_total = (t2 - t1) as f64;
                let diff_idle = (i2.saturating_sub(i1)) as f64;
                let usage = ((1.0 - (diff_idle / diff_total)) * 100.0).clamp(0.0, 100.0);
                info.cpu.usage_percent = usage;
            }
        }
    }

    if let Some(lines) = sections.get("MEMINFO") {
        let mut mem_total = 0u64;
        let mut mem_free = 0u64;
        let mut mem_avail = 0u64;
        let mut buffers = 0u64;
        let mut cached = 0u64;
        let mut swap_total = 0u64;
        let mut swap_free = 0u64;
        let mut has_mem_avail = false;

        for line in lines {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 2 {
                continue;
            }
            let key = parts[0].trim_end_matches(':');
            let val = parts[1].parse::<u64>().unwrap_or(0) * 1024;
            match key {
                "MemTotal" => mem_total = val,
                "MemFree" => mem_free = val,
                "MemAvailable" => {
                    mem_avail = val;
                    has_mem_avail = true;
                }
                "Buffers" => buffers = val,
                "Cached" => cached = val,
                "SwapTotal" => swap_total = val,
                "SwapFree" => swap_free = val,
                _ => {}
            }
        }

        if !has_mem_avail {
            mem_avail = mem_free + buffers + cached;
        }
        info.mem.total = mem_total;
        info.mem.available = mem_avail;
        info.mem.used = mem_total.saturating_sub(mem_avail);
        info.mem.free = mem_free;
        if mem_total > 0 {
            info.mem.usage_percent = (info.mem.used as f64 / mem_total as f64) * 100.0;
        }
        info.mem.swap_total = swap_total;
        info.mem.swap_used = swap_total.saturating_sub(swap_free);
    }

    if let Some(lines) = sections.get("DF") {
        for (i, line) in lines.iter().enumerate() {
            if i == 0 || line.trim().is_empty() {
                continue;
            }
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields.len() < 6 {
                continue;
            }
            let (fs, fs_type, total_blocks, used_blocks, avail_blocks, usage_pct, mount) =
                if fields.len() >= 7 {
                    let tb = fields[2].parse::<u64>().unwrap_or(0);
                    let ub = fields[3].parse::<u64>().unwrap_or(0);
                    let ab = fields[4].parse::<u64>().unwrap_or(0);
                    let pct = fields[5]
                        .trim_end_matches('%')
                        .parse::<f64>()
                        .unwrap_or(0.0);
                    (
                        fields[0].to_string(),
                        fields[1].to_string(),
                        tb,
                        ub,
                        ab,
                        pct,
                        fields[6].to_string(),
                    )
                } else {
                    let tb = fields[1].parse::<u64>().unwrap_or(0);
                    let ub = fields[2].parse::<u64>().unwrap_or(0);
                    let ab = fields[3].parse::<u64>().unwrap_or(0);
                    let pct = fields[4]
                        .trim_end_matches('%')
                        .parse::<f64>()
                        .unwrap_or(0.0);
                    (
                        fields[0].to_string(),
                        "unknown".to_string(),
                        tb,
                        ub,
                        ab,
                        pct,
                        fields[5].to_string(),
                    )
                };

            if total_blocks == 0 {
                continue;
            }

            let is_virt = is_virtual_fs(&fs_type, &mount);
            info.disks.push(SSHDiskUsage {
                mount,
                filesystem: fs,
                fs_type,
                total: total_blocks * 1024,
                used: used_blocks * 1024,
                available: avail_blocks * 1024,
                usage_percent: usage_pct,
                is_virtual: is_virt,
            });
        }
    }

    let mut net_map: HashMap<String, SSHNetInterface> = HashMap::new();
    let mut net_order: Vec<String> = Vec::new();

    if let Some(lines) = sections.get("IPADDR") {
        for line in lines {
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields.len() >= 4 && (fields[2] == "inet" || fields[2] == "inet6") {
                let if_name = fields[1].trim_end_matches(':').to_string();
                let ip_addr = fields[3].split('/').next().unwrap_or(fields[3]).to_string();
                if let Some(item) = net_map.get_mut(&if_name) {
                    item.ip = ip_addr;
                } else {
                    let is_lo =
                        if_name == "lo" || if_name.starts_with("lo") || ip_addr == "127.0.0.1";
                    let is_virt = is_virtual_net(&if_name);
                    net_order.push(if_name.clone());
                    net_map.insert(
                        if_name.clone(),
                        SSHNetInterface {
                            name: if_name,
                            ip: ip_addr,
                            rx_bytes: 0,
                            tx_bytes: 0,
                            is_loopback: is_lo,
                            is_virtual: is_virt,
                        },
                    );
                }
            }
        }
    }

    if let Some(lines) = sections.get("NETDEV") {
        for line in lines {
            if let Some((left, right)) = line.split_once(':') {
                let if_name = left.trim().to_string();
                let fields: Vec<&str> = right.split_whitespace().collect();
                if fields.len() >= 9 {
                    let rx_bytes = fields[0].parse::<u64>().unwrap_or(0);
                    let tx_bytes = fields[8].parse::<u64>().unwrap_or(0);
                    if let Some(item) = net_map.get_mut(&if_name) {
                        item.rx_bytes = rx_bytes;
                        item.tx_bytes = tx_bytes;
                    } else {
                        let is_lo = if_name == "lo" || if_name.starts_with("lo");
                        let is_virt = is_virtual_net(&if_name);
                        net_order.push(if_name.clone());
                        net_map.insert(
                            if_name.clone(),
                            SSHNetInterface {
                                name: if_name,
                                ip: "-".to_string(),
                                rx_bytes,
                                tx_bytes,
                                is_loopback: is_lo,
                                is_virtual: is_virt,
                            },
                        );
                    }
                }
            }
        }
    }

    for name in net_order {
        if let Some(item) = net_map.remove(&name) {
            info.nets.push(item);
        }
    }

    Ok(info)
}

#[tauri::command]
pub async fn ssh_process_list(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<SSHProcessInfo>, String> {
    let session = state.ssh.get_session(&session_id).await?;
    let cmd =
        "LC_ALL=C LANG=C ps aux --sort=-%cpu 2>/dev/null || LC_ALL=C LANG=C ps aux 2>/dev/null";
    let raw = session
        .exec_combined(cmd)
        .await
        .map_err(|e| format!("读取进程列表失败: {}", e))?;

    let mut procs = Vec::new();
    for line in raw.lines().skip(1) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let fields: Vec<&str> = trimmed.split_whitespace().collect();
        if fields.len() < 11 {
            continue;
        }
        let user = fields[0].to_string();
        let pid = fields[1].parse::<i32>().unwrap_or(0);
        if pid <= 0 {
            continue;
        }
        let cpu = fields[2].parse::<f64>().unwrap_or(0.0);
        let mem = fields[3].parse::<f64>().unwrap_or(0.0);
        let rss_kb = fields[5].parse::<u64>().unwrap_or(0);
        let command = fields[10..].join(" ");

        procs.push(SSHProcessInfo {
            pid,
            user,
            cpu,
            mem,
            rss: rss_kb * 1024,
            command,
        });

        if procs.len() >= 100 {
            break;
        }
    }

    Ok(procs)
}

#[tauri::command]
pub async fn ssh_kill_process(
    state: State<'_, AppState>,
    session_id: String,
    pid: i32,
) -> Result<(), String> {
    if pid <= 0 {
        return Err("无效的 PID".to_string());
    }
    let session = state.ssh.get_session(&session_id).await?;
    let cmd = format!("kill -9 {}", pid);
    let (out, code) = exec_ssh_command(&session.handle, &cmd).await?;
    if code != 0 {
        let msg = out.trim();
        if !msg.is_empty() {
            return Err(format!("结束进程失败: {}", msg));
        }
        return Err(format!("结束进程失败 (exit {})", code));
    }
    Ok(())
}

#[tauri::command]
pub async fn ssh_service_list(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<SSHServiceInfo>, String> {
    let session = state.ssh.get_session(&session_id).await?;
    let cmd =
        "LC_ALL=C LANG=C systemctl list-units --type=service --all --no-legend --no-pager 2>/dev/null";
    let raw = session
        .exec_combined(cmd)
        .await
        .map_err(|e| format!("读取 Systemd 服务列表失败: {}", e))?;

    let mut services = Vec::new();
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let mut fields: Vec<&str> = trimmed.split_whitespace().collect();
        while !fields.is_empty() {
            let first = fields[0];
            if first.ends_with(".service") || first.contains('.') {
                break;
            }
            fields.remove(0);
        }
        if fields.len() < 4 {
            continue;
        }
        let unit_name = fields[0].to_string();
        let load_state = fields[1].to_lowercase();
        let active_state = fields[2].to_lowercase();
        let sub_state = fields[3].to_lowercase();
        let desc = if fields.len() >= 5 {
            fields[4..].join(" ")
        } else {
            String::new()
        };

        services.push(SSHServiceInfo {
            name: unit_name,
            load: load_state,
            active: active_state,
            sub: sub_state,
            description: desc,
        });
    }

    Ok(services)
}

#[tauri::command]
pub async fn ssh_control_service(
    state: State<'_, AppState>,
    session_id: String,
    service_name: String,
    action: String,
) -> Result<(), String> {
    let service_name = service_name.trim();
    if service_name.is_empty() {
        return Err("服务名称不能为空".to_string());
    }
    match action.as_str() {
        "start" | "stop" | "restart" => {}
        _ => return Err(format!("不支持的服务指令: {}", action)),
    }
    let session = state.ssh.get_session(&session_id).await?;
    let cmd = format!(
        "systemctl {} {} 2>&1",
        action,
        shell_quote(service_name)
    );
    let (out, code) = exec_ssh_command(&session.handle, &cmd).await?;
    if code != 0 {
        let msg = out.trim();
        if !msg.is_empty() {
            return Err(format!("服务指令执行失败: {}", msg));
        }
        return Err(format!("服务指令执行失败 (exit {})", code));
    }
    Ok(())
}

#[tauri::command]
pub async fn ssh_service_logs(
    state: State<'_, AppState>,
    session_id: String,
    service_name: String,
) -> Result<String, String> {
    let service_name = service_name.trim();
    if service_name.is_empty() {
        return Err("服务名称不能为空".to_string());
    }
    let session = state.ssh.get_session(&session_id).await?;
    let quoted = shell_quote(service_name);
    let cmd = format!(
        "journalctl -u {} -n 100 --no-pager 2>&1 || systemctl status {} 2>&1",
        quoted, quoted
    );
    let out = session
        .exec_combined(&cmd)
        .await
        .map_err(|e| format!("获取服务日志失败: {}", e))?;
    if out.trim().is_empty() {
        return Ok("（暂无此服务的 journalctl 日志输出）".to_string());
    }
    Ok(out)
}

#[tauri::command]
pub async fn ssh_cron_list(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<SSHCronItem>, String> {
    let session = state.ssh.get_session(&session_id).await?;
    let (raw, code) = exec_ssh_command(&session.handle, "crontab -l 2>&1").await?;
    if code != 0 && (raw.contains("no crontab for") || raw.trim().is_empty()) {
        return Ok(Vec::new());
    }
    if code != 0 && !raw.trim().is_empty() {
        return Err(format!("读取 Crontab 失败: {}", raw.trim()));
    }

    let mut items = Vec::new();
    let mut last_comment = String::new();

    for (idx, line) in raw.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            last_comment.clear();
            continue;
        }
        if let Some(uncommented) = trimmed.strip_prefix('#') {
            let uncommented = uncommented.trim();
            let fields: Vec<&str> = uncommented.split_whitespace().collect();
            if fields.len() >= 6 && is_cron_expression(&fields[..5]) {
                let expr = fields[..5].join(" ");
                let command = fields[5..].join(" ");
                items.push(SSHCronItem {
                    id: format!("cron-{}", idx),
                    expression: expr,
                    command,
                    enabled: false,
                    comment: std::mem::take(&mut last_comment),
                });
            } else {
                last_comment = uncommented.to_string();
            }
            continue;
        }

        let fields: Vec<&str> = trimmed.split_whitespace().collect();
        if fields.len() >= 6 && is_cron_expression(&fields[..5]) {
            let expr = fields[..5].join(" ");
            let command = fields[5..].join(" ");
            items.push(SSHCronItem {
                id: format!("cron-{}", idx),
                expression: expr,
                command,
                enabled: true,
                comment: std::mem::take(&mut last_comment),
            });
        } else {
            last_comment = trimmed.to_string();
        }
    }

    Ok(items)
}

#[tauri::command]
pub async fn ssh_save_cron_list(
    state: State<'_, AppState>,
    session_id: String,
    items: Vec<SSHCronItem>,
) -> Result<(), String> {
    let session = state.ssh.get_session(&session_id).await?;
    let mut lines = Vec::new();
    for item in items {
        if !item.comment.is_empty() {
            lines.push(format!("# {}", item.comment));
        }
        if !item.expression.is_empty() && !item.command.is_empty() {
            if item.enabled {
                lines.push(format!("{} {}", item.expression, item.command));
            } else {
                lines.push(format!("# {} {}", item.expression, item.command));
            }
        }
    }

    let mut cron_content = lines.join("\n");
    if !lines.is_empty() {
        cron_content.push('\n');
    }

    let encoded = BASE64.encode(cron_content.as_bytes());
    let cmd = format!("sh -c 'echo {} | base64 -d | crontab - 2>&1'", encoded);
    let (out, code) = exec_ssh_command(&session.handle, &cmd).await?;
    if code != 0 {
        let msg = out.trim();
        if !msg.is_empty() {
            return Err(format!("更新 Crontab 失败: {}", msg));
        }
        return Err(format!("更新 Crontab 失败 (exit {})", code));
    }
    Ok(())
}

#[tauri::command]
pub async fn ssh_run_cron_command(
    state: State<'_, AppState>,
    session_id: String,
    command: String,
) -> Result<String, String> {
    let command = command.trim();
    if command.is_empty() {
        return Err("命令不能为空".to_string());
    }
    let session = state.ssh.get_session(&session_id).await?;
    let out = session
        .exec_combined(&format!("{} 2>&1", command))
        .await
        .map_err(|e| format!("执行试运行命令失败: {}", e))?;
    if out.trim().is_empty() {
        return Ok("（命令运行成功，无标准输出）".to_string());
    }
    Ok(out)
}

