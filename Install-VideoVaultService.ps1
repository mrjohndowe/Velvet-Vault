
param(
    [ValidateSet("Install", "Start", "Stop", "Restart", "Status", "Uninstall")]
    [string]$Action = "Install"
)

$ErrorActionPreference = "Stop"

# ============================================================
# VIDEO VAULT - NSSM WINDOWS SERVICE INSTALLER
# ============================================================

$ServiceName = "VideoVault"
$DisplayName = "Video Vault"
$ServiceDescription = "Video Vault Node.js Application - Port 3000"

$ProjectPath = "D:\scripts\OptionB"

$DataPath = Join-Path $env:ProgramData "VideoVault"
$LogPath = Join-Path $DataPath "logs"
$NssmPath = Join-Path $DataPath "nssm.exe"

$Port = 3000

# ============================================================
# ADMINISTRATOR CHECK
# ============================================================

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)

    return $principal.IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )
}

if (
    $Action -ne "Status" -and
    -not (Test-IsAdministrator)
) {
    Write-Host "`n[VIDEO VAULT] Requesting administrator privileges..." -ForegroundColor Yellow

    $scriptPath = $MyInvocation.MyCommand.Path

    if (-not $scriptPath) {
        throw "Save this script as Install-VideoVaultService.ps1 before running it."
    }

    Start-Process powershell.exe -Verb RunAs -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", "`"$scriptPath`"",
        "-Action", $Action
    )

    exit
}

# ============================================================
# STATUS OUTPUT
# ============================================================

function Write-Status {
    param(
        [string]$Message,
        [string]$Color = "Cyan"
    )

    Write-Host "`n[VIDEO VAULT] $Message" -ForegroundColor $Color
}

# ============================================================
# NSSM
# ============================================================

function Get-Nssm {

    New-Item -ItemType Directory -Force -Path $DataPath | Out-Null

    if (Test-Path $NssmPath) {
        return $NssmPath
    }

    # Reuse the NSSM executable from the user's existing installation.
    $existingNssm = "G:\apps\nssm\win64\nssm.exe"

    if (Test-Path $existingNssm) {
        Copy-Item $existingNssm $NssmPath -Force
        return $NssmPath
    }

    Write-Status "Downloading NSSM..."

    $zipPath = Join-Path $env:TEMP "nssm-2.24.zip"
    $extractPath = Join-Path $env:TEMP "nssm-2.24-extract"

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    Invoke-WebRequest `
        -Uri "https://nssm.cc/release/nssm-2.24.zip" `
        -OutFile $zipPath

    Expand-Archive -LiteralPath $zipPath -DestinationPath $extractPath -Force

    $architecture = if ([Environment]::Is64BitOperatingSystem) {
        "win64"
    }
    else {
        "win32"
    }

    $source = Join-Path $extractPath "nssm-2.24\$architecture\nssm.exe"

    if (-not (Test-Path $source)) {
        throw "NSSM executable was not found in the downloaded archive."
    }

    Copy-Item $source $NssmPath -Force

    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item $extractPath -Recurse -Force -ErrorAction SilentlyContinue

    return $NssmPath
}

# ============================================================
# NSSM COMMAND WRAPPER
# ============================================================

function Invoke-Nssm {
    param(
        [Parameter(Mandatory)]
        [string[]]$NssmArguments
    )

    & $script:Nssm @NssmArguments

    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        throw "NSSM command failed: $($NssmArguments -join ' ') (exit code $exitCode)"
    }
}

# ============================================================
# SERVICE HELPERS
# ============================================================

function Get-ServiceObject {
    return Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
}

function Show-ServiceInformation {

    $service = Get-ServiceObject

    if (-not $service) {
        Write-Status "Video Vault is not installed." Yellow
        return
    }

    $service.Refresh()

    $details = Get-CimInstance Win32_Service `
        -Filter "Name='$ServiceName'"

    Write-Host ""
    Write-Host "SERVICE INFORMATION" -ForegroundColor Cyan
    Write-Host "----------------------------------------"

    Write-Host "Name:        $($service.Name)"
    Write-Host "Display:     $($service.DisplayName)"
    Write-Host "Status:      $($service.Status)"
    Write-Host "Start type:  $($service.StartType)"
    Write-Host "Account:     $($details.StartName)"
    Write-Host "Project:     $ProjectPath"
    Write-Host "Port:        $Port"
    Write-Host "URL:         http://127.0.0.1:$Port/vault"
    Write-Host "Logs:        $LogPath"

    Write-Host "----------------------------------------"
}

# ============================================================
# SERVICE ACCOUNT SELECTION
# ============================================================

function Select-ServiceAccount {

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "       VIDEO VAULT SERVICE SETUP" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan

    Write-Host ""
    Write-Host "[1] Current Windows user (recommended)"
    Write-Host "[2] LocalSystem (built-in Windows account)"
    Write-Host ""

    do {
        $choice = Read-Host "Choose service account (1 or 2)"
    }
    until ($choice -in @("1", "2"))

    if ($choice -eq "2") {

        return [PSCustomObject]@{
            Mode = "LocalSystem"
            User = "LocalSystem"
            Password = $null
        }
    }

    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name

    Write-Host ""
    Write-Host "Selected account: $currentUser" -ForegroundColor Green
    Write-Host ""
    Write-Host "Enter the actual Windows account password." -ForegroundColor Yellow
    Write-Host "Do not enter your Windows Hello PIN."
    Write-Host ""

    $securePassword = Read-Host "Windows account password" -AsSecureString

    if ($securePassword.Length -eq 0) {
        throw "A password is required for a Windows user service account."
    }

    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
        $securePassword
    )

    try {
        $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
            $passwordPointer
        )
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }

    return [PSCustomObject]@{
        Mode = "CurrentUser"
        User = $currentUser
        Password = $plainPassword
    }
}

# ============================================================
# CHECK APPLICATION
# ============================================================

function Test-Application {

    if (-not (Test-Path (Join-Path $ProjectPath "package.json"))) {
        throw "package.json not found in $ProjectPath"
    }

    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue

    if (-not $nodeCommand) {
        throw "node.exe was not found. Install Node.js or add it to PATH."
    }

    $script:NodePath = $nodeCommand.Source

    if (-not $script:NodePath) {
        $script:NodePath = $nodeCommand.Path
    }

    $script:NextCli = Join-Path $ProjectPath "node_modules\next\dist\bin\next"

    if (-not (Test-Path $script:NextCli)) {
        throw "Next.js CLI not found. Run npm install in $ProjectPath."
    }

    if (-not (Test-Path (Join-Path $ProjectPath ".next\BUILD_ID"))) {
        throw "Production build missing. Run npm run build before installing."
    }
}

# ============================================================
# WAIT FOR APPLICATION
# ============================================================

function Wait-ForApplication {

    Write-Status "Waiting for Video Vault to become available..."

    for ($i = 1; $i -le 30; $i++) {

        $service = Get-ServiceObject

        if ($service) {
            $service.Refresh()

            if ($service.Status -eq "Running") {

                $client = [System.Net.Sockets.TcpClient]::new()

                try {
                    $async = $client.BeginConnect(
                        "127.0.0.1",
                        $Port,
                        $null,
                        $null
                    )

                    if ($async.AsyncWaitHandle.WaitOne(1000, $false)) {
                        $client.EndConnect($async)
                        $client.Close()
                        return $true
                    }
                }
                catch {
                    # Port is not available yet.
                }
                finally {
                    $client.Dispose()
                }
            }
        }

        Start-Sleep -Seconds 1
    }

    return $false
}

# ============================================================
# INSTALL
# ============================================================

function Install-VideoVault {

    Write-Status "Installing Video Vault..."

    Test-Application

    $script:Nssm = Get-Nssm

    New-Item -ItemType Directory -Force -Path $LogPath | Out-Null

    $account = Select-ServiceAccount

    try {

        # Remove previous installation.
        if (Get-ServiceObject) {

            Write-Status "Removing existing VideoVault service..."

            & $script:Nssm stop $ServiceName confirm 2>$null | Out-Null

            Start-Sleep -Seconds 2

            & $script:Nssm remove $ServiceName confirm

            if ($LASTEXITCODE -ne 0) {
                throw "Unable to remove existing VideoVault service."
            }

            Start-Sleep -Seconds 2
        }

        # Register the service.
        Write-Status "Registering Windows service..."

        & $script:Nssm install $ServiceName $script:NodePath

        if ($LASTEXITCODE -ne 0) {
            throw "Unable to register VideoVault service."
        }

        # Launch Next.js directly, avoiding cmd.exe/npm.cmd quoting.
        $parameters = '"' + $script:NextCli + '" start --hostname 127.0.0.1 --port ' + $Port

        Invoke-Nssm -NssmArguments @(
            "set", $ServiceName, "DisplayName", $DisplayName
        )

        Invoke-Nssm -NssmArguments @(
            "set", $ServiceName, "Description", $ServiceDescription
        )

        Invoke-Nssm -NssmArguments @(
            "set", $ServiceName, "AppDirectory", $ProjectPath
        )

        Invoke-Nssm -NssmArguments @(
            "set", $ServiceName, "AppParameters", $parameters
        )

        # Automatic startup.
        Invoke-Nssm -NssmArguments @(
            "set", $ServiceName, "Start", "SERVICE_AUTO_START"
        )

        # Restart application after unexpected exits.
        Invoke-Nssm -NssmArguments @(
            "set", $ServiceName, "AppExit", "Default", "Restart"
        )

        Invoke-Nssm -NssmArguments @(
            "set", $ServiceName, "AppRestartDelay", "5000"
        )

        # Logging.
        Invoke-Nssm -NssmArguments @(
            "set", $ServiceName, "AppStdout",
            (Join-Path $LogPath "stdout.log")
        )

        Invoke-Nssm -NssmArguments @(
            "set", $ServiceName, "AppStderr",
            (Join-Path $LogPath "stderr.log")
        )

        Invoke-Nssm -NssmArguments @(
            "set", $ServiceName, "AppRotateFiles", "1"
        )

        Invoke-Nssm -NssmArguments @(
            "set", $ServiceName, "AppRotateBytes", "10485760"
        )

        # Service account.
        if ($account.Mode -eq "LocalSystem") {

            Invoke-Nssm -NssmArguments @(
                "set", $ServiceName, "ObjectName", "LocalSystem"
            )
        }
        else {

            Invoke-Nssm -NssmArguments @(
                "set", $ServiceName, "ObjectName",
                $account.User, $account.Password
            )
        }

        Write-Status "Starting Video Vault..."

        & $script:Nssm start $ServiceName

        Start-Sleep -Seconds 2

        if (-not (Wait-ForApplication)) {

            Write-Status "Video Vault failed to become available." Red

            if (Test-Path (Join-Path $LogPath "stderr.log")) {
                Write-Host "`n--- STDERR ---" -ForegroundColor Yellow
                Get-Content (Join-Path $LogPath "stderr.log") -Tail 60
            }

            if (Test-Path (Join-Path $LogPath "stdout.log")) {
                Write-Host "`n--- STDOUT ---" -ForegroundColor Yellow
                Get-Content (Join-Path $LogPath "stdout.log") -Tail 40
            }

            throw "Video Vault did not become available on port $Port."
        }

        Write-Status "Video Vault installed and running successfully!" Green

        Show-ServiceInformation

        Write-Host ""
        Write-Host "Application: http://127.0.0.1:3000/vault"
        Write-Host "Logs:        $LogPath"
        Write-Host ""
        Write-Host "Automatic restart: Enabled"
        Write-Host "Automatic startup: Enabled"

        Write-Host ""
        Write-Host "IMPORTANT: Mapped drives such as G: and B: may not be visible"
        Write-Host "inside a Windows service session, even when using your account."
        Write-Host "Use local volume paths or UNC paths where possible." -ForegroundColor Yellow
    }
    finally {
        # Clear the temporary plaintext password variable.
        $account.Password = $null
        $plainPassword = $null
    }
}

# ============================================================
# START
# ============================================================

function Start-VideoVault {

    $script:Nssm = Get-Nssm

    Invoke-Nssm -NssmArguments @("start", $ServiceName)

    if (-not (Wait-ForApplication)) {
        throw "Video Vault did not become available on port $Port."
    }

    Write-Status "Video Vault started successfully." Green
}

# ============================================================
# STOP
# ============================================================

function Stop-VideoVault {

    $script:Nssm = Get-Nssm

    Invoke-Nssm -NssmArguments @("stop", $ServiceName, "confirm")

    Write-Status "Video Vault stopped." Yellow
}

# ============================================================
# RESTART
# ============================================================

function Restart-VideoVault {

    $script:Nssm = Get-Nssm

    Invoke-Nssm -NssmArguments @("restart", $ServiceName)

    if (-not (Wait-ForApplication)) {
        throw "Video Vault did not become available after restart."
    }

    Write-Status "Video Vault restarted successfully." Green
}

# ============================================================
# STATUS
# ============================================================

function Show-VideoVaultStatus {

    Show-ServiceInformation

    if (Test-Path (Join-Path $LogPath "stderr.log")) {

        Write-Host "`nRECENT ERRORS" -ForegroundColor Yellow

        Get-Content (Join-Path $LogPath "stderr.log") -Tail 30
    }
}

# ============================================================
# UNINSTALL
# ============================================================

function Uninstall-VideoVault {

    $script:Nssm = Get-Nssm

    Write-Status "Uninstalling Video Vault..."

    if (Get-ServiceObject) {

        & $script:Nssm stop $ServiceName confirm 2>$null | Out-Null

        Start-Sleep -Seconds 2

        & $script:Nssm remove $ServiceName confirm

        if ($LASTEXITCODE -ne 0) {
            throw "Unable to remove VideoVault service."
        }
    }

    Write-Status "Service removed. Application and logs were preserved." Green
}

# ============================================================
# MAIN
# ============================================================

try {

    switch ($Action) {

        "Install" {
            Install-VideoVault
        }

        "Start" {
            Start-VideoVault
        }

        "Stop" {
            Stop-VideoVault
        }

        "Restart" {
            Restart-VideoVault
        }

        "Status" {
            Show-VideoVaultStatus
        }

        "Uninstall" {
            Uninstall-VideoVault
        }
    }
}
catch {

    Write-Status "ERROR: $($_.Exception.Message)" Red

    exit 1
}
