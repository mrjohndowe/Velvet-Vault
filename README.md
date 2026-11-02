# Velvet Vault — Private Explicit Video Inventory & Media Library Manager (18+)

A fully **local** inventory and media-library management system for a private collection of lawful,
consensually produced adult media featuring adults (18+). Catalog, scan, search, filter, review,
organize, deduplicate and privately share your existing video files — **nothing is uploaded,
tracked, or sent to any external service, and original files are never moved, renamed or deleted.**

> **Runtime disclosure (competition §13):** the brief requested PHP + MySQL/SQLite on XAMPP.
> This submission is implemented in **Node.js (Next.js App Router) + PostgreSQL + Drizzle ORM**
> because that is the mandated runtime of the build environment. It is still 100% local, free,
> and can be served through XAMPP's Apache via reverse proxy (recipe below). The §19 share-code
> storage requirement is implemented exactly as specified using the **JSON file option**.

## Feature highlights

- Full inventory records: titles, paths, size, **FFprobe runtime (HH:MM:SS + human readable)**,
  resolution/fps/codec, dates, categories/subcategories, tags, studios/performers, ratings,
  reviews, private notes, favorites, bookmarks, watch status/count/progress, privacy classes,
  content warnings, duplicates, collections & playlists.
- Recursive folder scanner (MP4, MKV, AVI, MOV, WMV, WebM, M4V) with live progress, preview,
  selective import, skip-existing rescans, missing-file detection & relinking, manual entry.
- Opt-in FFmpeg thumbnails (safe default: off), custom uploads, regeneration, blur guard.
- Live dashboard computed from SQL aggregates: totals, size, runtime, watched/unwatched,
  favorites, duplicates, missing, category/format/folder storage, recent & top-rated lists.
- Combinable search/filter/sort across every requested field; gallery & table views; bulk edit.
- Duplicate review with certainty tiers (SHA-256 / name+size / size+duration) — never auto-deletes.
- HTML5 playback with speed control, position + remaining time, resume, progress tracking;
  honest format support checks; open-in-system-player for MKV/AVI/WMV.
- **Secure OTP sharing**: CSPRNG codes shown once, stored only as SHA-256 verifiers in
  `data/shares.json` (atomic writes + mutex ⇒ concurrent redemptions cannot double-claim),
  expiry, revocation re-checked on every byte-range request, rate limiting & lockouts,
  separate recipient sessions, full audit trail without secrets, management table.
- CSV export/import (validated, resumable; private notes excluded by default), full JSON
  backup/restore including share state, optional scrypt password login, CSRF protection,
  library-root path validation, dark/light themes, responsive UI, keyboard navigation.

## Install (local, no cloud)

1. Install **Node.js 20+** and **PostgreSQL 14+**.
2. Extract this ZIP (e.g. `C:\velvet-vault`).
3. `copy .env.example .env` and set `DATABASE_URL` (no credentials are shipped).
4. Create the database, then in the project folder:
   ```
   npm install
   npx drizzle-kit push      # or run the SQL in drizzle/0000_*.sql
   npm run build -- --webpack
   npm start -- --hostname 127.0.0.1 --port 3000 
   ```
5. Open **http://localhost:3000** → Settings → add your media folder as a **library root**.
6. Optional: install **FFmpeg/FFprobe** (ffmpeg.org). On Windows set full paths like
   `C:\ffmpeg\bin\ffmpeg.exe` in Settings, or add the bin folder to PATH.

## XAMPP on Windows (Apache reverse proxy)

Enable `mod_proxy`, `mod_proxy_http` in `C:\xampp\apache\conf\httpd.conf`, then in
`conf/extra/httpd-vhosts.conf`:

```
<VirtualHost *:80>
  ServerName vault.local
  ProxyPreserveHost On
  ProxyPass        / http://127.0.0.1:3000/
  ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>
```

Map `127.0.0.1 vault.local` in your hosts file, start `npm start` and Apache, browse
`http://vault.local`. Use HTTPS (Apache TLS) when sharing beyond localhost.

## Backup & restore

- **Backup & Data → Download backup**: one JSON with all tables + share verifiers/redemption state.
- **Restore from file…**: replaces current data (media files untouched); redeemed codes stay redeemed.
- CSV export/import for spreadsheets; interrupted imports are resumed by re-running (paths dedupe).

## Sample dataset

**Backup & Data → Load sample library** generates synthetic, non-explicit FFmpeg test clips with
fictional titles, a byte-identical duplicate and a deliberately missing file — so durations,
thumbnails, playback, duplicate review and missing-file reports are all exercised with real data.

## Docs, checklist, tests, troubleshooting

Open **Docs & Tests** in the app for the full installation guide, requirement→feature checklist,
24-step acceptance test plan (including all 12 sharing tests), results, troubleshooting and
known limitations. License: MIT (application code); dependency licenses listed in Docs.

---
We'll name the Windows service Video Vault.

The installer below uses NSSM to register your Node.js application as a Windows service. It also supports starting, stopping, restarting, checking status, and uninstalling.

## 1. Save as `Install-VideoVaultService.ps1`

Save it inside `D:\scripts\OptionB`.

```

param(
    [ValidateSet("Install", "Start", "Stop", "Restart", "Status", "Uninstall")]
    [string]$Action = "Install"
)

$ErrorActionPreference = "Stop"

# ==========================================
# VIDEO VAULT - WINDOWS SERVICE CONFIGURATION
# ==========================================

$ServiceName = "VideoVault"
$DisplayName = "Video Vault"
$ProjectPath = "D:\scripts\OptionB"

$DataPath = "$env:ProgramData\VideoVault"
$LogPath = "$DataPath\logs"
$NssmPath = "$DataPath\nssm.exe"

$ServiceDescription = "Video Vault Node.js Application - Port 3000"

# ==========================================
# ADMINISTRATOR CHECK
# ==========================================

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)

if (-not $principal.IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)) {
    Write-Host "Administrator privileges required." -ForegroundColor Yellow

    $scriptPath = $MyInvocation.MyCommand.Path

    Start-Process powershell.exe -Verb RunAs -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", "`"$scriptPath`"",
        "-Action", $Action
    )

    exit
}

# ==========================================
# HELPER FUNCTIONS
# ==========================================

function Write-Status($Message, $Color = "Cyan") {
    Write-Host "`n[VIDEO VAULT] $Message" -ForegroundColor $Color
}

function Get-Nssm {
    if (Test-Path $NssmPath) {
        return $NssmPath
    }

    Write-Status "Downloading NSSM..."

    New-Item -ItemType Directory -Force -Path $DataPath | Out-Null

    $zipPath = "$env:TEMP\nssm.zip"
    $extractPath = "$env:TEMP\nssm_extract"

    [Net.ServicePointManager]::SecurityProtocol = `
        [Net.SecurityProtocolType]::Tls12

    Invoke-WebRequest `
        -Uri "https://nssm.cc/release/nssm-2.24.zip" `
        -OutFile $zipPath

    Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force

    $architecture = if ([Environment]::Is64BitOperatingSystem) {
        "win64"
    } else {
        "win32"
    }

    $source = Join-Path $extractPath "nssm-2.24\$architecture\nssm.exe"

    if (!(Test-Path $source)) {
        throw "NSSM executable was not found in the downloaded archive."
    }

    Copy-Item $source $NssmPath -Force

    Remove-Item $zipPath -Force
    Remove-Item $extractPath -Recurse -Force

    return $NssmPath
}

function Get-ServiceObject {
    return Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
}

# ==========================================
# INSTALL
# ==========================================

function Install-VideoVault {

    Write-Status "Installing Video Vault..."

    if (!(Test-Path "$ProjectPath\package.json")) {
        throw "package.json not found in $ProjectPath"
    }

    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue

    if (!$npm) {
        throw "npm.cmd not found. Install Node.js and ensure it is in PATH."
    }

    $npmPath = $npm.Source

    if (!$npmPath) {
        $npmPath = $npm.Path
    }

    $nssm = Get-Nssm

    New-Item -ItemType Directory -Force -Path $LogPath | Out-Null

    # Remove existing service if already installed
    if (Get-ServiceObject) {
        Write-Status "Existing service found. Removing it..."

        & $nssm stop $ServiceName confirm 2>$null
        Start-Sleep -Seconds 2

        & $nssm remove $ServiceName confirm

        Start-Sleep -Seconds 2
    }

    # Register service
    Write-Status "Registering Windows service..."

    & $nssm install $ServiceName $env:ComSpec

    if ($LASTEXITCODE -ne 0) {
        throw "Unable to register Video Vault service."
    }

    # Configure application
    $parameters = '/d /s /c "' + '"' + $npmPath + '" start -- --port 3000"'

    & $nssm set $ServiceName DisplayName $DisplayName
    & $nssm set $ServiceName Description $ServiceDescription

    & $nssm set $ServiceName AppDirectory $ProjectPath
    & $nssm set $ServiceName AppParameters $parameters

    # Automatic startup
    & $nssm set $ServiceName Start SERVICE_AUTO_START

    # Restart if application exits
    & $nssm set $ServiceName AppExit Default Restart
    & $nssm set $ServiceName AppRestartDelay 5000

    # Logging
    & $nssm set $ServiceName AppStdout "$LogPath\stdout.log"
    & $nssm set $ServiceName AppStderr "$LogPath\stderr.log"

    & $nssm set $ServiceName AppRotateFiles 1
    & $nssm set $ServiceName AppRotateBytes 10485760

    # Start service
    Write-Status "Starting Video Vault..."

    & $nssm start $ServiceName

    Start-Sleep -Seconds 3

    Get-ServiceObject | Format-List Name, DisplayName, Status

    Write-Status "Installation completed!" Green

    Write-Host "Service: Video Vault"
    Write-Host "Project: $ProjectPath"
    Write-Host "Port:    3000"
    Write-Host "Logs:    $LogPath"
}

# ==========================================
# START
# ==========================================

function Start-VideoVault {
    $nssm = Get-Nssm
    & $nssm start $ServiceName
    Write-Status "Video Vault started." Green
}

# ==========================================
# STOP
# ==========================================

function Stop-VideoVault {
    $nssm = Get-Nssm
    & $nssm stop $ServiceName
    Write-Status "Video Vault stopped." Yellow
}

# ==========================================
# RESTART
# ==========================================

function Restart-VideoVault {
    $nssm = Get-Nssm
    & $nssm restart $ServiceName
    Write-Status "Video Vault restarted." Green
}

# ==========================================
# STATUS
# ==========================================

function Show-VideoVaultStatus {

    $service = Get-ServiceObject

    if (!$service) {
        Write-Status "Service is not installed." Red
        return
    }

    $service | Format-List Name, DisplayName, Status, StartType

    Write-Host "`nApplication URL: http://localhost:3000"
    Write-Host "Log directory:   $LogPath"

    if (Test-Path "$LogPath\stderr.log") {
        Write-Host "`nRecent errors:"
        Get-Content "$LogPath\stderr.log" -Tail 10
    }
}

# ==========================================
# UNINSTALL
# ==========================================

function Uninstall-VideoVault {

    $nssm = Get-Nssm

    Write-Status "Uninstalling Video Vault..."

    if (Get-ServiceObject) {
        & $nssm stop $ServiceName confirm 2>$null
        Start-Sleep -Seconds 2

        & $nssm remove $ServiceName confirm
    }

    Write-Status "Video Vault service removed." Green
    Write-Host "Application files and logs have been preserved."
}

# ==========================================
# ACTION ROUTER
# ==========================================

try {

    switch ($Action) {

        "Install"   { Install-VideoVault }
        "Start"     { Start-VideoVault }
        "Stop"      { Stop-VideoVault }
        "Restart"   { Restart-VideoVault }
        "Status"    { Show-VideoVaultStatus }
        "Uninstall" { Uninstall-VideoVault }

    }

}
catch {
    Write-Status "ERROR: $_" Red
    exit 1
}

```

## 2. Run the installer

Open PowerShell:

```
cd D:\scripts\OptionB

powershell -ExecutionPolicy Bypass -File .\Install-VideoVaultService.ps1
```

Administrator permission will be requested automatically.

## 3. Service management

Once installed, you can manage it using:

| Action    | Command                                             |
| --------- | --------------------------------------------------- |
| Install   | `.\Install-VideoVaultService.ps1`                   |
| Start     | `.\Install-VideoVaultService.ps1 -Action Start`     |
| Stop      | `.\Install-VideoVaultService.ps1 -Action Stop`      |
| Restart   | `.\Install-VideoVaultService.ps1 -Action Restart`   |
| Status    | `.\Install-VideoVaultService.ps1 -Action Status`    |
| Uninstall | `.\Install-VideoVaultService.ps1 -Action Uninstall` |

## 4. Expected configuration

Video Vault

Automatic startup

Windows service name

`VideoVault`

Application port

3000

Application directory

`D:\scripts\OptionB`

Application URL

`http://localhost:3000`

Log directory

`C:\ProgramData\VideoVault\logs`

Important: This runs the application through NSSM and restarts it when the process exits. It does not guarantee that the web server is healthy or accepting connections; that would require an additional HTTP health check.

The service will be called Video Vault in Windows Services (`services.msc`).