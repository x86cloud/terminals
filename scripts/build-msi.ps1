# ============================================================
# xClient Windows MSI 打包脚本
# 使用 WiX Toolset v4 构建 MSI 安装包
# ============================================================

param (
    [string]$Version = "1.0.0",
    [switch]$BuildApp = $false
)

$ErrorActionPreference = "Stop"
$RootDir = (Get-Item $PSScriptRoot).Parent.FullName
Set-Location $RootDir

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  xClient Windows MSI 打包构建工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. 检查或构建可执行文件
$ExePath = Join-Path $RootDir "build\bin\xClient.exe"
if ($BuildApp -or !(Test-Path $ExePath)) {
    Write-Host "[1/3] 正在使用 Wails 构建 Windows 应用程序..." -ForegroundColor Yellow
    wails build -clean -webview2 download
    if (!(Test-Path $ExePath)) {
        Write-Error "构建失败：未找到 $ExePath"
        exit 1
    }
} else {
    Write-Host "[1/3] 已发现目标文件：$ExePath" -ForegroundColor Green
}

# 2. 检查 WiX 工具链
Write-Host "[2/3] 检查 WiX Toolset..." -ForegroundColor Yellow
$WixCmd = Get-Command wix -ErrorAction SilentlyContinue
if (!$WixCmd) {
    Write-Host "未找到 wix 命令，尝试通过 dotnet tool 安装 WiX..." -ForegroundColor Yellow
    dotnet tool install --global wix
    $env:PATH += ";$HOME\.dotnet\tools"
}

# 3. 编译 MSI
$MsiOutput = Join-Path $RootDir "build\bin\xClient-windows-amd64-installer.msi"
$WxsFile = Join-Path $RootDir "build\windows\msi\Product.wxs"

Write-Host "[3/3] 正在编译 MSI 安装包 (版本: $Version)..." -ForegroundColor Yellow

wix build "$WxsFile" `
    -d "Version=$Version" `
    -d "SourceDir=$RootDir" `
    -o "$MsiOutput"

if (Test-Path $MsiOutput) {
    $Size = (Get-Item $MsiOutput).Length / 1MB
    Write-Host "`n✅ MSI 安装包构建成功！" -ForegroundColor Green
    Write-Host "产物路径: $MsiOutput ($('{0:N2}' -f $Size) MB)" -ForegroundColor Cyan
} else {
    Write-Error "MSI 构建失败，请检查 WiX 日志输出。"
    exit 1
}
