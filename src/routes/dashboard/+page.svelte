<script lang="ts">
  import { supabase } from "$lib/supabaseClient";
  import { onMount } from "svelte";

  interface Entry {
    id: number;
    date: string;
    amount: number;
    kind: string;
    name: string;
    user_id: string;
    users?: { username: string };
  }

  let entries: Entry[] = [];
  let name = "";
  let date = "";
  let amount: number | string = "";
  let kind = "pemasukan";
  let user_id = "";
  let message = "";
  let editingId: number | null = null;
  let sidebarOpen = false; // untuk toggle sidebar di HP

  let users: { id: string; username: string }[] = [];

  onMount(async () => {
    await loadUsers();
    await loadEntries();
  });

  async function loadUsers() {
    const { data, error } = await supabase.from("users").select("id, username");
    if (error) {
      message = "Gagal ambil users: " + error.message;
    } else {
      users = data;
    }
  }

  async function loadEntries() {
  const { data, error } = await supabase
    .from("entries")
    .select(`
      id, name, date, amount, kind, user_id,
      users ( username )
    `)
    .order("id", { ascending: false });

  if (error) {
    message = "Gagal load data: " + error.message;
  } else {
    entries = data as unknown as Entry[]; // paksa cocok
  }
}

  async function addOrUpdateEntry() {
    if (!name || !date || !amount || !user_id) {
      message = "Semua field wajib diisi";
      return;
    }

    if (editingId) {
      const { error } = await supabase
        .from("entries")
        .update({ name, date, amount: Number(amount), kind, user_id })
        .eq("id", editingId);
      if (error) {
        message = "Gagal update: " + error.message;
        return;
      }
      message = "Data berhasil diupdate";
    } else {
      const { error } = await supabase
        .from("entries")
        .insert([{ name, date, amount: Number(amount), kind, user_id }]);
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
  function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

</script>

<!-- Hamburger button -->
<div class="mobile-header">
  <span class="brand-mobile">Project Hafiz</span>
  <button class="hamburger" on:click={toggleSidebar}>
    ☰
  </button>
</div>

<!-- Sidebar -->
<div class="sidebar {sidebarOpen ? 'open' : ''}">
  <div class="brand">
    <img src="/logo.png" alt="Logo" />
    <h2>Project Hafiz</h2>
  </div>
  <!-- <a href="#">📦 Dekorasi</a>
  <a href="#">🎁 Bakket/Asset</a> -->
</div>

<!-- Main Content -->
<div class="main">
  <h1>Dashboard Admin</h1>
  <p class="message">{message}</p>

  <form on:submit|preventDefault={addOrUpdateEntry}>
    <input type="text" placeholder="Nama catatan" bind:value={name} />
    <input type="date" bind:value={date} />
    <input
  type="text"
  placeholder="Jumlah"
  bind:value={amount}
  on:input={(e) => {
    const raw = e.currentTarget.value.replace(/\D/g, ""); // hapus semua selain angka
    amount = raw ? Number(raw) : "";
    e.currentTarget.value = raw ? formatRupiah(Number(raw)) : "";
  }}
/>
    <select bind:value={kind}>
      <option value="pemasukan">Pemasukan</option>
      <option value="pengeluaran">Pengeluaran</option>
    </select>

    <select bind:value={user_id}>
      <option value="">-- Pilih Santri --</option>
      {#each users as u}
        <option value={u.id}>{u.username}</option>
      {/each}
    </select>

    <button type="submit">{editingId ? "Update" : "Tambah"}</button>
    {#if editingId}
      <button type="button" on:click={resetForm}>Batal</button>
    {/if}
  </form>

  <hr />

  {#if entries.length === 0}
    <p>Belum ada data.</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>Santri</th>
          <th>Nama Catatan</th>
          <th>Tanggal</th>
          <th>Jumlah</th>
          <th>Jenis</th>
          <th>Aksi</th>
        </tr>
      </thead>
      <tbody>
        {#each entries as e}
          <tr>
            <td>{e.users?.username}</td>
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
</div>

<style>
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  }

  body {
    background-color: #f4f6f9;
    color: #333;
  }

  /* Mobile header */
.mobile-header {
  display: none;
  background: #1e88e5;
  color: #fff;
  padding: 12px 15px;
  align-items: center;
  justify-content: space-between; /* bikin brand kiri, hamburger kanan */
}

.mobile-header .brand-mobile {
  font-size: 18px;
  font-weight: bold;
}

.mobile-header .hamburger {
  font-size: 22px;
  background: none;
  border: none;
  color: #fff;
  cursor: pointer;
}


  
  /* Sidebar */
  .sidebar {
    width: 250px;
    background: #1e88e5;
    color: #fff;
    min-height: 100vh;
    padding: 20px;
    position: fixed;
    top: 0;
    left: 0;
    transition: transform 0.3s;
  }

  .sidebar .brand {
    display: flex;
    align-items: center;
    margin-bottom: 20px;
  }

  .sidebar .brand img {
    width: 40px;
    height: 40px;
    margin-right: 10px;
    border-radius: 50%;
    background: #fff;
  }

  .sidebar h2 {
    font-size: 20px;
  }

  .sidebar a {
    display: block;
    color: #fff;
    text-decoration: none;
    padding: 10px 15px;
    margin: 8px 0;
    border-radius: 6px;
    transition: 0.3s;
    background: rgba(255, 255, 255, 0.1);
  }

  .sidebar a:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  .main {
    margin-left: 270px;
    padding: 20px;
    transition: all 0.3s;
  }

  h1 {
    font-size: 24px;
    margin-bottom: 15px;
  }

  .message {
    color: red;
    margin-bottom: 10px;
  }

  form {
    background: #fff;
    padding: 20px;
    border-radius: 10px;
    margin-bottom: 20px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  form input,
  form select {
    width: 100%;
    padding: 10px;
    margin: 8px 0;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
  }

  form button {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    margin: 5px 5px 5px 0;
    cursor: pointer;
    font-size: 14px;
  }

  form button[type="submit"] {
    background: #1e88e5;
    color: #fff;
  }

  form button[type="button"] {
    background: #ccc;
    color: #333;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  thead {
    background: #1e88e5;
    color: #fff;
  }

  th,
  td {
    padding: 12px 15px;
    text-align: left;
    font-size: 14px;
    border-bottom: 1px solid #eee;
  }

  tr:hover {
    background: #f5faff;
  }

  td button {
    padding: 6px 12px;
    border: none;
    border-radius: 6px;
    margin: 2px;
    font-size: 13px;
    cursor: pointer;
  }

  td button:first-child {
    background: #ff9800;
    color: #fff;
  }

  td button:last-child {
    background: #e53935;
    color: #fff;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .mobile-header {
      display: flex;
    }

    .sidebar {
      transform: translateX(-100%);
      position: fixed;
      top: 0;
      left: 0;
      height: 100%;
      z-index: 1000;
    }

    .sidebar.open {
      transform: translateX(0);
    }

    .main {
      margin-left: 0;
      padding: 15px;
    }

    table {
      display: block;
      overflow-x: auto;
      font-size: 13px;
    }

    th,
    td {
      padding: 8px;
      font-size: 13px;
      white-space: nowrap;
    }
  }
</style>
