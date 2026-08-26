let BOOT = { chains: [], members: [] };
let calY, calM;
const IS_LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const ADMIN_URL_PARAM = new URLSearchParams(location.search).has("admin")
  || location.hash === "#admin"
  || location.pathname === "/admin"
  || location.pathname === "/admin/";
const isAdminUI = IS_LOCAL || ADMIN_URL_PARAM;
console.log("[init] host=", location.hostname, "search=", location.search, "isAdminUI=", isAdminUI);
let adminKey = localStorage.getItem("cfAdminKey") || "";
let editingEventId = null;
let currentDetailId = null;
let selectedChainIdx = 0;
let rankPeriod = "quarter";
let adminLoaded = false;

const CHAIN_CLASS = {
  "더클라임": "c-climb", "서울숲": "c-seoul", "클라이밍파크": "c-park",
  "온플릭": "c-onflick", "손상원": "c-son", "알레": "c-alle",
  "피커스": "c-focus", "담장클라이밍": "c-dam", "크래커": "c-cracker"
};
const CHAIN_HEX = {
  "더클라임": "#ea580c", "서울숲": "#059669", "클라이밍파크": "#2563eb",
  "온플릭": "#4f46e5", "손상원": "#e11d48", "알레": "#0d9488",
  "피커스": "#7c3aed", "담장클라이밍": "#0891b2", "크래커": "#db2777"
};
function chainCls(name) { return CHAIN_CLASS[name] || "c-other"; }
function chainHex(name) { return CHAIN_HEX[name] || "#6b7280"; }

async function api(path, opts = {}) {
  const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
  const res = await fetch(path, Object.assign({}, opts, { headers }));
  if (!res.ok) {
    let msg = "오류 " + res.status;
    try { const j = await res.json(); msg = j.detail || msg; } catch (e) {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function adminApi(path, opts = {}) {
  if (!isAdminUI) throw new Error("관리 권한이 없습니다");
  if (!IS_LOCAL && !adminKey) {
    const k = prompt("관리자 키를 입력하세요");
    if (k === null) throw new Error("관리자 권한이 필요합니다");
    adminKey = k.trim();
    localStorage.setItem("cfAdminKey", adminKey);
  }
  if (adminKey) {
    opts.headers = Object.assign({ "X-Admin-Key": adminKey }, opts.headers || {});
  }
  return api(path, opts);
}

function pad(n) { return String(n).padStart(2, "0"); }
function fmtDate(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }
function todayStr() { return fmtDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function switchTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  document.querySelectorAll("nav button").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === name));
  window.scrollTo(0, 0);
  if (name === "food") setTimeout(initFoodMap, 60);
  if (name === "admin" && !adminLoaded) loadAdminData();
}

async function refreshMembers() {
  const data = await api("/api/members");
  BOOT.members = data.members;
  renderBirthdayAdminCard();
  await loadMonth();
}

function openModal(id) { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

/* ---------- 달력 ---------- */
async function loadMonth() {
  document.getElementById("month-label").textContent = `${calY}년 ${calM}월`;
  const data = await api(`/api/events?year=${calY}&month=${calM}`);
  renderCalendar(data.events);
  renderUpcomingSide();
}

function renderCalendar(events) {
  const grid = document.getElementById("calendar");
  const byDay = {};
  events.forEach(e => {
    const d = Number(e.event_date.slice(8, 10));
    (byDay[d] = byDay[d] || []).push(e);
  });
  const startDow = new Date(calY, calM - 1, 1).getDay();
  const days = new Date(calY, calM, 0).getDate();
  const now = new Date();
  const todayD = (now.getFullYear() === calY && now.getMonth() + 1 === calM) ? now.getDate() : -1;
  const dows = ["일", "월", "화", "수", "목", "금", "토"];
  let html = dows.map((d, i) =>
    `<div class="dow ${i === 0 ? "sun" : i === 6 ? "sat" : ""}">${d}</div>`).join("");
  for (let i = 0; i < startDow; i++) html += '<div class="day empty"></div>';
  for (let d = 1; d <= days; d++) {
    const bdays = BOOT.members.filter(m => m.birth_date && m.birth_date.slice(5) === `${pad(calM)}-${pad(d)}`);
    const bdayChips = bdays.map(m => `<span class="chip chip-bday">🎂 ${esc(m.name)}</span>`).join("");
    const chips = (byDay[d] || []).map(e =>
      `<button class="chip ${chainCls(e.chain_name)}" onclick="openDetail(${e.id})">${esc(e.start_time)} ${esc(e.title || e.gym_name)}</button>`
    ).join("");
    html += `<div class="day ${d === todayD ? "today" : ""}"><div class="num">${d}</div>${chips}${bdayChips}</div>`;
  }
  grid.innerHTML = html;
}

async function renderUpcomingSide() {
  try {
    const data = await api("/api/events/upcoming?limit=3");
    const el = document.getElementById("upcoming-side");
    if (!data.events.length) { el.innerHTML = '<li><span class="empty-note">등록된 일정이 없습니다</span></li>'; return; }
    el.innerHTML = data.events.map(e => {
      const diff = Math.round((new Date(e.event_date) - new Date(todayStr())) / 86400000);
      return `<li><span class="rank-num">D${diff >= 0 ? "-" : "+"}${Math.abs(diff)}</span>
        <span class="name">${esc(e.title || e.gym_name)}</span>
        <span class="val" style="font-size:11px">${esc(e.event_date.slice(5))}</span></li>`;
    }).join("");
  } catch (e) {}
}

async function openDetail(id) {
  currentDetailId = id;
  const data = await api(`/api/events/${id}`);
  const ev = data.event;
  const badge = document.getElementById("md-badge");
  badge.textContent = ev.chain_name;
  badge.className = "badge " + chainCls(ev.chain_name);
  document.getElementById("md-title").textContent = ev.title || `${ev.gym_name}`;
  document.getElementById("md-meta").innerHTML =
    `${esc(ev.event_date)} ${esc(ev.start_time)}<br>장소: ${esc(ev.chain_name)} ${esc(ev.gym_name)}${ev.memo ? "<br>메모: " + esc(ev.memo) : ""}`;
  document.getElementById("md-att-count").textContent = `참가 예정 ${data.attendees.length}명`;
  document.getElementById("md-attendees").innerHTML = data.attendees.map(a =>
    `<div class="attendee"><span class="avatar">${esc(a.name.charAt(0))}</span>${esc(a.name)}</div>`
  ).join("") || '<div class="empty-note">아직 참가 신청자가 없습니다</div>';
  openModal("modal-detail");
}

/* ---------- 랭킹 ---------- */
function renderChainChips() {
  const wrap = document.getElementById("chain-chips");
  wrap.innerHTML = BOOT.chains.map((c, i) =>
    `<button class="chipbtn ${i === selectedChainIdx ? "active" : ""}" onclick="selectChain(${i})">
       <span class="gdot" style="background:${chainHex(c.name)};border-color:${chainHex(c.name)}"></span>${esc(c.name)}
     </button>`).join("");
}

function selectChain(i) {
  selectedChainIdx = i;
  document.querySelectorAll("#chain-chips .chipbtn").forEach((b, bi) =>
    b.classList.toggle("active", bi === i));
  renderGradeTable();
}

function rankListHtml(rows, valKey) {
  if (!rows.length) return '<li><span class="empty-note">아직 데이터가 없습니다</span></li>';
  return rows.map((r, i) => {
    const cls = i === 0 ? "r1" : i === 1 ? "r2" : i === 2 ? "r3" : "";
    return `<li><span class="rank-num ${cls}">${i + 1}</span><span class="name">${esc(r.name)}</span><span class="val">${r[valKey]}${valKey === "cnt" ? "회" : "개"}</span></li>`;
  }).join("");
}

async function loadRankings() {
  const c = BOOT.chains[selectedChainIdx];
  try {
    const clears = await api(`/api/rankings/clears?period=${rankPeriod}&chain_id=${c.id}`);
    document.getElementById("rank-clears-list").innerHTML =
      rankListHtml(clears.rows, "total");
    const att = await api(`/api/rankings/attendance?period=${rankPeriod}`);
    document.getElementById("rank-att-list").innerHTML = rankListHtml(att.rows, "cnt");
    document.getElementById("rank-att-side").innerHTML =
      att.rows.length ? att.rows.slice(0, 5).map((r, i) => {
        const cls = i === 0 ? "r1" : i === 1 ? "r2" : i === 2 ? "r3" : "";
        return `<li><span class="rank-num ${cls}">${i + 1}</span><span class="name">${esc(r.name)}</span><span class="val">${r.cnt}회</span></li>`;
      }).join("") : '<li><span class="empty-note">데이터 없음</span></li>';
    await renderGradeTable();
  } catch (e) {}
}

async function renderGradeTable() {
  const area = document.getElementById("grade-table-area");
  const c = BOOT.chains[selectedChainIdx];
  if (!c.grades.length) {
    area.innerHTML = '<p style="font-size:13px;color:#9ca3af">등급 정보가 아직 등록되지 않은 체인입니다.</p>';
    return;
  }
  try {
    const data = await api(`/api/rankings/grades?chain_id=${c.id}&period=${rankPeriod}`);
    const order = data.grades.map((_, i) => i).reverse();
    let head = `<tr><th>순위</th><th>이름</th>`;
    order.forEach(gi => {
      const g = data.grades[gi];
      head += `<th><span class="gdot" style="background:${chainGradeColor(g.name)}"></span> ${esc(g.name)}</th>`;
    });
    head += `</tr>`;
    let body = "";
    if (!data.rows.length) body = `<tr><td colspan="${order.length + 2}"><span class="empty-note">아직 기록이 없습니다</span></td></tr>`;
    data.rows.forEach((r, ri) => {
      const cls = ri === 0 ? "r1" : ri === 1 ? "r2" : ri === 2 ? "r3" : "";
      body += `<tr><td><span class="rank-num ${cls}">${ri + 1}</span></td>
               <td><span class="g-name">${esc(r.name)}</span></td>`;
      order.forEach(gi => { body += `<td>${r.counts[gi]}</td>`; });
      body += `</tr>`;
    });
    area.innerHTML = `<table class="grade-table">${head}${body}</table>`;
  } catch (e) {
    area.innerHTML = `<span class="empty-note">${esc(e.message)}</span>`;
  }
}

const GRADE_HEX = {
  "흰색": "#e5e7eb", "흰": "#e5e7eb", "노랑": "#eab308", "노란색": "#eab308",
  "주황": "#f97316", "주황색": "#f97316", "초록": "#22c55e", "초록색": "#22c55e", "녹색": "#22c55e",
  "파랑": "#3b82f6", "파란색": "#3b82f6", "남색": "#3730a3", "빨강": "#ef4444", "빨간색": "#ef4444",
  "핑크색": "#ec4899", "분홍색": "#f9a8d4", "보라": "#a855f7", "보라색": "#a855f7",
  "회색": "#9ca3af", "갈색": "#92400e", "검정": "#111827", "검정색": "#111827", "하늘": "#7dd3fc"
};
function chainGradeColor(name) { return GRADE_HEX[name] || "#9ca3af"; }

/* ---------- 관리 ---------- */
function gymSelectOptions(chainIdx) {
  return BOOT.chains[chainIdx].gyms.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join("");
}
function gradeSelectOptions(chainIdx) {
  return BOOT.chains[chainIdx].grades.map(g => `<option value="${g.level}">${esc(g.name)}</option>`).join("");
}

function bindDependentSelects(chainSelId, gymSelId, gradeSelId) {
  const chainSel = document.getElementById(chainSelId);
  const gymSel = document.getElementById(gymSelId);
  const update = () => {
    gymSel.innerHTML = gymSelectOptions(Number(chainSel.value));
    if (gradeSelId) {
      const gradeSel = document.getElementById(gradeSelId);
      gradeSel.innerHTML = gradeSelectOptions(Number(chainSel.value));
    }
    if (chainSelId === "nf-chain") toggleCustomGymInput();
  };
  chainSel.addEventListener("change", update);
  update();
}

function isEtcChainSelected() {
  const idx = Number(document.getElementById("nf-chain").value);
  const chain = BOOT.chains[idx];
  return chain && (chain.name === "기타" || chain.gyms.length === 0);
}

function toggleCustomGymInput() {
  const etc = isEtcChainSelected();
  const gymRow = document.getElementById("nf-gym-row");
  const customRow = document.getElementById("nf-gym-custom-row");
  if (gymRow) gymRow.style.display = etc ? "none" : "";
  if (customRow) customRow.style.display = etc ? "" : "none";
}

async function loadAdminData() {
  adminLoaded = true;
  try {
    const ups = await adminApi("/api/events/upcoming?limit=50");
    const t = document.getElementById("admin-event-table");
    if (!ups.events.length) {
      t.innerHTML = '<tr><td><span class="empty-note">예정된 일정이 없습니다</span></td></tr>';
    } else {
      t.innerHTML = `<tr><th>날짜</th><th>시간</th><th>체인/지점</th><th>제목</th><th>참가자</th><th>관리</th></tr>` +
        ups.events.map(e => `
          <tr>
            <td>${esc(e.event_date.slice(5))}</td>
            <td>${esc(e.start_time)}</td>
            <td><span class="badge ${chainCls(e.chain_name)}">${esc(e.chain_name)}</span> ${esc(e.gym_name)}</td>
            <td>${esc(e.title || "-")}</td>
            <td>${e.attendees}명</td>
            <td>
              <button class="btn-mini" onclick='editEvent(${JSON.stringify({
                id: e.id, title: e.title, event_date: e.event_date,
                start_time: e.start_time, memo: e.memo, gym_id: e.gym_id,
                chain_id: BOOT.chains.find(c => c.name === e.chain_name)?.id ?? ""
              }).replace(/'/g, "&#39;")})'>수정</button>
              <button class="btn-mini del" onclick="deleteEvent(${e.id})">삭제</button>
            </td>
          </tr>`).join("");
    }
    const rsel = document.getElementById("rsvp-event");
    rsel.innerHTML = ups.events.map(e =>
      `<option value="${e.id}">${esc(e.event_date.slice(5))} ${esc(e.title || e.gym_name)}</option>`).join("");
    await renderRsvpList();
  } catch (e) {}
  try {
    await refreshMembers();
    renderMemberList();
    await renderRecentClears();
  } catch (e) {}
}

async function renderRsvpList() {
  const sel = document.getElementById("rsvp-event");
  const el = document.getElementById("rsvp-member-list");
  if (!sel.value || !BOOT.members.length) {
    el.innerHTML = '<li><span class="empty-note">일정과 멤버를 먼저 등록하세요</span></li>';
    return;
  }
  try {
    const data = await api(`/api/events/${sel.value}/rsvps`);
    const statusMap = {};
    data.rsvps.forEach(r => statusMap[r.member_id] = r.status);
    const q = (document.getElementById("rsvp-search").value || "").trim().toLowerCase();
    const members = q ? BOOT.members.filter(m => m.name.toLowerCase().includes(q)) : BOOT.members;
    if (!members.length) {
      el.innerHTML = '<li><span class="empty-note">검색 결과가 없습니다</span></li>';
      return;
    }
    el.innerHTML = members.map(m => {
      const s = statusMap[m.id] || "none";
      const btnLabel = s === "join" ? "참가 취소" : "참가로 표시";
      const next = s === "join" ? "out" : "join";
      return `<li style="display:flex;align-items:center;justify-content:space-between;padding:8px 2px;border-bottom:1px solid #f9fafb;font-size:14px;">
        <span>${esc(m.name)}${s === "join" ? ' <span class="val" style="font-size:12px">참가</span>' : ""}</span>
        <button class="btn-mini ${s === "join" ? "del" : ""}" onclick="toggleRsvp(${m.id}, '${next}')">${btnLabel}</button>
      </li>`;
    }).join("");
  } catch (e) {
    el.innerHTML = `<li><span class="empty-note">${esc(e.message)}</span></li>`;
  }
}

async function toggleRsvp(memberId, status) {
  const eventId = document.getElementById("rsvp-event").value;
  try {
    await adminApi(`/api/events/${eventId}/rsvp`, {
      method: "POST",
      body: JSON.stringify({ member_id: memberId, status })
    });
    await renderRsvpList();
    await loadMonth();
    await loadRankings();
  } catch (e) { alert(e.message); }
}

function openNewEvent() {
  editingEventId = null;
  document.getElementById("mn-title-text").textContent = "일정 등록";
  document.getElementById("nf-title").value = "";
  document.getElementById("nf-date").value = todayStr();
  document.getElementById("nf-time").value = "19:00";
  document.getElementById("nf-memo").value = "";
  const chainSel = document.getElementById("nf-chain");
  chainSel.value = "0";
  chainSel.dispatchEvent(new Event("change"));
  openModal("modal-new");
}

function editEvent(ev) {
  editingEventId = ev.id;
  document.getElementById("mn-title-text").textContent = "일정 수정";
  document.getElementById("nf-title").value = ev.title || "";
  document.getElementById("nf-date").value = ev.event_date;
  document.getElementById("nf-time").value = ev.start_time || "";
  document.getElementById("nf-memo").value = ev.memo || "";
  const chainSel = document.getElementById("nf-chain");
  const idx = BOOT.chains.findIndex(c => c.id === Number(ev.chain_id));
  chainSel.value = String(idx >= 0 ? idx : 0);
  chainSel.dispatchEvent(new Event("change"));
  if (ev.gym_id) {
    document.getElementById("nf-gym").value = String(ev.gym_id);
  }
  openModal("modal-new");
}

async function deleteEvent(id) {
  if (!confirm("이 일정을 삭제할까요?")) return;
  try {
    await adminApi(`/api/events/${id}`, { method: "DELETE" });
    await loadMonth();
    await loadAdminData();
  } catch (e) { alert(e.message); }
}

async function saveEvent() {
  const chainIdx = Number(document.getElementById("nf-chain").value);
  const chain = BOOT.chains[chainIdx];
  let gymId;
  if (isEtcChainSelected()) {
    const customName = document.getElementById("nf-gym-custom").value.trim();
    if (!customName) { alert("암장 이름을 입력하세요"); return; }
    try {
      const res = await adminApi("/api/gyms", {
        method: "POST",
        body: JSON.stringify({ chain_id: chain.id, name: customName })
      });
      gymId = res.id;
      BOOT = await api("/api/bootstrap");
    } catch (e) { alert(e.message); return; }
  } else {
    const gyms = chain.gyms;
    gymId = Number(document.getElementById("nf-gym").value) || (gyms[0] && gyms[0].id);
  }
  const payload = {
    title: document.getElementById("nf-title").value.trim(),
    gym_id: gymId,
    event_date: document.getElementById("nf-date").value,
    start_time: document.getElementById("nf-time").value,
    memo: document.getElementById("nf-memo").value.trim()
  };
  if (!payload.gym_id || !payload.event_date) { alert("지점과 날짜는 필수입니다"); return; }
  try {
    if (editingEventId) {
      await adminApi(`/api/events/${editingEventId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await adminApi("/api/events", { method: "POST", body: JSON.stringify(payload) });
    }
    closeModal("modal-new");
    editingEventId = null;
    document.getElementById("nf-gym-custom").value = "";
    await loadMonth();
    await loadAdminData();
  } catch (e) { alert(e.message); }
}

async function submitClear() {
  const payload = {
    member_id: Number(document.getElementById("cf-member").value),
    gym_id: Number(document.getElementById("cf-gym").value),
    grade_level: Number(document.getElementById("cf-grade").value),
    log_date: document.getElementById("cf-date").value || todayStr(),
    count: Number(document.getElementById("cf-count").value)
  };
  if (!payload.member_id || !payload.gym_id || !payload.count) { alert("멤버를 검색해서 선택하고, 지점/개수도 확인하세요"); return; }
  try {
    await adminApi("/api/clears", { method: "POST", body: JSON.stringify(payload) });
    alert("기록이 저장되었습니다");
    document.getElementById("cf-count").value = 1;
    await renderRecentClears();
    await loadRankings();
  } catch (e) { alert(e.message); }
}

async function renderRecentClears() {
  try {
    const data = await api("/api/clears/recent?limit=8");
    const t = document.getElementById("recent-clears-body");
    if (!data.logs.length) {
      t.innerHTML = '<tr><td><span class="empty-note">아직 기록이 없습니다</span></td></tr>';
      return;
    }
    t.innerHTML = `<tr><th>날짜</th><th>멤버</th><th>체인/지점</th><th>등급</th><th>개수</th></tr>` +
      data.logs.map(l => {
        const chain = BOOT.chains.find(c => c.name === l.chain_name);
        const gradeName = chain ? (chain.grades.find(g => g.level === l.grade_level) || {}).name || l.grade_level : l.grade_level;
        return `<tr><td>${esc(l.log_date)}</td><td>${esc(l.member_name)}</td>
          <td><span class="badge ${chainCls(l.chain_name)}">${esc(l.chain_name)}</span> ${esc(l.gym_name)}</td>
          <td>${esc(String(gradeName))}</td><td class="val">${l.count}개</td></tr>`;
      }).join("");
  } catch (e) {}
}

async function addMember() {
  const input = document.getElementById("member-name-input");
  const name = input.value.trim();
  if (!name) return;
  try {
    await adminApi("/api/members", { method: "POST", body: JSON.stringify({ name }) });
    input.value = "";
    await refreshMembers();
    await renderMemberList();
  } catch (e) { alert(e.message); }
}

async function deleteMember(id) {
  if (!confirm("이 멤버를 삭제할까요? (참가/기록도 함께 지워집니다)")) return;
  try {
    await adminApi(`/api/members/${id}`, { method: "DELETE" });
    await refreshMembers();
    await renderMemberList();
    await loadRankings();
  } catch (e) { alert(e.message); }
}

function calcAge(birthDate) {
  if (!birthDate) return "";
  const b = new Date(birthDate);
  if (isNaN(b.getTime())) return "";
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--;
  return age >= 0 && age < 150 ? age : "";
}

function renderBirthdayAdminCard() {
  const card = document.getElementById("birthday-admin-card");
  if (!card) return;
  const now = new Date();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const todayKey = `${mm}-${dd}`;
  const todayList = BOOT.members.filter(m => m.birth_date && m.birth_date.slice(5) === todayKey);
  const monthList = BOOT.members.filter(m => m.birth_date && m.birth_date.slice(5, 7) === mm)
    .sort((a, b) => a.birth_date.slice(8, 10).localeCompare(b.birth_date.slice(8, 10)));
  const fmt = m => {
    const age = calcAge(m.birth_date);
    return `${esc(m.name)} (${esc(m.birth_date.slice(5))}${age !== "" ? `, ${age}세` : ""})`;
  };
  if (!monthList.length) { card.style.display = "none"; return; }
  card.style.display = "";
  const todayHtml = todayList.length
    ? `<div style="margin-bottom:8px">🎂 <b>오늘 생일</b>: ${todayList.map(fmt).join(", ")}</div>`
    : `<div style="margin-bottom:8px">🎂 <b>오늘 생일</b>: 없음</div>`;
  const monthHtml = `<div>📅 <b>${Number(mm)}월 생일</b>: ${monthList.map(m => {
    const isToday = m.birth_date.slice(5) === todayKey;
    return isToday ? `<b>${fmt(m)}</b>` : fmt(m);
  }).join(", ")}</div>`;
  card.innerHTML = `<div class="bday-card">${todayHtml}${monthHtml}</div>`;
}

function renderMemberList() {
  const el = document.getElementById("member-list");
  el.innerHTML = BOOT.members.map(m => {
    const age = calcAge(m.birth_date);
    const bday = m.birth_date ? ` · ${esc(m.birth_date)}${age !== "" ? ` (${age}세)` : ""}` : "";
    return `<li style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding:8px 2px;border-bottom:1px solid #f9fafb;font-size:14px;">
       <span>${esc(m.name)}${m.no_rank ? ' <span class="empty-note">(랭킹 제외)</span>' : ""}<span style="font-size:11px;color:#9ca3af">${bday}</span></span>
       <span style="white-space:nowrap">
         <button class="btn-mini" onclick="openMemberSettings(${m.id})">설정</button>
         <button class="btn-mini del" onclick="deleteMember(${m.id})">삭제</button>
       </span>
     </li>`;
  }).join("") || '<li><span class="empty-note">멤버를 추가해 주세요</span></li>';
}

let _editingMemberId = null;

function openMemberSettings(id) {
  const m = BOOT.members.find(x => x.id === id);
  if (!m) return;
  _editingMemberId = id;
  document.getElementById("me-name-edit").value = m.name;
  document.getElementById("me-birth-edit").value = m.birth_date || "";
  document.getElementById("me-no-rank-edit").checked = !!m.no_rank;
  openModal("modal-member-edit");
}

async function saveMemberSettings() {
  if (_editingMemberId == null) return;
  const name = document.getElementById("me-name-edit").value.trim();
  const birth = document.getElementById("me-birth-edit").value;
  const noRank = document.getElementById("me-no-rank-edit").checked;
  if (!name) { alert("이름을 입력하세요"); return; }
  try {
    await adminApi(`/api/members/${_editingMemberId}`, {
      method: "PUT",
      body: JSON.stringify({ name, birth_date: birth || "", no_rank: noRank })
    });
    closeModal("modal-member-edit");
    _editingMemberId = null;
    await refreshMembers();
    await renderMemberList();
    await loadRankings();
  } catch (e) { alert(e.message); }
}

function setupMemberSearch() {
  const input = document.getElementById("cf-member-search");
  const results = document.getElementById("cf-member-results");
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    document.getElementById("cf-member").value = "";
    if (!q) { results.style.display = "none"; return; }
    const matches = BOOT.members.filter(m => m.name.toLowerCase().includes(q)).slice(0, 10);
    if (!matches.length) {
      results.innerHTML = '<div class="search-item empty">검색 결과 없음</div>';
      results.style.display = "block";
      return;
    }
    results.innerHTML = matches.map(m =>
      `<div class="search-item" onclick="pickMember(${m.id}, this)">${esc(m.name)}${m.no_rank ? ' <span class="empty-note">(랭킹 제외)</span>' : ""}</div>`
    ).join("");
    results.style.display = "block";
  });
  input.addEventListener("blur", () => setTimeout(() => { results.style.display = "none"; }, 150));
  input.addEventListener("focus", () => { if (input.value.trim()) input.dispatchEvent(new Event("input")); });
}

function pickMember(id, el) {
  document.getElementById("cf-member").value = id;
  document.getElementById("cf-member-search").value = el.textContent.replace(/\(랭킹 제외\)/g, "").trim();
  document.getElementById("cf-member-results").style.display = "none";
}

/* ---------- 배너 ---------- */
async function loadBanner() {
  try {
    const data = await api("/api/banner");
    const dismissed = localStorage.getItem("bannerDismissed");
    if (data.enabled && data.text && dismissed !== data.text) {
      document.getElementById("banner-text").textContent = data.text;
      document.getElementById("global-banner").style.display = "flex";
    } else {
      document.getElementById("global-banner").style.display = "none";
    }
    const inp = document.getElementById("banner-text-input");
    const chk = document.getElementById("banner-enabled");
    if (inp && data.text != null) inp.value = data.text;
    if (chk) chk.checked = !!data.enabled;
  } catch (e) {}
}

function dismissBanner() {
  const text = document.getElementById("banner-text").textContent;
  localStorage.setItem("bannerDismissed", text);
  document.getElementById("global-banner").style.display = "none";
}

async function saveBanner() {
  const text = document.getElementById("banner-text-input").value.trim();
  const enabled = document.getElementById("banner-enabled").checked;
  if (enabled && !text) { alert("문구를 입력하세요"); return; }
  try {
    await adminApi("/api/banner", { method: "PUT", body: JSON.stringify({ text, enabled }) });
    if (enabled) localStorage.removeItem("bannerDismissed");
    alert("배너가 저장되었습니다");
    await loadBanner();
  } catch (e) { alert(e.message); }
}

function previewBanner() {
  const text = document.getElementById("banner-text-input").value.trim();
  if (!text) { alert("문구를 입력하세요"); return; }
  document.getElementById("banner-text").textContent = text;
  document.getElementById("global-banner").style.display = "flex";
}

function clearBanner() {
  document.getElementById("banner-text-input").value = "";
  document.getElementById("banner-enabled").checked = false;
}

/* ---------- 세팅 일정 ---------- */
const SETTING_SCHEDULE = {
  "월": [
    ["더클라임", "신림 · 성수 · 논현"],
    ["서울숲", "영등포"],
    ["손상원", "강남"],
    ["알레", "강동"],
    ["담장클라이밍", "신촌"],
    ["서볼", "선유"],
    ["페퍼", "원흥"],
    ["비블럭", "영종"],
    ["피커스", "종로"],
    ["크래커", "상봉"],
    ["스톤즈", "낙성대 (격주)"]
  ],
  "화": [
    ["더클라임", "마곡 · 신림 · 사당 · 이수"],
    ["클라이밍파크", "신논현 · 종로"],
    ["서울숲", "구로 · 잠실"],
    ["담장클라이밍", "을지로"],
    ["허브", "논현 (격주)"],
    ["웨락", "부산대"],
    ["어윀", "대전"],
    ["온플릭", "천호"],
    ["옾더월", "이태원"]
  ],
  "수": [
    ["더클라임", "연남 · 강남"],
    ["서울숲", "구로 · 종로"],
    ["알레", "혜화"],
    ["서볼", "목동"],
    ["웨락", "서면"],
    ["온플릭", "천호"],
    ["피커스", "구로"],
    ["손상원", "을지로"]
  ],
  "목": [
    ["더클라임", "연남 · 문래"],
    ["서울숲", "영등포 · 종로"],
    ["클라이밍파크", "강남"],
    ["피크닉", "수원"]
  ],
  "금": [
    ["더클라임", "문래 · 양재"],
    ["스파이시", "금정"],
    ["피커스", "신촌 (격주)"],
    ["코알라", "킨텍스"],
    ["손상원", "판교"]
  ]
};

const SETTING_DAYS = ["월", "화", "수", "목", "금"];
let settingDay = null;

function todayWeekday() {
  const d = new Date().getDay();
  return (d >= 1 && d <= 5) ? SETTING_DAYS[d - 1] : null;
}

function renderSettingCard() {
  const today = todayWeekday();
  if (!settingDay) settingDay = today || "월";
  document.getElementById("setting-today").innerHTML =
    today ? `<span class="today-badge">오늘 ${today}요일</span>` : "주말";
  document.getElementById("setting-days").innerHTML = SETTING_DAYS.map(d =>
    `<button class="${d === settingDay ? "active" : ""}" onclick="selectSettingDay('${d}')">${d}</button>`
  ).join("");
  document.getElementById("setting-list").innerHTML =
    (SETTING_SCHEDULE[settingDay] || []).map(([gym, branch]) =>
      `<li><span class="gdot" style="background:${chainHex(gym)};border-color:${chainHex(gym)}"></span>
        <span><span class="set-gym">${esc(gym)}</span> <span class="set-branch">${esc(branch)}</span></span></li>`
    ).join("");
}

function selectSettingDay(d) {
  settingDay = d;
  renderSettingCard();
}

/* ---------- 맛집 지도 ---------- */
const GYM_LOC = {
  "더클라임|일산점": [37.6509637, 126.7789645],
  "더클라임|마곡점": [37.5683705, 126.8352576],
  "더클라임|양재점": [37.4851554, 127.0358628],
  "더클라임|신림점": [37.4822801, 126.9290378],
  "더클라임|연남점": [37.5576337, 126.9258847],
  "더클라임|강남점": [37.4975932, 127.0320012],
  "더클라임|사당점": [37.4743726, 126.9814277],
  "더클라임|논현점": [37.4692093, 127.0395713],
  "더클라임|문래점": [37.5323202, 126.9008117],
  "더클라임|이수점": [37.5041030, 126.9803607],
  "더클라임|성수점": [37.5467319, 127.0652697],
  "서울숲|영등포점": [37.5178032, 126.9000578],
  "서울숲|종로점": [37.5697586, 126.9896402],
  "서울숲|잠실점": [37.5107795, 127.0823010],
  "서울숲|구로점": [37.4845924, 126.8963929],
  "클라이밍파크|강남점": [37.4952945, 127.0294347],
  "클라이밍파크|종로점": [37.5700, 126.9895],
  "클라이밍파크|한티점": [37.4965, 127.0555],
  "온플릭|천호점": [37.5380, 127.1230],
  "손상원|강남점": [37.5000, 127.0260],
  "손상원|을지로점": [37.5663, 126.9910],
  "손상원|판교점": [37.3950, 127.1110],
  "알레|혜화점": [37.5843680, 127.0010746],
  "알레|강동점": [37.5330170, 127.1387827],
  "피커스|종로점": [37.5700, 126.9895],
  "피커스|신촌점": [37.5565, 126.9440],
  "피커스|구로점": [37.4846, 126.9012],
  "담장클라이밍|신촌점": [37.5565, 126.9440],
  "담장클라이밍|을지로점": [37.5663, 126.9910],
  "크래커|상봉점": [37.5970, 127.0855],
  "기타|기타": [37.5665, 126.9780]
};

const RESTAURANTS = [
  { chain: "알레", gym: "혜화점", name: "히메카츠", cat: "일식 돈카츠", memo: "", lat: 37.5717418, lng: 126.9977031, link: "https://naver.me/5pwZm2Yq" },
  { chain: "알레", gym: "혜화점", name: "고봉당 혜화대학로본점", cat: "등갈비", memo: "등갈비는 보통, 인절미구이가 댑악", lat: 37.5829392, lng: 127.0001425, link: "https://naver.me/GV2tYj49" },
  { chain: "알레", gym: "혜화점", name: "온혜화", cat: "밀크티", memo: "테이크아웃만 가능", lat: 37.5826171, lng: 127.0030740, link: "https://naver.me/FHlgzdUx" },
  { chain: "알레", gym: "혜화점", name: "솔트24 혜화본점", cat: "크로와상", memo: "", lat: 37.5817126, lng: 127.0041249, link: "https://naver.me/xq3aeAf3" },
  { chain: "크래커", gym: "상봉점", name: "제철실비 외대앞점", cat: "장어덮밥", memo: "", lat: 37.5954837, lng: 127.0611478, link: "https://naver.me/F3EAVkSn" },
  { chain: "크래커", gym: "상봉점", name: "소주관", cat: "전 메뉴", memo: "", lat: 37.5943359, lng: 127.0897561, link: "https://naver.me/GvW21yJI" },
  { chain: "서울숲", gym: "잠실점", name: "쭈꾸미도사 잠실새내점", cat: "쭈곱새", memo: "", lat: 37.5107795, lng: 127.0823010, link: "https://naver.me/Gxk126PX" },
  { chain: "클라이밍파크", gym: "강남점", name: "멘츠루 강남점", cat: "츠케멘", memo: "강남권 공용 추천", lat: 37.5020414, lng: 127.0268531, link: "https://naver.me/I55amOAC" },
  { chain: "알레", gym: "강동점", name: "예월수족발명가 예가족발", cat: "족발", memo: "거리는 있지만 가서 먹을 만한 믿음", lat: 37.5330170, lng: 127.1387827, link: "https://naver.me/xa52FRwO" },
  { chain: "손상원", gym: "강남점", name: "웨인스베이글스 강남역점", cat: "베이글+샌드위치", memo: "", lat: 37.4919460, lng: 127.0288535, link: "https://naver.me/5vcHFMYN" },
  { chain: "클라이밍파크", gym: "강남점", name: "자갈치양곱창", cat: "한우곱창구이", memo: "", lat: 37.4944988, lng: 127.0308697, link: "https://naver.me/xHgIutF2" },
  { chain: "클라이밍파크", gym: "강남점", name: "뼈탄집 강남역점", cat: "삼겹살", memo: "", lat: 37.4952168, lng: 127.0309779, link: "https://naver.me/FoENCipm" },
  { chain: "클라이밍파크", gym: "강남점", name: "찬란한아구 강남본점", cat: "아구찜", memo: "아구찜 초보자 전용", lat: 37.4948778, lng: 127.0303648, link: "https://naver.me/FxFtVV71" },
  { chain: "손상원", gym: "을지로점", name: "가쯔야 무교본점", cat: "일식 돈까스", memo: "", lat: 37.5678200, lng: 126.9817366, link: "https://naver.me/FtTh658H" },
  { chain: "손상원", gym: "을지로점", name: "한성양꼬치 종각점", cat: "양꼬치", memo: "", lat: 37.5695618, lng: 126.9843029, link: "https://naver.me/Gq84BTBp" },
  { chain: "서울숲", gym: "구로점", name: "아건 구디역점", cat: "인도 커리", memo: "", lat: 37.4836067, lng: 126.9009031, link: "https://naver.me/GG7tBjQw" }
];

let foodMap = null;
let gymMarker = null;
let foodMarkers = [];
let foodChainIdx = 0;

function buildFoodControls() {
  const seg = document.getElementById("food-chain");
  seg.innerHTML = BOOT.chains.map((c, i) =>
    `<button class="${i === 0 ? "active" : ""}" onclick="selectFoodChain(${i})">${esc(c.name)}</button>`).join("");
  fillFoodGyms();
}

function selectFoodChain(i) {
  foodChainIdx = i;
  document.querySelectorAll("#food-chain button").forEach((b, bi) =>
    b.classList.toggle("active", bi === i));
  fillFoodGyms();
}

function fillFoodGyms() {
  const sel = document.getElementById("food-gym");
  sel.innerHTML = BOOT.chains[foodChainIdx].gyms.map(g => `<option>${esc(g.name)}</option>`).join("");
  showGym();
}

function showGym() {
  if (!foodMap) return;
  const chain = BOOT.chains[foodChainIdx];
  const gym = document.getElementById("food-gym").value;
  const loc = GYM_LOC[chain.name + "|" + gym] || [37.5665, 126.9780];
  foodMap.setView(loc, 14);
  if (gymMarker) foodMap.removeLayer(gymMarker);
  gymMarker = L.circleMarker(loc, {
    radius: 10, color: "#fff", weight: 3,
    fillColor: chainHex(chain.name), fillOpacity: 1
  }).addTo(foodMap).bindPopup(`<b>${esc(chain.name)} ${esc(gym)}</b>`);
  foodMarkers.forEach(m => foodMap.removeLayer(m));
  foodMarkers = [];
  const list = document.getElementById("food-list");
  const items = RESTAURANTS.filter(r => r.chain === chain.name && r.gym === gym);
  document.getElementById("food-title").innerHTML =
    `${esc(chain.name)} ${esc(gym)} 근처 <small>${items.length}곳</small>`;
  list.innerHTML = "";
  if (!items.length) {
    list.innerHTML = '<div class="food-item"><div class="f-name">등록된 맛집이 없습니다</div><div class="f-memo">추후 추가 예정</div></div>';
    return;
  }
  items.forEach((r, i) => {
    const m = L.marker([r.lat, r.lng]).addTo(foodMap)
      .bindPopup(`<b>${esc(r.name)}</b><br>${esc(r.cat)}${r.memo ? " &middot; " + esc(r.memo) : ""}<br><a href="${r.link}" target="_blank">네이버지도에서 보기</a>`);
    foodMarkers.push(m);
    const div = document.createElement("div");
    div.className = "food-item";
    div.innerHTML = `<div class="f-name">${i + 1}. ${esc(r.name)}<span class="f-cat">${esc(r.cat)}</span></div><div class="f-memo">${esc(r.memo || "")} &middot; <a href="${r.link}" target="_blank" onclick="event.stopPropagation()">네이버지도</a></div>`;
    div.onclick = () => { foodMap.flyTo([r.lat, r.lng], 16); setTimeout(() => m.openPopup(), 350); };
    list.appendChild(div);
  });
}

function initFoodMap() {
  if (typeof L === "undefined") return;
  if (foodMap) { foodMap.invalidateSize(); showGym(); return; }
  foodMap = L.map("map").setView([37.5665, 126.9780], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap"
  }).addTo(foodMap);
  showGym();
}

/* ---------- 초기화 ---------- */
function fillEventFormSelects() {
  const nfChain = document.getElementById("nf-chain");
  nfChain.innerHTML = BOOT.chains.map((c, i) => `<option value="${i}">${esc(c.name)}</option>`).join("");
  bindDependentSelects("nf-chain", "nf-gym", null);
  const cfChain = document.getElementById("cf-chain");
  cfChain.innerHTML = BOOT.chains.filter(c => c.grades.length)
    .map((c, i) => { void i; return `<option value="${BOOT.chains.indexOf(c)}">${esc(c.name)}</option>`; }).join("");
  bindDependentSelects("cf-chain", "cf-gym", "cf-grade");
  document.getElementById("cf-date").value = todayStr();
}

async function init() {
  if (!isAdminUI) {
    document.querySelectorAll(".admin-only").forEach(b => b.style.display = "none");
    const gb = document.getElementById("btn-goto-admin");
    const gt = document.getElementById("tag-goto-admin");
    if (gb) gb.style.display = "none";
    if (gt) gt.style.display = "none";
  }
  document.querySelectorAll("nav button").forEach(b =>
    b.addEventListener("click", () => switchTab(b.dataset.tab)));
  document.querySelectorAll(".modal-backdrop").forEach(m =>
    m.addEventListener("click", e => { if (e.target === m) m.classList.remove("open"); }));
  document.querySelectorAll("#seg-period button").forEach(b => {
    b.addEventListener("click", () => {
      rankPeriod = b.dataset.period;
      document.querySelectorAll("#seg-period button").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      loadRankings();
    });
  });
  document.getElementById("prev-month").addEventListener("click", () => {
    calM--; if (calM < 1) { calM = 12; calY--; } loadMonth();
  });
  document.getElementById("next-month").addEventListener("click", () => {
    calM++; if (calM > 12) { calM = 1; calY++; } loadMonth();
  });
  document.getElementById("save-event-btn").addEventListener("click", saveEvent);
  document.getElementById("clear-submit").addEventListener("click", submitClear);
  document.getElementById("member-add-btn").addEventListener("click", addMember);

  BOOT = await api("/api/bootstrap");
  const now = new Date();
  calY = now.getFullYear();
  calM = now.getMonth() + 1;

  renderChainChips();
  fillEventFormSelects();
  setupMemberSearch();
  buildFoodControls();
  renderBirthdayAdminCard();
  renderSettingCard();
  await loadBanner();

  await loadMonth();
  await loadRankings();
}

init();
