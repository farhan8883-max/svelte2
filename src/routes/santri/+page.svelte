<script lang="ts">
  import { supabase } from "$lib/supabaseClient";
  import { onMount, tick } from "svelte";
  import { goto } from "$app/navigation";
  import JsBarcode from "jsbarcode";

  /* =========================================================
     TYPES
  ========================================================= */

  interface UserData {
    id: number;
    username?: string;
    nama?: string;
    kelas?: string;
    kelas_id?: string | number;
  }

  interface Entry {
    id: number;
    date: string;
    amount: number;
    kind: "pemasukan" | "pengeluaran";
    name: string;
    user_id: number;
  }

  interface Absensi {
    id: number;
    date: string;
    status: string;
  }

  interface Pengumuman {
    id: number;
    title: string;
    content: string;
    created_at: string;
  }

  interface SPPItem {
    bulan: string;
    key: string;
    tahun: number;
    nominal: number;
    status: "lunas" | "belum_lunas";
    jatuh_tempo: string;
  }

  interface JadwalItem {
    hari: string;
    kegiatan: string;
    waktu: string;
  }

  interface PrestasiItem {
    tahun: string;
    judul: string;
    tingkat: string;
  }

  /* =========================================================
     STATE
  ========================================================= */

  let user: UserData | null = null;

  let entries: Entry[] = [];
  let pemasukan: Entry[] = [];
  let pengeluaran: Entry[] = [];

  let absensiList: Absensi[] = [];
  let pengumumanList: Pengumuman[] = [];

  let saldo = 0;
  let totalPemasukan = 0;
  let totalPengeluaran = 0;

  let message = "";

  let loadingEntries = false;
  let loadingAbsensi = false;
  let loadingSPP = false;
  let loadingPengumuman = false;

  /* =========================================================
     PROFILE
  ========================================================= */

  let isSidebarOpen = false;
  let editNama = "";
  let avatarUrl = "";

  /* =========================================================
     NAVIGATION
  ========================================================= */

  let activeSection:
    | "home"
    | "keuangan"
    | "barcode"
    | "absensi"
    | "jadwal"
    | "pengumuman"
    | "prestasi"
    | "spp" = "home";

  let keuanganTab: "pemasukan" | "pengeluaran" = "pemasukan";

  let sppTab: "semua" | "lunas" | "belum_lunas" = "semua";

  let showTransferModal = false;

  /* =========================================================
     SPP
  ========================================================= */

  let currentYear = new Date().getFullYear();

  let sppList: SPPItem[] = [];

  let nominalSPP = 500000;

  const monthsMap = [
    { name: "Januari", key: "january", due: "10 Januari" },
    { name: "Februari", key: "february", due: "10 Februari" },
    { name: "Maret", key: "march", due: "10 Maret" },
    { name: "April", key: "april", due: "10 April" },
    { name: "Mei", key: "may", due: "10 Mei" },
    { name: "Juni", key: "june", due: "10 Juni" },
    { name: "Juli", key: "july", due: "10 Juli" },
    { name: "Agustus", key: "august", due: "10 Agustus" },
    { name: "September", key: "september", due: "10 September" },
    { name: "Oktober", key: "october", due: "10 Oktober" },
    { name: "November", key: "november", due: "10 November" },
    { name: "Desember", key: "december", due: "10 Desember" }
  ];

  /* =========================================================
     JADWAL
  ========================================================= */

  let jadwalList: JadwalItem[] = [
    {
      hari: "Senin - Jumat",
      kegiatan: "KBM & Mengaji Setoran Al-Qur'an",
      waktu: "08:00 - 15:30"
    },
    {
      hari: "Sabtu",
      kegiatan: "Ekstrakurikuler & Olahraga",
      waktu: "08:00 - 11:30"
    },
    {
      hari: "Minggu",
      kegiatan: "Kunjungan Wali Santri / Istirahat",
      waktu: "09:00 - 16:00"
    }
  ];

  /* =========================================================
     PRESTASI
  ========================================================= */

  let prestasiList: PrestasiItem[] = [
    {
      tahun: "2026",
      judul: "Juara 1 MHQ 5 Juz",
      tingkat: "Kabupaten/Kota"
    },
    {
      tahun: "2025",
      judul: "Juara 2 Pidato Bahasa Arab",
      tingkat: "Provinsi"
    }
  ];

  /* =========================================================
     REACTIVE SPP
  ========================================================= */

  $: sppLunas = sppList.filter((s) => s.status === "lunas");

  $: sppBelumLunas = sppList.filter(
    (s) => s.status === "belum_lunas"
  );

  $: totalTunggakan = sppBelumLunas.reduce(
    (total, item) => total + item.nominal,
    0
  );

  $: filteredSPP = sppList.filter((item) => {
    if (sppTab === "lunas") {
      return item.status === "lunas";
    }

    if (sppTab === "belum_lunas") {
      return item.status === "belum_lunas";
    }

    return true;
  });

  /* =========================================================
     ON MOUNT
  ========================================================= */

  onMount(async () => {
    loadUser();

    if (!user) {
      message = "Kamu belum login.";
      return;
    }

    await Promise.all([
      loadEntries(),
      loadAbsensi(),
      loadSPP(),
      loadPengumuman()
    ]);
  });

  /* =========================================================
     LOAD USER
  ========================================================= */

  function loadUser() {
    if (typeof window === "undefined") return;

    const storedUser = localStorage.getItem("user");

    if (!storedUser) {
      return;
    }

    try {
      user = JSON.parse(storedUser);

      editNama = user?.username || user?.nama || "";

      if (user?.id) {
        avatarUrl =
          localStorage.getItem(`avatar_${user.id}`) || "";
      }
    } catch (error) {
      console.error("Gagal membaca data user:", error);

      localStorage.removeItem("user");

      user = null;
    }
  }

  /* =========================================================
     LOAD KEUANGAN
  ========================================================= */

  async function loadEntries() {
    if (!user?.id) return;

    loadingEntries = true;

    const { data, error } = await supabase
      .from("entries")
      .select("*")
      .eq("user_id", user.id)
      .order("id", {
        ascending: false
      });

    loadingEntries = false;

    if (error) {
      console.error("Gagal memuat keuangan:", error);

      message =
        "Gagal memuat data keuangan: " +
        error.message;

      return;
    }

    entries = (data || []) as Entry[];

    pemasukan = entries.filter(
      (item) => item.kind === "pemasukan"
    );

    pengeluaran = entries.filter(
      (item) => item.kind === "pengeluaran"
    );

    hitungSaldo();
  }

  /* =========================================================
     HITUNG SALDO
  ========================================================= */

  function hitungSaldo() {
    totalPemasukan = pemasukan.reduce(
      (total, item) => total + Number(item.amount || 0),
      0
    );

    totalPengeluaran = pengeluaran.reduce(
      (total, item) => total + Number(item.amount || 0),
      0
    );

    saldo =
      totalPemasukan -
      totalPengeluaran;
  }

  /* =========================================================
     LOAD ABSENSI
  ========================================================= */

  async function loadAbsensi() {
    if (!user?.id) return;

    loadingAbsensi = true;

    const { data, error } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", user.id)
      .order("date", {
        ascending: false
      });

    loadingAbsensi = false;

    if (error) {
      console.error(
        "Gagal memuat absensi:",
        error
      );

      message =
        "Gagal memuat absensi: " +
        error.message;

      return;
    }

    absensiList =
      (data || []) as Absensi[];
  }

  /* =========================================================
     LOAD PENGUMUMAN
     
     TABLE:
     public.announcements

     COLUMNS:
     id
     title
     content
     created_at
  ========================================================= */

  async function loadPengumuman() {
    loadingPengumuman = true;

    const { data, error } = await supabase
      .from("announcements")
      .select(`
        id,
        title,
        content,
        created_at
      `)
      .order("created_at", {
        ascending: false
      });

    loadingPengumuman = false;

    if (error) {
      console.error(
        "Gagal memuat pengumuman:",
        error
      );

      message =
        "Gagal memuat pengumuman: " +
        error.message;

      return;
    }

    pengumumanList =
      (data || []) as Pengumuman[];
  }

  /* =========================================================
     LOAD SPP
  ========================================================= */

  async function loadSPP() {
    if (!user?.id) return;

    loadingSPP = true;

    let {
      data,
      error
    } = await supabase
      .from("spp_payments")
      .select("*")
      .eq("user_id", user.id)
      .eq("year", currentYear)
      .maybeSingle();

    /*
      Jika data belum ada,
      buat data pembayaran baru
    */

    if (!data && !error) {
      const {
        data: newData,
        error: insertError
      } = await supabase
        .from("spp_payments")
        .insert({
          user_id: user.id,
          year: currentYear
        })
        .select()
        .single();

      if (insertError) {
        console.error(
          "Gagal membuat data SPP:",
          insertError
        );

        message =
          "Gagal membuat data SPP: " +
          insertError.message;
      } else {
        data = newData;
      }
    }

    if (error) {
      console.error(
        "Gagal memuat SPP:",
        error
      );

      message =
        "Gagal memuat SPP: " +
        error.message;
    }

    /*
      Mapping bulan ke status pembayaran
    */

    sppList = monthsMap.map((month) => ({
      bulan: month.name,
      key: month.key,
      tahun: currentYear,
      nominal: nominalSPP,

      status:
        data &&
        data[month.key] === true
          ? "lunas"
          : "belum_lunas",

      jatuh_tempo:
        `${month.due} ${currentYear}`
    }));

    loadingSPP = false;
  }

  /* =========================================================
     BARCODE
  ========================================================= */

  async function generateBarcode() {
    if (!user?.id) return;

    await tick();

    const barcodeElement =
      document.getElementById(
        "santri-barcode-main"
      );

    if (!barcodeElement) return;

    const barcodeValue =
      `SANTRI-${user.id}`;

    try {
      JsBarcode(
        "#santri-barcode-main",
        barcodeValue,
        {
          format: "CODE128",
          lineColor: "#1e3c72",
          width: 2,
          height: 80,
          displayValue: true,
          fontSize: 14,
          margin: 10
        }
      );
    } catch (error) {
      console.error(
        "Gagal membuat barcode:",
        error
      );
    }
  }

  /* =========================================================
     FORMAT RUPIAH
  ========================================================= */

  function formatRupiah(
    value: number
  ): string {
    return new Intl.NumberFormat(
      "id-ID"
    ).format(value || 0);
  }

  /* =========================================================
     FORMAT TANGGAL
  ========================================================= */

  function formatTanggal(
    value: string
  ): string {
    if (!value) return "-";

    try {
      return new Date(
        value
      ).toLocaleDateString(
        "id-ID",
        {
          day: "2-digit",
          month: "long",
          year: "numeric"
        }
      );
    } catch {
      return value;
    }
  }

  /* =========================================================
     NAVIGATION
  ========================================================= */

  async function switchSection(
    section: typeof activeSection
  ) {
    activeSection = section;

    message = "";

    if (section === "barcode") {
      await generateBarcode();
    }

    if (section === "pengumuman") {
      await loadPengumuman();
    }

    if (section === "absensi") {
      await loadAbsensi();
    }

    if (section === "spp") {
      await loadSPP();
    }

    if (section === "keuangan") {
      await loadEntries();
    }
  }

  /* =========================================================
     LOGOUT
  ========================================================= */

  async function logout() {
    localStorage.removeItem("user");

    user = null;

    await goto("/");
  }

  /* =========================================================
     COPY REKENING
  ========================================================= */

  async function copyRekening(
    nomor: string
  ) {
    try {
      await navigator.clipboard.writeText(
        nomor
      );

      alert(
        "Nomor rekening berhasil disalin"
      );
    } catch (error) {
      console.error(
        "Gagal menyalin rekening:",
        error
      );

      alert(
        "Gagal menyalin nomor rekening"
      );
    }
  }

  /* =========================================================
     EXPORT CSV
  ========================================================= */

  function exportCSV(
    data: Entry[],
    filename: string
  ) {
    if (!data.length) {
      alert(
        "Tidak ada data untuk diexport"
      );

      return;
    }

    const header = [
      "Keterangan",
      "Tanggal",
      "Jumlah",
      "Jenis"
    ];

    const rows = data.map(
      (item) => [
        item.name,
        item.date,
        item.amount,
        item.kind
      ]
    );

    const csvContent =
      [header, ...rows]
        .map((row) =>
          row
            .map(String)
            .map(
              (value) =>
                `"${value.replace(
                  /"/g,
                  '""'
                )}"`
            )
            .join(",")
        )
        .join("\n");

    const blob = new Blob(
      [csvContent],
      {
        type:
          "text/csv;charset=utf-8;"
      }
    );

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;

    link.setAttribute(
      "download",
      `${filename}_${
        user?.username ||
        user?.nama ||
        "santri"
      }.csv`
    );

    document.body.appendChild(
      link
    );

    link.click();

    document.body.removeChild(
      link
    );

    URL.revokeObjectURL(
      url
    );
  }

  /* =========================================================
     UPLOAD AVATAR
  ========================================================= */

  function handleImageUpload(
    event: Event
  ) {
    const target =
      event.target as HTMLInputElement;

    const file =
      target.files?.[0];

    if (!file) return;

    const reader =
      new FileReader();

    reader.onload = (
      loadEvent
    ) => {
      avatarUrl =
        loadEvent.target
          ?.result as string;
    };

    reader.readAsDataURL(
      file
    );
  }

  /* =========================================================
     SAVE PROFILE
  ========================================================= */

  function saveProfile() {
    if (!user) return;

    const namaBaru =
      editNama.trim();

    if (!namaBaru) {
      alert(
        "Nama tidak boleh kosong"
      );

      return;
    }

    user.username =
      namaBaru;

    user.nama =
      namaBaru;

    localStorage.setItem(
      "user",
      JSON.stringify(user)
    );

    if (
      avatarUrl &&
      user.id
    ) {
      localStorage.setItem(
        `avatar_${user.id}`,
        avatarUrl
      );
    }

    alert(
      "Profil berhasil diperbarui!"
    );

    isSidebarOpen = false;
  }
</script>

<div class="mybca-app">

  <!-- =====================================================
       HEADER
  ====================================================== -->

  <header class="app-header">

    <div class="header-container">

      <div class="user-greeting">

        <button
          class="profile-avatar-btn"
          on:click={() =>
            (isSidebarOpen = true)}
          title="Edit Profil"
        >

          {#if avatarUrl}

            <img
              src={avatarUrl}
              alt="Avatar"
              class="avatar-img"
            />

          {:else}

            <div
              class="avatar-placeholder"
            >
              {
                (
                  user?.username ||
                  user?.nama ||
                  "S"
                )[0].toUpperCase()
              }
            </div>

          {/if}

        </button>

        <div
          class="greeting-info"
        >

          <span
            class="greeting-text"
          >
            Selamat Datang,
          </span>

          <h2
            class="user-name"
          >
            {
              user?.username ||
              user?.nama ||
              "Santri"
            }
          </h2>

        </div>

      </div>

      <button
        class="btn-logout"
        on:click={logout}
        title="Keluar"
      >

        <span
          class="logout-icon"
        >
          🚪
        </span>

        <span
          class="logout-text"
        >
          Keluar
        </span>

      </button>

    </div>

  </header>

  <!-- =====================================================
       MAIN
  ====================================================== -->

  <main
    class="app-body"
  >

    {#if message}

      <div
        class="alert-box"
      >
        {message}
      </div>

    {/if}


    <!-- =================================================
         HOME
    ================================================== -->

    {#if activeSection === "home"}

      <div
        class="desktop-top-grid"
      >

        <!-- SALDO -->

        <div
          class="balance-card"
        >

          <div
            class="balance-header"
          >

            <span
              class="balance-label"
            >
              Sisa Uang Jajan / Saldo
            </span>

          </div>

          <div
            class="balance-amount"
          >
            Rp {formatRupiah(saldo)}
          </div>

          <div
            class="card-footer"
          >

            <div
              class="info-pill"
            >

              Kelas:

              <b>
                {
                  user?.kelas ||
                  user?.kelas_id ||
                  "-"
                }
              </b>

            </div>

          </div>

        </div>


        <!-- RINGKASAN -->

        <div
          class="
            stats-card
            desktop-only
          "
        >

          <h3
            class="section-title"
          >
            Ringkasan Keuangan
          </h3>

          <div
            class="stats-grid"
          >

            <div
              class="
                stat-item
                bg-teal-light
              "
            >

              <span
                class="stat-label"
              >
                Total Pemasukan
              </span>

              <span
                class="
                  stat-val
                  text-green
                "
              >
                + Rp
                {formatRupiah(
                  totalPemasukan
                )}
              </span>

            </div>


            <div
              class="
                stat-item
                bg-red-light
              "
            >

              <span
                class="stat-label"
              >
                Total Pengeluaran
              </span>

              <span
                class="
                  stat-val
                  text-red
                "
              >
                - Rp
                {formatRupiah(
                  totalPengeluaran
                )}
              </span>

            </div>

          </div>

        </div>

      </div>


      <!-- DASHBOARD -->

      <div
        class="dashboard-layout"
      >

        <!-- MENU -->

        <div
          class="menu-section"
        >

          <h3
            class="section-title"
          >
            Layanan Utama
          </h3>

          <div
            class="menu-grid"
          >

            <button
              class="menu-item"
              on:click={() =>
                switchSection("spp")}
            >

              <div
                class="
                  icon-circle
                  bg-emerald
                "
              >
                💳
              </div>

              <span>
                SPP Santri
              </span>

            </button>


            <button
              class="menu-item"
              on:click={() =>
                switchSection("keuangan")}
            >

              <div
                class="
                  icon-circle
                  bg-teal
                "
              >
                💼
              </div>

              <span>
                Keuangan
              </span>

            </button>


            <button
              class="menu-item"
              on:click={() =>
                switchSection("absensi")}
            >

              <div
                class="
                  icon-circle
                  bg-green
                "
              >
                📅
              </div>

              <span>
                Absensi
              </span>

            </button>


            <button
              class="menu-item"
              on:click={() =>
                switchSection("jadwal")}
            >

              <div
                class="
                  icon-circle
                  bg-blue
                "
              >
                🗓️
              </div>

              <span>
                Jadwal
              </span>

            </button>


            <button
              class="menu-item"
              on:click={() =>
                switchSection(
                  "pengumuman"
                )}
            >

              <div
                class="
                  icon-circle
                  bg-purple
                "
              >
                📢
              </div>

              <span>
                Pengumuman
              </span>

            </button>


            <button
              class="menu-item"
              on:click={() =>
                switchSection(
                  "prestasi"
                )}
            >

              <div
                class="
                  icon-circle
                  bg-orange
                "
              >
                🏆
              </div>

              <span>
                Prestasi
              </span>

            </button>


            <button
              class="menu-item"
              on:click={() =>
                switchSection(
                  "barcode"
                )}
            >

              <div
                class="
                  icon-circle
                  bg-blue
                "
              >
                🎴
              </div>

              <span>
                ID Barcode
              </span>

            </button>


            <button
              class="menu-item"
              on:click={() =>
                (
                  showTransferModal =
                    true
                )}
            >

              <div
                class="
                  icon-circle
                  bg-yellow
                "
              >
                🏦
              </div>

              <span>
                Top Up
              </span>

            </button>

          </div>

        </div>


        <!-- TRANSAKSI -->

        <div
          class="recent-section"
        >

          <div
            class="recent-header"
          >

            <h3>
              Transaksi Terakhir
            </h3>

          </div>

          <div
            class="recent-list"
          >

            {#if entries.length === 0}

              <p
                class="empty-msg"
              >
                Belum ada transaksi.
              </p>

            {:else}

              {#each entries.slice(0, 4) as item}

                <div
                  class="recent-item"
                >

                  <div
                    class="
                      item-icon-type
                    "
                    class:is-in={
                      item.kind ===
                      "pemasukan"
                    }
                  >

                    {
                      item.kind ===
                      "pemasukan"
                        ? "↙"
                        : "↗"
                    }

                  </div>


                  <div
                    class="item-info"
                  >

                    <span
                      class="item-title"
                    >
                      {item.name}
                    </span>

                    <span
                      class="item-date"
                    >
                      {item.date}
                    </span>

                  </div>


                  <span
                    class="item-amount"
                    class:is-in={
                      item.kind ===
                      "pemasukan"
                    }
                    class:is-out={
                      item.kind ===
                      "pengeluaran"
                    }
                  >

                    {
                      item.kind ===
                      "pemasukan"
                        ? "+"
                        : "-"
                    }

                    Rp
                    {formatRupiah(
                      item.amount
                    )}

                  </span>

                </div>

              {/each}

            {/if}

          </div>

        </div>

      </div>

    {/if}


    <!-- =================================================
         BACK BUTTON
    ================================================== -->

    {#if activeSection !== "home"}

      <div
        class="nav-back-wrapper"
      >

        <button
          class="back-button"
          on:click={() =>
            switchSection("home")}
        >

          ← Kembali ke Beranda

        </button>

      </div>

    {/if}


    <!-- =================================================
         SPP
    ================================================== -->

    {#if activeSection === "spp"}

      <div
        class="page-card"
      >

        <h3>
          Tagihan SPP Santri
        </h3>

        <p
          class="sub-desc"
        >
          Riwayat pembayaran
          SPP tahun {currentYear}.
        </p>


        <div
          class="spp-summary-grid"
        >

          <div
            class="
              spp-card-stat
              bg-emerald-light
            "
          >

            <span
              class="stat-label"
            >
              Sudah Dibayar
            </span>

            <span
              class="
                stat-val
                text-green
              "
            >
              {sppLunas.length}
              Bulan
            </span>

          </div>


          <div
            class="
              spp-card-stat
              bg-red-light
            "
          >

            <span
              class="stat-label"
            >
              Belum Dibayar
            </span>

            <span
              class="
                stat-val
                text-red
              "
            >
              {
                sppBelumLunas.length
              }
              Bulan
            </span>

          </div>


          <div
            class="
              spp-card-stat
              bg-blue-light
            "
          >

            <span
              class="stat-label"
            >
              Total Tunggakan
            </span>

            <span
              class="
                stat-val
                text-blue
              "
            >
              Rp
              {formatRupiah(
                totalTunggakan
              )}
            </span>

          </div>

        </div>


        <!-- TABS -->

        <div
          class="tab-header"
        >

          <button
            class="tab-btn"
            class:active={
              sppTab ===
              "semua"
            }
            on:click={() =>
              (sppTab =
                "semua")}
          >

            Semua
            ({sppList.length})

          </button>


          <button
            class="tab-btn"
            class:active={
              sppTab ===
              "belum_lunas"
            }
            on:click={() =>
              (sppTab =
                "belum_lunas")}
          >

            ⚠️ Belum Bayar
            ({
              sppBelumLunas.length
            })

          </button>


          <button
            class="tab-btn"
            class:active={
              sppTab ===
              "lunas"
            }
            on:click={() =>
              (sppTab =
                "lunas")}
          >

            ✅ Lunas
            ({sppLunas.length})

          </button>

        </div>


        <!-- LIST -->

        <div
          class="spp-list"
        >

          {#if loadingSPP}

            <p
              class="empty-msg"
            >
              Memuat data
              tagihan SPP...
            </p>

          {:else if filteredSPP.length === 0}

            <p
              class="empty-msg"
            >
              Tidak ada data
              pembayaran SPP.
            </p>

          {:else}

            {#each filteredSPP as item}

              <div
                class="
                  spp-item-card
                "
                class:unpaid={
                  item.status ===
                  "belum_lunas"
                }
              >

                <div
                  class="
                    spp-item-info
                  "
                >

                  <div
                    class="spp-month"
                  >
                    {item.bulan}
                    {item.tahun}
                  </div>


                  <div
                    class="
                      spp-subinfo
                    "
                  >

                    <span>

                      Nominal:

                      <b>
                        Rp
                        {formatRupiah(
                          item.nominal
                        )}
                      </b>

                    </span>


                    {#if item.status !== "lunas"}

                      <span
                        class="
                          text-red
                        "
                      >

                        • Jatuh Tempo:

                        {
                          item.jatuh_tempo
                        }

                      </span>

                    {/if}

                  </div>

                </div>


                <div
                  class="spp-action"
                >

                  {#if item.status === "lunas"}

                    <span
                      class="
                        status-badge
                        badge-lunas
                      "
                    >
                      ✅ Lunas
                    </span>

                  {:else}

                    <button
                      class="
                        btn-pay-now
                      "
                      on:click={() =>
                        (
                          showTransferModal =
                            true
                        )}
                    >
                      Bayar Sekarang
                    </button>

                  {/if}

                </div>

              </div>

            {/each}

          {/if}

        </div>

      </div>

    {/if}


    <!-- =================================================
         KEUANGAN
    ================================================== -->

    {#if activeSection === "keuangan"}

      <div
        class="page-card"
      >

        <div
          class="tab-header"
        >

          <button
            class="tab-btn"
            class:active={
              keuanganTab ===
              "pemasukan"
            }
            on:click={() =>
              (
                keuanganTab =
                  "pemasukan"
              )}
          >
            💰 Pemasukan
          </button>


          <button
            class="tab-btn"
            class:active={
              keuanganTab ===
              "pengeluaran"
            }
            on:click={() =>
              (
                keuanganTab =
                  "pengeluaran"
              )}
          >
            💸 Pengeluaran
          </button>

        </div>


        {#if keuanganTab === "pemasukan"}

          <div
            class="
              card-header-flex
            "
          >

            <div>

              <h3>
                Data Pemasukan
              </h3>

              <p
                class="
                  sub-desc
                  margin-0
                "
              >
                Catatan dana masuk
                / kiriman orang tua
              </p>

            </div>


            <button
              class="btn-export"
              on:click={() =>
                exportCSV(
                  pemasukan,
                  "pemasukan"
                )}
            >
              ⬇️ Export CSV
            </button>

          </div>


          <div
            class="
              table-container
            "
          >

            <table
              class="app-table"
            >

              <thead>

                <tr>

                  <th>
                    Keterangan
                  </th>

                  <th>
                    Tanggal
                  </th>

                  <th>
                    Jumlah
                  </th>

                </tr>

              </thead>


              <tbody>

                {#if pemasukan.length === 0}

                  <tr>

                    <td
                      colspan="3"
                      class="
                        text-center
                      "
                    >
                      Belum ada data
                      pemasukan.
                    </td>

                  </tr>

                {:else}

                  {#each pemasukan as item}

                    <tr>

                      <td
                        class="
                          font-semibold
                        "
                      >
                        {item.name}
                      </td>


                      <td
                        class="
                          text-muted
                        "
                      >
                        {item.date}
                      </td>


                      <td
                        class="
                          text-green
                          font-semibold
                        "
                      >
                        + Rp
                        {formatRupiah(
                          item.amount
                        )}
                      </td>

                    </tr>

                  {/each}

                {/if}

              </tbody>

            </table>

          </div>


          <div
            class="
              total-bar
              text-green-bg
            "
          >

            Total Pemasukan:

            Rp
            {formatRupiah(
              totalPemasukan
            )}

          </div>


        {:else}

          <div
            class="
              card-header-flex
            "
          >

            <div>

              <h3>
                Data Pengeluaran
              </h3>

              <p
                class="
                  sub-desc
                  margin-0
                "
              >
                Catatan konsumsi &
                jajan harian
              </p>

            </div>


            <button
              class="btn-export"
              on:click={() =>
                exportCSV(
                  pengeluaran,
                  "pengeluaran"
                )}
            >
              ⬇️ Export CSV
            </button>

          </div>


          <div
            class="
              table-container
            "
          >

            <table
              class="app-table"
            >

              <thead>

                <tr>

                  <th>
                    Keterangan
                  </th>

                  <th>
                    Tanggal
                  </th>

                  <th>
                    Jumlah
                  </th>

                </tr>

              </thead>


              <tbody>

                {#if pengeluaran.length === 0}

                  <tr>

                    <td
                      colspan="3"
                      class="
                        text-center
                      "
                    >
                      Belum ada data
                      pengeluaran.
                    </td>

                  </tr>

                {:else}

                  {#each pengeluaran as item}

                    <tr>

                      <td
                        class="
                          font-semibold
                        "
                      >
                        {item.name}
                      </td>


                      <td
                        class="
                          text-muted
                        "
                      >
                        {item.date}
                      </td>


                      <td
                        class="
                          text-red
                          font-semibold
                        "
                      >
                        - Rp
                        {formatRupiah(
                          item.amount
                        )}
                      </td>

                    </tr>

                  {/each}

                {/if}

              </tbody>

            </table>

          </div>


          <div
            class="
              total-bar
              text-red-bg
            "
          >

            Total Pengeluaran:

            Rp
            {formatRupiah(
              totalPengeluaran
            )}

          </div>

        {/if}

      </div>

    {/if}


    <!-- =================================================
         JADWAL
    ================================================== -->

    {#if activeSection === "jadwal"}

      <div
        class="page-card"
      >

        <h3>
          Jadwal Kegiatan Santri
        </h3>

        <p
          class="sub-desc"
        >
          Rangkaian rutinitas
          harian dan pekanan
          santri.
        </p>


        <div
          class="list-container"
        >

          {#each jadwalList as item}

            <div
              class="
                info-item-card
              "
            >

              <div
                class="info-badge"
              >
                {item.hari}
              </div>


              <div
                class="
                  info-content
                "
              >

                <span
                  class="
                    info-title
                  "
                >
                  {item.kegiatan}
                </span>


                <span
                  class="
                    info-time
                  "
                >
                  ⏰
                  {item.waktu}
                </span>

              </div>

            </div>

          {/each}

        </div>

      </div>

    {/if}


    <!-- =================================================
         PENGUMUMAN
         
         DATA DARI:
         public.announcements
    ================================================== -->

    {#if activeSection === "pengumuman"}

      <div
        class="page-card"
      >

        <div
          class="
            card-header-flex
          "
        >

          <div>

            <h3>
              Pengumuman Pesantren
            </h3>

            <p
              class="
                sub-desc
                margin-0
              "
            >
              Informasi resmi terbaru
              dari pengurus pesantren.
            </p>

          </div>


          <button
            class="
              btn-export
            "
            on:click={
              loadPengumuman
            }
          >
            🔄 Refresh
          </button>

        </div>


        {#if loadingPengumuman}

          <p
            class="empty-msg"
          >
            Memuat pengumuman...
          </p>


        {:else if pengumumanList.length === 0}

          <p
            class="empty-msg"
          >
            Belum ada pengumuman.
          </p>


        {:else}

          <div
            class="list-container"
          >

            {#each pengumumanList as item}

              <div
                class="notice-card"
              >

                <span
                  class="
                    notice-date
                  "
                >
                  📅
                  {formatTanggal(
                    item.created_at
                  )}
                </span>


                <h4
                  class="
                    notice-title
                  "
                >
                  {item.title}
                </h4>


                <p
                  class="
                    notice-text
                  "
                >
                  {item.content}
                </p>

              </div>

            {/each}

          </div>

        {/if}

      </div>

    {/if}


    <!-- =================================================
         PRESTASI
    ================================================== -->

    {#if activeSection === "prestasi"}

      <div
        class="page-card"
      >

        <h3>
          Pencapaian & Prestasi
        </h3>

        <p
          class="sub-desc"
        >
          Catatan kebanggaan
          prestasi santri.
        </p>


        <div
          class="list-container"
        >

          {#each prestasiList as item}

            <div
              class="
                achievement-card
              "
            >

              <div
                class="
                  trophy-icon
                "
              >
                🏆
              </div>


              <div>

                <span
                  class="
                    achievement-title
                  "
                >
                  {item.judul}
                </span>


                <p
                  class="
                    achievement-sub
                  "
                >

                  {item.tingkat}

                  •

                  {item.tahun}

                </p>

              </div>

            </div>

          {/each}

        </div>

      </div>

    {/if}


    <!-- =================================================
         ABSENSI
    ================================================== -->

    {#if activeSection === "absensi"}

      <div
        class="page-card"
      >

        <h3>
          Riwayat Absensi Santri
        </h3>

        <p
          class="sub-desc"
        >
          Daftar kehadiran
          harian yang dicatat
          oleh Ustadz.
        </p>


        {#if loadingAbsensi}

          <p
            class="empty-msg"
          >
            Memuat data presensi...
          </p>


        {:else if absensiList.length === 0}

          <p
            class="empty-msg"
          >
            Belum ada catatan
            absensi.
          </p>


        {:else}

          <div
            class="
              table-container
            "
          >

            <table
              class="
                app-table
              "
            >

              <thead>

                <tr>

                  <th>
                    Tanggal
                  </th>

                  <th>
                    Status
                  </th>

                </tr>

              </thead>


              <tbody>

                {#each absensiList as item}

                  <tr>

                    <td>
                      {
                        formatTanggal(
                          item.date
                        )
                      }
                    </td>


                    <td>

                      <span
                        class="
                          badge-status
                        "
                      >
                        {
                          item.status ||
                          "-"
                        }
                      </span>

                    </td>

                  </tr>

                {/each}

              </tbody>

            </table>

          </div>

        {/if}

      </div>

    {/if}


    <!-- =================================================
         BARCODE
    ================================================== -->

    {#if activeSection === "barcode"}

      <div
        class="
          page-card
          text-center
        "
      >

        <h3>
          Kartu Barcode Santri
        </h3>

        <p
          class="sub-desc"
        >
          Tunjukkan barcode ini
          kepada Ustadz untuk
          presensi.
        </p>


        <div
          class="barcode-box"
        >

          <h2>

            {
              user?.username ||
              user?.nama ||
              "Santri"
            }

          </h2>


          <p
            class="id-tag"
          >

            ID:

            SANTRI-
            {user?.id}

          </p>


          <canvas
            id="
              santri-barcode-main
            "
          ></canvas>

        </div>

      </div>

    {/if}

  </main>


  <!-- =====================================================
       SIDEBAR PROFILE
  ====================================================== -->

  {#if isSidebarOpen}

    <div
      class="
        sidebar-overlay
      "
      on:click={() =>
        (
          isSidebarOpen =
            false
        )}
      role="button"
      tabindex="0"
    >

      <div
        class="
          sidebar-content
        "
        on:click|stopPropagation
        role="document"
        tabindex="-1"
      >

        <div
          class="
            sidebar-header
          "
        >

          <h3>
            Edit Profil
          </h3>


          <button
            class="close-x"
            on:click={() =>
              (
                isSidebarOpen =
                  false
              )}
          >
            ✕
          </button>

        </div>


        <div
          class="
            profile-upload-section
          "
        >

          <div
            class="
              avatar-preview
            "
          >

            {#if avatarUrl}

              <img
                src={avatarUrl}
                alt="
                  Preview Avatar
                "
              />

            {:else}

              <div
                class="
                  avatar-placeholder-lg
                "
              >

                {
                  (
                    editNama ||
                    "S"
                  )[0].toUpperCase()
                }

              </div>

            {/if}

          </div>


          <label
            for="
              upload-avatar
            "
            class="
              btn-upload-label
            "
          >

            📸 Pilih Foto


            <input
              type="file"
              id="
                upload-avatar
              "
              accept="image/*"
              on:change={
                handleImageUpload
              }
              style="
                display: none;
              "
            />

          </label>

        </div>


        <div
          class="
            form-group
          "
        >

          <label
            for="
              input-nama
            "
          >
            Nama Lengkap /
            Username
          </label>


          <input
            id="
              input-nama
            "
            type="text"
            class="
              form-input
            "
            bind:value={
              editNama
            }
            placeholder="
              Masukkan nama...
            "
          />

        </div>


        <button
          class="btn-save"
          on:click={
            saveProfile
          }
        >
          Simpan Perubahan
        </button>

      </div>

    </div>

  {/if}


  <!-- =====================================================
       MODAL TOP UP / PEMBAYARAN
  ====================================================== -->

  {#if showTransferModal}

    <div
      class="
        modal-overlay
      "
      on:click={() =>
        (
          showTransferModal =
            false
        )}
      role="button"
      tabindex="0"
    >

      <div
        class="
          modal-box
        "
        on:click|stopPropagation
        role="document"
        tabindex="-1"
      >

        <div
          class="
            modal-header
          "
        >

          <h3>
            Transfer /
            Pembayaran SPP
          </h3>


          <button
            class="
              close-x
            "
            on:click={() =>
              (
                showTransferModal =
                  false
              )}
          >
            ✕
          </button>

        </div>


        <p
          class="sub-desc"
        >
          Lakukan pembayaran
          ke rekening resmi
          pesantren berikut:
        </p>


        <div
          class="
            rekening-list
          "
        >

          <!-- BSI -->

          <div
            class="
              rekening-card
            "
          >

            <div
              class="
                bank-info
              "
            >

              <span
                class="
                  bank-name
                "
              >
                Bank BSI
              </span>


              <span
                class="
                  bank-owner
                "
              >
                a.n Pesantren
                SPP / Kantin
              </span>

            </div>


            <div
              class="
                rekening-num
              "
            >
              1234567890
            </div>


            <button
              class="
                btn-copy
              "
              on:click={() =>
                copyRekening(
                  "1234567890"
                )}
            >
              📋 Salin Nomor
            </button>

          </div>


          <!-- BRI -->

          <div
            class="
              rekening-card
            "
          >

            <div
              class="
                bank-info
              "
            >

              <span
                class="
                  bank-name
                "
              >
                Bank BRI
              </span>


              <span
                class="
                  bank-owner
                "
              >
                a.n Pesantren
                SPP / Kantin
              </span>

            </div>


            <div
              class="
                rekening-num
              "
            >
              9876543210
            </div>


            <button
              class="
                btn-copy
              "
              on:click={() =>
                copyRekening(
                  "9876543210"
                )}
            >
              📋 Salin Nomor
            </button>

          </div>

        </div>


        <button
          class="
            btn-modal-close
          "
          on:click={() =>
            (
              showTransferModal =
                false
            )}
        >
          Selesai
        </button>

      </div>

    </div>

  {/if}

</div>


<style>

  /* =====================================================
     GLOBAL
  ====================================================== */

  .mybca-app {
    min-height: 100vh;
    background: #f4f7fa;

    font-family:
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      Roboto,
      Helvetica,
      Arial,
      sans-serif;

    color: #2c3e50;

    padding-bottom: 40px;
  }


  /* =====================================================
     HEADER
  ====================================================== */

  .app-header {
    background:
      linear-gradient(
        135deg,
        #0d47a1 0%,
        #1976d2 100%
      );

    color: white;

    padding:
      24px
      20px
      48px;

    border-bottom-left-radius:
      28px;

    border-bottom-right-radius:
      28px;

    box-shadow:
      0 4px 15px
      rgba(
        13,
        71,
        161,
        0.15
      );
  }


  .header-container {
    max-width: 1000px;

    margin: 0 auto;

    display: flex;

    justify-content:
      space-between;

    align-items:
      center;
  }


  .user-greeting {
    display: flex;

    align-items:
      center;

    gap: 12px;
  }


  .profile-avatar-btn {
    background: none;

    border: none;

    cursor: pointer;

    padding: 0;
  }


  .avatar-img {
    width: 46px;

    height: 46px;

    border-radius: 50%;

    object-fit: cover;

    border:
      2px
      solid
      white;
  }


  .avatar-placeholder {
    width: 46px;

    height: 46px;

    border-radius: 50%;

    background:
      #ffffff33;

    border:
      2px
      solid
      white;

    color: white;

    display: flex;

    align-items:
      center;

    justify-content:
      center;

    font-weight: bold;

    font-size: 1.2rem;
  }


  .greeting-text {
    font-size:
      0.85rem;

    opacity: 0.85;
  }


  .user-name {
    margin:
      2px
      0
      0;

    font-size:
      1.3rem;

    font-weight: 700;
  }


  .btn-logout {
    background:
      rgba(
        255,
        255,
        255,
        0.15
      );

    border:
      1px
      solid
      rgba(
        255,
        255,
        255,
        0.25
      );

    color: white;

    padding:
      8px
      16px;

    border-radius:
      20px;

    cursor: pointer;

    display: flex;

    align-items:
      center;

    gap: 6px;

    font-weight: 600;

    font-size:
      0.85rem;
  }


  /* =====================================================
     BODY
  ====================================================== */

  .app-body {
    max-width:
      1000px;

    margin:
      -32px
      auto
      0;

    padding:
      0
      16px;
  }


  /* =====================================================
     TOP
  ====================================================== */

  .desktop-top-grid {
    display: grid;

    grid-template-columns:
      1fr;

    gap: 20px;

    margin-bottom:
      20px;
  }


  .desktop-only {
    display: none;
  }


  /* =====================================================
     BALANCE
  ====================================================== */

  .balance-card {
    background: white;

    border-radius:
      20px;

    padding:
      22px
      24px;

    box-shadow:
      0 10px 25px
      rgba(
        0,
        0,
        0,
        0.05
      );
  }


  .balance-header {
    display: flex;

    justify-content:
      space-between;

    align-items:
      center;
  }


  .balance-label {
    font-size:
      0.85rem;

    color:
      #64748b;
  }


  .balance-amount {
    font-size:
      2rem;

    font-weight:
      800;

    color:
      #0d47a1;

    margin:
      10px
      0
      16px;
  }


  .card-footer {
    display: flex;

    gap: 12px;

    border-top:
      1px
      solid
      #f1f5f9;

    padding-top:
      12px;
  }


  .info-pill {
    font-size:
      0.8rem;

    color:
      #475569;

    background:
      #f8fafc;

    padding:
      4px
      10px;

    border-radius:
      8px;
  }


  /* =====================================================
     STATS
  ====================================================== */

  .stats-card {
    background: white;

    border-radius:
      20px;

    padding:
      22px
      24px;

    box-shadow:
      0 10px 25px
      rgba(
        0,
        0,
        0,
        0.05
      );
  }


  .stats-grid {
    display: grid;

    grid-template-columns:
      1fr
      1fr;

    gap: 12px;

    margin-top:
      10px;
  }


  .stat-item {
    padding: 14px;

    border-radius:
      12px;

    display: flex;

    flex-direction:
      column;
  }


  .stat-label {
    font-size:
      0.75rem;

    color:
      #64748b;

    font-weight:
      600;
  }


  .stat-val {
    font-size:
      1.05rem;

    font-weight:
      700;

    margin-top:
      4px;
  }


  /* =====================================================
     DASHBOARD
  ====================================================== */

  .dashboard-layout {
    display: grid;

    grid-template-columns:
      1fr;

    gap: 20px;
  }


  .menu-section,
  .recent-section {
    background: white;

    border-radius:
      20px;

    padding:
      22px;

    box-shadow:
      0 10px 25px
      rgba(
        0,
        0,
        0,
        0.05
      );
  }


  .section-title {
    margin:
      0
      0
      18px;

    font-size:
      1rem;

    color:
      #1e293b;

    font-weight:
      700;
  }


  /* =====================================================
     MENU
  ====================================================== */

  .menu-grid {
    display: grid;

    grid-template-columns:
      repeat(
        4,
        1fr
      );

    gap:
      16px
      10px;
  }


  .menu-item {
    background: none;

    border: none;

    display: flex;

    flex-direction:
      column;

    align-items:
      center;

    cursor: pointer;

    padding: 6px;

    border-radius:
      12px;
  }


  .menu-item:hover {
    background:
      #f8fafc;
  }


  .menu-item span {
    font-size:
      0.75rem;

    color:
      #334155;

    font-weight:
      600;

    margin-top:
      8px;

    text-align:
      center;
  }


  .icon-circle {
    width: 52px;

    height: 52px;

    border-radius:
      50%;

    display: flex;

    justify-content:
      center;

    align-items:
      center;

    font-size:
      1.4rem;
  }


  /* =====================================================
     COLORS
  ====================================================== */

  .bg-emerald {
    background:
      #d1fae5;
  }

  .bg-green {
    background:
      #e8f5e9;
  }

  .bg-blue {
    background:
      #e3f2fd;
  }

  .bg-teal {
    background:
      #e0f2f1;
  }

  .bg-yellow {
    background:
      #fffde7;
  }

  .bg-purple {
    background:
      #f3e5f5;
  }

  .bg-orange {
    background:
      #fff3e0;
  }

  .bg-teal-light {
    background:
      #f0fdf4;
  }

  .bg-red-light {
    background:
      #fef2f2;
  }

  .bg-emerald-light {
    background:
      #ecfdf5;
  }

  .bg-blue-light {
    background:
      #eff6ff;
  }


  /* =====================================================
     RECENT
  ====================================================== */

  .recent-header h3 {
    margin: 0;

    font-size:
      1rem;

    color:
      #1e293b;
  }


  .recent-item {
    display: flex;

    align-items:
      center;

    padding:
      12px
      0;

    border-bottom:
      1px
      solid
      #f1f5f9;

    gap: 12px;
  }


  .item-icon-type {
    width: 36px;

    height: 36px;

    border-radius:
      10px;

    display: flex;

    align-items:
      center;

    justify-content:
      center;

    font-weight: bold;

    background:
      #f1f5f9;

    color:
      #64748b;
  }


  .item-icon-type.is-in {
    background:
      #e8f5e9;

    color:
      #2e7d32;
  }


  .item-info {
    display: flex;

    flex-direction:
      column;

    flex-grow: 1;
  }


  .item-title {
    font-size:
      0.88rem;

    font-weight:
      600;

    color:
      #1e293b;
  }


  .item-date {
    font-size:
      0.75rem;

    color:
      #94a3b8;
  }


  .item-amount {
    font-size:
      0.9rem;

    font-weight:
      700;
  }


  /* =====================================================
     PAGE CARD
  ====================================================== */

  .page-card {
    background: white;

    border-radius:
      20px;

    padding:
      24px;

    box-shadow:
      0 10px 25px
      rgba(
        0,
        0,
        0,
        0.05
      );
  }


  .nav-back-wrapper {
    margin-bottom:
      16px;
  }


  .back-button {
    background: white;

    border:
      1px
      solid
      #e2e8f0;

    color:
      #1976d2;

    font-weight:
      700;

    font-size:
      0.85rem;

    cursor:
      pointer;

    padding:
      8px
      16px;

    border-radius:
      10px;
  }


  .sub-desc {
    font-size:
      0.82rem;

    color:
      #64748b;

    margin-top:
      4px;

    margin-bottom:
      20px;
  }


  .margin-0 {
    margin: 0;
  }


  /* =====================================================
     SPP
  ====================================================== */

  .spp-summary-grid {
    display: grid;

    grid-template-columns:
      repeat(
        3,
        1fr
      );

    gap: 12px;

    margin-bottom:
      20px;
  }


  .spp-card-stat {
    padding:
      14px;

    border-radius:
      12px;

    display: flex;

    flex-direction:
      column;
  }


  .spp-list {
    display: flex;

    flex-direction:
      column;

    gap: 12px;
  }


  .spp-item-card {
    display: flex;

    justify-content:
      space-between;

    align-items:
      center;

    gap: 16px;

    padding:
      16px;

    border:
      1px
      solid
      #e2e8f0;

    border-radius:
      12px;

    background:
      #ffffff;
  }


  .spp-item-card.unpaid {
    border-color:
      #fca5a5;

    background:
      #fff5f5;
  }


  .spp-month {
    font-size:
      1rem;

    font-weight:
      700;

    color:
      #1e293b;
  }


  .spp-subinfo {
    font-size:
      0.8rem;

    color:
      #64748b;

    margin-top:
      4px;
  }


  .status-badge {
    padding:
      6px
      12px;

    border-radius:
      20px;

    font-size:
      0.75rem;

    font-weight:
      700;
  }


  .badge-lunas {
    background:
      #d1fae5;

    color:
      #065f46;
  }


  .btn-pay-now {
    background:
      #0d47a1;

    color: white;

    border: none;

    padding:
      8px
      16px;

    border-radius:
      8px;

    font-size:
      0.8rem;

    font-weight:
      600;

    cursor:
      pointer;
  }


  /* =====================================================
     TABS
  ====================================================== */

  .tab-header {
    display: flex;

    gap: 8px;

    margin-bottom:
      20px;

    border-bottom:
      2px
      solid
      #f1f5f9;

    padding-bottom:
      8px;

    overflow-x:
      auto;
  }


  .tab-btn {
    background: none;

    border: none;

    padding:
      8px
      16px;

    font-size:
      0.85rem;

    font-weight:
      600;

    color:
      #64748b;

    cursor:
      pointer;

    border-radius:
      8px;

    white-space:
      nowrap;
  }


  .tab-btn.active {
    background:
      #e3f2fd;

    color:
      #0d47a1;
  }


  /* =====================================================
     TABLE
  ====================================================== */

  .card-header-flex {
    display: flex;

    justify-content:
      space-between;

    align-items:
      center;

    gap: 16px;

    margin-bottom:
      16px;
  }


  .btn-export {
    background:
      #f1f5f9;

    border:
      1px
      solid
      #cbd5e1;

    color:
      #334155;

    padding:
      6px
      12px;

    border-radius:
      8px;

    font-size:
      0.75rem;

    font-weight:
      600;

    cursor:
      pointer;

    white-space:
      nowrap;
  }


  .table-container {
    overflow-x:
      auto;
  }


  .app-table {
    width: 100%;

    border-collapse:
      collapse;

    text-align:
      left;

    font-size:
      0.85rem;
  }


  .app-table th {
    background:
      #f8fafc;

    color:
      #64748b;

    padding:
      10px
      12px;

    font-weight:
      600;

    border-bottom:
      1px
      solid
      #e2e8f0;
  }


  .app-table td {
    padding:
      12px;

    border-bottom:
      1px
      solid
      #f1f5f9;
  }


  .total-bar {
    margin-top:
      16px;

    padding:
      12px
      16px;

    border-radius:
      10px;

    font-weight:
      700;

    font-size:
      0.9rem;

    text-align:
      right;
  }


  /* =====================================================
     TEXT COLORS
  ====================================================== */

  .text-green-bg {
    background:
      #f0fdf4;

    color:
      #166534;
  }


  .text-red-bg {
    background:
      #fef2f2;

    color:
      #991b1b;
  }


  .text-green {
    color:
      #166534;
  }


  .text-red {
    color:
      #991b1b;
  }


  .text-blue {
    color:
      #1d4ed8;
  }


  .text-muted {
    color:
      #64748b;
  }


  .text-center {
    text-align:
      center;
  }


  .font-semibold {
    font-weight:
      600;
  }


  .is-in {
    color:
      #2e7d32;
  }


  .is-out {
    color:
      #c62828;
  }


  /* =====================================================
     LIST
  ====================================================== */

  .list-container {
    display: flex;

    flex-direction:
      column;

    gap: 12px;
  }


  .info-item-card {
    display: flex;

    align-items:
      center;

    gap: 16px;

    padding:
      14px;

    background:
      #f8fafc;

    border-radius:
      12px;
  }


  .info-badge {
    background:
      #0d47a1;

    color: white;

    font-size:
      0.75rem;

    font-weight:
      700;

    padding:
      6px
      12px;

    border-radius:
      8px;

    white-space:
      nowrap;
  }


  .info-content {
    display: flex;

    flex-direction:
      column;
  }


  .info-title {
    font-size:
      0.9rem;

    font-weight:
      700;

    color:
      #1e293b;
  }


  .info-time {
    font-size:
      0.75rem;

    color:
      #64748b;

    margin-top:
      2px;
  }


  /* =====================================================
     ANNOUNCEMENTS
  ====================================================== */

  .notice-card {
    background:
      #f8fafc;

    border-left:
      4px
      solid
      #0d47a1;

    padding:
      14px
      16px;

    border-radius:
      0
      12px
      12px
      0;
  }


  .notice-date {
    font-size:
      0.7rem;

    color:
      #94a3b8;

    font-weight:
      600;
  }


  .notice-title {
    margin:
      6px
      0;

    font-size:
      0.95rem;

    color:
      #1e293b;
  }


  .notice-text {
    margin: 0;

    font-size:
      0.82rem;

    color:
      #475569;

    white-space:
      pre-wrap;
  }


  /* =====================================================
     PRESTASI
  ====================================================== */

  .achievement-card {
    display: flex;

    align-items:
      center;

    gap: 14px;

    padding:
      14px;

    background:
      #fffbe3;

    border:
      1px
      solid
      #fef08a;

    border-radius:
      12px;
  }


  .trophy-icon {
    font-size:
      1.8rem;
  }


  .achievement-title {
    font-size:
      0.9rem;

    font-weight:
      700;

    color:
      #854d0e;
  }


  .achievement-sub {
    margin:
      2px
      0
      0;

    font-size:
      0.75rem;

    color:
      #a16207;
  }


  /* =====================================================
     ABSENSI
  ====================================================== */

  .badge-status {
    background:
      #e2e8f0;

    color:
      #334155;

    padding:
      4px
      8px;

    border-radius:
      6px;

    font-size:
      0.75rem;

    font-weight:
      600;
  }


  /* =====================================================
     BARCODE
  ====================================================== */

  .barcode-box {
    background:
      #f8fafc;

    border:
      2px
      dashed
      #cbd5e1;

    border-radius:
      16px;

    padding:
      24px;

    display:
      inline-block;

    margin-top:
      10px;

    max-width:
      100%;

    overflow-x:
      auto;
  }


  .barcode-box h2 {
    margin: 0;

    font-size:
      1.2rem;

    color:
      #1e293b;
  }


  .id-tag {
    font-size:
      0.8rem;

    color:
      #64748b;

    margin:
      4px
      0
      16px;
  }


  /* =====================================================
     MODAL & SIDEBAR
  ====================================================== */

  .sidebar-overlay,
  .modal-overlay {
    position:
      fixed;

    top: 0;

    left: 0;

    width: 100%;

    height: 100%;

    background:
      rgba(
        0,
        0,
        0,
        0.4
      );

    display: flex;

    justify-content:
      flex-end;

    z-index:
      1000;
  }


  .modal-overlay {
    justify-content:
      center;

    align-items:
      center;

    padding:
      16px;

    box-sizing:
      border-box;
  }


  .sidebar-content {
    background: white;

    width:
      320px;

    max-width:
      90%;

    height: 100%;

    padding:
      24px;

    box-sizing:
      border-box;

    box-shadow:
      -4px
      0
      15px
      rgba(
        0,
        0,
        0,
        0.1
      );

    display: flex;

    flex-direction:
      column;
  }


  .modal-box {
    background: white;

    width: 100%;

    max-width:
      440px;

    border-radius:
      20px;

    padding:
      24px;

    box-sizing:
      border-box;

    box-shadow:
      0
      10px
      25px
      rgba(
        0,
        0,
        0,
        0.15
      );
  }


  .sidebar-header,
  .modal-header {
    display: flex;

    justify-content:
      space-between;

    align-items:
      center;

    margin-bottom:
      20px;
  }


  .sidebar-header h3,
  .modal-header h3 {
    margin: 0;

    font-size:
      1.1rem;
  }


  .close-x {
    background: none;

    border: none;

    font-size:
      1.2rem;

    cursor:
      pointer;

    color:
      #64748b;
  }


  /* =====================================================
     PROFILE
  ====================================================== */

  .profile-upload-section {
    display: flex;

    flex-direction:
      column;

    align-items:
      center;

    gap: 12px;

    margin-bottom:
      20px;
  }


  .avatar-preview img {
    width: 80px;

    height: 80px;

    border-radius:
      50%;

    object-fit:
      cover;
  }


  .avatar-placeholder-lg {
    width: 80px;

    height: 80px;

    border-radius:
      50%;

    background:
      #0d47a1;

    color: white;

    display: flex;

    align-items:
      center;

    justify-content:
      center;

    font-size:
      2rem;

    font-weight:
      bold;
  }


  .btn-upload-label {
    background:
      #f1f5f9;

    padding:
      6px
      12px;

    border-radius:
      8px;

    font-size:
      0.8rem;

    font-weight:
      600;

    cursor:
      pointer;

    color:
      #334155;
  }


  .form-group {
    display: flex;

    flex-direction:
      column;

    gap: 6px;

    margin-bottom:
      20px;
  }


  .form-group label {
    font-size:
      0.8rem;

    font-weight:
      600;

    color:
      #475569;
  }


  .form-input {
    padding:
      10px;

    border:
      1px
      solid
      #cbd5e1;

    border-radius:
      8px;

    font-size:
      0.9rem;
  }


  .btn-save,
  .btn-modal-close {
    background:
      #0d47a1;

    color: white;

    border: none;

    padding:
      12px;

    border-radius:
      10px;

    font-weight:
      700;

    cursor:
      pointer;

    width:
      100%;
  }


  /* =====================================================
     REKENING
  ====================================================== */

  .rekening-list {
    display: flex;

    flex-direction:
      column;

    gap: 12px;

    margin-bottom:
      20px;
  }


  .rekening-card {
    background:
      #f8fafc;

    border:
      1px
      solid
      #e2e8f0;

    border-radius:
      12px;

    padding:
      14px;

    display: flex;

    flex-direction:
      column;

    gap: 6px;
  }


  .bank-name {
    font-weight:
      700;

    color:
      #0d47a1;

    font-size:
      0.9rem;
  }


  .bank-owner {
    font-size:
      0.75rem;

    color:
      #64748b;
  }


  .rekening-num {
    font-size:
      1.1rem;

    font-weight:
      800;

    letter-spacing:
      1px;

    color:
      #1e293b;
  }


  .btn-copy {
    align-self:
      flex-start;

    background:
      #e3f2fd;

    color:
      #0d47a1;

    border: none;

    padding:
      4px
      10px;

    border-radius:
      6px;

    font-size:
      0.75rem;

    font-weight:
      600;

    cursor:
      pointer;
  }


  /* =====================================================
     ALERT
  ====================================================== */

  .alert-box {
    background:
      #fef2f2;

    color:
      #991b1b;

    padding:
      12px;

    border-radius:
      10px;

    margin-bottom:
      16px;

    font-size:
      0.85rem;

    text-align:
      center;
  }


  .empty-msg {
    color:
      #94a3b8;

    font-size:
      0.85rem;

    text-align:
      center;

    padding:
      16px
      0;
  }


  /* =====================================================
     DESKTOP
  ====================================================== */

  @media (
    min-width:
      768px
  ) {

    .desktop-top-grid {
      grid-template-columns:
        1fr
        1fr;
    }


    .desktop-only {
      display:
        block;
    }


    .dashboard-layout {
      grid-template-columns:
        1fr
        1fr;
    }


    .logout-text {
      display:
        inline;
    }

  }


  /* =====================================================
     MOBILE
  ====================================================== */

  @media (
    max-width:
      767px
  ) {

    .logout-text {
      display:
        none;
    }


    .spp-summary-grid {
      grid-template-columns:
        1fr;
    }


    .spp-item-card {
      align-items:
        flex-start;

      flex-direction:
        column;
    }


    .card-header-flex {
      align-items:
        flex-start;

      flex-direction:
        column;
    }


    .menu-grid {
      grid-template-columns:
        repeat(
          4,
          1fr
        );
    }


    .balance-amount {
      font-size:
        1.7rem;
    }

  }

</style>