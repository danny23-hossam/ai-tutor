param(
    [string]$PythonPath = "python",
    [int]$Port = 8002,
    [string]$Device = ""
)

$ErrorActionPreference = "Stop"

$env:NUMBA_CACHE_DIR = Join-Path $env:TEMP "numba_cache"
New-Item -ItemType Directory -Force $env:NUMBA_CACHE_DIR | Out-Null

if ($Device) {
    $env:TTS_DEVICE = $Device
}

& $PythonPath -m uvicorn app:app --host 0.0.0.0 --port $Port
