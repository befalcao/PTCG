# PTCG Tracker (MVP Local)

Aplicativo web simples para tracking de colecao Pokemon TCG, analise de deck e lista de compra.

## Como abrir

Use um servidor estatico local para evitar bloqueios de CORS do navegador:

```bash
python -m http.server 5173
```

Depois abra `http://localhost:5173` no navegador.

## GitHub Pages e CORS

O navegador costuma bloquear chamadas diretas para `https://api.pokemontcg.io` quando o app esta hospedado no GitHub Pages (CORS). Para funcionar, configure um proxy CORS e aponte o app para ele em "Configuracoes" no campo `API Base URL`.

Foi incluido um proxy pronto como Cloudflare Worker em `cloudflare-worker.js`.

Passos (resumo):

- Deploy do worker (via Wrangler).
- (Opcional) `wrangler secret put API_KEY` para guardar a key no worker.
- No app, setar `API Base URL` para `https://<seu-worker>.workers.dev`.
- Alternativa rapida: abrir o app com `?apiBase=https://<seu-worker>.workers.dev` para preencher automaticamente.

## Notas

- A chave da API e as configuracoes ficam no `localStorage` do navegador.
- Colecao e cache de cartas ficam no `IndexedDB`.
- Ajuste o JSON de aliases e overrides em "Configuracoes".
