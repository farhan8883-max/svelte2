<script lang="ts">
  import { supabase } from "$lib/supabaseClient";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation"; // buat navigasi ke dashboard

  interface User {
    id: number;
    email: string;
    password_hash: string;
    full_name: string;
  }

  let users: User[] = [];
  let editingId: number | null = null;

  // form fields
  let email = "";
  let password = "";
  let full_name = "";

  let message = "";

  onMount(async () => {
    await loadUsers();
  });

  async function loadUsers() {
    const { data, error } = await supabase.from("users").select("*").order("id");
    if (error) {
      message = "❌ Gagal ambil data: " + error.message;
    } else {
      users = data as User[];
    }
  }

  async function saveUser() {
    if (!email || !full_name || (!editingId && !password)) {
      message = "⚠️ Semua field wajib diisi (password wajib saat tambah)";
      return;
    }

    const data: any = { email, full_name };

    if (password) {
      // konsisten dengan register: encode password pakai btoa
      data.password_hash = btoa(password);
    }

    if (editingId) {
      const { error } = await supabase.from("users").update(data).eq("id", editingId);
      if (error) {
        message = "❌ Gagal update: " + error.message;
        return;
      }
      message = "✅ User berhasil diupdate";
    } else {
      const { error } = await supabase.from("users").insert([data]);
      if (error) {
        message = "❌ Gagal tambah user: " + error.message;
        return;
      }
      message = "✅ User berhasil ditambahkan";
    }

    resetForm();
    await loadUsers();
  }

  function editUser(u: User) {
    editingId = u.id;
    email = u.email;
    full_name = u.full_name;
    password = ""; // kosongkan (isi jika ingin ganti password)
  }

  async function deleteUser(id: number) {
    if (!confirm("Yakin hapus user ini?")) return;
    const { error } = await supabase.from("users").delete().eq("id", id);
    if (error) {
      message = "❌ Gagal hapus: " + error.message;
      return;
    }
    message = "✅ User berhasil dihapus";
    await loadUsers();
  }

  function resetForm() {
    editingId = null;
    email = "";
    full_name = "";
    password = "";
  }

  function backToDashboard() {
    goto("/dashboard"); // arahkan ke halaman dashboard
  }
</script>

<div class="container">
  <h1>Kelola Users</h1>
  <p>📌Hanya bisa edit user saja tidak bisa menambahakan user❗❗</p>

  <!-- Tombol kembali -->
  <button class="back-btn" on:click={backToDashboard}>⬅️ Kembali ke Dashboard</button>

  <p class="msg">{message}</p>

  <!-- FORM EDIT / TAMBAH -->
  <form on:submit|preventDefault={saveUser}>
    <input type="email" placeholder="Email" bind:value={email} required />
    <input type="text" placeholder="Nama Lengkap" bind:value={full_name} required />
    <input type="password" placeholder="Password (isi jika ganti)" bind:value={password} />

    <button type="submit">{editingId ? "Update User" : "Tambah User"}</button>
    {#if editingId}
      <button type="button" on:click={resetForm}>Batal Edit</button>
    {/if}
  </form>

  <hr />

  <!-- TABEL USERS (responsive scroll) -->
  {#if users.length === 0}
    <p>Belum ada user.</p>
  {:else}
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Email</th>
            <th>Nama</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {#each users as u}
            <tr>
              <td>{u.id}</td>
              <td>{u.email}</td>
              <td>{u.full_name}</td>
              <td>
                <button class="edit" on:click={() => editUser(u)}>✏️ Edit</button>
                <button class="delete" on:click={() => deleteUser(u.id)}>🗑️ Hapus</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .container {
    padding: 20px;
    max-width: 900px;
    margin: auto;
  }

  .back-btn {
    margin-bottom: 15px;
    padding: 10px 16px;
    border: none;
    border-radius: 6px;
    background: #f81919;
    color: #fff;
    cursor: pointer;
  }
  .back-btn:hover {
    background: #5a6268;
  }

  form {
    margin-bottom: 20px;
    background: #fff;
    padding: 15px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }
  form input {
    display: block;
    width: 100%;
    padding: 10px;
    margin: 8px 0;
    border: 1px solid #ccc;
    border-radius: 6px;
  }
  form button {
    margin-right: 10px;
    padding: 10px 16px;
    border: none;
    border-radius: 6px;
    background: #1e88e5;
    color: #fff;
    cursor: pointer;
  }
  form button:hover {
    background: #1565c0;
  }

  /* TABLE WRAPPER (buat scroll) */
  .table-container {
    overflow-x: auto;
    border-radius: 8px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    min-width: 600px; /* supaya bisa scroll di layar kecil */
    background: #fff;
  }
  th, td {
    padding: 10px;
    border-bottom: 1px solid #eee;
    text-align: left;
  }
  thead {
    background: #1e88e5;
    color: #fff;
  }
  td button {
    margin-right: 5px;
    padding: 6px 10px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  td button.edit {
    background: #ff9800;
    color: #fff;
  }
  td button.delete {
    background: #e53935;
    color: #fff;
  }
  .msg {
    margin: 10px 0;
    font-weight: bold;
  }
</style>
