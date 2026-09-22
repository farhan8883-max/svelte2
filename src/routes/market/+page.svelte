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

  type Section = "market" | "products" | "history";

  let activeSection: Section = "market";

  let products: Product[] = [];
  let users: User[] = [];
  let cart: CartItem[] = [];
  let history: PurchaseHistory[] = [];

  let currentUser: User | null = null;
  let loading = false;
  let productLoading = false;
  let historyLoading = false;
  let message = "";

  let showCart = false;
  let showCheckout = false;
  let selectedUser = "";
  let selectedUserBalance = 0;
  let balanceLoading = false;

  // Cache saldo supaya memilih santri yang sama tidak melakukan query berulang.
  let balanceCache = new Map<string, number>();
  let balanceRequestId = 0;

  let productSearch = "";
  let userSearch = "";

  let showProductModal = false;
  let showDeleteModal = false;
  let editingProductId: number | null = null;
  let deletingProduct: Product | null = null;

  let historyDate = "";

  let productForm = {
    name: "",
    price: "",
    stock: "",
    image: ""
  };

  onMount(async () => {
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
      loadHistory()
    ]);
  });

  function todayDate() {
    return new Date().toISOString().split("T")[0];
  }

  function formatRupiah(value: number) {
    return new Intl.NumberFormat("id-ID").format(Number(value) || 0);
  }

  function formatDate(date: string) {
    if (!date) return "-";

    const [year, month, day] = date.split("-").map(Number);

    return new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(new Date(year, month - 1, day));
  }

  function formatDateShort(date: string) {
    if (!date) return "-";

    const [year, month, day] = date.split("-").map(Number);

    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(new Date(year, month - 1, day));
  }

  function changeSection(section: Section) {
    activeSection = section;
    showCart = false;

    if (section === "history") {
      void loadHistory();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openCheckout() {
    if (cart.length === 0) {
      alert("Keranjang kosong");
      return;
    }

    // Setiap checkout baru dimulai dari keadaan bersih.
    selectedUser = "";
    selectedUserBalance = 0;
    userSearch = "";
    balanceLoading = false;
    balanceRequestId += 1;
    showCheckout = true;
  }

  function closeCheckout() {
    if (loading) return;

    showCheckout = false;
    selectedUser = "";
    selectedUserBalance = 0;
    userSearch = "";
    balanceLoading = false;
    balanceRequestId += 1;
  }

  // =========================
  // LOAD PRODUCTS
  // =========================
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

  // =========================
  // LOAD USERS
  // =========================
  async function loadUsers() {
    const { data, error } = await supabase
      .from("users")
      .select("id,username,email,role")
      .eq("role", "santri")
      .order("username");

    if (error) {
      console.log(error.message);
      return;
    }

    users = (data || []) as User[];
  }

  // =========================
  // BALANCE / SELECT SANTRI
  // =========================
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
      // Ambil kolom yang diperlukan saja. Tidak perlu select("*").
      const { data: entries, error } = await supabase
        .from("entries")
        .select("amount,kind")
        .eq("user_id", userId);

      if (error) {
        console.error("Gagal mengambil saldo:", error);
        return null;
      }

      const saldo = (entries || []).reduce((total, entry) => {
        const amount = Number(entry.amount) || 0;
        return entry.kind === "pemasukan"
          ? total + amount
          : total - amount;
      }, 0);

      balanceCache = new Map(balanceCache).set(userId, saldo);

      // Jangan biarkan response query lama menimpa santri yang baru dipilih.
      if (requestId === balanceRequestId && selectedUser === userId) {
        selectedUserBalance = saldo;
      }

      return saldo;
    } finally {
      if (requestId === balanceRequestId) {
        balanceLoading = false;
      }
    }
  }

  async function handleSelectUser(userId: string) {
    // Update UI langsung, tanpa menunggu query database.
    selectedUser = userId;

    if (!userId) {
      selectedUserBalance = 0;
      balanceLoading = false;
      balanceRequestId += 1;
      return;
    }

    const cachedBalance = balanceCache.get(userId);

    if (cachedBalance !== undefined) {
      balanceRequestId += 1;
      balanceLoading = false;
      selectedUserBalance = cachedBalance;
      return;
    }

    selectedUserBalance = 0;
    await loadUserBalance(userId);
  }

  // =========================
  // PRODUCT MANAGEMENT
  // =========================
  function openAddProduct() {
    editingProductId = null;

    productForm = {
      name: "",
      price: "",
      stock: "",
      image: ""
    };

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

    if (!name) {
      alert("Nama produk wajib diisi");
      return;
    }

    if (!Number.isInteger(price) || price < 0) {
      alert("Harga harus berupa angka bulat 0 atau lebih");
      return;
    }

    if (!Number.isInteger(stock) || stock < 0) {
      alert("Stock harus berupa angka bulat 0 atau lebih");
      return;
    }

    productLoading = true;

    try {
      const productData = {
        name,
        price,
        stock,
        image: image || null
      };

      if (editingProductId === null) {
        const { error } = await supabase
          .from("products")
          .insert([productData]);

        if (error) {
          alert(error.message);
          return;
        }

        alert("Produk berhasil ditambahkan");
      } else {
        const { error } = await supabase
          .from("products")
          .update(productData)
          .eq("id", editingProductId);

        if (error) {
          alert(error.message);
          return;
        }

        alert("Produk berhasil diperbarui");
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

      if (error) {
        alert(error.message);
        return;
      }

      cart = cart.filter(
        (item) => item.product.id !== deletingProduct?.id
      );

      showDeleteModal = false;
      deletingProduct = null;

      await loadProducts();

      alert("Produk berhasil dihapus");
    } finally {
      productLoading = false;
    }
  }

  // =========================
  // CART
  // =========================
  function addToCart(product: Product) {
    if (Number(product.stock) <= 0) {
      alert("Stock habis");
      return;
    }

    const existing = cart.find(
      (item) => item.product.id === product.id
    );

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

    cart = [
      ...cart,
      {
        product,
        qty: 1
      }
    ];
  }

  function increaseCart(productId: number) {
    const item = cart.find(
      (cartItem) => cartItem.product.id === productId
    );

    const latestProduct = products.find(
      (product) => product.id === productId
    );

    if (!item || !latestProduct) return;

    if (item.qty >= Number(latestProduct.stock)) {
      alert("Stock tidak cukup");
      return;
    }

    cart = cart.map((cartItem) =>
      cartItem.product.id === productId
        ? { ...cartItem, qty: cartItem.qty + 1 }
        : cartItem
    );
  }

  function decreaseCart(productId: number) {
    const item = cart.find(
      (cartItem) => cartItem.product.id === productId
    );

    if (!item) return;

    if (item.qty <= 1) {
      removeFromCart(productId);
      return;
    }

    cart = cart.map((cartItem) =>
      cartItem.product.id === productId
        ? { ...cartItem, qty: cartItem.qty - 1 }
        : cartItem
    );
  }

  function removeFromCart(productId: number) {
    cart = cart.filter(
      (item) => item.product.id !== productId
    );
  }

  $: cartTotal = cart.reduce(
    (total, item) =>
      total + Number(item.product.price) * item.qty,
    0
  );

  // =========================
  // CHECKOUT
  // =========================
  async function checkout() {
    if (loading) return;

    if (!selectedUser) {
      alert("Pilih santri");
      return;
    }

    if (cart.length === 0) {
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

      // Selalu refresh saldo saat pembayaran agar tidak memakai cache lama.
      const saldo = await loadUserBalance(selectedUser, true);

      if (saldo === null) {
        alert("Gagal mengambil saldo santri");
        return;
      }

      const total = cartTotal;

      if (saldo < total) {
        alert("Saldo santri tidak cukup");
        return;
      }

      // Ambil semua stock terbaru sekaligus, bukan satu-per-satu.
      const productIds = cart.map((item) => item.product.id);

      const { data: latestProducts, error: productsError } =
        await supabase
          .from("products")
          .select("id,name,price,stock,image")
          .in("id", productIds);

      if (productsError) {
        alert(productsError.message);
        return;
      }

      const latestById = new Map(
        (latestProducts || []).map((product) => [
          Number(product.id),
          product
        ])
      );

      for (const item of cart) {
        const latestProduct = latestById.get(item.product.id);

        if (!latestProduct) {
          alert(`Produk ${item.product.name} tidak ditemukan`);
          return;
        }

        if (Number(latestProduct.stock) < item.qty) {
          alert(`Stock ${latestProduct.name} tidak cukup`);
          return;
        }
      }

      const purchaseDate = todayDate();

      // Insert semua transaksi sekaligus supaya request database jauh lebih sedikit.
      const entryRows = cart.map((item) => ({
        name: `Beli ${item.product.name} x${item.qty}`,
        amount: Number(item.product.price) * item.qty,
        kind: "pengeluaran" as const,
        user_id: santri.id,
        date: purchaseDate
      }));

      // Simpan transaksi dan minta kembali ID-nya.
      // ID ini dipakai untuk kompensasi jika update stock gagal.
      const { data: insertedEntries, error: entryError } =
        await supabase
          .from("entries")
          .insert(entryRows)
          .select("id");

      if (entryError) {
        alert(entryError.message);
        return;
      }

      const insertedEntryIds = (insertedEntries || [])
        .map((entry) => entry.id)
        .filter(Boolean);

      // Update stock berdasarkan stock terbaru dari database, bukan stock lama di cart.
      // eq("stock", ...) mencegah stock lama menimpa perubahan transaksi lain.
      const stockResults = await Promise.all(
        cart.map(async (item) => {
          const latestProduct = latestById.get(item.product.id);

          if (!latestProduct) {
            return {
              ok: false,
              message: `Produk ${item.product.name} tidak ditemukan`
            };
          }

          const newStock =
            Number(latestProduct.stock) - item.qty;

          const { data: updatedProduct, error } = await supabase
            .from("products")
            .update({ stock: newStock })
            .eq("id", item.product.id)
            .eq("stock", Number(latestProduct.stock))
            .select("id,stock")
            .maybeSingle();

          if (error) {
            return {
              ok: false,
              message: `Gagal mengubah stock ${latestProduct.name}: ${error.message}`
            };
          }

          if (!updatedProduct) {
            return {
              ok: false,
              message: `Stock ${latestProduct.name} baru saja berubah. Silakan coba checkout lagi.`
            };
          }

          return {
            ok: true,
            message: "",
            productId: item.product.id,
            previousStock: Number(latestProduct.stock)
          };
        })
      );

      const failedStock = stockResults.find((result) => !result.ok);

      if (failedStock) {
        // Coba batalkan entry yang baru dibuat agar saldo tidak terpotong
        // jika salah satu update stock gagal.
        if (insertedEntryIds.length > 0) {
          const { error: rollbackError } = await supabase
            .from("entries")
            .delete()
            .in("id", insertedEntryIds);

          if (rollbackError) {
            console.error(
              "Rollback transaksi gagal:",
              rollbackError
            );
          }
        }

        // Kembalikan stock yang sudah berhasil dikurangi.
        const successfulStocks = stockResults.filter(
          (result) => result.ok
        );

        await Promise.all(
          successfulStocks.map(async (result) => {
            if (
              !result.ok ||
              result.productId === undefined ||
              result.previousStock === undefined
            ) {
              return;
            }

            await supabase
              .from("products")
              .update({ stock: result.previousStock })
              .eq("id", result.productId)
              .eq(
                "stock",
                result.previousStock - (
                  cart.find(
                    (item) => item.product.id === result.productId
                  )?.qty || 0
                )
              );
          })
        );

        alert(failedStock.message);
        await loadProducts();
        return;
      }

      // Cache saldo diperbarui langsung.
      const newBalance = saldo - total;
      balanceCache = new Map(balanceCache).set(
        selectedUser,
        newBalance
      );

      cart = [];
      selectedUser = "";
      selectedUserBalance = 0;
      userSearch = "";
      balanceLoading = false;
      showCheckout = false;
      showCart = false;

      await Promise.all([
        loadProducts(),
        loadHistory()
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

  // =========================
  // HISTORY
  // =========================
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
        console.log(error.message);
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
        username:
          userMap.get(String(item.user_id)) || "Santri"
      }));
    } finally {
      historyLoading = false;
    }
  }

  $: availableProducts = products.filter(
    (product) => Number(product.stock) > 0
  );

  $: productKeyword = productSearch.toLowerCase().trim();

  $: filteredProducts = productKeyword
    ? availableProducts.filter((product) =>
        product.name.toLowerCase().includes(productKeyword)
      )
    : availableProducts;

  $: userKeyword = userSearch.toLowerCase().trim();

  $: filteredUsers = userKeyword
    ? users.filter((user) =>
        user.username.toLowerCase().includes(userKeyword) ||
        user.email.toLowerCase().includes(userKeyword)
      )
    : users;

  $: selectedUserData =
    users.find((user) => user.id === selectedUser) || null;

  $: filteredHistory = historyDate
    ? history.filter((item) => item.date === historyDate)
    : history;

  $: groupedHistory = (() => {
    const groups: Record<string, PurchaseHistory[]> = {};

    for (const item of filteredHistory) {
      if (!groups[item.date]) {
        groups[item.date] = [];
      }

      groups[item.date].push(item);
    }

    return Object.entries(groups).sort(
      ([a], [b]) => b.localeCompare(a)
    );
  })();

  function historyTotal(items: PurchaseHistory[]) {
    return items.reduce(
      (total, item) => total + Number(item.amount),
      0
    );
  }
</script>

<div class="app">

  <!-- =========================
       TOP HEADER
  ========================== -->
  <header class="topbar">

    <div class="brand" on:click={() => changeSection("market")}>
      <div class="brand-icon">🛒</div>

      <div>
        <strong>Market Santri</strong>
        <small>Admin: {currentUser?.username}</small>
      </div>
    </div>

    <button
      class="dashboard-btn"
      on:click={() => goto("/dashboard")}
    >
      ⬅ Dashboard
    </button>

  </header>

  <!-- =========================
       NAVIGATION BUTTONS
  ========================== -->
  <nav class="section-nav">

    <button
      class:active={activeSection === "market"}
      on:click={() => changeSection("market")}
    >
      🛍️
      <span>Belanja</span>
    </button>

    <button
      class:active={activeSection === "products"}
      on:click={() => changeSection("products")}
    >
      ⚙️
      <span>Produk</span>
    </button>

    <button
      class:active={activeSection === "history"}
      on:click={() => changeSection("history")}
    >
      🧾
      <span>History</span>
    </button>

    <button
      class="nav-cart"
      on:click={() => showCart = true}
    >
      🛒
      <span>Keranjang</span>

      {#if cart.length > 0}
        <b>{cart.reduce((total, item) => total + item.qty, 0)}</b>
      {/if}
    </button>

  </nav>

  {#if message}
    <div class="error">{message}</div>
  {/if}

  <main>

    <!-- =========================
         SECTION MARKET
         HALAMAN PERTAMA
    ========================== -->
    {#if activeSection === "market"}

      <section class="hero">
        <div>
          <span>MARKET SANTRI</span>
          <h1>Belanja kebutuhan santri</h1>
          <p>
            Pilih barang yang tersedia dan masukkan
            ke keranjang untuk dibeli.
          </p>
        </div>

        <div class="hero-stat">
          <strong>{availableProducts.length}</strong>
          <small>Barang tersedia</small>
        </div>
      </section>

      <section class="market-section">

        <div class="section-head market-head">
          <div>
            <h2>Barang yang Bisa Dibeli</h2>
            <p>Hanya produk dengan stock tersedia yang ditampilkan.</p>
          </div>

          {#if availableProducts.length > 0}
            <div class="search-box product-search">
              <span>🔎</span>
              <input
                type="search"
                bind:value={productSearch}
                placeholder="Cari barang..."
                aria-label="Cari barang"
              />
              {#if productSearch}
                <button
                  type="button"
                  class="clear-search"
                  aria-label="Hapus pencarian barang"
                  on:click={() => productSearch = ""}
                >
                  ✕
                </button>
              {/if}
            </div>
          {/if}
        </div>

        {#if availableProducts.length === 0}

          <div class="empty">
            <div>📦</div>
            <h3>Belum ada barang tersedia</h3>
            <p>
              Semua barang sedang habis atau belum ditambahkan.
            </p>

            <button
              on:click={() => changeSection("products")}
            >
              ⚙️ Kelola Produk
            </button>
          </div>

        {:else if filteredProducts.length === 0}

          <div class="empty search-empty">
            <div>🔎</div>
            <h3>Barang tidak ditemukan</h3>
            <p>Tidak ada barang yang cocok dengan "{productSearch}".</p>
            <button
              type="button"
              on:click={() => productSearch = ""}
            >
              Tampilkan Semua Barang
            </button>
          </div>

        {:else}

          <div class="shop-grid">

            {#each filteredProducts as product}

              <article class="shop-card">

                <div class="shop-image">
                  <img
                    src={
                      product.image ||
                      "https://via.placeholder.com/600x400?text=Produk"
                    }
                    alt={product.name}
                  />

                  <span>
                    Stock {product.stock}
                  </span>
                </div>

                <div class="shop-body">

                  <h3>{product.name}</h3>

                  <strong class="shop-price">
                    Rp {formatRupiah(product.price)}
                  </strong>

                  <button
                    on:click={() => addToCart(product)}
                  >
                    ＋ Tambah ke Keranjang
                  </button>

                </div>

              </article>

            {/each}

          </div>

        {/if}

      </section>

    {/if}

    <!-- =========================
         SECTION PRODUCTS
    ========================== -->
    {#if activeSection === "products"}

      <section class="page-section">

        <div class="page-title">

          <div>
            <span>MANAGEMENT</span>
            <h1>Kelola Produk</h1>
            <p>
              Tambah, edit, hapus, dan atur stock barang market.
            </p>
          </div>

          <button
            class="primary-btn"
            on:click={openAddProduct}
          >
            ＋ Tambah Produk
          </button>

        </div>

        <div class="admin-product-grid">

          {#each products as product}

            <article class="admin-product">

              <div class="admin-image">

                <img
                  src={
                    product.image ||
                    "https://via.placeholder.com/600x400?text=Produk"
                  }
                  alt={product.name}
                />

                {#if product.stock <= 0}
                  <span class="sold-out">HABIS</span>
                {/if}

              </div>

              <div class="admin-product-body">

                <h3>{product.name}</h3>

                <p>
                  Rp {formatRupiah(product.price)}
                </p>

                <div class="admin-stock">
                  <span>Stock</span>
                  <strong>{product.stock}</strong>
                </div>

                <div class="admin-actions">

                  <button
                    class="edit-btn"
                    on:click={() => openEditProduct(product)}
                  >
                    ✏️ Edit
                  </button>

                  <button
                    class="delete-btn"
                    on:click={() => askDeleteProduct(product)}
                  >
                    🗑️ Hapus
                  </button>

                </div>

              </div>

            </article>

          {:else}

            <div class="empty">
              <div>📦</div>
              <h3>Belum ada produk</h3>
              <p>Tambahkan produk pertama.</p>

              <button on:click={openAddProduct}>
                ＋ Tambah Produk
              </button>
            </div>

          {/each}

        </div>

      </section>

    {/if}

    <!-- =========================
         SECTION HISTORY
    ========================== -->
    {#if activeSection === "history"}

      <section class="page-section">

        <div class="page-title">

          <div>
            <span>TRANSAKSI</span>
            <h1>History Pembelian</h1>
            <p>
              Riwayat pembelian hari ini dan tanggal sebelumnya.
            </p>
          </div>

          <div class="date-filter">

            <label>
              Tanggal
              <input
                type="date"
                bind:value={historyDate}
              />
            </label>

            {#if historyDate}
              <button on:click={() => historyDate = ""}>
                Semua
              </button>
            {/if}

          </div>

        </div>

        {#if historyLoading}

          <div class="empty">
            <div>⏳</div>
            <h3>Memuat history...</h3>
          </div>

        {:else if groupedHistory.length === 0}

          <div class="empty">
            <div>🧾</div>
            <h3>Belum ada pembelian</h3>
            <p>
              Belum ada transaksi pembelian
              {historyDate ? ` pada ${formatDate(historyDate)}` : ""}.
            </p>
          </div>

        {:else}

          <div class="history-groups">

            {#each groupedHistory as [date, items]}

              <section class="history-day">

                <div class="history-day-head">

                  <div>
                    <span class="history-icon">
                      {date === todayDate() ? "📅" : "🗓️"}
                    </span>

                    <div>
                      <strong>
                        {date === todayDate()
                          ? "Hari Ini"
                          : formatDate(date)}
                      </strong>

                      <small>
                        {formatDateShort(date)}
                      </small>
                    </div>
                  </div>

                  <div>
                    <small>Total</small>
                    <strong>
                      Rp {formatRupiah(historyTotal(items))}
                    </strong>
                  </div>

                </div>

                <div class="history-list">

                  {#each items as item}

                    <div class="history-item">

                      <div class="history-bag">🛍️</div>

                      <div class="history-info">
                        <strong>{item.name}</strong>

                        <span>
                          Santri: {item.username || "Santri"}
                        </span>

                        <small>
                          {item.date}
                        </small>
                      </div>

                      <strong class="history-price">
                        - Rp {formatRupiah(item.amount)}
                      </strong>

                    </div>

                  {/each}

                </div>

              </section>

            {/each}

          </div>

        {/if}

      </section>

    {/if}

  </main>

  <!-- =========================
       FLOATING CART
  ========================== -->
  <button
    class="floating-cart"
    on:click={() => showCart = true}
  >
    🛒

    {#if cart.length > 0}
      <span>
        {cart.reduce((total, item) => total + item.qty, 0)}
      </span>
    {/if}
  </button>

  <!-- =========================
       CART DRAWER
  ========================== -->
  {#if showCart}

    <div
      class="drawer-backdrop"
      on:click={() => showCart = false}
    ></div>

    <aside class="cart-drawer">

      <div class="drawer-head">

        <div>
          <span>MARKET</span>
          <h2>Keranjang</h2>
        </div>

        <button
          on:click={() => showCart = false}
        >
          ✕
        </button>

      </div>

      {#if cart.length === 0}

        <div class="cart-empty">
          <div>🛒</div>
          <h3>Keranjang kosong</h3>
          <p>Tambahkan barang dari halaman Belanja.</p>
        </div>

      {:else}

        <div class="cart-list">

          {#each cart as item}

            <div class="cart-item">

              <img
                src={
                  item.product.image ||
                  "https://via.placeholder.com/100?text=Produk"
                }
                alt={item.product.name}
              />

              <div class="cart-info">

                <strong>{item.product.name}</strong>

                <span>
                  Rp {formatRupiah(item.product.price)}
                </span>

                <div class="quantity">

                  <button
                    on:click={() =>
                      decreaseCart(item.product.id)}
                  >
                    −
                  </button>

                  <b>{item.qty}</b>

                  <button
                    on:click={() =>
                      increaseCart(item.product.id)}
                  >
                    ＋
                  </button>

                  <button
                    class="remove"
                    on:click={() =>
                      removeFromCart(item.product.id)}
                  >
                    🗑️
                  </button>

                </div>

              </div>

            </div>

          {/each}

        </div>

        <div class="cart-total">
          <span>Total</span>
          <strong>
            Rp {formatRupiah(cartTotal)}
          </strong>
        </div>

        <button
          class="checkout-btn"
          on:click={openCheckout}
        >
          💳 Checkout
        </button>

      {/if}

    </aside>

  {/if}

  <!-- =========================
       PRODUCT MODAL
  ========================== -->
  {#if showProductModal}

    <div class="modal">

      <div class="modal-card">

        <div class="modal-head">

          <div>
            <span>
              {editingProductId === null
                ? "PRODUK BARU"
                : "EDIT PRODUK"}
            </span>

            <h2>
              {editingProductId === null
                ? "Tambah Produk"
                : "Edit Produk"}
            </h2>
          </div>

          <button on:click={closeProductModal}>
            ✕
          </button>

        </div>

        <div class="form">

          <label>
            Nama Produk
            <input
              type="text"
              bind:value={productForm.name}
              placeholder="Nama produk"
            />
          </label>

          <label>
            Harga
            <input
              type="number"
              min="0"
              step="1"
              bind:value={productForm.price}
              placeholder="5000"
            />
          </label>

          <label>
            Stock
            <input
              type="number"
              min="0"
              step="1"
              bind:value={productForm.stock}
              placeholder="10"
            />
          </label>

          <label>
            URL Gambar
            <input
              type="url"
              bind:value={productForm.image}
              placeholder="https://..."
            />
          </label>

        </div>

        {#if productForm.image}
          <img
            class="modal-preview"
            src={productForm.image}
            alt="Preview"
          />
        {/if}

        <div class="modal-actions">

          <button
            class="secondary-btn"
            on:click={closeProductModal}
          >
            Batal
          </button>

          <button
            class="primary-btn"
            disabled={productLoading}
            on:click={saveProduct}
          >
            {productLoading
              ? "Menyimpan..."
              : "💾 Simpan"}
          </button>

        </div>

      </div>

    </div>

  {/if}

  <!-- =========================
       DELETE MODAL
  ========================== -->
  {#if showDeleteModal && deletingProduct}

    <div class="modal">

      <div class="delete-card">

        <div class="delete-big">🗑️</div>

        <h2>Hapus Produk?</h2>

        <p>
          Produk
          <strong>{deletingProduct.name}</strong>
          akan dihapus.
        </p>

        <div class="modal-actions">

          <button
            class="secondary-btn"
            on:click={() => {
              showDeleteModal = false;
              deletingProduct = null;
            }}
          >
            Batal
          </button>

          <button
            class="delete-btn"
            disabled={productLoading}
            on:click={deleteProduct}
          >
            {productLoading ? "Menghapus..." : "Hapus"}
          </button>

        </div>

      </div>

    </div>

  {/if}

  <!-- =========================
       CHECKOUT MODAL
  ========================== -->
  {#if showCheckout}

    <div class="modal">

      <div class="modal-card checkout-card">

        <div class="modal-head">

          <div>
            <span>CHECKOUT</span>
            <h2>Pilih Santri</h2>
          </div>

          <button
            disabled={loading}
            on:click={closeCheckout}
          >
            ✕
          </button>

        </div>

        <div class="select-label">
          <label for="santri-search">Santri</label>

          <div class="search-box">
            <span>🔎</span>
            <input
              id="santri-search"
              type="search"
              bind:value={userSearch}
              placeholder="Cari nama atau email santri..."
              autocomplete="off"
              aria-label="Cari santri"
            />
            {#if userSearch}
              <button
                type="button"
                class="clear-search"
                aria-label="Hapus pencarian santri"
                on:click={() => userSearch = ""}
              >
                ✕
              </button>
            {/if}
          </div>

          <div class="selected-user-label">
            {#if selectedUserData}
              <span>Santri terpilih:</span>
              <strong>{selectedUserData.username}</strong>
            {:else}
              <span>Belum ada santri yang dipilih</span>
            {/if}
          </div>

          <div class="user-list">
            {#if filteredUsers.length === 0}
              <div class="no-search-result">
                <span>🔎</span>
                <strong>Santri tidak ditemukan</strong>
                <small>Coba gunakan nama atau email yang berbeda.</small>
              </div>
            {:else}
              {#each filteredUsers as user}
                <button
                  type="button"
                  class:selected={selectedUser === user.id}
                  class="user-option"
                  on:click={() => {
                    userSearch = user.username;
                    void handleSelectUser(user.id);
                  }}
                  disabled={loading}
                >
                  <div class="user-avatar">👤</div>

                  <div class="user-option-info">
                    <strong>{user.username}</strong>
                    <small>{user.email}</small>
                  </div>

                  {#if selectedUser === user.id}
                    <span class="user-check">✓</span>
                  {/if}
                </button>
              {/each}
            {/if}
          </div>
        </div>

        <div class="balance">
          <small>Sisa Saldo</small>
          <strong>
            {#if balanceLoading}
              Memuat saldo...
            {:else}
              Rp {formatRupiah(selectedUserBalance)}
            {/if}
          </strong>
        </div>

        <div class="checkout-total">
          <span>Total Belanja</span>
          <strong>
            Rp {formatRupiah(cartTotal)}
          </strong>
        </div>

        {#if selectedUser && selectedUserBalance < cartTotal}
          <div class="warning">
            ⚠️ Saldo santri tidak cukup.
          </div>
        {/if}

        <button
          class="checkout-btn"
          disabled={
            loading ||
            balanceLoading ||
            !selectedUser ||
            selectedUserBalance < cartTotal
          }
          on:click={checkout}
        >
          {loading
            ? "Memproses..."
            : "✓ Konfirmasi Pembayaran"}
        </button>

        <button
          class="secondary-btn full"
          disabled={loading}
          on:click={closeCheckout}
        >
          Batal
        </button>

      </div>

    </div>

  {/if}

</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(html) {
    scroll-behavior: smooth;
  }

  :global(body) {
    margin: 0;
    background: #f3f3f3;
    color: #172033;
    font-family:
      Arial,
      Helvetica,
      sans-serif;
  }

  button,
  input,
  select {
    font: inherit;
  }

  button {
    cursor: pointer;
  }

  .app {
    min-height: 100vh;
    background: #f3f3f3;
  }

  /* =========================================================
     AMAZON-STYLE HEADER
     ========================================================= */
  .topbar {
    position: sticky;
    top: 0;
    z-index: 100;
    min-height: 68px;
    padding: 9px 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    background: #131921;
    color: #fff;
    border-bottom: 1px solid #263241;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 245px;
    cursor: pointer;
  }

  .brand-icon {
    width: 48px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: 5px;
    background: transparent;
    color: #ff9900;
    font-size: 27px;
  }

  .brand strong,
  .brand small {
    display: block;
  }

  .brand strong {
    color: #fff;
    font-size: 22px;
    line-height: 1;
    letter-spacing: -.5px;
  }

  .brand small {
    margin-top: 5px;
    color: #c8d0d9;
    font-size: 11px;
  }

  .dashboard-btn {
    border: 1px solid #526171;
    border-radius: 3px;
    padding: 9px 14px;
    background: transparent;
    color: #fff;
    font-weight: 700;
    transition: .2s ease;
  }

  .dashboard-btn:hover {
    border-color: #fff;
  }

  .section-nav {
    position: sticky;
    top: 68px;
    z-index: 90;
    max-width: none;
    margin: 0;
    padding: 0 30px;
    min-height: 43px;
    display: flex;
    align-items: center;
    gap: 4px;
    background: #232f3e;
    border-bottom: 1px solid #37475a;
  }

  .section-nav button {
    min-height: 43px;
    padding: 8px 14px;
    display: flex;
    align-items: center;
    gap: 7px;
    border: 1px solid transparent;
    border-radius: 0;
    background: transparent;
    color: #fff;
    font-size: 13px;
    font-weight: 700;
  }

  .section-nav button:hover,
  .section-nav button.active {
    border-color: #fff;
    background: #37475a;
    color: #fff;
  }

  .section-nav button.active {
    box-shadow: inset 0 -3px 0 #ff9900;
  }

  .section-nav .nav-cart {
    margin-left: auto;
  }

  .section-nav .nav-cart b {
    min-width: 19px;
    height: 19px;
    padding: 0 5px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: #ff9900;
    color: #111;
    font-size: 10px;
    font-weight: 900;
  }

  main {
    max-width: 1500px;
    margin: 0 auto;
    padding: 18px 28px 70px;
  }

  .error {
    max-width: 1444px;
    margin: 12px auto;
    padding: 12px 15px;
    border-radius: 3px;
    background: #fff;
    border: 1px solid #d5d9d9;
    color: #b12704;
  }

  /* =========================================================
     HERO - DARK AMAZON HOMEPAGE FEEL
     ========================================================= */
  .hero {
    position: relative;
    min-height: 300px;
    padding: 42px 48px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 25px;
    overflow: hidden;
    border-radius: 0;
    color: #fff;
    background:
      radial-gradient(circle at 78% 35%, rgba(255,153,0,.18), transparent 26%),
      linear-gradient(110deg, #07182e 0%, #0d2a50 58%, #132e50 100%);
    border: 0;
    box-shadow: inset 0 -20px 50px rgba(0,0,0,.12);
  }

  .hero::after {
    content: "";
    position: absolute;
    right: -100px;
    top: -170px;
    width: 430px;
    height: 430px;
    border: 1px solid rgba(255,153,0,.55);
    border-radius: 50%;
    pointer-events: none;
  }

  .hero > div:first-child {
    position: relative;
    z-index: 2;
    max-width: 680px;
  }

  .hero > div:first-child > span,
  .page-title > div:first-child > span,
  .drawer-head > div > span,
  .modal-head span {
    color: #ff9900;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .12em;
  }

  .hero h1 {
    margin: 8px 0 7px;
    color: #fff;
    font-size: clamp(30px, 4vw, 48px);
    line-height: 1.04;
    letter-spacing: -1.3px;
  }

  .hero p,
  .page-title p {
    margin: 0;
    color: #d7e0ea;
    line-height: 1.6;
  }

  .hero-stat {
    position: relative;
    z-index: 2;
    min-width: 170px;
    padding: 18px 22px;
    border-radius: 4px;
    background: rgba(255,255,255,.96);
    border: 1px solid #d5d9d9;
    text-align: center;
    color: #111;
    box-shadow: 0 8px 25px rgba(0,0,0,.2);
  }

  .hero-stat strong {
    display: block;
    color: #111;
    font-size: 34px;
  }

  .hero-stat small {
    color: #565959;
  }

  /* =========================================================
     MARKET / SEARCH
     ========================================================= */
  .market-section {
    margin-top: 22px;
  }

  .section-head {
    margin-bottom: 14px;
  }

  .market-head {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 20px;
  }

  .section-head h2 {
    margin: 0;
    color: #172033;
    font-size: 24px;
  }

  .section-head p {
    margin: 5px 0 0;
    color: #5f6b78;
    font-size: 14px;
  }

  .search-box {
    min-height: 42px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 11px;
    background: #fff;
    border: 1px solid #a6a6a6;
    border-radius: 3px;
  }

  .search-box:focus-within {
    border-color: #ff9900;
    box-shadow: 0 0 0 2px rgba(255,153,0,.18);
  }

  .search-box input {
    min-width: 180px;
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    color: #111;
  }

  .clear-search {
    border: 0;
    background: transparent;
    color: #687078;
  }

  .shop-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px;
  }

  .shop-card {
    overflow: hidden;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 3px;
    box-shadow: 0 1px 3px rgba(0,0,0,.08);
    transition: transform .18s ease, box-shadow .18s ease;
  }

  .shop-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 6px 18px rgba(0,0,0,.12);
  }

  .shop-image {
    position: relative;
    height: 210px;
    background: #f7f7f7;
  }

  .shop-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .shop-image span {
    position: absolute;
    left: 9px;
    bottom: 9px;
    padding: 5px 8px;
    border-radius: 2px;
    background: #fff;
    color: #007600;
    font-size: 11px;
    font-weight: 800;
    box-shadow: 0 1px 3px rgba(0,0,0,.15);
  }

  .shop-body {
    padding: 14px;
  }

  .shop-body h3 {
    min-height: 42px;
    margin: 0 0 8px;
    color: #0f1111;
    font-size: 16px;
    line-height: 1.3;
  }

  .shop-price {
    display: block;
    margin-bottom: 13px;
    color: #b12704;
    font-size: 19px;
  }

  .shop-body button,
  .empty button {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #ffb41f;
    border-radius: 18px;
    background: #ffd814;
    color: #111;
    font-weight: 800;
    box-shadow: 0 1px 0 rgba(0,0,0,.08);
  }

  .shop-body button:hover,
  .empty button:hover {
    background: #f7ca00;
  }

  /* =========================================================
     GENERAL PAGES
     ========================================================= */
  .page-section {
    margin-top: 4px;
  }

  .page-title {
    margin-bottom: 22px;
    padding: 20px 22px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    background: #fff;
    border: 1px solid #d5d9d9;
    border-radius: 3px;
  }

  .page-title h1 {
    margin: 5px 0;
    color: #172033;
    font-size: 29px;
  }

  .primary-btn {
    border: 1px solid #ffb41f;
    border-radius: 18px;
    padding: 10px 17px;
    background: #ffd814;
    color: #111;
    font-weight: 800;
  }

  .primary-btn:hover {
    background: #f7ca00;
  }

  /* =========================================================
     ADMIN PRODUCTS
     ========================================================= */
  .admin-product-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 16px;
  }

  .admin-product {
    overflow: hidden;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 3px;
    box-shadow: 0 1px 3px rgba(0,0,0,.07);
  }

  .admin-image {
    position: relative;
    height: 185px;
    background: #f7f7f7;
  }

  .admin-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .sold-out {
    position: absolute;
    top: 10px;
    right: 10px;
    padding: 6px 9px;
    border-radius: 2px;
    background: #b12704;
    color: #fff;
    font-size: 10px;
    font-weight: 900;
  }

  .admin-product-body {
    padding: 15px;
  }

  .admin-product-body h3 {
    margin: 0 0 7px;
    color: #0f1111;
  }

  .admin-product-body > p {
    margin: 0 0 12px;
    color: #b12704;
    font-weight: 900;
  }

  .admin-stock {
    display: flex;
    justify-content: space-between;
    padding: 9px 0;
    border-top: 1px solid #eaeded;
    color: #565959;
    font-size: 13px;
  }

  .admin-stock strong {
    color: #111;
  }

  .admin-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
    margin-top: 10px;
  }

  .admin-actions button {
    padding: 9px;
    border: 1px solid #d5d9d9;
    border-radius: 3px;
    font-weight: 700;
  }

  .edit-btn {
    background: #fff;
    color: #1769aa;
  }

  .delete-btn {
    background: #fff;
    color: #b12704;
  }

  .edit-btn:hover,
  .delete-btn:hover {
    background: #f7fafa;
  }

  /* =========================================================
     EMPTY / HISTORY
     ========================================================= */
  .empty {
    padding: 55px 20px;
    text-align: center;
    background: #fff;
    border: 1px dashed #aab7c4;
    border-radius: 4px;
  }

  .empty > div {
    font-size: 45px;
  }

  .empty h3 {
    margin: 10px 0 5px;
    color: #111;
  }

  .empty p {
    margin: 0 0 17px;
    color: #667085;
  }

  .empty button {
    width: auto;
    padding-left: 20px;
    padding-right: 20px;
  }

  .date-filter {
    display: flex;
    align-items: end;
    gap: 8px;
  }

  .date-filter label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    color: #565959;
    font-size: 12px;
    font-weight: 700;
  }

  .date-filter input {
    min-height: 41px;
    padding: 8px 10px;
    border: 1px solid #a6a6a6;
    border-radius: 3px;
    background: #fff;
  }

  .date-filter > button {
    min-height: 41px;
    padding: 8px 12px;
    border: 1px solid #d5d9d9;
    border-radius: 3px;
    background: #fff;
    color: #374151;
    font-weight: 700;
  }

  .history-day {
    overflow: hidden;
    margin-bottom: 16px;
    border: 1px solid #d5d9d9;
    border-radius: 3px;
    background: #fff;
  }

  .history-day-head {
    padding: 15px 17px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 15px;
    background: #f7fafa;
    border-bottom: 1px solid #eaeded;
  }

  .history-day-head > div:first-child {
    display: flex;
    align-items: center;
    gap: 11px;
  }

  .history-icon {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 3px;
    background: #eef0f0;
  }

  .history-day-head strong,
  .history-day-head small {
    display: block;
  }

  .history-day-head small {
    margin-top: 3px;
    color: #687078;
    font-size: 11px;
  }

  .history-day-head > div:last-child {
    text-align: right;
  }

  .history-day-head > div:last-child strong {
    color: #b12704;
  }

  .history-list {
    background: #fff;
  }

  .history-item {
    min-height: 68px;
    padding: 12px 17px;
    display: flex;
    align-items: center;
    gap: 11px;
    border-bottom: 1px solid #eaeded;
  }

  .history-item:last-child {
    border-bottom: 0;
  }

  .history-bag {
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    display: grid;
    place-items: center;
    border-radius: 3px;
    background: #f3f3f3;
  }

  .history-info {
    min-width: 0;
    flex: 1;
  }

  .history-info strong,
  .history-info span,
  .history-info small {
    display: block;
  }

  .history-info strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #0f1111;
  }

  .history-info span,
  .history-info small {
    margin-top: 2px;
    color: #687078;
    font-size: 12px;
  }

  .history-price {
    color: #b12704;
    white-space: nowrap;
    font-size: 13px;
  }

  /* =========================================================
     FLOATING CART
     ========================================================= */
  .floating-cart {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 100;
    width: 62px;
    height: 62px;
    border: 2px solid #fff;
    border-radius: 50%;
    background: #ff9900;
    color: #111;
    font-size: 25px;
    box-shadow: 0 6px 20px rgba(0,0,0,.25);
  }

  .floating-cart span {
    position: absolute;
    top: -5px;
    right: -3px;
    min-width: 23px;
    height: 23px;
    display: grid;
    place-items: center;
    padding: 0 5px;
    border-radius: 50%;
    background: #b12704;
    color: #fff;
    font-size: 10px;
    font-weight: 900;
  }

  /* =========================================================
     CART DRAWER
     ========================================================= */
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    z-index: 500;
    background: rgba(15,23,42,.55);
  }

  .cart-drawer {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 501;
    width: 410px;
    max-width: 100%;
    height: 100vh;
    padding: 22px;
    overflow-y: auto;
    background: #fff;
    box-shadow: -10px 0 30px rgba(0,0,0,.22);
  }

  .drawer-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 17px;
    border-bottom: 1px solid #eaeded;
  }

  .drawer-head h2 {
    margin: 3px 0 0;
    color: #111;
  }

  .drawer-head button {
    width: 38px;
    height: 38px;
    border: 1px solid #d5d9d9;
    border-radius: 3px;
    background: #fff;
  }

  .cart-empty {
    padding: 65px 10px;
    text-align: center;
    color: #687078;
  }

  .cart-empty div {
    font-size: 45px;
  }

  .cart-empty h3 {
    color: #111;
  }

  .cart-list {
    padding-top: 14px;
  }

  .cart-item {
    padding: 12px 0;
    display: flex;
    gap: 12px;
    border-bottom: 1px solid #eaeded;
  }

  .cart-item img {
    width: 78px;
    height: 78px;
    object-fit: cover;
    border-radius: 3px;
    background: #f3f3f3;
  }

  .cart-info {
    min-width: 0;
    flex: 1;
  }

  .cart-info strong {
    display: block;
    color: #111;
  }

  .cart-info > span {
    display: block;
    margin-top: 5px;
    color: #b12704;
    font-weight: 800;
  }

  .quantity {
    margin-top: 9px;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .quantity button {
    width: 29px;
    height: 29px;
    border: 1px solid #d5d9d9;
    border-radius: 3px;
    background: #fff;
  }

  .quantity .remove {
    margin-left: auto;
    color: #b12704;
  }

  .cart-total,
  .checkout-total,
  .balance {
    margin-top: 16px;
    padding: 15px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    background: #f7fafa;
    border: 1px solid #eaeded;
    border-radius: 3px;
  }

  .cart-total strong,
  .checkout-total strong,
  .balance strong {
    color: #b12704;
  }

  .checkout-btn {
    width: 100%;
    margin-top: 12px;
    padding: 12px 15px;
    border: 1px solid #ffb41f;
    border-radius: 18px;
    background: #ffd814;
    color: #111;
    font-weight: 900;
  }

  .checkout-btn:hover:not(:disabled) {
    background: #f7ca00;
  }

  .checkout-btn:disabled {
    opacity: .55;
    cursor: not-allowed;
  }

  /* =========================================================
     MODALS
     ========================================================= */
  .modal {
    position: fixed;
    inset: 0;
    z-index: 700;
    padding: 20px;
    display: grid;
    place-items: center;
    background: rgba(15,23,42,.62);
  }

  .modal-card,
  .delete-card {
    width: min(560px, 100%);
    max-height: 92vh;
    overflow-y: auto;
    padding: 24px;
    background: #fff;
    border: 1px solid #d5d9d9;
    border-radius: 4px;
    box-shadow: 0 20px 60px rgba(0,0,0,.25);
  }

  .modal-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 15px;
    padding-bottom: 16px;
    border-bottom: 1px solid #eaeded;
  }

  .modal-head h2 {
    margin: 4px 0 0;
    color: #111;
  }

  .modal-head > button {
    width: 36px;
    height: 36px;
    border: 1px solid #d5d9d9;
    border-radius: 3px;
    background: #fff;
  }

  .form {
    padding-top: 18px;
    display: grid;
    gap: 14px;
  }

  .form label,
  .select-label > label {
    display: grid;
    gap: 6px;
    color: #374151;
    font-size: 13px;
    font-weight: 800;
  }

  .form input,
  .select-label input {
    width: 100%;
    min-height: 42px;
    padding: 9px 11px;
    border: 1px solid #a6a6a6;
    border-radius: 3px;
    outline: 0;
    background: #fff;
  }

  .form input:focus,
  .select-label input:focus {
    border-color: #ff9900;
    box-shadow: 0 0 0 2px rgba(255,153,0,.15);
  }

  .modal-preview {
    width: 100%;
    max-height: 220px;
    margin-top: 14px;
    object-fit: cover;
    border-radius: 3px;
    background: #f3f3f3;
  }

  .modal-actions {
    margin-top: 20px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .secondary-btn {
    padding: 10px 16px;
    border: 1px solid #a6a6a6;
    border-radius: 18px;
    background: #fff;
    color: #111;
    font-weight: 700;
  }

  .secondary-btn.full {
    width: 100%;
    margin-top: 8px;
  }

  .delete-card {
    text-align: center;
  }

  .delete-big {
    font-size: 48px;
  }

  .delete-card h2 {
    margin-bottom: 5px;
  }

  .checkout-card {
    width: min(620px, 100%);
  }

  .selected-user-label {
    margin-top: 8px;
    padding: 10px 12px;
    background: #f7fafa;
    border: 1px solid #eaeded;
    border-radius: 3px;
    font-size: 13px;
  }

  .user-list {
    max-height: 230px;
    margin-top: 8px;
    overflow-y: auto;
    border: 1px solid #eaeded;
    border-radius: 3px;
  }

  .user-option {
    width: 100%;
    padding: 11px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    border-bottom: 1px solid #eaeded;
    background: #fff;
    text-align: left;
  }

  .user-option:last-child {
    border-bottom: 0;
  }

  .user-option:hover,
  .user-option.selected {
    background: #fff8e7;
  }

  .user-avatar {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: #eef0f0;
  }

  .user-option-info {
    min-width: 0;
    flex: 1;
  }

  .user-option-info strong,
  .user-option-info small {
    display: block;
  }

  .user-option-info strong {
    color: #111;
  }

  .user-option-info small {
    margin-top: 2px;
    color: #687078;
  }

  .user-check {
    color: #007600;
    font-size: 18px;
    font-weight: 900;
  }

  .no-search-result {
    padding: 24px;
    display: grid;
    gap: 4px;
    place-items: center;
    text-align: center;
    color: #687078;
  }

  .balance {
    margin-top: 15px;
  }


  .balance strong {
    display: block;
    min-height: 24px;
    margin-top: 4px;
  }

  .user-option:disabled {
    cursor: wait;
    opacity: .65;
  }

  .warning {
    margin-top: 10px;
    padding: 11px 12px;
    border: 1px solid #f0c36d;
    border-radius: 3px;
    background: #fff8e7;
    color: #7a4f01;
    font-size: 13px;
  }

  /* =========================================================
     RESPONSIVE
     ========================================================= */
  @media (max-width: 900px) {
    .topbar {
      padding: 9px 16px;
    }

    .brand {
      min-width: auto;
    }

    .brand small {
      display: none;
    }

    .section-nav {
      padding: 0 12px;
      overflow-x: auto;
    }

    .section-nav .nav-cart {
      margin-left: 0;
    }

    main {
      padding: 14px 14px 65px;
    }

    .hero {
      min-height: 260px;
      padding: 30px 24px;
    }

    .hero-stat {
      min-width: 130px;
    }

    .market-head {
      align-items: stretch;
      flex-direction: column;
    }

    .product-search {
      width: 100%;
    }

    .search-box input {
      min-width: 0;
    }
  }

  @media (max-width: 620px) {
    .topbar {
      min-height: 60px;
      position: relative;
    }

    .section-nav {
      position: relative;
      top: 0;
    }

    .brand strong {
      font-size: 18px;
    }

    .dashboard-btn {
      padding: 8px 10px;
      font-size: 12px;
    }

    .hero {
      min-height: 300px;
      padding: 28px 20px;
      align-items: flex-start;
      flex-direction: column;
    }

    .hero h1 {
      font-size: 32px;
    }

    .hero-stat {
      width: 100%;
      text-align: left;
    }

    .page-title {
      align-items: stretch;
      flex-direction: column;
    }

    .date-filter {
      align-items: stretch;
      flex-direction: column;
    }

    .date-filter input,
    .date-filter > button {
      width: 100%;
    }

    .admin-actions {
      grid-template-columns: 1fr;
    }

    .history-day-head {
      align-items: flex-start;
      flex-direction: column;
    }

    .history-day-head > div:last-child {
      text-align: left;
    }

    .history-price {
      font-size: 11px;
    }

    .floating-cart {
      right: 16px;
      bottom: 16px;
    }

    .cart-drawer {
      width: 100%;
      padding: 18px;
    }

    .modal {
      padding: 10px;
    }

    .modal-card,
    .delete-card {
      padding: 18px;
    }
  }

  @media (max-width: 420px) {
    .shop-grid,
    .admin-product-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .shop-image,
    .admin-image {
      height: 150px;
    }

    .shop-body {
      padding: 11px;
    }

    .shop-body h3 {
      min-height: 48px;
      font-size: 14px;
    }

    .shop-price {
      font-size: 16px;
    }

    .shop-body button {
      padding: 9px 6px;
      font-size: 11px;
    }

    .admin-product-body {
      padding: 11px;
    }

    .admin-product-body h3 {
      font-size: 14px;
    }
  }

  @media (max-width: 360px) {
    .shop-grid,
    .admin-product-grid {
      grid-template-columns: 1fr;
    }
  }
</style>