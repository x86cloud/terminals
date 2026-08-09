package main

import (
	"fmt"
	"strings"
)

// ---------- SSH 仪表盘指标数据结构与拉取解析 ----------

type SSHDiskInfo struct {
	Mount        string  `json:"mount"`
	Filesystem   string  `json:"filesystem"`
	FsType       string  `json:"fsType"`
	Total        uint64  `json:"total"`
	Used         uint64  `json:"used"`
	Available    uint64  `json:"available"`
	UsagePercent float64 `json:"usagePercent"`
	IsVirtual    bool    `json:"isVirtual"`
}

type SSHCPUInfo struct {
	UsagePercent float64   `json:"usagePercent"`
	Cores        int       `json:"cores"`
	LoadAvg      []float64 `json:"loadAvg"`
}

type SSHMemInfo struct {
	Total        uint64  `json:"total"`
	Used         uint64  `json:"used"`
	Free         uint64  `json:"free"`
	Available    uint64  `json:"available"`
	UsagePercent float64 `json:"usagePercent"`
	SwapTotal    uint64  `json:"swapTotal"`
	SwapUsed     uint64  `json:"swapUsed"`
}

type SSHNetInfo struct {
	Name       string `json:"name"`
	IP         string `json:"ip"`
	RxBytes    uint64 `json:"rxBytes"`
	TxBytes    uint64 `json:"txBytes"`
	IsLoopback bool   `json:"isLoopback"`
	IsVirtual  bool   `json:"isVirtual"`
}

type SSHDashboardInfo struct {
	Hostname string        `json:"hostname"`
	OS       string        `json:"os"`
	Uptime   string        `json:"uptime"`
	CPU      SSHCPUInfo    `json:"cpu"`
	Mem      SSHMemInfo    `json:"mem"`
	Disks    []SSHDiskInfo `json:"disks"`
	Nets     []SSHNetInfo  `json:"nets"`
}

func (m *SessionManager) GetDashboardStats(sessionID string) (*SSHDashboardInfo, error) {
	s, err := m.get(sessionID)
	if err != nil {
		return nil, err
	}
	return s.getDashboardInfo()
}

func parseProcStatCpu(line string) (total uint64, idle uint64) {
	fields := strings.Fields(line)
	if len(fields) < 5 || fields[0] != "cpu" {
		return 0, 0
	}
	var sum uint64
	for i := 1; i < len(fields); i++ {
		var val uint64
		fmt.Sscanf(fields[i], "%d", &val)
		sum += val
		if i == 4 || i == 5 { // idle & iowait
			idle += val
		}
	}
	return sum, idle
}

func formatUptime(upStr string, procUptime string) string {
	if procUptime != "" {
		fields := strings.Fields(procUptime)
		if len(fields) > 0 {
			var sec float64
			if _, err := fmt.Sscanf(fields[0], "%f", &sec); err == nil && sec > 0 {
				totalSec := int(sec)
				days := totalSec / 86400
				hours := (totalSec % 86400) / 3600
				mins := (totalSec % 3600) / 60
				if days > 0 {
					return fmt.Sprintf("%d天 %d小时 %d分", days, hours, mins)
				}
				if hours > 0 {
					return fmt.Sprintf("%d小时 %d分", hours, mins)
				}
				return fmt.Sprintf("%d分", mins)
			}
		}
	}

	if idx := strings.Index(upStr, " up "); idx != -1 {
		part := upStr[idx+4:]
		if lIdx := strings.Index(part, "load average"); lIdx != -1 {
			part = part[:lIdx]
		}
		part = strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(part), ","))
		subParts := strings.Split(part, ",")
		var kept []string
		for _, sp := range subParts {
			trimmed := strings.TrimSpace(sp)
			if strings.Contains(trimmed, "user") {
				continue
			}
			if trimmed != "" {
				kept = append(kept, trimmed)
			}
		}
		if len(kept) > 0 {
			return strings.Join(kept, ", ")
		}
	}

	return upStr
}

func (s *Session) getDashboardInfo() (*SSHDashboardInfo, error) {
	cmd := `LC_ALL=C LANG=C sh -c '
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
'`
	raw, err := s.execCombined(cmd)
	if err != nil && len(raw) == 0 {
		return nil, fmt.Errorf("获取仪表盘数据失败: %w", err)
	}

	info := &SSHDashboardInfo{
		CPU:   SSHCPUInfo{LoadAvg: []float64{0, 0, 0}, Cores: 1},
		Disks: []SSHDiskInfo{},
		Nets:  []SSHNetInfo{},
	}

	sections := make(map[string][]string)
	var currentSection string
	for _, line := range strings.Split(raw, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "===") && strings.HasSuffix(trimmed, "===") {
			currentSection = strings.Trim(trimmed, "=")
			continue
		}
		if currentSection != "" {
			sections[currentSection] = append(sections[currentSection], line)
		}
	}

	if lines, ok := sections["HOSTNAME"]; ok && len(lines) > 0 {
		info.Hostname = strings.TrimSpace(lines[0])
	}
	if lines, ok := sections["UNAME"]; ok && len(lines) > 0 {
		info.OS = strings.TrimSpace(lines[0])
	}
	var upRawStr, procUpStr string
	if lines, ok := sections["UPTIME"]; ok && len(lines) > 0 {
		upRawStr = strings.TrimSpace(lines[0])
		if idx := strings.Index(upRawStr, "load average:"); idx != -1 {
			loadPart := upRawStr[idx+len("load average:"):]
			parts := strings.Split(loadPart, ",")
			for i, p := range parts {
				if i >= 3 {
					break
				}
				var val float64
				fmt.Sscanf(strings.TrimSpace(p), "%f", &val)
				info.CPU.LoadAvg[i] = val
			}
		}
	}
	if lines, ok := sections["PROCUPTIME"]; ok && len(lines) > 0 {
		procUpStr = strings.TrimSpace(lines[0])
	}
	info.Uptime = formatUptime(upRawStr, procUpStr)
	if lines, ok := sections["CPUINFO"]; ok && len(lines) > 0 {
		var cores int
		if _, err := fmt.Sscanf(strings.TrimSpace(lines[0]), "%d", &cores); err == nil && cores > 0 {
			info.CPU.Cores = cores
		}
	}
	stat1Lines := sections["STAT1"]
	stat2Lines := sections["STAT2"]
	if len(stat1Lines) > 0 && len(stat2Lines) > 0 {
		t1, i1 := parseProcStatCpu(stat1Lines[0])
		t2, i2 := parseProcStatCpu(stat2Lines[0])
		if t2 > t1 {
			diffTotal := float64(t2 - t1)
			diffIdle := float64(i2 - i1)
			usage := (1.0 - (diffIdle / diffTotal)) * 100.0
			if usage < 0 {
				usage = 0
			}
			if usage > 100 {
				usage = 100
			}
			info.CPU.UsagePercent = usage
		}
	}

	if lines, ok := sections["MEMINFO"]; ok {
		var memTotal, memFree, memAvail, buffers, cached, swapTotal, swapFree uint64
		hasMemAvail := false
		for _, line := range lines {
			parts := strings.Fields(line)
			if len(parts) < 2 {
				continue
			}
			key := strings.TrimSuffix(parts[0], ":")
			var val uint64
			fmt.Sscanf(parts[1], "%d", &val)
			val = val * 1024

			switch key {
			case "MemTotal":
				memTotal = val
			case "MemFree":
				memFree = val
			case "MemAvailable":
				memAvail = val
				hasMemAvail = true
			case "Buffers":
				buffers = val
			case "Cached":
				cached = val
			case "SwapTotal":
				swapTotal = val
			case "SwapFree":
				swapFree = val
			}
		}

		if !hasMemAvail {
			memAvail = memFree + buffers + cached
		}
		info.Mem.Total = memTotal
		info.Mem.Available = memAvail
		if memTotal > memAvail {
			info.Mem.Used = memTotal - memAvail
		} else {
			info.Mem.Used = 0
		}
		info.Mem.Free = memFree
		if memTotal > 0 {
			info.Mem.UsagePercent = (float64(info.Mem.Used) / float64(memTotal)) * 100.0
		}
		info.Mem.SwapTotal = swapTotal
		if swapTotal > swapFree {
			info.Mem.SwapUsed = swapTotal - swapFree
		}
	}

	if lines, ok := sections["DF"]; ok {
		for i, line := range lines {
			if i == 0 || strings.TrimSpace(line) == "" {
				continue
			}
			fields := strings.Fields(line)
			if len(fields) < 5 {
				continue
			}

			var fs, fsType, mount string
			var totalBlocks, usedBlocks, availBlocks uint64
			var usagePct float64

			if len(fields) >= 7 {
				fs = fields[0]
				fsType = fields[1]
				fmt.Sscanf(fields[2], "%d", &totalBlocks)
				fmt.Sscanf(fields[3], "%d", &usedBlocks)
				fmt.Sscanf(fields[4], "%d", &availBlocks)
				pctStr := strings.TrimSuffix(fields[5], "%")
				fmt.Sscanf(pctStr, "%f", &usagePct)
				mount = fields[6]
			} else if len(fields) >= 6 {
				fs = fields[0]
				fsType = "unknown"
				fmt.Sscanf(fields[1], "%d", &totalBlocks)
				fmt.Sscanf(fields[2], "%d", &usedBlocks)
				fmt.Sscanf(fields[3], "%d", &availBlocks)
				pctStr := strings.TrimSuffix(fields[4], "%")
				fmt.Sscanf(pctStr, "%f", &usagePct)
				mount = fields[5]
			} else {
				continue
			}

			if totalBlocks == 0 {
				continue
			}

			totalBytes := totalBlocks * 1024
			usedBytes := usedBlocks * 1024
			availBytes := availBlocks * 1024

			isVirt := isVirtualFs(fs, fsType, mount)

			info.Disks = append(info.Disks, SSHDiskInfo{
				Mount:        mount,
				Filesystem:   fs,
				FsType:       fsType,
				Total:        totalBytes,
				Used:         usedBytes,
				Available:    availBytes,
				UsagePercent: usagePct,
				IsVirtual:    isVirt,
			})
		}
	}

	// Nets parsing
	netMap := make(map[string]*SSHNetInfo)

	if lines, ok := sections["IPADDR"]; ok {
		for _, line := range lines {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" {
				continue
			}
			fields := strings.Fields(trimmed)
			if len(fields) >= 4 && (fields[2] == "inet" || fields[2] == "inet6") {
				ifName := strings.TrimSuffix(fields[1], ":")
				ipAddr := fields[3]
				if idx := strings.Index(ipAddr, "/"); idx != -1 {
					ipAddr = ipAddr[:idx]
				}
				if _, exists := netMap[ifName]; !exists {
					netMap[ifName] = &SSHNetInfo{
						Name:       ifName,
						IP:         ipAddr,
						IsLoopback: ifName == "lo" || strings.HasPrefix(ifName, "lo") || ipAddr == "127.0.0.1",
						IsVirtual:  isVirtualNet(ifName),
					}
				} else {
					netMap[ifName].IP = ipAddr
				}
			}
		}
	}

	if lines, ok := sections["NETDEV"]; ok {
		for _, line := range lines {
			if !strings.Contains(line, ":") {
				continue
			}
			parts := strings.SplitN(line, ":", 2)
			if len(parts) < 2 {
				continue
			}
			ifName := strings.TrimSpace(parts[0])
			fields := strings.Fields(parts[1])
			if len(fields) >= 9 {
				var rxBytes, txBytes uint64
				fmt.Sscanf(fields[0], "%d", &rxBytes)
				fmt.Sscanf(fields[8], "%d", &txBytes)

				if netItem, exists := netMap[ifName]; exists {
					netItem.RxBytes = rxBytes
					netItem.TxBytes = txBytes
				} else {
					netMap[ifName] = &SSHNetInfo{
						Name:       ifName,
						IP:         "-",
						RxBytes:    rxBytes,
						TxBytes:    txBytes,
						IsLoopback: ifName == "lo" || strings.HasPrefix(ifName, "lo"),
						IsVirtual:  isVirtualNet(ifName),
					}
				}
			}
		}
	}

	for _, netItem := range netMap {
		info.Nets = append(info.Nets, *netItem)
	}

	return info, nil
}

func isVirtualFs(fs, fsType, mount string) bool {
	virtTypes := []string{"tmpfs", "devtmpfs", "overlay", "squashfs", "sysfs", "proc", "cgroup", "shm", "devpts", "securityfs", "pstore", "autofs", "hugetlbfs", "mqueue"}
	fsTypeLower := strings.ToLower(fsType)
	for _, vt := range virtTypes {
		if fsTypeLower == vt {
			return true
		}
	}
	mountLower := strings.ToLower(mount)
	if strings.HasPrefix(mountLower, "/dev/shm") ||
		strings.HasPrefix(mountLower, "/run") ||
		strings.HasPrefix(mountLower, "/sys") ||
		strings.HasPrefix(mountLower, "/proc") ||
		strings.HasPrefix(mountLower, "/dev/mqueue") ||
		strings.HasPrefix(mountLower, "/snap") {
		return true
	}
	return false
}

func isVirtualNet(name string) bool {
	virtPrefixes := []string{"docker", "veth", "br-", "flannel", "cni", "virbr", "tun", "tap", "kube"}
	for _, p := range virtPrefixes {
		if strings.HasPrefix(name, p) {
			return true
		}
	}
	return false
}
