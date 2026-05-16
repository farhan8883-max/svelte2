<script lang="ts">
  import { onMount } from "svelte";
  import { supabase } from "$lib/supabaseClient";
  import { goto } from "$app/navigation";

  interface Product {
    id: number;
    name: string;
    price: number;
    stock: number;
    image?: string;
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

  let products: Product[] = [];
  let users: User[] = [];
  let cart: CartItem[] = [];

  let currentUser: User | null = null;

  let message = "";
  let loading = false;

  // modal checkout
  let showCheckout = false;
  let selectedUser = "";
  let showCart = false;

  let selectedUserBalance = 0;

  onMount(async () => {
    const storedUser = localStorage.getItem("user");

    if (!storedUser) {
      goto("/login");
      return;
    }

    currentUser = JSON.parse(storedUser);

    // hanya admin boleh akses market
    if (currentUser?.role !== "admin") {
      alert("Akses ditolak");
      goto("/");
      return;
    }

    await loadProducts();
    await loadUsers();
  });

  async function handleSelectUser(userId: string) {

  selectedUser = userId;

  if (!userId) {
    selectedUserBalance = 0;
    return;
  }

  // ambil semua transaksi user
  const { data: entries, error } =
    await supabase
      .from("entries")
      .select("*")
      .eq("user_id", userId);

  if (error) {
    console.log(error.message);
    return;
  }

  let saldo = 0;

  entries?.forEach((entry: Entry) => {

    if (entry.kind === "pemasukan") {
      saldo += entry.amount;
    } else {
      saldo -= entry.amount;
    }

  });

  selectedUserBalance = saldo;
}

  // =========================
  // LOAD PRODUCTS
  // =========================
  async function loadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      message = error.message;
      return;
    }

    products = data || [];
  }

  // =========================
  // LOAD USERS
  // =========================
  async function loadUsers() {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("role", "santri")
      .order("username");

    if (error) {
      console.log(error.message);
      return;
    }

    users = data || [];
  }

  // =========================
  // ADD TO CART
  // =========================
  function addToCart(product: Product) {
    if (product.stock <= 0) {
      alert("Stock habis");
      return;
    }

    const existingItem = cart.find(
      (item) => item.product.id === product.id
    );

    if (existingItem) {

      // cek stock
      if (existingItem.qty >= product.stock) {
        alert("Stock tidak cukup");
        return;
      }

      existingItem.qty += 1;

      // refresh reactive
      cart = [...cart];

    } else {

      cart = [
        ...cart,
        {
          product,
          qty: 1
        }
      ];
    }
  }

  // =========================
  // REMOVE CART
  // =========================
  function removeFromCart(productId: number) {
    cart = cart.filter(
      (item) => item.product.id !== productId
    );
  }

  // =========================
  // TOTAL PRICE
  // =========================
  function totalPrice() {
    return cart.reduce((total, item) => {
      return total + item.product.price * item.qty;
    }, 0);
  }

  // =========================
  // CHECKOUT
  // =========================
  async function checkout() {

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

      // ambil user santri
      const { data: santri, error: userError } =
        await supabase
          .from("users")
          .select("*")
          .eq("id", selectedUser)
          .single();

      if (userError || !santri) {
        alert("Santri tidak ditemukan");
        loading = false;
        return;
      }

      // ambil saldo
      const { data: entries } = await supabase
        .from("entries")
        .select("*")
        .eq("user_id", santri.id);

      let saldo = 0;

      entries?.forEach((entry: Entry) => {
        if (entry.kind === "pemasukan") {
          saldo += entry.amount;
        } else {
          saldo -= entry.amount;
        }
      });

      const total = totalPrice();

      // cek saldo
      if (saldo < total) {
        alert("Saldo santri tidak cukup");
        loading = false;
        return;
      }

      // proses transaksi
      for (const item of cart) {

        // simpan pengeluaran
        const { error: entryError } =
          await supabase
            .from("entries")
            .insert([
              {
                name: `Beli ${item.product.name} x${item.qty}`,
                amount: item.product.price * item.qty,
                kind: "pengeluaran",
                user_id: santri.id,
                date: new Date()
                  .toISOString()
                  .split("T")[0]
              }
            ]);

        if (entryError) {
          alert(entryError.message);
          loading = false;
          return;
        }

        // update stock
        const { error: stockError } =
          await supabase
            .from("products")
            .update({
              stock: item.product.stock - item.qty
            })
            .eq("id", item.product.id);

        if (stockError) {
          alert(stockError.message);
          loading = false;
          return;
        }
      }

      alert(
        `Pembayaran berhasil untuk ${santri.username}`
      );

      // reset
      cart = [];
      selectedUser = "";
      showCheckout = false;

      await loadProducts();

    } catch (err) {
      console.log(err);
      alert("Terjadi kesalahan");
    }

    loading = false;
  }
</script>

<div class="container">

  <!-- HEADER -->
  <div class="header">

    <div>
      <h1>🛒 Market Santri</h1>
      <small>
        Admin: {currentUser?.username}
      </small>
    </div>

    <button
      class="back-btn"
      on:click={() => goto("/dashboard")}
    >
      ⬅ Dashboard
    </button>

  </div>

  {#if message}
    <p class="error">{message}</p>
  {/if}

  <div class="layout">

    <!-- PRODUCT -->
    <div>

      <div class="grid">

        {#each products as product}

          <div class="card">

            <img
              src={product.image || "https://via.placeholder.com/300"}
              alt={product.name}
            />

            <h2>{product.name}</h2>

            <p class="price">
              Rp
              {new Intl.NumberFormat("id-ID")
                .format(product.price)}
            </p>

            <small>
              Stock: {product.stock}
            </small>

            <button
              disabled={product.stock <= 0}
              on:click={() => addToCart(product)}
            >
              {product.stock <= 0
                ? "Habis"
                : "Tambah ke Keranjang"}
            </button>

          </div>

        {/each}

      </div>

    </div>

    <!-- CART -->
<!-- FLOATING CART BUTTON -->
<button
  class="floating-cart"
  on:click={() => showCart = !showCart}
>
  🛒
  {#if cart.length > 0}
    <span class="cart-badge">
      {cart.length}
    </span>
  {/if}
</button>

<!-- CART POPUP -->
{#if showCart}

  <div class="cart-popup">

    <div class="cart-header">
      <h2>🧺 Keranjang</h2>

      <button
        class="close-cart"
        on:click={() => showCart = false}
      >
        ✖
      </button>
    </div>

    {#if cart.length === 0}

      <p>Belum ada barang</p>

    {:else}

      {#each cart as item}

        <div class="cart-item">

          <div>
            <strong>
              {item.product.name}
            </strong>

            <br />

            {item.qty} x Rp
            {new Intl.NumberFormat("id-ID")
              .format(item.product.price)}
          </div>

          <button
            class="remove-btn"
            on:click={() =>
              removeFromCart(item.product.id)}
          >
            ❌
          </button>

        </div>

      {/each}

      <div class="total">

        <h3>Total:</h3>

        <h2>
          Rp
          {new Intl.NumberFormat("id-ID")
            .format(totalPrice())}
        </h2>

      </div>

      <button
        class="checkout-btn"
        on:click={() => showCheckout = true}
      >
        💳 Bayar
      </button>

    {/if}

  </div>

{/if}

  </div>

  <!-- MODAL -->
  {#if showCheckout}

    <div class="modal">

      <div class="modal-content">

        <h2>Pilih Santri</h2>

        <select
  bind:value={selectedUser}
  on:change={(e) =>
    handleSelectUser(
      (e.target as HTMLSelectElement).value
    )
  }
>



          <option value="">
            -- Pilih Santri --
          </option>

          {#each users as user}

            <option value={user.id}>
              {user.username} ({user.email})
            </option>

          {/each}

        </select>

        <div class="saldo-box">

  <small>Sisa Saldo Santri</small>

  <h3>
    Rp
    {new Intl.NumberFormat("id-ID")
      .format(selectedUserBalance)}
  </h3>

</div>

        <div class="modal-total">

          Total:
          <strong>
            Rp
            {new Intl.NumberFormat("id-ID")
              .format(totalPrice())}
          </strong>

        </div>

        <button
          class="pay-btn"
          disabled={loading}
          on:click={checkout}
        >
          {loading
            ? "Memproses..."
            : "Konfirmasi Bayar"}
        </button>

        <button
          class="cancel-btn"
          on:click={() => {
            showCheckout = false;
            selectedUser = "";
          }}
        >
          Batal
        </button>

      </div>

    </div>

  {/if}

</div>

<style>

  * {
    box-sizing: border-box;
  }

  body {
    background: #f5f7fb;
  }

  .container {
    padding: 24px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .header h1 {
    margin: 0;
  }

  .layout {
    display: grid;
    grid-template-columns: 3fr 1fr;
    gap: 24px;
  }

  .grid {
    display: grid;
    grid-template-columns:
      repeat(auto-fit,minmax(230px,1fr));
    gap: 20px;
  }

  .card {
    background: white;
    border-radius: 18px;
    padding: 16px;
    box-shadow:
      0 4px 14px rgba(0,0,0,.08);
  }

  .card img {
    width: 100%;
    height: 180px;
    object-fit: cover;
    border-radius: 12px;
    margin-bottom: 12px;
  }

  .card h2 {
    margin: 0 0 8px;
    font-size: 20px;
  }

  .price {
    color: #2e7d32;
    font-weight: bold;
    font-size: 18px;
  }

  .card button {
    width: 100%;
    margin-top: 12px;
    padding: 10px;
    border: none;
    border-radius: 10px;
    background: #1e88e5;
    color: white;
    cursor: pointer;
  }

  .card button:disabled {
    background: #999;
    cursor: not-allowed;
  }

  .cart {
    background: white;
    border-radius: 18px;
    padding: 20px;
    height: fit-content;
    box-shadow:
      0 4px 14px rgba(0,0,0,.08);
  }

  .cart-item {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 0;
    border-bottom: 1px solid #eee;
  }

  .remove-btn {
    border: none;
    background: transparent;
    cursor: pointer;
  }

  .total {
    margin-top: 20px;
  }

  .checkout-btn {
    width: 100%;
    padding: 12px;
    margin-top: 16px;
    border: none;
    border-radius: 10px;
    background: #43a047;
    color: white;
    cursor: pointer;
    font-size: 16px;
  }

  .back-btn {
    border: none;
    padding: 10px 14px;
    border-radius: 10px;
    background: #333;
    color: white;
    cursor: pointer;
  }

  .modal {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.45);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-content {
    width: 350px;
    background: white;
    padding: 24px;
    border-radius: 18px;
  }

  .modal-content select {
    width: 100%;
    padding: 12px;
    border-radius: 10px;
    border: 1px solid #ccc;
    margin-top: 14px;
  }

  .modal-total {
    margin: 18px 0;
    font-size: 18px;
  }

  .pay-btn {
    width: 100%;
    padding: 12px;
    border: none;
    border-radius: 10px;
    background: #1e88e5;
    color: white;
    cursor: pointer;
    margin-bottom: 10px;
  }

  .cancel-btn {
    width: 100%;
    padding: 12px;
    border: none;
    border-radius: 10px;
    background: #ccc;
    cursor: pointer;
  }

  .error {
    color: red;
    margin-bottom: 12px;
  }

  @media (max-width: 900px) {

    .layout {
      grid-template-columns: 1fr;
    }

  }
.floating-cart {
  position: fixed;
  bottom: 24px;
  right: 24px;

  width: 65px;
  height: 65px;

  border: none;
  border-radius: 50%;

  background: #1e88e5;
  color: white;

  font-size: 28px;
  cursor: pointer;

  box-shadow:
    0 8px 24px rgba(0,0,0,.2);

  z-index: 1000;
}

.cart-badge {
  position: absolute;
  top: -5px;
  right: -5px;

  background: red;
  color: white;

  width: 24px;
  height: 24px;

  border-radius: 50%;

  font-size: 12px;

  display: flex;
  align-items: center;
  justify-content: center;
}

.cart-popup {
  position: fixed;
  top: 0;
  right: 0;

  width: 360px;
  height: 100vh;

  background: white;

  padding: 20px;

  box-shadow:
    -4px 0 20px rgba(0,0,0,.12);

  z-index: 999;

  overflow-y: auto;
}

.cart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;

  margin-bottom: 20px;
}

.close-cart {
  border: none;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
}
.saldo-box {
  margin-top: 16px;
  padding: 14px;
  border-radius: 12px;

  background: #f5f7fb;

  border: 1px solid #e0e0e0;
}

.saldo-box small {
  color: #666;
}

.saldo-box h3 {
  margin: 6px 0 0;
  color: #2e7d32;
}
</style>