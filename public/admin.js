/* TriggerVault - admin panel (every action is verified again on the server) */
const $ = (s) => document.querySelector(s);

let admin = null;
let view = "dashboard";
let editingId = null;
let pendingImage = ""; // data URL from an uploaded file (sent to the server, which validates it)
let data = { products: [], orders: [], users: [] };
let pFilter = { q: "", cat: "All" };

const TITLES = { dashboard: "Dashboard", products: "Products", orders: "Orders", users: "Users" };

/* ---------- Boot / auth gate ---------- */
async function boot() {
  themeToggleInit("#themeBtn");
  let u = null;
  try { u = await loadSession(); } catch (err) { showGate(err.message); return; }
  if (u && u.role === "admin") return enterApp(u);
  showGate(u ? `You are logged in as ${u.name}, who is not an admin. Login with an admin account.` : "");
}

function showGate(msg) {
  $("#gate").hidden = false;
  $("#app").hidden = true;
  if (msg) $("#gateMsg").textContent = msg;
}

async function enterApp(u) {
  admin = u;
  $("#gate").hidden = true;
  $("#app").hidden = false;
  $("#whoami").textContent = u.email;
  $("#productForm [name=cat]").innerHTML = CATEGORIES.map((c) => `<option>${c}</option>`).join("");
  const h = location.hash.replace("#", "");
  go(h in TITLES ? h : "dashboard");
}

$("#adminLoginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const d = await api("/auth/login", { method: "POST", body: { email: f.get("email"), password: f.get("password") } });
    if (d.user.role !== "admin") {
      await api("/auth/logout", { method: "POST" });
      throw new Error("This account is not an admin.");
    }
    e.target.reset();
    $("#gateError").textContent = "";
    enterApp(d.user);
  } catch (err) { $("#gateError").textContent = err.message; }
});

$("#logoutBtn").addEventListener("click", async () => {
  try { await api("/auth/logout", { method: "POST" }); } catch { /* ignore */ }
  location.href = "index.html";
});

/* ---------- Navigation + data ---------- */
function go(v) {
  view = v;
  location.hash = v;
  document.querySelectorAll("#sideNav button").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  $("#viewTitle").textContent = TITLES[v];
  $("#sidebar").classList.remove("open");
  render();
}

async function load(needs) {
  const jobs = [];
  if (needs.includes("products")) jobs.push(api("/products").then((r) => (data.products = r.products)));
  if (needs.includes("orders")) jobs.push(api("/admin/orders").then((r) => (data.orders = r.orders)));
  if (needs.includes("users")) jobs.push(api("/admin/users").then((r) => (data.users = r.users)));
  await Promise.all(jobs);
}

async function render() {
  const needs = {
    dashboard: ["products", "orders", "users"], products: ["products", "orders"], orders: ["orders"], users: ["users", "orders"]
  }[view];
  try {
    await load(needs);
  } catch (err) {
    if (/login|Admin access/i.test(err.message)) return showGate("Your session ended. Please login again.");
    $("#content").innerHTML = `<p class="muted">${esc(err.message)}</p>`;
    return;
  }
  ({ dashboard: renderDashboard, products: renderProducts, orders: renderOrders, users: renderUsers })[view]();
  const pending = data.orders.filter((o) => o.status === "Pending").length;
  $("#pendingPill").hidden = !pending;
  $("#pendingPill").textContent = pending;
}

$("#sideNav").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) go(b.dataset.view); });
$("#sideToggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

async function act(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); await render(); }
  catch (err) { toast(err.message); }
}

/* ---------- Dashboard ---------- */
function renderDashboard() {
  const { products, orders, users } = data;
  const revenue = orders.filter((o) => o.status !== "Cancelled").reduce((s, o) => s + o.total, 0);
  const avg = products.length ? (products.reduce((s, p) => s + p.rating, 0) / products.length).toFixed(1) : "0";
  const top = [...products].sort((a, b) => b.rating - a.rating).slice(0, 5);
  const low = products.filter((p) => p.stock <= 3).sort((a, b) => a.stock - b.stock).slice(0, 5);
  const recent = orders.slice(0, 5);

  $("#content").innerHTML = `
    <div class="stat-grid">
      <div class="stat"><span>Guns</span><strong>${products.length}</strong></div>
      <div class="stat"><span>Orders</span><strong>${orders.length}</strong></div>
      <div class="stat"><span>Revenue</span><strong>${money(revenue)}</strong></div>
      <div class="stat"><span>Customers</span><strong>${users.filter((u) => u.role === "customer").length}</strong></div>
      <div class="stat"><span>Avg. Rating</span><strong>${avg}</strong></div>
    </div>
    <div class="panel-grid">
      <div class="panel"><h3>Top Rated Guns</h3>
        ${top.map((p) => `<div class="mini"><img src="${esc(p.image)}" alt="" /><div class="grow"><b>${esc(p.name)}</b><br /><small>${esc(p.cat)}</small></div><b>${p.rating.toFixed(1)} &#9733;</b></div>`).join("") || '<p class="muted">No guns yet.</p>'}
      </div>
      <div class="panel"><h3>Low Stock</h3>
        ${low.map((p) => `<div class="mini"><img src="${esc(p.image)}" alt="" /><div class="grow"><b>${esc(p.name)}</b></div><b class="low">${p.stock} left</b></div>`).join("") || '<p class="muted">All guns are well stocked.</p>'}
      </div>
      <div class="panel"><h3>Recent Orders</h3>
        ${recent.map((o) => `<div class="mini"><div class="grow"><b>${esc(o.id)}</b><br /><small>${esc(o.userName)}</small></div><span class="status ${esc(o.status)}">${esc(o.status)}</span><b>${money(o.total)}</b></div>`).join("") || '<p class="muted">No orders yet.</p>'}
      </div>
    </div>`;
}

/* ---------- Products ---------- */
function renderProducts() {
  const list = data.products.filter(
    (p) => (pFilter.cat === "All" || p.cat === pFilter.cat) && `${p.name} ${p.brand} ${p.caliber}`.toLowerCase().includes(pFilter.q.toLowerCase())
  );
  $("#content").innerHTML = `
    <div class="tools">
      <input type="search" id="pSearch" placeholder="Search guns..." value="${esc(pFilter.q)}" />
      <select id="pCat"><option>All</option>${CATEGORIES.map((c) => `<option ${c === pFilter.cat ? "selected" : ""}>${c}</option>`).join("")}</select>
      <button class="btn btn-primary btn-sm" id="addProduct">+ Add Gun</button>
      <button class="btn btn-ghost btn-sm" id="resetProducts">Reset to Defaults</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Photo</th><th>Name</th><th>Category</th><th>Caliber</th><th>Price</th><th>Stock</th><th>Rating</th><th>Actions</th></tr></thead>
      <tbody>
        ${list.map((p) => `
          <tr>
            <td><img src="${esc(p.image)}" alt="${esc(p.name)}" /></td>
            <td><b>${esc(p.name)}</b><br /><small class="muted">${esc(p.brand)}</small></td>
            <td>${esc(p.cat)}</td>
            <td>${esc(p.caliber)}</td>
            <td>${money(p.price)}</td>
            <td class="${p.stock <= 3 ? "low" : ""}">${p.stock}</td>
            <td>${p.rating.toFixed(1)} <small class="muted">(${p.reviews})</small></td>
            <td><div class="actions">
              <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Edit</button>
              <button class="btn btn-danger btn-sm" data-del="${p.id}">Delete</button>
            </div></td>
          </tr>`).join("") || '<tr><td colspan="8" class="muted">No guns found.</td></tr>'}
      </tbody>
    </table></div>`;
  const s = $("#pSearch");
  s.addEventListener("input", () => {
    const pos = s.selectionStart;
    pFilter.q = s.value;
    renderProducts();
    const n = $("#pSearch"); n.focus(); n.setSelectionRange(pos, pos);
  });
  $("#pCat").addEventListener("change", (e) => { pFilter.cat = e.target.value; renderProducts(); });
}

function openProductModal(id) {
  editingId = id;
  pendingImage = "";
  const f = $("#productForm");
  f.reset();
  $("#productError").textContent = "";
  $("#productModalTitle").textContent = id ? "Edit Gun" : "Add Gun";
  const p = id ? data.products.find((x) => x.id === id) : null;
  const d = p || { name: "", brand: "", cat: CATEGORIES[0], caliber: "", price: "", stock: 5, rating: 4, reviews: 0, desc: "", image: "" };
  Object.entries(d).forEach(([k, v]) => { if (f.elements[k]) f.elements[k].value = v; });
  showPreview(d.image);
  $("#productModal").classList.add("open");
}

function showPreview(src) {
  $("#imagePreview").innerHTML = src ? `<img src="${esc(src)}" alt="Preview" />` : "";
}

$("#imageFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const im = new Image();
    im.onload = () => {
      // shrink in the browser first; the server still re-checks type and size
      const scale = Math.min(1, 800 / Math.max(im.width, im.height));
      const c = document.createElement("canvas");
      c.width = Math.round(im.width * scale);
      c.height = Math.round(im.height * scale);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      pendingImage = c.toDataURL("image/jpeg", 0.85);
      showPreview(pendingImage);
    };
    im.src = reader.result;
  };
  reader.readAsDataURL(file);
});
$("#productForm [name=image]").addEventListener("input", (e) => { pendingImage = ""; showPreview(e.target.value.trim()); });

$("#productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const body = {
    name: f.name.value, brand: f.brand.value, cat: f.cat.value, caliber: f.caliber.value,
    price: f.price.value, stock: f.stock.value, rating: f.rating.value, reviews: f.reviews.value,
    desc: f.desc.value, image: f.image.value, imageData: pendingImage || undefined
  };
  try {
    if (editingId) await api(`/admin/products/${editingId}`, { method: "PUT", body });
    else await api("/admin/products", { method: "POST", body });
    closeModals();
    toast(editingId ? "Gun updated." : "Gun added.");
    render();
  } catch (err) { $("#productError").textContent = err.message; }
});

/* ---------- Orders ---------- */
let oStatus = "All";
function renderOrders() {
  const orders = data.orders.filter((o) => oStatus === "All" || o.status === oStatus);
  $("#content").innerHTML = `
    <div class="tools">
      <select id="oStatus"><option>All</option>${ORDER_STATUSES.map((s) => `<option ${s === oStatus ? "selected" : ""}>${s}</option>`).join("")}</select>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${orders.map((o) => `
          <tr>
            <td><b>${esc(o.id)}</b></td>
            <td>${esc(o.userName)}<br /><small class="muted">${esc(o.email)}</small></td>
            <td>${new Date(o.date).toLocaleDateString()}</td>
            <td>${o.items.reduce((s, i) => s + i.qty, 0)}</td>
            <td>${money(o.total)}</td>
            <td><select data-status="${esc(o.id)}">${ORDER_STATUSES.map((s) => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}</select></td>
            <td><div class="actions">
              <button class="btn btn-ghost btn-sm" data-view-order="${esc(o.id)}">Details</button>
              <button class="btn btn-danger btn-sm" data-del-order="${esc(o.id)}">Delete</button>
            </div></td>
          </tr>`).join("") || '<tr><td colspan="7" class="muted">No orders found.</td></tr>'}
      </tbody>
    </table></div>`;
  $("#oStatus").addEventListener("change", (e) => { oStatus = e.target.value; renderOrders(); });
}

function showOrder(id) {
  const o = data.orders.find((x) => x.id === id);
  if (!o) return;
  $("#orderModalBody").innerHTML = `
    <h3>${esc(o.id)}</h3>
    <p class="sub"><span class="status ${esc(o.status)}">${esc(o.status)}</span> &bull; ${new Date(o.date).toLocaleString()}</p>
    <dl class="detail-list">
      <dt>Customer</dt><dd>${esc(o.userName)} (${esc(o.email)})</dd>
      <dt>Phone</dt><dd>${esc(o.phone)}</dd>
      <dt>Address</dt><dd>${esc(o.address)}</dd>
      <dt>License No.</dt><dd>${esc(o.license)}</dd>
      <dt>Note</dt><dd>${esc(o.note || "-")}</dd>
    </dl>
    <div class="table-wrap"><table>
      <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
      <tbody>${o.items.map((i) => `<tr><td>${esc(i.name)}</td><td>${i.qty}</td><td>${money(i.price * i.qty)}</td></tr>`).join("")}
      <tr><td colspan="2"><b>Total</b></td><td><b>${money(o.total)}</b></td></tr></tbody>
    </table></div>`;
  $("#orderModal").classList.add("open");
}

/* ---------- Users ---------- */
function renderUsers() {
  const { users, orders } = data;
  $("#content").innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Orders</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${users.map((u) => {
          const self = u.id === admin.id;
          return `
          <tr>
            <td><b>${esc(u.name)}</b>${self ? ' <small class="muted">(you)</small>' : ""}</td>
            <td>${esc(u.email)}</td>
            <td><span class="role ${esc(u.role)}">${esc(u.role)}</span></td>
            <td>${orders.filter((o) => o.userId === u.id).length}</td>
            <td>${new Date(u.created).toLocaleDateString()}</td>
            <td>${u.blocked ? '<span class="low">Blocked</span>' : "Active"}</td>
            <td><div class="actions">${self ? '<small class="muted">-</small>' : `
              <button class="btn btn-ghost btn-sm" data-role="${esc(u.id)}">${u.role === "admin" ? "Make Customer" : "Make Admin"}</button>
              <button class="btn btn-ghost btn-sm" data-block="${esc(u.id)}">${u.blocked ? "Unblock" : "Block"}</button>
              <button class="btn btn-danger btn-sm" data-del-user="${esc(u.id)}">Delete</button>`}
            </div></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table></div>`;
}

/* ---------- Change password ---------- */
$("#changePwBtn").addEventListener("click", () => {
  $("#pwForm").reset();
  $("#pwError").textContent = "";
  $("#pwModal").classList.add("open");
});
$("#pwForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  if (f.get("next") !== f.get("confirm")) return ($("#pwError").textContent = "New passwords do not match.");
  try {
    await api("/auth/password", { method: "POST", body: { current: f.get("current"), next: f.get("next") } });
    closeModals();
    toast("Password changed. Other devices were logged out.");
  } catch (err) { $("#pwError").textContent = err.message; }
});

/* ---------- Shared actions ---------- */
function closeModals() { document.querySelectorAll(".modal-wrap").forEach((m) => m.classList.remove("open")); }

document.addEventListener("click", (e) => {
  const t = e.target;
  if (t.closest("[data-close]") || t.classList.contains("modal-wrap")) return closeModals();

  if (t.closest("#addProduct")) return openProductModal(null);
  const edit = t.closest("[data-edit]");
  if (edit) return openProductModal(Number(edit.dataset.edit));

  const del = t.closest("[data-del]");
  if (del) {
    const p = data.products.find((x) => x.id === Number(del.dataset.del));
    if (p && confirm(`Delete "${p.name}"? This cannot be undone.`)) act(() => api(`/admin/products/${p.id}`, { method: "DELETE" }), "Gun deleted.");
    return;
  }

  if (t.closest("#resetProducts")) {
    if (confirm("Reset all guns, ratings and stock to the original catalog? Orders are kept.")) act(() => api("/admin/products-reset", { method: "POST" }), "Catalog reset.");
    return;
  }

  const vo = t.closest("[data-view-order]");
  if (vo) return showOrder(vo.dataset.viewOrder);

  const dOrder = t.closest("[data-del-order]");
  if (dOrder) {
    if (confirm("Delete this order record?")) act(() => api(`/admin/orders/${encodeURIComponent(dOrder.dataset.delOrder)}`, { method: "DELETE" }), "Order deleted.");
    return;
  }

  const role = t.closest("[data-role]");
  if (role) {
    const u = data.users.find((x) => x.id === role.dataset.role);
    const next = u.role === "admin" ? "customer" : "admin";
    return act(() => api(`/admin/users/${encodeURIComponent(u.id)}`, { method: "PATCH", body: { role: next } }), `${u.name} is now ${next}.`);
  }

  const block = t.closest("[data-block]");
  if (block) {
    const u = data.users.find((x) => x.id === block.dataset.block);
    return act(() => api(`/admin/users/${encodeURIComponent(u.id)}`, { method: "PATCH", body: { blocked: !u.blocked } }), `${u.name} ${u.blocked ? "unblocked" : "blocked"}.`);
  }

  const dUser = t.closest("[data-del-user]");
  if (dUser) {
    const u = data.users.find((x) => x.id === dUser.dataset.delUser);
    if (u && confirm(`Delete user "${u.name}"?`)) act(() => api(`/admin/users/${encodeURIComponent(u.id)}`, { method: "DELETE" }), "User deleted.");
  }
});

document.addEventListener("change", (e) => {
  const sel = e.target.closest("[data-status]");
  if (sel) act(() => api(`/admin/orders/${encodeURIComponent(sel.dataset.status)}`, { method: "PATCH", body: { status: sel.value } }), `Order ${sel.dataset.status} set to ${sel.value}.`);
});

document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModals(); });

boot();
