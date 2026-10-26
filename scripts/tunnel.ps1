# Public demo tunnel (localhost.run, no account): keeps the ssh session alive, restarts it when it drops, and writes
# the current public address to .preview-url so `npm run start:prod` picks it up on its next start.
#   powershell -File scripts\tunnel.ps1            # tunnels port 3102
#   powershell -File scripts\tunnel.ps1 -Port 3101
# Stop with Ctrl-C. Free hostnames change on every reconnect; create a localhost.run account for a fixed domain.
param([int]$Port = 3102)
$root = Split-Path -Parent $PSScriptRoot
$urlFile = Join-Path $root '.preview-url'
while ($true) {
  Write-Host "[tunnel] connecting (local port $Port)..."
  ssh -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -R "80:localhost:$Port" nokey@localhost.run 2>&1 | ForEach-Object {
    $line = "$_"
    if ($line -match 'https://[a-z0-9.-]+\.lhr\.life') {
      $url = $Matches[0]
      Set-Content -Path $urlFile -Value $url -Encoding ascii
      Write-Host "[tunnel] public address: $url  (written to .preview-url)"
    } elseif ($line -match '^\s*$' -or $line -match '^\e') {
      # skip blank lines and the QR code
    } else {
      $line
    }
  }
  Write-Host "[tunnel] disconnected - reconnecting in 3s (the public address will change)"
  Start-Sleep -Seconds 3
}
