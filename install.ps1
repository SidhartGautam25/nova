# Nova Language & NVM Standalone Installer for Windows
# Usage:
#   irm https://raw.githubusercontent.com/<USER>/<REPO>/main/install.ps1 | iex
# or run locally:
#   powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   Nova Language & Virtual Machine Installer  " -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Target Directory: ~/.nova
$InstallDir = Join-Path $HOME ".nova"
$BinDir = Join-Path $InstallDir "bin"

Write-Host "Installing Nova to: $InstallDir" -ForegroundColor Yellow

# 2. Check source: local bundle or remote download
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path -ErrorAction SilentlyContinue
$LocalZip = if ($ScriptDir) { Join-Path $ScriptDir "dist\nova-sdk.zip" } else { $null }

if ($LocalZip -and (Test-Path $LocalZip)) {
    Write-Host "Extracting local package: $LocalZip" -ForegroundColor Gray
    if (Test-Path $InstallDir) {
        Remove-Item -Recurse -Force $InstallDir
    }
    Expand-Archive -Path $LocalZip -DestinationPath $InstallDir -Force
} else {
    # Remote download from GitHub repository
    # Users can set $env:NOVA_REPO_URL or defaults to repo
    $ZipUrl = if ($env:NOVA_REPO_URL) {
        $env:NOVA_REPO_URL
    } else {
        "https://github.com/ritesh/nova/releases/latest/download/nova-sdk.zip"
    }

    $TempZip = Join-Path $env:TEMP "nova-sdk.zip"
    Write-Host "Downloading Nova SDK from: $ZipUrl" -ForegroundColor Gray

    try {
        Invoke-WebRequest -Uri $ZipUrl -OutFile $TempZip -UseBasicParsing
        if (Test-Path $InstallDir) {
            Remove-Item -Recurse -Force $InstallDir
        }
        Expand-Archive -Path $TempZip -DestinationPath $InstallDir -Force
        Remove-Item -Force $TempZip -ErrorAction SilentlyContinue
    } catch {
        Write-Warning "Could not download remote zip. Falling back to local files if present..."
        if (Test-Path (Join-Path $ScriptDir "bin")) {
            Copy-Item -Recurse -Force $ScriptDir $InstallDir
        } else {
            throw $_
        }
    }
}

# 3. Add to persistent User PATH and set NOVA_HOME
Write-Host "Configuring Environment Variables..." -ForegroundColor Yellow

[Environment]::SetEnvironmentVariable("NOVA_HOME", $InstallDir, "User")
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")

if (-not ($UserPath -split ';' -contains $BinDir)) {
    $NewPath = if ($UserPath) { $UserPath.TrimEnd(';') + ';' + $BinDir } else { $BinDir }
    [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
    Write-Host "Added $BinDir to User PATH." -ForegroundColor Green
} else {
    Write-Host "$BinDir is already in your PATH." -ForegroundColor Gray
}

# Also update current session PATH
$env:PATH = "$BinDir;$env:PATH"
$env:NOVA_HOME = $InstallDir

Write-Host ""
Write-Host "Installation successful!" -ForegroundColor Green
Write-Host "----------------------------------------------" -ForegroundColor Green
Write-Host "Available commands:" -ForegroundColor White
Write-Host "  novac <file.nova>  - Compile Nova source into NVM binary" -ForegroundColor Gray
Write-Host "  nova <file.nvm>    - Execute NVM binary on Virtual Machine" -ForegroundColor Gray
Write-Host "  nova <file.nova>   - Compile and run in one step" -ForegroundColor Gray
Write-Host "----------------------------------------------" -ForegroundColor Green
Write-Host "Restart your terminal (or start using in this window) and run:" -ForegroundColor White
Write-Host "  nova --help" -ForegroundColor Cyan
Write-Host "  novac --help" -ForegroundColor Cyan

