
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
    role: "admin" | "santri";
  }

  let currentUser: User | null = null;

  let products: Product[] = [];

  // form
  let name = "";
  let price: number | string = "";
  let stock: number | string = "";
  let image = "";

  let editingId: number | null = null;

  let message = "";

  onMount(async () => {
    const storedUser = localStorage.getItem("user");

    if (!storedUser) {
      goto("/login");
      return;
    }

    currentUser = JSON.parse(storedUser);

    if (currentUser?.role !== "admin") {
      goto("/");
      return;
    }

    loadProducts();
  });

  async function loadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      message = error.message;
    } else {
      products = data;
    }
  }

  async function addOrUpdateProduct() {
    if (!name || !price || !stock) {
      message = "Semua field wajib diisi";
      return;
    }

    if (editingId) {
      const { error } = await supabase
        .from("products")
        .update({
          name,
          price: Number(price),
          stock: Number(stock),
          image
        })
        .eq("id", editingId);

      if (error) {
        message = error.message;
        return;
      }

      message = "Produk berhasil diupdate";
    } else {
      const { error } = await supabase
        .from("products")
        .insert([
          {
            name,
            price: Number(price),
            stock: Number(stock),
            image
          }
        ]);

      if (error) {
        message = error.message;
        return;
      }

      message = "Produk berhasil ditambahkan";
    }

    resetForm();
    loadProducts();
  }

  function editProduct(product: Product) {
    editingId = product.id;

    name = product.name;
    price = product.price;
    stock = product.stock;
    image = product.image || "";

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  async function deleteProduct(id: number) {
    const confirmDelete = confirm("Yakin hapus produk?");

    if (!confirmDelete) return;

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", id);

    if (error) {
      message = error.message;
      return;
    }

    message = "Produk berhasil dihapus";

    loadProducts();
  }

  function resetForm() {
    editingId = null;
    name = "";
    price = "";
    stock = "";
    image = "";
  }

  function formatRupiah(value: number) {
    return new Intl.NumberFormat("id-ID").format(value);
  }
</script>

<div class="container">

  <div class="header">
    <div>
      <h1>🛒 Admin Market</h1>
      <p>Kelola barang market santri</p>
    </div>

    <button class="back-btn" on:click={() => goto("/dashboard")}>
      ⬅️ Dashboard
    </button>
  </div>

  {#if message}
    <div class="message">
      {message}
    </div>
  {/if}

  <!-- FORM -->
  <div class="form-card">

    <h2>
      {editingId ? "✏️ Edit Produk" : "➕ Tambah Produk"}
    </h2>

    <form on:submit|preventDefault={addOrUpdateProduct}>

      <input
        type="text"
        placeholder="Nama produk"
        bind:value={name}
      />

      <input
        type="text"
        placeholder="Harga"
        bind:value={price}
        on:input={(e) => {
          const raw = e.currentTarget.value.replace(/\D/g, "");
          price = raw ? Number(raw) : "";
          e.currentTarget.value = raw
            ? formatRupiah(Number(raw))
            : "";
        }}
      />

      <input
        type="number"
        placeholder="Stock"
        bind:value={stock}
      />

      <input
        type="text"
        placeholder="URL gambar"
        bind:value={image}
      />

      <div class="button-group">
        <button type="submit" class="save-btn">
          {editingId ? "Update" : "Tambah"}
        </button>

        {#if editingId}
          <button
            type="button"
            class="cancel-btn"
            on:click={resetForm}
          >
            Batal
          </button>
        {/if}
      </div>

    </form>
  </div>

  <!-- PRODUCTS -->
  <div class="grid">

    {#if products.length === 0}
      <p>Belum ada produk.</p>
    {/if}

    {#each products as product}

      <div class="card">

        <img
          src={product.image || "https://via.placeholder.com/300x200"}
          alt={product.name}
        />

        <div class="card-body">

          <h3>{product.name}</h3>

          <p class="price">
            Rp {formatRupiah(product.price)}
          </p>

          <small>
            Stock: {product.stock}
          </small>

          <div class="actions">

            <button
              class="edit-btn"
              on:click={() => editProduct(product)}
            >
              ✏️ Edit
            </button>

            <button
              class="delete-btn"
              on:click={() => deleteProduct(product.id)}
            >
              🗑️ Hapus
            </button>

          </div>

        </div>
      </div>

    {/each}

  </div>
</div>

<style>
  * {
    box-sizing: border-box;
  }

  body {
    background: #f4f6f9;
    font-family: "Segoe UI", sans-serif;
  }

  .container {
    padding: 20px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 25px;
    flex-wrap: wrap;
    gap: 10px;
  }

  .header h1 {
    margin-bottom: 5px;
  }

  .back-btn {
    border: none;
    background: #1e88e5;
    color: white;
    padding: 10px 16px;
    border-radius: 10px;
    cursor: pointer;
  }

  .message {
    background: #e3f2fd;
    color: #1565c0;
    padding: 12px;
    border-radius: 10px;
    margin-bottom: 20px;
  }

  .form-card {
    background: white;
    padding: 20px;
    border-radius: 16px;
    margin-bottom: 30px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  }

  .form-card h2 {
    margin-bottom: 15px;
  }

  form input {
    width: 100%;
    padding: 12px;
    border: 1px solid #ddd;
    border-radius: 10px;
    margin-bottom: 12px;
    font-size: 14px;
  }

  .button-group {
    display: flex;
    gap: 10px;
  }

  .save-btn,
  .cancel-btn {
    border: none;
    padding: 12px 18px;
    border-radius: 10px;
    cursor: pointer;
    font-weight: bold;
  }

  .save-btn {
    background: #43a047;
    color: white;
  }

  .cancel-btn {
    background: #ccc;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
  }

  .card {
    background: white;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    transition: 0.3s;
  }

  .card:hover {
    transform: translateY(-5px);
  }

  .card img {
    width: 100%;
    height: 220px;
    object-fit: cover;
  }

  .card-body {
    padding: 16px;
  }

  .card-body h3 {
    margin-bottom: 10px;
  }

  .price {
    color: #2e7d32;
    font-weight: bold;
    margin-bottom: 10px;
    font-size: 18px;
  }

  .actions {
    display: flex;
    gap: 10px;
    margin-top: 15px;
  }

  .actions button {
    flex: 1;
    border: none;
    padding: 10px;
    border-radius: 10px;
    cursor: pointer;
    color: white;
    font-weight: bold;
  }

  .edit-btn {
    background: #ff9800;
  }

  .delete-btn {
    background: #e53935;
  }

  @media (max-width: 768px) {
    .container {
      padding: 15px;
    }

    .header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
