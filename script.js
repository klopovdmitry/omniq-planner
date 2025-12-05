// Инициализация Telegram WebApp API (фолбэк для тестов вне Telegram)
const tg = window.Telegram?.WebApp || {
  showPopup: d => alert(d.title + "\n" + d.message),
  sendData: d => console.log("sendData:", d)
};

// Загружаем конфигурацию из config.js
const cfg = window.APP_CONFIG || {};

let frontendBalance = cfg.frontendBalance ?? 0;
let backendBalance = cfg.backendBalance ?? 0;
let cart = [];
let currentCategory = "all";

const categories = cfg.categories || [];
const products = cfg.products || [];

// ===== ИНИЦИАЛИЗАЦИЯ =====
function initApp() {
  renderCategories();
  renderProducts();
  updateBalanceDisplay();
  setupEventListeners();
}

// ===== РЕНДЕРИНГ =====
function renderCategories() {
  const container = document.getElementById("categories");
  container.innerHTML = categories
    .map(c => `<div class="category ${c.id === currentCategory ? "active" : ""}" data-category="${c.id}">${c.name}</div>`)
    .join("");
}

function renderProducts() {
  const filtered = currentCategory === "all"
    ? products
    : products.filter(p => p.category === currentCategory);

  const container = document.getElementById("products");
  container.innerHTML = filtered.map(p => {
    const canAdd = frontendBalance >= p.frontend && backendBalance >= p.backend;
    const inCart = cart.find(i => i.product.id === p.id);

    return `
      <div class="product-card ${inCart ? "in-cart" : ""} ${!canAdd && !inCart ? "unavailable" : ""}" data-id="${p.id}">
        <div class="product-image">
          <img src="assets/product.png" alt="${p.name}" onerror="this.style.display='none'">
          <div class="product-image-placeholder"></div>
          <div class="product-effect">${p.effect || ""}</div>
        </div>
        <div class="product-info">
          <div class="product-name">${p.name}</div>
          <div class="product-description">${p.description}</div>
          <div class="product-price">
            <span class="chip chip-frontend">Frontend: ${p.frontend}</span>
            <span class="chip chip-backend">Backend: ${p.backend}</span>
          </div>
          ${inCart ? `<div class="product-in-cart">В корзине</div>` : ""}
        </div>
      </div>`;
  }).join("");
}

// ===== БАЛАНС =====
function updateBalanceDisplay() {
  document.getElementById("frontendBalanceChip").textContent = `Frontend: ${frontendBalance}`;
  document.getElementById("backendBalanceChip").textContent = `Backend: ${backendBalance}`;
}

// ===== СОБЫТИЯ =====
function setupEventListeners() {
  document.getElementById("categories").addEventListener("click", e => {
    const cat = e.target.closest(".category");
    if (cat) {
      currentCategory = cat.dataset.category;
      renderCategories();
      renderProducts();
    }
  });

  document.getElementById("products").addEventListener("click", e => {
    const card = e.target.closest(".product-card");
    if (!card) return;

    const productId = parseInt(card.dataset.id);
    const inCart = cart.find(i => i.product.id === productId);

    if (inCart) {
      removeFromCart(productId);
    } else if (!card.classList.contains("unavailable")) {
      addToCart(productId);
    }
  });

  document.getElementById("cartButton").addEventListener("click", openCart);
  document.getElementById("cartModal").addEventListener("click", e => {
    if (e.target === document.getElementById("cartModal")) closeCart();
  });
  document.getElementById("checkoutBtn").addEventListener("click", checkout);
}

// ===== КОРЗИНА =====
function addToCart(id) {
  const product = products.find(p => p.id === id);
  if (!product || cart.find(i => i.product.id === id)) return;

  if (frontendBalance < product.frontend || backendBalance < product.backend) {
    tg.showPopup({ title: "Ошибка", message: "Недостаточно ресурсов" });
    return;
  }

  frontendBalance -= product.frontend;
  backendBalance -= product.backend;
  cart.push({ product });

  updateBalanceDisplay();
  updateCart();
  renderProducts();
  tg.showPopup({ title: "Добавлено", message: `${product.name} добавлена в план` });
}

function removeFromCart(id) {
  const index = cart.findIndex(i => i.product.id === id);
  if (index > -1) {
    const product = cart[index].product;
    frontendBalance += product.frontend;
    backendBalance += product.backend;
    cart.splice(index, 1);
    updateBalanceDisplay();
    updateCart();
    renderProducts();
    tg.showPopup({ title: "Удалено", message: `${product.name} убрана из плана` });
  }
}

function updateCart() {
  const cartCount = document.getElementById("cartCount");
  const cartItems = document.getElementById("cartItems");
  const cartTotal = document.getElementById("cartTotal");
  const checkoutBtn = document.getElementById("checkoutBtn");

  cartCount.textContent = cart.length;
  cartItems.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-name">${item.product.name}</div>
      <button onclick="removeFromCart(${item.product.id})" class="remove-btn">✕</button>
    </div>`).join("");

  const totalFrontend = cart.reduce((s, i) => s + i.product.frontend, 0);
  const totalBackend = cart.reduce((s, i) => s + i.product.backend, 0);
  cartTotal.textContent = `Использовано: Frontend ${totalFrontend}, Backend ${totalBackend}`;
  checkoutBtn.disabled = cart.length === 0;
}

function openCart() {
  document.getElementById("cartModal").classList.add("active");
}
function closeCart() {
  document.getElementById("cartModal").classList.remove("active");
}

// ===== ОТПРАВКА В MATTERMOST =====
async function checkout() {
  try {
    const user = tg.initDataUnsafe?.user || {};
    
    // Поддержка обратной совместимости: используем webhookUrl из существующего config.js
    const mattermostWebhookUrl = cfg.webhookUrl || "https://example.com/hooks/xxx";
    
    if (!mattermostWebhookUrl || mattermostWebhookUrl === "https://example.com/hooks/xxx") {
      tg.showPopup({ title: "Ошибка", message: "Не настроен URL для отправки в Mattermost" });
      return;
    }

    if (cart.length === 0) {
      tg.showPopup({ title: "Ошибка", message: "Корзина пуста" });
      return;
    }

    // Формируем сообщение для Mattermost - только нумерованный список продуктов
    const messageText = cart.map((item, index) => {
      return `${index + 1}. ${item.product.name}`;
    }).join('\n');

    const response = await fetch(mattermostWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: messageText,
        username: "OmniQ",
        icon_url: "https://raw.githubusercontent.com/mattermost/mattermost/master/branding/icons/icon_36x36.png"
      })
    });

    if (response.ok || response.status === 200 || response.status === 201) {
      // Очищаем корзину после успешной отправки
      cart = [];
      frontendBalance = cfg.frontendBalance ?? 0;
      backendBalance = cfg.backendBalance ?? 0;
      updateBalanceDisplay();
      renderProducts();
      updateCart();
      closeCart();

      tg.showPopup({ title: "Успех", message: "План успешно отправлен в Mattermost!" });
    } else {
      throw new Error("Mattermost request failed: " + response.status);
    }
  } catch (err) {
    console.error("Mattermost отправка ошибка:", err);
    tg.showPopup({ 
      title: "Ошибка отправки", 
      message: "Не удалось отправить план в Mattermost. Проверьте URL вебхука." 
    });
  }
}

// ===== ЗАПУСК =====
document.addEventListener("DOMContentLoaded", initApp);
window.removeFromCart = removeFromCart;