
<script>
  import { supabase } from '$lib/supabaseClient';

  let loading = false;
  let successMessage = '';
  let errorMessage = '';

  // =====================================
  // KONFIGURASI
  // =====================================

  const BUCKET = 'bukti-pembayaran';
  const DOCUMENT_BUCKET = 'bukti-pembayaran';

  const MAX_FILE_SIZE = 2 * 1024 * 1024;
  const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024;

  // GANTI DENGAN DATA REKENING ASLI
  const BANK_NAME = 'Bank BRI';
  const ACCOUNT_NUMBER = '551301029259535';
  const ACCOUNT_OWNER = 'Agus Yusuf';

  // =====================================
  // DATA FORM
  // =====================================

  function initialForm() {
    return {
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
    };
  }

  let form = initialForm();

  const pendidikanOptions = [
    'Tidak Sekolah',
    'SD/MI',
    'SMP/MTs',
    'SMA/MA/SMK',
    'D1',
    'D2',
    'D3',
    'D4/S1',
    'S2',
    'S3'
  ];

  const jenisKelaminOptions = [
    'Laki-laki',
    'Perempuan'
  ];

  // =====================================
  // FILE UPLOAD
  // =====================================

  let buktiFile = null;
  let previewBukti = '';

  let kkFile = null;
  let ktpFile = null;

  let kkPreview = '';
  let ktpPreview = '';

  function clearPreview(url) {
    if (url) URL.revokeObjectURL(url);
  }

  function handleFileChange(event) {
    const file = event.currentTarget.files?.[0];

    clearPreview(previewBukti);

    buktiFile = null;
    previewBukti = '';
    errorMessage = '';

    if (!file) return;

    const allowedTypes = [
      'image/png',
      'image/jpeg'
    ];

    if (!allowedTypes.includes(file.type)) {
      errorMessage = 'Format bukti pembayaran harus PNG atau JPG.';
      event.currentTarget.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      errorMessage = 'Ukuran bukti pembayaran maksimal 2 MB.';
      event.currentTarget.value = '';
      return;
    }

    buktiFile = file;
    previewBukti = URL.createObjectURL(file);
  }

  function handleDocumentChange(event, type) {
    const file = event.currentTarget.files?.[0];
    const isKK = type === 'kk';

    if (isKK) {
      clearPreview(kkPreview);
      kkFile = null;
      kkPreview = '';
    } else {
      clearPreview(ktpPreview);
      ktpFile = null;
      ktpPreview = '';
    }

    errorMessage = '';

    if (!file) return;

    const allowedTypes = [
      'image/png',
      'image/jpeg',
      'application/pdf'
    ];

    if (!allowedTypes.includes(file.type)) {
      errorMessage = 'Dokumen harus PNG, JPG, JPEG, atau PDF.';
      event.currentTarget.value = '';
      return;
    }

    if (file.size > MAX_DOCUMENT_SIZE) {
      errorMessage = 'Ukuran setiap dokumen maksimal 5 MB.';
      event.currentTarget.value = '';
      return;
    }

    const preview = file.type.startsWith('image/')
      ? URL.createObjectURL(file)
      : '';

    if (isKK) {
      kkFile = file;
      kkPreview = preview;
    } else {
      ktpFile = file;
      ktpPreview = preview;
    }
  }

  function removeDocument(type) {
    if (type === 'kk') {
      clearPreview(kkPreview);
      kkFile = null;
      kkPreview = '';

      const input = document.getElementById('dokumen_kk');
      if (input) input.value = '';
    } else {
      clearPreview(ktpPreview);
      ktpFile = null;
      ktpPreview = '';

      const input = document.getElementById('dokumen_ktp');
      if (input) input.value = '';
    }
  }

  function removeBukti() {
    clearPreview(previewBukti);

    previewBukti = '';
    buktiFile = null;

    const input = document.getElementById('bukti_pembayaran');
    if (input) input.value = '';
  }

  // =====================================
  // SALIN REKENING
  // =====================================

  async function copyAccountNumber() {
    try {
      await navigator.clipboard.writeText(ACCOUNT_NUMBER);
      successMessage = 'Nomor rekening berhasil disalin!';
      errorMessage = '';
    } catch {
      errorMessage = 'Tidak dapat menyalin nomor rekening.';
    }
  }

  // =====================================
  // UPLOAD DOKUMEN
  // =====================================

  async function uploadDocument(file, folder) {
    if (!file) {
      throw new Error(`File ${folder.toUpperCase()} belum dipilih.`);
    }

    const extension =
      file.name.split('.').pop()?.toLowerCase() || 'bin';

    const filePath =
      `dokumen/${folder}/${crypto.randomUUID()}.${extension}`;

    const { error } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false
      });

    if (error) throw error;

    return filePath;
  }

  // =====================================
  // UPLOAD BUKTI PEMBAYARAN
  // =====================================

  async function uploadPaymentProof(file) {
    const extension = file.type === 'image/png'
      ? 'png'
      : 'jpg';

    const filePath =
      `pendaftaran/${crypto.randomUUID()}.${extension}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false
      });

    if (error) throw error;

    const { data } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(filePath);

    return {
      path: filePath,
      url: data.publicUrl
    };
  }

  // =====================================
  // MEMBERSIHKAN DATA
  // =====================================

  function cleanPayload(buktiUrl, kkPath, ktpPath) {
    const payload = {
      ...form,
      bukti_pembayaran: buktiUrl,
      kk_path: kkPath,
      ktp_path: ktpPath
    };

    const yearFields = [
      'tahun_ayah',
      'tahun_ibu',
      'tahun_wali'
    ];

    for (const key of yearFields) {
      payload[key] = payload[key] === ''
        ? null
        : Number(payload[key]);
    }

    for (const key of Object.keys(payload)) {
      if (payload[key] === '') {
        payload[key] = null;
      }
    }

    return payload;
  }

  // =====================================
  // RESET FORM
  // =====================================

  function resetForm() {
    form = initialForm();

    removeBukti();
    removeDocument('kk');
    removeDocument('ktp');

    for (const id of [
      'bukti_pembayaran',
      'dokumen_kk',
      'dokumen_ktp'
    ]) {
      const input = document.getElementById(id);
      if (input) input.value = '';
    }
  }

  // =====================================
  // SUBMIT FORM
  // =====================================

  async function submitForm(event) {
    event.preventDefault();

    successMessage = '';
    errorMessage = '';

    if (!supabase) {
      errorMessage = 'Supabase client belum tersedia.';
      return;
    }

    if (!form.nama_santri.trim()) {
      errorMessage = 'Nama santri wajib diisi.';
      return;
    }

    if (!kkFile || !ktpFile) {
      errorMessage = 'Silakan upload KK dan KTP terlebih dahulu.';
      return;
    }

    if (!buktiFile) {
      errorMessage = 'Silakan upload bukti pembayaran.';
      return;
    }

    loading = true;

    const uploadedPaths = [];

    try {
      // Upload KK
      const kkPath = await uploadDocument(kkFile, 'kk');
      uploadedPaths.push({
        bucket: DOCUMENT_BUCKET,
        path: kkPath
      });

      // Upload KTP
      const ktpPath = await uploadDocument(ktpFile, 'ktp');
      uploadedPaths.push({
        bucket: DOCUMENT_BUCKET,
        path: ktpPath
      });

      // Upload bukti pembayaran
      const payment = await uploadPaymentProof(buktiFile);

      uploadedPaths.push({
        bucket: BUCKET,
        path: payment.path
      });

      // Simpan ke database
      const payload = cleanPayload(
        payment.url,
        kkPath,
        ktpPath
      );

      const { error: insertError } = await supabase
        .from('pendaftaran_santri')
        .insert([payload]);

      if (insertError) throw insertError;

      successMessage = 'Pendaftaran santri berhasil disimpan!';

      resetForm();

      // Jangan tampilkan pesan sukses dari copy rekening lagi.
      errorMessage = '';

    } catch (error) {
      // Hapus semua file yang berhasil diupload
      for (const item of uploadedPaths) {
        await supabase.storage
          .from(item.bucket)
          .remove([item.path]);
      }

      errorMessage =
        error?.message ||
        'Terjadi kesalahan saat menyimpan pendaftaran.';

    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Form Pendaftaran Santri</title>
  <meta
    name="description"
    content="Formulir pendaftaran santri baru"
  />
</svelte:head>

<div class="page">
  <form class="form-card" on:submit={submitForm}>

    <!-- HEADER -->

    <header class="header">
      <p class="eyebrow">PENERIMAAN SANTRI BARU</p>
      <h1>Form Pendaftaran Santri</h1>
      <p class="intro">
        Silakan isi data calon santri, orang tua, dan wali
        dengan benar.
      </p>
    </header>

    {#if successMessage}
      <div class="alert success" role="status">
        {successMessage}
      </div>
    {/if}

    {#if errorMessage}
      <div class="alert error" role="alert">
        {errorMessage}
      </div>
    {/if}

    <!-- DATA SANTRI -->

    <section>
      <h2>Data Santri</h2>

      <div class="grid">

        <label class="field">
          <span>Nama lengkap santri <b>*</b></span>
          <input
            bind:value={form.nama_santri}
            maxlength="150"
            required
            placeholder="Nama sesuai dokumen"
          />
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
            {#each jenisKelaminOptions as option}
              <option value={option}>{option}</option>
            {/each}
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

    <!-- DATA AYAH -->

    <section>
      <h2>Data Ayah</h2>

      <div class="grid">

        <label class="field">
          <span>Nama ayah</span>
          <input bind:value={form.nama_ayah} maxlength="150" />
        </label>

        <label class="field">
          <span>Tahun lahir ayah</span>
          <input
            bind:value={form.tahun_ayah}
            type="number"
            min="1900"
            max="2100"
          />
        </label>

        <label class="field">
          <span>Pendidikan ayah</span>
          <select bind:value={form.pendidikan_ayah}>
            <option value="">Pilih pendidikan</option>
            {#each pendidikanOptions as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </label>

        <label class="field">
          <span>Pekerjaan ayah</span>
          <input bind:value={form.pekerjaan_ayah} maxlength="100" />
        </label>

        <label class="field">
          <span>Penghasilan ayah</span>
          <input bind:value={form.penghasilan_ayah} maxlength="50" />
        </label>

        <label class="field">
          <span>Nomor HP ayah</span>
          <input bind:value={form.hp_ayah} maxlength="20" type="tel" />
        </label>

      </div>
    </section>

    <!-- DATA IBU -->

    <section>
      <h2>Data Ibu</h2>

      <div class="grid">

        <label class="field">
          <span>Nama ibu</span>
          <input bind:value={form.nama_ibu} maxlength="150" />
        </label>

        <label class="field">
          <span>Tahun lahir ibu</span>
          <input
            bind:value={form.tahun_ibu}
            type="number"
            min="1900"
            max="2100"
          />
        </label>

        <label class="field">
          <span>Pendidikan ibu</span>
          <select bind:value={form.pendidikan_ibu}>
            <option value="">Pilih pendidikan</option>
            {#each pendidikanOptions as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </label>

        <label class="field">
          <span>Pekerjaan ibu</span>
          <input bind:value={form.pekerjaan_ibu} maxlength="100" />
        </label>

        <label class="field">
          <span>Penghasilan ibu</span>
          <input bind:value={form.penghasilan_ibu} maxlength="50" />
        </label>

        <label class="field">
          <span>Nomor HP ibu</span>
          <input bind:value={form.hp_ibu} maxlength="20" type="tel" />
        </label>

      </div>
    </section>

    <!-- DATA WALI -->

    <section>
      <h2>Data Wali (jika ada)</h2>

      <div class="grid">

        <label class="field">
          <span>Nama wali</span>
          <input bind:value={form.nama_wali} maxlength="150" />
        </label>

        <label class="field">
          <span>Tahun lahir wali</span>
          <input
            bind:value={form.tahun_wali}
            type="number"
            min="1900"
            max="2100"
          />
        </label>

        <label class="field">
          <span>Pendidikan wali</span>
          <select bind:value={form.pendidikan_wali}>
            <option value="">Pilih pendidikan</option>
            {#each pendidikanOptions as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </label>

        <label class="field">
          <span>Pekerjaan wali</span>
          <input bind:value={form.pekerjaan_wali} maxlength="100" />
        </label>

        <label class="field">
          <span>Penghasilan wali</span>
          <input bind:value={form.penghasilan_wali} maxlength="50" />
        </label>

      </div>
    </section>

    <!-- JURUSAN -->

    <section>
      <h2>Pilihan Jurusan</h2>

      <label class="field">
        <span>Jurusan yang dipilih</span>
        <input
          bind:value={form.jurusan}
          maxlength="100"
          placeholder="Masukkan pilihan jurusan"
        />
      </label>
    </section>

    <!-- DOKUMEN IDENTITAS -->

    <section>
      <h2>Dokumen Identitas</h2>

      <p class="document-note">
        Upload foto atau scan Kartu Keluarga (KK) dan KTP
        orang tua/wali. Format PNG, JPG, JPEG, atau PDF.
        Maksimal 5 MB setiap file.
      </p>

      <div class="grid">

        <label class="field">
          <span>Kartu Keluarga (KK) <b>*</b></span>

          <input
            id="dokumen_kk"
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            on:change={(event) => handleDocumentChange(event, 'kk')}
            required
          />

          <small>
            {kkFile ? kkFile.name : 'Belum ada file KK dipilih.'}
          </small>
        </label>

        <label class="field">
          <span>KTP orang tua/wali <b>*</b></span>

          <input
            id="dokumen_ktp"
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            on:change={(event) => handleDocumentChange(event, 'ktp')}
            required
          />

          <small>
            {ktpFile ? ktpFile.name : 'Belum ada file KTP dipilih.'}
          </small>
        </label>

      </div>

      {#if kkFile}
        <div class="document-preview">
          <strong>Preview KK</strong>

          {#if kkPreview}
            <img
              src={kkPreview}
              alt="Preview KK"
              class="preview-image"
            />
          {:else}
            <p>File PDF: {kkFile.name}</p>
          {/if}

          <button
            type="button"
            class="remove-button"
            on:click={() => removeDocument('kk')}
          >
            Hapus KK
          </button>
        </div>
      {/if}

      {#if ktpFile}
        <div class="document-preview">
          <strong>Preview KTP</strong>

          {#if ktpPreview}
            <img
              src={ktpPreview}
              alt="Preview KTP"
              class="preview-image"
            />
          {:else}
            <p>File PDF: {ktpFile.name}</p>
          {/if}

          <button
            type="button"
            class="remove-button"
            on:click={() => removeDocument('ktp')}
          >
            Hapus KTP
          </button>
        </div>
      {/if}
    </section>

    <!-- PEMBAYARAN -->

    <section>
      <h2>Pembayaran Pendaftaran</h2>

      <div class="bank-card">

        <div class="bank-header">
          <span>INFORMASI TRANSFER</span>
          <strong>BRI</strong>
        </div>

        <p class="bank-name">{BANK_NAME}</p>

        <p class="bank-label">Nomor rekening</p>

        <div class="rekening-row">
          <strong>{ACCOUNT_NUMBER}</strong>

          <button
            type="button"
            class="copy-button"
            on:click={copyAccountNumber}
          >
            Salin
          </button>
        </div>

        <p class="bank-label">Atas nama</p>

        <strong>{ACCOUNT_OWNER}</strong>

        <p class="bank-note">
          Silakan transfer biaya pendaftaran ke rekening
          BRI di atas. Setelah melakukan pembayaran,
          upload bukti transfer pada kolom berikut.
        </p>

      </div>

      <label class="field">
        <span>Upload foto bukti pembayaran <b>*</b></span>

        <input
          id="bukti_pembayaran"
          type="file"
          accept="image/png,image/jpeg"
          on:change={handleFileChange}
          required
        />

        <small>
          Format PNG, JPG, JPEG. Maksimal 2 MB.
        </small>
      </label>

      {#if previewBukti}
        <div class="preview-container">

          <p>Preview bukti pembayaran:</p>

          <img
            src={previewBukti}
            alt="Preview bukti pembayaran"
            class="preview-image"
          />

          <button
            type="button"
            class="remove-button"
            on:click={removeBukti}
          >
            Hapus foto
          </button>

        </div>
      {/if}

    </section>

    <!-- FOOTER -->

    <footer>

      <p class="required-note">
        <b>*</b> Wajib diisi
      </p>

      <button type="submit" disabled={loading}>
        {loading
          ? 'Mengupload dan menyimpan...'
          : 'Kirim Pendaftaran'}
      </button>

    </footer>

  </form>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    background: #f3f6f4;
    color: #1c2b24;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }

  .page {
    min-height: 100vh;
    padding: 40px 18px;
  }

  .form-card {
    width: min(900px, 100%);
    margin: 0 auto;
    padding: clamp(22px, 4vw, 42px);
    background: #fff;
    border: 1px solid #e1e9e3;
    border-radius: 18px;
    box-shadow: 0 12px 36px rgba(22, 54, 36, .07);
  }

  .header {
    margin-bottom: 30px;
  }

  .eyebrow {
    margin: 0 0 8px;
    color: #278052;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .12em;
  }

  h1 {
    margin: 0;
    font-size: clamp(26px, 4vw, 34px);
  }

  .intro {
    margin: 10px 0 0;
    color: #66736b;
    line-height: 1.6;
  }

  section {
    padding: 25px 0;
    border-top: 1px solid #e9eeea;
  }

  h2 {
    margin: 0 0 18px;
    font-size: 19px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 17px 18px;
  }

  .field {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 7px;
  }

  .field span {
    color: #34443a;
    font-size: 13px;
    font-weight: 650;
  }

  .field b,
  .required-note b {
    color: #c43b36;
  }

  input,
  select,
  textarea {
    width: 100%;
    min-height: 44px;
    padding: 10px 12px;
    border: 1px solid #d5dfd8;
    border-radius: 8px;
    outline: none;
    background: #fff;
    color: #1c2b24;
    font: inherit;
    font-size: 14px;
  }

  textarea {
    resize: vertical;
  }

  input:focus,
  select:focus,
  textarea:focus {
    border-color: #278052;
    box-shadow: 0 0 0 3px rgba(39, 128, 82, .12);
  }

  .full {
    grid-column: 1 / -1;
  }

  .document-note {
    margin: -6px 0 18px;
    color: #718077;
    font-size: 13px;
    line-height: 1.6;
  }

  .document-preview {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    max-width: 100%;
    margin: 16px 14px 0 0;
    padding: 14px;
    background: #f5f8f5;
    border: 1px solid #e1e9e3;
    border-radius: 10px;
  }

  .document-preview p {
    margin: 0;
    color: #66736b;
    font-size: 13px;
    overflow-wrap: anywhere;
  }

  .preview-container {
    margin-top: 18px;
    padding: 16px;
    background: #f5f8f5;
    border: 1px solid #e1e9e3;
    border-radius: 10px;
  }

  .preview-container p {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 700;
  }

  .preview-image {
    display: block;
    max-width: 100%;
    max-height: 300px;
    object-fit: contain;
    border-radius: 8px;
  }

  .remove-button {
    margin-top: 12px;
    background: #b93832;
  }

  .remove-button:hover {
    background: #982c27;
  }

  small {
    color: #718077;
    font-size: 12px;
  }

  /* REKENING BANK */

  .bank-card {
    padding: 22px;
    margin-bottom: 22px;
    background: #f2f8f3;
    border: 1px solid #dce8df;
    border-radius: 12px;
  }

  .bank-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #247849;
    font-size: 12px;
    font-weight: 800;
  }

  .bank-header strong {
    padding: 8px 16px;
    background: #247849;
    color: white;
    border-radius: 6px;
    font-size: 16px;
  }

  .bank-name {
    margin: 18px 0;
    font-weight: 700;
  }

  .bank-label {
    margin: 13px 0 6px;
    color: #718077;
    font-size: 12px;
  }

  .rekening-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .rekening-row strong {
    font-size: 20px;
    letter-spacing: 1px;
    overflow-wrap: anywhere;
  }

  .copy-button {
    min-height: 36px;
    padding: 0 15px;
    background: #247849;
    font-size: 12px;
    flex-shrink: 0;
  }

  .bank-note {
    margin: 18px 0 0;
    padding-top: 14px;
    border-top: 1px solid #dce8df;
    color: #66736b;
    font-size: 13px;
    line-height: 1.6;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-top: 22px;
    border-top: 1px solid #e9eeea;
  }

  .required-note {
    margin: 0;
    color: #6b776f;
    font-size: 13px;
  }

  button {
    min-height: 46px;
    padding: 0 22px;
    border: 0;
    border-radius: 9px;
    background: #247849;
    color: #fff;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  button:disabled {
    cursor: wait;
    opacity: .65;
  }

  .alert {
    margin: 18px 0;
    padding: 12px 14px;
    border-radius: 8px;
    font-size: 14px;
  }

  .success {
    background: #eaf7ee;
    color: #1e6b3c;
  }

  .error {
    background: #fff0ef;
    color: #a52e28;
  }

  @media (max-width: 620px) {
    .page {
      padding: 16px 10px;
    }

    .form-card {
      padding: 22px 17px;
    }

    .grid {
      grid-template-columns: 1fr;
    }

    .full {
      grid-column: auto;
    }

    footer {
      align-items: stretch;
      flex-direction: column;
    }

    footer button {
      width: 100%;
    }

    .rekening-row strong {
      font-size: 16px;
    }
  }
</style>