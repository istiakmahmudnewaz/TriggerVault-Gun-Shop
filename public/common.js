/* TriggerVault - shared browser helpers.
   The browser holds NO passwords, NO order data and NO admin rights.
   Everything sensitive lives on the server and is checked there. */

const CATEGORIES = ["Pistol", "Revolver", "Rifle", "Shotgun", "SMG", "Sniper"];
const ORDER_STATUSES = ["Pending", "Approved", "Shipped", "Delivered", "Cancelled"];

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + Number(n).toLocaleString("en-US");

/* ---------- server API ---------- */
let csrfToken = "";

async function api(path, { method = "GET", body } = {}) {
  const opts = { method, credentials: "same-origin", headers: {} };
  if (method !== "GET") {
    opts.headers["Content-Type"] = "application/json";
    opts.headers["X-CSRF-Token"] = csrfToken;
    opts.body = JSON.stringify(body || {});
  }
  let res;
  try { res = await fetch("/api" + path, opts); }
  catch { throw new Error("Cannot reach the server. Is it running?"); }
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) throw new Error((data && data.error) || "Request failed.");
  if (data && typeof data.csrf === "string") csrfToken = data.csrf;
  return data;
}

async function loadSession() {
  const d = await api("/auth/me");
  return d.user;
}

/* ---------- theme (day / night) ---------- */
const Theme = {
  get: () => localStorage.getItem("ih_theme") || "dark",
  set(t) { localStorage.setItem("ih_theme", t); document.documentElement.dataset.theme = t; }
};

function themeToggleInit(btnSel) {
  const btn = document.querySelector(btnSel);
  const paint = () => {
    btn.textContent = Theme.get() === "dark" ? "\u2600" : "\u263E";
    btn.title = Theme.get() === "dark" ? "Switch to Day mode" : "Switch to Night mode";
  };
  paint();
  btn.addEventListener("click", () => { Theme.set(Theme.get() === "dark" ? "light" : "dark"); paint(); });
}

/* ---------- UI bits ---------- */
function starsHTML(r) {
  return `<span class="stars" aria-label="${r} out of 5"><i style="width:${(r / 5) * 100}%"></i></span>`;
}

let _toastTimer;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

// broken image -> neat text placeholder (no inline handlers needed, keeps the strict CSP happy)
document.addEventListener("error", (e) => {
  const t = e.target;
  if (t && t.tagName === "IMG" && !t.dataset.failed) {
    t.dataset.failed = "1";
    const d = document.createElement("div");
    d.className = "img-fallback";
    d.textContent = t.alt || "No image";
    t.replaceWith(d);
  }
}, true);
