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

  // saldo
let totalSaldo = 0;

// statistik dashboard
let totalSantri = 0;
let santriMinus = 0;

let showMinusList = false;
let showMinusModal = false;
let minusUsers: { username: string; saldo: number }[] = [];

function calculateStats() {
  totalSantri = users.filter((u) => u.role === "santri").length;

  const saldoMap: Record<string, number> = {};

  entries.forEach((entry) => {
    if (!saldoMap[entry.user_id]) {
      saldoMap[entry.user_id] = 0;
    }

    if (entry.kind === "pemasukan") {
      saldoMap[entry.user_id] += entry.amount;
    } else {
      saldoMap[entry.user_id] -= entry.amount;
    }
  });

  santriMinus = Object.values(saldoMap).filter((saldo) => saldo < 0).length;

  // daftar user minus
  minusUsers = users
    .filter((u) => u.role === "santri")
    .map((u) => ({
      username: u.username,
      saldo: saldoMap[u.id] || 0
    }))
    .filter((u) => u.saldo < 0);
}

function calculateSaldo() {
  totalSaldo = entries.reduce((total, entry) => {
    if (entry.kind === "pemasukan") {
      return total + entry.amount;
    } else {
      return total - entry.amount;
    }
  }, 0);
}

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

  calculateSaldo();
  calculateStats();
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
  <span class="brand-mobile">Daarulhikam</span>
  <button class="hamburger" on:click={toggleSidebar}>☰</button>
</div>

<!-- Sidebar -->
<div class="sidebar {sidebarOpen ? 'open' : ''}">
  <div class="brand">
    <img src="/logo.png" alt="Logo" />
    <h2>Daarulhikam</h2>
  </div>
  <!-- 🔽 Tambahin button di sini -->
  <button
  on:click={() => goto("/edit")}
  class="table-btn edit-btn"
>
  ✏️ Edit User
</button>

<button
  class="table-btn"
  on:click={() => goto("/table")}
>
  📋 Lihat Data
</button>

<button
  class="table-btn"
  on:click={() => goto("/market")}
>
  🛒 Market
</button>

<button
  class="table-btn admin-btn"
  on:click={() => goto("/admin-market")}
>
  ⚙️ Admin Market
</button>

  <button class="logout-btn" on:click={logout}>🚪 Logout</button>
</div>

<!-- Main -->
<div class="main">
  <div class="dashboard-header">
  <h1>Dashboard {currentUser?.role === "admin" ? "Admin" : "Santri"}</h1>

  {#if currentUser}
    <div class="user-info">
      👤 Login sebagai:
      <span>{currentUser.username}</span>
    </div>
  {/if}
</div>

<!-- Dashboard Cards -->
<div class="stats-grid">

  <div class="stat-card blue">
    <h3>👨‍🎓 Total Santri</h3>
    <p>{totalSantri}</p>
  </div>

  <div class="stat-card green">
    <h3>💰 Total Saldo</h3>
    <p>Rp {formatRupiah(totalSaldo)}</p>
  </div>

  <div
  class="stat-card red clickable"
  on:click={() => (showMinusModal = true)}
>
  <h3>💸 Santri Minus</h3>
  <p>{santriMinus}</p>
</div>

</div>

{#if showMinusModal}
  <div class="modal-overlay" on:click={() => (showMinusModal = false)}>
    <div class="modal-content" on:click|stopPropagation>

      <div class="modal-header">
        <h2>💸 Daftar Santri Minus</h2>

        <button
          class="close-btn"
          on:click={() => (showMinusModal = false)}
        >
          ✖
        </button>
      </div>

      {#if minusUsers.length === 0}
        <p class="empty-text">
          Tidak ada santri dengan saldo minus.
        </p>
      {:else}

        <div class="minus-wrapper">
          {#each minusUsers as user}
            <div class="minus-card">
              <div>
                <h3>{user.username}</h3>
                <p>Saldo Minus</p>
              </div>

              <strong>
                Rp {formatRupiah(Math.abs(user.saldo))}
              </strong>
            </div>
          {/each}
        </div>

      {/if}
    </div>
  </div>
{/if}

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
  .download-wrapper { width:100%; padding:10px; margin-top:20px; background:#ff9800; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:14px; text-align:left; }
  .download-wrapper:hover { background:#eda435; }
  .toggle-wrapper { margin:15px 0; text-align:right; }
  .toggle-btn { padding:10px 18px; border:none; border-radius:6px; background:#43a047; color:#fff; cursor:pointer; font-size:14px; }
  .toggle-btn:hover { background:#2e7d32; }
  .form-section, .data-section { margin-top:20px; animation: fade .3s ease-in-out; }
  @keyframes fade { from { opacity:0; transform:translateY(10px);} to { opacity:1; transform:translateY(0);} }
  @media(max-width:768px){ .mobile-header{display:flex;} .sidebar{transform:translateX(-100%);position:fixed;z-index:1000;} .sidebar.open{transform:translateX(0);} .main{margin-left:0;padding:15px;} table{display:block;overflow-x:auto;font-size:13px;} th,td{white-space:nowrap;} }
  .dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.user-info {
  background: #e3f2fd;
  color: #1565c0;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
}

.user-info span {
  font-weight: bold;
}
.saldo-card {
  background: linear-gradient(135deg, #43a047, #2e7d32);
  color: white;
  padding: 18px;
  border-radius: 12px;
  margin: 15px 0;
  box-shadow: 0 4px 10px rgba(0,0,0,0.12);
}

.saldo-card h3 {
  font-size: 16px;
  margin-bottom: 8px;
}

.saldo-card p {
  font-size: 28px;
  font-weight: bold;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin: 20px 0;
}

.stat-card {
  padding: 20px;
  border-radius: 14px;
  color: white;
  box-shadow: 0 4px 10px rgba(0,0,0,0.12);
  transition: 0.3s;
}

.stat-card:hover {
  transform: translateY(-4px);
}

.stat-card h3 {
  font-size: 15px;
  margin-bottom: 10px;
}

.stat-card p {
  font-size: 28px;
  font-weight: bold;
}

.blue {
  background: linear-gradient(135deg, #1e88e5, #1565c0);
}

.green {
  background: linear-gradient(135deg, #43a047, #2e7d32);
}

.red {
  background: linear-gradient(135deg, #e53935, #b71c1c);
}
.clickable {
  cursor: pointer;
}

.minus-list {
  margin-top: 20px;
  background: #fff;
  padding: 20px;
  border-radius: 14px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.08);
  animation: fade .3s ease;
}

.minus-list h3 {
  margin-bottom: 15px;
  color: #e53935;
}

.minus-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #eee;
}

.minus-item:last-child {
  border-bottom: none;
}

.minus-item strong {
  color: #e53935;
}
.clickable {
  cursor: pointer;
}

/* OVERLAY */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.45);

  display: flex;
  justify-content: center;
  align-items: center;

  z-index: 9999;
  animation: fadeIn 0.25s ease;
}

/* BOX */
.modal-content {
  width: 90%;
  max-width: 500px;

  background: white;
  border-radius: 18px;

  padding: 22px;

  box-shadow: 0 10px 30px rgba(0,0,0,0.18);

  animation: scaleIn 0.25s ease;
}

/* HEADER */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;

  margin-bottom: 20px;
}

.modal-header h2 {
  color: #e53935;
  font-size: 22px;
}

/* CLOSE */
.close-btn {
  border: none;
  background: #f5f5f5;

  width: 35px;
  height: 35px;

  border-radius: 50%;

  cursor: pointer;
  font-size: 16px;

  transition: 0.2s;
}

.close-btn:hover {
  background: #e53935;
  color: white;
}

/* LIST */
.minus-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.minus-card {
  display: flex;
  justify-content: space-between;
  align-items: center;

  background: #fff5f5;

  border-left: 5px solid #e53935;

  padding: 15px;
  border-radius: 12px;
}

.minus-card h3 {
  margin-bottom: 4px;
  color: #333;
}

.minus-card p {
  color: #888;
  font-size: 13px;
}

.minus-card strong {
  color: #e53935;
  font-size: 18px;
}

/* EMPTY */
.empty-text {
  text-align: center;
  color: #666;
  padding: 20px 0;
}

/* ANIMATION */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes scaleIn {
  from {
    transform: scale(0.9);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
.table-btn {
  width: 100%;
  padding: 12px 14px;
  margin-top: 12px;

  background: linear-gradient(135deg, #42a5f5, #1e88e5);
  color: white;

  border: none;
  border-radius: 10px;

  cursor: pointer;

  font-size: 14px;
  font-weight: 600;

  text-align: left;

  transition: all 0.25s ease;

  box-shadow: 0 4px 10px rgba(0,0,0,0.12);
}

/* hover */
.table-btn:hover {
  transform: translateY(-2px);

  background: linear-gradient(135deg, #64b5f6, #1565c0);

  box-shadow: 0 6px 14px rgba(0,0,0,0.18);
}

/* klik */
.table-btn:active {
  transform: scale(0.98);
}

/* khusus admin market */
.admin-btn {
  background: linear-gradient(135deg, #ff7043, #e64a19);
}

.admin-btn:hover {
  background: linear-gradient(135deg, #ff8a65, #d84315);
}

/* khusus edit user */
.edit-btn {
  background: linear-gradient(135deg, #ffa726, #fb8c00);
}

.edit-btn:hover {
  background: linear-gradient(135deg, #ffb74d, #ef6c00);
}
</style>
