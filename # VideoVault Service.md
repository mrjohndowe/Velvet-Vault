# VideoVault Service


I'll adjust the installer to use your existing NSSM installation and install Video Vault for the current Windows user, rather than requiring administrator privileges or creating a machine-wide service.

Your NSSM executable:

`G:\apps\nssm\win64\nssm.exe`

One important distinction: Windows does not support ordinary native Windows services running independently in a user's session. For a genuinely current-user installation, the appropriate approach is a per-user Scheduled Task, with NSSM managing the Node.js process.

This gives you automatic startup at user logon without administrator privileges.

## Updated `Install-VideoVaultService.ps1`

This version:

- Uses `D:\scripts\OptionB` as the application directory.
- Runs `npm start -- --port 3000`.
- Installs under the currently logged-in Windows account.
- Starts automatically when that user logs in.
- Restarts the application if it crashes.
- Keeps stdout and stderr logs.
- Does not require administrator privileges.

NSSM note: NSSM registers Windows services, which normally requires administrator privileges. For a no-admin, per-user installation, Windows Task Scheduler is the better choice. Your NSSM installation can remain untouched.

```

param(
    [ValidateSet("Install", "Start", "Stop", "Restart", "Status", "Uninstall")]
    [string]$Action = "Install"
)

$ErrorActionPreference = "Stop"

# ==========================================
# VIDEO VAULT CONFIGURATION
# ==========================================

$TaskName    = "Video Vault"
$ProjectPath = "D:\scripts\OptionB"

$NssmPath = "G:\apps\nssm\win64\nssm.exe"

$DataPath = "$env:LOCALAPPDATA\VideoVault"
$LogPath  = "$DataPath\logs"

$WorkerPath = "$DataPath\VideoVault-Worker.ps1"
$StopFile   = "$DataPath\stop.request"
$WorkerPID  = "$DataPath\worker.pid"
$AppPID     = "$DataPath\app.pid"

$TaskPath = "\"

# ==========================================
# DISPLAY
# ==========================================

function Write-Status($Message, $Color = "Cyan") {
    Write-Host "[VIDEO VAULT] $Message" -ForegroundColor $Color
}

# ==========================================
# INITIALIZATION
# ==========================================

function Initialize-VideoVault {

    if (!(Test-Path "$ProjectPath\package.json")) {
        throw "package.json not found: $ProjectPath"
    }

    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue

    if (!$npm) {
        throw "npm.cmd not found. Install Node.js or configure PATH."
    }

    New-Item -ItemType Directory -Force -Path $DataPath | Out-Null
    New-Item -ItemType Directory -Force -Path $LogPath | Out-Null

    return $npm.Source
}

# ==========================================
# CREATE BACKGROUND WORKER
# ==========================================

function Create-Worker($NpmPath) {

$worker = @'
param(
    [string]$ProjectPath,
    [string]$NpmPath,
    [string]$DataPath
)

$ErrorActionPreference = "Continue"

$StopFile  = Join-Path $DataPath "stop.request"
$WorkerPID = Join-Path $DataPath "worker.pid"
$AppPID    = Join-Path $DataPath "app.pid"

$LogPath = Join-Path $DataPath "logs"

$Stdout = Join-Path $LogPath "stdout.log"
$Stderr = Join-Path $LogPath "stderr.log"
$WorkerLog = Join-Path $LogPath "worker.log"

Set-Content $WorkerPID $PID
Remove-Item $StopFile -Force -ErrorAction SilentlyContinue

function Log($Message) {
    Add-Content $WorkerLog "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
}

Log "Video Vault worker started."

while (!(Test-Path $StopFile)) {

    try {

        Log "Starting npm application on port 3000."

        $command = '"' + $NpmPath + '" start -- --port 3000 >> "' +
                   $Stdout + '" 2>> "' + $Stderr + '"'

        $psi = New-Object System.Diagnostics.ProcessStartInfo

        $psi.FileName = $env:ComSpec
        $psi.Arguments = '/d /s /c "' + $command + '"'
        $psi.WorkingDirectory = $ProjectPath
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true

        $process = New-Object System.Diagnostics.Process
        $process.StartInfo = $psi

        [void]$process.Start()

        Set-Content $AppPID $process.Id

        Log "Application started. PID: $($process.Id)"

        $process.WaitForExit()

        Remove-Item $AppPID -Force -ErrorAction SilentlyContinue

        Log "Application exited with code $($process.ExitCode)."

        if (Test-Path $StopFile) {
            break
        }

        Log "Restarting application in 5 seconds."

        Start-Sleep -Seconds 5

    }
    catch {

        Log "ERROR: $_"

        if (Test-Path $StopFile) {
            break
        }

        Start-Sleep -Seconds 5
    }
}

Remove-Item $AppPID -Force -ErrorAction SilentlyContinue
Remove-Item $WorkerPID -Force -ErrorAction SilentlyContinue

Log "Video Vault worker stopped."
'@

    Set-Content -Path $WorkerPath -Value $worker -Encoding UTF8
}

# ==========================================
# STOP RUNNING APPLICATION
# ==========================================

function Stop-Application {

    New-Item -ItemType File -Path $StopFile -Force | Out-Null

    if (Test-Path $AppPID) {

        $pidValue = Get-Content $AppPID -ErrorAction SilentlyContinue

        if ($pidValue -match '^\d+$') {
            Write-Status "Stopping application process..."

            & taskkill.exe /PID $pidValue /T /F 2>$null | Out-Null
        }
    }

    $task = Get-ScheduledTask -TaskName $TaskName `
        -ErrorAction SilentlyContinue

    if ($task -and $task.State -eq "Running") {
        Stop-ScheduledTask -TaskName $TaskName
    }

    Start-Sleep -Seconds 2

    if (Test-Path $WorkerPID) {

        $pidValue = Get-Content $WorkerPID -ErrorAction SilentlyContinue

        if ($pidValue -match '^\d+$') {
            & taskkill.exe /PID $pidValue /T /F 2>$null | Out-Null
        }
    }

    Remove-Item $AppPID, $WorkerPID -Force -ErrorAction SilentlyContinue

    Write-Status "Video Vault stopped." Yellow
}

# ==========================================
# INSTALL
# ==========================================

function Install-VideoVault {

    Write-Status "Installing Video Vault for current user..."

    $npmPath = Initialize-VideoVault

    Create-Worker $npmPath

    # Remove previous task if present
    $existing = Get-ScheduledTask -TaskName $TaskName `
        -ErrorAction SilentlyContinue

    if ($existing) {
        Stop-Application

        Unregister-ScheduledTask `
            -TaskName $TaskName `
            -Confirm:$false
    }

    Remove-Item $StopFile -Force -ErrorAction SilentlyContinue

    # Create task action
    $powershell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

    $arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass " +
        "-File `"$WorkerPath`" " +
        "-ProjectPath `"$ProjectPath`" " +
        "-NpmPath `"$npmPath`" " +
        "-DataPath `"$DataPath`""

    $taskAction = New-ScheduledTaskAction `
        -Execute $powershell `
        -Argument $arguments

    # Run when current user logs in
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"

    # Current user, no elevation
    $principal = New-ScheduledTaskPrincipal `
        -UserId "$env:USERDOMAIN\$env:USERNAME" `
        -LogonType Interactive `
        -RunLevel Limited

    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -MultipleInstances IgnoreNew

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $taskAction `
        -Trigger $trigger `
        -Principal $principal `
        -Settings $settings `
        -Description "Video Vault Node.js Application - Port 3000" `
        -Force | Out-Null

    Write-Status "Scheduled task registered."

    Start-ScheduledTask -TaskName $TaskName

    Start-Sleep -Seconds 3

    Write-Status "Installation completed!" Green

    Write-Host ""
    Write-Host "Name:       Video Vault"
    Write-Host "User:       $env:USERDOMAIN\$env:USERNAME"
    Write-Host "Project:    $ProjectPath"
    Write-Host "Port:       3000"
    Write-Host "URL:        http://localhost:3000"
    Write-Host "NSSM:       $NssmPath (not required for this mode)"
    Write-Host "Logs:       $LogPath"
}

# ==========================================
# START
# ==========================================

function Start-VideoVault {

    Remove-Item $StopFile -Force -ErrorAction SilentlyContinue

    Start-ScheduledTask -TaskName $TaskName

    Write-Status "Video Vault started." Green
}

# ==========================================
# STOP
# ==========================================

function Stop-VideoVault {
    Stop-Application
}

# ==========================================
# RESTART
# ==========================================

function Restart-VideoVault {

    Stop-Application

    Remove-Item $StopFile -Force -ErrorAction SilentlyContinue

    Start-ScheduledTask -TaskName $TaskName

    Write-Status "Video Vault restarted." Green
}

# ==========================================
# STATUS
# ==========================================

function Show-VideoVaultStatus {

    $task = Get-ScheduledTask -TaskName $TaskName `
        -ErrorAction SilentlyContinue

    if (!$task) {
        Write-Status "Video Vault is not installed." Red
        return
    }

    $task | Format-List TaskName, State

    Write-Host ""
    Write-Host "Application: http://localhost:3000"
    Write-Host "User:        $env:USERNAME"
    Write-Host "Logs:        $LogPath"

    if (Test-Path $AppPID) {
        Write-Host "Application PID: $(Get-Content $AppPID)"
    }

    if (Test-Path "$LogPath\stderr.log") {
        Write-Host ""
        Write-Host "Recent errors:"
        Get-Content "$LogPath\stderr.log" -Tail 10
    }
}

# ==========================================
# UNINSTALL
# ==========================================

function Uninstall-VideoVault {

    Write-Status "Uninstalling Video Vault..."

    $task = Get-ScheduledTask -TaskName $TaskName `
        -ErrorAction SilentlyContinue

    if ($task) {
        Stop-Application

        Unregister-ScheduledTask `
            -TaskName $TaskName `
            -Confirm:$false
    }

    Write-Status "Video Vault removed." Green

    Write-Host "Application files and logs were preserved."
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

## 2. Install

Run PowerShell as your normal Windows user:

```
cd D:\scripts\OptionB

powershell -ExecutionPolicy Bypass -File .\Install-VideoVaultService.ps1
```

No administrator elevation should be necessary.

## 3. Management commands

```
# Install
.\Install-VideoVaultService.ps1

# Start
.\Install-VideoVaultService.ps1 -Action Start

# Stop
.\Install-VideoVaultService.ps1 -Action Stop

# Restart
.\Install-VideoVaultService.ps1 -Action Restart

# Status
.\Install-VideoVaultService.ps1 -Action Status

# Uninstall
.\Install-VideoVaultService.ps1 -Action Uninstall
```

## 4. Installation locations

| Component       | Location                         |
| --------------- | -------------------------------- |
| Application     | `D:\scripts\OptionB`             |
| NSSM (existing) | `G:\apps\nssm\win64\nssm.exe`    |
| Worker          | `%LOCALAPPDATA%\VideoVault`      |
| Logs            | `%LOCALAPPDATA%\VideoVault\logs` |
| Windows task    | `Video Vault`                    |

One limitation: This configuration starts when your Windows user logs in, not before login. The worker handles application crashes and restarts the Node process after five seconds.