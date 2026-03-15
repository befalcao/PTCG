param(
  [string]$ApiKey = ""
)

$proxyCommand = "python proxy.py"
if ($ApiKey -ne "") {
  $escaped = $ApiKey.Replace('"', '""')
  $proxyCommand = "`$env:POKEMON_TCG_API_KEY=`"$escaped`"; " + $proxyCommand
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", $proxyCommand

Write-Host "Proxy iniciado em http://localhost:8787"
Write-Host "Servidor web iniciando em http://localhost:5173"

python -m http.server 5173
