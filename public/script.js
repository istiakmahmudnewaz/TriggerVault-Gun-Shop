/* TriggerVault - storefront (talks to the secure server API) */
const $ = (s) => document.querySelector(s);
const FILTERS = ["All", ...CATEGORIES];

let products = [];
let activeCat = "All";
let user = null;
let myVotes = {};
let detailId = null;
let cart = readCart();

/* ---------- cart is kept in the browser, but the SERVER re-checks prices and stock at checkout ---------- */
function readCart() {
  try {
    const c = JSON.parse(localStorage.getItem("ih_cart") || "[]");
    return Array.isArray(c) ? c.filter((i) => Number.isInteger(i.id) && Number.isInteger(i.qty) && i.qty > 0) : [];
  } catch { return []; }
}
function saveCart() { localStorage.setItem("ih_cart", JSON.stringify(cart)); }

/* ---------- Cards ---------- */
function imgTag(p) {
  return `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" />`;
}

function card(p, rank) {
  const out = p.stock <= 0;
  return `
    <article class="card">
      ${out ? '<span class="badge out">Out of Stock</span>' : p.rating >= 4.8 ? '<span class="badge">Best Pick</span>' : ""}
      ${rank ? `<span class="rank">#${rank}</span>` : ""}
      <div class="card-img" data-open="${p.id}">${imgTag(p)}</div>
      <div class="card-body">
        <span class="cat">${esc(p.cat)}</span>
        <h3 data-open="${p.id}">${esc(p.name)}</h3>
        <p class="meta">${esc(p.brand)} &bull; ${esc(p.caliber)}</p>
        <div class="rating">${starsHTML(p.rating)} <b>${p.rating.toFixed(1)}</b> <span>(${p.reviews.toLocaleString()} reviews)</span></div>
        <div class="card-foot">
          <span class="price">${money(p.price)}</span>
          <button class="add" data-add="${p.id}" ${out ? "disabled" : ""}>${out ? "Sold Out" : "Add to Cart"}</button>
        </div>
      </div>
    </article>`;
}

function renderTop() {
  const top = [...products].sort((a, b) => b.rating - a.rating || b.reviews - a.reviews).slice(0, 4);
  $("#topGrid").innerHTML = top.map((p, i) => card(p, i + 1)).join("");
}

function renderFilters() {
  $("#filters").innerHTML = FILTERS.map(
    (c) => `<button class="chip ${c === activeCat ? "active" : ""}" data-cat="${c}">${c === "All" ? "All Guns" : c}</button>`
  ).join("");
}

function renderGrid() {
  const q = $("#search").value.trim().toLowerCase();
  const sort = $("#sort").value;
  const list = products.filter(
    (p) => (activeCat === "All" || p.cat === activeCat) && `${p.name} ${p.brand} ${p.caliber} ${p.cat}`.toLowerCase().includes(q)
  );
  if (sort === "rating-desc") list.sort((a, b) => b.rating - a.rating);
  if (sort === "price-asc") list.sort((a, b) => a.price - b.price);
  if (sort === "price-desc") list.sort((a, b) => b.price - a.price);
  if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
  $("#grid").innerHTML = list.map((p) => card(p)).join("");
  $("#empty").hidden = list.length > 0;
}

function renderStats() {
  $("#statCount").textContent = products.length;
  $("#statRating").textContent = products.length ? (products.reduce((s, p) => s + p.rating, 0) / products.length).toFixed(1) : "0";
}

function refreshAll() { renderStats(); renderTop(); renderGrid(); renderCart(); }

async function loadProducts() {
  products = (await api("/products")).products;
}

/* ---------- User menu ---------- */
function renderUser() {
  const box = $("#userMenu");
  if (!user) {
    box.innerHTML = `<button class="user-btn" id="loginBtn">Login</button>`;
    return;
  }
  box.innerHTML = `
    <button class="user-btn" id="userBtn">${esc(user.name.split(" ")[0])} &#9662;</button>
    <div class="dropdown" id="dropdown">
      ${user.role === "admin" ? '<a href="admin.html">Admin Panel</a>' : ""}
      <button id="myOrdersBtn">My Orders</button>
      <button id="logoutBtn">Logout</button>
    </div>`;
}

async function afterLogin(u) {
  user = u;
  myVotes = {};
  try { myVotes = (await api("/votes/mine")).votes; } catch { /* ignore */ }
  renderUser();
}

/* ---------- Modals ---------- */
function openModal(id) { $(id).classList.add("open"); }
function closeModals() { document.querySelectorAll(".modal-wrap").forEach((m) => m.classList.remove("open")); }

function openAuth(tab = "login") {
  switchTab(tab);
  ["#loginError", "#registerError"].forEach((s) => ($(s).textContent = ""));
  openModal("#authModal");
}
function switchTab(tab) {
  document.querySelectorAll("#authModal .tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $("#loginForm").hidden = tab !== "login";
  $("#registerForm").hidden = tab !== "register";
}

function openDetail(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  detailId = id;
  const mine = user ? myVotes[id] || 0 : 0;
  const out = p.stock <= 0;
  $("#detailBody").innerHTML = `
    <div class="detail">
      <div class="detail-img">${imgTag(p)}</div>
      <div>
        <span class="cat">${esc(p.cat)}</span>
        <h3>${esc(p.name)}</h3>
        <div class="rating">${starsHTML(p.rating)} <b>${p.rating.toFixed(1)}</b> <span>(${p.reviews.toLocaleString()} reviews)</span></div>
        <p class="sub" style="margin-top:10px">${esc(p.desc || "")}</p>
        <dl class="specs">
          <dt>Brand</dt><dd>${esc(p.brand)}</dd>
          <dt>Caliber</dt><dd>${esc(p.caliber)}</dd>
          <dt>Category</dt><dd>${esc(p.cat)}</dd>
          <dt>Availability</dt><dd>${out ? "Out of stock" : p.stock + " in stock"}</dd>
        </dl>
        <div class="rate-box">
          <p>${user ? (mine ? `Your rating: ${mine} / 5 (click to change)` : "Rate this gun:") : "Login to rate this gun."}</p>
          ${user ? `<div class="rate-stars">${[1, 2, 3, 4, 5].map((n) => `<button data-rate="${n}" class="${n <= mine ? "on" : ""}" aria-label="${n} stars">&#9733;</button>`).join("")}</div>` : '<button class="btn btn-ghost btn-sm" data-login>Login</button>'}
        </div>
        <div class="card-foot" style="border:0">
          <span class="price">${money(p.price)}</span>
          <button class="add" data-add="${p.id}" ${out ? "disabled" : ""}>${out ? "Sold Out" : "Add to Cart"}</button>
        </div>
      </div>
    </div>`;
  openModal("#detailModal");
}

async function openOrders() {
  $("#ordersBody").innerHTML = '<p class="empty">Loading...</p>';
  openModal("#ordersModal");
  try {
    const { orders } = await api("/orders/mine");
    $("#ordersBody").innerHTML = orders.length
      ? orders.map((o) => `
        <div class="order-card">
          <div class="row"><b>${esc(o.id)}</b><span class="status ${esc(o.status)}">${esc(o.status)}</span></div>
          <div class="row"><small>${new Date(o.date).toLocaleString()}</small><b>${money(o.total)}</b></div>
          <ul>${o.items.map((i) => `<li>${esc(i.name)} &times; ${i.qty}</li>`).join("")}</ul>
        </div>`).join("")
      : '<p class="empty">You have no orders yet.</p>';
  } catch (err) {
    $("#ordersBody").innerHTML = `<p class="empty">${esc(err.message)}</p>`;
  }
}

/* ---------- Cart ---------- */
function cartTotal() {
  return cart.reduce((s, i) => {
    const p = products.find((x) => x.id === i.id);
    return s + (p ? p.price * i.qty : 0);
  }, 0);
}

function renderCart() {
  cart = cart.filter((c) => products.some((p) => p.id === c.id));
  saveCart();
  const count = cart.reduce((s, i) => s + i.qty, 0);
  $("#cartCount").textContent = count;
  $("#cartTotal").textContent = money(cartTotal());
  $("#cartItems").innerHTML = cart.length
    ? cart.map((i) => {
        const p = products.find((x) => x.id === i.id);
        return `
        <div class="cart-item">
          <img src="${esc(p.image)}" alt="" />
          <div class="info">
            <h4>${esc(p.name)}</h4>
            <small>${money(p.price)} each</small>
            <div class="qty">
              <button data-act="dec" data-id="${p.id}">-</button><span>${i.qty}</span><button data-act="inc" data-id="${p.id}">+</button>
            </div>
          </div>
          <div style="text-align:right">
            <strong>${money(p.price * i.qty)}</strong><br />
            <button class="remove" data-act="rm" data-id="${p.id}">Remove</button>
          </div>
        </div>`;
      }).join("")
    : '<p class="cart-empty">Your cart is empty.</p>';
}

function addToCart(id) {
  const p = products.find((x) => x.id === id);
  const item = cart.find((i) => i.id === id);
  const have = item ? item.qty : 0;
  if (!p || have >= Math.min(p.stock, 20)) return toast("No more stock available for this gun.");
  item ? item.qty++ : cart.push({ id, qty: 1 });
  renderCart();
  toast(p.name + " added to cart");
}

function toggleCart(open) {
  $("#drawer").classList.toggle("open", open);
  $("#overlay").classList.toggle("open", open);
}

/* ---------- Events ---------- */
document.addEventListener("click", async (e) => {
  const t = e.target;

  if (t.closest("#loginBtn") || t.closest("[data-login]")) return openAuth("login");
  if (t.closest("#userBtn")) return $("#dropdown").classList.toggle("open");
  if (!t.closest("#userMenu")) $("#dropdown")?.classList.remove("open");

  if (t.closest("#logoutBtn")) {
    try { await api("/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    user = null; myVotes = {}; csrfToken = "";
    renderUser(); closeModals();
    return toast("Logged out.");
  }
  if (t.closest("#myOrdersBtn")) { $("#dropdown").classList.remove("open"); return openOrders(); }

  if (t.closest("[data-close]") || t.classList.contains("modal-wrap")) return closeModals();

  const tab = t.closest("#authModal .tabs button");
  if (tab) return switchTab(tab.dataset.tab);

  const add = t.closest("[data-add]");
  if (add) return addToCart(Number(add.dataset.add));

  const open = t.closest("[data-open]");
  if (open) return openDetail(Number(open.dataset.open));

  const rate = t.closest("[data-rate]");
  if (rate && user) {
    try {
      const stars = Number(rate.dataset.rate);
      await api(`/products/${detailId}/rate`, { method: "POST", body: { stars } });
      myVotes[detailId] = stars;
      await loadProducts();
      refreshAll();
      openDetail(detailId);
      toast("Thanks for rating!");
    } catch (err) { toast(err.message); }
    return;
  }

  const chip = t.closest(".chip");
  if (chip) { activeCat = chip.dataset.cat; renderFilters(); return renderGrid(); }

  const act = t.closest("[data-act]");
  if (act) {
    const id = Number(act.dataset.id);
    const item = cart.find((i) => i.id === id);
    const p = products.find((x) => x.id === id);
    if (!item || !p) return;
    if (act.dataset.act === "inc") { if (item.qty < Math.min(p.stock, 20)) item.qty++; else toast("No more stock available."); }
    if (act.dataset.act === "dec") item.qty--;
    if (act.dataset.act === "rm" || item.qty <= 0) cart = cart.filter((i) => i.id !== id);
    renderCart();
  }
});

document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModals(); toggleCart(false); } });

$("#search").addEventListener("input", renderGrid);
$("#sort").addEventListener("change", renderGrid);
$("#cartBtn").addEventListener("click", () => toggleCart(true));
$("#closeCart").addEventListener("click", () => toggleCart(false));
$("#overlay").addEventListener("click", () => toggleCart(false));
$("#menuBtn").addEventListener("click", () => $("#navLinks").classList.toggle("open"));
$("#navLinks").addEventListener("click", () => $("#navLinks").classList.remove("open"));

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const d = await api("/auth/login", { method: "POST", body: { email: f.get("email"), password: f.get("password") } });
    e.target.reset(); closeModals();
    await afterLogin(d.user);
    toast(`Welcome back, ${user.name.split(" ")[0]}!`);
  } catch (err) { $("#loginError").textContent = err.message; }
});

$("#registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  if (f.get("password") !== f.get("confirm")) return ($("#registerError").textContent = "Passwords do not match.");
  try {
    const d = await api("/auth/register", { method: "POST", body: { name: f.get("name"), email: f.get("email"), password: f.get("password") } });
    e.target.reset(); closeModals();
    await afterLogin(d.user);
    toast("Account created. Welcome, " + user.name.split(" ")[0] + "!");
  } catch (err) { $("#registerError").textContent = err.message; }
});

$("#checkout").addEventListener("click", () => {
  if (!cart.length) return toast("Your cart is empty.");
  if (!user) { toggleCart(false); toast("Please login to place an order."); return openAuth("login"); }
  $("#checkoutTotal").textContent = money(cartTotal());
  $("#checkoutError").textContent = "";
  toggleCart(false);
  openModal("#checkoutModal");
});

$("#checkoutForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const { order } = await api("/orders", {
      method: "POST",
      body: {
        items: cart.map((i) => ({ id: i.id, qty: i.qty })),
        phone: f.get("phone"), address: f.get("address"), license: f.get("license"), note: f.get("note")
      }
    });
    cart = []; saveCart();
    e.target.reset(); closeModals();
    await loadProducts();
    refreshAll();
    toast(`Order ${order.id} placed! We will verify your license.`);
  } catch (err) { $("#checkoutError").textContent = err.message; }
});

/* ---------- Age gate (18+) ---------- */
(function ageGate() {
  const root = document.documentElement;
  const ask = $("#ageAsk"), denied = $("#ageDenied");
  // under-18 answer is remembered for this browser session so a refresh does not bypass it
  if (sessionStorage.getItem("ih_age_no") === "1") { ask.hidden = true; denied.hidden = false; }

  $("#ageYes").addEventListener("click", () => {
    sessionStorage.setItem("ih_age_ok", "1");
    sessionStorage.removeItem("ih_age_no");
    root.classList.remove("age-locked");
  });
  $("#ageNo").addEventListener("click", () => {
    sessionStorage.setItem("ih_age_no", "1");
    ask.hidden = true; denied.hidden = false;
  });
  $("#ageBack").addEventListener("click", () => {
    sessionStorage.removeItem("ih_age_no");
    denied.hidden = true; ask.hidden = false;
  });
})();

/* ---------- Init ---------- */
(async function init() {
  themeToggleInit("#themeBtn");
  $("#year").textContent = new Date().getFullYear();
  renderFilters();
  try {
    const u = await loadSession();
    await loadProducts();
    if (u) await afterLogin(u); else renderUser();
  } catch (err) {
    renderUser();
    $("#grid").innerHTML = `<p class="empty">${esc(err.message)}</p>`;
    return;
  }
  refreshAll();
})();
