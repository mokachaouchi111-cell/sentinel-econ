$ErrorActionPreference = "Stop"

Set-Location -Path $PSScriptRoot

function Test-PortAvailable {
    param([int]$Port)
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        $listener.Stop()
        return $true
    } catch {
        return $false
    }
}

function Get-FreePort {
    param([int]$Start = 8000, [int]$End = 8010)
    for ($p = $Start; $p -le $End; $p++) {
        if (Test-PortAvailable -Port $p) {
            return $p
        }
    }
    throw "No free port found between $Start and $End."
}

if (-not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment..."
    python -m venv .venv
}

& ".\.venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r requirements.txt | Out-Host

$port = Get-FreePort
$url = "http://127.0.0.1:$port"

Write-Host "Starting Sentinel-Econ on $url"
Start-Process $url

& ".\.venv\Scripts\python.exe" -m uvicorn app.main:app --reload --host 127.0.0.1 --port $port
