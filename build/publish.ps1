<#
.SYNOPSIS
    Produces a release folder with a single self-contained executable.

.DESCRIPTION
    Runs `dotnet publish` with the flags from the plan (§4 Packaging):
      - self-contained: bundles the .NET runtime, DBAs install nothing
      - single-file:    one SqlAdmin.exe plus config/operations next to it
    The SqlAdmin.Api.csproj "BuildFrontend" target builds the React app with pnpm
    and places it in wwwroot/ automatically, so the exe serves the UI too.

    Works with Windows PowerShell 5.1 and PowerShell 7 (pwsh) on macOS/Linux.

.PARAMETER Runtime
    Target platform. win-x64 for the DBAs' machines; osx-arm64 / linux-x64 for local testing.

.EXAMPLE
    ./build/publish.ps1                      # win-x64 → ./publish/win-x64
    ./build/publish.ps1 -Runtime osx-arm64   # macOS build for local testing
#>
param(
    [ValidateSet('win-x64', 'win-arm64', 'osx-arm64', 'osx-x64', 'linux-x64')]
    [string] $Runtime = 'win-x64'
)

$ErrorActionPreference = 'Stop'
$root   = Split-Path -Parent $PSScriptRoot           # repo root (this script lives in /build)
$output = Join-Path $root "publish/$Runtime"

Write-Host "Publishing SqlAdmin for $Runtime → $output" -ForegroundColor Cyan

dotnet publish (Join-Path $root 'src/SqlAdmin.Api/SqlAdmin.Api.csproj') `
    --configuration Release `
    --runtime $Runtime `
    --self-contained true `
    --output $output `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:DebugType=none

if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed with exit code $LASTEXITCODE" }

Write-Host "`nDone. Release contents:" -ForegroundColor Green
Get-ChildItem $output | Select-Object Name, Length | Format-Table -AutoSize
