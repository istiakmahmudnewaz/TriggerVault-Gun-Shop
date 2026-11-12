'use strict';
/* =====================================================
   TriggerVault - secure backend
   - Passwords hashed with bcrypt (never stored or sent in plain text)
   - Login sessions in HttpOnly + SameSite=Strict cookies
   - Every admin action is checked on the SERVER
   - Prices / stock are decided by the server, never by the browser
   - Helmet security headers + strict Content-Security-Policy
   - Rate limiting, input validation, CSRF protection
   ===================================================== */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { DEFAULT_PRODUCTS, CATEGORIES, ORDER_STATUSES } = require('./seed');

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'assets', 'uploads');
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const COOKIE = 'tv_sid';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_COST = 12;

/* ---------- tiny JSON database (kept OUTSIDE the public folder) ---------- */
let db;
function loadDb() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  else db = { products: DEFAULT_PRODUCTS, users: [], orders: [], votes: {} };
  db.votes = db.votes || {};
}
function saveDb() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

/* ---------- helpers ---------- */
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);

function str(v, min, max, label = 'Value') {
  if (typeof v !== 'string') throw bad(`${label} is required.`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw bad(`${label} must be ${min}-${max} characters.`);
  return s;
}
function optStr(v, max, label) {
  if (v === undefined || v === null || v === '') return '';
  return str(String(v), 0, max, label);
}
function num(v, min, max, label, integer = false) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    throw bad(`${label} must be ${integer ? 'a whole number' : 'a number'} between ${min} and ${max}.`);
  }
  return n;
}
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });
const safeEq = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- sessions ---------- */
const sessions = new Map(); // token -> { userId, csrf, exp }
function parseCookies(header = '') {
  const out = {};
  header.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function startSession(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { userId: user.id, csrf, exp: Date.now() + SESSION_MS });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: IS_PROD, maxAge: SESSION_MS, path: '/' });
  return csrf;
}
function endSessionsFor(userId, exceptToken) {
  for (const [t, s] of sessions) if (s.userId === userId && t !== exceptToken) sessions.delete(t);
}
setInterval(() => {
  const now = Date.now();
  for (const [t, s] of sessions) if (s.exp < now) sessions.delete(t);
}, 60 * 60 * 1000).unref();

/* ---------- app + security middleware ---------- */
const app = express();
app.disable('x-powered-by');
if (Number(process.env.TRUST_PROXY)) app.set('trust proxy', Number(process.env.TRUST_PROXY));

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      ...(IS_PROD ? { upgradeInsecureRequests: [] } : {})
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'same-origin' }
}));
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(express.json({ limit: '2mb' }));

/* static files: ONLY the public folder is ever served */
app.use(express.static(PUBLIC_DIR, { dotfiles: 'ignore', index: 'index.html', maxAge: IS_PROD ? '1h' : 0 }));

/* ---------- API protection ---------- */
const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 240, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Please slow down.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again in 15 minutes.' } });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many sign-ups from this network. Try again later.' } });
const orderLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many orders. Try again later.' } });

app.use('/api', apiLimiter);

// attach the logged-in user (if any)
app.use('/api', (req, res, next) => {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  const s = token && sessions.get(token);
  if (s && s.exp > Date.now()) {
    const user = db.users.find((u) => u.id === s.userId);
    if (user && !user.blocked) { req.user = user; req.session = s; req.token = token; }
    else sessions.delete(token);
  }
  next();
});

// CSRF / cross-site protection for every state-changing request
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    let ok = false;
    try { ok = new URL(origin).host === req.get('host'); } catch { ok = false; }
    if (!ok) return next(new HttpError(403, 'Cross-site request blocked.'));
  }
  if (!req.is('application/json')) return next(new HttpError(415, 'JSON body required.'));
  const exempt = req.path === '/auth/login' || req.path === '/auth/register';
  if (req.session && !exempt && !safeEq(req.get('x-csrf-token') || '', req.session.csrf)) {
    return next(new HttpError(403, 'Security token missing. Please refresh the page.'));
  }
  next();
});

const requireAuth = (req, res, next) => (req.user ? next() : next(new HttpError(401, 'Please login first.')));
const requireAdmin = (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Please login first.'));
  if (req.user.role !== 'admin') return next(new HttpError(403, 'Admin access required.'));
  next();
};

/* ---------- auth ---------- */
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null, csrf: req.session ? req.session.csrf : '' });
});

app.post('/api/auth/register', registerLimiter, wrap(async (req, res) => {
  const name = str(req.body.name, 2, 60, 'Name');
  const email = str(req.body.email, 5, 320, 'Email').toLowerCase();
  const password = str(req.body.password, 8, 72, 'Password');
  if (!EMAIL_RE.test(email)) throw bad('Please enter a valid email address.');
  if (db.users.some((u) => u.email === email)) throw bad('This email is already registered.');
  const user = {
    id: 'u_' + crypto.randomBytes(8).toString('hex'), name, email, role: 'customer', blocked: false,
    created: new Date().toISOString(), hash: await bcrypt.hash(password, BCRYPT_COST)
  };
  db.users.push(user);
  saveDb();
  res.json({ user: publicUser(user), csrf: startSession(res, user) });
}));

app.post('/api/auth/login', authLimiter, wrap(async (req, res) => {
  const email = str(req.body.email, 3, 320, 'Email').toLowerCase();
  const password = str(req.body.password, 1, 200, 'Password');
  const user = db.users.find((u) => u.email === email);
  const ok = await bcrypt.compare(password, user ? user.hash : DUMMY_HASH); // same work either way
  if (!user || !ok) throw new HttpError(401, 'Wrong email or password.');
  if (user.blocked) throw new HttpError(403, 'This account has been blocked. Contact the shop.');
  res.json({ user: publicUser(user), csrf: startSession(res, user) });
}));

app.post('/api/auth/logout', (req, res) => {
  if (req.token) sessions.delete(req.token);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

app.post('/api/auth/password', requireAuth, authLimiter, wrap(async (req, res) => {
  const current = str(req.body.current, 1, 200, 'Current password');
  const next = str(req.body.next, req.user.role === 'admin' ? 10 : 8, 72, 'New password');
  if (!(await bcrypt.compare(current, req.user.hash))) throw bad('Current password is wrong.');
  req.user.hash = await bcrypt.hash(next, BCRYPT_COST);
  saveDb();
  endSessionsFor(req.user.id, req.token);
  res.json({ ok: true });
}));

/* ---------- products (public read) ---------- */
app.get('/api/products', (req, res) => res.json({ products: db.products }));

app.get('/api/votes/mine', requireAuth, (req, res) => {
  const mine = {};
  for (const [pid, v] of Object.entries(db.votes)) if (v[req.user.id]) mine[pid] = v[req.user.id];
  res.json({ votes: mine });
});

app.post('/api/products/:id/rate', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const stars = num(req.body.stars, 1, 5, 'Rating', true);
  const p = db.products.find((x) => x.id === id);
  if (!p) throw new HttpError(404, 'Gun not found.');
  db.votes[id] = db.votes[id] || {};
  const prev = db.votes[id][req.user.id];
  let total = p.rating * p.reviews;
  let count = p.reviews;
  if (prev) { total -= prev; count -= 1; }
  total += stars; count += 1;
  p.rating = Math.round((total / count) * 10) / 10;
  p.reviews = count;
  db.votes[id][req.user.id] = stars;
  saveDb();
  res.json({ product: p });
});

/* ---------- orders (customer) ---------- */
app.post('/api/orders', requireAuth, orderLimiter, (req, res) => {
  const b = req.body;
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 30) throw bad('Your cart is empty.');
  const phone = str(b.phone, 5, 25, 'Phone');
  if (!/^[0-9+\-\s()]{5,25}$/.test(phone)) throw bad('Please enter a valid phone number.');
  const address = str(b.address, 5, 300, 'Address');
  const license = str(b.license, 3, 60, 'License number');
  const note = optStr(b.note, 200, 'Note');

  const wanted = new Map();
  for (const it of b.items) {
    const id = num(it && it.id, 1, 1e9, 'Item', true);
    const qty = num(it && it.qty, 1, 20, 'Quantity', true);
    wanted.set(id, (wanted.get(id) || 0) + qty);
  }
  const items = [];
  for (const [id, qty] of wanted) {
    const p = db.products.find((x) => x.id === id);
    if (!p) throw bad('One of the guns in your cart is no longer available.');
    if (p.stock < qty) throw bad(`Only ${p.stock} left in stock for ${p.name}.`);
    items.push({ id: p.id, name: p.name, price: p.price, qty }); // price comes from the server
  }
  items.forEach((i) => { db.products.find((p) => p.id === i.id).stock -= i.qty; });
  const order = {
    id: 'ORD-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
    userId: req.user.id, userName: req.user.name, email: req.user.email,
    phone, address, license, note, items,
    total: items.reduce((s, i) => s + i.price * i.qty, 0),
    status: 'Pending', date: new Date().toISOString()
  };
  db.orders.unshift(order);
  saveDb();
  res.json({ order });
});

app.get('/api/orders/mine', requireAuth, (req, res) => {
  const mine = db.orders.filter((o) => o.userId === req.user.id).map(({ license, ...rest }) => rest);
  res.json({ orders: mine });
});

/* ---------- admin ---------- */
const IMG_PATH_RE = /^assets\/[A-Za-z0-9_\-\/.]+$/;

function saveUpload(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw bad('Image must be a JPEG, PNG or WebP file.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 1.5 * 1024 * 1024) throw bad('Image is too large (max 1.5 MB).');
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng = buf.slice(0, 4).toString('hex') === '89504e47';
  const isWebp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  if (!(isJpg || isPng || isWebp)) throw bad('That file is not a real image.');
  const ext = isJpg ? 'jpg' : isPng ? 'png' : 'webp';
  const name = crypto.randomBytes(12).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return 'assets/uploads/' + name;
}

function cleanProduct(b, existing) {
  const cat = str(b.cat, 1, 20, 'Category');
  if (!CATEGORIES.includes(cat)) throw bad('Unknown category.');
  let image = existing ? existing.image : '';
  if (b.imageData) image = saveUpload(b.imageData);
  else if (typeof b.image === 'string' && b.image.trim()) {
    const p = b.image.trim();
    if (!IMG_PATH_RE.test(p) || p.includes('..')) throw bad('Image path must look like assets/guns/1.jpg (upload a photo for new images).');
    image = p;
  }
  return {
    name: str(b.name, 2, 80, 'Name'),
    brand: str(b.brand, 1, 60, 'Brand'),
    cat,
    caliber: str(b.caliber, 1, 40, 'Caliber'),
    price: num(b.price, 0, 10000000, 'Price'),
    stock: num(b.stock, 0, 100000, 'Stock', true),
    rating: Math.round(num(b.rating, 0, 5, 'Rating') * 10) / 10,
    reviews: num(b.reviews, 0, 10000000, 'Reviews', true),
    desc: optStr(b.desc, 500, 'Description'),
    image
  };
}

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const data = cleanProduct(req.body, null);
  const product = { id: Math.max(0, ...db.products.map((p) => p.id)) + 1, ...data };
  db.products.push(product);
  saveDb();
  res.json({ product });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const i = db.products.findIndex((p) => p.id === Number(req.params.id));
  if (i < 0) throw new HttpError(404, 'Gun not found.');
  db.products[i] = { ...db.products[i], ...cleanProduct(req.body, db.products[i]) };
  saveDb();
  res.json({ product: db.products[i] });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const before = db.products.length;
  db.products = db.products.filter((p) => p.id !== Number(req.params.id));
  if (db.products.length === before) throw new HttpError(404, 'Gun not found.');
  saveDb();
  res.json({ ok: true });
});

app.post('/api/admin/products-reset', requireAdmin, (req, res) => {
  db.products = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
  db.votes = {};
  saveDb();
  res.json({ ok: true });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => res.json({ orders: db.orders }));

app.patch('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const o = db.orders.find((x) => x.id === req.params.id);
  if (!o) throw new HttpError(404, 'Order not found.');
  const status = str(req.body.status, 1, 20, 'Status');
  if (!ORDER_STATUSES.includes(status)) throw bad('Unknown status.');
  if (status !== o.status && (status === 'Cancelled' || o.status === 'Cancelled')) {
    o.items.forEach((i) => {
      const p = db.products.find((x) => x.id === i.id);
      if (p) p.stock = Math.max(0, p.stock + (status === 'Cancelled' ? i.qty : -i.qty));
    });
  }
  o.status = status;
  saveDb();
  res.json({ order: o });
});

app.delete('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const before = db.orders.length;
  db.orders = db.orders.filter((o) => o.id !== req.params.id);
  if (db.orders.length === before) throw new HttpError(404, 'Order not found.');
  saveDb();
  res.json({ ok: true });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  res.json({ users: db.users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, blocked: !!u.blocked, created: u.created })) });
});

app.patch('/api/admin/users/:id', requireAdmin, (req, res) => {
  const u = db.users.find((x) => x.id === req.params.id);
  if (!u) throw new HttpError(404, 'User not found.');
  if (u.id === req.user.id) throw bad('You cannot change your own account here.');
  if (req.body.role !== undefined) {
    if (!['admin', 'customer'].includes(req.body.role)) throw bad('Unknown role.');
    u.role = req.body.role;
  }
  if (req.body.blocked !== undefined) {
    u.blocked = !!req.body.blocked;
    if (u.blocked) endSessionsFor(u.id);
  }
  saveDb();
  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const u = db.users.find((x) => x.id === req.params.id);
  if (!u) throw new HttpError(404, 'User not found.');
  if (u.id === req.user.id) throw bad('You cannot delete your own account.');
  db.users = db.users.filter((x) => x.id !== u.id);
  endSessionsFor(u.id);
  saveDb();
  res.json({ ok: true });
});

/* ---------- errors ---------- */
app.use('/api', (req, res, next) => next(new HttpError(404, 'Not found.')));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') err = bad('Invalid request.');
  if (err.type === 'entity.too.large') err = bad('Request is too large.');
  const status = err.status || 500;
  if (status >= 500) console.error('[server error]', err);
  if (req.path.startsWith('/api/')) return res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server.' : err.message });
  res.status(status).send(status === 404 ? 'Not found' : 'Error');
});

/* ---------- start ---------- */
async function ensureAdmin() {
  if (db.users.some((u) => u.role === 'admin')) return;
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!EMAIL_RE.test(email) || password.length < 10) {
    console.error('\nNo admin account exists yet.\nSet ADMIN_EMAIL and ADMIN_PASSWORD (min 10 characters) in the .env file, then start again.\n');
    process.exit(1);
  }
  db.users.push({
    id: 'u_admin', name: (process.env.ADMIN_NAME || 'Shop Admin').trim(), email, role: 'admin', blocked: false,
    created: new Date().toISOString(), hash: await bcrypt.hash(password, BCRYPT_COST)
  });
  saveDb();
  console.log(`Admin account created for ${email}. You can now remove ADMIN_PASSWORD from .env.`);
}

loadDb();
ensureAdmin().then(() => {
  saveDb();
  app.listen(PORT, () => console.log(`TriggerVault running at http://localhost:${PORT}  (${IS_PROD ? 'production' : 'development'})`));
});
