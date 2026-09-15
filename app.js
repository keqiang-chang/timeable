/* 我的课表 · 主程序
 *
 * 分成四块：课表 / AI 助手 / 每日学习 / 我的（设置）
 * 纯静态，无框架，数据全部存在本机浏览器里。
 */

(function () {
"use strict";

const { META, PERIODS, COURSES, DAYNAME, WD } = window.TT;
const { chat, askJSON, AIError, DEFAULT_BASE, MODELS } = window.TT.AI;

/* ================= 存储 ================= */
const LS_CFG = "wuda-timetable-v1";   // 沿用旧版键名：start / lead / theme / includeAudit
const LS_AI = "wt.ai";
const LS_PIN = "wt.pin";
const LS_SESS = "wt.sessions";
const LS_DAILY = "wt.daily";
const DAILY_KEEP_DAYS = 30;

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) { return fallback; }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}

const DEFAULTS_CFG = { start: "2026-09-07", lead: 15, theme: "auto", includeAudit: false };
let cfg = Object.assign({}, DEFAULTS_CFG, read(LS_CFG, {}));
function saveCfg() { write(LS_CFG, cfg); }

const DEFAULTS_AI = { apiKey: "", model: "deepseek-chat", baseUrl: DEFAULT_BASE };
let ai = Object.assign({}, DEFAULTS_AI, read(LS_AI, {}));
function saveAI() { write(LS_AI, ai); }

/* ================= 小工具 ================= */
const $ = (id) => document.getElementById(id);
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function mdLite(s) {
  let h = esc(s);
  h = h.replace(/^#{1,4}\s*(.+)$/gm, "<h4>$1</h4>");
  h = h.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  return h;
}
function toast(title, sub) {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = "<b>" + esc(title) + "</b>" + (sub ? "<span>" + esc(sub) + "</span>" : "");
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), 12000);
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* ================= 日期 ================= */
function parseISO(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function fmtISO(dt) {
  const p = (n) => String(n).padStart(2, "0");
  return dt.getFullYear() + "-" + p(dt.getMonth() + 1) + "-" + p(dt.getDate());
}
function midnight(dt) { return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()); }
function addDays(dt, n) { const d = new Date(dt.getTime()); d.setDate(d.getDate() + n); return d; }
function week1() { return parseISO(cfg.start); }
function dateOf(w, day) { return addDays(week1(), (w - 1) * 7 + (day - 1)); }
function weekOf(dt) { return Math.floor((midnight(dt) - week1()) / 86400000 / 7) + 1; }
function todayWeek() { return weekOf(new Date()); }
function dayIdx(dt) { return dt.getDay() === 0 ? 7 : dt.getDay(); }
function fmtMD(dt) { return (dt.getMonth() + 1) + "月" + dt.getDate() + "日"; }
function curWeek() { return Math.min(Math.max(todayWeek(), 1), META.termWeeks); }

/* ================= 课表数据逻辑 ================= */
const KINDS = {};
COURSES.forEach((c) => { if (!(c.name in KINDS)) KINDS[c.name] = Object.keys(KINDS).length % 20; });
const kindOf = (c) => "k" + KINDS[c.name];
const active = (c, w) => w >= c.weeks[0] && w <= c.weeks[1];
const weekLabel = (c) => (c.weeks[0] === c.weeks[1] ? c.weeks[0] + "周" : c.weeks[0] + "-" + c.weeks[1] + "周");
const pStart = (p) => PERIODS[p - 1].start;
const pEnd = (p) => PERIODS[p - 1].end;
const timeLabel = (c) => pStart(c.start) + "–" + pEnd(c.end);
const roomLabel = (c) => c.room || "教室待定";
const parseHM = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
function nowMin() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }

function mergeForGrid(list) {
  const groups = new Map();
  list.forEach((c) => {
    const k = [c.day, c.name, c.cls, c.teacher, c.room].join("|");
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  });
  const out = [];
  groups.forEach((group) => {
    group.sort((a, b) => (a.start - b.start) || (a.end - b.end));
    let cur = null;
    group.forEach((c) => {
      if (cur && c.start === cur.end + 1) {
        cur.end = c.end;
        cur.parts.push(c);
        cur.weeks = [Math.min(cur.weeks[0], c.weeks[0]), Math.max(cur.weeks[1], c.weeks[1])];
        return;
      }
      cur = {
        uid: c.uid, day: c.day, start: c.start, end: c.end, weeks: c.weeks.slice(),
        name: c.name, cls: c.cls, teacher: c.teacher, room: c.room,
        audit: c.audit, code: c.code, parts: [c],
      };
      out.push(cur);
    });
  });
  return out.sort((a, b) => (a.start - b.start) || (a.end - b.end));
}
function groupBySlot(list) {
  const m = new Map();
  list.forEach((c) => {
    const k = c.day + "|" + c.start + "-" + c.end;
    if (!m.has(k)) m.set(k, { day: c.day, start: c.start, end: c.end, items: [] });
    m.get(k).items.push(c);
  });
  return Array.from(m.values()).sort((a, b) => (a.start - b.start) || (a.end - b.end));
}
function assignLanes(blocks) {
  const sorted = blocks.slice().sort((a, b) => (a.start - b.start) || (a.end - b.end));
  const out = [];
  let cluster = [], clusterEnd = -Infinity;
  function flush() {
    if (!cluster.length) return;
    const laneEnds = [], placed = [];
    cluster.forEach((c) => {
      let lane = laneEnds.findIndex((e) => e < c.start);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(c.end); }
      else laneEnds[lane] = c.end;
      placed.push({ c, lane });
    });
    const n = laneEnds.length;
    placed.forEach((p) => out.push({ c: p.c, lane: p.lane, lanes: n }));
    cluster = []; clusterEnd = -Infinity;
  }
  sorted.forEach((c) => {
    if (c.start > clusterEnd) flush();
    cluster.push(c);
    if (c.end > clusterEnd) clusterEnd = c.end;
  });
  flush();
  return out;
}
function coursesOn(day, w) {
  return mergeForGrid(COURSES.filter((c) => c.day === day && active(c, w)));
}
function coursesOnDate(dt) { return coursesOn(dayIdx(dt), weekOf(dt)); }

/* ================= 主题 ================= */
const mq = window.matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  document.documentElement.setAttribute("data-theme",
    cfg.theme === "auto" ? (mq.matches ? "dark" : "light") : cfg.theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", mq.matches || cfg.theme === "dark" ? "#101317" : "#2f6feb");
}
mq.addEventListener("change", () => { if (cfg.theme === "auto") applyTheme(); });

/* ================= 状态 ================= */
let selWeek = curWeek();
let selDay = dayIdx(new Date());
let view = "grid";
let dailyDate = fmtISO(new Date());
let timers = [];
let fired = new Set();
let abortCtl = null;

/* ================= 课表：渲染 ================= */
function renderToday() {
  const now = new Date();
  const tw = todayWeek();
  document.getElementById("todayDate").textContent =
    fmtMD(now) + " " + DAYNAME[dayIdx(now)] + " · 第 " + tw + " 周";

  const ul = $("todayList");
  ul.innerHTML = "";
  if (tw < 1 || tw > META.termWeeks) {
    ul.innerHTML = '<li class="empty" style="cursor:default">今天不在学期内。</li>';
    return;
  }
  const list = coursesOn(dayIdx(now), tw);
  if (!list.length) {
    ul.innerHTML = '<li class="empty" style="cursor:default">今天没课，好好休息。</li>';
    return;
  }
  const cur = nowMin();
  list.forEach((c) => {
    const s = parseHM(pStart(c.start)), e = parseHM(pEnd(c.end));
    const li = document.createElement("li");
    li.className = kindOf(c) + (cur >= s && cur <= e ? " live" : "");
    let tag = "";
    if (cur >= s && cur <= e) tag = '<span class="tag">正在上</span>';
    else if (cur < s && s - cur <= cfg.lead) tag = '<span class="tag">即将开始</span>';
    else if (cur > e) tag = '<span class="tag">已结束</span>';
    li.innerHTML =
      '<span class="t">' + timeLabel(c) + "</span>" +
      "<span><span class=\"n\">" + esc(c.name) +
        (c.audit ? '<span class="tag">旁听</span>' : "") + tag + "</span>" +
      '<span class="m">' + esc(roomLabel(c)) + " · " + esc(c.teacher) + "</span></span>";
    li.addEventListener("click", () => openDetail(c));
    ul.appendChild(li);
  });
}

function conflictGroups(w) {
  const byDay = new Map();
  mergeForGrid(COURSES.filter((c) => active(c, w))).forEach((c) => {
    if (!byDay.has(c.day)) byDay.set(c.day, []);
    byDay.get(c.day).push(c);
  });
  const res = [];
  byDay.forEach((arr, day) => {
    arr.sort((a, b) => a.start - b.start);
    let comp = [], end = -Infinity;
    const flush = () => {
      if (comp.length > 1) {
        res.push({
          day, start: Math.min.apply(null, comp.map((c) => c.start)),
          end: Math.max.apply(null, comp.map((c) => c.end)), items: comp.slice(),
        });
      }
      comp = [];
    };
    arr.forEach((c) => {
      if (comp.length && c.start > end) { flush(); end = -Infinity; }
      comp.push(c);
      if (c.end > end) end = c.end;
    });
    flush();
  });
  return res.sort((a, b) => (a.day - b.day) || (a.start - b.start));
}

function renderConflicts() {
  const box = $("conflict");
  const groups = conflictGroups(selWeek);
  if (!groups.length) { box.innerHTML = ""; return; }
  box.innerHTML = groups.map((gp) => {
    const names = gp.items.map((c) =>
      esc(c.name) + "（" + (c.audit ? "旁听" : "本专业") + " " + weekLabel(c) + " " + esc(roomLabel(c)) + "）"
    ).join("、");
    return '<div class="warn"><span class="ic">!</span><div><b>时间冲突</b>　' +
      DAYNAME[gp.day] + " 第" + gp.start + "–" + gp.end + " 节有 " + gp.items.length +
      " 门课重叠：" + names + "。只能选一门去上。</div></div>";
  }).join("");
}

function makeEv(co, mode, live) {
  const on = active(co, selWeek);
  const el = document.createElement("div");
  el.className = "ev " + kindOf(co) + (on ? " inweek" : " offweek") +
    (co.audit ? " audit" : "") + (mode === "full" ? "" : " " + mode);
  if (on && live) el.classList.add("live");
  const badge = co.audit ? '<span class="badge">旁听</span>' : "";
  el.innerHTML =
    (mode === "mini" ? badge : "") +
    '<span class="en">' + (mode === "mini" ? "" : badge) + esc(co.name) + "</span>" +
    '<span class="er">' + esc(roomLabel(co)) + (mode === "full" ? "" : " · " + weekLabel(co)) + "</span>" +
    (mode === "full" ? '<span class="er">' + weekLabel(co) + " · " + esc(co.teacher) + "</span>" : "");
  el.tabIndex = 0;
  el.addEventListener("click", () => openDetail(co));
  el.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openDetail(co); }
  });
  return el;
}

function renderGrid() {
  const g = $("grid");
  g.innerHTML = "";
  const tw = todayWeek();
  const nowD = new Date();
  const twd = dayIdx(nowD);
  const cur = nowMin();
  const onToday = selWeek === tw;
  const sub = (d, lane) => 2 + (d - 1) * 2 + lane;
  const fullDay = (d) => sub(d, 0) + " / " + (sub(d, 0) + 2);

  for (let d = 1; d <= 7; d++) {
    const el = document.createElement("div");
    el.className = "dh" + (onToday && d === twd ? " today" : "");
    el.style.gridColumn = fullDay(d);
    el.style.gridRow = 1;
    const dd = dateOf(selWeek, d);
    el.innerHTML = DAYNAME[d] + '<span class="d">' + (dd.getMonth() + 1) + "/" + dd.getDate() + "</span>";
    g.appendChild(el);
  }

  for (let p = 1; p <= 13; p++) {
    const ph = document.createElement("div");
    ph.className = "ph" + (onToday && cur >= parseHM(pStart(p)) && cur <= parseHM(pEnd(p)) ? " today" : "");
    ph.style.gridColumn = 1;
    ph.style.gridRow = p + 1;
    let seg = "";
    if (p === 1) seg = '<span class="seg">上午</span>';
    if (p === 6) seg = '<span class="seg">下午</span>';
    if (p === 11) seg = '<span class="seg">晚上</span>';
    ph.innerHTML = seg + '<span class="n">第' + p + "节</span>" + '<span class="p">' + pStart(p) + "</span>";
    g.appendChild(ph);
    for (let d = 1; d <= 7; d++) {
      const c = document.createElement("div");
      c.className = "cell";
      c.style.gridColumn = fullDay(d);
      c.style.gridRow = p + 1;
      g.appendChild(c);
    }
  }

  let activeCount = 0, auditCount = 0, hasStack = false;
  for (let d = 1; d <= 7; d++) {
    const groups = groupBySlot(mergeForGrid(COURSES.filter((c) => c.day === d)));
    const laid = assignLanes(groups);
    if (groups.some((gp) => gp.items.length > 1)) hasStack = true;
    laid.forEach(({ c: gp, lane, lanes }) => {
      const colSpec = lanes > 1 ? (sub(d, lane) + " / " + (sub(d, lane) + 1)) : fullDay(d);
      const live = onToday && d === twd &&
        cur >= parseHM(pStart(gp.start)) && cur <= parseHM(pEnd(gp.end));
      gp.items.forEach((co) => {
        if (active(co, selWeek)) { activeCount++; if (co.audit) auditCount++; }
      });
      if (gp.items.length === 1) {
        const el = makeEv(gp.items[0], "full", live);
        el.style.gridColumn = colSpec;
        el.style.gridRow = (gp.start + 1) + " / " + (gp.end + 2);
        g.appendChild(el);
      } else {
        const wrap = document.createElement("div");
        wrap.className = "stack";
        wrap.style.gridColumn = colSpec;
        wrap.style.gridRow = (gp.start + 1) + " / " + (gp.end + 2);
        const mode = lanes > 1 ? "mini" : "stackcard";
        gp.items.forEach((co) => wrap.appendChild(makeEv(co, mode, live)));
        g.appendChild(wrap);
      }
    });
  }

  const own = COURSES.filter((c) => !c.audit).length;
  const aud = COURSES.filter((c) => c.audit).length;
  let txt = "第 " + selWeek + " 周：本专业 " + (activeCount - auditCount) + " 门，旁听 " + auditCount +
    " 门（全学期本专业 " + own + " 门 + 旁听 " + aud + " 门）。虚线框带「旁听」角标的是旁听课";
  if (hasStack) txt += "；同一格内叠放或并排的课按周次交替，颜色浅的是本周不上的";
  $("gridHint").textContent = txt + "。";
}

function renderTabs() {
  const t = $("dayTabs");
  t.innerHTML = "";
  const tw = todayWeek(), twd = dayIdx(new Date());
  for (let d = 1; d <= 7; d++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn" + (d === selDay ? " solid" : "");
    b.setAttribute("aria-pressed", d === selDay ? "true" : "false");
    b.textContent = DAYNAME[d] + (selWeek === tw && d === twd ? " •" : "");
    b.addEventListener("click", () => { selDay = d; renderTabs(); renderDay(); });
    t.appendChild(b);
  }
}
function renderDay() {
  const box = $("dayList");
  box.innerHTML = "";
  const list = coursesOn(selDay, selWeek);
  if (!list.length) {
    box.innerHTML = '<div class="empty">第 ' + selWeek + " 周 " + DAYNAME[selDay] + " 没课。</div>";
    return;
  }
  list.forEach((c) => {
    const d = document.createElement("div");
    d.className = "dcard " + kindOf(c);
    d.innerHTML =
      '<div class="dh2"><b>' + esc(c.name) + "</b><span>" + timeLabel(c) + "</span></div>" +
      '<div class="dm">第' + c.start + (c.end > c.start ? "–" + c.end : "") + "节 · " + weekLabel(c) +
      " · " + esc(roomLabel(c)) + " · " + esc(c.teacher) + "</div>";
    d.addEventListener("click", () => openDetail(c));
    box.appendChild(d);
  });
}

function openDetail(c) {
  $("dTitle").textContent = c.name;
  const sub = [];
  if (c.audit) sub.push("旁听课 · 不是本专业安排的课程");
  if (c.cls) sub.push("教学班：" + c.cls);
  $("dCls").textContent = sub.join(" · ");
  $("dTime").textContent = DAYNAME[c.day] + " " + timeLabel(c) +
    "（第" + c.start + (c.end > c.start ? "–" + c.end : "") + "节）";
  let wk = weekLabel(c) + " · 第 " + selWeek + " 周对应 " + fmtMD(dateOf(selWeek, c.day));
  if (c.parts && c.parts.length > 1) {
    wk += "（原始课表按节次分段，周次略有差异：" +
      c.parts.map((p) => "第" + p.start + (p.end > p.start ? "–" + p.end : "") + "节 " + weekLabel(p)).join("；") + "）";
  }
  $("dWeeks").textContent = wk;
  $("dRoom").textContent = roomLabel(c);
  $("dTeacher").textContent = c.teacher || "—";
  $("detailMask").hidden = false;
}

function renderTimetable() {
  $("barTitle").textContent = "课表";
  $("barSub").textContent = META.school + " · " + META.term;
  const a = dateOf(selWeek, 1), b = dateOf(selWeek, 7);
  const tw = todayWeek();
  $("barSub").textContent = "第 " + selWeek + " 周 · " + fmtMD(a) + "–" + fmtMD(b) +
    (selWeek !== tw && tw >= 1 && tw <= META.termWeeks ? "（本周是第 " + tw + " 周）" : "");
  renderToday();
  renderConflicts();
  renderGrid();
  renderTabs();
  renderDay();
  setView(view);
  scheduleReminders();
}

function setView(v) {
  view = v;
  $("vGrid").setAttribute("aria-pressed", v === "grid" ? "true" : "false");
  $("vDay").setAttribute("aria-pressed", v === "day" ? "true" : "false");
  $("gridWrap").hidden = v !== "grid";
  $("dayWrap").hidden = v !== "day";
}

/* ================= 课前提醒 ================= */
function notifyBrowser(title, body) {
  try {
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
  } catch (e) {}
}
function scheduleReminders() {
  timers.forEach(clearTimeout);
  timers = [];
  const now = new Date();
  const tw = todayWeek();
  if (tw < 1 || tw > META.termWeeks) return;
  coursesOn(dayIdx(now), tw)
    .filter((c) => cfg.includeAudit || !c.audit)
    .forEach((c) => {
      const s = parseHM(pStart(c.start));
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(s / 60), s % 60, 0, 0);
      at.setMinutes(at.getMinutes() - cfg.lead);
      const key = tw + "-" + c.day + "-" + c.name + "-" + c.start;
      const delay = at - now;
      if (delay < 0 || delay > 86400000 || fired.has(key)) return;
      timers.push(setTimeout(() => {
        fired.add(key);
        toast("该去上课了：" + c.name, timeLabel(c) + " 开始 · " + roomLabel(c));
        notifyBrowser("该去上课了：" + c.name, timeLabel(c) + " 开始 · " + roomLabel(c));
      }, delay));
    });
}

/* ================= 导出日历 ================= */
function icsEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 72) return line;
  const parts = [];
  let cur = "", n = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (n + b > 72) { parts.push(cur); cur = ""; n = 0; }
    cur += ch; n += b;
  }
  if (cur) parts.push(cur);
  return parts.join("\r\n ");
}
function stamp(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "T" + p(d.getHours()) + p(d.getMinutes()) + "00";
}
function buildICS() {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//wuda-timetable//CN", "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH", "X-WR-CALNAME:" + (cfg.includeAudit ? "课程表+旁听课" : "课程表") + " 2026-2027学年 第一学期",
    "X-WR-TIMEZONE:Asia/Shanghai", "BEGIN:VTIMEZONE", "TZID:Asia/Shanghai", "BEGIN:STANDARD",
    "DTSTART:19910915T000000", "TZOFFSETFROM:+0800", "TZOFFSETTO:+0800", "TZNAME:CST",
    "END:STANDARD", "END:VTIMEZONE"];
  const nowS = stamp(new Date());
  COURSES.forEach((c) => {
    if (c.audit && !cfg.includeAudit) return;
    for (let w = c.weeks[0]; w <= c.weeks[1]; w++) {
      const d = dateOf(w, c.day);
      const sh = pStart(c.start).split(":").map(Number);
      const eh = pEnd(c.end).split(":").map(Number);
      const ds = new Date(d.getFullYear(), d.getMonth(), d.getDate(), sh[0], sh[1]);
      const de = new Date(d.getFullYear(), d.getMonth(), d.getDate(), eh[0], eh[1]);
      const desc = [];
      if (c.audit) desc.push("旁听课（非本专业安排）");
      desc.push("教师：" + (c.teacher || "—"));
      if (c.cls) desc.push("教学班：" + c.cls);
      desc.push("周次：" + weekLabel(c));
      L.push("BEGIN:VEVENT", "UID:wuda-" + c.uid + "-w" + w + "@timetable",
        "DTSTAMP:" + nowS + "Z",
        "DTSTART;TZID=Asia/Shanghai:" + stamp(ds),
        "DTEND;TZID=Asia/Shanghai:" + stamp(de),
        "SUMMARY:" + icsEscape((c.audit ? "[旁听] " : "") + c.name),
        "CATEGORIES:" + (c.audit ? "旁听" : "课程"),
        "LOCATION:" + icsEscape(roomLabel(c)),
        "DESCRIPTION:" + icsEscape(desc.join("\n")),
        "BEGIN:VALARM", "TRIGGER:-PT" + cfg.lead + "M", "ACTION:DISPLAY",
        "DESCRIPTION:" + icsEscape(c.name + " 即将开始"), "END:VALARM", "END:VEVENT");
    }
  });
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}
function downloadICS() {
  const blob = new Blob([buildICS()], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = cfg.includeAudit ? "课程表含旁听.ics" : "课表.ics";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast("已导出日历文件", "把它导入手机日历，就能按时收到提醒。");
}

/* ================= 锁屏 ================= */
const LS_PINON = "wt.pinon";
let pinBuf = "", pinStage = "unlock", pinFirst = "";
let lastHidden = 0;

function pinOn() { return read(LS_PINON, false) && !!read(LS_PIN, null); }
async function hashPin(pin, salt) {
  const bytes = new TextEncoder().encode(salt + "|" + pin);
  if (window.crypto && crypto.subtle && crypto.subtle.digest) {
    const buf = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 2166136261;
  for (const b of bytes) { h ^= b; h = Math.imul(h, 16777619); }
  return "fnv" + (h >>> 0).toString(16);
}
function renderDots(err) {
  const n = Math.max(4, Math.min(6, pinBuf.length || 4));
  $("lockDots").className = "dots" + (err ? " err" : "");
  $("lockDots").innerHTML = Array.from({ length: n }, (_, i) =>
    "<i class=\"" + (i < pinBuf.length ? "on" : "") + "\"></i>").join("");
}
function showLock(mode) {
  pinStage = mode;
  pinBuf = ""; pinFirst = "";
  $("lock").hidden = false;
  $("keySkip").style.visibility = mode === "setup" ? "visible" : "hidden";
  $("lockTitle").textContent = mode === "setup" ? "设置解锁密码" : "输入密码";
  $("lockMsg").textContent = mode === "setup" ? "用 4-6 位数字，只保存在这台手机上" : "";
  renderDots(false);
}
async function onKey(k) {
  if (k === "skip") {
    write(LS_PINON, false);
    $("lock").hidden = true;
    return;
  }
  if (k === "del") { pinBuf = pinBuf.slice(0, -1); renderDots(false); return; }
  if (pinBuf.length >= 6) return;
  pinBuf += k;
  renderDots(false);

  if (pinStage === "setup") {
    if (pinBuf.length < 4) return;
    if (!pinFirst) {
      pinFirst = pinBuf; pinBuf = "";
      $("lockMsg").textContent = "再输一次确认";
      renderDots(false);
      return;
    }
    if (pinFirst !== pinBuf) {
      $("lockDots").classList.add("shake");
      $("lockMsg").textContent = "两次输入不一致，重新设置";
      pinFirst = ""; pinBuf = "";
      setTimeout(() => renderDots(false), 400);
      return;
    }
    const salt = uid();
    write(LS_PIN, { salt, hash: await hashPin(pinBuf, salt), len: pinBuf.length });
    write(LS_PINON, true);
    $("lock").hidden = true;
    toast("密码已设置", "下次打开应用需要输入。");
    return;
  }

  if (pinBuf.length >= 4) {
    const rec = read(LS_PIN, null);
    const want = rec && rec.len ? rec.len : 6;
    if (rec && pinBuf.length === want) {
      if ((await hashPin(pinBuf, rec.salt)) === rec.hash) {
        $("lock").hidden = true;
        pinBuf = "";
        return;
      }
      // 立刻清空，否则用户接着输正确密码时会被吞掉
      pinBuf = "";
      renderDots(true);
      $("lockDots").classList.add("shake");
      $("lockMsg").textContent = "密码不对，请重试";
      setTimeout(() => {
        renderDots(false);
        $("lockMsg").textContent = "";
      }, 1200);
    }
  }
}

/* ================= 标签切换 ================= */
const TABS = ["timetable", "ai", "daily", "me"];
function go(tab) {
  TABS.forEach((t) => {
    $("sc-" + t).hidden = t !== tab;
    document.querySelector('.tabbar button[data-tab="' + t + '"]')
      .setAttribute("aria-selected", t === tab ? "true" : "false");
  });
  if (tab === "timetable") renderTimetable();
  if (tab === "ai") renderChat();
  if (tab === "daily") renderDaily();
  if (tab === "me") fillSettings();
}

/* ================= AI 助手 ================= */
let sessions = read(LS_SESS, []);
let curSess = null;

function newSession(quiet) {
  const s = { id: uid(), title: "新对话", msgs: [], updated: Date.now() };
  sessions.unshift(s);
  curSess = s;
  write(LS_SESS, sessions);
  if (!quiet) { renderSessions(); renderChat(); }
  return s;
}
function currentSession() {
  if (!sessions.length) return newSession(true);
  if (!curSess || !sessions.some((s) => s.id === curSess.id)) curSess = sessions[0];
  return curSess;
}
function renderSessions() {
  const sel = $("sessSel");
  sel.innerHTML = "";
  sessions.forEach((s) => {
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = s.title || "新对话";
    sel.appendChild(o);
  });
  sel.value = currentSession().id;
}
function systemPrompt() {
  const now = new Date();
  const w = weekOf(now);
  const today = coursesOn(dayIdx(now), w);
  const list = today.length
    ? today.map((c) => c.name + "（" + c.teacher + "，" + timeLabel(c) + "，" + roomLabel(c) + "）").join("；")
    : "今天没有课";
  return "你是常克强的法学学习助手。他在武汉大学读法律硕士（非法学），2026-2027学年第一学期。\n" +
    "今天是 " + fmtISO(now) + " " + WD[now.getDay()] + "，第 " + w + " 周。今天有课：" + list + "。\n" +
    "回答要求：用中文；简洁、有条理，能用小标题和分点就用；涉及法条时写明法律名称和条文序号；" +
    "不确定或有争议的地方要明确说明，不要编造。";
}
function renderChat() {
  $("barTitle").textContent = "AI 助手";
  $("barSub").textContent = ai.apiKey ? "DeepSeek · " + ai.model : "还没配置 API Key";
  renderSessions();
  const box = $("chatBody");
  const s = currentSession();
  box.innerHTML = "";
  if (!s.msgs.length) {
    box.innerHTML =
      '<div class="msg sys">可以问我今天的课程重点、法条、案例，也可以让我帮你准备课堂发言。</div>' +
      '<div class="chips">' +
      ["今天课程的重点是什么", "出一道今天课程相关的案例题", "帮我梳理这周的学习计划", "解释一下善意取得"]
        .map((q) => '<button class="chip" data-q="' + esc(q) + '">' + esc(q) + "</button>").join("") +
      "</div>";
    box.querySelectorAll("[data-q]").forEach((b) =>
      b.addEventListener("click", () => { $("chatInput").value = b.dataset.q; sendChat(); }));
  }
  s.msgs.forEach((m) => box.appendChild(msgEl(m.role, m.content)));
  box.scrollTop = box.scrollHeight;
}
function msgEl(role, text) {
  const d = document.createElement("div");
  d.className = "msg " + (role === "user" ? "me" : "ai");
  d.innerHTML = mdLite(text);
  return d;
}
async function sendChat() {
  const input = $("chatInput");
  const text = input.value.trim();
  if (!text) return;
  if (!ai.apiKey) {
    toast("还没填 API Key", "到「我的 → DeepSeek」里填一个再用。");
    go("me");
    return;
  }
  const s = currentSession();
  s.msgs.push({ role: "user", content: text, ts: Date.now() });
  if (s.title === "新对话") s.title = text.slice(0, 18);
  s.updated = Date.now();
  write(LS_SESS, sessions);
  input.value = "";
  autosize();

  const box = $("chatBody");
  if (box.querySelector(".chips")) box.innerHTML = "";
  box.appendChild(msgEl("user", text));
  const reply = document.createElement("div");
  reply.className = "msg ai";
  reply.innerHTML = '<span class="spin"></span>';
  box.appendChild(reply);
  box.scrollTop = box.scrollHeight;

  $("sendBtn").textContent = "停止";
  $("sendBtn").dataset.mode = "stop";
  abortCtl = new AbortController();

  const history = [{ role: "system", content: systemPrompt() }]
    .concat(s.msgs.slice(-20).map((m) => ({ role: m.role, content: m.content })));

  let acc = "";
  try {
    await chat({
      cfg: ai, messages: history, stream: true, signal: abortCtl.signal,
      onDelta: (piece, full) => {
        acc = full;
        reply.innerHTML = mdLite(full) + '<span class="cur"></span>';
        box.scrollTop = box.scrollHeight;
      },
    });
    s.msgs.push({ role: "assistant", content: acc, ts: Date.now() });
    s.updated = Date.now();
    write(LS_SESS, sessions);
    reply.innerHTML = mdLite(acc) || "(空回复)";
  } catch (e) {
    if (e && e.name === "AbortError") {
      if (acc) s.msgs.push({ role: "assistant", content: acc, ts: Date.now() });
      write(LS_SESS, sessions);
      reply.innerHTML = mdLite(acc || "(已停止)");
    } else {
      reply.className = "msg ai";
      reply.innerHTML = '<span class="err">' + esc(e.message || String(e)) + "</span>";
    }
  } finally {
    abortCtl = null;
    $("sendBtn").textContent = "发送";
    delete $("sendBtn").dataset.mode;
    box.scrollTop = box.scrollHeight;
  }
}
function autosize() {
  const t = $("chatInput");
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 130) + "px";
}

/* ================= 每日学习 ================= */
function loadDaily() { return read(LS_DAILY, {}); }
function saveDaily(d) {
  const keys = Object.keys(d).sort();
  while (keys.length > DAILY_KEEP_DAYS) delete d[keys.shift()];
  write(LS_DAILY, d);
}

function dailyCourses(dt) {
  return coursesOnDate(dt).filter((c) => !c.audit);
}

async function genDaily(dt, force) {
  const key = fmtISO(dt);
  const store = loadDaily();
  if (store[key] && !force) return store[key];
  if (!ai.apiKey) throw new AIError("还没填 API Key。到「我的 → DeepSeek」里填一个。", "nokey");

  const list = dailyCourses(dt);
  const names = list.map((c) => c.name + "（" + c.teacher + "，" + roomLabel(c) + "）");
  const ctx = "日期：" + key + " " + WD[dt.getDay()] + "，第 " + weekOf(dt) + " 周。" +
    "当天课程：" + (names.length ? names.join("；") : "没有课，请选一门本学期的课程") + "。";

  const caseObj = await askJSON({
    cfg: ai,
    messages: [
      { role: "system", content: "你是一位法学教授，擅长把法条和理论讲成教学案例。只输出 JSON，不要多余文字。" },
      { role: "user", content: ctx + "\n\n请生成一个与当天课程内容相关的教学案例，并作分析。严格输出这个 JSON 结构：" +
        '{"title":"案例标题","course":"对应课程名","facts":"案情事实，200-350字",' +
        '"issues":["争议焦点1","争议焦点2"],"analysis":"案例分析，分点论述，400-600字，涉及法条要写明法律名称和条文序号",' +
        '"takeaway":"一句话结论"}' },
    ],
  });

  const wordObj = await askJSON({
    cfg: ai,
    messages: [
      { role: "system", content: "你是法律英语老师。只输出 JSON，不要多余文字。" },
      { role: "user", content: ctx + "\n\n请给出 5 个常用法律英语词汇，尽量和当天课程相关。严格输出这个 JSON 结构：" +
        '{"words":[{"word":"英文单词或词组","phonetic":"/音标/","pos":"词性","meaning":"中文释义",' +
        '"example":"英文例句","exampleCN":"例句中文翻译","usage":"法律语境下的用法说明，40字以内"}]}' },
    ],
  });

  const entry = {
    date: key, courses: names, at: Date.now(),
    case: caseObj, words: (wordObj.words || []).slice(0, 8),
  };
  store[key] = entry;
  saveDaily(store);
  return entry;
}

function renderDaily() {
  $("barTitle").textContent = "每日学习";
  const dt = parseISO(dailyDate);
  $("barSub").textContent = fmtISO(dt) + " " + WD[dt.getDay()] + " · 第 " + weekOf(dt) + " 周";
  $("dDateLabel").textContent = fmtISO(dt) === fmtISO(new Date()) ? "今天" : fmtMD(dt);

  const box = $("dailyBox");
  const store = loadDaily();
  const entry = store[dailyDate];

  if (!entry) {
    box.innerHTML = '<div class="blk"><h3>还没有今天的内容</h3>' +
      '<div class="note" style="margin-top:8px">' +
      (ai.apiKey ? "点下面的按钮，让 AI 按当天课程生成案例和法律英语词汇（每次生成会消耗一点 API 额度）。"
                 : "需要先在「我的 → DeepSeek」里填一个 API Key。") +
      '</div><div style="margin-top:12px"><button class="chip" id="genNow" type="button">立即生成</button></div></div>';
    const g = $("genNow");
    if (g) g.addEventListener("click", () => doGenerate(false));
    return;
  }

  const c = entry.case || {};
  const issues = Array.isArray(c.issues) ? c.issues : [];
  const words = entry.words || [];
  box.innerHTML =
    '<div class="blk"><h3>今天的课' + (entry.courses.length ? "" : "（无）") + "</h3>" +
    (entry.courses.length
      ? entry.courses.map((n) => '<div class="ev-row"><span class="dot"></span><span>' + esc(n) + "</span></div>").join("")
      : '<div class="note">今天没有本专业课程。</div>') +
    "</div>" +
    '<div class="blk"><h3>今日案例<span class="when">' + esc(c.course || "") + "</span></h3>" +
    "<div class=\"body\"><b>" + esc(c.title || "") + "</b></div>" +
    '<div class="body">' + mdLite(c.facts || "") + "</div>" +
    (issues.length ? '<div class="body"><h4>争议焦点</h4>' +
      issues.map((x, i) => (i + 1) + ". " + esc(x)).join("<br>") + "</div>" : "") +
    '<div class="body"><h4>案例分析</h4>' + mdLite(c.analysis || "") + "</div>" +
    (c.takeaway ? '<div class="body"><h4>一句话结论</h4>' + mdLite(c.takeaway) + "</div>" : "") +
    "</div>" +
    '<div class="blk"><h3>今日法律英语<span class="when">' + words.length + " 个词</span></h3>" +
    words.map((w) =>
      '<div class="word"><div><span class="w">' + esc(w.word) + '</span>' +
      '<span class="ph">' + esc(w.phonetic || "") + "</span>" +
      '<span class="pos">' + esc(w.pos || "") + "</span></div>" +
      '<div class="cn">' + esc(w.meaning || "") + "</div>" +
      (w.example ? '<div class="ex">' + esc(w.example) + "</div>" : "") +
      (w.exampleCN ? '<div class="cn" style="color:var(--muted);font-size:13px">' + esc(w.exampleCN) + "</div>" : "") +
      (w.usage ? '<div class="cn" style="font-size:12.5px;color:var(--muted);margin-top:3px">用法：' + esc(w.usage) + "</div>" : "") +
      "</div>").join("") +
    "</div>" +
    '<p class="note">生成于 ' + new Date(entry.at).toLocaleString("zh-CN") + "</p>";
}

async function doGenerate(force) {
  const box = $("dailyBox");
  const old = box.innerHTML;
  box.innerHTML = '<div class="blk"><h3><span class="spin"></span> 正在生成…</h3>' +
    '<div class="note" style="margin-top:8px">AI 正在根据当天课程写案例和词汇，大概十几秒。</div></div>';
  try {
    await genDaily(parseISO(dailyDate), force);
    renderDaily();
    toast("生成完成", "当天再打开会直接读缓存，不会重复调用 AI。");
  } catch (e) {
    box.innerHTML = old;
    toast("生成失败", e.message || String(e));
  }
}

/* ================= 设置 ================= */
function fillSettings() {
  $("barTitle").textContent = "我的";
  $("barSub").textContent = META.student + " · " + META.studentId;
  $("inpKey").value = ai.apiKey || "";
  $("inpBase").value = ai.baseUrl || DEFAULT_BASE;
  const sel = $("inpModel");
  if (!sel.options.length) {
    MODELS.forEach((m) => {
      const o = document.createElement("option");
      o.value = m.id; o.textContent = m.label;
      sel.appendChild(o);
    });
  }
  sel.value = ai.model;
  $("inpPinOn").checked = pinOn();
  $("pinHint").textContent = pinOn()
    ? "已开启。用 4-6 位数字，只保存在这台手机上；忘掉密码只能清除数据重来。"
    : "当前未开启。开启后每次打开应用都要输密码。";
  $("inpStart").value = cfg.start;
  $("inpLead").value = cfg.lead;
  $("inpAudit").checked = !!cfg.includeAudit;
  $("inpTheme").value = cfg.theme;
  $("about").textContent =
    "我的课表 · 数据来源：" + META.source + "（导出时间 " + META.exportedAt + "）。" +
    "课程数据内嵌在应用里，所有设置和记录只保存在本机浏览器。";
}

/* ================= 启动 ================= */
function boot() {
  applyTheme();
  document.querySelectorAll(".tabbar button").forEach((b) =>
    b.addEventListener("click", () => go(b.dataset.tab)));

  $("prevW").addEventListener("click", () => { selWeek = Math.max(1, selWeek - 1); renderTimetable(); });
  $("nextW").addEventListener("click", () => { selWeek = Math.min(META.termWeeks, selWeek + 1); renderTimetable(); });
  $("thisW").addEventListener("click", () => { selWeek = curWeek(); renderTimetable(); });
  $("wkSel").addEventListener("change", (e) => { selWeek = Number(e.target.value); renderTimetable(); });
  $("vGrid").addEventListener("click", () => setView("grid"));
  $("vDay").addEventListener("click", () => setView("day"));
  $("icsBtn").addEventListener("click", downloadICS);
  $("dClose").addEventListener("click", () => { $("detailMask").hidden = true; });
  $("detailMask").addEventListener("click", (e) => { if (e.target.id === "detailMask") $("detailMask").hidden = true; });

  const sel = $("wkSel");
  for (let w = 1; w <= META.termWeeks; w++) {
    const o = document.createElement("option");
    o.value = w; o.textContent = "第 " + w + " 周";
    sel.appendChild(o);
  }

  // 聊天
  $("chatInput").addEventListener("input", autosize);
  $("chatInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
  $("sendBtn").addEventListener("click", () => {
    if ($("sendBtn").dataset.mode === "stop") { if (abortCtl) abortCtl.abort(); return; }
    sendChat();
  });
  $("sessSel").addEventListener("change", (e) => {
    curSess = sessions.find((s) => s.id === e.target.value) || sessions[0];
    renderChat();
  });
  $("newSession").addEventListener("click", () => { newSession(false); });
  $("delSession").addEventListener("click", () => {
    if (sessions.length <= 1) { toast("至少保留一个对话", ""); return; }
    sessions = sessions.filter((s) => s.id !== currentSession().id);
    write(LS_SESS, sessions);
    curSess = null;
    renderChat();
  });

  // 每日
  $("dPrev").addEventListener("click", () => { dailyDate = fmtISO(addDays(parseISO(dailyDate), -1)); renderDaily(); });
  $("dNext").addEventListener("click", () => { dailyDate = fmtISO(addDays(parseISO(dailyDate), 1)); renderDaily(); });
  $("dToday").addEventListener("click", () => { dailyDate = fmtISO(new Date()); renderDaily(); });
  $("dRegen").addEventListener("click", () => {
    if (!ai.apiKey) { toast("还没填 API Key", "到「我的 → DeepSeek」里填一个。"); go("me"); return; }
    doGenerate(true);
  });

  // 设置
  $("inpKey").addEventListener("change", (e) => { ai.apiKey = e.target.value.trim(); saveAI(); });
  $("togKey").addEventListener("click", () => {
    const i = $("inpKey");
    i.type = i.type === "password" ? "text" : "password";
    $("togKey").textContent = i.type === "password" ? "显示" : "隐藏";
  });
  $("inpModel").addEventListener("change", (e) => { ai.model = e.target.value; saveAI(); });
  $("inpBase").addEventListener("change", (e) => { ai.baseUrl = e.target.value.trim() || DEFAULT_BASE; saveAI(); });
  $("testAI").addEventListener("click", async () => {
    const out = $("testResult");
    if (!ai.apiKey) { out.textContent = "还没填 API Key。"; return; }
    out.innerHTML = '<span class="spin"></span> 正在测试…';
    try {
      const r = await chat({ cfg: ai, messages: [{ role: "user", content: "只回两个字：你好" }] });
      out.textContent = "连接正常，模型回复：" + r.trim().slice(0, 40);
    } catch (e) {
      out.innerHTML = '<span class="err">' + esc(e.message || String(e)) + "</span>";
    }
  });
  $("inpPinOn").addEventListener("change", (e) => {
    if (e.target.checked) { showLock("setup"); }
    else { write(LS_PINON, false); write(LS_PIN, null); fillSettings(); toast("已关闭锁屏密码", ""); }
  });
  $("changePin").addEventListener("click", () => showLock("setup"));
  $("inpStart").addEventListener("change", (e) => { if (e.target.value) { cfg.start = e.target.value; saveCfg(); renderTimetable(); } });
  $("inpLead").addEventListener("change", (e) => {
    cfg.lead = Math.max(0, Math.min(180, Number(e.target.value) || 0));
    saveCfg(); $("inpLead").value = cfg.lead; scheduleReminders();
  });
  $("inpAudit").addEventListener("change", (e) => { cfg.includeAudit = e.target.checked; saveCfg(); scheduleReminders(); });
  $("inpTheme").addEventListener("change", (e) => { cfg.theme = e.target.value; saveCfg(); applyTheme(); });
  $("btnNotify").addEventListener("click", async () => {
    const hint = $("notifyHint");
    if (!("Notification" in window)) { hint.textContent = "这个浏览器不支持网页通知，用页面内横幅提醒。"; return; }
    try {
      const r = await Notification.requestPermission();
      hint.textContent = r === "granted"
        ? "已开启。应用开着时，课前会弹系统通知。"
        : "未获得权限（" + r + "）。页面内横幅提醒仍然有效。";
    } catch (e) { hint.textContent = "当前环境不允许网页通知，用页面内横幅提醒。"; }
  });
  $("clearChat").addEventListener("click", () => {
    if (!confirm("清空全部对话记录？")) return;
    sessions = []; curSess = null; write(LS_SESS, sessions);
    newSession(true); renderChat(); toast("对话已清空", "");
  });
  $("clearDaily").addEventListener("click", () => {
    if (!confirm("清空全部每日学习内容？")) return;
    write(LS_DAILY, {}); renderDaily(); toast("已清空", "");
  });
  $("resetAll").addEventListener("click", () => {
    if (!confirm("恢复全部默认设置？课表数据不受影响，但密码会关闭。")) return;
    cfg = Object.assign({}, DEFAULTS_CFG);
    saveCfg(); write(LS_PINON, false); write(LS_PIN, null);
    applyTheme(); fillSettings(); renderTimetable();
    toast("已恢复默认", "");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") $("detailMask").hidden = true;
  });

  // 后台超过 5 分钟回来要重新解锁
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { lastHidden = Date.now(); return; }
    if (pinOn() && lastHidden && Date.now() - lastHidden > 5 * 60 * 1000) showLock("unlock");
  });

  $("keypad").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) onKey(b.dataset.k);
  });

  const q = new URLSearchParams(location.search).get("tab");
  go(TABS.indexOf(q) >= 0 ? q : "timetable");
  setInterval(() => {
    if (!$("sc-timetable").hidden) { renderToday(); renderGrid(); scheduleReminders(); }
  }, 60000);

  if (pinOn()) showLock("unlock");
}

boot();

if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
})();
