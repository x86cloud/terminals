<#
.SYNOPSIS
    编译并生成 Terminal v3 的 Windows MSI 微软安装包
.DESCRIPTION
    支持 5 步向导：
    1. 协议许可 (Apache 2.0 / MIT License)
    2. 旧版本检查 (MajorUpgrade 自动升级检测)
    3. 安装位置选择 (默认 C:\Program Files\Terminal)
    4. 安装进度
    5. 结束界面 (仅创建开始菜单快捷方式，不自动运行)
#>

param (
    [string]$Version = "",
    [string]$BinaryPath = "",
    [string]$OutputDir = "dist"
)

$ErrorActionPreference = "Stop"

# 1. 确定项目根目录
$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Terminal v3 - Windows MSI 安装包打包" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 2. 提取或推断版本号 (去除前导 'v')
if ([string]::IsNullOrWhiteSpace($Version)) {
    if ($env:GITHUB_REF_NAME -match '^v?(\d+\.\d+\.\d+.*)$') {
        $Version = $Matches[1]
    } else {
        $gitTag = git describe --tags --abbrev=0 2>$null
        if ($gitTag -match '^v?(\d+\.\d+\.\d+.*)$') {
            $Version = $Matches[1]
        } else {
            $Version = "1.0.0"
        }
    }
}
# 确保 MSI 接受的四段或三段数字版本号
if ($Version -match '^(\d+\.\d+\.\d+)') {
    $MsiVersion = $Matches[1]
} else {
    $MsiVersion = "1.0.0"
}
Write-Host "[1/4] 安装包版本号: $MsiVersion (发布标号: $Version)" -ForegroundColor Green

# 3. 校验主程序二进制
if ([string]::IsNullOrWhiteSpace($BinaryPath)) {
    $candidates = @(
        "$RootDir\bin\terminal-v3.exe",
        "$RootDir\terminal-v3.exe",
        "$RootDir\bin\terminal.exe",
        "$RootDir\terminal.exe"
    )
    foreach ($cand in $candidates) {
        if (Test-Path $cand) {
            $BinaryPath = $cand
            break
        }
    }
}

if (-not (Test-Path $BinaryPath)) {
    Write-Host "[!] 未检测到编译好的二进制，正在执行 wails3 build..." -ForegroundColor Yellow
    wails3 build
    if (Test-Path "$RootDir\bin\terminal-v3.exe") {
        $BinaryPath = "$RootDir\bin\terminal-v3.exe"
    } elseif (Test-Path "$RootDir\terminal-v3.exe") {
        $BinaryPath = "$RootDir\terminal-v3.exe"
    } else {
        throw "无法找到编译后的二进制文件，请先运行 wails3 build！"
    }
}
$ResolvedBinary = (Resolve-Path $BinaryPath).Path
Write-Host "[2/4] 主程序二进制: $ResolvedBinary" -ForegroundColor Green

# 4. 检测或准备 WiX Toolset
Write-Host "[3/4] 检查 WiX Toolset 编译工具..." -ForegroundColor Green

$wixBinDir = ""
$candle = Get-Command "candle.exe" -ErrorAction SilentlyContinue
$light = Get-Command "light.exe" -ErrorAction SilentlyContinue

if (-not $candle -or -not $light) {
    # 尝试在标准路径中查找 WiX v3.11 / v3.14
    $wixPaths = @(
        "${env:ProgramFiles(x86)}\WiX Toolset v3.11\bin",
        "${env:ProgramFiles(x86)}\WiX Toolset v3.14\bin",
        "${env:ProgramFiles}\WiX Toolset v3.11\bin",
        "${env:WIX}\bin"
    )
    foreach ($p in $wixPaths) {
        if (Test-Path "$p\candle.exe") {
            $wixBinDir = $p
            $candle = "$p\candle.exe"
            $light = "$p\light.exe"
            break
        }
    }
}

# 确保输出目录存在
$TargetOutDir = Join-Path $RootDir $OutputDir
if (-not (Test-Path $TargetOutDir)) {
    New-Item -ItemType Directory -Path $TargetOutDir -Force | Out-Null
}
$OutputFile = Join-Path $TargetOutDir "terminal-v3-windows-amd64.msi"

$WxsFile = Join-Path $RootDir "build\windows\msi\Product.wxs"
$WixObjFile = Join-Path $RootDir "build\windows\msi\Product.wixobj"
$MsiSourceDir = Join-Path $RootDir "build\windows\msi"

if ($candle -and $light) {
    Write-Host "检测到 WiX v3 工具链，正在编译与链接 MSI..." -ForegroundColor Cyan
    Set-Location $MsiSourceDir

    & $candle -nologo -arch x64 `
        -dProductVersion="$MsiVersion" `
        -dBinaryPath="$ResolvedBinary" `
        -ext WixUIExtension `
        -ext WixUtilExtension `
        -out "$WixObjFile" `
        "$WxsFile"

    if ($LASTEXITCODE -ne 0) {
        throw "WiX candle 编译失败，退出码: $LASTEXITCODE"
    }

    & $light -nologo `
        -cultures:zh-CN;en-US `
        -ext WixUIExtension `
        -ext WixUtilExtension `
        -sval `
        -out "$OutputFile" `
        "$WixObjFile"

    if ($LASTEXITCODE -ne 0) {
        # 如果 zh-CN 语言包不可用，退回中立文化编译
        Write-Host "重试采用标准语言环境链接..." -ForegroundColor Yellow
        & $light -nologo `
            -ext WixUIExtension `
            -ext WixUtilExtension `
            -sval `
            -out "$OutputFile" `
            "$WixObjFile"
    }

    if ($LASTEXITCODE -ne 0) {
        throw "WiX light 链接失败，退出码: $LASTEXITCODE"
    }
} else {
    # 尝试使用 WiX v4+ dotnet tool
    $wixCmd = Get-Command "wix.exe" -ErrorAction SilentlyContinue
    if (-not $wixCmd) {
        Write-Host "未找到全局 wix，正在安装 dotnet wix 工具..." -ForegroundColor Yellow
        dotnet tool install --global wix --version 4.0.5 2>$null
        $env:PATH += ";$env:USERPROFILE\.dotnet\tools"
        $wixCmd = Get-Command "wix.exe" -ErrorAction SilentlyContinue
    }

    if ($wixCmd) {
        Write-Host "检测到 WiX v4+ 工具，正在构建 MSI..." -ForegroundColor Cyan
        Set-Location $MsiSourceDir
        wix extension add WixToolset.UI.wixext 2>$null
        wix extension add WixToolset.Util.wixext 2>$null

        wix build -arch x64 `
            -d ProductVersion="$MsiVersion" `
            -d BinaryPath="$ResolvedBinary" `
            -ext WixToolset.UI.wixext `
            -ext WixToolset.Util.wixext `
            -out "$OutputFile" `
            "$WxsFile"

        if ($LASTEXITCODE -ne 0) {
            throw "WiX v4 构建失败，退出码: $LASTEXITCODE"
        }
    } else {
        throw "系统未检测到 WiX Toolset。CI 环境中已预置 WiX，本地测试请安装 WiX 3.11 或运行: dotnet tool install --global wix"
    }
}

# 5. 完成并验证产物
Set-Location $RootDir
if (Test-Path $OutputFile) {
    $msiSize = (Get-Item $OutputFile).Length / 1MB
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "[4/4] MSI 安装包打包成功!" -ForegroundColor Green
    Write-Host "文件路径: $OutputFile" -ForegroundColor Green
    Write-Host ("文件大小: {0:N2} MB" -f $msiSize) -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
} else {
    throw "MSI 文件未成功生成！"
}
