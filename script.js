(function(){
"use strict";

/* ==========================================================
   STATE
   ========================================================== */
var STORAGE_KEY = "splittrack_state_v1";
var state = null;
var currentSelection = new Set();     // selected roommate ids on dashboard (bulk remove)
var currentSplitType = "equal";       // active split type in expense modal
var editingExpenseId = null;          // id of expense being edited, or null for new

function defaultState(){
  return {
    userName: "",
    roomName: "",
    setupComplete: false,
    roommates: [],
    expenses: []
  };
}

/* ==========================================================
   STORAGE
   ========================================================== */
function loadState(){
  try{
    var raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    var parsed = JSON.parse(raw);
    if(typeof parsed !== "object" || parsed === null) return defaultState();
    var s = defaultState();
    if(typeof parsed.userName === "string") s.userName = parsed.userName;
    if(typeof parsed.roomName === "string") s.roomName = parsed.roomName;
    if(typeof parsed.setupComplete === "boolean") s.setupComplete = parsed.setupComplete;
    if(Array.isArray(parsed.roommates)){
      s.roommates = parsed.roommates.filter(function(r){
        return r && typeof r.id === "string" && typeof r.name === "string";
      }).map(function(r){
        return { id:r.id, name:r.name.trim(), isCurrentUser: !!r.isCurrentUser };
      }).filter(function(r){ return r.name.length > 0; });
      var currentIds = s.roommates.filter(function(r){ return r.isCurrentUser; });
      if(currentIds.length > 1){
        var keepId = currentIds[0].id;
        s.roommates.forEach(function(r){ if(r.id !== keepId) r.isCurrentUser = false; });
      }
      if(s.roommates.length > 0 && !s.roommates.some(function(r){ return r.isCurrentUser; }) && s.userName){
        var fallback = s.roommates.find(function(r){ return r.name.toLowerCase() === s.userName.toLowerCase(); }) || s.roommates[0];
        fallback.isCurrentUser = true;
      }
      var me = s.roommates.find(function(r){ return r.isCurrentUser; });
      if(me) s.userName = me.name;
    }
    if(Array.isArray(parsed.expenses)){
      s.expenses = parsed.expenses.filter(function(e){
        return e && typeof e.id === "string" && typeof e.amount === "number";
      }).map(function(e){
        return {
          id:e.id,
          title: typeof e.title === "string" ? e.title : "Untitled expense",
          amount: Number(e.amount) || 0,
          paidBy: typeof e.paidBy === "string" ? e.paidBy : null,
          participants: Array.isArray(e.participants) ? e.participants : [],
          splitType: ["equal","exact","percentage"].indexOf(e.splitType) !== -1 ? e.splitType : "equal",
          splits: (e.splits && typeof e.splits === "object") ? e.splits : {},
          category: typeof e.category === "string" ? e.category : "Other",
          createdAt: typeof e.createdAt === "number" ? e.createdAt : Date.now()
        };
      });
    }
    return s;
  }catch(err){
    console.warn("SplitTrack: could not read saved data, starting fresh.", err);
    return defaultState();
  }
}

function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }catch(err){
    console.warn("SplitTrack: could not save data.", err);
    showToast("Could not save changes on this device.");
  }
}

/* ==========================================================
   UTIL
   ========================================================== */
function uid(prefix){
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, function(c){
    return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c];
  });
}
function clamp2(n){ return Math.round((n + Number.EPSILON) * 100) / 100; }
function formatCurrency(n){
  var rounded = clamp2(n);
  if(rounded === 0) rounded = 0; // avoid "-0"
  var opts = { maximumFractionDigits:2, minimumFractionDigits: (Math.abs(rounded % 1) < 0.0001 ? 0 : 2) };
  var formatted;
  try{ formatted = Math.abs(rounded).toLocaleString("en-IN", opts); }
  catch(e){ formatted = Math.abs(rounded).toFixed(opts.minimumFractionDigits); }
  return (rounded < 0 ? "−₹" : "₹") + formatted;
}
function initials(name){
  var parts = name.trim().split(/\s+/).filter(Boolean);
  if(parts.length === 0) return "?";
  if(parts.length === 1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
function getRoommate(id){
  for(var i=0;i<state.roommates.length;i++){ if(state.roommates[i].id === id) return state.roommates[i]; }
  return null;
}
function roommateName(id){
  var r = getRoommate(id);
  return r ? r.name : "Former member";
}
function currentUser(){
  for(var i=0;i<state.roommates.length;i++){ if(state.roommates[i].isCurrentUser) return state.roommates[i]; }
  return state.roommates[0] || null;
}
var CATEGORY_ICONS = {
  Food:"🍜", Groceries:"🛒", Transport:"🚌", Rent:"🏠",
  Utilities:"💡", College:"🎓", Entertainment:"🎬", Other:"🧾"
};


/* ==========================================================
   THEME
   ========================================================== */
function applyTheme(theme){
  var root=document.documentElement;
  var isLight=theme === "light";
  root.setAttribute("data-theme", isLight ? "light" : "dark");
  try{ localStorage.setItem("splittrack_theme", isLight ? "light" : "dark"); }catch(e){}
  var btn=document.getElementById("theme-toggle");
  if(btn){
    var icon=btn.querySelector(".theme-icon");
    var label=btn.querySelector(".theme-label");
    if(icon) icon.textContent=isLight ? "☀" : "☾";
    if(label) label.textContent=isLight ? "Light" : "Dark";
    btn.setAttribute("aria-label", isLight ? "Switch to dark mode" : "Switch to light mode");
    btn.setAttribute("title", isLight ? "Switch to dark mode" : "Switch to light mode");
  }
}
function initTheme(){
  var saved=null;
  try{ saved=localStorage.getItem("splittrack_theme"); }catch(e){}
  applyTheme(saved === "light" ? "light" : "dark");
}

/* ==========================================================
   NAVIGATION
   ========================================================== */
function determineScreen(){
  if(!state.userName) return "landing";
  if(!state.roomName) return "room";
  if(!state.setupComplete) return "roommates";
  return "dashboard";
}


  function replayLandingIntro(){
    var landing = document.getElementById("landing-screen");
    if(!landing) return;
    var revealEls = landing.querySelectorAll(".landing-reveal");
    revealEls.forEach(function(el){
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animation = "";
    });
  }

function showScreen(name){
  var screens = document.querySelectorAll(".app-screen");
  var target = document.getElementById(name + "-screen");
  if(!target) return;
  screens.forEach(function(s){
    if(s !== target){ s.classList.remove("active","enter"); }
  });
  // Keep transitions fluid while retaining the existing state-based navigation.
  target.classList.remove("enter");
  target.classList.add("active");
  // eslint-disable-next-line no-unused-expressions
  target.offsetHeight;
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){ target.classList.add("enter"); });
  });
  // Screen navigation is state-based; do not use scrolling as navigation.
}

/* ==========================================================
   TOASTS
   ========================================================== */
function showToast(message){
  var container = document.getElementById("toast-container");
  var el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){ el.classList.add("show"); });
  });
  setTimeout(function(){
    el.classList.remove("show");
    setTimeout(function(){ el.remove(); }, 260);
  }, 3000);
}

/* ==========================================================
   MODALS
   ========================================================== */
var lastFocusedEl = null;

function openModal(id){
  lastFocusedEl = document.activeElement;
  var overlay = document.getElementById(id);
  overlay.classList.add("open");
  document.body.classList.add("modal-open");
  var firstInput = overlay.querySelector("input, select, textarea, button.btn-primary");
  if(firstInput) setTimeout(function(){ firstInput.focus(); }, 60);
  document.addEventListener("keydown", onModalKeydown);
}
function closeModal(id){
  var overlay = document.getElementById(id);
  overlay.classList.remove("open");
  if(!document.querySelector(".modal-overlay.open")) document.body.classList.remove("modal-open");
  document.removeEventListener("keydown", onModalKeydown);
  if(lastFocusedEl && typeof lastFocusedEl.focus === "function") lastFocusedEl.focus();
}
function onModalKeydown(e){
  if(e.key === "Escape"){
    document.querySelectorAll(".modal-overlay.open").forEach(function(o){ closeModal(o.id); });
  }
}
document.addEventListener("click", function(e){
  var closeBtn = e.target.closest("[data-close-modal]");
  if(closeBtn){ closeModal(closeBtn.getAttribute("data-close-modal")); return; }
  if(e.target.classList && e.target.classList.contains("modal-overlay")){
    closeModal(e.target.id);
  }
});

function openConfirm(opts){
  document.getElementById("confirm-modal-title").textContent = opts.title || "Are you sure?";
  document.getElementById("confirm-modal-message").innerHTML = opts.message || "";
  var confirmBtn = document.getElementById("confirm-modal-confirm");
  confirmBtn.textContent = opts.confirmLabel || "Yes, continue";
  confirmBtn.className = "btn " + (opts.danger === false ? "btn-primary" : "btn-danger");
  var newBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
  newBtn.addEventListener("click", function(){
    closeModal("confirm-modal-overlay");
    if(typeof opts.onConfirm === "function") opts.onConfirm();
  });
  document.getElementById("confirm-modal-cancel").onclick = function(){ closeModal("confirm-modal-overlay"); };
  openModal("confirm-modal-overlay");
}

/* ==========================================================
   ONBOARDING - WELCOME
   ========================================================== */
document.getElementById("welcome-form").addEventListener("submit", function(e){
  e.preventDefault();
  var field = document.getElementById("welcome-name-field");
  var input = document.getElementById("welcome-name-input");
  var name = input.value.trim();
  if(!name){
    field.classList.add("invalid");
    input.focus();
    return;
  }
  field.classList.remove("invalid");
  state.userName = name;
  saveState();
  prepareRoomScreen();
  showScreen("room");
});

function prepareRoomScreen(){
  document.getElementById("room-greeting-pill").textContent = "Nice to meet you, " + state.userName + " 👋";
  document.getElementById("room-name-input").value = state.roomName || "";
}

/* ==========================================================
   ONBOARDING - CREATE ROOM
   ========================================================== */
document.getElementById("room-form").addEventListener("submit", function(e){
  e.preventDefault();
  var field = document.getElementById("room-name-field");
  var input = document.getElementById("room-name-input");
  var name = input.value.trim();
  if(!name){
    field.classList.add("invalid");
    input.focus();
    return;
  }
  field.classList.remove("invalid");
  state.roomName = name;
  if(state.roommates.length === 0){
    state.roommates.push({ id: uid("u"), name: state.userName, isCurrentUser:true });
  }
  saveState();
  prepareRoommatesScreen();
  showScreen("roommates");
});

/* ==========================================================
   ONBOARDING - ADD ROOMMATES
   ========================================================== */
function prepareRoommatesScreen(){
  document.getElementById("roommates-room-name").textContent = state.roomName;
  renderRoommatesOnboardingList();
}

function renderRoommatesOnboardingList(){
  var list = document.getElementById("roommates-list");
  var badge = document.getElementById("roommates-count-badge");
  badge.textContent = state.roommates.length;
  if(state.roommates.length === 0){
    list.innerHTML = '<div class="empty-state"><div class="glyph">🧍</div><div class="title">No roommates yet.</div><div class="sub">You\'re the only one here.</div></div>';
    return;
  }
  var html = "";
  state.roommates.forEach(function(r){
    html += '<div class="roommate-item">' +
      '<div class="avatar ' + (r.isCurrentUser ? "you" : "") + '">' + escapeHtml(initials(r.name)) + '</div>' +
      '<div class="roommate-meta"><div class="name">' + escapeHtml(r.name) + '</div>' +
      '<div class="tag">' + (r.isCurrentUser ? "You" : "Roommate") + '</div></div>' +
      '<div class="roommate-actions">' +
        (r.isCurrentUser ? "" : '<button type="button" class="btn-icon" data-remove-onboard="' + r.id + '" aria-label="Remove ' + escapeHtml(r.name) + '">✕</button>') +
      '</div>' +
    '</div>';
  });
  list.innerHTML = html;
}

function addRoommateFromOnboarding(){
  var input = document.getElementById("roommate-name-input");
  var errorEl = document.getElementById("roommate-add-error");
  var name = input.value.trim();
  errorEl.style.display = "none";
  if(!name){
    errorEl.textContent = "Enter a name to add a roommate.";
    errorEl.style.display = "block";
    input.focus();
    return;
  }
  var dup = state.roommates.some(function(r){ return r.name.toLowerCase() === name.toLowerCase(); });
  if(dup){
    errorEl.textContent = "\"" + name + "\" is already in this room.";
    errorEl.style.display = "block";
    input.focus();
    return;
  }
  state.roommates.push({ id: uid("u"), name: name, isCurrentUser:false });
  saveState();
  input.value = "";
  renderRoommatesOnboardingList();
  input.focus();
}

document.getElementById("roommate-add-btn").addEventListener("click", addRoommateFromOnboarding);
document.getElementById("roommate-name-input").addEventListener("keydown", function(e){
  if(e.key === "Enter"){ e.preventDefault(); addRoommateFromOnboarding(); }
});
document.getElementById("roommates-list").addEventListener("click", function(e){
  var btn = e.target.closest("[data-remove-onboard]");
  if(!btn) return;
  var id = btn.getAttribute("data-remove-onboard");
  var r = getRoommate(id);
  if(!r) return;
  openConfirm({
    title: "Remove " + r.name.toUpperCase() + "?",
    message: "Are you sure you want to remove <b>" + escapeHtml(r.name) + "</b> from this room?",
    confirmLabel: "Yes, remove",
    onConfirm: function(){
      state.roommates = state.roommates.filter(function(x){ return x.id !== id; });
      saveState();
      renderRoommatesOnboardingList();
      showToast(r.name + " was removed.");
    }
  });
});
document.getElementById("roommates-finish-btn").addEventListener("click", function(){
  state.setupComplete = true;
  saveState();
  prepareDashboard();
  showScreen("dashboard");
});

/* ==========================================================
   ROOMMATE MANAGEMENT (shared: onboarding + dashboard)
   ========================================================== */
function renameRoommate(id, newName){
  var r = getRoommate(id);
  if(!r) return { ok:false, error:"Roommate not found." };
  var trimmed = newName.trim();
  if(!trimmed) return { ok:false, error:"Enter a valid name." };
  var dup = state.roommates.some(function(x){ return x.id !== id && x.name.toLowerCase() === trimmed.toLowerCase(); });
  if(dup) return { ok:false, error:"That name is already in use." };
  r.name = trimmed;
  if(r.isCurrentUser){
    state.userName = trimmed;
  }
  saveState();
  return { ok:true };
}

function addRoommateDashboard(name){
  var trimmed = name.trim();
  if(!trimmed) return { ok:false, error:"Enter a valid name." };
  var dup = state.roommates.some(function(x){ return x.name.toLowerCase() === trimmed.toLowerCase(); });
  if(dup) return { ok:false, error:"That name is already in this room." };
  state.roommates.push({ id: uid("u"), name: trimmed, isCurrentUser:false });
  saveState();
  return { ok:true };
}

/* ==========================================================
   DASHBOARD - PREP / GREETING / SUMMARY
   ========================================================== */
function prepareDashboard(){
  currentSelection.clear();
  renderDashboard();
}

function renderDashboard(){
  var me = currentUser();
  document.getElementById("dash-room-name").textContent = state.roomName;
  document.getElementById("dash-user-name").textContent = me ? me.name : state.userName;
  document.getElementById("dash-greeting-text").textContent = "Hey, " + (me ? me.name : state.userName) + ".";

  renderSummary();
  renderExpenseList();
  renderPeopleList();
  renderBalances();
  renderSettlements();
}

function renderSummary(){
  var total = state.expenses.reduce(function(sum,e){ return sum + e.amount; }, 0);
  var me = currentUser();
  var yourShare = 0;
  if(me){
    state.expenses.forEach(function(e){
      if(e.splits && typeof e.splits[me.id] === "number") yourShare += e.splits[me.id];
    });
  }
  document.getElementById("stat-total").textContent = formatCurrency(total);
  document.getElementById("stat-your-share").textContent = formatCurrency(yourShare);
  document.getElementById("stat-count").textContent = state.expenses.length;
}

/* ==========================================================
   DASHBOARD - PEOPLE
   ========================================================== */
function renderPeopleList(){
  var container = document.getElementById("people-list");
  var hint = document.getElementById("people-total-hint");
  hint.textContent = state.roommates.length + (state.roommates.length === 1 ? " person in this room" : " people in this room");

  if(state.roommates.length === 0){
    container.innerHTML = '<div class="empty-state"><div class="glyph">🧍</div><div class="title">No roommates yet.</div><div class="sub">You\'re the only one here.</div></div>';
    updateBulkRemoveButton();
    return;
  }

  var html = "";
  state.roommates.forEach(function(r){
    var checked = currentSelection.has(r.id) ? "checked" : "";
    html += '<div class="check-row">' +
      '<input type="checkbox" class="person-check" ' +
        (r.isCurrentUser ? 'disabled aria-label="' + escapeHtml(r.name) + ' cannot be removed"' : 'data-select-person="' + r.id + '" ' + checked + ' aria-label="Select ' + escapeHtml(r.name) + '"') +
      '>' +
      '<div class="avatar ' + (r.isCurrentUser ? "you" : "") + '" style="width:30px;height:30px;font-size:12px;">' + escapeHtml(initials(r.name)) + '</div>' +
      '<div class="row-label">' + escapeHtml(r.name) + ' ' + (r.isCurrentUser ? '<span class="badge you">You</span>' : '<span class="badge member">Member</span>') + '</div>' +
      '<div class="roommate-actions">' +
        '<button type="button" class="btn-icon" data-edit-person="' + r.id + '" aria-label="Edit ' + escapeHtml(r.name) + '">✎</button>' +
        (r.isCurrentUser ? "" : '<button type="button" class="btn-icon" data-remove-person="' + r.id + '" aria-label="Remove ' + escapeHtml(r.name) + '">✕</button>') +
      '</div>' +
    '</div>';
  });
  container.innerHTML = html;
  updateBulkRemoveButton();

  var selectableCount = state.roommates.filter(function(r){ return !r.isCurrentUser; }).length;
  var selectAll = document.getElementById("select-all-people");
  selectAll.disabled = selectableCount === 0;
  selectAll.checked = selectableCount > 0 && currentSelection.size === selectableCount;
}

function updateBulkRemoveButton(){
  var btn = document.getElementById("bulk-remove-btn");
  btn.textContent = "Remove selected (" + currentSelection.size + ")";
  btn.disabled = currentSelection.size === 0;
}

document.getElementById("people-list").addEventListener("change", function(e){
  var cb = e.target.closest("[data-select-person]");
  if(!cb) return;
  var id = cb.getAttribute("data-select-person");
  if(cb.checked) currentSelection.add(id); else currentSelection.delete(id);
  updateBulkRemoveButton();
  var selectableCount = state.roommates.filter(function(r){ return !r.isCurrentUser; }).length;
  document.getElementById("select-all-people").checked = selectableCount > 0 && currentSelection.size === selectableCount;
});

document.getElementById("select-all-people").addEventListener("change", function(e){
  currentSelection.clear();
  if(e.target.checked){
    state.roommates.forEach(function(r){ if(!r.isCurrentUser) currentSelection.add(r.id); });
  }
  renderPeopleList();
});

document.getElementById("people-list").addEventListener("click", function(e){
  var editBtn = e.target.closest("[data-edit-person]");
  var removeBtn = e.target.closest("[data-remove-person]");
  if(editBtn){ openRoommateModal(editBtn.getAttribute("data-edit-person")); return; }
  if(removeBtn){
    var id = removeBtn.getAttribute("data-remove-person");
    var r = getRoommate(id);
    if(!r || r.isCurrentUser) return;
    var historyCount = state.expenses.filter(function(e){
      return e.paidBy === id || (Array.isArray(e.participants) && e.participants.indexOf(id) !== -1);
    }).length;
    var historyNote = historyCount ? "<br><br><span style=\"color:var(--ink-faint)\">" + historyCount + " existing expense" + (historyCount === 1 ? "" : "s") + " reference this roommate; those records will be kept.</span>" : "";
    openConfirm({
      title: "Remove " + r.name.toUpperCase() + "?",
      message: "Are you sure you want to remove <b>" + escapeHtml(r.name) + "</b> from this room?" + historyNote,
      confirmLabel: "Yes, remove",
      onConfirm: function(){
        state.roommates = state.roommates.filter(function(x){ return x.id !== id; });
        currentSelection.delete(id);
        saveState();
        renderDashboard();
        showToast(r.name + " was removed from the room.");
      }
    });
  }
});

document.getElementById("bulk-remove-btn").addEventListener("click", function(){
  if(currentSelection.size === 0) return;
  var names = Array.from(currentSelection).map(roommateName);
  var selectedHistoryCount = state.expenses.filter(function(e){
    return currentSelection.has(e.paidBy) || (Array.isArray(e.participants) && e.participants.some(function(pid){ return currentSelection.has(pid); }));
  }).length;
  var bulkHistoryNote = selectedHistoryCount ? "<br><br><span style=\"color:var(--ink-faint)\">" + selectedHistoryCount + " existing expense" + (selectedHistoryCount === 1 ? "" : "s") + " reference selected roommates; those records will be kept.</span>" : "";
  openConfirm({
    title: "Remove " + currentSelection.size + " roommate" + (currentSelection.size === 1 ? "" : "s") + "?",
    message: "Are you sure you want to remove these selected roommates from this room?<br><br><b>" + names.map(escapeHtml).join(", ") + "</b>" + bulkHistoryNote,
    confirmLabel: "Yes, remove",
    onConfirm: function(){
      var ids = Array.from(currentSelection);
      state.roommates = state.roommates.filter(function(r){ return ids.indexOf(r.id) === -1 || r.isCurrentUser; });
      currentSelection.clear();
      saveState();
      renderDashboard();
      showToast(ids.length + " roommates removed.");
    }
  });
});

document.getElementById("dash-add-roommate-btn").addEventListener("click", function(){ openRoommateModal(null); });

function openRoommateModal(id){
  var title = document.getElementById("roommate-modal-title");
  var idInput = document.getElementById("roommate-modal-id-input");
  var nameInput = document.getElementById("roommate-modal-name-input");
  var field = document.getElementById("roommate-modal-name-field");
  field.classList.remove("invalid");
  if(id){
    var r = getRoommate(id);
    title.textContent = "Edit roommate";
    idInput.value = id;
    nameInput.value = r ? r.name : "";
  } else {
    title.textContent = "Add roommate";
    idInput.value = "";
    nameInput.value = "";
  }
  openModal("roommate-modal-overlay");
}

document.getElementById("roommate-modal-save-btn").addEventListener("click", function(){
  var id = document.getElementById("roommate-modal-id-input").value;
  var nameInput = document.getElementById("roommate-modal-name-input");
  var field = document.getElementById("roommate-modal-name-field");
  var errorEl = field.querySelector(".field-error");
  var name = nameInput.value.trim();

  var result;
  if(id){ result = renameRoommate(id, name); }
  else { result = addRoommateDashboard(name); }

  if(!result.ok){
    errorEl.textContent = result.error;
    field.classList.add("invalid");
    nameInput.focus();
    return;
  }
  field.classList.remove("invalid");
  closeModal("roommate-modal-overlay");
  renderDashboard();
  showToast(id ? "Roommate renamed." : "Roommate added.");
});
document.getElementById("roommate-form").addEventListener("submit", function(e){ e.preventDefault(); document.getElementById("roommate-modal-save-btn").click(); });

/* ==========================================================
   DASHBOARD - RESET ROOM
   ========================================================== */
document.getElementById("reset-room-btn").addEventListener("click", function(){
  openConfirm({
    title: "Start over?",
    message: "This will remove the current room and its local data. This cannot be undone.",
    confirmLabel: "Start over",
    onConfirm: function(){
      state = defaultState();
      saveState();
      currentSelection.clear();
      document.getElementById("welcome-name-input").value = "";
      document.getElementById("room-name-input").value = "";
      showScreen("welcome");
      showToast("Room reset. Starting fresh.");
    }
  });
});

/* ==========================================================
   EXPENSES - CALCULATIONS
   ========================================================== */
function computeEqualSplit(amount, participantIds){
  var n = participantIds.length;
  if(n === 0) return {};
  var base = Math.floor((amount / n) * 100) / 100;
  var remainder = clamp2(amount - base * n);
  var splits = {};
  participantIds.forEach(function(id, idx){
    splits[id] = base + (idx < Math.round(remainder * 100) ? 0.01 : 0);
  });
  // Simpler, robust approach: distribute remainder cents one by one
  splits = {};
  var cents = Math.round(amount * 100);
  var baseCents = Math.floor(cents / n);
  var extra = cents - baseCents * n;
  participantIds.forEach(function(id, idx){
    var c = baseCents + (idx < extra ? 1 : 0);
    splits[id] = clamp2(c / 100);
  });
  return splits;
}

function validateExactSplit(amount, values){
  var sum = 0;
  var valid = true;
  Object.keys(values).forEach(function(k){
    var n = Number(values[k]);
    if(!Number.isFinite(n) || n < 0) valid = false;
    sum += Number.isFinite(n) && n >= 0 ? n : 0;
  });
  return valid && Math.abs(clamp2(sum) - clamp2(amount)) < 0.01;
}
function validatePercentageSplit(values){
  var sum = 0;
  var valid = true;
  Object.keys(values).forEach(function(k){
    var n = Number(values[k]);
    if(!Number.isFinite(n) || n < 0 || n > 100) valid = false;
    sum += Number.isFinite(n) && n >= 0 ? n : 0;
  });
  return valid && Math.abs(clamp2(sum) - 100) < 0.01;
}
function percentagesToSplits(amount, percentages){
  var ids = Object.keys(percentages);
  var splits = {};
  if(ids.length === 0) return splits;

  var totalCents = Math.round(amount * 100);
  var rawCents = ids.map(function(id){
    return { id:id, cents:(amount * (Number(percentages[id]) || 0) / 100) * 100 };
  });

  var baseTotal = 0;
  rawCents.forEach(function(item){
    item.floor = Math.floor(item.cents);
    item.frac = item.cents - item.floor;
    baseTotal += item.floor;
  });

  var remaining = totalCents - baseTotal;
  rawCents.sort(function(a,b){ return b.frac - a.frac; });
  rawCents.forEach(function(item, index){
    var cents = item.floor + (index < remaining ? 1 : 0);
    splits[item.id] = clamp2(cents / 100);
  });

  return splits;
}

function computeBalances(){
  var balances = {};
  state.roommates.forEach(function(r){ balances[r.id] = 0; });
  state.expenses.forEach(function(e){
    if(e.paidBy){ balances[e.paidBy] = (balances[e.paidBy] || 0) + e.amount; }
    Object.keys(e.splits || {}).forEach(function(pid){
      balances[pid] = (balances[pid] || 0) - (Number(e.splits[pid]) || 0);
    });
  });
  Object.keys(balances).forEach(function(k){ balances[k] = clamp2(balances[k]); });
  return balances;
}

function computeSettlements(balances){
  var creditors = [], debtors = [];
  Object.keys(balances).forEach(function(id){
    var bal = balances[id];
    if(bal > 0.005) creditors.push({ id:id, amt:bal });
    else if(bal < -0.005) debtors.push({ id:id, amt:-bal });
  });
  creditors.sort(function(a,b){ return b.amt - a.amt; });
  debtors.sort(function(a,b){ return b.amt - a.amt; });
  var settlements = [];
  var i=0, j=0;
  while(i < debtors.length && j < creditors.length){
    var pay = Math.min(debtors[i].amt, creditors[j].amt);
    if(pay > 0.005){ settlements.push({ from:debtors[i].id, to:creditors[j].id, amount:clamp2(pay) }); }
    debtors[i].amt = clamp2(debtors[i].amt - pay);
    creditors[j].amt = clamp2(creditors[j].amt - pay);
    if(debtors[i].amt < 0.005) i++;
    if(creditors[j].amt < 0.005) j++;
  }
  return settlements;
}

/* ==========================================================
   EXPENSES - MODAL
   ========================================================== */
function openExpenseModal(expenseId){
  editingExpenseId = expenseId || null;
  var existing = expenseId ? state.expenses.find(function(e){ return e.id === expenseId; }) : null;

  document.getElementById("expense-modal-title").textContent = existing ? "Edit expense" : "Add expense";
  document.getElementById("expense-id-input").value = existing ? existing.id : "";
  document.getElementById("expense-title-input").value = existing ? existing.title : "";
  document.getElementById("expense-amount-input").value = existing ? existing.amount : "";
  document.getElementById("expense-category-input").value = existing ? existing.category : "Food";

  var paidBySelect = document.getElementById("expense-paidby-input");
  paidBySelect.innerHTML = state.roommates.map(function(r){
    return '<option value="' + r.id + '">' + escapeHtml(r.name) + (r.isCurrentUser ? " (You)" : "") + '</option>';
  }).join("");
  paidBySelect.value = existing ? existing.paidBy : (currentUser() ? currentUser().id : (state.roommates[0] ? state.roommates[0].id : ""));

  var participantIds = existing ? existing.participants.slice() : state.roommates.map(function(r){ return r.id; });
  renderParticipantsList(participantIds);

  currentSplitType = existing ? existing.splitType : "equal";
  document.querySelectorAll("#split-type-segmented button").forEach(function(b){
    b.classList.toggle("active", b.getAttribute("data-split") === currentSplitType);
  });

  renderSplitEditor(existing);

  ["expense-title-field","expense-amount-field","expense-paidby-field","expense-participants-field"].forEach(function(id){
    document.getElementById(id).classList.remove("invalid");
  });

  openModal("expense-modal-overlay");
}

function renderParticipantsList(selectedIds){
  var container = document.getElementById("expense-participants-list");
  var html = "";
  state.roommates.forEach(function(r){
    var checked = selectedIds.indexOf(r.id) !== -1 ? "checked" : "";
    html += '<label class="check-row participant-row">' +
      '<input type="checkbox" data-participant="' + r.id + '" ' + checked + '>' +
      '<span class="row-label">' + escapeHtml(r.name) + (r.isCurrentUser ? " (You)" : "") + '</span>' +
    '</label>';
  });
  container.innerHTML = html || '<p class="field-hint">Add roommates first.</p>';
}

function getSelectedParticipants(){
  return Array.from(document.querySelectorAll("#expense-participants-list [data-participant]:checked"))
    .map(function(cb){ return cb.getAttribute("data-participant"); });
}

document.getElementById("expense-participants-list").addEventListener("change", function(){
  renderSplitEditor(null);
});

document.getElementById("split-type-segmented").addEventListener("click", function(e){
  var btn = e.target.closest("button[data-split]");
  if(!btn) return;
  currentSplitType = btn.getAttribute("data-split");
  document.querySelectorAll("#split-type-segmented button").forEach(function(b){ b.classList.toggle("active", b === btn); });
  renderSplitEditor(null);
});

document.getElementById("expense-amount-input").addEventListener("input", function(){ renderSplitEditor(null); });

function renderSplitEditor(existingExpense){
  var amount = Number(document.getElementById("expense-amount-input").value) || 0;
  var participants = getSelectedParticipants();
  var label = document.getElementById("split-editor-label");
  var list = document.getElementById("split-editor-list");
  var totalRow = document.getElementById("split-total-row");

  if(participants.length === 0){
    list.innerHTML = '<p class="field-hint">Select participants to see the split.</p>';
    totalRow.textContent = "";
    totalRow.className = "split-total-row";
    return;
  }

  if(currentSplitType === "equal"){
    label.textContent = "Split preview (equal)";
    var eqSplits = computeEqualSplit(amount, participants);
    list.innerHTML = participants.map(function(id){
      return '<div class="split-editor-row"><span class="name">' + escapeHtml(roommateName(id)) + '</span><span style="font-weight:700;">' + formatCurrency(eqSplits[id] || 0) + '</span></div>';
    }).join("");
    totalRow.innerHTML = "";
    totalRow.className = "split-total-row";
    return;
  }

  if(currentSplitType === "exact"){
    label.textContent = "Exact amounts (₹)";
    var existingVals = {};
    if(existingExpense && existingExpense.splitType === "exact"){ existingVals = existingExpense.splits; }
    list.innerHTML = participants.map(function(id){
      var v = existingVals[id] !== undefined ? existingVals[id] : "";
      return '<div class="split-editor-row"><span class="name">' + escapeHtml(roommateName(id)) + '</span>' +
        '<input type="number" step="0.01" min="0" data-exact="' + id + '" value="' + v + '" placeholder="0.00" inputmode="decimal"></div>';
    }).join("");
    updateSplitTotalDisplay();
    list.oninput = updateSplitTotalDisplay;
    return;
  }

  if(currentSplitType === "percentage"){
    label.textContent = "Percentages (%)";
    var existingPct = {};
    if(existingExpense && existingExpense.splitType === "percentage" && existingExpense.amount > 0){
      participants.forEach(function(id){
        if(existingExpense.splits[id] !== undefined){
          existingPct[id] = clamp2((existingExpense.splits[id] / existingExpense.amount) * 100);
        }
      });
    }
    var evenPct = clamp2(100 / participants.length);
    list.innerHTML = participants.map(function(id){
      var v = existingPct[id] !== undefined ? existingPct[id] : evenPct;
      return '<div class="split-editor-row"><span class="name">' + escapeHtml(roommateName(id)) + '</span>' +
        '<input type="number" step="0.01" min="0" max="100" data-pct="' + id + '" value="' + v + '" inputmode="decimal"></div>';
    }).join("");
    updateSplitTotalDisplay();
    list.oninput = updateSplitTotalDisplay;
    return;
  }
}

function updateSplitTotalDisplay(){
  var totalRow = document.getElementById("split-total-row");
  var amount = Number(document.getElementById("expense-amount-input").value) || 0;
  if(currentSplitType === "exact"){
    var vals = {};
    document.querySelectorAll("#split-editor-list [data-exact]").forEach(function(inp){
      vals[inp.getAttribute("data-exact")] = inp.value;
    });
    var sum = Object.keys(vals).reduce(function(s,k){ return s + (Number(vals[k]) || 0); }, 0);
    var ok = validateExactSplit(amount, vals);
    totalRow.className = "split-total-row " + (ok ? "ok" : "bad");
    totalRow.innerHTML = "<span>Total entered</span><span>" + formatCurrency(sum) + " of " + formatCurrency(amount) + "</span>";
  } else if(currentSplitType === "percentage"){
    var pvals = {};
    document.querySelectorAll("#split-editor-list [data-pct]").forEach(function(inp){
      pvals[inp.getAttribute("data-pct")] = inp.value;
    });
    var psum = Object.keys(pvals).reduce(function(s,k){ return s + (Number(pvals[k]) || 0); }, 0);
    var pok = validatePercentageSplit(pvals);
    totalRow.className = "split-total-row " + (pok ? "ok" : "bad");
    totalRow.innerHTML = "<span>Total entered</span><span>" + clamp2(psum) + "% of 100%</span>";
  }
}

document.getElementById("expense-form").addEventListener("keydown", function(e){
  if(e.key === "Enter" && e.target.tagName !== "TEXTAREA"){
    e.preventDefault();
    document.getElementById("expense-save-btn").click();
  }
});

document.getElementById("expense-save-btn").addEventListener("click", function(){
  var titleField = document.getElementById("expense-title-field");
  var amountField = document.getElementById("expense-amount-field");
  var paidByField = document.getElementById("expense-paidby-field");
  var participantsField = document.getElementById("expense-participants-field");
  [titleField, amountField, paidByField, participantsField].forEach(function(f){ f.classList.remove("invalid"); });

  var title = document.getElementById("expense-title-input").value.trim();
  var amount = Number(document.getElementById("expense-amount-input").value);
  var paidBy = document.getElementById("expense-paidby-input").value;
  var category = document.getElementById("expense-category-input").value;
  var participants = getSelectedParticipants();

  var hasError = false;
  if(!title){ titleField.classList.add("invalid"); hasError = true; }
  if(!Number.isFinite(amount) || amount <= 0){ amountField.classList.add("invalid"); hasError = true; }
  if(!paidBy || !getRoommate(paidBy)){ paidByField.classList.add("invalid"); hasError = true; }
  if(participants.length === 0 || participants.some(function(id){ return !getRoommate(id); })){ participantsField.classList.add("invalid"); hasError = true; }
  if(hasError) return;

  var splits;
  if(currentSplitType === "equal"){
    splits = computeEqualSplit(amount, participants);
  } else if(currentSplitType === "exact"){
    var exactVals = {};
    document.querySelectorAll("#split-editor-list [data-exact]").forEach(function(inp){
      exactVals[inp.getAttribute("data-exact")] = Number(inp.value) || 0;
    });
    if(!validateExactSplit(amount, exactVals)){
      showToast("Exact amounts must add up to the total.");
      return;
    }
    splits = {};
    participants.forEach(function(id){ splits[id] = clamp2(exactVals[id] || 0); });
  } else {
    var pctVals = {};
    document.querySelectorAll("#split-editor-list [data-pct]").forEach(function(inp){
      pctVals[inp.getAttribute("data-pct")] = Number(inp.value) || 0;
    });
    if(!validatePercentageSplit(pctVals)){
      showToast("Percentages must add up to 100%.");
      return;
    }
    splits = percentagesToSplits(amount, pctVals);
  }

  if(editingExpenseId){
    var idx = state.expenses.findIndex(function(e){ return e.id === editingExpenseId; });
    if(idx !== -1){
      state.expenses[idx] = {
        id: editingExpenseId,
        title: title, amount: clamp2(amount), paidBy: paidBy,
        participants: participants, splitType: currentSplitType, splits: splits,
        category: category, createdAt: state.expenses[idx].createdAt
      };
    }
    showToast("Expense updated.");
  } else {
    state.expenses.unshift({
      id: uid("e"), title: title, amount: clamp2(amount), paidBy: paidBy,
      participants: participants, splitType: currentSplitType, splits: splits,
      category: category, createdAt: Date.now()
    });
    showToast("Expense added.");
  }

  saveState();
  closeModal("expense-modal-overlay");
  renderDashboard();
});

document.getElementById("add-expense-btn").addEventListener("click", function(){
  if(state.roommates.length === 0){
    showToast("Add roommates before creating an expense.");
    return;
  }
  openExpenseModal(null);
});

/* ==========================================================
   EXPENSES - LIST / SEARCH / FILTER
   ========================================================== */
function renderExpenseList(){
  var searchTerm = (document.getElementById("expense-search").value || "").trim().toLowerCase();
  var categoryFilter = document.getElementById("expense-filter-category").value;
  var container = document.getElementById("expense-list");

  var filtered = state.expenses.filter(function(e){
    if(categoryFilter && e.category !== categoryFilter) return false;
    if(!searchTerm) return true;
    var payer = roommateName(e.paidBy).toLowerCase();
    var participantNames = e.participants.map(roommateName).join(" ").toLowerCase();
    return e.title.toLowerCase().indexOf(searchTerm) !== -1 ||
           e.category.toLowerCase().indexOf(searchTerm) !== -1 ||
           payer.indexOf(searchTerm) !== -1 ||
           participantNames.indexOf(searchTerm) !== -1;
  });

  if(state.expenses.length === 0){
    container.innerHTML = '<div class="empty-state"><div class="glyph">🧾</div><div class="title">No expenses yet.</div><div class="sub">Add your first shared expense.</div></div>';
    return;
  }
  if(filtered.length === 0){
    container.innerHTML = '<div class="empty-state"><div class="glyph">🔎</div><div class="title">No matching expenses.</div><div class="sub">Try a different search or filter.</div></div>';
    return;
  }

  container.innerHTML = filtered.map(function(e){
    var icon = CATEGORY_ICONS[e.category] || "🧾";
    var payer = roommateName(e.paidBy);
    var splitLabel = e.splitType === "equal" ? "Equal split" : (e.splitType === "exact" ? "Exact amounts" : "Percentage split");
    return '<div class="expense-item">' +
      '<div class="expense-cat-chip">' + icon + '</div>' +
      '<div class="expense-main">' +
        '<div class="title">' + escapeHtml(e.title) + '</div>' +
        '<div class="meta">Paid by <b>' + escapeHtml(payer) + '</b> · ' + e.participants.length + ' participant' + (e.participants.length === 1 ? "" : "s") + ' · ' + escapeHtml(e.category) + '</div>' +
      '</div>' +
      '<div class="expense-amount"><div class="amt">' + formatCurrency(e.amount) + '</div><div class="split">' + splitLabel + '</div></div>' +
      '<div class="expense-actions">' +
        '<button type="button" class="btn-icon" data-edit-expense="' + e.id + '" aria-label="Edit expense">✎</button>' +
        '<button type="button" class="btn-icon" data-delete-expense="' + e.id + '" aria-label="Delete expense">✕</button>' +
      '</div>' +
    '</div>';
  }).join("");
}

document.getElementById("expense-search").addEventListener("input", renderExpenseList);
document.getElementById("expense-filter-category").addEventListener("change", renderExpenseList);

document.getElementById("expense-list").addEventListener("click", function(e){
  var editBtn = e.target.closest("[data-edit-expense]");
  var delBtn = e.target.closest("[data-delete-expense]");
  if(editBtn){ openExpenseModal(editBtn.getAttribute("data-edit-expense")); return; }
  if(delBtn){
    var id = delBtn.getAttribute("data-delete-expense");
    var exp = state.expenses.find(function(x){ return x.id === id; });
    if(!exp) return;
    openConfirm({
      title: "Delete expense?",
      message: "Are you sure you want to remove:<br><br><b>" + escapeHtml(exp.title) + " - " + formatCurrency(exp.amount) + "</b>",
      confirmLabel: "Yes, delete",
      onConfirm: function(){
        state.expenses = state.expenses.filter(function(x){ return x.id !== id; });
        saveState();
        renderDashboard();
        showToast("Expense deleted.");
      }
    });
  }
});

/* ==========================================================
   BALANCES / SETTLEMENTS - RENDER
   ========================================================== */
function renderBalances(){
  var balances = computeBalances();
  var me = currentUser();

  var youOwed = 0, youOwe = 0;
  if(me){
    state.expenses.forEach(function(e){
      if(e.paidBy === me.id){
        Object.keys(e.splits).forEach(function(pid){
          if(pid !== me.id) youOwed += (Number(e.splits[pid]) || 0);
        });
      } else if(e.participants.indexOf(me.id) !== -1){
        youOwe += (Number(e.splits[me.id]) || 0);
      }
    });
  }
  var net = clamp2(youOwed - youOwe);
  document.getElementById("your-owed").textContent = formatCurrency(youOwed);
  document.getElementById("your-owe").textContent = formatCurrency(youOwe);
  var netEl = document.getElementById("your-net");
  netEl.textContent = (net > 0 ? "+" : "") + formatCurrency(net);
  netEl.style.color = net > 0 ? "#a8d4b0" : (net < 0 ? "var(--terracotta)" : "var(--ink-faint)");

  var listEl = document.getElementById("balance-list");
  if(state.roommates.length === 0){
    listEl.innerHTML = '<div class="empty-state"><div class="sub">No people to show balances for yet.</div></div>';
    return;
  }
  listEl.innerHTML = state.roommates.map(function(r){
    var bal = balances[r.id] || 0;
    var cls = bal > 0.005 ? "pos" : (bal < -0.005 ? "neg" : "zero");
    var sign = bal > 0.005 ? "+" : "";
    return '<div class="balance-row">' +
      '<div class="who"><div class="avatar ' + (r.isCurrentUser ? "you" : "") + '" style="width:30px;height:30px;font-size:12px;">' + escapeHtml(initials(r.name)) + '</div>' +
      '<span>' + escapeHtml(r.name) + (r.isCurrentUser ? " (You)" : "") + '</span></div>' +
      '<div class="amt ' + cls + '">' + sign + formatCurrency(bal) + '</div>' +
    '</div>';
  }).join("");
}

function renderSettlements(){
  var balances = computeBalances();
  var settlements = computeSettlements(balances);
  var el = document.getElementById("settlement-list");
  if(state.expenses.length === 0 || settlements.length === 0){
    el.innerHTML = '<div class="empty-state"><div class="glyph">✅</div><div class="title">All settled up.</div><div class="sub">No pending payments between roommates.</div></div>';
    return;
  }
  el.innerHTML = settlements.map(function(s){
    return '<div class="settlement-row">' +
      '<div class="flow"><span>' + escapeHtml(roommateName(s.from)) + '</span><span class="arrow">→</span><span>' + escapeHtml(roommateName(s.to)) + '</span></div>' +
      '<div class="amt">' + formatCurrency(s.amount) + '</div>' +
    '</div>';
  }).join("");
}

/* ==========================================================
   LANDING ACTIONS
   ========================================================== */
function openOnboarding(){
  document.getElementById("welcome-name-input").value = state.userName || "";
  document.getElementById("welcome-name-field").classList.remove("invalid");
  showScreen("welcome");
}
document.getElementById("landing-brand-btn").addEventListener("click", function(){ showScreen("landing"); replayLandingIntro(); });
document.getElementById("landing-signup-btn").addEventListener("click", openOnboarding);
document.getElementById("landing-main-signup").addEventListener("click", openOnboarding);
document.getElementById("landing-login-btn").addEventListener("click", openOnboarding);
document.getElementById("landing-main-login").addEventListener("click", openOnboarding);

document.getElementById("theme-toggle").addEventListener("click", function(){
  var next=document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  applyTheme(next);
});

/* ==========================================================
   BOOT
   ========================================================== */
function boot(){
  initTheme();
  state = loadState();
  saveState();

  var screen = determineScreen();
  if(screen === "room") prepareRoomScreen();
  if(screen === "roommates") prepareRoommatesScreen();
  if(screen === "dashboard") prepareDashboard();

  document.querySelectorAll(".app-screen").forEach(function(s){ s.classList.remove("active","enter"); });
  var target = document.getElementById(screen + "-screen");
  target.classList.add("active");
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ target.classList.add("enter"); }); });
}

boot();

})();
