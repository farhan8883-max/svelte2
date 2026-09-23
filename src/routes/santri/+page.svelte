<!--
  Dependency:
    npm install qrcode
  If TypeScript asks for types:
    npm install -D @types/qrcode
--> 


<script lang="ts">
  import { supabase } from "$lib/supabaseClient";
  import { onMount, tick } from "svelte";
  import { goto } from "$app/navigation";
  import JsBarcode from "jsbarcode";
  import QRCode from "qrcode";

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

  interface StudentGrade {
    id: number;
    user_id: number;
    class_id: number;
    academic_year: string;
    semester: number;
    subject: string;
    nilai_tugas: number | null;
    nilai_ulangan_harian: number | null;
    nilai_pts: number | null;
    nilai_pas: number | null;
    nilai_sikap_karakter: number | null;
    nilai_ujian_sekolah: number | null;
    nilai_akhir: number | null;
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

  /* =========================================================
     NOTIFIKASI UPDATE ADMIN / USTAD
  ========================================================= */

  interface AppNotification {
    id: string;
    title: string;
    text: string;
    section: typeof activeSection;
    created_at: string;
  }

  let notifications: AppNotification[] = [];
  let unreadNotificationCount = 0;
  let showNotifications = false;
  let notificationChannel: ReturnType<typeof supabase.channel> | null = null;

  let loadingEntries = false;
  let loadingAbsensi = false;
  let loadingSPP = false;
  let loadingPengumuman = false;
  let loadingNilai = false;
  let nilaiList: StudentGrade[] = [];

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
    | "spp"
    | "nilai" = "home";

  /* =========================================================
     HOME AD / PROMO BANNER
  ========================================================= */

  interface BannerItem {
    image: string;
    title: string;
    description: string;
    buttonText?: string;
    buttonAction?: () => void;
  }

  let activeBanner = 0;
  let bannerInterval: ReturnType<typeof setInterval> | null = null;
  let isBannerHovered = false;

  const bannerList: BannerItem[] = [
    {
      image: "/images/foto.png",
      title: "Informasi Pesantren",
      description: "Dapatkan informasi terbaru mengenai kegiatan dan pengumuman santri.",
      buttonText: "Lihat Pengumuman",
      buttonAction: () => switchSection("pengumuman")
    },
    {
      image: "/images/foto1.png",
      title: "Pembayaran SPP",
      description: "Cek status pembayaran SPP santri dengan cepat dan mudah.",
      buttonText: "Cek SPP",
      buttonAction: () => switchSection("spp")
    },
    {
      image: "/images/foto2.png",
      title: "Prestasi Santri",
      description: "Lihat berbagai prestasi dan pencapaian santri.",
      buttonText: "Lihat Prestasi",
      buttonAction: () => switchSection("prestasi")
    }
  ];

  function nextBanner() {
    if (bannerList.length === 0) return;
    activeBanner = (activeBanner + 1) % bannerList.length;
  }

  function prevBanner() {
    if (bannerList.length === 0) return;
    activeBanner =
      (activeBanner - 1 + bannerList.length) % bannerList.length;
  }

  function goToBanner(index: number) {
    if (index < 0 || index >= bannerList.length) return;
    activeBanner = index;
  }

  function startBannerAutoplay() {
    stopBannerAutoplay();

    if (bannerList.length <= 1) return;

    bannerInterval = setInterval(() => {
      if (!isBannerHovered) {
        nextBanner();
      }
    }, 5000);
  }

  function stopBannerAutoplay() {
    if (bannerInterval) {
      clearInterval(bannerInterval);
      bannerInterval = null;
    }
  }

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
     NOTIFICATION HELPERS
  ========================================================= */

  function getNotificationStorageKey() {
    return `mySantri_notifications_seen_${user?.id || "guest"}`;
  }

  function getSeenNotificationIds(): string[] {
    if (typeof window === "undefined") return [];

    try {
      return JSON.parse(
        localStorage.getItem(getNotificationStorageKey()) || "[]"
      );
    } catch {
      return [];
    }
  }

  function saveSeenNotificationIds(ids: string[]) {
    if (typeof window === "undefined") return;

    localStorage.setItem(
      getNotificationStorageKey(),
      JSON.stringify(ids.slice(-200))
    );
  }

  function refreshUnreadCount() {
    const seen = new Set(getSeenNotificationIds());

    unreadNotificationCount = notifications.filter(
      (item) => !seen.has(item.id)
    ).length;
  }

  function addNotification(
    id: string,
    title: string,
    text: string,
    section: typeof activeSection,
    createdAt = new Date().toISOString()
  ) {
    if (notifications.some((item) => item.id === id)) return;

    notifications = [
      {
        id,
        title,
        text,
        section,
        created_at: createdAt
      },
      ...notifications
    ].slice(0, 30);

    refreshUnreadCount();
  }

  function markNotificationsAsRead() {
    saveSeenNotificationIds([
      ...new Set([
        ...getSeenNotificationIds(),
        ...notifications.map((item) => item.id)
      ])
    ]);

    unreadNotificationCount = 0;
  }

  function toggleNotifications() {
    // Membuka panel tidak langsung menghilangkan tanda merah,
    // supaya perilakunya seperti notice/message Instagram.
    showNotifications = !showNotifications;
  }

  async function openNotification(item: AppNotification) {
    showNotifications = false;
    await switchSection(item.section);
  }

  function setupRealtimeNotifications() {
    if (!user?.id || notificationChannel) return;

    notificationChannel = supabase
      .channel(`mysantri-notifications-${user.id}`, {
        config: {
          broadcast: { self: false },
          presence: { key: String(user.id) }
        }
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "announcements"
        },
        (payload) => {
          const row = (payload.new || {}) as Record<string, any>;

          addNotification(
            `announcement-${row.id || "update"}-${Date.now()}`,
            payload.eventType === "INSERT"
              ? "Pengumuman baru"
              : "Pengumuman diperbarui",
            row.title || "Ada informasi terbaru dari pengurus pesantren.",
            "pengumuman",
            row.created_at || new Date().toISOString()
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance",
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          const row = (payload.new || {}) as Record<string, any>;

          addNotification(
            `attendance-${row.id || "update"}-${Date.now()}`,
            payload.eventType === "INSERT"
              ? "Absensi baru"
              : "Absensi diperbarui",
            `Status absensi kamu: ${row.status || "diperbarui"}.`,
            "absensi"
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "student_grades",
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          const row = (payload.new || {}) as Record<string, any>;

          addNotification(
            `grade-${row.id || "update"}-${Date.now()}`,
            payload.eventType === "INSERT"
              ? "Nilai baru"
              : "Nilai diperbarui",
            row.subject
              ? `Nilai ${row.subject} baru saja diperbarui.`
              : "Ada pembaruan nilai akademik.",
            "nilai"
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "entries",
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          const row = (payload.new || {}) as Record<string, any>;

          addNotification(
            `entry-${row.id || "update"}-${Date.now()}`,
            payload.eventType === "INSERT"
              ? "Keuangan diperbarui"
              : "Transaksi diperbarui",
            row.name
              ? `${row.name} — Rp ${formatRupiah(Number(row.amount || 0))}`
              : "Ada perubahan pada data keuangan.",
            "keuangan"
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "spp_payments",
          filter: `user_id=eq.${user.id}`
        },
        () => {
          addNotification(
            `spp-${user.id}-${Date.now()}`,
            "SPP diperbarui",
            "Ada perubahan pada data pembayaran SPP kamu.",
            "spp"
          );
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("Realtime notifikasi aktif.");
        }
      });
  }

  function cleanupRealtimeNotifications() {
    if (notificationChannel) {
      supabase.removeChannel(notificationChannel);
      notificationChannel = null;
    }
  }

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
      loadPengumuman(),
      loadNilai()
    ]);

    setupRealtimeNotifications();
    startBannerAutoplay();

    return () => {
      cleanupRealtimeNotifications();
      stopBannerAutoplay();
    };
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
     LOAD NILAI
  ========================================================= */

  async function loadNilai() {
    if (!user?.id) return;

    loadingNilai = true;

    const { data, error } = await supabase
      .from("student_grades")
      .select(`
        id,
        user_id,
        class_id,
        academic_year,
        semester,
        subject,
        nilai_tugas,
        nilai_ulangan_harian,
        nilai_pts,
        nilai_pas,
        nilai_sikap_karakter,
        nilai_ujian_sekolah,
        nilai_akhir
      `)
      .eq("user_id", user.id)
      .order("subject", { ascending: true });

    loadingNilai = false;

    if (error) {
      console.error("Gagal memuat nilai:", error);
      message = "Gagal memuat data nilai: " + error.message;
      return;
    }

    nilaiList = (data || []) as StudentGrade[];
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
     QR CODE UNIK PER SANTRI
     ========================================================= */

  async function generateStudentQR() {
    if (!user?.id) return;

    await tick();

    const qrCanvas =
      document.getElementById(
        "santri-qr-main"
      ) as HTMLCanvasElement | null;

    if (!qrCanvas) return;

    const qrPayload = JSON.stringify({
      type: "SANTRI",
      id: user.id,
      username: user.username || "",
      nama: user.nama || user.username || "Santri",
      kelas: user.kelas || user.kelas_id || ""
    });

    try {
      await QRCode.toCanvas(
        qrCanvas,
        qrPayload,
        {
          width: 250,
          margin: 2,
          errorCorrectionLevel: "H",
          color: {
            dark: "#0f172a",
            light: "#ffffff"
          }
        }
      );
    } catch (error) {
      console.error(
        "Gagal membuat QR santri:",
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
      await generateStudentQR();
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

    if (section === "nilai") {
      await loadNilai();
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

      <div class="notification-wrapper">
        <button
          class="notification-button"
          class:has-unread={unreadNotificationCount > 0}
          on:click={toggleNotifications}
          title="Notifikasi"
          aria-label="Notifikasi"
        >
          <span class="notification-bell">🔔</span>

          {#if unreadNotificationCount > 0}
            <span class="notification-badge">
              {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
            </span>
          {/if}
        </button>

        {#if showNotifications}
          <div class="notification-panel">
            <div class="notification-panel-header">
              <div>
                <strong>Notifikasi</strong>
                <span>Update dari admin & ustad</span>
              </div>

              {#if notifications.length > 0}
                <button
                  class="notification-clear"
                  on:click={markNotificationsAsRead}
                >
                  Sudah dibaca
                </button>
              {/if}
            </div>

            <div class="notification-list">
              {#if notifications.length === 0}
                <div class="notification-empty">
                  <div class="notification-empty-icon">🔔</div>
                  <strong>Belum ada notifikasi</strong>
                  <span>Update terbaru akan muncul di sini.</span>
                </div>
              {:else}
                {#each notifications as item}
                  <button
                    class="notification-item"
                    class:unread={!getSeenNotificationIds().includes(item.id)}
                    on:click={() => openNotification(item)}
                  >
                    <span class="notification-dot"></span>

                    <span class="notification-item-content">
                      <strong>{item.title}</strong>
                      <span>{item.text}</span>
                      <small>{formatTanggal(item.created_at)}</small>
                    </span>
                  </button>
                {/each}
              {/if}
            </div>
          </div>
        {/if}
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
            {#if unreadNotificationCount > 0}
              <span class="menu-notification-dot"></span>
            {/if}
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
                switchSection("nilai")}
            >

              <div
                class="
                  icon-circle
                  bg-purple
                "
              >
                📚
              </div>

              <span>
                Nilai Santri
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


      <!-- =================================================
           AUTO SLIDING PROMO BANNER
      ================================================== -->

      <section
        class="banner-section"
        aria-label="Informasi dan promosi"
        on:mouseenter={() => (isBannerHovered = true)}
        on:mouseleave={() => (isBannerHovered = false)}
      >

        <div class="banner-slider">

          {#each bannerList as banner, index}

            <article
              class="banner-slide"
              class:banner-active={index === activeBanner}
              aria-hidden={index !== activeBanner}
            >

              <img
                src={banner.image}
                alt={banner.title}
                class="banner-image"
                loading={index === 0 ? "eager" : "lazy"}
              />

              <div class="banner-overlay"></div>

              <div class="banner-content">
                <span class="banner-label">INFORMASI</span>

                <h3>{banner.title}</h3>

                <p>{banner.description}</p>

                {#if banner.buttonText}
                  <button
                    type="button"
                    class="banner-button"
                    on:click={() => banner.buttonAction?.()}
                  >
                    {banner.buttonText}
                    <span aria-hidden="true">→</span>
                  </button>
                {/if}
              </div>

            </article>

          {/each}

          {#if bannerList.length > 1}

            <button
              type="button"
              class="banner-arrow banner-prev"
              on:click={prevBanner}
              aria-label="Banner sebelumnya"
            >
              ‹
            </button>

            <button
              type="button"
              class="banner-arrow banner-next"
              on:click={nextBanner}
              aria-label="Banner berikutnya"
            >
              ›
            </button>

            <div class="banner-dots" aria-label="Navigasi banner">
              {#each bannerList as _, index}
                <button
                  type="button"
                  class="banner-dot"
                  class:active={index === activeBanner}
                  on:click={() => goToBanner(index)}
                  aria-label={`Buka banner ${index + 1}`}
                  aria-current={index === activeBanner ? "true" : undefined}
                ></button>
              {/each}
            </div>

          {/if}

        </div>

      </section>

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
         NILAI
    ================================================== -->

    {#if activeSection === "nilai"}
      <div class="page-card">
        <div class="card-header-flex">
          <div>
            <h3>Nilai Akademik Santri</h3>
            <p class="sub-desc margin-0">Nilai tugas, ulangan harian, PTS, PAS, sikap, ujian sekolah, dan nilai akhir.</p>
          </div>
          <button class="btn-export" on:click={loadNilai}>🔄 Refresh</button>
        </div>

        {#if loadingNilai}
          <p class="empty-msg">Memuat data nilai...</p>
        {:else if nilaiList.length === 0}
          <p class="empty-msg">Belum ada data nilai.</p>
        {:else}
          <div class="table-container">
            <table class="app-table">
              <thead>
                <tr>
                  <th>Mata Pelajaran</th>
                  <th>Tugas</th>
                  <th>Ulangan Harian</th>
                  <th>PTS</th>
                  <th>PAS</th>
                  <th>Sikap</th>
                  <th>Ujian Sekolah</th>
                  <th>Nilai Akhir</th>
                </tr>
              </thead>
              <tbody>
                {#each nilaiList as item}
                  <tr>
                    <td class="font-semibold">{item.subject}</td>
                    <td>{item.nilai_tugas ?? "-"}</td>
                    <td>{item.nilai_ulangan_harian ?? "-"}</td>
                    <td>{item.nilai_pts ?? "-"}</td>
                    <td>{item.nilai_pas ?? "-"}</td>
                    <td>{item.nilai_sikap_karakter ?? "-"}</td>
                    <td>{item.nilai_ujian_sekolah ?? "-"}</td>
                    <td class="font-semibold">{item.nilai_akhir ?? "-"}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
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
          QR Code Santri
        </h3>

        <p
          class="sub-desc"
        >
          QR ini dibuat khusus untuk
          santri yang sedang login.
          Tunjukkan kepada Ustadz saat
          presensi atau pemeriksaan data.
        </p>

        <div
          class="qr-student-card"
        >

          <div class="qr-student-header">
            <div class="qr-student-logo">
              MS
            </div>

            <div>
              <strong>
                MySantri
              </strong>

              <span>
                Kartu Identitas Santri
              </span>
            </div>
          </div>

          <div class="qr-student-profile">
            <div class="qr-avatar">
              {#if avatarUrl}
                <img
                  src={avatarUrl}
                  alt="Foto santri"
                />
              {:else}
                {
                  (
                    user?.username ||
                    user?.nama ||
                    "S"
                  )[0].toUpperCase()
                }
              {/if}
            </div>

            <div class="qr-student-info">
              <strong>
                {
                  user?.username ||
                  user?.nama ||
                  "Santri"
                }
              </strong>

              <span>
                ID SANTRI-{user?.id}
              </span>

              <span>
                Kelas:
                {user?.kelas || user?.kelas_id || "-"}
              </span>
            </div>
          </div>

          <div class="qr-code-wrapper">
            <canvas
              id="santri-qr-main"
              aria-label="QR Code unik santri"
            ></canvas>
          </div>

          <div class="qr-unique-note">
            <span>✓</span>
            QR unik untuk akun santri ini
          </div>

          <p class="qr-small-text">
            Jangan gunakan QR milik santri lain.
            Setiap QR berisi identitas akun yang sedang login.
          </p>

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


        <div class="topup-student-banner">
          <div class="topup-student-icon">
            {(
              user?.username ||
              user?.nama ||
              "S"
            )[0].toUpperCase()}
          </div>

          <div>
            <span class="topup-student-label">
              Top Up untuk santri
            </span>

            <strong>
              {
                user?.username ||
                user?.nama ||
                "Santri"
              }
            </strong>

            <small>
              ID: SANTRI-{user?.id}
            </small>
          </div>
        </div>

        <p
          class="sub-desc"
        >
          Lakukan pembayaran ke rekening resmi
          pesantren berikut. Gunakan ID santri
          sebagai referensi agar pembayaran
          dapat dicocokkan dengan akun yang benar.
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

            <div class="bank-heading">
              <div class="bank-logo bank-logo-bsi">
                <span>BSI</span>
              </div>

              <div class="bank-info">
                <span class="bank-name">
                  Bank BSI
                </span>


                <span class="bank-owner">
                  a.n Pesantren SPP / Kantin
                </span>
              </div>
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

            <div class="bank-heading">
              <div class="bank-logo bank-logo-bri">
                <span>BRI</span>
              </div>

              <div class="bank-info">
                <span class="bank-name">
                  Bank BRI
                </span>


                <span class="bank-owner">
                  a.n Pesantren SPP / Kantin
                </span>
              </div>
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


        <div class="topup-reference">
          <span>
            Referensi transfer
          </span>

          <strong>
            SANTRI-{user?.id}
          </strong>

          <small>
            Cantumkan kode ini pada keterangan transfer jika diperlukan.
          </small>
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

  /* =====================================================
     QR CODE SANTRI
  ====================================================== */

  .qr-student-card {
    width: min(100%, 390px);
    margin: 18px auto 0;
    padding: 20px;
    box-sizing: border-box;
    background: #ffffff;
    border: 1px solid #dbe4f0;
    border-radius: 22px;
    box-shadow: 0 14px 35px rgba(15, 23, 42, 0.08);
    text-align: left;
  }

  .qr-student-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 16px;
    border-bottom: 1px solid #eef2f7;
  }

  .qr-student-logo {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0d47a1;
    color: white;
    font-weight: 900;
    letter-spacing: 0.5px;
  }

  .qr-student-header strong,
  .qr-student-header span {
    display: block;
  }

  .qr-student-header strong {
    color: #0f172a;
    font-size: 1rem;
  }

  .qr-student-header span {
    margin-top: 2px;
    color: #64748b;
    font-size: 0.72rem;
  }

  .qr-student-profile {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 18px 0 12px;
  }

  .qr-avatar {
    width: 58px;
    height: 58px;
    flex: 0 0 58px;
    border-radius: 16px;
    overflow: hidden;
    background: #e8f1ff;
    color: #0d47a1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.35rem;
    font-weight: 800;
  }

  .qr-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .qr-student-info {
    min-width: 0;
  }

  .qr-student-info strong,
  .qr-student-info span {
    display: block;
  }

  .qr-student-info strong {
    color: #0f172a;
    font-size: 1rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .qr-student-info span {
    margin-top: 3px;
    color: #64748b;
    font-size: 0.76rem;
  }

  .qr-code-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 12px auto;
    padding: 14px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 18px;
  }

  .qr-code-wrapper canvas {
    display: block;
    width: min(250px, 100%);
    height: auto;
    image-rendering: pixelated;
  }

  .qr-unique-note {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    color: #047857;
    font-size: 0.8rem;
    font-weight: 700;
  }

  .qr-unique-note span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #d1fae5;
  }

  .qr-small-text {
    margin: 9px 0 0;
    color: #94a3b8;
    text-align: center;
    font-size: 0.7rem;
    line-height: 1.5;
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

  .topup-student-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    margin: 4px 0 14px;
    border-radius: 14px;
    background: #eff6ff;
    border: 1px solid #dbeafe;
  }

  .topup-student-icon {
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    border-radius: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0d47a1;
    color: #fff;
    font-weight: 800;
  }

  .topup-student-banner span,
  .topup-student-banner strong,
  .topup-student-banner small {
    display: block;
  }

  .topup-student-label {
    color: #64748b;
    font-size: 0.68rem;
  }

  .topup-student-banner strong {
    margin-top: 1px;
    color: #0f172a;
    font-size: 0.9rem;
  }

  .topup-student-banner small {
    margin-top: 2px;
    color: #64748b;
    font-size: 0.68rem;
  }

  .bank-heading {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .bank-logo {
    width: 46px;
    height: 38px;
    flex: 0 0 46px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 0.82rem;
    font-weight: 900;
    letter-spacing: 0.5px;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.25);
  }

  .bank-logo-bsi {
    background: #087f5b;
  }

  .bank-logo-bri {
    background: #0b63ce;
  }

  .bank-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .topup-reference {
    margin: 2px 0 16px;
    padding: 12px 14px;
    border-radius: 12px;
    background: #f8fafc;
    border: 1px dashed #cbd5e1;
  }

  .topup-reference span,
  .topup-reference strong,
  .topup-reference small {
    display: block;
  }

  .topup-reference span {
    color: #64748b;
    font-size: 0.7rem;
  }

  .topup-reference strong {
    margin-top: 3px;
    color: #0d47a1;
    font-size: 1rem;
    letter-spacing: 0.6px;
  }

  .topup-reference small {
    margin-top: 3px;
    color: #94a3b8;
    font-size: 0.68rem;
    line-height: 1.45;
  }

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
     NOTIFICATION - BADGE MERAH SEPERTI INSTAGRAM
  ====================================================== */


  .menu-notification-dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-left: 7px;
    border-radius: 50%;
    background: #ef233c;
    box-shadow: 0 0 0 3px rgba(239, 35, 60, 0.12);
    vertical-align: middle;
    animation: notification-dot-pulse 1.4s infinite;
  }

  @keyframes notification-dot-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.15); }
  }

  .notification-wrapper {
    position: relative;
  }

  .notification-button {
    position: relative;
    width: 42px;
    height: 42px;
    border: none;
    border-radius: 50%;
    background: #f8fafc;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: 0.2s ease;
  }

  .notification-button:hover {
    background: #eef2f7;
    transform: translateY(-1px);
  }

  .notification-bell {
    font-size: 1.25rem;
    line-height: 1;
  }

  .notification-badge {
    position: absolute;
    top: -3px;
    right: -3px;
    min-width: 19px;
    height: 19px;
    padding: 0 5px;
    border-radius: 999px;
    background: #ef233c;
    color: white;
    border: 2px solid white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.65rem;
    font-weight: 800;
    line-height: 1;
    box-sizing: border-box;
  }

  .notification-button.has-unread .notification-bell {
    animation: notification-shake 0.7s ease;
  }

  @keyframes notification-shake {
    0%, 100% { transform: rotate(0); }
    20% { transform: rotate(-12deg); }
    40% { transform: rotate(12deg); }
    60% { transform: rotate(-8deg); }
    80% { transform: rotate(8deg); }
  }

  .notification-panel {
    position: absolute;
    top: calc(100% + 12px);
    right: 0;
    width: min(390px, calc(100vw - 32px));
    max-height: 470px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 18px;
    box-shadow: 0 18px 45px rgba(15, 23, 42, 0.16);
    overflow: hidden;
    z-index: 1000;
  }

  .notification-panel-header {
    padding: 16px 18px;
    border-bottom: 1px solid #f1f5f9;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .notification-panel-header > div {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .notification-panel-header strong {
    color: #0f172a;
    font-size: 1rem;
  }

  .notification-panel-header span {
    color: #94a3b8;
    font-size: 0.72rem;
  }

  .notification-clear {
    border: none;
    background: #eff6ff;
    color: #1d4ed8;
    padding: 7px 9px;
    border-radius: 8px;
    font-size: 0.68rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }

  .notification-list {
    max-height: 390px;
    overflow-y: auto;
  }

  .notification-item {
    width: 100%;
    border: none;
    border-bottom: 1px solid #f8fafc;
    background: white;
    padding: 13px 16px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    text-align: left;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .notification-item:hover,
  .notification-item.unread {
    background: #f8fbff;
  }

  .notification-dot {
    width: 8px;
    height: 8px;
    flex: 0 0 8px;
    margin-top: 6px;
    border-radius: 50%;
    background: transparent;
  }

  .notification-item.unread .notification-dot {
    background: #ef233c;
  }

  .notification-item-content {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .notification-item-content strong {
    color: #1e293b;
    font-size: 0.8rem;
  }

  .notification-item-content span {
    color: #64748b;
    font-size: 0.74rem;
    line-height: 1.4;
  }

  .notification-item-content small {
    color: #94a3b8;
    font-size: 0.65rem;
    margin-top: 2px;
  }

  .notification-empty {
    min-height: 180px;
    padding: 25px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 6px;
  }

  .notification-empty-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #f8fafc;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.35rem;
    margin-bottom: 4px;
  }

  .notification-empty strong {
    color: #334155;
    font-size: 0.85rem;
  }

  .notification-empty span {
    color: #94a3b8;
    font-size: 0.72rem;
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
     AUTO SLIDING BANNER
  ====================================================== */

  .banner-section {
    margin-top: 20px;
  }

  .banner-slider {
    position: relative;
    width: 100%;
    min-height: 260px;
    overflow: hidden;
    border-radius: 22px;
    background: #0f172a;
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
    isolation: isolate;
  }

  .banner-slide {
    position: absolute;
    inset: 0;
    opacity: 0;
    visibility: hidden;
    transform: scale(1.02);
    transition:
      opacity 0.55s ease,
      transform 0.7s ease,
      visibility 0.55s ease;
  }

  .banner-slide.banner-active {
    opacity: 1;
    visibility: visible;
    transform: scale(1);
    z-index: 2;
  }

  .banner-image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .banner-overlay {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(90deg, rgba(15, 23, 42, 0.9) 0%,
      rgba(15, 23, 42, 0.62) 45%,
      rgba(15, 23, 42, 0.12) 100%);
  }

  .banner-content {
    position: relative;
    z-index: 3;
    max-width: 620px;
    height: 100%;
    min-height: 260px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    padding: 32px 86px 48px 32px;
    color: white;
  }

  .banner-label {
    display: inline-flex;
    align-items: center;
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.18);
    border: 1px solid rgba(255, 255, 255, 0.25);
    backdrop-filter: blur(8px);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  .banner-content h3 {
    margin: 10px 0 7px;
    font-size: clamp(1.35rem, 3vw, 2rem);
    line-height: 1.15;
    color: white;
  }

  .banner-content p {
    max-width: 520px;
    margin: 0;
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.9rem;
    line-height: 1.55;
  }

  .banner-button {
    margin-top: 18px;
    border: 0;
    border-radius: 12px;
    padding: 10px 15px;
    display: inline-flex;
    align-items: center;
    gap: 9px;
    background: white;
    color: #0d47a1;
    font-weight: 800;
    font-size: 0.82rem;
    cursor: pointer;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.14);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .banner-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.2);
  }

  .banner-arrow {
    position: absolute;
    top: 50%;
    z-index: 5;
    width: 40px;
    height: 40px;
    transform: translateY(-50%);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    background: rgba(15, 23, 42, 0.34);
    color: white;
    backdrop-filter: blur(8px);
    font-size: 1.8rem;
    line-height: 1;
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: background 0.2s ease, transform 0.2s ease;
  }

  .banner-arrow:hover {
    background: rgba(15, 23, 42, 0.58);
  }

  .banner-prev {
    left: 16px;
  }

  .banner-next {
    right: 16px;
  }

  .banner-dots {
    position: absolute;
    left: 50%;
    bottom: 14px;
    z-index: 6;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .banner-dot {
    width: 8px;
    height: 8px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.55);
    cursor: pointer;
    transition: width 0.25s ease, background 0.25s ease;
  }

  .banner-dot.active {
    width: 24px;
    border-radius: 999px;
    background: white;
  }

  @media (prefers-reduced-motion: reduce) {
    .banner-slide,
    .banner-button,
    .banner-arrow,
    .banner-dot {
      transition: none;
    }
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

    .notification-panel {
      position: fixed;
      top: 68px;
      right: 12px;
      left: 12px;
      width: auto;
      max-height: calc(100vh - 84px);
    }

    .notification-list {
      max-height: calc(100vh - 170px);
    }

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

    .banner-slider {
      min-height: 230px;
      border-radius: 18px;
    }

    .banner-content {
      min-height: 230px;
      padding: 24px 58px 42px 22px;
    }

    .banner-content p {
      font-size: 0.78rem;
      line-height: 1.45;
    }

    .banner-button {
      margin-top: 13px;
      padding: 9px 12px;
      font-size: 0.76rem;
    }

    .banner-arrow {
      width: 34px;
      height: 34px;
      font-size: 1.5rem;
    }

    .banner-prev {
      left: 10px;
    }

    .banner-next {
      right: 10px;
    }

  }


  @media (max-width: 560px) {
    .qr-student-card {
      padding: 15px;
      border-radius: 18px;
    }

    .qr-code-wrapper {
      padding: 10px;
    }

    .modal-box {
      max-height: 92vh;
      overflow-y: auto;
      padding: 18px;
      border-radius: 18px;
    }

    .bank-logo {
      width: 42px;
      height: 36px;
      flex-basis: 42px;
    }

    .rekening-num {
      font-size: 1rem;
      overflow-wrap: anywhere;
    }

    .banner-slider {
      min-height: 215px;
    }

    .banner-content {
      min-height: 215px;
      padding: 22px 48px 38px 18px;
    }

    .banner-content h3 {
      font-size: 1.2rem;
    }

    .banner-content p {
      font-size: 0.72rem;
    }

    .banner-label {
      font-size: 0.6rem;
      padding: 5px 8px;
    }

    .banner-arrow {
      width: 30px;
      height: 30px;
      font-size: 1.3rem;
    }
  }

</style>