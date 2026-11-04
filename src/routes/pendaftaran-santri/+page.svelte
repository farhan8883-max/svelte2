
<script>
  import { supabase } from '$lib/supabaseClient';

  // ==========================================
  // KONFIGURASI
  // ==========================================

  const BUCKET = 'bukti-pembayaran';
  const DOCUMENT_BUCKET = 'bukti-pembayaran';

  const BIAYA_PENDAFTARAN = 350000;

  const BANK_NAME = 'Bank BRI';
  const ACCOUNT_NUMBER = '551301029259535';
  const ACCOUNT_OWNER = 'Agus Yusuf';

  const MAX_FILE_SIZE = 2 * 1024 * 1024;
  const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024;

  const formatRupiah = (value) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(value);

  // ==========================================
  // STATE
  // ==========================================

  let loading = false;
  let showGuide = true;

  let successMessage = '';
  let errorMessage = '';

  function openGuide() {
    showGuide = true;
  }

  function closeGuide() {
    showGuide = false;
  }

  // ==========================================
  // DATA FORM
  // ==========================================

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
      penghasilan_wali: ''
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

  // ==========================================
  // FILE STATE
  // ==========================================

  let buktiFile = null;
  let previewBukti = '';

  let kkFile = null;
  let ktpFile = null;

  let kkPreview = '';
  let ktpPreview = '';

  function clearPreview(url) {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }

  // ==========================================
  // VALIDASI BUKTI PEMBAYARAN
  // ==========================================

  function handleFileChange(event) {
    const file = event.currentTarget.files?.[0];

    clearPreview(previewBukti);

    buktiFile = null;
    previewBukti = '';
    errorMessage = '';

    if (!file) return;

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      errorMessage = 'Bukti pembayaran harus PNG atau JPG.';
      event.currentTarget.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      errorMessage = 'Bukti pembayaran maksimal 2 MB.';
      event.currentTarget.value = '';
      return;
    }

    buktiFile = file;
    previewBukti = URL.createObjectURL(file);
  }

  // ==========================================
  // VALIDASI KK DAN KTP
  // ==========================================

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
      errorMessage = 'Ukuran dokumen maksimal 5 MB.';
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

  // ==========================================
  // HAPUS FILE
  // ==========================================

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

    errorMessage = '';
  }

  function removeBukti() {
    clearPreview(previewBukti);

    buktiFile = null;
    previewBukti = '';

    const input = document.getElementById('bukti_pembayaran');

    if (input) input.value = '';

    errorMessage = '';
  }

  // ==========================================
  // SALIN REKENING
  // ==========================================

  async function copyAccountNumber() {
    try {
      await navigator.clipboard.writeText(ACCOUNT_NUMBER);

      successMessage = 'Nomor rekening berhasil disalin!';
      errorMessage = '';
    } catch (error) {
      successMessage = '';
      errorMessage = 'Gagal menyalin nomor rekening.';
    }
  }

  // ==========================================
  // UPLOAD KK DAN KTP
  // ==========================================

  async function uploadDocument(file, folder) {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'bin';

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

  // ==========================================
  // UPLOAD BUKTI PEMBAYARAN
  // ==========================================

  async function uploadPaymentProof(file) {
    const extension = file.type === 'image/png' ? 'png' : 'jpg';

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

  // ==========================================
  // MEMBERSIHKAN PAYLOAD DATABASE
  // ==========================================

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

  // ==========================================
  // RESET FORM
  // ==========================================

  function resetForm() {
    clearPreview(previewBukti);
    clearPreview(kkPreview);
    clearPreview(ktpPreview);

    form = initialForm();

    buktiFile = null;
    kkFile = null;
    ktpFile = null;

    previewBukti = '';
    kkPreview = '';
    ktpPreview = '';

    for (const id of [
      'bukti_pembayaran',
      'dokumen_kk',
      'dokumen_ktp'
    ]) {
      const input = document.getElementById(id);

      if (input) input.value = '';
    }
  }

  // ==========================================
  // SUBMIT PENDAFTARAN
  // ==========================================

  async function submitForm(event) {
    event.preventDefault();

    if (loading) return;

    successMessage = '';
    errorMessage = '';

    // Periksa Supabase
    if (!supabase) {
      errorMessage = 'Supabase client belum tersedia.';
      return;
    }

    // Periksa nama santri
    if (!form.nama_santri.trim()) {
      errorMessage = 'Nama santri wajib diisi.';
      return;
    }

    // Periksa KK
    if (!kkFile) {
      errorMessage = 'Pendaftaran gagal! Dokumen KK wajib diupload.';
      return;
    }

    // Periksa KTP
    if (!ktpFile) {
      errorMessage = 'Pendaftaran gagal! Dokumen KTP wajib diupload.';
      return;
    }

    // Periksa bukti pembayaran
    if (!buktiFile) {
      errorMessage =
        'Pendaftaran gagal! Bukti pembayaran Rp350.000 wajib diupload.';
      return;
    }

    loading = true;

    const uploadedPaths = [];

    try {
      // 1. Upload KK
      const kkPath = await uploadDocument(kkFile, 'kk');

      uploadedPaths.push({
        bucket: DOCUMENT_BUCKET,
        path: kkPath
      });

      // 2. Upload KTP
      const ktpPath = await uploadDocument(ktpFile, 'ktp');

      uploadedPaths.push({
        bucket: DOCUMENT_BUCKET,
        path: ktpPath
      });

      // 3. Upload bukti pembayaran
      const payment = await uploadPaymentProof(buktiFile);

      uploadedPaths.push({
        bucket: BUCKET,
        path: payment.path
      });

      // 4. Siapkan data
      const payload = cleanPayload(
        payment.url,
        kkPath,
        ktpPath
      );

      // 5. Simpan ke database
      const { error: insertError } = await supabase
        .from('pendaftaran_santri')
        .insert([payload]);

      if (insertError) {
        throw insertError;
      }

      // 6. Berhasil
      resetForm();

      successMessage =
        'Alhamdulillah! Pendaftaran santri berhasil dikirim.';

      errorMessage = '';

      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });

    } catch (error) {
      console.error('Kesalahan pendaftaran:', error);

      // Bersihkan file yang sudah terupload jika database gagal
      for (const item of uploadedPaths) {
        try {
          const { error: removeError } = await supabase.storage
            .from(item.bucket)
            .remove([item.path]);

          if (removeError) {
            console.error('Gagal membersihkan file:', removeError);
          }
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
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
  <title>Form Pendaftaran Santri | Daarulhikam</title>
  <meta
    name="description"
    content="Formulir Pendaftaran Santri Baru Daarulhikam Boarding School"
  />
</svelte:head>

<div class="page">

  <!-- FLOATING PETUNJUK -->

  <button
    type="button"
    class="floating-guide"
    on:click={openGuide}
    aria-label="Buka petunjuk pendaftaran"
  >
    <span class="question-icon">?</span>
    <span>Petunjuk</span>
  </button>

  <!-- MODAL PETUNJUK OTOMATIS -->

  {#if showGuide}

    <div class="modal-overlay">

      <div
        class="guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
      >

        <div class="modal-header">

          <div class="guide-icon">📖</div>

          <div class="modal-heading">
            <h2 id="guide-title">Petunjuk Pendaftaran</h2>
            <p>Ikuti tiga langkah berikut dengan benar.</p>
          </div>

          <button
            type="button"
            class="close-modal"
            on:click={closeGuide}
            aria-label="Tutup"
          >
            ×
          </button>

        </div>

        <div class="guide-steps">

          <div class="guide-step">

            <div class="step-number">1</div>
            <div class="step-icon">📝</div>

            <div class="step-content">
              <h3>Isi Formulir Lengkap</h3>

              <p>
                Isi semua data calon santri, orang tua,
                dan wali dengan benar.
              </p>

              <div class="step-tip">
                Jika ada data teks opsional yang tidak dimiliki,
                isi dengan <strong>xxxx</strong>.
                Kolom angka, tanggal, dan pilihan opsional boleh dikosongkan.
              </div>
            </div>

          </div>

          <div class="guide-step">

            <div class="step-number">2</div>
            <div class="step-icon">🏦</div>

            <div class="step-content">
              <h3>Bayar Uang Pendaftaran</h3>

              <p>
                Salin nomor rekening dan transfer biaya
                pendaftaran sebesar:
              </p>

              <div class="step-tip">
                <strong>{formatRupiah(BIAYA_PENDAFTARAN)}</strong>
                <br />
                Bank BRI - {ACCOUNT_OWNER}
              </div>
            </div>

          </div>

          <div class="guide-step">

            <div class="step-number">3</div>
            <div class="step-icon">📸</div>

            <div class="step-content">
              <h3>Upload Bukti & Dokumen</h3>

              <p>
                Screenshot bukti transfer setelah pembayaran berhasil.
                Kemudian upload bukti pembayaran, KK, dan KTP orang tua/wali.
              </p>

              <div class="step-tip warning-tip">
                Ketiga file wajib diupload. Tanpa bukti pembayaran,
                pendaftaran tidak bisa dikirim.
              </div>
            </div>

          </div>

        </div>

        <button
          type="button"
          class="understand-button"
          on:click={closeGuide}
        >
          ✓ Mengerti, Mulai Pendaftaran
        </button>

      </div>

    </div>

  {/if}

  <!-- HERO -->

  <header class="hero">

    <div class="hero-content">

      <div class="hero-badge">
        PENERIMAAN SANTRI BARU
      </div>

      <h1>
        Form Pendaftaran
        <span>Santri</span>
      </h1>

      <p>
        Bergabunglah bersama kami untuk menjadi
        generasi Qur'ani yang berakhlak mulia.
      </p>

    </div>

    <div class="price-card">

      <div class="price-label">
        🏷️ Biaya Pendaftaran
      </div>

      <div class="price-value">
        {formatRupiah(BIAYA_PENDAFTARAN)}
      </div>

      <small>Biaya pendaftaran santri baru</small>

    </div>

  </header>

  <!-- FORM UTAMA -->

  <form class="form-card" on:submit={submitForm}>

    {#if successMessage}
      <div class="alert success" role="status">
        ✓ {successMessage}
      </div>
    {/if}

    {#if errorMessage}
      <div class="alert error" role="alert">
        ! {errorMessage}
      </div>
    {/if}

    <!-- DATA SANTRI -->

    <section>

      <div class="section-heading">
        <div class="section-icon">👤</div>

        <div>
          <h2>Data Santri</h2>
          <p>Informasi pribadi calon santri</p>
        </div>
      </div>

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

      <div class="section-heading">
        <div class="section-icon">👨</div>

        <div>
          <h2>Data Ayah</h2>
          <p>Informasi ayah calon santri</p>
        </div>
      </div>

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

      <div class="section-heading">
        <div class="section-icon">👩</div>

        <div>
          <h2>Data Ibu</h2>
          <p>Informasi ibu calon santri</p>
        </div>
      </div>

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

      <div class="section-heading">
        <div class="section-icon">👥</div>

        <div>
          <h2>Data Wali</h2>
          <p>Isi jika memiliki wali selain orang tua</p>
        </div>
      </div>

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

    <!-- DOKUMEN IDENTITAS -->

    <section>

      <div class="section-heading">
        <div class="section-icon">📁</div>

        <div>
          <h2>Dokumen Identitas</h2>
          <p>Upload KK dan KTP orang tua/wali</p>
        </div>
      </div>

      <div class="info-box">
        <span>ℹ</span>

        Dokumen KK dan KTP wajib diupload.
        Format PNG, JPG, JPEG, atau PDF.
        Ukuran maksimal 5 MB setiap file.
      </div>

      <div class="upload-grid">

        <!-- KK -->

        <div class="upload-card">

          <div class="upload-icon">📄</div>

          <h3>Kartu Keluarga (KK) <b>*</b></h3>

          <p>Upload foto atau scan KK</p>

          <label class="upload-button">

            <input
              id="dokumen_kk"
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              on:change={(event) => handleDocumentChange(event, 'kk')}
              required
            />

            <span>↑ Pilih File KK</span>

          </label>

          <small>Maksimal 5 MB</small>

          {#if kkFile}

            <div class="file-selected">
              <span>✓</span>
              <span class="file-name">{kkFile.name}</span>

              <button
                type="button"
                class="remove-file"
                on:click={() => removeDocument('kk')}
              >
                Hapus
              </button>
            </div>

            {#if kkPreview}
              <img
                src={kkPreview}
                alt="Preview KK"
                class="preview-image"
              />
            {:else}
              <div class="pdf-preview">
                📕 Dokumen PDF: {kkFile.name}
              </div>
            {/if}

          {:else}

            <div class="empty-file">
              Belum ada file KK
            </div>

          {/if}

        </div>

        <!-- KTP -->

        <div class="upload-card">

          <div class="upload-icon">🪪</div>

          <h3>KTP Orang Tua/Wali <b>*</b></h3>

          <p>Upload foto atau scan KTP</p>

          <label class="upload-button">

            <input
              id="dokumen_ktp"
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              on:change={(event) => handleDocumentChange(event, 'ktp')}
              required
            />

            <span>↑ Pilih File KTP</span>

          </label>

          <small>Maksimal 5 MB</small>

          {#if ktpFile}

            <div class="file-selected">
              <span>✓</span>
              <span class="file-name">{ktpFile.name}</span>

              <button
                type="button"
                class="remove-file"
                on:click={() => removeDocument('ktp')}
              >
                Hapus
              </button>
            </div>

            {#if ktpPreview}
              <img
                src={ktpPreview}
                alt="Preview KTP"
                class="preview-image"
              />
            {:else}
              <div class="pdf-preview">
                📕 Dokumen PDF: {ktpFile.name}
              </div>
            {/if}

          {:else}

            <div class="empty-file">
              Belum ada file KTP
            </div>

          {/if}

        </div>

      </div>

    </section>

    <!-- PEMBAYARAN -->

    <section>

      <div class="section-heading">
        <div class="section-icon">💳</div>

        <div>
          <h2>Pembayaran Pendaftaran</h2>
          <p>Informasi biaya dan rekening pembayaran</p>
        </div>
      </div>

      <!-- HARGA -->

      <div class="payment-price">

        <div>
          <span>Biaya Pendaftaran Santri Baru</span>
          <small>Wajib dibayarkan sebelum mengirim formulir</small>
        </div>

        <strong>{formatRupiah(BIAYA_PENDAFTARAN)}</strong>

      </div>

      <!-- PERINGATAN WAJIB BAYAR -->

      <div class="payment-warning">

        <div class="warning-icon">!</div>

        <div>
          <strong>Perhatian! Bukti pembayaran wajib diupload.</strong>

          <p>
            Silakan transfer sebesar
            <strong>{formatRupiah(BIAYA_PENDAFTARAN)}</strong>.
            Setelah pembayaran berhasil, screenshot bukti transfer
            dan upload pada formulir ini. Jika bukti pembayaran
            tidak diupload, pendaftaran tidak dapat dikirim
            dan akan dinyatakan gagal.
          </p>
        </div>

      </div>

      <!-- INFORMASI BANK -->

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
            ▢ Salin
          </button>

        </div>

        <p class="bank-label">Atas nama</p>

        <strong>{ACCOUNT_OWNER}</strong>

        <div class="bank-note">
          ℹ Silakan transfer sesuai nominal pendaftaran
          sebesar <strong>{formatRupiah(BIAYA_PENDAFTARAN)}</strong>.
          Pastikan nomor rekening dan nama penerima sudah benar.
        </div>

      </div>

      <!-- UPLOAD BUKTI -->

      <div class="field">

        <span>Upload Screenshot Bukti Pembayaran <b>*</b></span>

        <label class="payment-upload">

          <input
            id="bukti_pembayaran"
            type="file"
            accept="image/png,image/jpeg"
            on:change={handleFileChange}
            required
          />

          <span class="payment-upload-icon">☁</span>

          <strong>Pilih Foto Bukti Transfer</strong>

          <small>PNG, JPG, JPEG - Maksimal 2 MB</small>

        </label>

      </div>

      {#if previewBukti}

        <div class="payment-preview">

          <div class="preview-heading">

            <strong>Preview Bukti Pembayaran</strong>

            <button
              type="button"
              class="remove-file"
              on:click={removeBukti}
            >
              Hapus Foto
            </button>

          </div>

          <img
            src={previewBukti}
            alt="Preview bukti pembayaran"
            class="preview-image payment-image"
          />

          <p>{buktiFile?.name}</p>

        </div>

      {/if}

    </section>

    <!-- CATATAN AKHIR -->

    <div class="final-note">
      <span>✓</span>

      Pastikan data santri, dokumen KK, KTP,
      dan bukti pembayaran sudah benar sebelum
      mengirim formulir pendaftaran.
    </div>

    <!-- FOOTER -->

    <footer>

      <p class="required-note">
        <b>*</b> Wajib diisi
      </p>

      <button
        type="submit"
        class="submit-button"
        disabled={loading}
      >

        {#if loading}
          <span class="spinner"></span>
          Mengupload dan menyimpan...
        {:else}
          <span>➤</span>
          Kirim Pendaftaran
        {/if}

      </button>

    </footer>

  </form>

  <div class="page-footer">
    Daarulhikam Boarding School
    <span>•</span>
    Penerimaan Santri Baru
  </div>

</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    background: #f3f7f4;
    color: #193d2c;
    font-family: Inter, Arial, sans-serif;
  }

  :global(button),
  :global(input),
  :global(select),
  :global(textarea) {
    font: inherit;
  }

  .page {
    min-height: 100vh;
    padding: 32px 18px;
    overflow: hidden;
  }

  /* FLOATING GUIDE */

  .floating-guide {
    position: fixed;
    z-index: 50;
    right: 18px;
    top: 45%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 9px;
    border: 1px solid #d5e8dc;
    border-radius: 18px;
    background: white;
    color: #176640;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 8px 25px rgba(20,70,43,.18);
    animation: float 3s ease-in-out infinite;
  }

  .question-icon {
    display: grid;
    place-items: center;
    width: 43px;
    height: 43px;
    border-radius: 50%;
    background: #176c43;
    color: white;
    font-size: 25px;
  }

  @keyframes float {
    0%,100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
  }

  /* MODAL */

  .modal-overlay {
    position: fixed;
    z-index: 100;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(9,30,19,.68);
    backdrop-filter: blur(6px);
    overflow-y: auto;
  }

  .guide-modal {
    width: min(540px,100%);
    max-height: calc(100dvh - 32px);
    overflow-y: auto;
    padding: 25px;
    border-radius: 22px;
    background: white;
    box-shadow: 0 25px 80px rgba(0,0,0,.22);
    animation: modalShow .3s ease;
  }

  @keyframes modalShow {
    from {
      opacity: 0;
      transform: translateY(20px) scale(.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    gap: 13px;
    margin-bottom: 23px;
  }

  .guide-icon {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    flex-shrink: 0;
    border-radius: 14px;
    background: #eaf6ee;
    font-size: 30px;
  }

  .modal-heading {
    flex: 1;
    min-width: 0;
  }

  .modal-heading h2 {
    margin: 0 0 5px;
    color: #145d39;
    font-size: 20px;
  }

  .modal-heading p {
    margin: 0;
    color: #718078;
    font-size: 12px;
  }

  .close-modal {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 50%;
    background: #f0f3f1;
    color: #5c6b61;
    font-size: 24px;
    cursor: pointer;
  }

  .guide-steps {
    display: flex;
    flex-direction: column;
    gap: 13px;
  }

  .guide-step {
    display: grid;
    grid-template-columns: 30px 55px minmax(0,1fr);
    align-items: start;
    gap: 12px;
    padding: 15px 12px;
    border: 1px solid #e3eee5;
    border-radius: 14px;
    background: #f5faf6;
  }

  .step-number {
    display: grid;
    place-items: center;
    width: 29px;
    height: 29px;
    border-radius: 50%;
    background: #176c43;
    color: white;
    font-weight: 800;
  }

  .step-icon {
    display: grid;
    place-items: center;
    min-height: 55px;
    border-radius: 12px;
    background: #e4f3e8;
    font-size: 29px;
  }

  .step-content h3 {
    margin: 2px 0 7px;
    color: #193d2c;
    font-size: 14px;
  }

  .step-content p {
    margin: 0;
    color: #617168;
    font-size: 12px;
    line-height: 1.65;
  }

  .step-tip {
    margin-top: 9px;
    padding: 9px;
    border-radius: 8px;
    background: #e7f3e9;
    color: #35654a;
    font-size: 11px;
    line-height: 1.6;
  }

  .warning-tip {
    background: #fff2e7;
    color: #96521e;
  }

  .understand-button {
    width: 100%;
    min-height: 48px;
    margin-top: 20px;
    border: 0;
    border-radius: 12px;
    background: #176c43;
    color: white;
    font-weight: 800;
    cursor: pointer;
  }

  /* HERO */

  .hero {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    width: min(1100px,100%);
    min-height: 250px;
    margin: 0 auto 24px;
    padding: 38px;
    overflow: hidden;
    border-radius: 22px;
    background: linear-gradient(110deg,#e5f1e7,#d3e9d9 60%,#b8d8c1);
  }

  .hero::after {
    content: 'دار';
    position: absolute;
    right: 25%;
    bottom: -55px;
    color: rgba(23,108,67,.055);
    font-size: 200px;
    font-weight: 900;
    pointer-events: none;
  }

  .hero-content {
    position: relative;
    z-index: 1;
    max-width: 570px;
  }

  .hero-badge {
    display: inline-block;
    margin-bottom: 15px;
    padding: 8px 15px;
    border-radius: 30px;
    background: #176c43;
    color: white;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 1px;
  }

  .hero h1 {
    margin: 0;
    color: #173d2b;
    font-size: clamp(34px,5vw,55px);
    font-weight: 850;
    line-height: 1.08;
  }

  .hero h1 span {
    display: block;
  }

  .hero-content > p {
    max-width: 430px;
    margin: 13px 0 0;
    color: #50695a;
    font-size: 14px;
    line-height: 1.7;
  }

  .price-card {
    position: relative;
    z-index: 1;
    flex-shrink: 0;
    min-width: 240px;
    padding: 23px;
    border-radius: 18px;
    background: #145b39;
    color: white;
    box-shadow: 0 15px 30px rgba(15,79,46,.17);
  }

  .price-label {
    color: #d5eadb;
    font-size: 12px;
    font-weight: 700;
  }

  .price-value {
    margin: 13px 0 8px;
    font-size: clamp(23px,3vw,32px);
    font-weight: 900;
    white-space: nowrap;
  }

  .price-card small {
    color: #c4dfcd;
    font-size: 11px;
  }

  /* FORM */

  .form-card {
    width: min(1100px,100%);
    margin: auto;
    padding: clamp(20px,4vw,38px);
    border: 1px solid #e3ece5;
    border-radius: 20px;
    background: white;
    box-shadow: 0 15px 50px rgba(24,67,42,.07);
  }

  section {
    padding: 27px 0;
    border-bottom: 1px solid #edf1ed;
  }

  .section-heading {
    display: flex;
    align-items: center;
    gap: 13px;
    margin-bottom: 22px;
  }

  .section-icon {
    display: grid;
    place-items: center;
    width: 43px;
    height: 43px;
    flex-shrink: 0;
    border-radius: 12px;
    background: #eaf5ec;
    font-size: 21px;
  }

  .section-heading h2 {
    margin: 0 0 4px;
    color: #194c32;
    font-size: 18px;
  }

  .section-heading p {
    margin: 0;
    color: #87938b;
    font-size: 12px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2,minmax(0,1fr));
    gap: 18px;
  }

  .field {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 8px;
  }

  .field > span {
    color: #34483b;
    font-size: 13px;
    font-weight: 700;
  }

  .field b,
  .required-note b,
  .upload-card h3 b {
    color: #d23b36;
  }

  input:not([type="file"]),
  select,
  textarea {
    width: 100%;
    min-height: 46px;
    padding: 11px 13px;
    border: 1px solid #dce6de;
    border-radius: 9px;
    background: white;
    color: #263b2e;
    outline: none;
    font-size: 13px;
    transition: .2s;
  }

  textarea {
    resize: vertical;
  }

  input:focus,
  select:focus,
  textarea:focus {
    border-color: #23804d;
    box-shadow: 0 0 0 3px rgba(35,128,77,.1);
  }

  .full {
    grid-column: 1 / -1;
  }

  /* ALERT */

  .alert {
    padding: 14px;
    margin-bottom: 15px;
    border-radius: 10px;
    font-size: 13px;
    line-height: 1.6;
  }

  .success {
    background: #e8f7ed;
    color: #176b3d;
  }

  .error {
    background: #fff0ef;
    color: #b3322b;
  }

  /* INFO */

  .info-box {
    display: flex;
    gap: 10px;
    padding: 13px;
    margin-bottom: 19px;
    border-radius: 10px;
    background: #edf6ff;
    color: #3b658a;
    font-size: 12px;
    line-height: 1.6;
  }

  /* UPLOAD */

  .upload-grid {
    display: grid;
    grid-template-columns: repeat(2,minmax(0,1fr));
    gap: 18px;
  }

  .upload-card {
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: center;
    padding: 23px 15px;
    border: 1px dashed #b8d5c0;
    border-radius: 14px;
    background: #f8fbf8;
    text-align: center;
  }

  .upload-icon {
    display: grid;
    place-items: center;
    width: 53px;
    height: 53px;
    margin-bottom: 12px;
    border-radius: 15px;
    background: #e4f2e7;
    font-size: 27px;
  }

  .upload-card h3 {
    margin: 0;
    color: #234a33;
    font-size: 14px;
  }

  .upload-card > p {
    margin: 7px 0 15px;
    color: #849188;
    font-size: 11px;
  }

  .upload-button {
    display: block;
    width: 100%;
    max-width: 190px;
    cursor: pointer;
  }

  .upload-button input,
  .payment-upload input {
    display: none;
  }

  .upload-button span {
    display: block;
    padding: 11px;
    border-radius: 9px;
    background: #176c43;
    color: white;
    font-size: 12px;
    font-weight: 800;
  }

  .upload-card > small {
    margin-top: 10px;
    color: #849188;
    font-size: 10px;
  }

  .empty-file {
    margin-top: 12px;
    color: #a1aaa3;
    font-size: 11px;
  }

  .file-selected {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    margin-top: 15px;
    padding: 8px;
    border-radius: 8px;
    background: #e7f5e9;
    color: #176c43;
    font-size: 11px;
  }

  .file-name {
    min-width: 0;
    flex: 1;
    overflow-wrap: anywhere;
    text-align: left;
  }

  .remove-file {
    padding: 6px 9px;
    border: 0;
    border-radius: 6px;
    background: #fff0ef;
    color: #b3322b;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
  }

  .preview-image {
    display: block;
    width: 100%;
    max-width: 100%;
    max-height: 260px;
    margin-top: 13px;
    border-radius: 9px;
    object-fit: contain;
    background: #edf2ed;
  }

  .pdf-preview {
    width: 100%;
    margin-top: 12px;
    padding: 15px;
    border-radius: 8px;
    background: #f0f4f1;
    color: #526b59;
    font-size: 11px;
    overflow-wrap: anywhere;
  }

  /* PAYMENT */

  .payment-price {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    padding: 18px;
    margin-bottom: 18px;
    border: 1px solid #d8eadc;
    border-radius: 12px;
    background: #edf7ef;
  }

  .payment-price > div {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .payment-price span {
    color: #325b40;
    font-size: 13px;
    font-weight: 800;
  }

  .payment-price small {
    color: #809287;
    font-size: 11px;
  }

  .payment-price > strong {
    color: #176c43;
    font-size: clamp(17px,3vw,23px);
    font-weight: 900;
    white-space: nowrap;
  }

  .payment-warning {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
    margin-bottom: 18px;
    border: 1px solid #f2c6a1;
    border-radius: 12px;
    background: #fff7ed;
    color: #9a4b16;
  }

  .warning-icon {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #e58b32;
    color: white;
    font-weight: 900;
  }

  .payment-warning strong {
    font-size: 13px;
  }

  .payment-warning p {
    margin: 7px 0 0;
    font-size: 12px;
    line-height: 1.7;
  }

  .bank-card {
    padding: 24px;
    margin-bottom: 23px;
    border: 1px solid #dce9df;
    border-radius: 15px;
    background: linear-gradient(135deg,#f2f8f3,#e5f2e8);
  }

  .bank-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: #34734a;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 1px;
  }

  .bank-header strong {
    padding: 8px 16px;
    border-radius: 7px;
    background: #176c43;
    color: white;
    font-size: 16px;
  }

  .bank-name {
    margin: 20px 0;
    color: #315740;
    font-weight: 800;
  }

  .bank-label {
    margin: 14px 0 6px;
    color: #809187;
    font-size: 11px;
  }

  .rekening-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .rekening-row > strong {
    color: #1e4730;
    font-size: clamp(16px,3vw,23px);
    letter-spacing: 1px;
    overflow-wrap: anywhere;
  }

  .copy-button {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    min-height: 37px;
    padding: 0 14px;
    border: 1px solid #176c43;
    border-radius: 8px;
    background: white;
    color: #176c43;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }

  .copy-button:hover {
    background: #176c43;
    color: white;
  }

  .bank-note {
    display: flex;
    gap: 10px;
    margin-top: 20px;
    padding-top: 15px;
    border-top: 1px solid #d5e5d9;
    color: #667b6b;
    font-size: 12px;
    line-height: 1.7;
  }

  .payment-upload {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 170px;
    padding: 20px;
    border: 2px dashed #b9d5c0;
    border-radius: 13px;
    background: #f8fbf8;
    cursor: pointer;
    text-align: center;
    transition: .2s;
  }

  .payment-upload:hover {
    border-color: #176c43;
    background: #eff7f0;
  }

  .payment-upload-icon {
    color: #176c43;
    font-size: 36px;
  }

  .payment-upload strong {
    color: #28543a;
    font-size: 13px;
  }

  .payment-upload small {
    color: #829087;
    font-size: 11px;
  }

  .payment-preview {
    margin-top: 17px;
    padding: 15px;
    border: 1px solid #e0eae2;
    border-radius: 12px;
    background: #f8faf8;
  }

  .preview-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }

  .payment-image {
    max-height: 330px;
  }

  .payment-preview > p {
    color: #829087;
    font-size: 11px;
    overflow-wrap: anywhere;
  }

  /* FOOTER */

  .final-note {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 25px 0;
    padding: 14px;
    border: 1px solid #d9ebdc;
    border-radius: 10px;
    background: #eff8f0;
    color: #37664a;
    font-size: 12px;
    line-height: 1.6;
  }

  .final-note span {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 25px;
    height: 25px;
    border-radius: 50%;
    background: #176c43;
    color: white;
    font-weight: 900;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    padding-top: 23px;
    border-top: 1px solid #edf1ed;
  }

  .required-note {
    color: #718077;
    font-size: 12px;
  }

  .submit-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 49px;
    padding: 0 25px;
    border: 0;
    border-radius: 10px;
    background: #176c43;
    color: white;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    transition: .2s;
  }

  .submit-button:hover:not(:disabled) {
    background: #105332;
    transform: translateY(-2px);
  }

  .submit-button:disabled {
    cursor: wait;
    opacity: .65;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,.4);
    border-top-color: white;
    border-radius: 50%;
    animation: spin .7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .page-footer {
    padding: 28px 10px 10px;
    color: #829087;
    font-size: 11px;
    text-align: center;
  }

  .page-footer span {
    padding: 0 5px;
    color: #176c43;
  }

  /* RESPONSIVE HP */

  @media (max-width: 700px) {
    .page {
      padding: 13px 10px;
    }

    .hero {
      flex-direction: column;
      align-items: stretch;
      padding: 25px 20px;
      gap: 20px;
    }

    .hero h1 {
      font-size: 36px;
    }

    .price-card {
      min-width: 0;
      width: 100%;
    }

    .form-card {
      padding: 19px 15px;
      border-radius: 15px;
    }

    .grid,
    .upload-grid {
      grid-template-columns: 1fr;
    }

    .full {
      grid-column: auto;
    }

    .guide-modal {
      padding: 19px 14px;
      border-radius: 17px;
    }

    .guide-step {
      grid-template-columns: 27px 43px minmax(0,1fr);
      gap: 8px;
      padding: 12px 8px;
    }

    .step-icon {
      min-height: 45px;
      font-size: 25px;
    }

    .step-content h3 {
      font-size: 12px;
    }

    .step-content p,
    .step-tip {
      font-size: 10px;
    }

    .modal-heading h2 {
      font-size: 17px;
    }

    .modal-heading p {
      font-size: 10px;
    }

    .floating-guide {
      right: 8px;
      top: auto;
      bottom: 20px;
    }

    .question-icon {
      width: 38px;
      height: 38px;
    }

    footer {
      flex-direction: column;
      align-items: stretch;
    }

    .submit-button {
      width: 100%;
    }

    .required-note {
      margin: 0;
    }

    .rekening-row > strong {
      font-size: 15px;
    }

    .bank-card {
      padding: 17px;
    }

    .payment-price {
      flex-wrap: wrap;
    }
  }

  @media (max-width: 380px) {
    .guide-step {
      grid-template-columns: 25px minmax(0,1fr);
    }

    .step-icon {
      display: none;
    }

    .rekening-row {
      align-items: flex-start;
      flex-direction: column;
    }

    .copy-button {
      width: 100%;
      justify-content: center;
    }
  }
</style>
