<script lang="ts">
  import { supabase } from "$lib/supabaseClient";
  import { onMount } from "svelte";

  interface Entry {
    id: number;
    name: string;
    date: string;
    amount: number;
    kind: "pemasukan" | "pengeluaran";
  }

  let entries: Entry[] = [];
  let name = "";
  let date = "";
  let amount: string | number = "";
  let kind: "pemasukan" | "pengeluaran" = "pemasukan";
  let error = "";
  let loading = false;

  onMount(() => {
    load();
  });

  async function load() {
    loading = true;
    const { data, error: err } = await supabase
      .from("entries")
      .select("*")
      .order("id", { ascending: false });

    loading = false;

    if (err) {
      console.error(err);
      error = err.message;
    } else {
      entries = data as Entry[];
      error = "";
    }
  }

  async function addEntry() {
    error = "";
    const amt = parseInt(String(amount).replace(/\D/g, ""), 10);

    if (!name.trim()) {
      error = "Nama wajib diisi.";
      return;
    }
    if (!date) {
      error = "Tanggal wajib diisi.";
      return;
    }
    if (!amt || amt <= 0) {
      error = "Masukkan jumlah uang yang valid.";
      return;
    }

    const { data, error: err } = await supabase
      .from("entries")
      .insert([{ name: name.trim(), date, amount: amt, kind }])
      .select()
      .single();

    if (err) {
      console.error(err);
      error = err.message;
      return;
    }

    // Tambahkan entry baru langsung ke tabel
    entries = [data as Entry, ...entries];
    resetForm();
  }

  async function removeEntry(id: number) {
    if (!confirm("Hapus catatan ini?")) return;

    const { error: err } = await supabase
      .from("entries")
      .delete()
      .eq("id", id);

    if (err) {
      console.error(err);
      error = err.message;
      return;
    }

    // Hapus entry langsung dari tabel
    entries = entries.filter((e) => e.id !== id);
  }

  function resetForm() {
    name = "";
    date = "";
    amount = "";
    kind = "pemasukan";
  }

  $: totalPemasukan = entries
    .filter((e) => e.kind === "pemasukan")
    .reduce((s, e) => s + e.amount, 0);

  $: totalPengeluaran = entries
    .filter((e) => e.kind === "pengeluaran")
    .reduce((s, e) => s + e.amount, 0);

  $: saldo = totalPemasukan - totalPengeluaran;

  function formatCurrency(value: number) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
    }).format(value);
  }
</script>

<style>
  h1 {
    text-align: center;
    color: #333;
  }

  form {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 20px;
    justify-content: center;
  }

  input, select, button {
    padding: 8px;
    font-size: 14px;
    border: 1px solid #ccc;
    border-radius: 5px;
  }

  button {
    background-color: #4CAF50;
    color: white;
    cursor: pointer;
    transition: 0.3s;
  }

  button:hover {
    background-color: #45a049;
  }

  .table-container {
    overflow-x: auto;
    margin-top: 10px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    min-width: 600px;
  }

  th, td {
    padding: 10px;
    text-align: center;
    border-bottom: 1px solid #ddd;
  }

  th {
    background-color: #f2f2f2;
  }

  tr:hover {
    background-color: #f9f9f9;
  }

  p {
    text-align: center;
    font-weight: bold;
  }

  .error {
    color: red;
    text-align: center;
    margin-bottom: 10px;
  }
</style>

<h1>Catatan Keuangan</h1>

{#if error}
  <p class="error">{error}</p>
{/if}

<form on:submit|preventDefault={addEntry}>
  <input type="text" bind:value={name} placeholder="Nama" />
  <input type="date" bind:value={date} />
  <input type="number" bind:value={amount} placeholder="Jumlah" min="1" />
  <select bind:value={kind}>
    <option value="pemasukan">Pemasukan</option>
    <option value="pengeluaran">Pengeluaran</option>
  </select>
  <button type="submit">Tambah</button>
</form>

<hr />

{#if loading}
  <p>Loading...</p>
{:else if entries.length === 0}
  <p>Belum ada data.</p>
{:else}
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>Nama</th>
          <th>Tanggal</th>
          <th>Jumlah</th>
          <th>Jenis</th>
          <th>Aksi</th>
        </tr>
      </thead>
      <tbody>
        {#each entries as e}
          <tr>
            <td>{e.name}</td>
            <td>{e.date}</td>
            <td>{formatCurrency(e.amount)}</td>
            <td>{e.kind}</td>
            <td><button on:click={() => removeEntry(e.id)}>Hapus</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p><strong>Total Pemasukan:</strong> {formatCurrency(totalPemasukan)}</p>
  <p><strong>Total Pengeluaran:</strong> {formatCurrency(totalPengeluaran)}</p>
  <p><strong>Saldo:</strong> {formatCurrency(saldo)}</p>
{/if}
