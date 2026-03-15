# PTCG Tracker (MVP Local)

Aplicativo web simples para tracking de colecao Pokemon TCG, analise de deck e lista de compra.

## Como abrir

Use um servidor estatico local para evitar bloqueios de CORS do navegador:

```bash
python -m http.server 5173
```

Depois abra `http://localhost:5173` no navegador.

## Notas

- A chave da API e as configuracoes ficam no `localStorage` do navegador.
- Colecao e cache de cartas ficam no `IndexedDB`.
- Ajuste o JSON de aliases e overrides em "Configuracoes".
