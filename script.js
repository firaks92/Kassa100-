const KEY = "chernaya-kassa";
const THEME_KEY = "chernaya-kassa-theme";
const WEEKDAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const WEEKS = ["birinchi", "ikkinchi", "uchinchi", "to'rtinchi"];
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const IN_MONTH = ["yanvarda", "fevralda", "martda", "aprelda", "mayda", "iyunda", "iyulda", "avgustda", "sentabrda", "oktabrda", "noyabrda", "dekabrda"];
let theme = localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";

let state = load();
let formError = "";
let arm = null;

const app = document.getElementById("app");

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "null");
    return validState(data) ? data : null;
  } catch {
    return null;
  }
}

function validState(data) {
  return Boolean(data && data.group && Array.isArray(data.members) && data.members.length && data.meId);
}

function uid() {
  return crypto.randomUUID();
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function ymd(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseMonth(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { y: year, m: month };
}

function addMonths(year, month, add) {
  const index = year * 12 + (month - 1) + add;
  return { y: Math.floor(index / 12), m: (index % 12) + 1 };
}

function todayInTashkent() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** n-chi hafta kuni. Kompyuter vaqt mintaqasisiz, faqat kalendar sanasi. */
function nthWeekday(year, month, weekday, n) {
  const found = [];
  for (let day = 1; day <= 31; day += 1) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() !== month - 1) break;
    if (date.getUTCDay() === weekday) found.push(day);
  }
  const day = found[n - 1] ?? found[found.length - 1];
  return ymd(year, month, day);
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function dateParts(date) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

function formatLong(date) {
  const parts = dateParts(date);
  return `${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}`;
}

function weekdayName(date) {
  return WEEKDAYS[dateParts(date).weekday];
}

function monthTitle(date) {
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

function daysLabel(days) {
  if (days < 0) return "uchrashuv o'tib ketgan";
  if (days === 0) return "bugun";
  if (days === 1) return "ertaga";
  return `${days} kundan keyin`;
}

function nextMonthValue() {
  const today = todayInTashkent();
  const next = addMonths(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1);
  return `${next.y}-${String(next.m).padStart(2, "0")}`;
}

function money(amount) {
  const value = Number.isInteger(amount) ? String(amount) : Number(amount).toFixed(2);
  const currency = state.group.currency || "$";
  return currency.length === 1 ? `${currency}${value}` : `${value} ${currency}`;
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const roll = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [copy[i], copy[roll]] = [copy[roll], copy[i]];
  }
  return copy;
}

function me() {
  return state.members.find((member) => member.id === state.meId) || state.members[0];
}

function isAdmin() {
  return Boolean(me()?.isAdmin);
}

function nameOf(id) {
  return state.members.find((member) => member.id === id)?.name || "ishtirokchi";
}

function log(action, extra = {}) {
  state.activity = state.activity || [];
  state.activity.unshift({ id: uid(), action, actor: me().name, at: new Date().toISOString(), ...extra });
  state.activity = state.activity.slice(0, 80);
}

function describe(item) {
  const who = item.member ? `: ${item.member}` : "";
  const labels = {
    "group.created": "Guruh yaratildi",
    "member.added": `${item.actor} ishtirokchi qo'shdi: ${item.member}`,
    "member.removed": `${item.actor} ishtirokchini o'chirdi: ${item.member}`,
    "draw.confirmed": `${item.actor} qur'ani tasdiqladi`,
    "draw.redrawn": `${item.actor} qur'ani qayta tashladi`,
    "cycle.started": `${item.actor} yangi aylanani eski tartibda boshladi`,
    "contribution.paid": `${item.actor} badalni belgiladi${who}`,
    "contribution.unpaid": `${item.actor} badal belgisini oldi${who}`,
    payout: `${item.actor} pulni oluvchiga berdi: ${item.member}`,
    "meeting.updated": `${item.actor} uchrashuvni o'zgartirdi (${item.date || ""})`,
    "settings.updated": `${item.actor} sozlamalarni yangiladi`,
  };
  return labels[item.action] || item.action;
}

function stamp(iso) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return `${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]}, ${parts.hour}:${parts.minute}`;
}

function applyTheme() {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#12100e" : "#f3eee6");
}

function icon(name) {
  const paths = {
    home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M7 10.5V20h10v-9.5"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3.5V7M16 3.5V7M4 10h16"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>',
    users: '<circle cx="9" cy="9" r="3"/><circle cx="16" cy="10" r="2.3"/><path d="M4.5 19c.6-2.6 2.4-4 4.5-4s3.9 1.4 4.5 4"/><path d="M14 15.2c1.5-.3 3 .4 4 2.2"/>',
    more: '<circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
    sun: '<circle cx="12" cy="12" r="3.4"/><path d="M12 3.2v2.2M12 18.6v2.2M3.2 12h2.2M18.6 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18"/>',
    moon: '<path d="M15.5 3.6A7.6 7.6 0 1 0 20.4 16 6 6 0 0 1 15.5 3.6z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    copy: '<rect x="8" y="8" width="11" height="12" rx="2"/><path d="M6 16V6a2 2 0 0 1 2-2h8"/>',
    bell: '<path d="M6.5 16.5h11l-1.2-2V11a4.3 4.3 0 0 0-8.6 0v3.5z"/><path d="M10 16.5a2 2 0 0 0 4 0"/>',
    history: '<path d="M5 12a7 7 0 1 0 2.1-5"/><path d="M5 4.5V8h3.5"/><path d="M12 8.5V12l2.5 1.5"/>',
    check: '<path d="M5 12.5 9.5 17 19 7"/>',
    trash: '<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/>',
    share: '<circle cx="7" cy="12" r="2.1"/><circle cx="17" cy="7" r="2.1"/><circle cx="17" cy="17" r="2.1"/><path d="m9 11.2 6-3M9 12.8l6 3"/>',
    wallet: '<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="M3.5 10h17"/><circle cx="16" cy="14" r="1" fill="currentColor" stroke="none"/>',
    pin: '<path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z"/><circle cx="12" cy="11" r="2"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 2"/>',
    user: '<circle cx="12" cy="8.5" r="3.1"/><path d="M5.5 19.5c1-3.2 3.2-4.8 6.5-4.8s5.5 1.6 6.5 4.8"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    tea: '<path d="M6 9h10v5a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4z"/><path d="M16 10h2a2.2 2.2 0 1 1 0 4.4H16"/><path d="M8 20.5h8"/>',
  };
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.more}</svg>`;
}

function themeButton() {
  const dark = theme === "dark";
  return `<button class="theme-btn" type="button" data-action="toggle-theme">${icon(dark ? "sun" : "moon")}<span>${dark ? "Yorug'" : "Tun"}</span></button>`;
}

function refreshStatuses() {
  if (!state?.cycle) return;
  const today = todayInTashkent();
  for (const slot of state.cycle.slots) {
    slot.status = slot.paidOutAt ? "done" : slot.meetingDate <= today ? "collecting" : "upcoming";
  }
  if (state.cycle.status === "active" && state.cycle.slots.length && state.cycle.slots.every((slot) => slot.paidOutAt)) {
    state.cycle.status = "done";
  }
}

function persist() {
  refreshStatuses();
  localStorage.setItem(KEY, JSON.stringify(state));
  render();
}

function progress(slot) {
  const required = slot.contributions.filter((row) => state.group.recipientPays || row.memberId !== slot.memberId);
  const paid = required.filter((row) => row.paid).length;
  return { paid, total: required.length, collected: paid * state.group.amount, expected: required.length * state.group.amount };
}

function payoutAmount() {
  const count = state.cycle.slots.length;
  const payers = state.group.recipientPays ? count : Math.max(count - 1, 0);
  return state.group.amount * payers;
}

function makeSlots(order, start, withPayments) {
  const today = todayInTashkent();
  return order.map((memberId, index) => {
    const point = addMonths(start.y, start.m, index);
    const meetingDate = nthWeekday(point.y, point.m, state.group.weekday, state.group.week);
    return {
      id: uid(),
      memberId,
      monthIndex: index,
      monthDate: ymd(point.y, point.m, 1),
      meetingDate,
      meetingTime: "18:00",
      meetingPlace: "",
      status: meetingDate <= today ? "collecting" : "upcoming",
      payoutAmount: null,
      paidOutAt: null,
      contributions: withPayments ? state.members.map((member) => ({ memberId: member.id, paid: false, paidAt: null })) : [],
    };
  });
}

function pill(status) {
  const label = status === "done" ? "Tugagan" : status === "collecting" ? "Yig'ilmoqda" : "Oldinda";
  const kind = status === "done" ? "done" : status === "collecting" ? "collecting" : "upcoming";
  return `<span class="pill pill-${kind}">${label}</span>`;
}

function route() {
  const hash = location.hash.replace(/^#/, "") || "/home";
  const match = /^\/([^/]+)(?:\/([^/]+))?/.exec(hash);
  return { screen: match?.[1] || "home", id: match?.[2] || "" };
}

function heroArt() {
  return `<img class="hero-art" src="choyxona-plov.jpg?v=4" alt="Yosh yigitlar choyxonada palov yeyapti">`;
}

function mark() {
  return `<div class="mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="10" fill="none" stroke="#c6a15b" stroke-width="2.4"/><circle cx="14" cy="14" r="5.5" fill="#f4efe6"/></svg></div>`;
}

function errorBox() {
  return formError ? `<p class="note note-bad">${esc(formError)}</p>` : "";
}

function landing() {
  return `<main class="wrap hero">
    <div>
      <div class="top-tools">${mark()}${themeButton()}</div>
      <p class="kicker">Naqd pul, banksiz</p>
      <h1>Choyxona 100$</h1>
      ${heroArt()}
      <p class="muted">Har oy hamma bir xil summa topshiradi. Bittasi qozonni oladi. Navbat qur'a bilan aniqlanadi. PIN yo'q: hammasi shu brauzerda saqlanadi.</p>
      <form id="create-form" class="stack" style="margin-top:1.4rem">
        ${errorBox()}
        <label class="label"><span class="lab">${icon("tea")} Nomi</span><input class="field" name="groupName" required placeholder="Do'stlar" autocomplete="organization"></label>
        <div class="pair">
          <label class="label"><span class="lab">${icon("wallet")} Badal</span><input class="field" name="amount" inputmode="decimal" value="100" required></label>
          <label class="label">Valyuta<input class="field" name="currency" value="$" required></label>
        </div>
        <label class="label"><span class="lab">${icon("user")} Ismingiz</span><input class="field" name="person" required autocomplete="name"></label>
        <button class="btn" type="submit">${icon("plus")}<span>Guruh yaratish</span></button>
      </form>
    </div>
    <details>
      <summary>${icon("share")} Boshqa telefondan ochish</summary>
      <form id="import-form" class="stack" style="margin-top:0.8rem">
        <textarea class="field" name="dump" placeholder="Saqlangan matnni joylang"></textarea>
        <button class="btn btn-ghost" type="submit">${icon("check")}<span>Ochish</span></button>
      </form>
    </details>
  </main>`;
}

function shell(content, screen) {
  const tabs = [
    ["home", "Bosh", "home"],
    ["schedule", "Jadval", "calendar"],
    ...(isAdmin() ? [["draw", "Qur'a", "dice"], ["members", "Odamlar", "users"]] : []),
    ["settings", "Yana", "more"],
  ];
  const nav = tabs.map(([id, label, glyph]) => {
    const active = id === "schedule" ? screen === "schedule" || screen === "month" : id === "settings" ? screen === "settings" || screen === "history" : screen === id;
    return `<a class="${active ? "active" : ""}" href="#/${id}">${icon(glyph)}<span>${label}</span></a>`;
  }).join("");
  return `<div class="wrap">
    <header class="top">
      <div class="top-tools"><p class="kicker">Choyxona 100$</p>${themeButton()}</div>
      <div class="top-row"><h2>${esc(state.group.name)}</h2><span class="muted">${esc(me().name)}</span></div>
    </header>
    <main class="screen stack">${content}</main>
    <nav class="nav"><div class="nav-inner">${nav}</div></nav>
  </div>`;
}

function screenHome() {
  const today = todayInTashkent();
  const slots = state.cycle?.slots || [];
  const next = slots.find((slot) => slot.status !== "done");
  const mine = slots.find((slot) => slot.memberId === state.meId);
  const parts = [heroArt(), `<p class="muted small">Pulni uchrashuvda naqd beramiz. Ilova faqat kim topshirganini belgilaydi.</p>`];
  if (!state.cycle) parts.push(`<section class="card">Qur'a hali tashlanmagan.</section>`);
  if (state.cycle?.status === "draft") parts.push(`<section class="card">Qur'a tashlandi, lekin hali tasdiqlanmagan.</section>`);
  if (state.cycle?.status === "done") parts.push(`<section class="card">Bu aylana tugadi. Keyingisini boshlash mumkin.</section>`);
  if (next) {
    const days = daysBetween(today, next.meetingDate);
    const info = progress(next);
    const bar = info.total ? `<div class="bar"><span style="width:${(info.paid / info.total) * 100}%"></span></div><p class="small muted">${info.paid}/${info.total} · ${money(info.collected)} yig'ildi, jami ${money(info.expected)}</p>` : "";
    const reminder = days === 7 || days === 1 || days === 0 ? `<p class="note note-ok">${esc(reminderText(next, days))}</p>` : "";
    parts.push(`<section class="card stack">
      <div class="top-row">${pill(next.status)}<span class="muted small">${esc(weekdayName(next.meetingDate))}</span></div>
      <h1>${esc(daysLabel(days))}</h1>
      <p>${esc(formatLong(next.meetingDate))}${next.meetingTime ? ` · ${esc(next.meetingTime)}` : ""}</p>
      <p>Oladi: <strong>${esc(nameOf(next.memberId))}</strong></p>
      ${next.meetingPlace ? `<p class="muted">${esc(next.meetingPlace)}</p>` : ""}
      ${reminder}
      ${bar}
      <a class="btn" href="#/month/${next.id}">${icon("calendar")}<span>Oyni ochish</span></a>
    </section>`);
    maybeNotify(next, days);
  }
  const mineText = mine ? `Sen ${IN_MONTH[Number(mine.monthDate.slice(5, 7)) - 1]} olasan.` : "Bu aylanada senga oy tushmagan.";
  let payText = "";
  if (next) {
    const row = next.contributions.find((item) => item.memberId === state.meId);
    if (next.memberId === state.meId && !state.group.recipientPays) payText = "<p>Bu oy sen oluvchisan va badal topshirmaysan.</p>";
    else if (!row) payText = "<p class='muted'>Belgilar qur'a tasdiqlangach chiqadi.</p>";
    else payText = `<p><strong>${row.paid ? "Badal topshirildi" : "Badal topshirilmagan"}</strong></p>`;
  }
  parts.push(`<section class="card stack"><h3>${icon("user")} Mening holatim</h3><p>${mineText}</p>${payText}<p class="small muted lab">${icon("wallet")} Har bir kishidan badal ${money(state.group.amount)}.</p></section>`);
  return parts.join("");
}

function reminderText(slot, days) {
  const when = days === 7 ? "Bir haftadan keyin" : days === 1 ? "Ertaga" : "Bugun";
  const place = slot.meetingPlace ? ` Joy: ${slot.meetingPlace}.` : "";
  return `${when} Choyxona 100$, ${weekdayName(slot.meetingDate)}, ${formatLong(slot.meetingDate)}. Oladi: ${nameOf(slot.memberId)}. Badal: ${money(state.group.amount)}.${place}`;
}

function maybeNotify(slot, days) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || (days !== 7 && days !== 1 && days !== 0)) return;
  const type = days === 7 ? "week" : days === 1 ? "day" : "today";
  const markKey = `${slot.id}:${type}:${todayInTashkent()}`;
  const sent = JSON.parse(localStorage.getItem(`${KEY}-notes`) || "[]");
  if (sent.includes(markKey)) return;
  sent.push(markKey);
  localStorage.setItem(`${KEY}-notes`, JSON.stringify(sent.slice(-40)));
  new Notification("Choyxona 100$", { body: reminderText(slot, days) });
}

function screenSchedule() {
  const slots = state.cycle?.slots || [];
  if (!slots.length) return `<section class="card">Jadval qur'adan keyin chiqadi.</section>`;
  const items = slots.map((slot) => `<a class="card card-link" href="#/month/${slot.id}"><span>${icon("calendar")}</span><span class="grow"><span class="muted small">${esc(monthTitle(slot.monthDate))}</span><br><strong>${esc(nameOf(slot.memberId))}</strong><br><span class="muted small">${esc(formatLong(slot.meetingDate))}</span></span>${pill(slot.status)}${icon("chevron")}</a>`).join("");
  return `<div class="top-row"><h3>${icon("calendar")} ${slots.length} oy</h3><button class="btn btn-ghost slim" type="button" data-action="ics">${icon("share")}<span>Taqvimga</span></button></div>${items}`;
}

function screenMonth(id) {
  const slot = state.cycle?.slots.find((item) => item.id === id);
  if (!slot) return `<section class="card">Oy topilmadi.</section>`;
  const info = progress(slot);
  const rows = [...slot.contributions].sort((a, b) => nameOf(a.memberId).localeCompare(nameOf(b.memberId), "uz"));
  const list = rows.map((row) => {
    if (!state.group.recipientPays && row.memberId === slot.memberId) {
      return `<p class="pay static">${esc(nameOf(row.memberId))} — oluvchi, badal topshirmaydi</p>`;
    }
    if (!isAdmin()) return `<p class="pay static"><span class="dot ${row.paid ? "on" : ""}"></span>${esc(nameOf(row.memberId))}</p>`;
    return `<button class="pay" type="button" data-action="toggle-paid" data-slot="${slot.id}" data-member="${row.memberId}"><span class="dot ${row.paid ? "on" : ""}"></span>${esc(nameOf(row.memberId))}</button>`;
  }).join("");
  const edit = isAdmin() && slot.status !== "done" ? `<form id="meeting-form" class="stack">
    <input type="hidden" name="slotId" value="${slot.id}">
    ${errorBox()}
    <label class="label">Sana<input class="field" type="date" name="date" value="${esc(slot.meetingDate)}" required></label>
    <label class="label">Vaqt<input class="field" type="time" name="time" value="${esc(slot.meetingTime || "18:00")}" required></label>
    <label class="label">Joy<input class="field" name="place" value="${esc(slot.meetingPlace)}" placeholder="Kafe, uy, ofis"></label>
    <button class="btn btn-ghost" type="submit">${icon("check")}<span>Uchrashuvni saqlash</span></button>
  </form>` : "";
  const payout = isAdmin() && slot.status !== "done" && state.cycle.status === "active"
    ? (arm === `payout:${slot.id}`
      ? `<p class="muted small">Berilganini tasdiqlang. Yozuvni bekor qilib bo'lmaydi.</p><button class="btn" type="button" data-action="do-payout" data-slot="${slot.id}">${icon("check")}<span>Ha, pul berildi</span></button><button class="btn btn-ghost" type="button" data-action="cancel-arm">Bekor</button>`
      : `<button class="btn" type="button" data-action="arm-payout" data-slot="${slot.id}">${icon("wallet")}<span>Oluvchiga berildi · ${money(payoutAmount())}</span></button>`)
    : "";
  const bar = info.total ? `<div class="bar"><span style="width:${(info.paid / info.total) * 100}%"></span></div><p class="small muted">${info.paid}/${info.total} · ${money(info.collected)} yig'ildi, jami ${money(info.expected)}</p>` : `<p class="small muted">Badallar ro'yxati qur'a tasdiqlangach chiqadi.</p>`;
  return `<section class="card stack">
      <div class="top-row"><span class="muted small">${esc(monthTitle(slot.monthDate))}</span>${pill(slot.status)}</div>
      <h2>Oladi: ${esc(nameOf(slot.memberId))}</h2>
      <p>${esc(weekdayName(slot.meetingDate))}, ${esc(formatLong(slot.meetingDate))}${slot.meetingTime ? ` · ${esc(slot.meetingTime)}` : ""}</p>
      ${slot.meetingPlace ? `<p class="muted">${esc(slot.meetingPlace)}</p>` : ""}
      ${slot.paidOutAt ? `<p style="color:var(--ok);font-weight:750">Berildi ${money(slot.payoutAmount)}</p>` : ""}
      <button class="btn btn-ghost" type="button" data-action="ics-slot" data-slot="${slot.id}">${icon("calendar")}<span>Telefon taqvimiga qo'shish</span></button>
    </section>
    ${edit}
    <section class="card stack"><h3>${icon("check")} Kim naqd topshirdi</h3>${bar}${list}</section>
    ${payout}
    <a class="btn btn-ghost" href="#/history">${icon("history")}<span>Amallar tarixi</span></a>`;
}

function screenDraw() {
  const cycle = state.cycle;
  const status = cycle?.status || "none";
  const month = cycle ? cycle.startMonth.slice(0, 7) : nextMonthValue();
  const cards = (cycle?.slots || []).map((slot, index) => `<li class="card card-in" style="animation-delay:${index * 70}ms"><div class="top-row"><span><span class="muted small">${esc(monthTitle(slot.monthDate))}</span><br><strong>${esc(nameOf(slot.memberId))}</strong></span><span class="muted small">${index + 1}<br>${esc(formatLong(slot.meetingDate))}</span></div></li>`).join("");
  const doneBlock = status === "done" ? `<section class="card stack">
    <h2>Aylana tugadi</h2>
    <p class="small muted">O'sha tartibni takrorlash yoki qur'ani qayta tashlash mumkin. Yangi odamlar navbat oxiriga turadi.</p>
    <form id="same-form" class="stack">
      <label class="label">Boshlang'ich oy<input class="field" type="month" name="month" value="${month}" required></label>
      <button class="btn" type="submit">${icon("history")}<span>O'sha tartib</span></button>
    </form>
  </section>` : "";
  const redraw = status === "active"
    ? (arm === "redraw"
      ? `<p class="small muted">Bu aylanadagi badal belgilari o'chadi. Pul berilgan oylarni qayta tashlab bo'lmaydi.</p><button class="btn btn-danger" type="button" data-action="do-redraw">${icon("dice")}<span>Ha, qayta tashlash</span></button><button class="btn btn-ghost" type="button" data-action="cancel-arm">Bekor</button>`
      : `<button class="btn btn-danger" type="button" data-action="arm-redraw">${icon("dice")}<span>Qayta tashlash</span></button>`)
    : `<button class="btn btn-gold" type="button" data-action="do-draw" ${state.members.length < 2 ? "disabled" : ""}>${icon("dice")}<span>Qur'a tashlash</span></button>`;
  return `<p class="small muted">${state.members.length} ishtirokchi. Odamlar o'n ikkidan ko'p bo'lsa, oylar keyingi yilga o'tadi. Uchrashuv — oyning ${WEEKS[state.group.week - 1]} ${WEEKDAYS[state.group.weekday]}si.</p>
    ${state.members.length < 2 ? `<section class="card">Yana kamida bitta odam qo'shing.</section>` : ""}
    ${doneBlock}
    <section class="card stack" id="draw-stage">
      ${errorBox()}
      <label class="label">Boshlang'ich oy<input class="field" id="draw-month" type="month" value="${month}"></label>
      ${redraw}
    </section>
    ${cards ? `<ol class="stack" style="list-style:none;padding:0;margin:0">${cards}</ol>` : ""}
    ${status === "draft" ? `<button class="btn" type="button" data-action="confirm-draw">${icon("check")}<span>Tartibni tasdiqlash</span></button>` : ""}`;
}

function screenMembers() {
  const locked = state.cycle?.status === "active";
  const people = state.members.map((member) => `<article class="card stack">
    <div class="person"><span class="avatar">${esc((member.name || "?").trim().charAt(0))}</span><span><strong>${esc(member.name)}</strong>${member.isAdmin ? " · admin" : ""}</span></div>
    ${!member.isAdmin && !locked ? (arm === `remove:${member.id}`
      ? `<p class="small muted">${esc(member.name)}ni o'chirasizmi?</p><button class="btn btn-danger" type="button" data-action="do-remove" data-id="${member.id}">${icon("trash")}<span>Ha, o'chirish</span></button><button class="btn btn-ghost" type="button" data-action="cancel-arm">Bekor</button>`
      : `<button class="btn btn-danger" type="button" data-action="arm-remove" data-id="${member.id}">${icon("trash")}<span>O'chirish</span></button>`) : ""}
  </article>`).join("");
  const add = locked
    ? `<p class="small muted">Aylana ketayotganda tarkib o'zgarmaydi.</p>`
    : `<form id="add-form" class="stack">${errorBox()}<label class="label"><span class="lab">${icon("user")} Ism</span><input class="field" name="name" required placeholder="Yangi ishtirokchi" autocomplete="name"></label><button class="btn" type="submit">${icon("plus")}<span>Ishtirokchi qo'shish</span></button></form>`;
  return `<section class="card stack">
      <h3>Shu telefon</h3>
      <p class="small muted">Havola va PIN yo'q. Kassani boshqa telefonda ochish uchun saqlashni «Yana» bo'limidan nusxalang.</p>
    </section>${people}${add}`;
}

function screenSettings() {
  const options = state.members.map((member) => `<option value="${member.id}" ${member.id === state.meId ? "selected" : ""}>${esc(member.name)}</option>`).join("");
  const days = WEEKDAYS.map((label, index) => `<option value="${index}" ${index === state.group.weekday ? "selected" : ""}>${label}</option>`).join("");
  const weeks = WEEKS.map((label, index) => `<option value="${index + 1}" ${index + 1 === state.group.week ? "selected" : ""}>${label}</option>`).join("");
  const adminForm = isAdmin() ? `<form id="settings-form" class="stack">
    <div class="pair">
      <label class="label">Badal<input class="field" name="amount" value="${esc(state.group.amount)}" inputmode="decimal" required></label>
      <label class="label">Valyuta<input class="field" name="currency" value="${esc(state.group.currency)}" required></label>
    </div>
    <label class="label">Uchrashuv kuni<select class="field" name="weekday">${days}</select></label>
    <label class="label">Nechanchi<select class="field" name="week">${weeks}</select></label>
    <label class="checkline"><input type="checkbox" name="recipientPays" ${state.group.recipientPays ? "checked" : ""}>Oluvchi ham badal topshiradi</label>
    <p class="small muted">Yangi hafta kuni keyingi qur'aga ta'sir qiladi. Tayyor sanani oy kartasida o'zgartiring.</p>
    <button class="btn" type="submit">${icon("check")}<span>Saqlash</span></button>
  </form>` : "";
  return `${errorBox()}${adminForm}
    <section class="card stack">
      <h3>Hozir telefonda kim</h3>
      <label class="label">Ism<select class="field" id="who">${options}</select></label>
      <p class="small muted">PIN siz almashadi. Admin — guruhni yaratgan odam.</p>
    </section>
    <button class="btn btn-ghost" type="button" data-action="enable-notes">${icon("bell")}<span>Brauzer eslatmalari</span></button>
    <button class="btn btn-ghost" type="button" data-action="ics">${icon("calendar")}<span>Uchrashuvlarni taqvimga qo'shish</span></button>
    <a class="btn btn-ghost" href="#/history">${icon("history")}<span>Tarix</span></a>
    <section class="card stack">
      <h3>Boshqa telefon</h3>
      <textarea class="field" id="export-dump" readonly>${esc(JSON.stringify(state))}</textarea>
      <div class="pair">
        <button class="btn btn-ghost" type="button" data-action="export-copy">${icon("copy")}<span>Nusxa</span></button>
        <button class="btn btn-ghost" type="button" data-action="export-share">${icon("share")}<span>Ulashish</span></button>
      </div>
      <form id="import-form" class="stack">
        <textarea class="field" name="dump" placeholder="Saqlashni joylang"></textarea>
        <button class="btn btn-ghost" type="submit">${icon("share")}<span>Shu telefondagi ma'lumotni almashtirish</span></button>
      </form>
    </section>
    ${arm === "reset" ? `<p class="small muted">Guruhni shu telefondan o'chirasizmi?</p><button class="btn btn-danger" type="button" data-action="do-reset">${icon("trash")}<span>Ha, o'chirish</span></button><button class="btn btn-ghost" type="button" data-action="cancel-arm">Bekor</button>` : `<button class="btn btn-danger" type="button" data-action="arm-reset">${icon("trash")}<span>Guruhni telefondan o'chirish</span></button>`}`;
}

function screenHistory() {
  const rows = state.activity || [];
  if (!rows.length) return `<section class="card">Hali jim.</section>`;
  return rows.map((item) => `<article class="card history-item"><p>${esc(describe(item))}</p><p class="small muted">${esc(stamp(item.at))}</p></article>`).join("");
}

function render() {
  if (!state) {
    app.innerHTML = landing();
    return;
  }
  refreshStatuses();
  const { screen, id } = route();
  const page = screen === "schedule" ? screenSchedule()
    : screen === "month" ? screenMonth(id)
    : screen === "draw" && isAdmin() ? screenDraw()
    : screen === "members" && isAdmin() ? screenMembers()
    : screen === "settings" ? screenSettings()
    : screen === "history" ? screenHistory()
    : screenHome();
  const shown = screen === "draw" && !isAdmin() ? "home" : screen === "members" && !isAdmin() ? "home" : screen;
  app.innerHTML = shell(page, shown === "draw" && !isAdmin() ? "home" : shown);
}

function readAmount(value) {
  const amount = Number(String(value).replace(",", "."));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function applyImport(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    formError = "Bu qora kassa saqlashi emas.";
    return false;
  }
  if (!validState(data)) {
    formError = "Saqlashda guruh yo'q.";
    return false;
  }
  state = data;
  formError = "";
  location.hash = "/home";
  persist();
  return true;
}

function buildIcs(slots) {
  const stampNow = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const events = slots.map((slot) => {
    const time = slot.meetingTime || "18:00";
    const [hour, minute] = time.split(":");
    const start = `${slot.meetingDate.replace(/-/g, "")}T${hour}${minute}00`;
    const endHour = Math.min(Number(hour) + 2, 23);
    const end = `${slot.meetingDate.replace(/-/g, "")}T${String(endHour).padStart(2, "0")}${Number(hour) >= 22 ? "59" : minute}00`;
    const summary = `Choyxona 100$ — oladi ${nameOf(slot.memberId)}`.replace(/[,;\\]/g, " ");
    return `BEGIN:VEVENT\r\nUID:${slot.id}@chernaya-kassa\r\nDTSTAMP:${stampNow}\r\nDTSTART;TZID=Asia/Tashkent:${start}\r\nDTEND;TZID=Asia/Tashkent:${end}\r\nSUMMARY:${summary}\r\nDESCRIPTION:Badal ${money(state.group.amount)}. Pul naqd.\r\nEND:VEVENT`;
  });
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Choyxona 100$//UZ\r\nBEGIN:VTIMEZONE\r\nTZID:Asia/Tashkent\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0500\r\nTZOFFSETTO:+0500\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n${events.join("\r\n")}\r\nEND:VCALENDAR\r\n`;
}

function downloadIcs(slots) {
  if (!slots.length) {
    formError = "Taqvim uchun uchrashuv yo'q.";
    render();
    return;
  }
  const blob = new Blob([buildIcs(slots)], { type: "text/calendar" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "choyxona-100.ics";
  link.click();
  URL.revokeObjectURL(link.href);
}

async function throwLots(force) {
  formError = "";
  if (!isAdmin()) return;
  if (state.members.length < 2) {
    formError = "Kamida ikki ishtirokchi kerak";
    render();
    return;
  }
  const start = parseMonth(document.getElementById("draw-month")?.value || nextMonthValue());
  if (!start) {
    formError = "Boshlang'ich oyni tanlang";
    render();
    return;
  }
  if (state.cycle?.status === "active" && !force) {
    formError = "Aylana tasdiqlangan. Qayta boshlash uchun qayta tashlashni tasdiqlang.";
    render();
    return;
  }
  if (state.cycle?.status === "active" && state.cycle.slots.some((slot) => slot.paidOutAt)) {
    formError = "Qayta tashlab bo'lmaydi: ba'zi oylarning puli berilgan.";
    render();
    return;
  }
  const stage = document.getElementById("draw-stage");
  if (stage) stage.insertAdjacentHTML("afterbegin", `<div class="shuffle" id="shuffle-name">${esc(state.members[0].name)}</div>`);
  const names = state.members.map((member) => member.name);
  const timer = setInterval(() => {
    const el = document.getElementById("shuffle-name");
    if (el) el.textContent = names[Math.floor(Math.random() * names.length)];
  }, 90);
  await new Promise((resolve) => setTimeout(resolve, 900));
  clearInterval(timer);
  const order = shuffle(state.members.map((member) => member.id));
  state.cycle = {
    id: uid(),
    startMonth: ymd(start.y, start.m, 1),
    status: "draft",
    drawnAt: null,
    slots: makeSlots(order, start, false),
  };
  if (force) log("draw.redrawn");
  arm = null;
  persist();
}

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  formError = "";
  if (form.id === "create-form") {
    const groupName = form.groupName.value.trim();
    const person = form.person.value.trim();
    const amount = readAmount(form.amount.value);
    const currency = form.currency.value.trim() || "$";
    if (!groupName || !person || !amount) {
      formError = "Nom, ism va summani kiriting.";
      render();
      return;
    }
    const id = uid();
    state = {
      group: { name: groupName, amount, currency, weekday: 6, week: 1, recipientPays: true },
      members: [{ id, name: person, isAdmin: true }],
      meId: id,
      cycle: null,
      activity: [],
    };
    log("group.created");
    location.hash = "/home";
    persist();
    return;
  }
  if (form.id === "import-form") {
    applyImport(form.dump.value.trim());
    return;
  }
  if (form.id === "add-form") {
    const name = form.name.value.trim();
    if (!name) return;
    if (state.cycle?.status === "active") {
      formError = "Aylana ketayapti. Yangi odamlarni keyingisiga qo'shamiz.";
      render();
      return;
    }
    if (state.cycle?.status === "draft") state.cycle = null;
    state.members.push({ id: uid(), name, isAdmin: false });
    log("member.added", { member: name });
    persist();
    return;
  }
  if (form.id === "settings-form") {
    const amount = readAmount(form.amount.value);
    if (!amount) {
      formError = "Badal summasini kiriting";
      render();
      return;
    }
    state.group.amount = amount;
    state.group.currency = form.currency.value.trim() || "$";
    state.group.weekday = Number(form.weekday.value);
    state.group.week = Number(form.week.value);
    state.group.recipientPays = form.recipientPays.checked;
    log("settings.updated");
    formError = "";
    persist();
    return;
  }
  if (form.id === "meeting-form") {
    const slot = state.cycle?.slots.find((item) => item.id === form.slotId.value);
    if (!slot) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date.value) || !/^\d{2}:\d{2}$/.test(form.time.value)) {
      formError = "Sana va vaqtni kiriting";
      render();
      return;
    }
    slot.meetingDate = form.date.value;
    slot.meetingTime = form.time.value;
    slot.meetingPlace = form.place.value.trim();
    log("meeting.updated", { date: formatLong(slot.meetingDate) });
    persist();
    return;
  }
  if (form.id === "same-form") {
    const start = parseMonth(form.month.value);
    if (!start || state.cycle?.status !== "done") {
      formError = "Avval joriy aylanani tugating";
      render();
      return;
    }
    const alive = new Set(state.members.map((member) => member.id));
    const previous = state.cycle.slots.map((slot) => slot.memberId).filter((id) => alive.has(id));
    const extra = shuffle(state.members.map((member) => member.id).filter((id) => !previous.includes(id)));
    state.cycle = {
      id: uid(),
      startMonth: ymd(start.y, start.m, 1),
      status: "active",
      drawnAt: new Date().toISOString(),
      slots: makeSlots([...previous, ...extra], start, true),
    };
    log("cycle.started");
    location.hash = "/schedule";
    persist();
  }
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "toggle-theme") {
    theme = theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, theme);
    applyTheme();
    render();
    return;
  }
  if (action === "cancel-arm") {
    arm = null;
    render();
    return;
  }
  if (action === "do-draw") {
    throwLots(false);
    return;
  }
  if (action === "arm-redraw") {
    arm = "redraw";
    render();
    return;
  }
  if (action === "do-redraw") {
    throwLots(true);
    return;
  }
  if (action === "confirm-draw") {
    if (state.cycle?.status !== "draft") return;
    state.cycle.status = "active";
    state.cycle.drawnAt = new Date().toISOString();
    for (const slot of state.cycle.slots) {
      slot.contributions = state.members.map((member) => ({ memberId: member.id, paid: false, paidAt: null }));
    }
    log("draw.confirmed");
    persist();
    return;
  }
  if (action === "toggle-paid") {
    if (!isAdmin()) return;
    const slot = state.cycle?.slots.find((item) => item.id === button.dataset.slot);
    const row = slot?.contributions.find((item) => item.memberId === button.dataset.member);
    if (!row) return;
    row.paid = !row.paid;
    row.paidAt = row.paid ? new Date().toISOString() : null;
    log(row.paid ? "contribution.paid" : "contribution.unpaid", { member: nameOf(row.memberId) });
    persist();
    return;
  }
  if (action === "arm-payout") {
    arm = `payout:${button.dataset.slot}`;
    render();
    return;
  }
  if (action === "do-payout") {
    const slot = state.cycle?.slots.find((item) => item.id === button.dataset.slot);
    if (!slot || slot.paidOutAt) return;
    slot.payoutAmount = payoutAmount();
    slot.paidOutAt = new Date().toISOString();
    slot.status = "done";
    log("payout", { member: nameOf(slot.memberId) });
    arm = null;
    persist();
    return;
  }
  if (action === "arm-remove") {
    arm = `remove:${button.dataset.id}`;
    render();
    return;
  }
  if (action === "do-remove") {
    const person = state.members.find((member) => member.id === button.dataset.id);
    if (!person || person.isAdmin || state.cycle?.status === "active") return;
    if (state.cycle?.status === "draft") state.cycle = null;
    state.members = state.members.filter((member) => member.id !== person.id);
    log("member.removed", { member: person.name });
    arm = null;
    persist();
    return;
  }
  if (action === "arm-reset") {
    arm = "reset";
    render();
    return;
  }
  if (action === "do-reset") {
    localStorage.removeItem(KEY);
    state = null;
    arm = null;
    location.hash = "";
    render();
    return;
  }
  if (action === "export-share") {
    const text = JSON.stringify(state);
    if (navigator.share) {
      navigator.share({ title: "Choyxona 100$", text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => {
        button.innerHTML = `${icon("check")}<span>Nusxalandi</span>`;
      }).catch(() => {
        formError = "Nusxalab bo'lmadi. Matnni qo'lda belgilang.";
        render();
      });
    }
    return;
  }
  if (action === "export-copy") {
    navigator.clipboard.writeText(JSON.stringify(state)).then(() => {
      formError = "";
      button.innerHTML = `${icon("check")}<span>Nusxalandi</span>`;
    }).catch(() => {
      formError = "Nusxalab bo'lmadi. Matnni qo'lda belgilang.";
      render();
    });
    return;
  }
  if (action === "ics") downloadIcs(state.cycle?.slots || []);
  if (action === "ics-slot") downloadIcs((state.cycle?.slots || []).filter((slot) => slot.id === button.dataset.slot));
  if (action === "enable-notes") {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission();
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id !== "who" || !state) return;
  if (!state.members.some((member) => member.id === event.target.value)) return;
  state.meId = event.target.value;
  arm = null;
  persist();
});

window.addEventListener("hashchange", render);
applyTheme();
render();
