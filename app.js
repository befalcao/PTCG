(() => {
  const DB_NAME = "ptcg-tracker";
  const DB_VERSION = 1;
  const SETTINGS_KEY = "ptcg_settings";
  const ALIAS_KEY = "ptcg_aliases";
  const OVERRIDE_KEY = "ptcg_overrides";

  const state = {
    db: null,
    collection: [],
    cards: new Map(),
    lastMissing: [],
  };

  const els = {
    onlineStatus: document.getElementById("online-status"),
    collectionStats: document.getElementById("collection-stats"),
    addForm: document.getElementById("add-card-form"),
    addStatus: document.getElementById("add-status"),
    addCandidates: document.getElementById("add-candidates"),
    cardName: document.getElementById("card-name"),
    cardSet: document.getElementById("card-set"),
    cardNumber: document.getElementById("card-number"),
    cardQty: document.getElementById("card-qty"),
    cardLanguage: document.getElementById("card-language"),
    cardCondition: document.getElementById("card-condition"),
    clearAddForm: document.getElementById("clear-add-form"),
    collectionBody: document.getElementById("collection-body"),
    collectionFilter: document.getElementById("collection-filter"),
    deckInput: document.getElementById("deck-input"),
    analyzeDeck: document.getElementById("analyze-deck"),
    clearDeck: document.getElementById("clear-deck"),
    deckStatus: document.getElementById("deck-status"),
    deckHave: document.getElementById("deck-have"),
    deckMissing: document.getElementById("deck-missing"),
    deckUnresolved: document.getElementById("deck-unresolved"),
    defaultQuality: document.getElementById("default-quality"),
    defaultLanguage: document.getElementById("default-language"),
    purchaseTable: document.getElementById("purchase-table"),
    generatePurchase: document.getElementById("generate-purchase"),
    clearPurchase: document.getElementById("clear-purchase"),
    purchaseOutput: document.getElementById("purchase-output"),
    apiKey: document.getElementById("api-key"),
    apiBaseUrl: document.getElementById("api-base-url"),
    aliasMap: document.getElementById("alias-map"),
    overrideMap: document.getElementById("override-map"),
    saveSettings: document.getElementById("save-settings"),
    settingsStatus: document.getElementById("settings-status"),
  };

  init();

  async function init() {
    bindEvents();
    loadSettings();
    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    state.db = await openDb();
    await loadCollection();
    renderCollection();
    updateStats();
  }

  function bindEvents() {
    els.addForm.addEventListener("submit", onAddCard);
    els.clearAddForm.addEventListener("click", clearAddForm);
    els.collectionFilter.addEventListener("input", renderCollection);
    els.analyzeDeck.addEventListener("click", onAnalyzeDeck);
    els.clearDeck.addEventListener("click", clearDeckInput);
    els.generatePurchase.addEventListener("click", onGeneratePurchase);
    els.clearPurchase.addEventListener("click", clearPurchase);
    els.saveSettings.addEventListener("click", saveSettings);
  }

  function updateOnlineStatus() {
    const online = navigator.onLine;
    els.onlineStatus.textContent = online ? "Online" : "Offline";
    els.onlineStatus.style.borderColor = online ? "#8bbf88" : "#d9a7a7";
    els.onlineStatus.style.background = online ? "#eef7ed" : "#fff3f3";
  }

  function loadSettings() {
    const settings = readJson(SETTINGS_KEY, {
      apiKey: "",
      apiBaseUrl: "",
      defaultQuality: "NM",
      defaultLanguage: "PTEN",
    });
    els.apiKey.value = settings.apiKey;
    els.apiBaseUrl.value = settings.apiBaseUrl || "";
    els.defaultQuality.value = settings.defaultQuality || "NM";
    els.defaultLanguage.value = settings.defaultLanguage || "PTEN";

    const defaultAliases = {
      "caixa secreta": "Secret Box",
      "goldeen": "Goldeen",
      "pesquisa do professor": "Professor's Research",
    };
    const defaultOverrides = {
      "TWN-044": "func_goldeen",
      "PRE-020": "func_goldeen",
    };

    const aliasesRaw = localStorage.getItem(ALIAS_KEY);
    els.aliasMap.value = aliasesRaw ? aliasesRaw : JSON.stringify(defaultAliases, null, 2);

    const overridesRaw = localStorage.getItem(OVERRIDE_KEY);
    els.overrideMap.value = overridesRaw ? overridesRaw : JSON.stringify(defaultOverrides, null, 2);
  }

  function saveSettings() {
    const settings = {
      apiKey: els.apiKey.value.trim(),
      apiBaseUrl: els.apiBaseUrl.value.trim(),
      defaultQuality: els.defaultQuality.value,
      defaultLanguage: els.defaultLanguage.value,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    localStorage.setItem(ALIAS_KEY, els.aliasMap.value.trim());
    localStorage.setItem(OVERRIDE_KEY, els.overrideMap.value.trim());
    setStatus(els.settingsStatus, "Configuracoes salvas.");
  }

  async function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("collection")) {
          const store = db.createObjectStore("collection", { keyPath: "key" });
          store.createIndex("byFunctionId", "functionId", { unique: false });
        }
        if (!db.objectStoreNames.contains("cards")) {
          const cardStore = db.createObjectStore("cards", { keyPath: "id" });
          cardStore.createIndex("bySetNumber", "setNumberKey", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function withStore(storeName, mode, handler) {
    return new Promise((resolve, reject) => {
      const tx = state.db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const request = handler(store);
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadCollection() {
    const items = await withStore("collection", "readonly", (store) => store.getAll());
    state.collection = items || [];
  }

  async function saveCardToCache(card, functionId) {
    if (!card) return;
    const setCode = (card.set?.ptcgoCode || card.set?.id || "").toUpperCase();
    const setNumberKey = `${setCode}|${normalizeNumber(card.number || "")}`;
    const payload = {
      ...card,
      setNumberKey,
      functionId,
    };
    await withStore("cards", "readwrite", (store) => store.put(payload));
    state.cards.set(card.id, payload);
  }

  async function getCardBySetNumber(setCode, number) {
    const normCode = (setCode || "").toUpperCase();
    const normNumber = normalizeNumber(number);
    const key = `${normCode}|${normNumber}`;
    const results = await withStore("cards", "readonly", (store) =>
      store.index("bySetNumber").getAll(key)
    );
    return results && results.length ? results[0] : null;
  }

  function normalizeNumber(number) {
    const raw = String(number || "").trim();
    if (!raw) return "";
    const base = raw.includes("/") ? raw.split("/")[0] : raw;
    const trimmed = base.replace(/^0+/, "");
    return trimmed || base;
  }

  function foldText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function readAliases() {
    const raw = localStorage.getItem(ALIAS_KEY) || "{}";
    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      setStatus(els.settingsStatus, "Erro ao ler aliases JSON.");
      parsed = {};
    }
    const folded = {};
    Object.keys(parsed).forEach((key) => {
      folded[foldText(key)] = parsed[key];
    });
    return folded;
  }

  function readOverrides() {
    const raw = localStorage.getItem(OVERRIDE_KEY) || "{}";
    try {
      return JSON.parse(raw);
    } catch (error) {
      setStatus(els.settingsStatus, "Erro ao ler overrides JSON.");
      return {};
    }
  }

  function resolveAlias(name) {
    const aliases = readAliases();
    const folded = foldText(name);
    return aliases[folded] || name;
  }

  function computeFunctionId(card) {
    const overrides = readOverrides();
    const setCode = (card.set?.ptcgoCode || card.set?.id || "").toUpperCase();
    const number = normalizeNumber(card.number || "");
    const overrideKeyA = card.id;
    const overrideKeyB = `${setCode}-${number}`;
    const overrideKeyC = `${setCode}-${card.number || ""}`;

    const forced =
      overrides[overrideKeyA] || overrides[overrideKeyB] || overrides[overrideKeyC];
    if (forced) return forced;

    const stable = {
      name: foldText(card.name),
      supertype: foldText(card.supertype),
      subtypes: (card.subtypes || []).map(foldText).sort(),
      hp: String(card.hp || ""),
      types: (card.types || []).map(foldText).sort(),
      evolvesFrom: foldText(card.evolvesFrom || ""),
      rules: (card.rules || []).map(foldText),
      abilities: (card.abilities || []).map((ability) =>
        [
          foldText(ability.name || ""),
          foldText(ability.text || ""),
          foldText(ability.type || ""),
        ].join("|")
      ),
      attacks: (card.attacks || []).map((attack) =>
        [
          foldText(attack.name || ""),
          (attack.cost || []).map(foldText).sort().join(","),
          foldText(attack.damage || ""),
          foldText(attack.text || ""),
        ].join("|")
      ),
      weaknesses: (card.weaknesses || []).map((entry) =>
        `${entry.type || ""}|${entry.value || ""}`
      ),
      resistances: (card.resistances || []).map((entry) =>
        `${entry.type || ""}|${entry.value || ""}`
      ),
      retreatCost: (card.retreatCost || []).map(foldText).sort().join(","),
    };

    const payload = JSON.stringify(stable);
    return `func_${hashString(payload)}`;
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  async function onAddCard(event) {
    event.preventDefault();
    clearCandidates();
    setStatus(els.addStatus, "Buscando carta...");
    const name = els.cardName.value.trim();
    const set = els.cardSet.value.trim();
    const number = els.cardNumber.value.trim();
    const qty = Number(els.cardQty.value);
    if (!name || !set || !number || !qty) {
      setStatus(els.addStatus, "Preencha nome, set, numero e quantidade.");
      return;
    }
    const resolvedName = resolveAlias(name);
    const candidates = await findCardCandidates({
      name: resolvedName,
      setCode: set,
      number,
    });
    if (!candidates.length) {
      setStatus(els.addStatus, "Nenhuma carta encontrada.");
      return;
    }
    if (candidates.length === 1) {
      await addCardToCollection(candidates[0]);
      return;
    }
    renderCandidates(candidates);
  }

  async function findCardCandidates({ name, setCode, number }) {
    const cached = await getCardBySetNumber(setCode, number);
    if (cached) return [cached];
    if (!navigator.onLine) {
      setStatus(els.addStatus, "Offline. Carta nao encontrada no cache.");
      return [];
    }
    const queries = buildQueries(name, setCode, number);
    for (const query of queries) {
      const results = await fetchCardsByQuery(query);
      if (results.length) return results;
    }
    return [];
  }

  function buildQueries(name, setCode, number) {
    const cleanName = name ? `"${name.replace(/"/g, "")}"` : "";
    const normSet = String(setCode || "").trim();
    const baseNumber = normalizeNumber(number);
    const rawNumber = String(number || "").trim().split("/")[0];
    const numbers = [rawNumber, baseNumber].filter((value, index, arr) => value && arr.indexOf(value) === index);
    const queries = [];
    numbers.forEach((num) => {
      const suffix = cleanName ? ` name:${cleanName}` : "";
      queries.push(`set.ptcgoCode:${normSet} number:${num}${suffix}`);
      queries.push(`set.id:${normSet} number:${num}${suffix}`);
      queries.push(`set.name:"${normSet}" number:${num}${suffix}`);
    });
    if (cleanName) {
      queries.push(`name:${cleanName}`);
    }
    return queries;
  }

  function getApiBaseUrl() {
    const settings = readJson(SETTINGS_KEY, {});
    if (settings.apiBaseUrl) return settings.apiBaseUrl.replace(/\/+$/, "");

    // Default: direct API works in some contexts, but GitHub Pages frequently hits CORS limits.
    return "https://api.pokemontcg.io";
  }

  async function fetchCardsByQuery(query, statusEl = els.addStatus) {
    const settings = readJson(SETTINGS_KEY, {});
    const base = getApiBaseUrl();
    const url = `${base}/v2/cards?q=${encodeURIComponent(query)}&pageSize=10`;
    const headers = settings.apiKey ? { "X-Api-Key": settings.apiKey } : {};
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        setStatus(statusEl, `Erro na API: ${response.status}`);
        return [];
      }
      const payload = await response.json();
      return payload.data || [];
    } catch (error) {
      setStatus(statusEl, "Falha ao consultar API.");
      return [];
    }
  }

  function renderCandidates(candidates) {
    els.addCandidates.innerHTML = "";
    setStatus(els.addStatus, "Escolha a carta correta.");
    candidates.forEach((card) => {
      const wrapper = document.createElement("div");
      wrapper.className = "candidate";
      const info = document.createElement("div");
      info.innerHTML = `
        <strong>${card.name}</strong><br/>
        ${card.set?.ptcgoCode || card.set?.id || ""} - ${card.set?.name || ""} #${card.number || ""}
      `;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Usar";
      button.addEventListener("click", async () => {
        await addCardToCollection(card);
      });
      wrapper.appendChild(info);
      wrapper.appendChild(button);
      els.addCandidates.appendChild(wrapper);
    });
  }

  function clearCandidates() {
    els.addCandidates.innerHTML = "";
  }

  async function addCardToCollection(card) {
    const qty = Number(els.cardQty.value);
    const language = els.cardLanguage.value;
    const condition = els.cardCondition.value;
    const functionId = card.functionId || computeFunctionId(card);
    await saveCardToCache(card, functionId);
    const key = `${card.id}|${language}|${condition}`;
    const existing = await withStore("collection", "readonly", (store) => store.get(key));
    const payload = {
      key,
      cardId: card.id,
      functionId,
      name: card.name,
      setCode: card.set?.ptcgoCode || card.set?.id || "",
      setName: card.set?.name || "",
      number: card.number || "",
      total: card.set?.printedTotal || card.set?.total || "",
      regulationMark: card.regulationMark || "",
      language,
      condition,
      quantity: (existing?.quantity || 0) + qty,
      updatedAt: Date.now(),
    };
    await withStore("collection", "readwrite", (store) => store.put(payload));
    await loadCollection();
    renderCollection();
    updateStats();
    clearCandidates();
    setStatus(els.addStatus, "Carta adicionada na colecao.");
  }

  function clearAddForm() {
    els.cardName.value = "";
    els.cardSet.value = "";
    els.cardNumber.value = "";
    els.cardQty.value = 1;
    clearCandidates();
    setStatus(els.addStatus, "");
  }

  function renderCollection() {
    const filter = foldText(els.collectionFilter.value);
    els.collectionBody.innerHTML = "";
    const items = state.collection.filter((item) => {
      if (!filter) return true;
      const hay = foldText(`${item.name} ${item.setCode} ${item.number} ${item.language}`);
      return hay.includes(filter);
    });
    items.forEach((item) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${item.name}</td>
        <td>${item.setCode}</td>
        <td>${item.number}</td>
        <td>${item.language}</td>
        <td>${item.condition}</td>
        <td>${item.quantity}</td>
        <td>${item.regulationMark || "-"}</td>
        <td>
          <button type="button" data-action="remove" data-key="${item.key}">-1</button>
          <button type="button" class="ghost" data-action="delete" data-key="${item.key}">Remover</button>
        </td>
      `;
      row.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", async (event) => {
          const action = event.currentTarget.dataset.action;
          const key = event.currentTarget.dataset.key;
          if (action === "remove") {
            await updateQuantity(key, -1);
          } else {
            await deleteEntry(key);
          }
        });
      });
      els.collectionBody.appendChild(row);
    });
  }

  async function updateQuantity(key, delta) {
    const entry = await withStore("collection", "readonly", (store) => store.get(key));
    if (!entry) return;
    const nextQty = entry.quantity + delta;
    if (nextQty <= 0) {
      await deleteEntry(key);
      return;
    }
    entry.quantity = nextQty;
    await withStore("collection", "readwrite", (store) => store.put(entry));
    await loadCollection();
    renderCollection();
    updateStats();
  }

  async function deleteEntry(key) {
    await withStore("collection", "readwrite", (store) => store.delete(key));
    await loadCollection();
    renderCollection();
    updateStats();
  }

  function updateStats() {
    const total = state.collection.reduce((sum, item) => sum + item.quantity, 0);
    const unique = state.collection.length;
    els.collectionStats.textContent = `${total} cartas (${unique} entradas)`;
  }

  function clearDeckInput() {
    els.deckInput.value = "";
    els.deckHave.innerHTML = "";
    els.deckMissing.innerHTML = "";
    els.deckUnresolved.textContent = "";
    setStatus(els.deckStatus, "");
    state.lastMissing = [];
    renderPurchaseTable();
  }

  async function onAnalyzeDeck() {
    const text = els.deckInput.value.trim();
    if (!text) {
      setStatus(els.deckStatus, "Cole a lista do deck.");
      return;
    }
    setStatus(els.deckStatus, "Analisando deck...");
    const parsed = parseDeckList(text);
    if (!parsed.items.length) {
      setStatus(els.deckStatus, "Nenhuma linha valida encontrada.");
      return;
    }
    const resolved = [];
    const unresolved = [];
    for (const item of parsed.items) {
      const result = await resolveDeckItem(item);
      if (result) {
        resolved.push(result);
      } else {
        unresolved.push(item);
      }
    }
    const analysis = analyzeResolved(resolved);
    renderDeckResults(analysis);
    renderUnresolved(unresolved);
    setStatus(els.deckStatus, "Deck analisado.");
  }

  function parseDeckList(text) {
    const lines = text.split(/\r?\n/);
    const items = [];
    const errors = [];
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (/^(pokemon|pok.mon|trainer|treinador|energy|energia|total)/i.test(trimmed)) {
        return;
      }
      const match = trimmed.match(/^(\d+)\s+(.+?)(?:\s+\(([^)]+)\))?(?:\s+([A-Za-z0-9]+(?:\/[A-Za-z0-9]+)?))?\s*$/);
      if (!match) {
        errors.push(trimmed);
        return;
      }
      items.push({
        qty: Number(match[1]),
        name: match[2].trim(),
        setCode: match[3]?.trim() || "",
        number: match[4]?.trim() || "",
        raw: trimmed,
      });
    });
    return { items, errors };
  }

  async function resolveDeckItem(item) {
    const canonicalName = resolveAlias(item.name);
    let card = null;
    if (item.setCode && item.number) {
      card = await getCardBySetNumber(item.setCode, item.number);
      if (!card && navigator.onLine) {
        const query = buildQueries(canonicalName, item.setCode, item.number)[0];
        const results = await fetchCardsByQuery(query, els.deckStatus);
        card = results[0] || null;
      }
    } else if (navigator.onLine) {
      const results = await fetchCardsByQuery(
        `name:"${canonicalName.replace(/"/g, "")}"`,
        els.deckStatus
      );
      card = results[0] || null;
    }
    if (!card) return null;
    const functionId = card.functionId || computeFunctionId(card);
    await saveCardToCache(card, functionId);
    return {
      ...item,
      card,
      functionId,
    };
  }

  function analyzeResolved(resolved) {
    const requiredByFunction = new Map();
    const representative = new Map();
    resolved.forEach((entry) => {
      const current = requiredByFunction.get(entry.functionId) || 0;
      requiredByFunction.set(entry.functionId, current + entry.qty);
      if (!representative.has(entry.functionId)) {
        representative.set(entry.functionId, entry);
      }
    });

    const haveByFunction = new Map();
    state.collection.forEach((entry) => {
      const current = haveByFunction.get(entry.functionId) || 0;
      haveByFunction.set(entry.functionId, current + entry.quantity);
    });

    const haveList = [];
    const missingList = [];
    requiredByFunction.forEach((needed, functionId) => {
      const haveQty = haveByFunction.get(functionId) || 0;
      const ref = representative.get(functionId);
      const card = ref.card;
      const base = {
        functionId,
        name: card.name,
        setCode: card.set?.ptcgoCode || card.set?.id || "",
        number: card.number || "",
        total: card.set?.printedTotal || card.set?.total || "",
        card,
      };
      if (haveQty >= needed) {
        haveList.push({ ...base, qty: needed });
      } else {
        if (haveQty > 0) {
          haveList.push({ ...base, qty: haveQty });
        }
        missingList.push({ ...base, qty: needed - haveQty });
      }
    });

    state.lastMissing = missingList;
    renderPurchaseTable();
    return { haveList, missingList };
  }

  function renderDeckResults({ haveList, missingList }) {
    renderSimpleList(els.deckHave, haveList);
    renderSimpleList(els.deckMissing, missingList);
  }

  function renderSimpleList(container, items) {
    container.innerHTML = "";
    if (!items.length) {
      container.innerHTML = "<div class=\"status-line\">Nenhuma carta.</div>";
      return;
    }
    items.forEach((item) => {
      const div = document.createElement("div");
      div.className = "list-item";
      div.innerHTML = `
        <span>${item.qty}x ${item.name} (${item.setCode} ${item.number})</span>
        <span>${item.total ? `${item.number}/${item.total}` : item.number}</span>
      `;
      container.appendChild(div);
    });
  }

  function renderUnresolved(unresolved) {
    if (!unresolved.length) {
      els.deckUnresolved.textContent = "";
      return;
    }
    const lines = unresolved.map((item) => item.raw).join(" | ");
    els.deckUnresolved.textContent = `Nao resolvidas: ${lines}`;
  }

  function renderPurchaseTable() {
    els.purchaseTable.innerHTML = "";
    if (!state.lastMissing.length) return;
    state.lastMissing.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "purchase-row";
      row.innerHTML = `
        <div>${item.qty}x ${item.name}</div>
        <div>${item.number}/${item.total || "-"}</div>
        <input type="number" min="1" value="${item.qty}" data-field="qty" data-index="${index}" />
        <select data-field="quality" data-index="${index}">
          <option value="NM">NM</option>
          <option value="LP">LP</option>
          <option value="MP">MP</option>
          <option value="HP">HP</option>
        </select>
        <select data-field="language" data-index="${index}">
          <option value="PTEN">PTEN</option>
          <option value="PT">PT</option>
          <option value="EN">EN</option>
        </select>
      `;
      const quality = row.querySelector('select[data-field="quality"]');
      const language = row.querySelector('select[data-field="language"]');
      quality.value = els.defaultQuality.value;
      language.value = els.defaultLanguage.value;
      els.purchaseTable.appendChild(row);
    });
  }

  function onGeneratePurchase() {
    const rows = Array.from(els.purchaseTable.querySelectorAll(".purchase-row"));
    if (!rows.length) {
      els.purchaseOutput.value = "";
      return;
    }
    const lines = rows.map((row, index) => {
      const qty = row.querySelector('input[data-field="qty"]').value || state.lastMissing[index].qty;
      const quality = row.querySelector('select[data-field="quality"]').value;
      const language = row.querySelector('select[data-field="language"]').value;
      const item = state.lastMissing[index];
      const numberPart = item.total ? `${item.number}/${item.total}` : item.number;
      return `${qty} ${item.name} (${numberPart}) [QUALIDADE=${quality}][IDIOMA=${language}]`;
    });
    els.purchaseOutput.value = lines.join("\n");
  }

  function clearPurchase() {
    els.purchaseOutput.value = "";
  }

  function setStatus(element, message) {
    element.textContent = message || "";
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }
})();
