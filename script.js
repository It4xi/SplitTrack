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
    authToken: "",
    userId: "",
    userName: "",
    roomId: "",
    roomName: "",
    setupComplete: false,
    roommates: [],
    expenses: [],
    serverBalances: {},
    serverSettlements: []
  };
}

/* ==========================================================
   API
   ========================================================== */
var API_BASE = (window.SPLITTRACK_API_URL || "https://splittrack-api.onrender.com").replace(/\/$/, "");

async function apiFetch(path, options){
  var opts=options||{};
  var headers=Object.assign({},opts.headers||{});
  if(state && state.authToken){ headers["Authorization"]="Bearer "+state.authToken; }
  if(opts.body && typeof opts.body !== "string"){
    headers["Content-Type"]="application/json";
    opts=Object.assign({},opts,{body:JSON.stringify(opts.body)});
  }
  var response;
  try{
    response=await fetch(API_BASE+path,Object.assign({},opts,{headers:headers}));
  }catch(err){
    throw new Error("Could not reach the SplitTrack backend.");
  }
  var data=null;
  try{ data=await response.json(); }catch(e){}
  if(response.status===401 && path.indexOf("/api/auth/")!==0){
    if(state){ state.authToken=""; state.userId=""; state.userName=""; state.roomId=""; state.roomName=""; state.setupComplete=false; }
    try{ localStorage.removeItem("splittrack_auth_token"); }catch(e){}
    throw new Error("Your session expired. Please log in again.");
  }
  if(!response.ok){
    var detail=data&&data.detail;
    if(typeof detail==="object") detail=JSON.stringify(detail);
    throw new Error(detail||("Request failed with status "+response.status));
  }
  return data;
}

function mapApiExpense(e){
  return {id:String(e.id),title:String(e.title||"Untitled expense"),amount:Number(e.amount)||0,paidBy:e.paid_by||null,participants:Array.isArray(e.participants)?e.participants.slice():[],splitType:["equal","exact","percentage"].indexOf(e.split_type)!==-1?e.split_type:"equal",splits:(e.splits&&typeof e.splits==="object")?e.splits:{},category:String(e.category||"Other"),createdAt:e.created_at?new Date(e.created_at).getTime():Date.now()};
}

async function syncRoomFromBackend(){
  if(!state.roomId) return;
  var data=await apiFetch("/api/rooms/"+encodeURIComponent(state.roomId)+"/members");
  state.roommates=(data.members||[]).map(function(m){return {id:String(m.id),name:String(m.name||"Member"),isCurrentUser:String(m.id)===String(state.userId)};});
  var me=currentUser(); if(me) state.userName=me.name;
}

async function syncExpensesFromBackend(){
  if(!state.roomId) return;
  var rows=await apiFetch("/api/expenses/"+encodeURIComponent(state.roomId));
  state.expenses=Array.isArray(rows)?rows.map(mapApiExpense):[];
}

async function syncFinancialsFromBackend(){
  if(!state.roomId) return;
  var data=await Promise.all([apiFetch("/api/balances/"+encodeURIComponent(state.roomId)),apiFetch("/api/settlements/"+encodeURIComponent(state.roomId))]);
  state.serverBalances=(data[0]&&data[0].balances)||{};
  state.serverSettlements=(data[1]&&Array.isArray(data[1].settlements))?data[1].settlements:[];
}

async function syncDashboardFromBackend(){ await syncRoomFromBackend(); await syncExpensesFromBackend(); await syncFinancialsFromBackend(); saveState(); }

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
    if(typeof parsed.authToken === "string") s.authToken = parsed.authToken;
    if(!s.authToken){ try{ s.authToken = localStorage.getItem("splittrack_auth_token") || ""; }catch(e){} }
    if(typeof parsed.userId === "string") s.userId = parsed.userId;
    if(typeof parsed.userName === "string") s.userName = parsed.userName;
    if(typeof parsed.roomId === "string") s.roomId = parsed.roomId;
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
  if(!state.userId || !state.userName) return "landing";
  if(!state.roomId || !state.roomName) return "room";
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
document.getElementById("welcome-form").addEventListener("submit", async function(e){
  e.preventDefault();
  var field=document.getElementById("welcome-name-field"), input=document.getElementById("welcome-name-input"), name=input.value.trim();
  if(!name){field.classList.add("invalid");input.focus();return;}
  field.classList.remove("invalid");
  var button=e.submitter||document.querySelector("#welcome-form button[type=submit]"); if(button) button.disabled=true;
  try{
    var user=await apiFetch("/api/users/",{method:"POST",body:{name:name}});
    state.userId=String(user.id); state.userName=user.name||name; state.roomId=""; state.roomName="";
    state.roommates=[{id:state.userId,name:state.userName,isCurrentUser:true}]; state.expenses=[]; state.serverBalances={}; state.serverSettlements=[]; saveState();
    prepareRoomScreen(); showScreen("room");
  }catch(err){showToast(err.message);} finally{if(button)button.disabled=false;}
});

function prepareRoomScreen(){
  document.getElementById("room-greeting-pill").textContent = "Nice to meet you, " + state.userName + " 👋";
  document.getElementById("room-name-input").value = state.roomName || "";
}

/* ==========================================================
   ONBOARDING - CREATE ROOM
   ========================================================== */
document.getElementById("room-form").addEventListener("submit", async function(e){
  e.preventDefault();
  var field=document.getElementById("room-name-field"), input=document.getElementById("room-name-input"), name=input.value.trim();
  if(!name){field.classList.add("invalid");input.focus();return;}
  if(!state.userId){showToast("Create your user profile first.");showScreen("welcome");return;}
  field.classList.remove("invalid");
  var button=e.submitter||document.querySelector("#room-form button[type=submit]"); if(button)button.disabled=true;
  try{
    var room=await apiFetch("/api/rooms/",{method:"POST",body:{name:name,created_by:state.userId}});
    state.roomId=String(room.id); state.roomName=room.name||name; state.roommates=[{id:state.userId,name:state.userName,isCurrentUser:true}]; state.expenses=[];
    state.serverBalances={}; state.serverSettlements=[]; saveState(); await syncRoomFromBackend(); prepareRoommatesScreen(); showScreen("roommates");
  }catch(err){showToast(err.message);} finally{if(button)button.disabled=false;}
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

async function addRoommateFromOnboarding(){
  var input=document.getElementById("roommate-name-input"), errorEl=document.getElementById("roommate-add-error"), name=input.value.trim(); errorEl.style.display="none";
  if(!name){errorEl.textContent="Enter a name to add a roommate.";errorEl.style.display="block";input.focus();return;}
  if(state.roommates.some(function(r){return r.name.toLowerCase()===name.toLowerCase();})){errorEl.textContent="\""+name+"\" is already in this room.";errorEl.style.display="block";input.focus();return;}
  try{
    var user=await apiFetch("/api/users/",{method:"POST",body:{name:name}});
    await apiFetch("/api/rooms/"+encodeURIComponent(state.roomId)+"/members",{method:"POST",body:{user_id:String(user.id)}});
    state.roommates.push({id:String(user.id),name:user.name||name,isCurrentUser:false}); saveState(); input.value=""; renderRoommatesOnboardingList(); input.focus(); showToast(name+" added to the room.");
  }catch(err){errorEl.textContent=err.message;errorEl.style.display="block";}
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
document.getElementById("roommates-finish-btn").addEventListener("click", async function(){
  state.setupComplete=true; try{await syncDashboardFromBackend();}catch(err){showToast(err.message);} saveState(); prepareDashboard(); showScreen("dashboard");
});

/* ==========================================================
   ROOMMATE MANAGEMENT (shared: onboarding + dashboard)
   ========================================================== */
async function renameRoommate(id,newName){
  var r=getRoommate(id); if(!r)return {ok:false,error:"Roommate not found."}; var trimmed=newName.trim(); if(!trimmed)return {ok:false,error:"Enter a valid name."};
  if(state.roommates.some(function(x){return x.id!==id&&x.name.toLowerCase()===trimmed.toLowerCase();}))return {ok:false,error:"That name is already in use."};
  try{await apiFetch("/api/rooms/"+encodeURIComponent(state.roomId)+"/members/"+encodeURIComponent(id),{method:"PUT",body:{new_name:trimmed}}); r.name=trimmed; if(r.isCurrentUser)state.userName=trimmed; saveState(); return {ok:true};}
  catch(err){return {ok:false,error:err.message};}
}

async function addRoommateDashboard(name){
  var trimmed=name.trim(); if(!trimmed)return {ok:false,error:"Enter a valid name."};
  if(state.roommates.some(function(x){return x.name.toLowerCase()===trimmed.toLowerCase();}))return {ok:false,error:"That name is already in this room."};
  try{var user=await apiFetch("/api/users/",{method:"POST",body:{name:trimmed}}); await apiFetch("/api/rooms/"+encodeURIComponent(state.roomId)+"/members",{method:"POST",body:{user_id:String(user.id)}}); state.roommates.push({id:String(user.id),name:user.name||trimmed,isCurrentUser:false}); saveState(); return {ok:true};}
  catch(err){return {ok:false,error:err.message};}
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
        apiFetch("/api/rooms/"+encodeURIComponent(state.roomId)+"/members/"+encodeURIComponent(id),{method:"DELETE"}).then(function(){state.roommates=state.roommates.filter(function(x){return x.id!==id;});currentSelection.delete(id);saveState();renderDashboard();showToast(r.name+" was removed from the room.");}).catch(function(err){showToast(err.message);});
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
      var ids=Array.from(currentSelection); Promise.all(ids.map(function(id){return apiFetch("/api/rooms/"+encodeURIComponent(state.roomId)+"/members/"+encodeURIComponent(id),{method:"DELETE"});})).then(function(){state.roommates=state.roommates.filter(function(r){return ids.indexOf(r.id)===-1||r.isCurrentUser;});currentSelection.clear();saveState();renderDashboard();showToast(ids.length+" roommates removed.");}).catch(function(err){showToast(err.message);});
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

document.getElementById("roommate-modal-save-btn").addEventListener("click", async function(){
  var id = document.getElementById("roommate-modal-id-input").value;
  var nameInput = document.getElementById("roommate-modal-name-input");
  var field = document.getElementById("roommate-modal-name-field");
  var errorEl = field.querySelector(".field-error");
  var name = nameInput.value.trim();

  var result;
  if(id){ result = await renameRoommate(id, name); }
  else { result = await addRoommateDashboard(name); }

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

document.getElementById("expense-save-btn").addEventListener("click", async function(){
  var titleField=document.getElementById("expense-title-field"), amountField=document.getElementById("expense-amount-field"), paidByField=document.getElementById("expense-paidby-field"), participantsField=document.getElementById("expense-participants-field");
  [titleField,amountField,paidByField,participantsField].forEach(function(f){f.classList.remove("invalid");});
  var title=document.getElementById("expense-title-input").value.trim(), amount=Number(document.getElementById("expense-amount-input").value), paidBy=document.getElementById("expense-paidby-input").value, category=document.getElementById("expense-category-input").value, participants=getSelectedParticipants();
  var bad=false; if(!title){titleField.classList.add("invalid");bad=true;} if(!Number.isFinite(amount)||amount<=0){amountField.classList.add("invalid");bad=true;} if(!paidBy||!getRoommate(paidBy)){paidByField.classList.add("invalid");bad=true;} if(!participants.length||participants.some(function(id){return !getRoommate(id);})){participantsField.classList.add("invalid");bad=true;} if(bad)return;
  var splits={};
  if(currentSplitType==="equal") splits=computeEqualSplit(amount,participants);
  else if(currentSplitType==="exact"){var exactVals={};document.querySelectorAll("#split-editor-list [data-exact]").forEach(function(inp){exactVals[inp.getAttribute("data-exact")]=Number(inp.value)||0;});if(!validateExactSplit(amount,exactVals)){showToast("Exact amounts must add up to the total.");return;}participants.forEach(function(id){splits[id]=clamp2(exactVals[id]||0);});}
  else {var pctVals={};document.querySelectorAll("#split-editor-list [data-pct]").forEach(function(inp){pctVals[inp.getAttribute("data-pct")]=Number(inp.value)||0;});if(!validatePercentageSplit(pctVals)){showToast("Percentages must add up to 100%.");return;}splits=percentagesToSplits(amount,pctVals);}
  var payload={room_id:state.roomId,title:title,amount:clamp2(amount),category:category,paid_by:paidBy,participants:participants,split_type:currentSplitType};
  if(currentSplitType==="exact")payload.exact_splits=splits;
  if(currentSplitType==="percentage"){var pp={};document.querySelectorAll("#split-editor-list [data-pct]").forEach(function(inp){pp[inp.getAttribute("data-pct")]=Number(inp.value)||0;});payload.percentage_splits=pp;}
  try{
    var response=editingExpenseId?await apiFetch("/api/expenses/"+encodeURIComponent(editingExpenseId),{method:"PUT",body:payload}):await apiFetch("/api/expenses/",{method:"POST",body:payload});
    var mapped=mapApiExpense(response), idx=state.expenses.findIndex(function(e){return e.id===mapped.id;}); if(idx!==-1)state.expenses[idx]=mapped; else state.expenses.unshift(mapped);
    await syncFinancialsFromBackend(); saveState(); closeModal("expense-modal-overlay"); renderDashboard(); showToast(editingExpenseId?"Expense updated.":"Expense added.");
  }catch(err){showToast(err.message);}
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
        apiFetch("/api/expenses/"+encodeURIComponent(id),{method:"DELETE"}).then(async function(){state.expenses=state.expenses.filter(function(x){return x.id!==id;});await syncFinancialsFromBackend();saveState();renderDashboard();showToast("Expense deleted.");}).catch(function(err){showToast(err.message);});
      }
    });
  }
});

/* ==========================================================
   BALANCES / SETTLEMENTS - RENDER
   ========================================================== */
function renderBalances(){
  var balances = state.serverBalances && Object.keys(state.serverBalances).length ? state.serverBalances : computeBalances();
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
  var balances = state.serverBalances && Object.keys(state.serverBalances).length ? state.serverBalances : computeBalances();
  var settlements = Array.isArray(state.serverSettlements) ? state.serverSettlements : computeSettlements(balances);
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
   BASIC AUTHENTICATION
   ========================================================== */
function injectAuthUI(){
  if(document.getElementById("auth-modal-overlay")) return;
  var html = '' +
    '<div class="modal-overlay" id="auth-modal-overlay">' +
      '<div class="modal-box auth-modal-box" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">' +
        '<div class="modal-head">' +
          '<div>' +
            '<div class="eyebrow" style="margin-bottom:8px;">SplitTrack account</div>' +
            '<h3 id="auth-modal-title">Log in</h3>' +
          '</div>' +
          '<button type="button" class="modal-close" data-close-modal="auth-modal-overlay" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="modal-body">' +
          '<p class="auth-subtitle" id="auth-modal-subtitle">Welcome back. Log in to continue.</p>' +
          '<form id="auth-form" novalidate>' +
            '<div class="field" id="auth-username-field">' +
              '<label for="auth-username-input">Username</label>' +
              '<input type="text" id="auth-username-input" autocomplete="username" maxlength="40" placeholder="Choose a username">' +
              '<p class="field-error" id="auth-username-error">Enter a username.</p>' +
            '</div>' +
            '<div class="field" id="auth-password-field">' +
              '<label for="auth-password-input">Password</label>' +
              '<input type="password" id="auth-password-input" autocomplete="current-password" maxlength="100" placeholder="Enter your password">' +
              '<p class="field-error" id="auth-password-error">Enter your password.</p>' +
            '</div>' +
            '<div class="field" id="auth-confirm-field" style="display:none;">' +
              '<label for="auth-confirm-input">Confirm password</label>' +
              '<input type="password" id="auth-confirm-input" autocomplete="new-password" maxlength="100" placeholder="Repeat your password">' +
              '<p class="field-error" id="auth-confirm-error">Passwords must match.</p>' +
            '</div>' +
            '<p class="auth-form-error" id="auth-form-error"></p>' +
            '<button type="submit" class="btn btn-primary btn-block" id="auth-submit-btn">Log in</button>' +
          '</form>' +
          '<div class="auth-switch"><span id="auth-switch-text">New to SplitTrack?</span> <button type="button" class="auth-switch-btn" id="auth-switch-btn">Create an account</button></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.insertAdjacentHTML("beforeend", html);
  document.getElementById("auth-form").addEventListener("submit", handleAuthSubmit);
  document.getElementById("auth-switch-btn").addEventListener("click", function(){ setAuthMode(authMode==="login"?"signup":"login"); });
}

var authMode="login";
function setAuthMode(mode){
  authMode=mode;
  document.getElementById("auth-modal-title").textContent=mode==="login"?"Log in":"Create your account";
  document.getElementById("auth-modal-subtitle").textContent=mode==="login"?"Welcome back. Log in to continue.":"Create a simple SplitTrack account to keep your data separate.";
  document.getElementById("auth-submit-btn").textContent=mode==="login"?"Log in":"Create account";
  document.getElementById("auth-switch-text").textContent=mode==="login"?"New to SplitTrack?":"Already have an account?";
  document.getElementById("auth-switch-btn").textContent=mode==="login"?"Create an account":"Log in";
  document.getElementById("auth-confirm-field").style.display=mode==="signup"?"block":"none";
  document.getElementById("auth-password-input").setAttribute("autocomplete",mode==="login"?"current-password":"new-password");
  clearAuthErrors();
}
function clearAuthErrors(){
  ["auth-username-field","auth-password-field","auth-confirm-field"].forEach(function(id){var el=document.getElementById(id);if(el)el.classList.remove("invalid");});
  var er=document.getElementById("auth-form-error"); if(er) er.textContent="";
}
function openAuth(mode){
  injectAuthUI();
  setAuthMode(mode||"login");
  document.getElementById("auth-username-input").value="";
  document.getElementById("auth-password-input").value="";
  document.getElementById("auth-confirm-input").value="";
  openModal("auth-modal-overlay");
}

async function handleAuthSubmit(e){
  e.preventDefault();
  clearAuthErrors();
  var username=document.getElementById("auth-username-input").value.trim();
  var password=document.getElementById("auth-password-input").value;
  var confirm=document.getElementById("auth-confirm-input").value;
  var invalid=false;
  if(username.length<2){document.getElementById("auth-username-field").classList.add("invalid");invalid=true;}
  if(password.length<4){document.getElementById("auth-password-field").classList.add("invalid");invalid=true;}
  if(authMode==="signup" && password!==confirm){document.getElementById("auth-confirm-field").classList.add("invalid");invalid=true;}
  if(invalid)return;

  var btn=document.getElementById("auth-submit-btn");
  btn.disabled=true;
  btn.textContent=authMode==="login"?"Logging in...":"Creating account...";
  try{
    var result=await apiFetch(authMode==="login"?"/api/auth/login":"/api/auth/register",{method:"POST",body:{username:username,password:password}});
    state.authToken=result.token;
    state.userId=String(result.user.id);
    state.userName=result.user.name||result.user.username||username;
    try{localStorage.setItem("splittrack_auth_token",state.authToken);}catch(e){}
    state.roomId=""; state.roomName=""; state.setupComplete=false; state.roommates=[{id:state.userId,name:state.userName,isCurrentUser:true}]; state.expenses=[]; state.serverBalances={}; state.serverSettlements=[];
    saveState();
    closeModal("auth-modal-overlay");
    var rooms=await apiFetch("/api/rooms/");
    if(Array.isArray(rooms)&&rooms.length){
      var room=rooms[0];
      state.roomId=String(room.id); state.roomName=room.name||"Room"; state.setupComplete=true;
      await syncDashboardFromBackend();
      prepareDashboard(); showScreen("dashboard");
    }else{
      prepareRoomScreen(); showScreen("room");
    }
    showToast(authMode==="login"?"Welcome back, "+state.userName+".":"Account created. Welcome to SplitTrack.");
  }catch(err){
    document.getElementById("auth-form-error").textContent=err.message;
  }finally{
    btn.disabled=false;
    btn.textContent=authMode==="login"?"Log in":"Create account";
  }
}

async function bootAuth(){
  injectAuthUI();
  initTheme();
  state=loadState();
  if(state.authToken){
    try{
      var me=await apiFetch("/api/auth/me");
      state.userId=String(me.id); state.userName=me.name||me.username||state.userName;
      var rooms=await apiFetch("/api/rooms/");
      if(Array.isArray(rooms)&&rooms.length){
        var room=rooms[0];
        state.roomId=String(room.id); state.roomName=room.name||"Room"; state.setupComplete=true;
        await syncDashboardFromBackend();
      }else{
        state.roomId=""; state.roomName=""; state.setupComplete=false;
        state.roommates=[{id:state.userId,name:state.userName,isCurrentUser:true}];
      }
      saveState();
    }catch(err){
      state.authToken=""; state.userId=""; state.userName=""; state.roomId=""; state.roomName=""; state.setupComplete=false;
      try{localStorage.removeItem("splittrack_auth_token");}catch(e){}
    }
  }
  var screen=state.authToken?determineScreen():"landing";
  if(screen==="room")prepareRoomScreen();
  if(screen==="roommates")prepareRoommatesScreen();
  if(screen==="dashboard")prepareDashboard();
  document.querySelectorAll(".app-screen").forEach(function(s){s.classList.remove("active","enter");});
  var target=document.getElementById(screen+"-screen");
  target.classList.add("active");
  requestAnimationFrame(function(){requestAnimationFrame(function(){target.classList.add("enter");});});

  ["landing-login-btn","landing-main-login"].forEach(function(id){
    var el=document.getElementById(id); if(el) el.addEventListener("click",function(e){e.preventDefault();e.stopImmediatePropagation();openAuth("login");},true);
  });
  ["landing-signup-btn","landing-main-signup"].forEach(function(id){
    var el=document.getElementById(id); if(el) el.addEventListener("click",function(e){e.preventDefault();e.stopImmediatePropagation();openAuth("signup");},true);
  });

  // Add a lightweight logout control to the existing dashboard header.
  var head=document.querySelector(".dash-header-right");
  if(head && !document.getElementById("auth-logout-btn")){
    var btn=document.createElement("button");
    btn.type="button"; btn.className="btn btn-secondary btn-sm"; btn.id="auth-logout-btn"; btn.textContent="Log out";
    btn.addEventListener("click",async function(){
      try{if(state.authToken) await apiFetch("/api/auth/logout",{method:"POST"});}catch(e){}
      state=defaultState();
      try{localStorage.removeItem("splittrack_auth_token");localStorage.removeItem(STORAGE_KEY);}catch(e){}
      showScreen("landing");
      showToast("Logged out.");
    });
    head.appendChild(btn);
  }
}

/* ==========================================================
   BOOT
   ========================================================== */
async function boot(){
  await bootAuth();
}

boot();


})();
