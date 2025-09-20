<script lang="ts">
  import { supabase } from "$lib/supabaseClient";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

  interface Entry {
    id: number;
    date: string;
    amount: number;
    kind: string;
    name: string;
    user_id: number;
  }

  let entries: Entry[] = [];
  let pemasukan: Entry[] = [];
  let pengeluaran: Entry[] = [];
  let saldo = 0;
  let totalPemasukan = 0;
  let totalPengeluaran = 0;
  let message = "";

  let user: any = null;
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("user");
    if (stored) {
      user = JSON.parse(stored);
    }
  }

  let activeSection: "semua" | "pemasukan" | "pengeluaran" = "semua";

  onMount(async () => {
    if (user) {
      await loadEntries();
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
      pemasukan = entries.filter(e => e.kind === "pemasukan");
      pengeluaran = entries.filter(e => e.kind === "pengeluaran");
      hitungSaldo();
    }
  }

  function hitungSaldo() {
    totalPemasukan = pemasukan.reduce((t, e) => t + e.amount, 0);
    totalPengeluaran = pengeluaran.reduce((t, e) => t + e.amount, 0);
    saldo = totalPemasukan - totalPengeluaran;
  }

  function formatRupiah(value: number): string {
    return new Intl.NumberFormat("id-ID").format(value);
  }

  function logout() {
    localStorage.removeItem("user");
    goto("/login");
  }

  function exportCSV(data: Entry[], filename: string) {
    if (data.length === 0) {
      alert("Tidak ada data untuk diexport");
      return;
    }

    const header = ["Keterangan", "Tanggal", "Jumlah", "Jenis"];
    const rows = data.map(e => [
      e.name,
      e.date,
      e.amount,
      e.kind
    ]);

    const csvContent =
      [header, ...rows]
        .map(r => r.map(String).map(v => `"${v.replace(/"/g, '""')}"`).join(","))
        .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${filename}_${user?.username || "user"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
</script>

<style>
  body {
    margin: 0;
    font-family: Arial, sans-serif;
    background: #f5f6fa;
  }

  .container {
    display: flex;
    height: 100vh;
  }

  .sidebar {
    width: 260px;
    background: #1e90ff;
    color: #fff;
    padding: 20px;
    display: flex;
    flex-direction: column;
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

  .content {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
  }

  .section-buttons {
    margin-bottom: 15px;
  }

  .section-buttons button {
    margin-right: 8px;
    padding: 8px 14px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    background: #ecf0f1;
    transition: 0.2s;
  }

  .section-buttons button.active {
    background: #3498db;
    color: #fff;
    font-weight: bold;
  }

  .table-card {
    background: #fff;
    border-radius: 14px;
    padding: 15px;
    margin-bottom: 25px;
    box-shadow: 0 4px 10px rgba(0,0,0,0.08);
  }

  .table-card h3 {
    margin-top: 0;
    margin-bottom: 10px;
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

  .logout-btn {
    margin-top: auto;
    padding: 10px;
    background: #e74c3c;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
  }

  .logout-btn:hover {
    background: #c0392b;
  }

  .export-btn {
    margin-bottom: 10px;
    padding: 8px 12px;
    background: #27ae60;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .export-btn:hover {
    background: #1e8449;
  }

  .total {
    margin-top: 10px;
    font-weight: bold;
    text-align: right;
  }

  /* Mobile Header */
  .mobile-header {
    display: none;
    background: #1e90ff;
    color: #fff;
    padding: 12px 15px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .mobile-header .brand {
    font-size: 18px;
    font-weight: bold;
  }

  .table-wrapper {
  width: 100%;
  overflow-x: auto;
}

.data-table {
  min-width: 600px; /* biar ada lebar minimal */
}


  @media (max-width: 768px) {
    .container {
      flex-direction: column;
    }
    .sidebar {
      padding: 2px;
      width: auto;
      flex-direction: row;
      justify-content: space-around;
    }
    .content {
      padding: 10px;
    }
  }
</style>

<div class="mobile-header">
  <span class="brand">PPs Daarulhikam</span>
  <button class="logout-btn" on:click={logout}>🚪 Logout</button>
</div>


<div class="container">
  <!-- Sidebar -->
  <div class="sidebar">
    <div class="card">
      <h3>Sisa Uang Jajan</h3>
      <div class="saldo">Rp {formatRupiah(saldo)}</div>
    </div>

    <div class="card">
      <h3>Profil Santri</h3>
      <div><b>Nama:</b> {user?.username}</div>
      <div class="profile-id"><b>ID:</b> {user?.id}</div>
    </div>
  </div>

  <!-- Content -->
  <div class="content">
    {#if message}
      <p>{message}</p>
    {/if}

    {#if entries.length === 0}
      <p>Belum ada data transaksi.</p>
    {:else}
      <!-- Tombol Section -->
      <div class="section-buttons">
        <button class:active={activeSection === "semua"} on:click={() => activeSection = "semua"}>Semua</button>
        <button class:active={activeSection === "pemasukan"} on:click={() => activeSection = "pemasukan"}>Pemasukan</button>
        <button class:active={activeSection === "pengeluaran"} on:click={() => activeSection = "pengeluaran"}>Pengeluaran</button>
      </div>

<!-- Section: Semua -->
{#if activeSection === "semua"}
  <div class="table-card">
    <h3>Semua Transaksi</h3>
    <button on:click={() => exportCSV(entries, "semua_transaksi")} class="export-btn">⬇️ Export Semua</button>

    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Keterangan</th>
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
    </div>
  </div>
{/if}

<!-- Section: Pemasukan -->
{#if activeSection === "pemasukan"}
  <div class="table-card">
    <h3>Pemasukan</h3>
    <button on:click={() => exportCSV(pemasukan, "pemasukan")} class="export-btn">⬇️ Export Pemasukan</button>

    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Keterangan</th>
            <th>Tanggal</th>
            <th>Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {#each pemasukan as e}
            <tr>
              <td>{e.name}</td>
              <td>{e.date}</td>
              <td>Rp {formatRupiah(e.amount)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="total">Total Pemasukan: Rp {formatRupiah(totalPemasukan)}</div>
  </div>
{/if}

<!-- Section: Pengeluaran -->
{#if activeSection === "pengeluaran"}
  <div class="table-card">
    <h3>Pengeluaran</h3>
    <button on:click={() => exportCSV(pengeluaran, "pengeluaran")} class="export-btn">⬇️ Export Pengeluaran</button>

    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Keterangan</th>
            <th>Tanggal</th>
            <th>Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {#each pengeluaran as e}
            <tr>
              <td>{e.name}</td>
              <td>{e.date}</td>
              <td>Rp {formatRupiah(e.amount)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="total">Total Pengeluaran: Rp {formatRupiah(totalPengeluaran)}</div>
  </div>
{/if}

    {/if}
  </div>
</div>
