param(
  [string]$ApiKey = ""
)

$proxyCommand = "node proxy.js"
if ($ApiKey -ne "") {
  $proxyCommand = "`$env:POKEMON_TCG_API_KEY='$ApiKey'; " + $proxyCommand
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", $proxyCommand

Write-Host "Proxy iniciado em http://localhost:8787"
Write-Host "Servidor web iniciando em http://localhost:5173"

python -m http.server 5173
