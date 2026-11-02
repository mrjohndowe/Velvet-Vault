# Video Vault

Video Vault is a Next.js application configured to run as a background Windows service using [NSSM (Non-Sucking Service Manager)](https://nssm.cc/).

This setup allows Video Vault to start automatically with Windows and continue running without an open PowerShell or Command Prompt window.

---

## Table of Contents

1. [Requirements](#requirements)
2. [Project Configuration](#project-configuration)
3. [Initial Setup](#initial-setup)
4. [Building the Application](#building-the-application)
5. [Installing the Windows Service](#installing-the-windows-service)
6. [Service Account Options](#service-account-options)
7. [Accessing Video Vault](#accessing-video-vault)
8. [Managing the Service](#managing-the-service)
9. [Log Files](#log-files)
10. [Troubleshooting](#troubleshooting)
11. [Uninstalling](#uninstalling)
12. [Security Notes](#security-notes)

---

## Requirements

| Requirement | Purpose |
|---|---|
| Windows 10/11 or Windows Server | Operating system |
| Node.js | Runs the Next.js application |
| npm | Installs project dependencies |
| NSSM | Runs the application as a Windows service |
| PostgreSQL | Application database |
| PowerShell | Runs the installation script |

### Expected software locations

The current configuration uses:

| Component | Location |
|---|---|
| Project | `D:\scripts\OptionB` |
| Node.js | `C:\Program Files\nodejs\node.exe` |
| NSSM | `G:\apps\nssm\win64\nssm.exe` |
| Service name | `VideoVault` |
| Service display name | `Video Vault` |
| Application port | `3000` |
| Database port | `5432` |

Adjust these paths if your installation differs.

---

## Project Configuration

Video Vault uses:

- Next.js 16
- React 19
- Drizzle ORM
- PostgreSQL
- NSSM for Windows service management

The application uses a Next.js `basePath` of `/vault`.

The expected application address is:

```text
http://127.0.0.1:3000/vault
```

The Windows service starts the production Next.js server rather than the development server.

---

## Initial Setup

Open PowerShell and navigate to the project directory:

```powershell
cd D:\scripts\OptionB
```

Verify Node.js:

```powershell
node --version
npm --version
```

Install dependencies:

```powershell
npm install
```

Verify that PostgreSQL is running:

```powershell
Test-NetConnection localhost -Port 5432
```

A successful connection should show:

```text
TcpTestSucceeded : True
```

Make sure your database connection settings are configured in the appropriate environment file, such as `.env.local`.

**Important:** Do not commit database passwords or other secrets to source control.

---

## Building the Application

The service runs the production build. Build the application before installing or starting the service.

```powershell
cd D:\scripts\OptionB
npm run build -- --webpack
```

A successful build should create the `.next` directory, including:

```text
.next\BUILD_ID
```

If the build fails, resolve the errors before starting the Windows service.

Whenever application code or production configuration changes, rebuild the application:

```powershell
npm run build -- --webpack
```

Then restart the service.

---

## Installing the Windows Service

Run PowerShell as Administrator.

Navigate to the project directory:

```powershell
cd D:\scripts\OptionB
```

Run the installer:

```powershell
.\Install-VideoVaultService.ps1 -Action Install
```

The installer configures NSSM to launch the Node.js process and the Next.js production server.

The installation process includes:

1. Checking for an existing Video Vault service.
2. Removing an existing service if necessary.
3. Registering the Windows service.
4. Configuring the application directory.
5. Configuring the Node.js executable and Next.js startup parameters.
6. Configuring automatic startup.
7. Configuring standard output and error logs.
8. Selecting the Windows service account.
9. Starting the service.
10. Checking whether the application becomes available.

The service name is:

```text
VideoVault
```

---

## Service Account Options

During installation, the installer provides two account choices.

### Option 1: Current Windows user

Runs Video Vault under the Windows account executing the installer.

This is generally the preferred option when the application needs access to files, folders, or environment settings belonging to your Windows user.

The installer requests the account password.

**Use your actual Windows account password, not your Windows Hello PIN.**

### Option 2: LocalSystem

Runs Video Vault under the built-in Windows LocalSystem account.

This account has extensive local system permissions but does not automatically have access to your personal user profile, mapped drives, or user-specific resources.

### Which should you choose?

| Situation | Recommended account |
|---|---|
| Application uses your Windows user files | Current Windows user |
| Application needs access to user-specific resources | Current Windows user |
| Application only needs local system resources | LocalSystem |
| Application depends on mapped network drives | Prefer a properly configured user account and UNC paths |

---

## Accessing Video Vault

Once the service is running, open:

```text
http://127.0.0.1:3000/vault
```

To access it from another device on your network, you may need to configure the application hostname, Windows Firewall, and network access separately.

---

## Managing the Service

All service management commands should be run from an elevated PowerShell window.

Navigate to the project directory:

```powershell
cd D:\scripts\OptionB
```

### Check service status

```powershell
.\Install-VideoVaultService.ps1 -Action Status
```

### Start

```powershell
.\Install-VideoVaultService.ps1 -Action Start
```

### Stop

```powershell
.\Install-VideoVaultService.ps1 -Action Stop
```

### Restart

```powershell
.\Install-VideoVaultService.ps1 -Action Restart
```

### Uninstall

```powershell
.\Install-VideoVaultService.ps1 -Action Uninstall
```

### Using Windows PowerShell commands directly

You can also manage the service with:

```powershell
Get-Service -Name VideoVault
```

Start:

```powershell
Start-Service -Name VideoVault
```

Stop:

```powershell
Stop-Service -Name VideoVault
```

Restart:

```powershell
Restart-Service -Name VideoVault
```

Check the NSSM service status:

```powershell
& "G:\apps\nssm\win64\nssm.exe" status VideoVault
```

---

## Log Files

Video Vault writes its service logs to:

```text
C:\ProgramData\VideoVault\logs
```

Expected log files:

| File | Description |
|---|---|
| `stdout.log` | Normal application output |
| `stderr.log` | Application errors and diagnostic output |

View the standard output log:

```powershell
Get-Content "C:\ProgramData\VideoVault\logs\stdout.log" -Tail 50
```

View the error log:

```powershell
Get-Content "C:\ProgramData\VideoVault\logs\stderr.log" -Tail 50
```

Continuously monitor the error log:

```powershell
Get-Content "C:\ProgramData\VideoVault\logs\stderr.log" -Wait
```

The installer configures NSSM log rotation to prevent log files from growing indefinitely.

---

## Troubleshooting

### 1. Service reports SERVICE_PAUSED

Example:

```text
Unexpected status SERVICE_PAUSED in response to START control.
```

This indicates that the service did not reach its expected running state.

Check the service:

```powershell
Get-Service VideoVault
```

Check the NSSM configuration:

```powershell
$nssm = "G:\apps\nssm\win64\nssm.exe"

& $nssm get VideoVault Application
& $nssm get VideoVault AppParameters
& $nssm get VideoVault AppDirectory
& $nssm get VideoVault ObjectName
```

Inspect the logs:

```powershell
Get-Content "C:\ProgramData\VideoVault\logs\stderr.log" -Tail 100
```

Common causes include:

- Incorrect Node.js executable path.
- Incorrect Next.js startup parameters.
- Missing production build.
- Incorrect service account credentials.
- Application startup errors.
- Port 3000 already being used.

### 2. Production build is missing

If the installer reports that the production build is missing, execute:

```powershell
cd D:\scripts\OptionB
npm install
npm run build -- --webpack
```

Then start the service:

```powershell
.\Install-VideoVaultService.ps1 -Action Start
```

### 3. Port 3000 is already in use

Check which process is using port 3000:

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
```

Identify the process:

```powershell
Get-NetTCPConnection -LocalPort 3000 |
    Select-Object LocalAddress, LocalPort, State, OwningProcess
```

Then inspect the process:

```powershell
Get-Process -Id <PROCESS_ID>
```

Replace `<PROCESS_ID>` with the actual process ID.

### 4. Database connection fails

Verify PostgreSQL:

```powershell
Test-NetConnection localhost -Port 5432
```

Check your database environment configuration.

Also verify that the Windows service account can read the necessary environment files and access the database.

### 5. Service account login failure

Windows may return a service logon error if the supplied account password is incorrect or the account does not have permission to log on as a service.

Check the configured service account:

```powershell
Get-CimInstance Win32_Service -Filter "Name='VideoVault'" |
    Select-Object Name, StartName, State
```

Use the actual Windows account password when reinstalling with the current-user option.

### 6. Mapped drives are unavailable

Windows services may not see mapped drive letters such as:

```text
G:
B:
```

even when running under your Windows user account.

This can happen because mapped drives are associated with a particular logon session.

Where possible, use:

- Local physical paths.
- UNC network paths, such as `\\server\share`.
- Appropriate permissions for the selected service account.

### 7. Application starts but the page does not load

Verify the service:

```powershell
Get-Service VideoVault
```

Check the port:

```powershell
Test-NetConnection 127.0.0.1 -Port 3000
```

Try the application URL:

```text
http://127.0.0.1:3000/vault
```

Remember that the application uses `/vault` as its base path.

---

## Uninstalling

To remove the Windows service:

```powershell
cd D:\scripts\OptionB

.\Install-VideoVaultService.ps1 -Action Uninstall
```

This removes the registered NSSM service.

It does not necessarily remove:

- The Video Vault project.
- Node.js.
- PostgreSQL.
- Your database.
- Application environment files.
- The logs stored under `C:\ProgramData\VideoVault`.

Back up any important logs or configuration before manually deleting application data.

---

## Security Notes

- Never publish `.env` or `.env.local` files containing credentials.
- Do not commit database passwords to Git.
- Use a dedicated, appropriately permissioned service account where practical.
- Avoid running the application with unnecessary Windows privileges.
- Restrict network access to the application as appropriate.
- Protect the NSSM configuration and service management permissions.
- Do not share service account passwords in logs, screenshots, or source control.

---

## Quick Reference

| Task | Command |
|---|---|
| Install | `.\Install-VideoVaultService.ps1 -Action Install` |
| Start | `.\Install-VideoVaultService.ps1 -Action Start` |
| Stop | `.\Install-VideoVaultService.ps1 -Action Stop` |
| Restart | `.\Install-VideoVaultService.ps1 -Action Restart` |
| Status | `.\Install-VideoVaultService.ps1 -Action Status` |
| Uninstall | `.\Install-VideoVaultService.ps1 -Action Uninstall` |
| Build | `npm run build` |
| Check port | `Test-NetConnection localhost -Port 3000` |

**Project:** `D:\scripts\OptionB`  
**Service:** `VideoVault`  
**Application:** `http://127.0.0.1:3000/vault`  
**Logs:** `C:\ProgramData\VideoVault\logs`

---

*README for the Video Vault Windows Service deployment. Review paths and installer behavior against the current project before using this document as deployment documentation.*