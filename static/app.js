const API = "";

// ─── Локализация (I18N) ──────────────────────────────────────────
const translations = {
  ru: {
    app_title: "AI Roleplay",
    tab_login: "Вход",
    tab_reg: "Регистрация",
    ph_username: "Имя",
    ph_password: "Пароль",
    btn_login: "Войти",
    sidebar_title: "Персонажи",
    chat_title: "Выберите персонажа",
    btn_branches: "Ветки",
    btn_edit: "Изменить",
    btn_clear: "Очистить",
    btn_delete: "Удалить",
    hint_select: "Создайте персонажа или выберите существующего",
    ph_message: "Сообщение... (Enter — отправить, Shift+Enter — новая строка)",
    btn_send: "Отправить",
    editor_title_new: "Новый персонаж",
    lbl_name: "Имя персонажа *",
    ph_name: "Например, Ария",
    lbl_char_doc: "Документ персонажа (характер, биография, внешность, речь)",
    lbl_world: "Мир / лор",
    lbl_env: "Окружение / сцена",
    lbl_npc: "NPC и другие персонажи",
    lbl_interaction: "Общение с пользователем (стиль, правила, обращение)",
    lbl_prompt: "Системный промпт / программа общения",
    lbl_prev_chat: "📥 Предыдущая переписка (импорт из DeepSeek / другого чата)",
    hint_prev_chat: "Вставьте лог или загрузите .txt/.md файл — бот будет это «помнить» как прошлый сюжет.",
    lbl_temp: "Температура (0.0 – 2.0)",
    btn_file: "📎 Файл",
    btn_save: "Сохранить",
    btn_cancel: "Отмена",
    modal_branches: "Ветки сюжета",
    btn_save_branch: "💾 Сохранить текущую ветку",
    err_auth: "Ошибка авторизации",
    err_net: "Сетевая ошибка: ",
    confirm_del_msg: "Удалить это сообщение из памяти ИИ?",
    confirm_del_after: "Удалить это сообщение и все последующие?",
    confirm_clear_chat: "Очистить всю историю чата?",
    confirm_del_char: "Удалить персонажа и всю историю?",
    confirm_load_branch: "Загрузить эту ветку? Текущая история чата будет заменена.",
    confirm_del_branch: "Удалить эту ветку?",
    prompt_branch_name: "Название ветки:",
    hint_no_chars: "Персонажей пока нет",
    hint_start_chat: "Начните переписку с этим персонажем",
    hint_no_branches: "Веток пока нет",
    btn_load: "Загрузить",
  },
  en: {
    app_title: "AI Roleplay",
    tab_login: "Login",
    tab_reg: "Register",
    ph_username: "Username",
    ph_password: "Password",
    btn_login: "Sign In",
    sidebar_title: "Characters",
    chat_title: "Select a character",
    btn_branches: "Branches",
    btn_edit: "Edit",
    btn_clear: "Clear",
    btn_delete: "Delete",
    hint_select: "Create a character or select an existing one",
    ph_message: "Message... (Enter to send, Shift+Enter for new line)",
    btn_send: "Send",
    editor_title_new: "New Character",
    lbl_name: "Character Name *",
    ph_name: "e.g. Aria",
    lbl_char_doc: "Character Document (personality, bio, appearance, speech)",
    lbl_world: "World / Lore",
    lbl_env: "Environment / Scene",
    lbl_npc: "NPCs & Other Characters",
    lbl_interaction: "Interaction with User (style, rules, address)",
    lbl_prompt: "System Prompt / Communication Program",
    lbl_prev_chat: "📥 Previous Chat (import from DeepSeek / other)",
    hint_prev_chat: "Paste log or upload .txt/.md file — the bot will 'remember' it as past plot.",
    lbl_temp: "Temperature (0.0 – 2.0)",
    btn_file: "📎 File",
    btn_save: "Save",
    btn_cancel: "Cancel",
    modal_branches: "Story Branches",
    btn_save_branch: "💾 Save current branch",
    err_auth: "Authorization error",
    err_net: "Network error: ",
    confirm_del_msg: "Delete this message from AI memory?",
    confirm_del_after: "Delete this message and all following?",
    confirm_clear_chat: "Clear entire chat history?",
    confirm_del_char: "Delete character and all history?",
    confirm_load_branch: "Load this branch? Current chat history will be replaced.",
    confirm_del_branch: "Delete this branch?",
    prompt_branch_name: "Branch name:",
    hint_no_chars: "No characters yet",
    hint_start_chat: "Start chatting with this character",
    hint_no_branches: "No branches yet",
    btn_load: "Load",
  }
};

let currentLang = localStorage.getItem("lang") || "ru";

function applyLanguage() {
  const dict = translations[currentLang];
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    if (dict[key]) el.textContent = dict[key];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (dict[key]) el.placeholder = dict[key];
  });
  document.documentElement.lang = currentLang;
}

// ─── Остальная логика ────────────────────────────────────────────
const els = {
  charList: document.getElementById("char-list"),
  messages: document.getElementById("messages"),
  messageInput: document.getElementById("message-input"),
  sendBtn: document.getElementById("send-btn"),
  chatView: document.getElementById("chat-view"),
  editorView: document.getElementById("editor-view"),
  chatTitle: document.getElementById("chat-title"),
  editorTitle: document.getElementById("editor-title"),
  newCharBtn: document.getElementById("new-char-btn"),
  editCharBtn: document.getElementById("edit-char-btn"),
  clearChatBtn: document.getElementById("clear-chat-btn"),
  deleteCharBtn: document.getElementById("delete-char-btn"),
  branchesBtn: document.getElementById("branches-btn"),
  charForm: document.getElementById("char-form"),
  cancelEditBtn: document.getElementById("cancel-edit-btn"),
  themeToggle: document.getElementById("theme-toggle"),
  langToggle: document.getElementById("lang-toggle"),
  branchesModal: document.getElementById("branches-modal"),
  branchesList: document.getElementById("branches-list"),
  saveBranchBtn: document.getElementById("save-branch-btn"),
  branchesClose: document.getElementById("branches-close"),
};

const state = { characters: [], currentId: null, isStreaming: false, authMode: "login" };

function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function t(key) { return translations[currentLang][key] || key; }

// ─── Тема ──────────────────────────────────────────────────────────
(function initTheme() {
  const saved = localStorage.getItem("theme") || "dark";
  document.body.classList.toggle("light", saved === "light");
  els.themeToggle.textContent = saved === "light" ? "🌙" : "☀️";
})();
els.themeToggle.addEventListener("click", () => {
  const isLight = document.body.classList.toggle("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
  els.themeToggle.textContent = isLight ? "🌙" : "☀️";
});

// ─── Язык ──────────────────────────────────────────────────────────
els.langToggle.addEventListener("click", () => {
  currentLang = currentLang === "ru" ? "en" : "ru";
  localStorage.setItem("lang", currentLang);
  applyLanguage();
  renderCharacterList();
  if (state.currentId) selectCharacter(state.currentId, true); // обновить интерфейс
  else els.chatTitle.textContent = t("chat_title");
});

// ─── Auth ──────────────────────────────────────────────────────────
async function checkAuth() {
  const res = await fetch(`${API}/api/me`);
  const data = await res.json();
  if (data.authenticated) {
    document.getElementById("auth-screen").classList.add("hidden");
    await loadCharacters();
  } else {
    document.getElementById("auth-screen").classList.remove("hidden");
  }
}

document.querySelectorAll(".auth-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    state.authMode = tab.dataset.tab;
    document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("auth-submit").textContent =
      state.authMode === "login" ? t("btn_login") : t("tab_reg");
    document.getElementById("auth-error").textContent = "";
  });
});

document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("auth-username").value.trim();
  const password = document.getElementById("auth-password").value;
  const errEl = document.getElementById("auth-error");
  errEl.textContent = "";
  try {
    const res = await fetch(`${API}/api/${state.authMode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.detail || t("err_auth");
      return;
    }
    document.getElementById("auth-screen").classList.add("hidden");
    await loadCharacters();
  } catch (e) {
    errEl.textContent = t("err_net") + e.message;
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await fetch(`${API}/api/logout`, { method: "POST" });
  location.reload();
});

// ─── Персонажи ────────────────────────────────────────────────────
async function loadCharacters() {
  const res = await fetch(`${API}/api/characters`);
  state.characters = await res.json();
  renderCharacterList();
}

function renderCharacterList() {
  els.charList.innerHTML = "";
  if (state.characters.length === 0) {
    els.charList.innerHTML = `<li style="color:var(--text-dim);cursor:default">${t("hint_no_chars")}</li>`;
    return;
  }
  for (const c of state.characters) {
    const li = document.createElement("li");
    li.dataset.id = c.id;
    if (c.id === state.currentId) li.classList.add("active");
    li.innerHTML = `<span>${esc(c.name)}</span><span class="char-sub">T=${c.temperature}</span>`;
    li.addEventListener("click", () => selectCharacter(c.id));
    els.charList.appendChild(li);
  }
}

// ─── Чат ──────────────────────────────────────────────────────────
async function selectCharacter(id, forceUpdate = false) {
  state.currentId = id;
  const c = state.characters.find(x => x.id === id);
  els.chatTitle.textContent = c ? c.name : t("chat_title");

  [els.editCharBtn, els.clearChatBtn, els.deleteCharBtn, els.branchesBtn]
    .forEach(b => b.disabled = false);
  els.messageInput.disabled = false;
  els.sendBtn.disabled = false;

  showChatView();
  renderCharacterList();
  if (!forceUpdate) await refreshMessages();
}

async function refreshMessages() {
  if (!state.currentId) return;
  els.messages.innerHTML = "";
  const res = await fetch(`${API}/api/characters/${state.currentId}/messages`);
  const history = await res.json();
  if (history.length === 0) {
    els.messages.innerHTML = `<div class="empty-hint">${t("hint_start_chat")}</div>`;
    return;
  }
  history.forEach((m, i) => {
    const isLast = i === history.length - 1;
    renderMessage(m.role, m.content, m.id, isLast);
  });
  els.messages.scrollTop = els.messages.scrollHeight;
}

function populateActions(container, msgId, role, isLast) {
  container.innerHTML = "";
  const delBtn = document.createElement("button");
  delBtn.className = "msg-action";
  delBtn.title = t("confirm_del_msg");
  delBtn.textContent = "🗑";
  delBtn.onclick = () => deleteMessage(msgId);
  container.appendChild(delBtn);

  const delFromBtn = document.createElement("button");
  delFromBtn.className = "msg-action";
  delFromBtn.title = t("confirm_del_after");
  delFromBtn.textContent = "✂";
  delFromBtn.onclick = () => deleteFromMessage(msgId);
  container.appendChild(delFromBtn);

  if (isLast && role === "assistant") {
    const regenBtn = document.createElement("button");
    regenBtn.className = "msg-action";
    regenBtn.title = "Regenerate";
    regenBtn.textContent = "🔄";
    regenBtn.onclick = () => regenerate();
    container.appendChild(regenBtn);
  }
}

function renderMessage(role, content, id, isLast = false) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  if (id) div.dataset.id = id;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = content;

  const actions = document.createElement("div");
  actions.className = "msg-actions";
  if (id) populateActions(actions, id, role, isLast);

  div.appendChild(bubble);
  div.appendChild(actions);
  els.messages.appendChild(div);
  return { div, bubble, actions };
}

function renderStreamingMessage() {
  els.messages.querySelectorAll(".empty-hint").forEach(e => e.remove());
  const div = document.createElement("div");
  div.className = "message assistant";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const actions = document.createElement("div");
  actions.className = "msg-actions";
  div.appendChild(bubble);
  div.appendChild(actions);
  els.messages.appendChild(div);
  els.messages.scrollTop = els.messages.scrollHeight;
  return { div, bubble, actions };
}

// ─── Отправка / стриминг ─────────────────────────────────────────
async function sendMessage() {
  if (state.isStreaming || !state.currentId) return;
  const text = els.messageInput.value.trim();
  if (!text) return;
  els.messageInput.value = "";
  els.messages.querySelectorAll(".empty-hint").forEach(e => e.remove());
  renderMessage("user", text, null);
  await streamGeneration(`/api/chat/${state.currentId}`, { message: text });
}

async function regenerate() {
  if (state.isStreaming || !state.currentId) return;
  const last = els.messages.lastElementChild;
  if (last && last.classList.contains("assistant")) last.remove();
  await streamGeneration(`/api/chat/${state.currentId}/regenerate`, {});
}

async function streamGeneration(url, body) {
  state.isStreaming = true;
  els.sendBtn.disabled = true;
  const { div, bubble, actions } = renderStreamingMessage();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      bubble.textContent = `[${t("err_auth")}: ${err.detail || res.statusText}]`;
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalId = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop();
      for (const evt of events) {
        if (!evt.startsWith("data: ")) continue;
        const payload = JSON.parse(evt.slice(6));
        if (payload.delta) bubble.textContent += payload.delta;
        if (payload.error) bubble.textContent = `[Error: ${payload.error}]`;
        if (payload.done) finalId = payload.message_id;
        els.messages.scrollTop = els.messages.scrollHeight;
      }
    }
    if (finalId) {
      div.dataset.id = finalId;
      populateActions(actions, finalId, "assistant", true);
    }
  } catch (e) {
    bubble.textContent = `[${t("err_net")}${e.message}]`;
  } finally {
    state.isStreaming = false;
    els.sendBtn.disabled = false;
  }
}

// ─── Удаление сообщений ───────────────────────────────────────────
async function deleteMessage(msgId) {
  if (!confirm(t("confirm_del_msg"))) return;
  await fetch(`${API}/api/messages/${msgId}`, { method: "DELETE" });
  await refreshMessages();
}

async function deleteFromMessage(msgId) {
  if (!confirm(t("confirm_del_after"))) return;
  await fetch(`${API}/api/messages/${msgId}/from-here`, { method: "DELETE" });
  await refreshMessages();
}

// ─── Ветки сюжета ─────────────────────────────────────────────────
function openBranchesModal() { els.branchesModal.classList.remove("hidden"); loadBranchesList(); }
function closeBranchesModal() { els.branchesModal.classList.add("hidden"); }

async function loadBranchesList() {
  if (!state.currentId) return;
  els.branchesList.innerHTML = "";
  const res = await fetch(`${API}/api/characters/${state.currentId}/branches`);
  const branches = await res.json();
  if (branches.length === 0) {
    els.branchesList.innerHTML = `<li style="color:var(--text-dim);justify-content:center">${t("hint_no_branches")}</li>`;
    return;
  }
  for (const b of branches) {
    const li = document.createElement("li");
    const info = document.createElement("div");
    info.className = "branch-info";
    const date = new Date(b.created_at).toLocaleString(currentLang === "ru" ? "ru-RU" : "en-US");
    info.innerHTML = `<div class="branch-name">${esc(b.name)}</div><div class="branch-date">${esc(date)}</div>`;

    const actions = document.createElement("div");
    actions.className = "branch-actions";

    const loadBtn = document.createElement("button");
    loadBtn.className = "btn-primary";
    loadBtn.textContent = t("btn_load");
    loadBtn.onclick = () => loadBranch(b.id);

    const delBtn = document.createElement("button");
    delBtn.className = "btn-danger";
    delBtn.textContent = "🗑";
    delBtn.onclick = () => deleteBranch(b.id);

    actions.appendChild(loadBtn);
    actions.appendChild(delBtn);
    li.appendChild(info);
    li.appendChild(actions);
    els.branchesList.appendChild(li);
  }
}

async function saveBranch() {
  if (!state.currentId) return;
  const defaultName = currentLang === "ru" ? `Ветка ${new Date().toLocaleString("ru-RU")}` : `Branch ${new Date().toLocaleString("en-US")}`;
  const name = prompt(t("prompt_branch_name"), defaultName);
  if (name === null) return;
  const res = await fetch(`${API}/api/characters/${state.currentId}/branches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (res.ok) await loadBranchesList();
}

async function loadBranch(branchId) {
  if (!confirm(t("confirm_load_branch"))) return;
  const res = await fetch(`${API}/api/branches/${branchId}/load`, { method: "POST" });
  const data = await res.json();
  if (data.character_id && data.character_id !== state.currentId) {
    await selectCharacter(data.character_id);
  } else {
    await refreshMessages();
  }
  closeBranchesModal();
}

async function deleteBranch(branchId) {
  if (!confirm(t("confirm_del_branch"))) return;
  await fetch(`${API}/api/branches/${branchId}`, { method: "DELETE" });
  await loadBranchesList();
}

// ─── Редактор персонажа ───────────────────────────────────────────
function showChatView() {
  els.chatView.classList.remove("hidden");
  els.editorView.classList.add("hidden");
}
function showEditorView(mode, character = null) {
  els.chatView.classList.add("hidden");
  els.editorView.classList.remove("hidden");

  if (mode === "create") {
    els.editorTitle.textContent = t("editor_title_new");
    els.charForm.reset();
    $("char-id").value = "";
    $("temperature").value = "0.9";
  } else {
    els.editorTitle.textContent = (currentLang === "ru" ? "Редактирование: " : "Editing: ") + character.name;
    $("char-id").value = character.id;
    $("char-name").value = character.name || "";
    $("char-doc").value = character.character_doc || "";
    $("world-doc").value = character.world_doc || "";
    $("environment").value = character.environment || "";
    $("npcs").value = character.npcs || "";
    $("user-interaction").value = character.user_interaction || "";
    $("system-prompt").value = character.system_prompt || "";
    $("previous-chat").value = character.previous_chat || "";
    $("temperature").value = character.temperature ?? 0.9;
  }
  els.editorView.scrollTop = 0;
}

async function submitForm(e) {
  e.preventDefault();
  const id = $("char-id").value;
  const payload = {
    name: $("char-name").value,
    character_doc: $("char-doc").value,
    world_doc: $("world-doc").value,
    environment: $("environment").value,
    npcs: $("npcs").value,
    user_interaction: $("user-interaction").value,
    system_prompt: $("system-prompt").value,
    previous_chat: $("previous-chat").value,
    temperature: parseFloat($("temperature").value) || 0.9,
  };
  let url = `${API}/api/characters`, method = "POST";
  if (id) { url += `/${id}`; method = "PUT"; }
  const res = await fetch(url, {
    method, headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) { alert("Save error"); return; }
  const data = await res.json();
  await loadCharacters();
  await selectCharacter(id || data.id);
}

// ─── Файлы ────────────────────────────────────────────────────────
document.querySelectorAll(".file-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.getElementById(btn.dataset.target + "-file").click();
  });
});
document.querySelectorAll('input[type=file]').forEach(inp => {
  inp.addEventListener("change", async () => {
    const file = inp.files[0];
    if (!file) return;
    const text = await file.text();
    const targetId = inp.id.replace("-file", "");
    $(targetId).value = text;
    inp.value = "";
  });
});

// ─── События ──────────────────────────────────────────────────────
els.newCharBtn.addEventListener("click", () => showEditorView("create"));
els.cancelEditBtn.addEventListener("click", () => {
  if (state.currentId) showChatView();
  else { els.chatView.classList.remove("hidden"); els.editorView.classList.add("hidden"); }
});
els.charForm.addEventListener("submit", submitForm);
els.sendBtn.addEventListener("click", sendMessage);

els.messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

els.editCharBtn.addEventListener("click", async () => {
  if (!state.currentId) return;
  const res = await fetch(`${API}/api/characters/${state.currentId}`);
  const c = await res.json();
  showEditorView("edit", c);
});

els.clearChatBtn.addEventListener("click", async () => {
  if (!state.currentId) return;
  if (!confirm(t("confirm_clear_chat"))) return;
  await fetch(`${API}/api/characters/${state.currentId}/messages`, { method: "DELETE" });
  await refreshMessages();
});

els.deleteCharBtn.addEventListener("click", async () => {
  if (!state.currentId) return;
  if (!confirm(t("confirm_del_char"))) return;
  await fetch(`${API}/api/characters/${state.currentId}`, { method: "DELETE" });
  state.currentId = null;
  els.messages.innerHTML = `<div class="empty-hint">${t("hint_select")}</div>`;
  els.chatTitle.textContent = t("chat_title");
  [els.editCharBtn, els.clearChatBtn, els.deleteCharBtn, els.branchesBtn]
    .forEach(b => b.disabled = true);
  els.messageInput.disabled = true;
  els.sendBtn.disabled = true;
  await loadCharacters();
});

els.branchesBtn.addEventListener("click", openBranchesModal);
els.branchesClose.addEventListener("click", closeBranchesModal);
els.branchesModal.querySelector(".modal-backdrop").addEventListener("click", closeBranchesModal);
els.saveBranchBtn.addEventListener("click", saveBranch);

// ─── Старт ────────────────────────────────────────────────────────
applyLanguage();
checkAuth();