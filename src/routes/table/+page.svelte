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
  let activeSection: "all" | "pemasukan" | "pengeluaran" = "all";
  let showForm = false;

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

    if (currentUser?.role === "santri") {
      selectedUserId = currentUser.id;
    }

    await loadEntries();
  });

  async function loadUsers() {
    const { data, error } = await supabase
      .from("users")
      .select("id, username, role");

    if (error) {
      message = error.message;
    } else {
      users = data as User[];
    }
  }

  async function loadEntries() {
    let query = supabase
      .from("entries")
      .select(`
        id,
        name,
        date,
        amount,
        kind,
        user_id,
        users(username)
      `)
      .order("id", { ascending: false });

    if (currentUser?.role === "santri") {
      query = query.eq("user_id", currentUser.id);
    } else if (selectedUserId) {
      query = query.eq("user_id", selectedUserId);
    }

    const { data, error } = await query;

    if (error) {
      message = error.message;
    } else {
      entries = data as unknown as Entry[];
      applyFilter();
    }
  }

  function applyFilter() {
    if (activeSection === "all") {
      filteredEntries = entries;
    } else {
      filteredEntries = entries.filter(
        (e) => e.kind === activeSection
      );
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
      currentUser?.role === "admin"
        ? user_id || selectedUserId
        : currentUser?.id;

    if (!entryUserId) {
      message = "Pilih user dulu";
      return;
    }

    if (editingId) {
      const { error } = await supabase
        .from("entries")
        .update({
          name,
          date,
          amount: Number(amount),
          kind,
          user_id: entryUserId
        })
        .eq("id", editingId);

      if (error) {
        message = error.message;
        return;
      }

      message = "Data berhasil diupdate";
    } else {
      const { error } = await supabase
        .from("entries")
        .insert([
          {
            name,
            date,
            amount: Number(amount),
            kind,
            user_id: entryUserId
          }
        ]);

      if (error) {
        message = error.message;
        return;
      }

      message = "Data berhasil ditambahkan";
    }

    resetForm();
    await loadEntries();
  }

  async function deleteEntry(id: number) {
    if (!confirm("Yakin hapus data?")) return;

    const { error } = await supabase
      .from("entries")
      .delete()
      .eq("id", id);

    if (error) {
      message = error.message;
      return;
    }

    message = "Data berhasil dihapus";
    await loadEntries();
  }

  function editEntry(entry: Entry) {
    editingId = entry.id;
    name = entry.name;
    date = entry.date;
    amount = entry.amount;
    kind = entry.kind;
    user_id = entry.user_id;

    showForm = true;
  }

  function resetForm() {
    editingId = null;
    name = "";
    date = "";
    amount = "";
    kind = "pemasukan";
    user_id = "";
  }

  function toggleForm() {
    showForm = !showForm;

    if (!showForm) {
      resetForm();
    }
  }

  function formatRupiah(value: number) {
    return new Intl.NumberFormat("id-ID").format(value);
  }
</script>

<div class="table-page">

  <!-- HEADER -->
  <div class="table-header">

    <div>
      <h1>📋 Data Santri</h1>
      <p>Kelola pemasukan & pengeluaran santri</p>
    </div>

    <button on:click={() => goto("/dashboard")}>
      ⬅️ Dashboard
    </button>

  </div>

  <!-- CONTENT -->
  <div class="content-card">

    <p class="message">{message}</p>

    <!-- FILTER USER -->
    {#if currentUser?.role === "admin"}
      <div class="user-filter">
        <label>Pilih Santri</label>

        <select bind:value={selectedUserId} on:change={loadEntries}>
          <option value="">-- Semua Santri --</option>

          {#each users.filter((u) => u.role === "santri") as u}
            <option value={u.id}>
              {u.username}
            </option>
          {/each}
        </select>
      </div>
    {/if}

    <!-- FILTER -->
    <div class="filters">

      <button
        class:active={activeSection === "all"}
        on:click={() => setSection("all")}
      >
        Semua
      </button>

      <button
        class:active={activeSection === "pemasukan"}
        on:click={() => setSection("pemasukan")}
      >
        Pemasukan
      </button>

      <button
        class:active={activeSection === "pengeluaran"}
        on:click={() => setSection("pengeluaran")}
      >
        Pengeluaran
      </button>

    </div>

    <!-- BUTTON -->
    <div class="top-action">
      <button class="add-btn" on:click={toggleForm}>
        {showForm ? "⬅️ Tutup Form" : "➕ Tambah Data"}
      </button>
    </div>

    <!-- FORM -->
    {#if showForm}

      <form on:submit|preventDefault={addOrUpdateEntry}>

        <input
          type="text"
          placeholder="Nama catatan"
          bind:value={name}
        />

        <input
          type="date"
          bind:value={date}
        />

        <input
          type="text"
          placeholder="Jumlah"
          bind:value={amount}
          on:input={(e) => {
            const raw = e.currentTarget.value.replace(/\D/g, "");

            amount = raw ? Number(raw) : "";

            e.currentTarget.value =
              raw ? formatRupiah(Number(raw)) : "";
          }}
        />

        <select bind:value={kind}>
          <option value="pemasukan">Pemasukan</option>
          <option value="pengeluaran">Pengeluaran</option>
        </select>

        {#if currentUser?.role === "admin"}
          <select bind:value={user_id}>
            <option value="">-- Pilih Santri --</option>

            {#each users.filter((u) => u.role === "santri") as u}
              <option value={u.id}>
                {u.username}
              </option>
            {/each}
          </select>
        {/if}

        <div class="form-buttons">
          <button type="submit">
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

    {/if}

    <!-- TABLE -->
    <div class="table-wrapper">

      {#if filteredEntries.length === 0}

        <p>Belum ada data.</p>

      {:else}

        <table>

          <thead>
            <tr>

              {#if currentUser?.role === "admin"}
                <th>Santri</th>
              {/if}

              <th>Nama</th>
              <th>Tanggal</th>
              <th>Jumlah</th>
              <th>Jenis</th>
              <th>Aksi</th>

            </tr>
          </thead>

          <tbody>

            {#each filteredEntries as e}

              <tr>

                {#if currentUser?.role === "admin"}
                  <td>{e.users?.username}</td>
                {/if}

                <td>{e.name}</td>
                <td>{e.date}</td>
                <td>Rp {formatRupiah(e.amount)}</td>
                <td>{e.kind}</td>

                <td>

                  <button
                    class="edit-btn"
                    on:click={() => editEntry(e)}
                  >
                    ✏️
                  </button>

                  <button
                    class="delete-btn"
                    on:click={() => deleteEntry(e.id)}
                  >
                    🗑️
                  </button>

                </td>

              </tr>

            {/each}

          </tbody>

        </table>

      {/if}

    </div>

  </div>

</div>

<style>

  *{
    box-sizing:border-box;
    font-family:"Segoe UI",sans-serif;
  }

  body{
    background:#f4f6f9;
  }

  .table-page{
    padding:25px;
  }

  .table-header{
    display:flex;
    justify-content:space-between;
    align-items:center;
    margin-bottom:20px;
    flex-wrap:wrap;
    gap:15px;
  }

  .table-header h1{
    font-size:28px;
    color:#222;
  }

  .table-header p{
    color:#666;
    margin-top:5px;
  }

  .table-header button{
    background:#1e88e5;
    color:white;
    border:none;
    padding:12px 18px;
    border-radius:10px;
    cursor:pointer;
    font-weight:600;
  }

  .content-card{
    background:white;
    border-radius:18px;
    padding:25px;
    box-shadow:0 4px 14px rgba(0,0,0,0.06);
  }

  .message{
    color:red;
    margin-bottom:15px;
  }

  .user-filter{
    margin-bottom:20px;
  }

  .user-filter label{
    display:block;
    margin-bottom:8px;
    font-weight:600;
  }

  select,
  input{
    width:100%;
    padding:12px;
    border:1px solid #ddd;
    border-radius:10px;
    margin-bottom:12px;
  }

  .filters{
    display:flex;
    gap:10px;
    flex-wrap:wrap;
    margin-bottom:20px;
  }

  .filters button{
    border:none;
    padding:10px 18px;
    border-radius:10px;
    cursor:pointer;
    background:#e0e0e0;
  }

  .filters button.active{
    background:#1e88e5;
    color:white;
  }

  .top-action{
    margin-bottom:20px;
  }

  .add-btn{
    background:#43a047;
    color:white;
    border:none;
    padding:12px 18px;
    border-radius:10px;
    cursor:pointer;
  }

  form{
    margin-bottom:25px;
    background:#fafafa;
    padding:20px;
    border-radius:14px;
  }

  .form-buttons{
    display:flex;
    gap:10px;
  }

  .form-buttons button{
    border:none;
    padding:10px 18px;
    border-radius:10px;
    cursor:pointer;
  }

  .form-buttons button[type="submit"]{
    background:#1e88e5;
    color:white;
  }

  .cancel-btn{
    background:#ccc;
  }

  .table-wrapper{
    overflow-x:auto;
  }

  table{
    width:100%;
    border-collapse:collapse;
  }

  thead{
    background:#1e88e5;
    color:white;
  }

  th,
  td{
    padding:14px;
    text-align:left;
    border-bottom:1px solid #eee;
  }

  tr:hover{
    background:#f9fbff;
  }

  .edit-btn{
    background:#ff9800;
    border:none;
    padding:8px 12px;
    border-radius:8px;
    cursor:pointer;
    margin-right:5px;
  }

  .delete-btn{
    background:#e53935;
    border:none;
    padding:8px 12px;
    border-radius:8px;
    cursor:pointer;
    color:white;
  }

  @media(max-width:768px){

    .table-page{
      padding:15px;
    }

    .content-card{
      padding:18px;
    }

    .table-header{
      flex-direction:column;
      align-items:flex-start;
    }

  }

</style>