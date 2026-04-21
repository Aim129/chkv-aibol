// =========================
// CoffeeLab app.js (clean)
// =========================

// ---------- Config ----------
const API = "http://127.0.0.1:5000";
const TOKEN_KEY = "token";
const CART_KEY = "cart";

// ---------- Storage helpers ----------
const LS = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  remove(key) {
    localStorage.removeItem(key);
  }
};

// ---------- API ----------
async function getJSON(url, headers = {}) {
  const res = await fetch(API + url, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Server error");
  return data;
}

async function postJSON(url, body, headers = {}) {
  const res = await fetch(API + url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Қате.");
  return data;
}

// ---------- Auth helpers ----------
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getCurrentUser() {
  return LS.get("currentUser", null);
}

function setCurrentUser(user) {
  LS.set("currentUser", user);
}

function requireAuth() {
  const token = getToken();
  if (!token) {
    window.location.href = "index.html";
    return null;
  }
  return token;
}

function showAuthMessage(text, ok = false) {
  const out = document.querySelector("#authMsg");
  if (!out) return;
  out.classList.remove("hidden");
  out.className = "notice " + (ok ? "ok" : "bad");
  out.textContent = text;
}

function clearAuthMessage() {
  const out = document.querySelector("#authMsg");
  if (!out) return;
  out.className = "notice hidden";
  out.textContent = "";
}

function updateUsersList(updatedUser) {
  // Сохраняем только currentUser, без старого users[]
  setCurrentUser(updatedUser);
}

function setUserUI() {
  const user = getCurrentUser();
  const el = document.querySelector("[data-username]");
  if (!el) return;

  let html = user ? user.name : "Гость";

  if (user && user.isCoffeeman) {
    html += ` <span class="badge" style="background:var(--accent2); color:#000; margin-left:4px;" title="Скидка 10% в корзине">🏆 Кофеман</span>`;
  }

  el.innerHTML = html;
}

async function logout() {
  const token = getToken();

  localStorage.removeItem(TOKEN_KEY);
  LS.remove("currentUser");

  try {
    if (token) {
      await postJSON("/api/logout", { token });
    }
  } catch (_) {}

  window.location.href = "index.html";
}

function redirectAfterAuth() {
  const pending = LS.get("pendingItem", null);
  if (pending) {
    const cart = LS.get(CART_KEY, []);
    const existing = cart.find(x => x.id === pending.id);
    if (existing) {
      existing.qty += pending.qty || 1;
    } else {
      cart.push({
        ...pending,
        qty: pending.qty || 1,
        cartId: crypto.randomUUID()
      });
    }
    LS.set(CART_KEY, cart);
    LS.remove("pendingItem");
    window.location.href = "cart.html";
  } else {
    window.location.href = "main.html";
  }
}

// ---------- Cart ----------
function getCart() {
  return LS.get(CART_KEY, []);
}

function setCart(items) {
  LS.set(CART_KEY, items);
  updateCartBadge();
  document.dispatchEvent(new Event("cartUpdated"));
}

function addToCart(item) {
  const cart = getCart();
  const existing = cart.find(x => x.id === item.id);

  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      ...item,
      qty: 1,
      cartId: crypto.randomUUID()
    });
  }

  setCart(cart);
}

function removeFromCart(cartId) {
  const cart = getCart().filter(x => x.cartId !== cartId);
  setCart(cart);
}

function changeCartQty(cartId, delta) {
  const cart = getCart();
  const item = cart.find(x => x.cartId === cartId);
  if (item) {
    item.qty += delta;
    if (item.qty <= 0) {
      removeFromCart(cartId);
      return;
    }
  }
  setCart(cart);
}

function clearCart() {
  setCart([]);
}

function cartTotal() {
  return getCart().reduce((s, x) => s + (x.price * x.qty), 0);
}

function updateCartBadge() {
  const badges = document.querySelectorAll("[data-cartcount]");
  const count = getCart().reduce((s, x) => s + x.qty, 0);
  badges.forEach(el => {
    el.textContent = String(count);
  });
}

// ---------- Tools: Temperature ----------
function convertTemp(value, unit) {
  const v = Number(value);
  if (Number.isNaN(v)) return null;

  if (unit === "C") {
    const f = (v * 9 / 5) + 32;
    return { out: f, outUnit: "°F" };
  } else {
    const c = (v - 32) * 5 / 9;
    return { out: c, outUnit: "°C" };
  }
}

// ---------- Tools: Sentiment ----------
const POS = [
  "хорош", "отлич", "супер", "класс", "рад", "люблю",
  "вкусн", "прекрас", "счаст", "нрав", "божествен", "лучш"
];
const NEG = [
  "плох", "ужас", "ненав", "груст", "злю", "отврат",
  "невкусн", "разочар", "проблем", "неприят", "отстой", "кисл"
];

function detectSentiment(text) {
  const t = (text || "").toLowerCase();
  let score = 0;
  POS.forEach(w => { if (t.includes(w)) score += 1; });
  NEG.forEach(w => { if (t.includes(w)) score -= 1; });

  if (score > 0) return "Положительный";
  if (score < 0) return "Негативный";
  return "Нейтральный";
}

// ---------- Tools: checkbox download ----------
async function forceDownload(url, filename = "download") {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Fetch failed");
    const blob = await res.blob();

    const a = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(objectUrl);
  } catch (e) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

// ---------- Quiz data ----------
const QUIZ = [
  {
    q: "Әлемде кофенің қай түрі ең көп таралған?",
    a: ["Робуста", "Либерика", "Арабика", "Эксцельса"],
    correct: 2
  },
  {
    q: "Аңыз бойынша, кофе қай елден шыққан?",
    a: ["Италия", "Бразилия", "Эфиопия", "Колумбия"],
    correct: 2
  },
  {
    q: "Эспрессо дегеніміз не?",
    a: ["Кофе сорты", "Қысыммен дайындау әдісі", "Кофе машинасының маркасы", "Сүт қосылған кофе сусынының атауы"],
    correct: 1
  },
  {
    q: "Қай сусын тең пропорциядағы эспрессо, ыстық сүт және сүт көбігінен тұрады?",
    a: ["Капучино", "Латте", "Американо", "Флэт уайт"],
    correct: 0
  },
  {
    q: "'Бариста' сөзі нені білдіреді?",
    a: ["Кофеханадағы бармен", "Кофе сорты", "Сүт көпіршітетін құрылғы", "Плантация иесі"],
    correct: 0
  }
];

// ---------- Catalog data ----------
const PRODUCTS = [
  { id: "c1", name: "Эспрессо", cat: "Кофе", price: 900, desc: "Классикалық қою кофе, 30 мл.", img: "https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=500&q=80", isPopular: false },
  { id: "c2", name: "Капучино", cat: "Кофе", price: 1200, desc: "Қалың сүт көбігі бар эспрессо.", img: "data:image/jpeg;base64,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", isPopular: true },
  { id: "c3", name: "Латте", cat: "Кофе", price: 1300, desc: "Сүті мол нәзік кофе сусыны.", img: "https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=500&q=80", isPopular: true },
  { id: "t1", name: "Қара шай", cat: "Шай", price: 700, desc: "Хош иісті классикалық қара шай.", img: "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=500&q=80", isPopular: false },
  { id: "t2", name: "Жасыл шай", cat: "Шай", price: 750, desc: "Антиоксиданттары бар сергітетін жасыл шай.", img: "https://images.unsplash.com/photo-1627435601361-ec25f5b1d0e5?w=500&q=80", isPopular: false },
  { id: "t3", name: "Лимон қосылған шай", cat: "Шай", price: 850, desc: "Лимон тілімі қосылған қара шай, жақсы сергітеді.", img: "https://images.unsplash.com/photo-1557089706-68d02f5fd8df?w=500&q=80", isPopular: true },
  { id: "d1", name: "Какао", cat: "Напитки", price: 1100, desc: "Суық күндері жылытатын ыстық шоколад сусыны.", img: "https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?w=500&q=80", isPopular: false },
  { id: "d2", name: "Лимонад", cat: "Напитки", price: 1000, desc: "Жалбыз қосылған салқын үй лимонады.", img: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&q=80", isPopular: true },
  { id: "f1", name: "Круассан", cat: "Легкая еда", price: 800, desc: "Сары май қосылған жаңа піскен француз круассаны.", img: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500&q=80", isPopular: true },
  { id: "f2", name: "Авокадо қосылған тост", cat: "Легкая еда", price: 1500, desc: "Пайдалы жеңіл тамақ: қытырлақ тост және піскен авокадо.", img: "https://images.unsplash.com/photo-1541519227344-f56b46555cc5?w=500&q=80", isPopular: false },
  { id: "s1", name: "Чизкейк", cat: "Вкусняшки", price: 1400, desc: "Нәзік классикалық нью-йорк чизкейкі.", img: "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=500&q=80", isPopular: true },
  { id: "s2", name: "Құймақтар", cat: "Вкусняшки", price: 900, desc: "Қойытылған сүт немесе тосап қосылған үй құймақтары.", img: "https://images.unsplash.com/photo-1528207776546-365bb710ee93?w=500&q=80", isPopular: false }
];

// ---------- Theme ----------
function initTheme() {
  const isLight = LS.get("lightMode", false);
  if (isLight) document.documentElement.classList.add("light-mode");

  const tb = document.querySelector("#themeBtn");
  if (tb) {
    tb.textContent = isLight ? "🌙" : "🌞";
    tb.addEventListener("click", () => {
      document.documentElement.classList.toggle("light-mode");
      const value = document.documentElement.classList.contains("light-mode");
      LS.set("lightMode", value);
      tb.textContent = value ? "🌙" : "🌞";
    });
  }
}

// ---------- Fitts/Hick login modal ----------
let loginErrors = 0;
let loginStartTs = null;
let tEmailStart = null;
let tEmailTotal = 0;
let tPassStart = null;
let tPassTotal = 0;
let pendingRedirect = null;

function now() {
  return performance.now();
}

function hickMs(nChoices) {
  const a = 200, b = 80;
  return Math.round(a + b * Math.log2(nChoices + 1));
}

function fittsMs(D, W) {
  const a = 60, b = 90;
  return Math.round(a + b * Math.log2(D / W + 1));
}

function openLoginBanner() {
  document.getElementById("lhModal")?.classList.remove("hidden");
}

function closeLoginBanner() {
  document.getElementById("lhModal")?.classList.add("hidden");
}

function fillLoginBanner() {
  const totalSec = ((now() - loginStartTs) / 1000);
  const emailSec = tEmailTotal / 1000;
  const passSec = tPassTotal / 1000;

  const slow = emailSec >= passSec
    ? `Login: Email • ${emailSec.toFixed(2)} сек`
    : `Login: Пароль • ${passSec.toFixed(2)} сек`;

  const fitts = fittsMs(350, 120);
  const hick = hickMs(5);

  const totalEl = document.getElementById("lhTotal");
  const errEl = document.getElementById("lhErrCount");
  const slowEl = document.getElementById("lhSlow");
  const fittsEl = document.getElementById("lhFitts");
  const hickEl = document.getElementById("lhHick");
  const noteEl = document.getElementById("lhNote");
  const statusEl = document.getElementById("lhStatusText");

  if (totalEl) totalEl.textContent = `${totalSec.toFixed(2)} сек`;
  if (errEl) errEl.textContent = `${loginErrors}`;
  if (slowEl) slowEl.textContent = slow;
  if (fittsEl) fittsEl.textContent = `Fitts: ${fitts} ms (avg)`;
  if (hickEl) hickEl.textContent = `Hick: ${hick} ms (est)`;
  if (noteEl) noteEl.textContent = "Ескерту: бұл есеп — демо (HCI тапсырмасы үшін).";
  if (statusEl) statusEl.textContent = "✅ Дұрыс енгізілді. Экранда Fitts/Hick бойынша есеп көрсетілді.";
}

// ---------- Optional avatar ----------
async function loadNavAvatar() {
  const navImg = document.getElementById("navAvatar");
  const navDefault = document.getElementById("navAvatarDefault");
  if (!navImg) return;

  const token = getToken();
  if (!token) return;

  try {
    const data = await getJSON("/api/me", {
      "Authorization": "Bearer " + token
    });

    if (data.ok && data.avatar_url) {
      navImg.src = API + data.avatar_url + "?t=" + Date.now();
      navImg.style.display = "block";
      if (navDefault) navDefault.style.display = "none";
    }
  } catch (_) {}
}

// ---------- DOM Ready ----------
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  updateCartBadge();
  setUserUI();

  // logout buttons
  document.querySelectorAll("[data-logout]").forEach(btn => {
    btn.addEventListener("click", logout);
  });

  document.getElementById("logoutBtn")?.addEventListener("click", logout);

  // login banner modal close
  document.getElementById("lhOk")?.addEventListener("click", () => {
    closeLoginBanner();
    if (pendingRedirect) {
      window.location.href = pendingRedirect;
      pendingRedirect = null;
    }
  });

  // focus timing for login fields
  const loginEmail = document.getElementById("loginEmail");
  const loginPass = document.getElementById("loginPass");

  loginEmail?.addEventListener("focus", () => { tEmailStart = now(); }, { passive: true });
  loginEmail?.addEventListener("blur", () => {
    if (tEmailStart != null) tEmailTotal += (now() - tEmailStart);
    tEmailStart = null;
  }, { passive: true });

  loginPass?.addEventListener("focus", () => { tPassStart = now(); }, { passive: true });
  loginPass?.addEventListener("blur", () => {
    if (tPassStart != null) tPassTotal += (now() - tPassStart);
    tPassStart = null;
  }, { passive: true });

  // ---------- AUTH PAGE ----------
  const authContainer = document.querySelector("#authContainer");
  if (authContainer) {
    const showLogin = document.querySelector("#showLogin");
    const showReg = document.querySelector("#showReg");
    const tabLogin = document.querySelector("#tabLogin");
    const tabReg = document.querySelector("#tabReg");

    const switchTab = (isLogin) => {
      if (isLogin) {
        tabLogin?.classList.remove("hidden");
        tabReg?.classList.add("hidden");
        showLogin?.classList.add("active");
        showReg?.classList.remove("active");
      } else {
        tabReg?.classList.remove("hidden");
        tabLogin?.classList.add("hidden");
        showReg?.classList.add("active");
        showLogin?.classList.remove("active");
      }
      clearAuthMessage();
    };

    showLogin?.addEventListener("click", () => switchTab(true));
    showReg?.addEventListener("click", () => switchTab(false));

    // register
    document.querySelector("#registerForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearAuthMessage();

      const name = document.querySelector("#regName")?.value.trim() || "";
      const email = document.querySelector("#regEmail")?.value.trim() || "";
      const password = document.querySelector("#regPass")?.value || "";

      if (!name || !email || !password) {
        showAuthMessage("Барлық өрістерді толтырыңыз.");
        return;
      }

      try {
        const data = await postJSON("/api/register", { name, email, password });

        localStorage.setItem(TOKEN_KEY, data.token);
        setCurrentUser({
          name: data.name,
          email: data.email,
          role: data.role || "client",
          isCoffeeman: false
        });

        showAuthMessage("Тіркелу сәтті аяқталды!", true);
        setTimeout(() => {
          redirectAfterAuth();
        }, 700);
      } catch (err) {
        showAuthMessage(err.message || "Тіркелу қатесі.");
      }
    });

    // login
    document.querySelector("#loginForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearAuthMessage();
console.log("0")

      if (loginStartTs === null) loginStartTs = now();
      loginEmail?.blur();
      loginPass?.blur();

      const email = loginEmail?.value.trim() || "";
      const password = loginPass?.value || "";

      let localErr = 0;
      if (!email || !email.includes("@")) localErr++;
      if (!password || password.length < 4) localErr++;

      if (localErr > 0) {
        loginErrors += localErr;
        showAuthMessage("Email немесе пароль қате толтырылған.");
        return;
      }

      try {
        const data = await postJSON("/api/login", { email, password });
        console.log("1")

        localStorage.setItem(TOKEN_KEY, data.token);
        setCurrentUser({
          name: data.name,
          email: data.email,
          role: data.role || "client",
          isCoffeeman: getCurrentUser()?.isCoffeeman || false
        });
        window.location.href = "main.html";
        fillLoginBanner();

        openLoginBanner();
      } catch (err) {
        loginErrors += 1;
        showAuthMessage(err.message || "Кіру қатесі.");
      }
    });
  }

  // ---------- CATALOG PAGE ----------
  const catalogGrid = document.querySelector("#catalogGrid");
  if (catalogGrid) {
    requireAuth();

    const renderProducts = (filterCat = "Барлығы") => {
      catalogGrid.innerHTML = "";
      const filtered = filterCat === "Барлығы"
        ? PRODUCTS
        : PRODUCTS.filter(p => p.cat === filterCat);

      filtered.forEach(p => {
        const div = document.createElement("div");
        div.className = "card product";

        let tagsHtml = `<span class="tag">${p.cat}</span>`;
        if (p.isPopular) {
          tagsHtml += `<span class="tag popular" style="margin-left:6px;">⭐ Танымал таңдау</span>`;
        }

        div.innerHTML = `
          <div class="product-img" style="background-image:url('${p.img}')">
            <div class="overlay">
              <p>${p.desc}</p>
            </div>
          </div>
          <div class="product-info">
            <div class="top">
              <h3>${p.name}</h3>
              <div style="display:flex;">${tagsHtml}</div>
            </div>
            <div class="row" style="align-items:center; margin-top:10px;">
              <div class="price">${p.price} ₸</div>
              <button class="btn btn-sm" data-add="${p.id}" data-name="${p.name}" data-price="${p.price}">Себетке</button>
            </div>
          </div>
        `;
        catalogGrid.appendChild(div);
      });

      catalogGrid.querySelectorAll("[data-add]").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-add");
          const name = btn.getAttribute("data-name");
          const price = Number(btn.getAttribute("data-price"));

          addToCart({ id, name, price });

          btn.textContent = "Қосылды!";
          btn.classList.add("ok");
          setTimeout(() => {
            btn.textContent = "Себетке";
            btn.classList.remove("ok");
          }, 1000);
        });
      });
    };

    document.querySelectorAll(".cat-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderProducts(btn.getAttribute("data-cat"));
      });
    });

    renderProducts();

    const renderMiniCart = () => {
      const box = document.querySelector("#miniCartList");
      if (!box) return;

      const items = getCart();
      box.innerHTML = "";

      if (items.length === 0) {
        box.innerHTML = `<div class="muted small" style="margin-top:8px;">Себет бос</div>`;
        return;
      }

      items.forEach(x => {
        const div = document.createElement("div");
        div.className = "mini-cart-item";
        div.innerHTML = `<span>${x.name} x${x.qty}</span> <b>${(x.price * x.qty)} ₸</b>`;
        box.appendChild(div);
      });
    };

    renderMiniCart();
    document.addEventListener("cartUpdated", renderMiniCart);

    const toggleBrew = document.querySelector("#toggleBrew");
    toggleBrew?.addEventListener("click", () => {
      document.querySelector("#brewWidget")?.classList.toggle("hidden");
    });

    const tForm = document.querySelector("#tempFormCat");
    tForm?.addEventListener("submit", (e) => {
      e.preventDefault();

      const val = document.querySelector("#tempValueCat")?.value;
      const unit = document.querySelector("#tempUnitCat")?.value;
      const res = convertTemp(val, unit);
      const out = document.querySelector("#tempOutCat");

      if (!out) return;
      out.classList.remove("hidden");

      if (!res) {
        out.className = "notice bad";
        out.textContent = "Қате: жарамсыз сан енгізілді.";
      } else {
        out.className = "notice ok";
        out.textContent = `${res.out.toFixed(1)} ${res.outUnit}`;
      }
    });
  }

  // ---------- CART PAGE ----------
  const cartBox = document.querySelector("#cartList");
  if (cartBox) {
    requireAuth();

    const renderCart = () => {
      const items = getCart();
      const user = getCurrentUser();

      cartBox.innerHTML = "";

      const actions = document.querySelector("#cartActions");
      if (items.length === 0) {
        cartBox.innerHTML = `<div class="notice">Себет бос. Каталогқа өтіп, сусындар немесе тағамдар қосыңыз.</div>`;
        if (actions) actions.style.display = "none";
      } else {
        if (actions) actions.style.display = "block";

        items.forEach(x => {
          const div = document.createElement("div");
          div.className = "cart-item";
          div.innerHTML = `
            <div class="meta">
              <b>${x.name}</b>
              <span>${x.price} ₸ x ${x.qty} = ${x.price * x.qty} ₸</span>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <button class="btn-ghost btn-sm" data-min="${x.cartId}">-</button>
              <span style="width:20px;text-align:center;">${x.qty}</span>
              <button class="btn-ghost btn-sm" data-plus="${x.cartId}">+</button>
              <button class="btn-danger btn-sm" style="margin-left:8px;" data-remove="${x.cartId}">×</button>
            </div>
          `;
          cartBox.appendChild(div);
        });
      }

      let total = cartTotal();
      const discountEl = document.querySelector("#discountRow");

      if (user?.isCoffeeman && total > 0) {
        const disc = total * 0.1;
        total -= disc;
        if (discountEl) {
          discountEl.innerHTML = `<span style="color:var(--accent2)">Алақай! Сіз Кофеман жеңілдігін (10%) қолдандыңыз: -${disc.toFixed(0)} ₸</span>`;
        }
      } else {
        if (discountEl) {
          discountEl.innerHTML = user?.isCoffeeman
            ? `<span class="muted small">Пайдаланылмаған 10% Кофеман жеңілдігі (тауарлар қосыңыз)</span>`
            : "";
        }
      }

      const totalEl = document.querySelector("#totalSum");
      if (totalEl) totalEl.textContent = total.toFixed(0) + " ₸";

      cartBox.querySelectorAll("[data-remove]").forEach(b => {
        b.addEventListener("click", () => {
          removeFromCart(b.getAttribute("data-remove"));
          renderCart();
        });
      });

      cartBox.querySelectorAll("[data-plus]").forEach(b => {
        b.addEventListener("click", () => {
          changeCartQty(b.getAttribute("data-plus"), 1);
          renderCart();
        });
      });

      cartBox.querySelectorAll("[data-min]").forEach(b => {
        b.addEventListener("click", () => {
          changeCartQty(b.getAttribute("data-min"), -1);
          renderCart();
        });
      });
    };

    renderCart();

    document.querySelector("#clearCart")?.addEventListener("click", () => {
      clearCart();
      renderCart();
    });

    const paySelect = document.querySelector("#payMethod");
    const payArea = document.querySelector("#payArea");

    const updatePayArea = () => {
      if (!paySelect || !payArea) return;
      const val = paySelect.value;

      if (val === "Card") {
        payArea.innerHTML = `
          <div class="row" style="margin-top:10px;">
            <input type="text" placeholder="карта номері (не настоящий!)" maxlength="16" required>
            <input type="text" placeholder="MM/YY" maxlength="5" style="max-width:100px;" required>
            <input type="text" placeholder="CVC" maxlength="3" style="max-width:80px;" required>
          </div>
        `;
      } else if (val === "QR") {
        payArea.innerHTML = `
          <div style="margin-top:10px; text-align:center;">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=CoffeeLabPayment" style="border-radius:12px; border:2px solid var(--border);" alt="QR">
            <div class="small muted" style="margin-top:8px;">Отсканируйте код в приложении банка</div>
          </div>
        `;
      } else {
        payArea.innerHTML = `
          <div class="notice ok" style="margin-top:10px;">
            Вы сможете оплатить заказ наличными на кассе, когда он будет готов.
          </div>
        `;
      }
    };

    paySelect?.addEventListener("change", updatePayArea);
    updatePayArea();

    document.querySelector("#placeOrder")?.addEventListener("click", async () => {
      const items = getCart();
      if (items.length === 0) return;

      if (paySelect?.value === "Card") {
        const inputs = payArea?.querySelectorAll("input") || [];
        for (const i of inputs) {
          if (!i.value) {
            alert("Заполните тестовые данные карты!");
            return;
          }
        }
      }

      // optional: send order to backend
      try {
        const token = getToken();
        if (token) {
          const payload = {
            items: items.map(i => ({
              product_id: Number(String(i.id).replace(/\D/g, "")) || 1,
              quantity: i.qty
            }))
          };

          await fetch(API + "/api/orders", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + token
            },
            body: JSON.stringify(payload)
          }).catch(() => null);
        }
      } catch (_) {}

      clearCart();

      document.querySelector(".catalog-header")?.style.setProperty("display", "none");
      const cartRoot = document.querySelector(".container");
      if (!cartRoot) return;

      const successDiv = document.createElement("div");
      successDiv.className = "card";
      successDiv.style.textAlign = "center";
      successDiv.style.marginTop = "40px";
      successDiv.style.padding = "40px";
      successDiv.innerHTML = `
        <h1 style="font-size:48px; margin-bottom:10px;">🎉</h1>
        <h2>Оплата прошла успешно!</h2>
        <p class="muted">Ваш заказ принят в работу. Бариста уже готовит ваши напитки.</p>
        <p style="margin-top:20px; font-weight:600; color:var(--accent);">Номер заказа: #${Math.floor(Math.random() * 9000) + 1000}</p>
        <div style="margin-top:30px;">
          <a href="main.html" class="btn">Вернуться в каталог</a>
        </div>
      `;
      cartRoot.appendChild(successDiv);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // ---------- TOOLS PAGE ----------
  const toolsRoot = document.querySelector("#toolsRoot");
  if (toolsRoot) {
    requireAuth();

    document.querySelector("#sentForm")?.addEventListener("submit", (e) => {
      e.preventDefault();

      const text = document.querySelector("#sentText")?.value || "";
      const mood = detectSentiment(text);
      const a = document.querySelector("#followA")?.value.trim() || "";
      const out = document.querySelector("#sentOut");

      if (!out) return;
      out.classList.remove("hidden");

      if (mood === "Положительный") {
        out.className = "notice ok";
        out.innerHTML = `<b>Спасибо за теплый отзыв! ❤️</b><br>Мы рады, что вам понравилось. Ваше пожелание: <i>"${a || "—"}"</i> передано нашим бариста.`;
      } else if (mood === "Негативный") {
        out.className = "notice bad";
        out.innerHTML = `<b>Нам очень жаль... 😔</b><br>Мы учтем вашу критику, чтобы стать лучше. Пожелание: <i>"${a || "—"}"</i> передано управляющему.`;
      } else {
        out.className = "notice";
        out.innerHTML = `<b>Спасибо за отзыв! ☕</b><br>Мы всегда рады обратной связи. Пожелание: <i>"${a || "—"}"</i> учтено.`;
      }
    });

    document.querySelector("#downloadForm")?.addEventListener("change", (e) => {
      const target = e.target;
      if (target && target.matches("input[type=checkbox][data-url]") && target.checked) {
        const url = target.getAttribute("data-url");
        const name = target.getAttribute("data-fn") || "file";
        forceDownload(url, name);
      }
    });

    const quizBox = document.querySelector("#quizBox");
    if (quizBox) {
      quizBox.innerHTML = QUIZ.map((item, idx) => {
        const opts = item.a.map((txt, j) => `
          <label class="opt">
            <input type="radio" name="q${idx}" value="${j}" required>
            <span>${txt}</span>
          </label>
        `).join("");

        return `
          <div class="quiz-q" data-q="${idx}">
            <b>${idx + 1}) ${item.q}</b>
            <div class="small muted" style="margin-bottom:8px">Выберите один вариант:</div>
            ${opts}
          </div>
        `;
      }).join("");

      document.querySelector("#quizForm")?.addEventListener("submit", (e) => {
        e.preventDefault();
        let correct = 0;

        QUIZ.forEach((item, idx) => {
          const block = document.querySelector(`.quiz-q[data-q="${idx}"]`);
          block?.classList.remove("correct", "wrong");

          const chosen = document.querySelector(`input[name="q${idx}"]:checked`);
          const val = chosen ? Number(chosen.value) : -1;

          if (val === item.correct) {
            correct++;
            block?.classList.add("correct");
          } else {
            block?.classList.add("wrong");
          }
        });

        const out = document.querySelector("#quizOut");
        const user = getCurrentUser();

        if (!out || !user) return;
        out.classList.remove("hidden");

        if (correct >= 4) {
          out.className = "notice ok";
          let msg = `<b>Поздравляем! 🎉</b><br>Ваш результат: ${correct} из ${QUIZ.length}.`;

          if (!user.isCoffeeman) {
            user.isCoffeeman = true;
            updateUsersList(user);
            setUserUI();
            msg += `<br><br><span style="color:var(--accent2); font-weight:bold;">Сізге "Кофеман" мәртебесі берілді! Енді сізде себетте тұрақты 10% жеңілдік бар.</span>`;
          } else {
            msg += `<br>Вы уже являетесь Кофеманом!`;
          }

          out.innerHTML = msg;
        } else {
          out.className = "notice bad";
          out.innerHTML = `Ваш результат: ${correct} из ${QUIZ.length}.<br>Для статуса "Кофеман" нужно ответить минимум на 4 вопроса. Попробуйте еще раз!`;
        }
      });

      document.querySelector("#quizForm")?.addEventListener("reset", () => {
        QUIZ.forEach((item, idx) => {
          const block = document.querySelector(`.quiz-q[data-q="${idx}"]`);
          block?.classList.remove("correct", "wrong");
        });
        document.querySelector("#quizOut")?.classList.add("hidden");
      });
    }
  }

  // optional avatar after page load
  window.addEventListener("load", loadNavAvatar);
});


// CHAT BOT------------------------------------------------------------------------------------------------------

function addChatMessage(text, who = "bot") {
  const box = document.querySelector("#chatMessages");
  if (!box) return;

  const div = document.createElement("div");
  div.className = "chat-msg " + (who === "user" ? "chat-user" : "chat-bot");
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

async function askGemini(message) {
  const res = await fetch(API + "/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ message })
  });

  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.message || "AI қатесі");
  }
  return data.reply;
}

document.addEventListener("DOMContentLoaded", () => {
  const chatbotRoot = document.querySelector("#chatbotRoot");
  if (!chatbotRoot) return;

  addChatMessage("Сәлем! Мен CoffeeLab AI көмекшісімін. Кофе, шай, тапсырыс немесе бағалар туралы сұрақ қойыңыз.", "bot");

  document.querySelector("#clearChatBtn")?.addEventListener("click", () => {
    const box = document.querySelector("#chatMessages");
    if (box) {
      box.innerHTML = "";
      addChatMessage("Чат тазартылды.", "bot");
    }
  });

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceBtn = document.querySelector("#voiceBtn");
  const voiceStatus = document.querySelector("#voiceStatus");
  const chatInput = document.querySelector("#chatInput");

  if (SpeechRecognition && voiceBtn) {
    const recognition = new SpeechRecognition();
    recognition.lang = "ru-RU";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    voiceBtn.addEventListener("click", () => {
      try {
        recognition.start();
        if (voiceStatus) voiceStatus.textContent = "Тыңдап тұрмын...";
      } catch (_) {
        if (voiceStatus) voiceStatus.textContent = "Дауыс тануды бастау мүмкін болмады.";
      }
    });

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (chatInput) chatInput.value = transcript;
      if (voiceStatus) voiceStatus.textContent = "Дауыс мәтінге айналдырылды.";
    };

    recognition.onerror = () => {
      if (voiceStatus) voiceStatus.textContent = "Дауыс тану кезінде қате болды.";
    };

    recognition.onend = () => {
      setTimeout(() => {
        if (voiceStatus) voiceStatus.textContent = "";
      }, 1500);
    };
  }
});