<script lang="ts">
  import { onMount } from "svelte";
  import { supabase } from "$lib/supabaseClient";
  import { goto } from "$app/navigation";

  interface Product {
    id: number;
    name: string;
    price: number;
    stock: number;
    image: string | null;
    created_at?: string;
  }

  interface User {
    id: string;
    username: string;
    email: string;
    role: "admin" | "santri";
  }

  interface Entry {
    id?: number;
    name: string;
    amount: number;
    kind: "pemasukan" | "pengeluaran";
    user_id: string;
    date: string;
  }

  interface CartItem {
    product: Product;
    qty: number;
  }

  interface PurchaseHistory {
    id?: number;
    name: string;
    amount: number;
    user_id: string;
    date: string;
    username?: string;
  }

  type Section = "market" | "products" | "history" | "finance";
  type Category = "Semua" | "Jajanan" | "Barang" | "Tea";

  const APP_TIME_ZONE = "Asia/Jakarta";

  let activeSection: Section = "market";
  let sidebarOpen = false;
  let products: Product[] = [];
  let users: User[] = [];
  let cart: CartItem[] = [];
  let history: PurchaseHistory[] = [];
  let financeEntries: Entry[] = [];

  let currentUser: User | null = null;
  let currentDate = "";
  let message = "";
  let loading = false;
  let productLoading = false;
  let historyLoading = false;
  let financeLoading = false;

  let categoryFilter: Category = "Semua";
  let productSearch = "";
  let historyDate = "";
  let financeDate = "";

  let showCart = false;
  let showCheckout = false;
  let selectedUser = "";
  let selectedUserBalance = 0;
  let balanceLoading = false;
  let userSearch = "";

  let showProductModal = false;
  let showDeleteModal = false;
  let editingProductId: number | null = null;
  let deletingProduct: Product | null = null;

  let productForm = {
    name: "",
    price: "",
    stock: "",
    image: ""
  };

  let balanceCache = new Map<string, number>();
  let balanceRequestId = 0;

  function getJakartaDate(): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: APP_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());

    const year = parts.find((p) => p.type === "year")?.value ?? "";
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    const day = parts.find((p) => p.type === "day")?.value ?? "";
    return `${year}-${month}-${day}`;
  }

  function todayDate() {
    return getJakartaDate();
  }

  function updateCurrentDate() {
    currentDate = getJakartaDate();
  }

  function formatRupiah(value: number) {
    return new Intl.NumberFormat("id-ID").format(Number(value) || 0);
  }

  function formatDate(date: string) {
    if (!date) return "-";
    const [year, month, day] = date.split("-").map(Number);
    if (!year || !month || !day) return "-";
    const value = new Date(`${date}T00:00:00+07:00`);
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: APP_TIME_ZONE,
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(value);
  }

  function formatDateShort(date: string) {
    if (!date) return "-";
    const value = new Date(`${date}T00:00:00+07:00`);
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: APP_TIME_ZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(value);
  }

  function productCategory(product: Product): Exclude<Category, "Semua"> {
    const name = product.name.toLowerCase();

    if (
      name.includes("tea") ||
      name.includes("teh") ||
      name.includes("matcha")
    ) return "Tea";

    if (
      name.includes("coffee") ||
      name.includes("kopi") ||
      name.includes("latte") ||
      name.includes("americano") ||
      name.includes("espresso") ||
      name.includes("cappuccino") ||
      name.includes("mocha")
    ) return "Jajanan";

    return "Barang";
  }

  $: productKeyword = productSearch.toLowerCase().trim();
  $: availableProducts = products.filter((p) => Number(p.stock) > 0);

  $: filteredProducts = availableProducts.filter((product) => {
    const matchesSearch = !productKeyword ||
      product.name.toLowerCase().includes(productKeyword);
    const matchesCategory =
      categoryFilter === "Semua" ||
      productCategory(product) === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  $: filteredHistory = history.filter((item) =>
    !historyDate || item.date === historyDate
  );

  $: cartTotal = cart.reduce(
    (sum, item) => sum + Number(item.product.price) * item.qty,
    0
  );

  $: cartCount = cart.reduce((sum, item) => sum + item.qty, 0);

  $: filteredFinanceEntries = financeDate
    ? financeEntries.filter((entry) => entry.date === financeDate)
    : financeEntries;

  function isSaleEntry(entry: Entry) {
    return (
      entry.kind === "pengeluaran" &&
      entry.name.trim().toLowerCase().startsWith("beli ")
    );
  }

  $: financeSales = filteredFinanceEntries
    .filter(isSaleEntry)
    .reduce((sum, entry) => sum + Number(entry.amount), 0);

  $: financeExpenses = filteredFinanceEntries
    .filter((entry) => entry.kind === "pengeluaran" && !isSaleEntry(entry))
    .reduce((sum, entry) => sum + Number(entry.amount), 0);

  $: financeIncome = filteredFinanceEntries
    .filter((entry) => entry.kind === "pemasukan")
    .reduce((sum, entry) => sum + Number(entry.amount), 0);

  $: financeNet = financeSales + financeIncome - financeExpenses;

  $: filteredUsers = users.filter((user) =>
    user.username.toLowerCase().includes(userSearch.toLowerCase().trim())
  );

  $: selectedSantri = users.find(
    (user) => String(user.id) === String(selectedUser)
  ) || null;

  function changeSection(section: Section) {
    activeSection = section;
    sidebarOpen = false;
    showCart = false;

    if (section === "history") void loadHistory();
    if (section === "finance") void loadFinanceEntries();

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  function closeSidebar() {
    sidebarOpen = false;
  }

  function openCart() {
    showCart = true;
  }

  function closeCart() {
    showCart = false;
  }

  function addToCart(product: Product) {
    if (Number(product.stock) <= 0) {
      alert("Stock habis");
      return;
    }

    const existing = cart.find((item) => item.product.id === product.id);

    if (existing) {
      if (existing.qty >= Number(product.stock)) {
        alert("Stock tidak cukup");
        return;
      }

      cart = cart.map((item) =>
        item.product.id === product.id
          ? { ...item, qty: item.qty + 1 }
          : item
      );
      return;
    }

    cart = [...cart, { product, qty: 1 }];
  }

  function increaseCart(productId: number) {
    const item = cart.find((i) => i.product.id === productId);
    const latest = products.find((p) => p.id === productId);
    if (!item || !latest) return;

    if (item.qty >= Number(latest.stock)) {
      alert("Stock tidak cukup");
      return;
    }

    cart = cart.map((i) =>
      i.product.id === productId ? { ...i, qty: i.qty + 1 } : i
    );
  }

  function decreaseCart(productId: number) {
    const item = cart.find((i) => i.product.id === productId);
    if (!item) return;

    if (item.qty <= 1) {
      removeFromCart(productId);
      return;
    }

    cart = cart.map((i) =>
      i.product.id === productId ? { ...i, qty: i.qty - 1 } : i
    );
  }

  function removeFromCart(productId: number) {
    cart = cart.filter((i) => i.product.id !== productId);
  }

  async function loadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("id,name,price,stock,image,created_at")
      .order("id", { ascending: false });

    if (error) {
      message = error.message;
      return;
    }

    products = (data || []) as Product[];
  }

  async function loadUsers() {
    const { data, error } = await supabase
      .from("users")
      .select("id,username,email,role")
      .eq("role", "santri")
      .order("username");

    if (error) {
      console.error(error.message);
      return;
    }

    users = (data || []) as User[];
  }

  async function loadUserBalance(
    userId: string,
    forceRefresh = false
  ): Promise<number | null> {
    if (!userId) return 0;

    if (!forceRefresh && balanceCache.has(userId)) {
      return balanceCache.get(userId) ?? 0;
    }

    const requestId = ++balanceRequestId;
    balanceLoading = true;

    try {
      const { data: entries, error } = await supabase
        .from("entries")
        .select("amount,kind")
        .eq("user_id", userId);

      if (error) {
        console.error(error.message);
        return null;
      }

      const balance = (entries || []).reduce((total, entry) => {
        const amount = Number(entry.amount) || 0;
        return entry.kind === "pemasukan"
          ? total + amount
          : total - amount;
      }, 0);

      balanceCache = new Map(balanceCache).set(userId, balance);

      if (requestId === balanceRequestId && selectedUser === userId) {
        selectedUserBalance = balance;
      }

      return balance;
    } finally {
      if (requestId === balanceRequestId) balanceLoading = false;
    }
  }

  async function handleSelectUser(userId: string) {
    selectedUser = userId;

    if (!userId) {
      selectedUserBalance = 0;
      balanceLoading = false;
      balanceRequestId += 1;
      return;
    }

    const cached = balanceCache.get(userId);
    if (cached !== undefined) {
      balanceRequestId += 1;
      balanceLoading = false;
      selectedUserBalance = cached;
      return;
    }

    selectedUserBalance = 0;
    await loadUserBalance(userId);
  }

  function openCheckout() {
    if (!cart.length) {
      alert("Keranjang masih kosong");
      return;
    }

    selectedUser = "";
    selectedUserBalance = 0;
    userSearch = "";
    balanceRequestId += 1;
    showCheckout = true;
  }

  function closeCheckout() {
    if (loading) return;
    showCheckout = false;
    selectedUser = "";
    selectedUserBalance = 0;
    userSearch = "";
    balanceRequestId += 1;
  }

  async function checkout() {
    if (loading) return;

    if (!selectedUser) {
      alert("Pilih santri terlebih dahulu");
      return;
    }

    if (!cart.length) {
      alert("Keranjang kosong");
      return;
    }

    loading = true;

    try {
      const santri = users.find(
        (user) => String(user.id) === String(selectedUser)
      );

      if (!santri) {
        alert("Santri tidak ditemukan");
        return;
      }

      const saldo = await loadUserBalance(selectedUser, true);
      if (saldo === null) {
        alert("Gagal mengambil saldo santri");
        return;
      }

      const productIds = cart.map((item) => item.product.id);

      const { data: latestProducts, error: stockReadError } = await supabase
        .from("products")
        .select("id,name,price,stock,image")
        .in("id", productIds);

      if (stockReadError) {
        alert(stockReadError.message);
        return;
      }

      const latestById = new Map(
        (latestProducts || []).map((product) => [
          Number(product.id),
          product as Product
        ])
      );

      for (const item of cart) {
        const latest = latestById.get(item.product.id);

        if (!latest) {
          alert(`Produk ${item.product.name} tidak ditemukan`);
          return;
        }

        if (Number(latest.stock) < item.qty) {
          alert(`Stock ${latest.name} tidak cukup`);
          return;
        }
      }

      const purchaseDate = todayDate();

      const entryRows = cart.map((item) => ({
        name: `Beli ${item.product.name} x${item.qty}`,
        amount: Number(item.product.price) * item.qty,
        kind: "pengeluaran" as const,
        user_id: santri.id,
        date: purchaseDate
      }));

      const { data: insertedEntries, error: entryError } = await supabase
        .from("entries")
        .insert(entryRows)
        .select("id");

      if (entryError) {
        alert(entryError.message);
        return;
      }

      const insertedIds = (insertedEntries || [])
        .map((entry) => entry.id)
        .filter(Boolean);

      const stockResults = await Promise.all(
        cart.map(async (item) => {
          const latest = latestById.get(item.product.id);
          if (!latest) return { ok: false, message: "Produk tidak ditemukan" };

          const newStock = Number(latest.stock) - item.qty;

          const { data: updated, error } = await supabase
            .from("products")
            .update({ stock: newStock })
            .eq("id", item.product.id)
            .eq("stock", Number(latest.stock))
            .select("id,stock")
            .maybeSingle();

          if (error) {
            return {
              ok: false,
              message: `Gagal mengubah stock ${latest.name}: ${error.message}`
            };
          }

          if (!updated) {
            return {
              ok: false,
              message: `Stock ${latest.name} baru saja berubah. Silakan coba lagi.`
            };
          }

          return {
            ok: true,
            productId: item.product.id,
            previousStock: Number(latest.stock)
          };
        })
      );

      const failed = stockResults.find((result) => !result.ok);

      if (failed) {
        if (insertedIds.length) {
          await supabase.from("entries").delete().in("id", insertedIds);
        }

        for (const result of stockResults) {
          if (
            result.ok &&
            result.productId !== undefined &&
            result.previousStock !== undefined
          ) {
            const qty =
              cart.find((item) => item.product.id === result.productId)?.qty || 0;

            await supabase
              .from("products")
              .update({ stock: result.previousStock })
              .eq("id", result.productId)
              .eq("stock", result.previousStock - qty);
          }
        }

        alert(failed.message);
        await loadProducts();
        return;
      }

      balanceCache = new Map(balanceCache).set(
        selectedUser,
        saldo - cartTotal
      );

      cart = [];
      selectedUser = "";
      selectedUserBalance = 0;
      showCheckout = false;
      showCart = false;

      await Promise.all([
        loadProducts(),
        loadHistory(),
        loadFinanceEntries()
      ]);

      activeSection = "history";
      alert(`Pembayaran berhasil untuk ${santri.username}`);
    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan saat checkout");
    } finally {
      loading = false;
    }
  }

  async function loadHistory() {
    historyLoading = true;

    try {
      const { data, error } = await supabase
        .from("entries")
        .select("id,name,amount,user_id,date")
        .eq("kind", "pengeluaran")
        .ilike("name", "Beli %")
        .order("date", { ascending: false })
        .order("id", { ascending: false });

      if (error) {
        history = [];
        return;
      }

      const userMap = new Map(
        users.map((user) => [String(user.id), user.username])
      );

      history = (data || []).map((item) => ({
        id: item.id,
        name: item.name,
        amount: Number(item.amount),
        user_id: item.user_id,
        date: item.date,
        username: userMap.get(String(item.user_id)) || "Santri"
      }));
    } finally {
      historyLoading = false;
    }
  }

  async function loadFinanceEntries() {
    financeLoading = true;

    try {
      const { data, error } = await supabase
        .from("entries")
        .select("id,name,amount,kind,user_id,date")
        .order("date", { ascending: false })
        .order("id", { ascending: false });

      if (error) {
        financeEntries = [];
        console.error(error.message);
        return;
      }

      financeEntries = (data || []).map((item) => ({
        id: item.id,
        name: item.name,
        amount: Number(item.amount) || 0,
        kind: item.kind,
        user_id: item.user_id,
        date: item.date
      })) as Entry[];
    } finally {
      financeLoading = false;
    }
  }

  function csvCell(value: string | number) {
    return `"${String(value).replace(/"/g, '""')}"`;
  }

  function exportFinanceCSV() {
    const rows = [
      ["Tanggal", "Jenis", "Keterangan", "Jumlah"],
      ...filteredFinanceEntries.map((entry) => [
        entry.date,
        isSaleEntry(entry)
          ? "Pemasukan / Penjualan"
          : entry.kind === "pemasukan"
            ? "Pemasukan"
            : "Pengeluaran",
        entry.name,
        entry.amount
      ]),
      [],
      ["", "", "Total Penjualan", financeSales],
      ["", "", "Pemasukan Lain", financeIncome],
      ["", "", "Total Pengeluaran", financeExpenses],
      ["", "", financeNet >= 0 ? "Untung Bersih" : "Rugi Bersih", financeNet]
    ];

    const csv = rows
      .map((row) => row.map((value) => csvCell(value ?? "")).join(","))
      .join("\n");

    const blob = new Blob(["\ufeff" + csv], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rekap-keuangan-${financeDate || "semua-tanggal"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function openAddProduct() {
    editingProductId = null;
    productForm = { name: "", price: "", stock: "", image: "" };
    showProductModal = true;
  }

  function openEditProduct(product: Product) {
    editingProductId = product.id;
    productForm = {
      name: product.name,
      price: String(product.price),
      stock: String(product.stock),
      image: product.image || ""
    };
    showProductModal = true;
  }

  function closeProductModal() {
    if (productLoading) return;
    showProductModal = false;
    editingProductId = null;
  }

  async function saveProduct() {
    const name = productForm.name.trim();
    const price = Number(productForm.price);
    const stock = Number(productForm.stock);
    const image = productForm.image.trim();

    if (!name) return alert("Nama produk wajib diisi");
    if (!Number.isInteger(price) || price < 0) {
      return alert("Harga harus berupa angka bulat 0 atau lebih");
    }
    if (!Number.isInteger(stock) || stock < 0) {
      return alert("Stock harus berupa angka bulat 0 atau lebih");
    }

    productLoading = true;

    try {
      const payload = {
        name,
        price,
        stock,
        image: image || null
      };

      if (editingProductId === null) {
        const { error } = await supabase.from("products").insert([payload]);
        if (error) return alert(error.message);
      } else {
        const { error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", editingProductId);

        if (error) return alert(error.message);
      }

      showProductModal = false;
      editingProductId = null;
      await loadProducts();
    } finally {
      productLoading = false;
    }
  }

  function askDeleteProduct(product: Product) {
    deletingProduct = product;
    showDeleteModal = true;
  }

  async function deleteProduct() {
    if (!deletingProduct) return;

    productLoading = true;

    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", deletingProduct.id);

      if (error) return alert(error.message);

      cart = cart.filter((item) => item.product.id !== deletingProduct?.id);
      showDeleteModal = false;
      deletingProduct = null;
      await loadProducts();
    } finally {
      productLoading = false;
    }
  }

  function logout() {
    localStorage.removeItem("user");
    goto("/login");
  }

  onMount(async () => {
    updateCurrentDate();
    const timer = window.setInterval(updateCurrentDate, 30000);

    const storedUser = localStorage.getItem("user");

    if (!storedUser) {
      goto("/login");
      return;
    }

    try {
      currentUser = JSON.parse(storedUser);
    } catch {
      localStorage.removeItem("user");
      goto("/login");
      return;
    }

    if (currentUser?.role !== "admin") {
      alert("Akses ditolak");
      goto("/");
      return;
    }

    await Promise.all([
      loadProducts(),
      loadUsers(),
      loadHistory(),
      loadFinanceEntries()
    ]);

    return () => window.clearInterval(timer);
  });
</script>

<svelte:head>
  <title>Market Santri</title>
  <meta name="description" content="Market Santri - Belanja kebutuhan harian santri" />
</svelte:head>

<div class="app-shell">
  <!-- Burger SELALU di kiri -->
  <button
    class="burger-button"
    class:active={sidebarOpen}
    type="button"
    aria-label={sidebarOpen ? "Tutup menu" : "Buka menu"}
    aria-expanded={sidebarOpen}
    on:click={toggleSidebar}
  >
    <span></span>
    <span></span>
    <span></span>
  </button>

  {#if sidebarOpen}
    <button
      class="sidebar-backdrop"
      type="button"
      aria-label="Tutup menu"
      on:click={closeSidebar}
    ></button>
  {/if}

  <aside class="sidebar" class:open={sidebarOpen}>
    <div class="brand">
      <img src="logo.png" alt="Market Santri" />
      <div>
        <strong>Market Santri</strong>
        <small>Belanja santri</small>
      </div>
    </div>

    <nav class="nav-menu">
      <button class:active={activeSection === "market"} on:click={() => changeSection("market")}>
        <span class="nav-icon">🛒</span>
        <span>Belanja</span>
      </button>

      <button class:active={activeSection === "products"} on:click={() => changeSection("products")}>
        <span class="nav-icon">📦</span>
        <span>Produk</span>
      </button>

      <button class:active={activeSection === "history"} on:click={() => changeSection("history")}>
        <span class="nav-icon">↺</span>
        <span>History</span>
      </button>

      <button class:active={activeSection === "finance"} on:click={() => changeSection("finance")}>
        <span class="nav-icon">▣</span>
        <span>Keuangan</span>
      </button>

      <button class="cart-nav" on:click={openCart}>
        <span class="nav-icon">🛍</span>
        <span>Keranjang</span>
        {#if cartCount > 0}<b>{cartCount}</b>{/if}
      </button>
    </nav>

    <div class="sidebar-bottom">
      <div class="user-box">
        <span class="user-avatar">A</span>
        <div>
          <strong>{currentUser?.username || "Admin"}</strong>
          <small>Administrator</small>
        </div>
      </div>

      <button class="logout-button" on:click={logout}>↪ Keluar</button>
    </div>
  </aside>

  <main class="main-content">
    <header class="topbar">
      <div class="topbar-title">
        <span class="mobile-brand">Market Santri</span>
        <span class="date-label">📅 {formatDate(currentDate)}</span>
      </div>
      <div class="online-pill"><span></span> Online</div>
    </header>

    {#if message}
      <div class="alert-message">{message}</div>
    {/if}

    {#if activeSection === "market"}
      <section class="page">
        <div class="hero">
          <div class="hero-overlay">
            <p class="hero-kicker">MARKET SANTRI</p>
            <h1>Belanja kebutuhan harian santri</h1>
            <p>Praktis, mudah, dan harga terjangkau.</p>
          </div>
        </div>

        <div class="section-heading">
          <div>
            <span class="eyebrow">KATALOG</span>
            <h2>Pilih kebutuhanmu</h2>
          </div>

          <button class="cart-top-button" on:click={openCart}>
            🛒 Keranjang
            {#if cartCount > 0}<span>{cartCount}</span>{/if}
          </button>
        </div>

        <div class="toolbar">
          <div class="category-tabs">
            {#each ["Semua", "Jajanan", "Barang", "Tea"] as category}
              <button
                class:active={categoryFilter === category}
                on:click={() => categoryFilter = category as Category}
              >
                {category}
              </button>
            {/each}
          </div>

          <label class="search-box">
            <span>⌕</span>
            <input bind:value={productSearch} placeholder="Cari produk..." />
          </label>
        </div>

        {#if filteredProducts.length === 0}
          <div class="empty-state">
            <div>📦</div>
            <h3>Produk tidak ditemukan</h3>
            <p>Coba ubah kategori atau kata pencarian.</p>
          </div>
        {:else}
          <div class="product-grid">
            {#each filteredProducts as product}
              <article class="product-card">
                <div class="product-image-wrap">
                  {#if product.image}
                    <img src={product.image} alt={product.name} class="product-image" />
                  {:else}
                    <div class="image-placeholder">📦</div>
                  {/if}
                </div>

                <div class="product-info">
                  <span class="product-category">{productCategory(product)}</span>
                  <h3>{product.name}</h3>
                  <div class="product-price">Rp {formatRupiah(product.price)}</div>
                  <div class="stock-text">Stock {product.stock}</div>

                  <div class="quantity-row">
                    <span>Jumlah</span>
                    <span class="qty-preview">1</span>
                  </div>

                  <button class="primary-button full" on:click={() => addToCart(product)}>
                    🛒 + Tambah
                  </button>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    {#if activeSection === "products"}
      <section class="page">
        <div class="page-header">
          <div>
            <span class="eyebrow">MANAJEMEN</span>
            <h1>Produk</h1>
            <p>Kelola nama, harga, stock, dan gambar produk.</p>
          </div>
          <button class="primary-button" on:click={openAddProduct}>＋ Tambah Produk</button>
        </div>

        <div class="admin-table-card">
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Produk</th>
                  <th>Kategori</th>
                  <th>Harga</th>
                  <th>Stock</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {#each products as product}
                  <tr>
                    <td>
                      <div class="table-product">
                        {#if product.image}
                          <img src={product.image} alt={product.name} />
                        {:else}<div class="mini-placeholder">📦</div>{/if}
                        <strong>{product.name}</strong>
                      </div>
                    </td>
                    <td><span class="category-badge">{productCategory(product)}</span></td>
                    <td>Rp {formatRupiah(product.price)}</td>
                    <td>{product.stock}</td>
                    <td>
                      <div class="action-row">
                        <button class="small-button edit" on:click={() => openEditProduct(product)}>Edit</button>
                        <button class="small-button danger" on:click={() => askDeleteProduct(product)}>Hapus</button>
                      </div>
                    </td>
                  </tr>
                {:else}
                  <tr><td colspan="5" class="table-empty">Belum ada produk.</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    {/if}

    {#if activeSection === "history"}
      <section class="page">
        <div class="page-header">
          <div>
            <span class="eyebrow">TRANSAKSI</span>
            <h1>History Pembelian</h1>
            <p>Daftar pembelian yang dilakukan untuk santri.</p>
          </div>
          <div class="date-filter">
            <label>Tanggal</label>
            <input type="date" bind:value={historyDate} />
            {#if historyDate}<button on:click={() => historyDate = ""}>Reset</button>{/if}
          </div>
        </div>

        <div class="admin-table-card">
          {#if historyLoading}
            <div class="loading-state">Memuat history...</div>
          {:else}
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Santri</th>
                    <th>Transaksi</th>
                    <th>Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {#each filteredHistory as item}
                    <tr>
                      <td>{formatDateShort(item.date)}</td>
                      <td><strong>{item.username}</strong></td>
                      <td>{item.name}</td>
                      <td class="money">Rp {formatRupiah(item.amount)}</td>
                    </tr>
                  {:else}
                    <tr><td colspan="4" class="table-empty">Belum ada transaksi.</td></tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </section>
    {/if}

    {#if activeSection === "finance"}
      <section class="page">
        <div class="page-header">
          <div>
            <span class="eyebrow">LAPORAN</span>
            <h1>Rekap Keuangan</h1>
            <p>Ringkasan penjualan, pemasukan, pengeluaran, dan hasil bersih.</p>
          </div>

          <div class="finance-actions">
            <label class="date-filter">
              <span>Tanggal</span>
              <input type="date" bind:value={financeDate} />
            </label>
            {#if financeDate}
              <button class="secondary-button" on:click={() => financeDate = ""}>Semua Tanggal</button>
            {/if}
            <button class="primary-button" on:click={exportFinanceCSV}>↓ Export Rekap</button>
          </div>
        </div>

        <div class="finance-grid">
          <div class="finance-card blue">
            <span>Total Penjualan</span>
            <strong>Rp {formatRupiah(financeSales)}</strong>
            <small>Transaksi checkout</small>
          </div>
          <div class="finance-card cyan">
            <span>Pemasukan Lain</span>
            <strong>Rp {formatRupiah(financeIncome)}</strong>
            <small>Pemasukan tercatat</small>
          </div>
          <div class="finance-card orange">
            <span>Total Pengeluaran</span>
            <strong>Rp {formatRupiah(financeExpenses)}</strong>
            <small>Biaya usaha tercatat</small>
          </div>
          <div class:loss={financeNet < 0} class="finance-card green">
            <span>{financeNet >= 0 ? "Untung Bersih" : "Rugi Bersih"}</span>
            <strong>Rp {formatRupiah(Math.abs(financeNet))}</strong>
            <small>Penjualan + pemasukan − pengeluaran</small>
          </div>
        </div>

        <div class="note-box">
          <strong>Catatan pembukuan</strong>
          <p>
            Checkout <b>Beli ...</b> dihitung sebagai penjualan. Karena tabel produk belum
            menyimpan harga modal/HPP, angka untung/rugi di sini adalah hasil bersih dari
            penjualan dan pengeluaran yang tercatat, bukan laba kotor berdasarkan HPP.
          </p>
        </div>

        <div class="admin-table-card">
          <div class="card-heading">
            <div>
              <h3>Detail Transaksi</h3>
              <span>{filteredFinanceEntries.length} transaksi</span>
            </div>
            <button class="icon-button" on:click={() => loadFinanceEntries()} aria-label="Refresh">↻</button>
          </div>

          {#if financeLoading}
            <div class="loading-state">Memuat rekap keuangan...</div>
          {:else}
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Jenis</th>
                    <th>Keterangan</th>
                    <th>Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {#each filteredFinanceEntries as entry}
                    <tr>
                      <td>{formatDateShort(entry.date)}</td>
                      <td>
                        <span class:income={isSaleEntry(entry) || entry.kind === "pemasukan"} class="type-badge">
                          {isSaleEntry(entry) || entry.kind === "pemasukan" ? "Pemasukan" : "Pengeluaran"}
                        </span>
                      </td>
                      <td>{entry.name}</td>
                      <td class:positive={isSaleEntry(entry) || entry.kind === "pemasukan"} class="money">
                        {isSaleEntry(entry) || entry.kind === "pemasukan" ? "+" : "-"} Rp {formatRupiah(entry.amount)}
                      </td>
                    </tr>
                  {:else}
                    <tr><td colspan="4" class="table-empty">Belum ada transaksi keuangan.</td></tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </section>
    {/if}
  </main>

  <button
    class="floating-cart"
    class:has-items={cartCount > 0}
    type="button"
    aria-label="Buka keranjang"
    on:click={openCart}
  >
    <span class="floating-cart-icon">🛒</span>
    {#if cartCount > 0}
      <span class="floating-cart-count">{cartCount}</span>
    {/if}
  </button>

  {#if showCart}
    <div class="modal-layer" role="presentation" on:click={(event) => event.target === event.currentTarget && closeCart()}>
      <div class="cart-drawer" role="dialog" aria-modal="true">
        <div class="drawer-header">
          <div>
            <span class="eyebrow">BELANJA</span>
            <h2>Keranjang</h2>
          </div>
          <button class="close-button" on:click={closeCart}>×</button>
        </div>

        {#if cart.length === 0}
          <div class="drawer-empty">
            <div>🛒</div>
            <h3>Keranjang kosong</h3>
            <p>Tambahkan produk dari halaman belanja.</p>
          </div>
        {:else}
          <div class="cart-list">
            {#each cart as item}
              <div class="cart-item">
                {#if item.product.image}
                  <img src={item.product.image} alt={item.product.name} />
                {:else}<div class="cart-image-placeholder">📦</div>{/if}
                <div class="cart-item-info">
                  <strong>{item.product.name}</strong>
                  <span>Rp {formatRupiah(item.product.price)}</span>
                  <div class="cart-controls">
                    <button on:click={() => decreaseCart(item.product.id)}>−</button>
                    <b>{item.qty}</b>
                    <button on:click={() => increaseCart(item.product.id)}>+</button>
                  </div>
                </div>
                <div class="cart-item-total">Rp {formatRupiah(item.product.price * item.qty)}</div>
                <button class="remove-button" on:click={() => removeFromCart(item.product.id)}>×</button>
              </div>
            {/each}
          </div>

          <div class="cart-summary">
            <span>Total</span>
            <strong>Rp {formatRupiah(cartTotal)}</strong>
          </div>

          <button class="primary-button full checkout-button" on:click={openCheckout}>Lanjut Checkout</button>
        {/if}
      </div>
    </div>
  {/if}

  {#if showCheckout}
    <div class="modal-layer" role="presentation">
      <div class="checkout-modal" role="dialog" aria-modal="true">
        <div class="drawer-header">
          <div>
            <span class="eyebrow">PEMBAYARAN</span>
            <h2>Checkout</h2>
          </div>
          <button class="close-button" on:click={closeCheckout}>×</button>
        </div>

        <div class="checkout-total">
          <span>Total belanja</span>
          <strong>Rp {formatRupiah(cartTotal)}</strong>
        </div>

        <label class="form-label">
          Cari santri
          <input
            class="form-input"
            bind:value={userSearch}
            placeholder="Ketik nama santri..."
            autocomplete="off"
          />
        </label>

        <div class="santri-search-list">
          {#if filteredUsers.length === 0}
            <div class="santri-search-empty">Santri tidak ditemukan.</div>
          {:else}
            {#each filteredUsers.slice(0, 8) as user}
              <button
                type="button"
                class="santri-option"
                class:selected={String(selectedUser) === String(user.id)}
                on:click={() => handleSelectUser(user.id)}
              >
                <span class="santri-avatar">{user.username.charAt(0).toUpperCase()}</span>
                <span class="santri-option-text">
                  <strong>{user.username}</strong>
                  <small>{user.email}</small>
                </span>
                {#if String(selectedUser) === String(user.id)}
                  <span class="santri-check">✓</span>
                {/if}
              </button>
            {/each}
          {/if}
        </div>

        {#if selectedSantri}
          <div class="selected-santri">
            <span>Santri terpilih</span>
            <strong>{selectedSantri.username}</strong>
          </div>
        {/if}

        {#if selectedUser}
          <div class="balance-box">
            <span>Saldo santri</span>
            {#if balanceLoading}
              <strong>Memuat...</strong>
            {:else}
              <strong class:negative={selectedUserBalance < 0}>
                Rp {formatRupiah(selectedUserBalance)}
              </strong>
            {/if}
          </div>
        {/if}

        <p class="checkout-note">
          Jika saldo kurang dari total belanja, selisihnya akan tercatat sebagai saldo negatif/utang.
        </p>

        <button class="primary-button full" disabled={loading} on:click={checkout}>
          {loading ? "Memproses..." : "Konfirmasi Pembayaran"}
        </button>
      </div>
    </div>
  {/if}

  {#if showProductModal}
    <div class="modal-layer" role="presentation">
      <div class="form-modal" role="dialog" aria-modal="true">
        <div class="drawer-header">
          <div>
            <span class="eyebrow">PRODUK</span>
            <h2>{editingProductId === null ? "Tambah Produk" : "Edit Produk"}</h2>
          </div>
          <button class="close-button" on:click={closeProductModal}>×</button>
        </div>

        <label class="form-label">Nama produk
          <input class="form-input" bind:value={productForm.name} placeholder="Contoh: Kopi Susu" />
        </label>
        <label class="form-label">Harga
          <input class="form-input" type="number" min="0" bind:value={productForm.price} placeholder="20000" />
        </label>
        <label class="form-label">Stock
          <input class="form-input" type="number" min="0" bind:value={productForm.stock} placeholder="10" />
        </label>
        <label class="form-label">URL gambar
          <input class="form-input" bind:value={productForm.image} placeholder="https://..." />
        </label>

        <button class="primary-button full" disabled={productLoading} on:click={saveProduct}>
          {productLoading ? "Menyimpan..." : "Simpan Produk"}
        </button>
      </div>
    </div>
  {/if}

  {#if showDeleteModal && deletingProduct}
    <div class="modal-layer" role="presentation">
      <div class="confirm-modal" role="dialog" aria-modal="true">
        <div class="confirm-icon">!</div>
        <h2>Hapus produk?</h2>
        <p>Produk <strong>{deletingProduct.name}</strong> akan dihapus dari katalog.</p>
        <div class="confirm-actions">
          <button class="secondary-button" on:click={() => showDeleteModal = false}>Batal</button>
          <button class="danger-button" disabled={productLoading} on:click={deleteProduct}>Hapus</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(*) { box-sizing: border-box; }
  :global(html) { scroll-behavior: smooth; }
  :global(body) {
    margin: 0;
    min-width: 320px;
    background: #eef5fb;
    color: #294f69;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  :global(button), :global(input), :global(select) { font: inherit; }

  .app-shell {
    min-height: 100vh;
    background: linear-gradient(135deg, #f7fbff 0%, #eaf3fa 100%);
  }

  .sidebar {
    position: fixed;
    z-index: 100;
    left: 0;
    top: 0;
    bottom: 0;
    width: 270px;
    padding: 28px 18px 20px;
    display: flex;
    flex-direction: column;
    background: rgba(255,255,255,.96);
    border-right: 1px solid #d4e5f2;
    box-shadow: 8px 0 30px rgba(60,145,205,.08);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 12px 26px 62px;
  }
  .brand img {
    width: 46px;
    height: 46px;
    object-fit: contain;
    border-radius: 14px;
  }
  .brand strong {
    display: block;
    color: #0e3f66;
    font-size: 20px;
    letter-spacing: -.4px;
  }
  .brand small {
    color: #7f9bb0;
    font-size: 11px;
  }

  .burger-button {
    position: fixed;
    z-index: 140;
    left: 16px;
    top: 18px;
    width: 44px;
    height: 44px;
    border: 1px solid #d3e5f1;
    border-radius: 13px;
    background: #e6f1f9;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    box-shadow: 0 8px 20px rgba(54,155,218,.12);
  }
  .burger-button span {
    width: 20px;
    height: 2.5px;
    border-radius: 5px;
    background: #0e3f66;
    transition: .2s;
  }
  .burger-button.active span:nth-child(1) { transform: translateY(7.5px) rotate(45deg); }
  .burger-button.active span:nth-child(2) { opacity: 0; }
  .burger-button.active span:nth-child(3) { transform: translateY(-7.5px) rotate(-45deg); }

  .nav-menu {
    display: grid;
    gap: 7px;
  }
  .nav-menu button {
    position: relative;
    width: 100%;
    border: 0;
    background: transparent;
    color: #365b72;
    border-radius: 15px;
    padding: 13px 15px;
    display: flex;
    align-items: center;
    gap: 13px;
    text-align: left;
    cursor: pointer;
    font-weight: 650;
    transition: .2s;
  }
  .nav-menu button:hover {
    background: #eaf3fa;
    color: #0e3f66;
  }
  .nav-menu button.active {
    background: #dcebf6;
    color: #0e3f66;
  }
  .nav-icon {
    width: 27px;
    text-align: center;
    font-size: 19px;
  }
  .cart-nav b {
    margin-left: auto;
    min-width: 23px;
    padding: 3px 7px;
    border-radius: 20px;
    background: #0e3f66;
    color: white;
    text-align: center;
    font-size: 11px;
  }

  .sidebar-bottom {
    margin-top: auto;
    display: grid;
    gap: 10px;
  }
  .user-box {
    padding: 12px;
    display: flex;
    gap: 10px;
    align-items: center;
    background: #f2f7fb;
    border: 1px solid #d8e8f2;
    border-radius: 15px;
  }
  .user-avatar {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 11px;
    background: #0e3f66;
    color: white;
    font-weight: 800;
  }
  .user-box strong, .user-box small { display: block; }
  .user-box strong { font-size: 13px; color: #315d7d; }
  .user-box small { margin-top: 2px; color: #8099aa; font-size: 10px; }
  .logout-button {
    border: 0;
    padding: 11px;
    border-radius: 13px;
    background: #e6f1f9;
    color: #0e3f66;
    font-weight: 700;
    cursor: pointer;
  }

  .main-content {
    margin-left: 270px;
    min-height: 100vh;
  }

  .topbar {
    height: 80px;
    padding: 0 36px 0 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(255,255,255,.84);
    border-bottom: 1px solid #d8e7f1;
    backdrop-filter: blur(12px);
  }
  .topbar-title {
    display: flex;
    align-items: center;
    gap: 20px;
  }
  .mobile-brand { display: none; color: #0e3f66; font-size: 20px; font-weight: 800; }
  .date-label { color: #6d879b; font-size: 13px; }
  .online-pill {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px 13px;
    border: 1px solid #d4e4ee;
    border-radius: 999px;
    color: #4f7188;
    background: #f3f8fc;
    font-size: 12px;
    font-weight: 700;
  }
  .online-pill span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #39b878;
  }

  .page {
    width: min(1480px, calc(100% - 64px));
    margin: 0 auto;
    padding: 32px 0 60px;
  }

  .hero {
    min-height: 270px;
    overflow: hidden;
    border-radius: 25px;
    background:
      linear-gradient(90deg, rgb(0, 37, 58), rgba(0, 5, 8, 0.908)),
      url("/logo.png") center/cover;
    box-shadow: 0 15px 35px rgba(43,139,194,.13);
  }
  .hero-overlay {
    min-height: 270px;
    max-width: 650px;
    padding: 48px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    color: white;
  }
  .hero-kicker {
    margin: 0 0 9px;
    font-size: 12px;
    letter-spacing: 2px;
    font-weight: 800;
    opacity: .9;
  }
  .hero h1 {
    margin: 0;
    font-size: clamp(28px, 4vw, 46px);
    line-height: 1.05;
    letter-spacing: -1.5px;
  }
  .hero p:last-child {
    margin: 14px 0 0;
    font-size: 16px;
    opacity: .94;
  }

  .section-heading, .page-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    margin: 28px 0 18px;
  }
  .eyebrow {
    display: block;
    color: #0e3f66;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 1.8px;
    margin-bottom: 5px;
  }
  h1, h2, h3, p { margin-top: 0; }
  .section-heading h2, .page-header h1 {
    margin-bottom: 0;
    color: #2b5675;
    letter-spacing: -.8px;
  }
  .page-header p { margin: 5px 0 0; color: #7b94a7; font-size: 13px; }

  .cart-top-button, .primary-button, .secondary-button, .small-button,
  .date-filter button, .icon-button {
    border: 0;
    cursor: pointer;
    font-weight: 750;
    transition: transform .15s, box-shadow .15s, background .15s;
  }
  .cart-top-button:hover, .primary-button:hover, .secondary-button:hover { transform: translateY(-1px); }

  .cart-top-button {
    padding: 11px 16px;
    border-radius: 12px;
    background: #dcebf6;
    color: #0e3f66;
  }
  .cart-top-button span {
    margin-left: 5px;
    padding: 2px 7px;
    border-radius: 999px;
    background: #0e3f66;
    color: white;
    font-size: 11px;
  }

  .toolbar {
    margin-bottom: 20px;
    display: flex;
    justify-content: space-between;
    gap: 15px;
    align-items: center;
  }
  .category-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
  .category-tabs button {
    border: 1px solid #d2e3ee;
    padding: 10px 17px;
    border-radius: 999px;
    background: #e6f1f9;
    color: #526f84;
    cursor: pointer;
    font-weight: 750;
  }
  .category-tabs button.active {
    background: #0e3f66;
    border-color: #0e3f66;
    color: white;
    box-shadow: 0 8px 18px rgba(58,167,235,.2);
  }
  .floating-cart {
    position: fixed; z-index: 125; right: 22px; bottom: 22px;
    width: 58px; height: 58px; border: 0; border-radius: 50%;
    display: grid; place-items: center; background: #0e3f66; color: white;
    cursor: pointer; box-shadow: 0 12px 28px rgba(14,63,102,.28);
    transition: transform .2s ease, box-shadow .2s ease;
  }
  .floating-cart:hover { transform: translateY(-3px); box-shadow: 0 16px 32px rgba(14,63,102,.34); }
  .floating-cart-icon { font-size: 23px; line-height: 1; }
  .floating-cart-count {
    position: absolute; top: -4px; right: -2px; min-width: 22px; height: 22px;
    padding: 0 6px; display: grid; place-items: center; border-radius: 999px;
    background: #2d8ac0; color: white; border: 2px solid white; font-size: 10px; font-weight: 900;
  }

  .santri-search-list {
    display: grid; gap: 7px; max-height: 220px; overflow-y: auto; margin-top: -4px; padding: 2px;
  }
  .santri-option {
    width: 100%; border: 1px solid #d7e7f0; border-radius: 12px; padding: 9px 10px;
    display: flex; align-items: center; gap: 9px; background: white; color: #365b72;
    text-align: left; cursor: pointer; transition: .18s ease;
  }
  .santri-option:hover, .santri-option.selected { border-color: #0e3f66; background: #eef6fb; }
  .santri-avatar {
    width: 34px; height: 34px; flex: 0 0 34px; display: grid; place-items: center;
    border-radius: 10px; background: #0e3f66; color: white; font-size: 13px; font-weight: 900;
  }
  .santri-option-text { min-width: 0; display: grid; gap: 2px; flex: 1; }
  .santri-option-text strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #294f69; font-size: 12px; }
  .santri-option-text small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #8198a8; font-size: 9px; }
  .santri-check { color: #0e3f66; font-weight: 900; }
  .santri-search-empty { padding: 12px; border-radius: 10px; background: #f5f9fc; color: #879ba9; font-size: 11px; text-align: center; }
  .selected-santri {
    margin-top: 10px; padding: 10px 12px; border-radius: 11px; background: #eaf3f8;
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
  }
  .selected-santri span { color: #72899b; font-size: 10px; }
  .selected-santri strong { color: #0e3f66; font-size: 12px; }

  .search-box {
    width: min(280px, 100%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 13px;
    border: 1px solid #d5e5ef;
    border-radius: 13px;
    background: white;
  }
  .search-box span { color: #5c87a4; font-size: 20px; }
  .search-box input {
    width: 100%;
    border: 0;
    outline: 0;
    color: #294f69;
    background: transparent;
  }

  .product-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 17px;
  }
  .product-card {
    min-width: 0;
    overflow: hidden;
    border: 1px solid #d8e7f0;
    border-radius: 19px;
    background: rgba(255,255,255,.94);
    box-shadow: 0 9px 26px rgba(59,133,175,.10);
    transition: transform .2s, box-shadow .2s;
  }
  .product-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 15px 32px rgba(59,133,175,.16);
  }
  .product-image-wrap {
    aspect-ratio: 1 / .83;
    margin: 10px;
    overflow: hidden;
    border-radius: 13px;
    background: #e5f0f7;
  }
  .product-image { width: 100%; height: 100%; object-fit: cover; display: block; }
  .image-placeholder, .cart-image-placeholder, .mini-placeholder {
    display: grid;
    place-items: center;
    background: #e3eff7;
    color: #5e88a3;
  }
  .image-placeholder { width: 100%; height: 100%; font-size: 36px; }
  .product-info { padding: 3px 14px 15px; }
  .product-category {
    display: inline-block;
    padding: 4px 8px;
    margin-bottom: 6px;
    border-radius: 999px;
    background: #edf4f9;
    color: #155784;
    font-size: 9px;
    font-weight: 850;
  }
  .product-info h3 {
    min-height: 38px;
    margin: 0;
    color: #294f69;
    font-size: 15px;
    line-height: 1.25;
  }
  .product-price {
    margin-top: 7px;
    color: #0e3f66;
    font-size: 15px;
    font-weight: 850;
  }
  .stock-text { margin-top: 4px; color: #8097a8; font-size: 10px; }
  .quantity-row {
    margin: 11px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #8196a5;
    font-size: 10px;
  }
  .qty-preview {
    min-width: 43px;
    padding: 5px 9px;
    border: 1px solid #d7e6ef;
    border-radius: 8px;
    background: #f6fafe;
    color: #365b72;
    text-align: center;
  }

  .primary-button {
    padding: 11px 16px;
    border-radius: 12px;
    background: #0e3f66;
    color: white;
    box-shadow: 0 8px 18px rgba(57,166,233,.18);
  }
  .primary-button.full { width: 100%; }
  .secondary-button {
    padding: 10px 14px;
    border-radius: 11px;
    background: #e4eff6;
    color: #155784;
  }
  .danger-button {
    padding: 10px 15px;
    border: 0;
    border-radius: 11px;
    background: #e26d79;
    color: white;
    font-weight: 800;
    cursor: pointer;
  }

  .admin-table-card {
    overflow: hidden;
    border: 1px solid #d7e7f0;
    border-radius: 18px;
    background: white;
    box-shadow: 0 9px 25px rgba(60,130,170,.08);
  }
  .table-scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; min-width: 680px; }
  th, td { padding: 14px 17px; border-bottom: 1px solid #e9f1f6; text-align: left; }
  th {
    background: #f3f8fc;
    color: #72899b;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .6px;
  }
  td { color: #365b72; font-size: 13px; }
  tbody tr:hover { background: #fafdff; }
  .table-product { display: flex; align-items: center; gap: 10px; }
  .table-product img, .mini-placeholder {
    width: 42px; height: 42px; border-radius: 10px; object-fit: cover;
  }
  .mini-placeholder { font-size: 18px; }
  .category-badge, .type-badge {
    display: inline-block;
    padding: 5px 8px;
    border-radius: 999px;
    background: #e6f1f9;
    color: #155784;
    font-size: 10px;
    font-weight: 800;
  }
  .type-badge.income { background: #e3f7ed; color: #23805d; }
  .action-row { display: flex; gap: 7px; }
  .small-button { padding: 7px 10px; border-radius: 8px; }
  .small-button.edit { background: #e5f0f7; color: #155784; }
  .small-button.danger { background: #fff0f1; color: #d96370; }
  .table-empty, .loading-state { padding: 38px !important; text-align: center; color: #8a9eac; }

  .date-filter {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #72899b;
    font-size: 11px;
    font-weight: 700;
  }
  .date-filter input {
    padding: 9px 11px;
    border: 1px solid #d5e5ef;
    border-radius: 10px;
    outline: 0;
    color: #365b72;
    background: white;
  }
  .finance-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }

  .finance-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 15px;
    margin-bottom: 17px;
  }
  .finance-card {
    min-height: 130px;
    padding: 20px;
    border-radius: 18px;
    border: 1px solid #d7e7f0;
    background: white;
    box-shadow: 0 8px 24px rgba(53,135,180,.08);
  }
  .finance-card span, .finance-card small { display: block; }
  .finance-card span { color: #7190a4; font-size: 12px; font-weight: 700; }
  .finance-card strong { display: block; margin: 9px 0 6px; color: #176b9e; font-size: 24px; }
  .finance-card small { color: #99adbb; font-size: 10px; }
  .finance-card.cyan strong { color: #32a9d3; }
  .finance-card.orange strong { color: #e99a52; }
  .finance-card.green strong { color: #23805d; }
  .finance-card.green.loss strong { color: #e16d7c; }

  .note-box {
    margin-bottom: 17px;
    padding: 15px 18px;
    border: 1px solid #cfeafb;
    border-radius: 15px;
    background: #e6f1f9;
    color: #54748a;
    font-size: 12px;
  }
  .note-box strong { color: #278ecb; }
  .note-box p { margin: 5px 0 0; line-height: 1.55; }

  .card-heading {
    padding: 16px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #e9f1f6;
  }
  .card-heading h3 { margin: 0; color: #345b75; font-size: 15px; }
  .card-heading span { color: #8a9eac; font-size: 10px; }
  .icon-button {
    width: 35px; height: 35px; border-radius: 9px;
    background: #e9f7ff; color: #176b9e; font-size: 18px;
  }
  .money { font-weight: 800; color: #e28a50; }
  .money.positive { color: #27a96d; }

  .empty-state {
    padding: 70px 20px;
    text-align: center;
    border: 1px dashed #cfe8f6;
    border-radius: 18px;
    background: rgba(255,255,255,.65);
  }
  .empty-state div { font-size: 40px; }
  .empty-state h3 { margin: 12px 0 5px; color: #365b72; }
  .empty-state p { color: #8aa3b3; font-size: 13px; }

  .modal-layer {
    position: fixed;
    z-index: 200;
    inset: 0;
    padding: 20px;
    display: flex;
    justify-content: flex-end;
    align-items: stretch;
    background: rgba(29,82,112,.25);
    backdrop-filter: blur(4px);
  }
  .cart-drawer {
    width: min(520px, 100%);
    height: 100%;
    padding: 25px;
    overflow-y: auto;
    border-radius: 22px;
    background: white;
    box-shadow: -15px 0 50px rgba(37,102,140,.16);
  }
  .checkout-modal, .form-modal, .confirm-modal {
    width: min(500px, 100%);
    margin: auto;
    padding: 25px;
    border-radius: 22px;
    background: white;
    box-shadow: 0 25px 60px rgba(37,102,140,.2);
  }
  .confirm-modal { text-align: center; }
  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    margin-bottom: 20px;
  }
  .drawer-header h2 { margin: 0; color: #294f69; }
  .close-button {
    width: 38px; height: 38px;
    border: 0; border-radius: 10px;
    background: #edf4f9; color: #3999d1;
    cursor: pointer; font-size: 24px;
  }
  .cart-list { display: grid; gap: 10px; }
  .cart-item {
    display: grid;
    grid-template-columns: 55px 1fr auto auto;
    gap: 10px;
    align-items: center;
    padding: 10px;
    border: 1px solid #e3f0f7;
    border-radius: 13px;
  }
  .cart-item > img, .cart-image-placeholder {
    width: 55px; height: 55px; border-radius: 10px; object-fit: cover;
  }
  .cart-item-info strong, .cart-item-info span { display: block; }
  .cart-item-info strong { color: #294f69; font-size: 12px; }
  .cart-item-info span { margin-top: 2px; color: #176b9e; font-size: 11px; font-weight: 700; }
  .cart-controls { margin-top: 7px; display: flex; align-items: center; gap: 7px; }
  .cart-controls button {
    width: 25px; height: 25px; border: 0; border-radius: 7px;
    background: #e8f6ff; color: #258dcb; cursor: pointer; font-weight: 800;
  }
  .cart-controls b { min-width: 18px; text-align: center; font-size: 11px; color: #365b72; }
  .cart-item-total { color: #294f69; font-size: 11px; font-weight: 800; white-space: nowrap; }
  .remove-button {
    border: 0; background: transparent; color: #d77d88; cursor: pointer; font-size: 20px;
  }
  .cart-summary {
    margin-top: 18px;
    padding: 16px 0;
    border-top: 1px solid #e8f2f7;
    display: flex;
    justify-content: space-between;
    color: #708da0;
  }
  .cart-summary strong { color: #176b9e; font-size: 20px; }
  .checkout-button { margin-top: 5px; }
  .drawer-empty { padding: 70px 20px; text-align: center; color: #88a0b0; }
  .drawer-empty div { font-size: 45px; }

  .checkout-total, .balance-box {
    padding: 15px;
    border-radius: 13px;
    background: #e6f1f9;
    margin-bottom: 15px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .checkout-total span, .balance-box span { color: #6f8ca0; font-size: 12px; }
  .checkout-total strong { color: #176b9e; font-size: 22px; }
  .balance-box strong { color: #23805d; }
  .balance-box strong.negative { color: #df6f7c; }
  .form-label {
    display: grid;
    gap: 7px;
    margin: 13px 0;
    color: #365b72;
    font-size: 12px;
    font-weight: 750;
  }
  .form-input {
    width: 100%;
    padding: 11px 12px;
    border: 1px solid #d7ebf7;
    border-radius: 10px;
    outline: 0;
    background: white;
    color: #3c627a;
  }
  .form-input:focus { border-color: #58afe5; box-shadow: 0 0 0 3px rgba(65,169,230,.12); }
  .checkout-note { margin: 14px 0; color: #8aa0af; font-size: 11px; line-height: 1.5; }

  .confirm-icon {
    width: 48px; height: 48px; margin: 0 auto 12px;
    display: grid; place-items: center; border-radius: 50%;
    background: #fff0f1; color: #dc6b78; font-size: 25px; font-weight: 900;
  }
  .confirm-modal h2 { margin-bottom: 7px; color: #294f69; }
  .confirm-modal p { color: #829baa; font-size: 13px; }
  .confirm-actions { display: flex; justify-content: center; gap: 8px; margin-top: 20px; }

  .sidebar-backdrop { display: none; }
  .alert-message {
    margin: 20px auto 0;
    width: min(1480px, calc(100% - 64px));
    padding: 12px 15px;
    border-radius: 12px;
    background: #fff0f1;
    color: #d36774;
    font-size: 12px;
  }

  @media (max-width: 1350px) {
    .product-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }

  @media (max-width: 1050px) {
    .sidebar {
      transform: translateX(-105%);
      transition: transform .25s ease;
      box-shadow: 12px 0 35px rgba(44,119,164,.16);
    }
    .sidebar.open { transform: translateX(0); }
    .sidebar-backdrop {
      display: block;
      position: fixed;
      z-index: 90;
      inset: 0;
      border: 0;
      background: rgba(24,76,105,.22);
    }
    .main-content { margin-left: 0; }
    .mobile-brand { display: inline; }
    .topbar { padding-left: 76px; }
    .product-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .finance-grid { grid-template-columns: repeat(2, 1fr); }
  }

  @media (max-width: 720px) {
    .topbar { height: 68px; padding-right: 15px; }
    .date-label { display: none; }
    .online-pill { padding: 7px 10px; }
    .page { width: calc(100% - 28px); padding-top: 18px; }
    .hero, .hero-overlay { min-height: 220px; }
    .hero-overlay { padding: 28px; }
    .hero h1 { font-size: 31px; }
    .section-heading, .page-header { align-items: flex-start; flex-direction: column; }
    .toolbar { flex-direction: column; align-items: stretch; }
    .search-box { width: 100%; }
    .product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px; }
    .product-info { padding: 2px 10px 11px; }
    .product-info h3 { font-size: 13px; min-height: 33px; }
    .product-price { font-size: 13px; }
    .category-tabs { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 3px; }
    .category-tabs button { white-space: nowrap; padding: 9px 13px; }
    .finance-grid { grid-template-columns: 1fr; }
    .finance-actions { width: 100%; }
    .finance-actions > * { flex: 1; }
    .date-filter { justify-content: space-between; }
    .date-filter input { min-width: 0; }
    .floating-cart { right: 15px; bottom: 15px; width: 54px; height: 54px; }
    .cart-drawer { padding: 19px; border-radius: 17px; }
    .cart-item { grid-template-columns: 48px 1fr auto; }
    .cart-item-total { grid-column: 2; }
    .remove-button { grid-column: 3; grid-row: 1; }
    .modal-layer { padding: 10px; }
  }

  @media (max-width: 430px) {
    .product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .product-image-wrap { margin: 7px; }
    .product-category { font-size: 8px; }
    .product-info h3 { font-size: 12px; }
    .primary-button { padding: 10px 11px; font-size: 12px; }
    .hero-overlay { padding: 22px; }
    .hero h1 { font-size: 27px; }
  }
</style>
