<script lang="ts">
  import { supabase } from "$lib/supabaseClient";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

  interface Entry {
    id: number;
    date: string;
    amount: number;
    kind: "pemasukan" | "pengeluaran";
    name: string;
    user_id: string;
    users?: { username: string };
  }

  interface User {
    id: string;
    username: string;
    role: "admin" | "santri";
  }

  let entries: Entry[] = [];
  let filteredEntries: Entry[] = [];
  let users: User[] = [];

  // form
  let name = "";
  let date = "";
  let amount: number | string = "";
  let kind: "pemasukan" | "pengeluaran" = "pemasukan";
  let user_id = "";
  let editingId: number | null = null;

  // state
  let message = "";
  let sidebarOpen = false;
  let activeSection: "all" | "pemasukan" | "pengeluaran" = "all";
  let showForm = false; // ⬅️ tambahan untuk toggle

  // auth
  let currentUser: User | null = null;
  let selectedUserId: string = "";

  onMount(async () => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) {
      goto("/login");
      return;
    }
    currentUser = JSON.parse(storedUser);

    await loadUsers();
    if (currentUser && currentUser.role === "santri") {
      selectedUserId = currentUser.id;
    }
    await loadEntries();
  });

  async function loadUsers() {
    const { data, error } = await supabase.from("users").select("id, username, role");
    if (error) {
      message = "Gagal ambil users: " + error.message;
    } else {
      users = data as User[];
    }
  }

  async function loadEntries() {
    let query = supabase
      .from("entries")
      .select(`
        id, name, date, amount, kind, user_id,
        users ( username )
      `)
      .order("id", { ascending: false });

    if (currentUser?.role === "santri") {
      query = query.eq("user_id", currentUser.id);
    } else if (selectedUserId) {
      query = query.eq("user_id", selectedUserId);
    }

    const { data, error } = await query;
    if (error) {
      message = "Gagal load data: " + error.message;
    } else {
      entries = data as unknown as Entry[];
      applyFilter();
    }
  }

  function applyFilter() {
    if (activeSection === "all") {
      filteredEntries = entries;
    } else {
      filteredEntries = entries.filter((e) => e.kind === activeSection);
    }
  }

  function setSection(section: "all" | "pemasukan" | "pengeluaran") {
    activeSection = section;
    applyFilter();
  }

  async function addOrUpdateEntry() {
    if (!name || !date || !amount) {
      message = "Semua field wajib diisi";
      return;
    }

    const entryUserId =
      currentUser?.role === "admin" ? user_id || selectedUserId : currentUser?.id;

    if (!entryUserId) {
      message = "User belum dipilih";
      return;
    }

    if (editingId) {
      const { error } = await supabase
        .from("entries")
        .update({ name, date, amount: Number(amount), kind, user_id: entryUserId })
        .eq("id", editingId);
      if (error) {
        message = "Gagal update: " + error.message;
        return;
      }
      message = "Data berhasil diupdate";
    } else {
      const { error } = await supabase
        .from("entries")
        .insert([{ name, date, amount: Number(amount), kind, user_id: entryUserId }]);
      if (error) {
        message = "Gagal tambah data: " + error.message;
        return;
      }
      message = "Data berhasil ditambahkan";
    }

    resetForm();
    await loadEntries();
  }

  function editEntry(entry: Entry) {
    editingId = entry.id;
    name = entry.name;
    date = entry.date;
    amount = entry.amount;
    kind = entry.kind;
    user_id = entry.user_id;
    showForm = true; // ⬅️ kalau edit langsung buka form
  }

  function logout() {
    localStorage.removeItem("user");
    goto("/login");
  }

  async function deleteEntry(id: number) {
    if (!confirm("Yakin hapus data ini?")) return;
    const { error } = await supabase.from("entries").delete().eq("id", id);
    if (error) {
      message = "Gagal hapus: " + error.message;
      return;
    }
    message = "Data berhasil dihapus";
    await loadEntries();
  }

  function resetForm() {
    editingId = null;
    name = "";
    date = "";
    amount = "";
    kind = "pemasukan";
    user_id = "";
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  function toggleForm() {
    showForm = !showForm;
    resetForm();
  }

  function formatRupiah(value: number) {
    return new Intl.NumberFormat("id-ID").format(value);
  }
</script>

<!-- Header mobile -->
<div class="mobile-header">
  <span class="brand-mobile">Project Hafiz</span>
  <button class="hamburger" on:click={toggleSidebar}>☰</button>
</div>

<!-- Sidebar -->
<div class="sidebar {sidebarOpen ? 'open' : ''}">
  <div class="brand">
    <img src="/logo.png" alt="Logo" />
    <h2>Project Hafiz</h2>
  </div>
  <button class="logout-btn" on:click={logout}>🚪 Logout</button>
</div>

<!-- Main -->
<div class="main">
  <h1>Dashboard {currentUser?.role === "admin" ? "Admin" : "Santri"}</h1>
  <p class="message">{message}</p>

  <!-- Pilih User (khusus Admin) -->
  {#if currentUser?.role === "admin"}
    <div class="user-filter">
      <label for="pilih-santri">Pilih Santri:</label>
      <select id="pilih-santri" bind:value={selectedUserId} on:change={loadEntries}>
        <option value="">-- Semua Santri --</option>
        {#each users.filter(u => u.role === "santri") as u}
          <option value={u.id}>{u.username}</option>
        {/each}
      </select>
    </div>
  {/if}

  <!-- Filter Buttons -->
  <div class="filters">
    <button class:active={activeSection === "all"} on:click={() => setSection("all")}>Semua</button>
    <button class:active={activeSection === "pemasukan"} on:click={() => setSection("pemasukan")}>Pemasukan</button>
    <button class:active={activeSection === "pengeluaran"} on:click={() => setSection("pengeluaran")}>Pengeluaran</button>
  </div>

  <!-- Tombol Toggle -->
  <div class="toggle-wrapper">
    <button class="toggle-btn" on:click={toggleForm}>
      {showForm ? "⬅️ Kembali ke Data" : "➕ Tambah Data"}
    </button>
  </div>

  <!-- Form Section -->
  {#if showForm}
    <section class="form-section">
      <form on:submit|preventDefault={addOrUpdateEntry}>
        <input type="text" placeholder="Nama catatan" bind:value={name} />
        <input type="date" bind:value={date} />
        <input
          type="text"
          placeholder="Jumlah"
          bind:value={amount}
          on:input={(e) => {
            const raw = e.currentTarget.value.replace(/\D/g, "");
            amount = raw ? Number(raw) : "";
            e.currentTarget.value = raw ? formatRupiah(Number(raw)) : "";
          }}
        />
        <select bind:value={kind}>
          <option value="pemasukan">Pemasukan</option>
          <option value="pengeluaran">Pengeluaran</option>
        </select>

        {#if currentUser?.role === "admin"}
          <select bind:value={user_id}>
            <option value="">-- Pilih Santri --</option>
            {#each users.filter(u => u.role === "santri") as u}
              <option value={u.id}>{u.username}</option>
            {/each}
          </select>
        {/if}

        <button type="submit">{editingId ? "Update" : "Tambah"}</button>
        {#if editingId}
          <button type="button" on:click={resetForm}>Batal</button>
        {/if}
      </form>
    </section>
  {:else}
    <!-- Data Entries Section -->
    <section class="data-section">
      <hr />
      {#if filteredEntries.length === 0}
        <p>Belum ada data.</p>
      {:else}
        <table>
          <thead>
            <tr>
              {#if currentUser?.role === "admin"}<th>Santri</th>{/if}
              <th>Nama Catatan</th>
              <th>Tanggal</th>
              <th>Jumlah</th>
              <th>Jenis</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredEntries as e}
              <tr>
                {#if currentUser?.role === "admin"}<td>{e.users?.username}</td>{/if}
                <td>{e.name}</td>
                <td>{e.date}</td>
                <td>Rp {formatRupiah(e.amount)}</td>
                <td>{e.kind}</td>
                <td>
                  <button on:click={() => editEntry(e)}>✏️ Edit</button>
                  <button on:click={() => deleteEntry(e.id)}>🗑️ Hapus</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
  {/if}
</div>

<style>
  * { margin:0; padding:0; box-sizing:border-box; font-family:"Segoe UI", Tahoma, Geneva, Verdana, sans-serif; }
  body { background:#f4f6f9; color:#333; }
  .mobile-header { display:none; background:#1e88e5; color:#fff; padding:12px 15px; align-items:center; justify-content:space-between; }
  .mobile-header .hamburger { font-size:22px; background:none; border:none; color:#fff; cursor:pointer; }
  .sidebar { width:250px; background:#1e88e5; color:#fff; min-height:100vh; padding:20px; position:fixed; top:0; left:0; transition:transform .3s; }
  .sidebar .brand { display:flex; align-items:center; margin-bottom:20px; }
  .sidebar .brand img { width:40px; height:40px; margin-right:10px; border-radius:50%; background:#fff; }
  .main { margin-left:270px; padding:20px; }
  .message { color:red; margin-bottom:10px; }
  .filters { margin:15px 0; }
  .filters button { margin-right:10px; padding:8px 16px; border:none; border-radius:6px; cursor:pointer; background:#ddd; }
  .filters button.active { background:#1e88e5; color:#fff; }
  .user-filter { margin:15px 0; }
  form { background:#fff; padding:20px; border-radius:10px; margin-bottom:20px; box-shadow:0 2px 8px rgba(0,0,0,0.08); }
  form input, form select { width:100%; padding:10px; margin:8px 0; border:1px solid #ddd; border-radius:6px; font-size:14px; }
  form button { padding:10px 20px; border:none; border-radius:6px; margin:5px 5px 5px 0; cursor:pointer; font-size:14px; }
  form button[type="submit"] { background:#1e88e5; color:#fff; }
  form button[type="button"] { background:#ccc; color:#333; }
  table { width:100%; border-collapse:collapse; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08); }
  thead { background:#1e88e5; color:#fff; }
  th, td { padding:12px 15px; text-align:left; font-size:14px; border-bottom:1px solid #eee; }
  tr:hover { background:#f5faff; }
  td button { padding:6px 12px; border:none; border-radius:6px; margin:2px; font-size:13px; cursor:pointer; }
  td button:first-child { background:#ff9800; color:#fff; }
  td button:last-child { background:#e53935; color:#fff; }
  .logout-btn { width:100%; padding:10px; margin-top:20px; background:#e53935; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:14px; text-align:left; }
  .logout-btn:hover { background:#c62828; }
  .toggle-wrapper { margin:15px 0; text-align:right; }
  .toggle-btn { padding:10px 18px; border:none; border-radius:6px; background:#43a047; color:#fff; cursor:pointer; font-size:14px; }
  .toggle-btn:hover { background:#2e7d32; }
  .form-section, .data-section { margin-top:20px; animation: fade .3s ease-in-out; }
  @keyframes fade { from { opacity:0; transform:translateY(10px);} to { opacity:1; transform:translateY(0);} }
  @media(max-width:768px){ .mobile-header{display:flex;} .sidebar{transform:translateX(-100%);position:fixed;z-index:1000;} .sidebar.open{transform:translateX(0);} .main{margin-left:0;padding:15px;} table{display:block;overflow-x:auto;font-size:13px;} th,td{white-space:nowrap;} }
</style>
