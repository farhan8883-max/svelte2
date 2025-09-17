<script lang="ts">
  import { supabase } from "$lib/supabaseClient";
  import { onMount } from "svelte";

  interface Entry {
    id: number;
    date: string;
    amount: number;
    kind: string;
    name: string;
    user_id: number;
  }

  let entries: Entry[] = [];
  let saldo = 0;
  let message = "";

  let user: any = null;
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("user");
    if (stored) {
      user = JSON.parse(stored);
    }
  }

  onMount(async () => {
    if (user) {
      await loadEntries();
      hitungSaldo();
    } else {
      message = "Kamu belum login";
    }
  });

  async function loadEntries() {
    const { data, error } = await supabase
      .from("entries")
      .select("*")
      .eq("user_id", user.id)
      .order("id", { ascending: false });

    if (error) {
      message = "Gagal load data: " + error.message;
    } else {
      entries = data as Entry[];
      hitungSaldo();
    }
  }

  function hitungSaldo() {
    saldo = entries.reduce((total, e) => {
      return e.kind === "pemasukan"
        ? total + e.amount
        : total - e.amount;
    }, 0);
  }

  // 🔥 Helper format rupiah
  function formatRupiah(value: number): string {
    return new Intl.NumberFormat("id-ID").format(value);
  }
</script>


<style>
  body {
    margin: 0;
    font-family: Arial, sans-serif;
    background: #f5f6fa;
  }

  /* Layout utama */
  .container {
    display: flex;
    height: 100vh;
  }

  /* Sidebar */
  .sidebar {
    width: 260px;
    background: #1e90ff;
    color: #fff;
    padding: 20px;
    display: flex;
    flex-direction: column;
  }

  .sidebar h2 {
    text-align: center;
    margin-top: 0;
    margin-bottom: 20px;
  }

  .sidebar .card {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 15px;
    margin-bottom: 20px;
  }

  .sidebar .saldo {
    font-size: 22px;
    font-weight: bold;
    color: #ffeb3b;
  }

  .sidebar .profile-id {
    font-size: 14px;
    color: #f1f1f1;
  }

  .sidebar a {
    color: #fff;
    text-decoration: none;
    margin: 8px 0;
    display: block;
    padding: 8px;
    border-radius: 6px;
    transition: 0.2s;
  }

  .sidebar a:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  /* Content */
  .content {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
  }

  .table-card {
    background: #fff;
    border-radius: 14px;
    padding: 15px;
    box-shadow: 0 4px 10px rgba(0,0,0,0.08);
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
  }

  .data-table th, .data-table td {
    padding: 12px;
    border-bottom: 1px solid #eee;
    text-align: center;
  }

  .data-table th {
    background: #3498db;
    color: #fff;
  }

  .data-table tr:hover {
    background: #f9f9f9;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .container {
      flex-direction: column;
    }
    .sidebar {
      width: auto;
      flex-direction: row;
      justify-content: space-around;
    }
    .content {
      padding: 10px;
    }
  }
</style>

<div class="container">
  <!-- Sidebar -->
  <div class="sidebar">

    <!-- Card Saldo -->
   <!-- Card Saldo -->
<div class="card">
  <h3>Sisa Uang Jajan</h3>
  <div class="saldo">Rp {formatRupiah(saldo)}</div>
</div>

    <!-- Card Profile -->
    <div class="card">
      <h3>Profil Santri</h3>
      <div><b>Nama:</b> {user?.username}</div>
      <div class="profile-id"><b>ID:</b> {user?.id}</div>
    </div>
  </div>

  <!-- Content -->
  <div class="content">
    <div class="table-card">
      {#if message}
        <p>{message}</p>
      {/if}

      {#if entries.length === 0}
        <p>Belum ada data transaksi.</p>
      {:else}
        <table class="data-table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Tanggal</th>
              <th>Jumlah</th>
              <th>Jenis</th>
            </tr>
          </thead>
         <tbody>
  {#each entries as e}
    <tr>
      <td>{e.name}</td>
      <td>{e.date}</td>
      <td>Rp {formatRupiah(e.amount)}</td>
      <td>{e.kind}</td>
    </tr>
  {/each}
</tbody>
        </table>
      {/if}
    </div>
  </div>
</div>
