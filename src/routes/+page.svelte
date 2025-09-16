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
</script>

<h1>Catatan Keuangan</h1>

{#if error}
  <p style="color:red">{error}</p>
{/if}

<form on:submit|preventDefault={addEntry}>
  <input type="text" bind:value={name} placeholder="Nama" />
  <input type="date" bind:value={date} />
  <input type="text" bind:value={amount} placeholder="Jumlah" />
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
  <table border="1" cellpadding="5">
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
          <td>{e.amount}</td>
          <td>{e.kind}</td>
          <td><button on:click={() => removeEntry(e.id)}>Hapus</button></td>
        </tr>
      {/each}
    </tbody>
  </table>

  <p><strong>Total Pemasukan:</strong> {totalPemasukan}</p>
  <p><strong>Total Pengeluaran:</strong> {totalPengeluaran}</p>
  <p><strong>Saldo:</strong> {saldo}</p>
{/if}
