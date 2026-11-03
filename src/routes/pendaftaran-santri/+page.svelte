<script>
  import { supabase } from '$lib/supabaseClient';

  let loading = false;
  let successMessage = '';
  let errorMessage = '';

  const initialForm = () => ({
    nama_santri: '',
    tempat_lahir: '',
    tanggal_lahir: '',
    jenis_kelamin: '',
    nik: '',
    nisn: '',
    alamat: '',
    rt: '',
    rw: '',
    nama_perumahan: '',
    nama_kelurahan: '',
    nama_kecamatan: '',
    hp_santri: '',

    nama_ayah: '',
    tahun_ayah: '',
    pendidikan_ayah: '',
    pekerjaan_ayah: '',
    penghasilan_ayah: '',
    hp_ayah: '',

    nama_ibu: '',
    tahun_ibu: '',
    pendidikan_ibu: '',
    pekerjaan_ibu: '',
    penghasilan_ibu: '',
    hp_ibu: '',

    nama_wali: '',
    tahun_wali: '',
    pendidikan_wali: '',
    pekerjaan_wali: '',
    penghasilan_wali: '',

    jurusan: ''
  });

  let form = initialForm();

  const pendidikanOptions = [
    'Tidak Sekolah', 'SD/MI', 'SMP/MTs', 'SMA/MA/SMK',
    'D1', 'D2', 'D3', 'D4/S1', 'S2', 'S3'
  ];

  const jenisKelaminOptions = ['Laki-laki', 'Perempuan'];

  function cleanPayload() {
    const payload = { ...form };

    // Kolom tahun bertipe SMALLINT; kirim null jika tidak diisi.
    for (const key of ['tahun_ayah', 'tahun_ibu', 'tahun_wali']) {
      payload[key] = payload[key] === '' ? null : Number(payload[key]);
    }

    // Kolom opsional kosong dikirim sebagai null.
    for (const key of Object.keys(payload)) {
      if (payload[key] === '') payload[key] = null;
    }

    return payload;
  }

  async function submitForm(event) {
    event.preventDefault();
    successMessage = '';
    errorMessage = '';

    if (!supabase) {
      errorMessage = 'Supabase client belum diberikan ke komponen ini.';
      return;
    }

    if (!form.nama_santri.trim()) {
      errorMessage = 'Nama santri wajib diisi.';
      return;
    }

    loading = true;

    try {
      const { error } = await supabase
        .from('pendaftaran_santri')
        .insert([cleanPayload()]);

      if (error) throw error;

      successMessage = 'Pendaftaran santri berhasil disimpan.';
      form = initialForm();
    } catch (error) {
      errorMessage = error?.message || 'Terjadi kesalahan saat menyimpan pendaftaran.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Form Pendaftaran Santri</title>
  <meta name="description" content="Formulir pendaftaran santri baru" />
</svelte:head>

<div class="page">
  <form class="form-card" on:submit={submitForm}>
    <header class="header">
      <p class="eyebrow">PENERIMAAN SANTRI BARU</p>
      <h1>Form Pendaftaran Santri</h1>
      <p class="intro">Silakan isi data calon santri, orang tua, dan wali dengan benar.</p>
    </header>

    {#if successMessage}
      <div class="alert success" role="status">{successMessage}</div>
    {/if}
    {#if errorMessage}
      <div class="alert error" role="alert">{errorMessage}</div>
    {/if}

    <section>
      <h2>Data Santri</h2>
      <div class="grid">
        <label class="field">
          <span>Nama lengkap santri <b>*</b></span>
          <input bind:value={form.nama_santri} maxlength="150" required placeholder="Nama sesuai dokumen" />
        </label>
        <label class="field">
          <span>Tempat lahir</span>
          <input bind:value={form.tempat_lahir} maxlength="100" />
        </label>
        <label class="field">
          <span>Tanggal lahir</span>
          <input type="date" bind:value={form.tanggal_lahir} />
        </label>
        <label class="field">
          <span>Jenis kelamin</span>
          <select bind:value={form.jenis_kelamin}>
            <option value="">Pilih jenis kelamin</option>
            {#each jenisKelaminOptions as option}<option value={option}>{option}</option>{/each}
          </select>
        </label>
        <label class="field">
          <span>NIK</span>
          <input bind:value={form.nik} maxlength="20" inputmode="numeric" />
        </label>
        <label class="field">
          <span>NISN</span>
          <input bind:value={form.nisn} maxlength="20" inputmode="numeric" />
        </label>
        <label class="field full">
          <span>Alamat lengkap</span>
          <textarea bind:value={form.alamat} rows="3"></textarea>
        </label>
        <label class="field">
          <span>RT</span>
          <input bind:value={form.rt} maxlength="5" />
        </label>
        <label class="field">
          <span>RW</span>
          <input bind:value={form.rw} maxlength="5" />
        </label>
        <label class="field">
          <span>Nama perumahan</span>
          <input bind:value={form.nama_perumahan} maxlength="150" />
        </label>
        <label class="field">
          <span>Kelurahan / desa</span>
          <input bind:value={form.nama_kelurahan} maxlength="100" />
        </label>
        <label class="field">
          <span>Kecamatan</span>
          <input bind:value={form.nama_kecamatan} maxlength="100" />
        </label>
        <label class="field">
          <span>Nomor HP santri</span>
          <input bind:value={form.hp_santri} maxlength="20" type="tel" />
        </label>
      </div>
    </section>

    <section>
      <h2>Data Ayah</h2>
      <div class="grid">
        <label class="field"><span>Nama ayah</span><input bind:value={form.nama_ayah} maxlength="150" /></label>
        <label class="field"><span>Tahun lahir ayah</span><input bind:value={form.tahun_ayah} type="number" min="1900" max="2100" /></label>
        <label class="field">
          <span>Pendidikan ayah</span>
          <select bind:value={form.pendidikan_ayah}>
            <option value="">Pilih pendidikan</option>
            {#each pendidikanOptions as option}<option value={option}>{option}</option>{/each}
          </select>
        </label>
        <label class="field"><span>Pekerjaan ayah</span><input bind:value={form.pekerjaan_ayah} maxlength="100" /></label>
        <label class="field"><span>Penghasilan ayah</span><input bind:value={form.penghasilan_ayah} maxlength="50" placeholder="Contoh: Rp2.000.000/bulan" /></label>
        <label class="field"><span>Nomor HP ayah</span><input bind:value={form.hp_ayah} maxlength="20" type="tel" /></label>
      </div>
    </section>

    <section>
      <h2>Data Ibu</h2>
      <div class="grid">
        <label class="field"><span>Nama ibu</span><input bind:value={form.nama_ibu} maxlength="150" /></label>
        <label class="field"><span>Tahun lahir ibu</span><input bind:value={form.tahun_ibu} type="number" min="1900" max="2100" /></label>
        <label class="field">
          <span>Pendidikan ibu</span>
          <select bind:value={form.pendidikan_ibu}>
            <option value="">Pilih pendidikan</option>
            {#each pendidikanOptions as option}<option value={option}>{option}</option>{/each}
          </select>
        </label>
        <label class="field"><span>Pekerjaan ibu</span><input bind:value={form.pekerjaan_ibu} maxlength="100" /></label>
        <label class="field"><span>Penghasilan ibu</span><input bind:value={form.penghasilan_ibu} maxlength="50" placeholder="Contoh: Rp2.000.000/bulan" /></label>
        <label class="field"><span>Nomor HP ibu</span><input bind:value={form.hp_ibu} maxlength="20" type="tel" /></label>
      </div>
    </section>

    <section>
      <h2>Data Wali (jika ada)</h2>
      <div class="grid">
        <label class="field"><span>Nama wali</span><input bind:value={form.nama_wali} maxlength="150" /></label>
        <label class="field"><span>Tahun lahir wali</span><input bind:value={form.tahun_wali} type="number" min="1900" max="2100" /></label>
        <label class="field">
          <span>Pendidikan wali</span>
          <select bind:value={form.pendidikan_wali}>
            <option value="">Pilih pendidikan</option>
            {#each pendidikanOptions as option}<option value={option}>{option}</option>{/each}
          </select>
        </label>
        <label class="field"><span>Pekerjaan wali</span><input bind:value={form.pekerjaan_wali} maxlength="100" /></label>
        <label class="field"><span>Penghasilan wali</span><input bind:value={form.penghasilan_wali} maxlength="50" /></label>
      </div>
    </section>

    <section>
      <h2>Pilihan Jurusan</h2>
      <label class="field">
        <span>Jurusan yang dipilih</span>
        <input bind:value={form.jurusan} maxlength="100" placeholder="Masukkan pilihan jurusan" />
      </label>
    </section>

    <footer>
      <p class="required-note"><b>*</b> Wajib diisi</p>
      <button type="submit" disabled={loading}>
        {loading ? 'Menyimpan...' : 'Kirim Pendaftaran'}
      </button>
    </footer>
  </form>
</div>

<style>
  :global(*) { box-sizing: border-box; }
  :global(body) { margin: 0; background: #f3f6f4; color: #1c2b24; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .page { min-height: 100vh; padding: 40px 18px; }
  .form-card { width: min(900px, 100%); margin: 0 auto; padding: clamp(22px, 4vw, 42px); background: #fff; border: 1px solid #e1e9e3; border-radius: 18px; box-shadow: 0 12px 36px rgba(22, 54, 36, .07); }
  .header { margin-bottom: 30px; }
  .eyebrow { margin: 0 0 8px; color: #278052; font-size: 12px; font-weight: 800; letter-spacing: .12em; }
  h1 { margin: 0; font-size: clamp(26px, 4vw, 34px); letter-spacing: -.03em; }
  .intro { margin: 10px 0 0; color: #66736b; line-height: 1.6; }
  section { padding: 25px 0; border-top: 1px solid #e9eeea; }
  h2 { margin: 0 0 18px; font-size: 19px; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 17px 18px; }
  .field { display: flex; min-width: 0; flex-direction: column; gap: 7px; }
  .field span { color: #34443a; font-size: 13px; font-weight: 650; }
  .field b, .required-note b { color: #c43b36; }
  input, select, textarea { width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid #d5dfd8; border-radius: 8px; outline: none; background: #fff; color: #1c2b24; font: inherit; font-size: 14px; }
  textarea { resize: vertical; }
  input:focus, select:focus, textarea:focus { border-color: #278052; box-shadow: 0 0 0 3px rgba(39, 128, 82, .12); }
  .full { grid-column: 1 / -1; }
  footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 22px; border-top: 1px solid #e9eeea; }
  .required-note { margin: 0; color: #6b776f; font-size: 13px; }
  button { min-height: 46px; padding: 0 22px; border: 0; border-radius: 9px; background: #247849; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
  button:hover:not(:disabled) { background: #1d633c; }
  button:disabled { cursor: wait; opacity: .65; }
  .alert { margin: 18px 0; padding: 12px 14px; border-radius: 8px; font-size: 14px; }
  .success { background: #eaf7ee; color: #1e6b3c; }
  .error { background: #fff0ef; color: #a52e28; }
  @media (max-width: 620px) {
    .page { padding: 16px 10px; }
    .form-card { padding: 22px 17px; border-radius: 13px; }
    .grid { grid-template-columns: 1fr; }
    .full { grid-column: auto; }
    footer { align-items: stretch; flex-direction: column; }
    button { width: 100%; }
  }
</style>
