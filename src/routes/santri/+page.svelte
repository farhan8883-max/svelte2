<!--
  MySantri - Dashboard Santri (satu file lengkap)
  Dependensi: npm install qrcode   (jsbarcode tidak dipakai lagi)
  Jika TypeScript meminta tipe: npm install -D @types/qrcode
-->

<script lang="ts">
  import { supabase } from "$lib/supabaseClient";
  import { onMount, onDestroy, tick } from "svelte";
  import { goto } from "$app/navigation";
  import QRCode from "qrcode";

  /* ===================== TIPE ===================== */

  type Section =
    | "home" | "keuangan" | "barcode" | "absensi" | "jadwal"
    | "pengumuman" | "prestasi" | "spp" | "nilai";

  interface UserData {
    id: number;
    username?: string;
    nama?: string;
    kelas?: string;
    kelas_id?: string | number;
  }
  interface Entry { id: number; date: string; amount: number; kind: "pemasukan" | "pengeluaran"; name: string; user_id: number; }
  interface Absensi { id: number; date: string; status: string; }
  interface Pengumuman { id: number; title: string; content: string; created_at: string; }
  interface SPPItem { bulan: string; key: string; tahun: number; nominal: number; status: "lunas" | "belum_lunas"; jatuh_tempo: string; }
  interface JadwalItem { hari: string; kegiatan: string; waktu: string; }
  interface PrestasiItem { tahun: string; judul: string; tingkat: string; }
  interface StudentGrade {
    id: number; user_id: number; class_id: number; academic_year: string; semester: number; subject: string;
    nilai_tugas: number | null; nilai_ulangan_harian: number | null; nilai_pts: number | null;
    nilai_pas: number | null; nilai_sikap_karakter: number | null; nilai_ujian_sekolah: number | null;
    nilai_akhir: number | null;
  }
  interface AppNotification { id: string; title: string; text: string; section: Section; created_at: string; }
  interface BannerItem { image: string; title: string; description: string; buttonText: string; section: Section; }
  interface MenuItem { section: Section | "topup"; label: string; icon: string; tone: string; }

  /* ===================== KONFIGURASI ===================== */

  const NOMINAL_SPP = 500000;

  const MONTHS = [
    { name: "Januari", key: "january" }, { name: "Februari", key: "february" },
    { name: "Maret", key: "march" }, { name: "April", key: "april" },
    { name: "Mei", key: "may" }, { name: "Juni", key: "june" },
    { name: "Juli", key: "july" }, { name: "Agustus", key: "august" },
    { name: "September", key: "september" }, { name: "Oktober", key: "october" },
    { name: "November", key: "november" }, { name: "Desember", key: "december" }
  ];

  const REKENING = [
    { kode: "BSI", nama: "Bank BSI", pemilik: "AGUS YUSUP", nomor: "1018392778", tone: "bsi" },
    { kode: "BRI", nama: "Bank BRI", pemilik: "", nomor: "551301029259535", tone: "bri" }
  ];

  const menuItems: MenuItem[] = [
    { section: "spp", label: "SPP Santri", icon: "💳", tone: "emerald" },
    { section: "keuangan", label: "Keuangan", icon: "💼", tone: "teal" },
    { section: "absensi", label: "Absensi", icon: "📅", tone: "green" },
    { section: "jadwal", label: "Jadwal", icon: "🗓️", tone: "blue" },
    { section: "pengumuman", label: "Pengumuman", icon: "📢", tone: "purple" },
    { section: "prestasi", label: "Prestasi", icon: "🏆", tone: "orange" },
    { section: "nilai", label: "Nilai Santri", icon: "📚", tone: "purple" },
    { section: "barcode", label: "ID QR", icon: "🎴", tone: "blue" },
    { section: "topup", label: "Top Up", icon: "🏦", tone: "yellow" }
  ];

  const bannerList: BannerItem[] = [
    { image: "/images/foto.png", title: "Informasi Pesantren", description: "Dapatkan informasi terbaru mengenai kegiatan dan pengumuman santri.", buttonText: "Lihat pengumuman", section: "pengumuman" },
    { image: "/images/foto1.png", title: "Pembayaran SPP", description: "Cek status pembayaran SPP santri dengan cepat dan mudah.", buttonText: "Cek SPP", section: "spp" },
    { image: "/images/foto2.png", title: "Prestasi Santri", description: "Lihat berbagai prestasi dan pencapaian santri.", buttonText: "Lihat prestasi", section: "prestasi" }
  ];

  const jadwalList: JadwalItem[] = [
    { hari: "Senin - Sabtu", kegiatan: "Qiyamul Lail & Shalat Subuh", waktu: "04.00 – 05.00 WIB" },
    { hari: "Senin - Sabtu", kegiatan: "Ekstrakurikuler & Olahraga", waktu: "05.00 – 06.00 WIB" },
    { hari: "Senin - Sabtu", kegiatan: "Pelajaran Akademik (MTs / MA)", waktu: "07.00 – 12.00 WIB" },
    { hari: "Senin - Sabtu", kegiatan: "Pelajaran Diniyah", waktu: "13.00 – 14.30 WIB" },
    { hari: "Senin - Sabtu", kegiatan: "Olahraga / Ekstrakurikuler", waktu: "16.00 – 17.30 WIB" },
    { hari: "Senin - Sabtu", kegiatan: "Tahfidz & Murajaah", waktu: "18.30 – 20.00 WIB" },
    { hari: "Minggu", kegiatan: "Libur / Kegiatan Khusus", waktu: "Seharian" }
  ];

  const prestasiList: PrestasiItem[] = [
    { tahun: "2026", judul: "Juara 1 MHQ 5 Juz", tingkat: "Kabupaten/Kota" },
    { tahun: "2025", judul: "Juara 2 Pidato Bahasa Arab", tingkat: "Provinsi" }
  ];

  /* ===================== STATE ===================== */

  let user: UserData | null = null;
  let message = "";
  let toast = "";
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  let activeSection: Section = "home";
  let isSidebarOpen = false;
  let showSettings = false;
  let showTransferModal = false;
  let showNotifications = false;

  let editNama = "";
  let avatarUrl = "";

  let entries: Entry[] = [];
  let absensiList: Absensi[] = [];
  let pengumumanList: Pengumuman[] = [];
  let sppList: SPPItem[] = [];
  let nilaiList: StudentGrade[] = [];

  let loadingEntries = false;
  let loadingAbsensi = false;
  let loadingSPP = false;
  let loadingPengumuman = false;
  let loadingNilai = false;

  let keuanganTab: "pemasukan" | "pengeluaran" = "pemasukan";
  let sppTab: "semua" | "lunas" | "belum_lunas" = "semua";
  let selectedSemester: 1 | 2 = 1;
  const currentYear = new Date().getFullYear();

  let notifications: AppNotification[] = [];
  let seenIds = new Set<string>();
  let notificationChannel: ReturnType<typeof supabase.channel> | null = null;

  let activeBanner = 0;
  let isBannerHovered = false;
  let bannerInterval: ReturnType<typeof setInterval> | null = null;

  /* ===================== TURUNAN (REAKTIF) ===================== */

  $: displayName = user?.username || user?.nama || "Santri";
  $: initial = displayName.charAt(0).toUpperCase();
  $: kelasLabel = user?.kelas || user?.kelas_id || "-";

  $: pemasukan = entries.filter((e) => e.kind === "pemasukan");
  $: pengeluaran = entries.filter((e) => e.kind === "pengeluaran");
  $: totalPemasukan = pemasukan.reduce((t, e) => t + Number(e.amount || 0), 0);
  $: totalPengeluaran = pengeluaran.reduce((t, e) => t + Number(e.amount || 0), 0);
  $: saldo = totalPemasukan - totalPengeluaran;
  $: activeEntries = keuanganTab === "pemasukan" ? pemasukan : pengeluaran;
  $: activeTotal = keuanganTab === "pemasukan" ? totalPemasukan : totalPengeluaran;

  $: sppLunas = sppList.filter((s) => s.status === "lunas");
  $: sppBelumLunas = sppList.filter((s) => s.status === "belum_lunas");
  $: totalTunggakan = sppBelumLunas.reduce((t, s) => t + s.nominal, 0);
  $: filteredSPP = sppTab === "semua" ? sppList : sppList.filter((s) => s.status === sppTab);

  $: unreadCount = notifications.filter((n) => !seenIds.has(n.id)).length;
  $: unreadPengumuman = notifications.filter((n) => n.section === "pengumuman" && !seenIds.has(n.id)).length;

  /* ===================== UTIL ===================== */

  function formatRupiah(value: number): string {
    return new Intl.NumberFormat("id-ID").format(value || 0);
  }

  function formatTanggal(value: string): string {
    if (!value) return "-";
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  }

  function showToast(text: string) {
    toast = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ""), 2600);
  }

  function fail(label: string, error: { message: string }) {
    console.error(label, error);
    message = `${label}: ${error.message}`;
  }

  const escapeHtml = (v: unknown) =>
    String(v ?? "-").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]
    );

  /* ===================== NOTIFIKASI ===================== */

  function notify(title: string, text: string, section: Section) {
    const id = `${section}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    notifications = [{ id, title, text, section, created_at: new Date().toISOString() }, ...notifications].slice(0, 30);
  }

  function markAllRead() {
    seenIds = new Set([...seenIds, ...notifications.map((n) => n.id)]);
  }

  async function openNotification(item: AppNotification) {
    showNotifications = false;
    await switchSection(item.section);
  }

  function setupRealtime() {
    if (!user?.id || notificationChannel) return;
    const uid = user.id;
    let ch = supabase.channel(`mysantri-notifications-${uid}`);

    const listen = (table: string, scoped: boolean, cb: (p: any) => void) => {
      const opts: any = { event: "*", schema: "public", table };
      if (scoped) opts.filter = `user_id=eq.${uid}`;
      ch = ch.on("postgres_changes" as any, opts, cb);
    };

    const verb = (p: any, baru: string, ubah: string) => (p.eventType === "INSERT" ? baru : ubah);

    listen("announcements", false, (p) => {
      const row = p.new || {};
      if (p.eventType !== "DELETE") {
        notify(verb(p, "Pengumuman baru", "Pengumuman diperbarui"), row.title || "Ada informasi terbaru dari pengurus pesantren.", "pengumuman");
      }
      loadPengumuman();
    });

    listen("attendance", true, (p) => {
      const row = p.new || {};
      notify(verb(p, "Absensi baru", "Absensi diperbarui"), `Status absensi kamu: ${row.status || "diperbarui"}.`, "absensi");
      loadAbsensi();
    });

    listen("student_grades", true, (p) => {
      const row = p.new || {};
      notify(
        verb(p, "Nilai baru", "Nilai diperbarui"),
        row.subject ? `Nilai ${row.subject} baru saja diperbarui.` : "Ada pembaruan nilai akademik.",
        "nilai"
      );
      loadNilai();
    });

    listen("entries", true, (p) => {
      const row = p.new || {};
      notify(
        verb(p, "Keuangan diperbarui", "Transaksi diperbarui"),
        row.name ? `${row.name} — Rp ${formatRupiah(Number(row.amount || 0))}` : "Ada perubahan pada data keuangan.",
        "keuangan"
      );
      loadEntries();
    });

    listen("spp_payments", true, () => {
      notify("SPP diperbarui", "Ada perubahan pada data pembayaran SPP kamu.", "spp");
      loadSPP();
    });

    notificationChannel = ch.subscribe();
  }

  function cleanupRealtime() {
    if (notificationChannel) {
      supabase.removeChannel(notificationChannel);
      notificationChannel = null;
    }
  }

  /* ===================== BANNER ===================== */

  const nextBanner = () => (activeBanner = (activeBanner + 1) % bannerList.length);
  const prevBanner = () => (activeBanner = (activeBanner - 1 + bannerList.length) % bannerList.length);

  function startBannerAutoplay() {
    stopBannerAutoplay();
    if (bannerList.length <= 1) return;
    bannerInterval = setInterval(() => {
      if (!isBannerHovered) nextBanner();
    }, 5000);
  }

  function stopBannerAutoplay() {
    if (bannerInterval) clearInterval(bannerInterval);
    bannerInterval = null;
  }

  /* ===================== LIFECYCLE ===================== */

  onMount(() => {
    loadUser();

    if (!user) {
      goto("/");
      return;
    }

    Promise.all([loadEntries(), loadAbsensi(), loadSPP(), loadPengumuman(), loadNilai()]);
    setupRealtime();
    startBannerAutoplay();
  });

  onDestroy(() => {
    cleanupRealtime();
    stopBannerAutoplay();
    clearTimeout(toastTimer);
  });

  function loadUser() {
    const stored = localStorage.getItem("user");
    if (!stored) return;

    try {
      user = JSON.parse(stored);
      editNama = user?.username || user?.nama || "";
      if (user?.id) avatarUrl = localStorage.getItem(`avatar_${user.id}`) || "";
    } catch (error) {
      console.error("Gagal membaca data user:", error);
      localStorage.removeItem("user");
      user = null;
    }
  }

  /* ===================== LOAD DATA ===================== */

  async function loadEntries() {
    if (!user?.id) return;
    loadingEntries = true;
    const { data, error } = await supabase.from("entries").select("*").eq("user_id", user.id).order("id", { ascending: false });
    loadingEntries = false;
    if (error) return fail("Gagal memuat data keuangan", error);
    entries = (data || []) as Entry[];
  }

  async function loadAbsensi() {
    if (!user?.id) return;
    loadingAbsensi = true;
    const { data, error } = await supabase.from("attendance").select("*").eq("user_id", user.id).order("date", { ascending: false });
    loadingAbsensi = false;
    if (error) return fail("Gagal memuat absensi", error);
    absensiList = (data || []) as Absensi[];
  }

  async function loadPengumuman() {
    loadingPengumuman = true;
    const { data, error } = await supabase
      .from("announcements")
      .select("id, title, content, created_at")
      .order("created_at", { ascending: false });
    loadingPengumuman = false;
    if (error) return fail("Gagal memuat pengumuman", error);
    pengumumanList = (data || []) as Pengumuman[];
  }

  async function loadNilai() {
    if (!user?.id) return;
    loadingNilai = true;
    const { data, error } = await supabase
      .from("student_grades")
      .select(
        "id, user_id, class_id, academic_year, semester, subject, nilai_tugas, nilai_ulangan_harian, nilai_pts, nilai_pas, nilai_sikap_karakter, nilai_ujian_sekolah, nilai_akhir"
      )
      .eq("user_id", user.id)
      .eq("semester", selectedSemester)
      .order("subject", { ascending: true });
    loadingNilai = false;
    if (error) return fail("Gagal memuat data nilai", error);
    nilaiList = (data || []) as StudentGrade[];
  }

  async function loadSPP() {
    if (!user?.id) return;
    loadingSPP = true;

    let { data, error } = await supabase
      .from("spp_payments")
      .select("*")
      .eq("user_id", user.id)
      .eq("year", currentYear)
      .maybeSingle();

    if (error) {
      fail("Gagal memuat SPP", error);
    } else if (!data) {
      const res = await supabase
        .from("spp_payments")
        .insert({ user_id: user.id, year: currentYear })
        .select()
        .single();
      if (res.error) fail("Gagal membuat data SPP", res.error);
      else data = res.data;
    }

    sppList = MONTHS.map((m) => ({
      bulan: m.name,
      key: m.key,
      tahun: currentYear,
      nominal: NOMINAL_SPP,
      status: data && data[m.key] === true ? "lunas" : "belum_lunas",
      jatuh_tempo: `10 ${m.name} ${currentYear}`
    }));

    loadingSPP = false;
  }

  /* ===================== QR ===================== */

  async function generateStudentQR() {
    if (!user?.id) return;
    await tick();

    const canvas = document.getElementById("santri-qr-main") as HTMLCanvasElement | null;
    if (!canvas) return;

    const payload = JSON.stringify({
      type: "SANTRI",
      id: user.id,
      username: user.username || "",
      nama: user.nama || user.username || "Santri",
      kelas: user.kelas || user.kelas_id || ""
    });

    try {
      await QRCode.toCanvas(canvas, payload, {
        width: 250,
        margin: 2,
        errorCorrectionLevel: "H",
        color: { dark: "#0f172a", light: "#ffffff" }
      });
    } catch (error) {
      console.error("Gagal membuat QR santri:", error);
    }
  }

  /* ===================== NAVIGASI ===================== */

  async function switchSection(section: Section) {
    activeSection = section;
    message = "";
    showSettings = false;
    showNotifications = false;
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (section === "barcode") await generateStudentQR();
    else if (section === "pengumuman") await loadPengumuman();
    else if (section === "absensi") await loadAbsensi();
    else if (section === "spp") await loadSPP();
    else if (section === "nilai") await loadNilai();
    else if (section === "keuangan") await loadEntries();
  }

  function openMenu(item: MenuItem) {
    if (item.section === "topup") showTransferModal = true;
    else switchSection(item.section);
  }

  function openEditProfile() { showSettings = false; isSidebarOpen = true; }
  function openTopUp() { showSettings = false; showTransferModal = true; }

  async function logout() {
    showSettings = false;
    localStorage.removeItem("user");
    user = null;
    await goto("/");
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    isSidebarOpen = false;
    showTransferModal = false;
    showSettings = false;
    showNotifications = false;
  }

  /* ===================== AKSI ===================== */

  async function copyRekening(nomor: string) {
    try {
      await navigator.clipboard.writeText(nomor);
      showToast("Nomor rekening berhasil disalin");
    } catch (error) {
      console.error("Gagal menyalin rekening:", error);
      showToast("Gagal menyalin nomor rekening");
    }
  }

  function saveFile(content: BlobPart, type: string, filename: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function exportCSV(data: Entry[], filename: string) {
    if (!data.length) return showToast("Tidak ada data untuk diexport");

    const rows = [["Keterangan", "Tanggal", "Jumlah", "Jenis"], ...data.map((i) => [i.name, i.date, i.amount, i.kind])];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");

    saveFile("\uFEFF" + csv, "text/csv;charset=utf-8;", `${filename}_${displayName.replace(/\s+/g, "_")}.csv`);
  }

  function downloadRaport() {
    if (!nilaiList.length) return showToast("Belum ada nilai untuk semester yang dipilih.");

    const semesterLabel = selectedSemester === 1 ? "Semester 1" : "Semester 2";
    const tahunAjaran = nilaiList[0]?.academic_year || String(currentYear);

    const rows = nilaiList
      .map(
        (i) => `<tr><td>${escapeHtml(i.subject)}</td><td>${i.nilai_pts ?? "-"}</td><td>${i.nilai_pas ?? "-"}</td><td>${i.nilai_tugas ?? "-"}</td><td>${i.nilai_ulangan_harian ?? "-"}</td><td>${i.nilai_sikap_karakter ?? "-"}</td><td>${i.nilai_ujian_sekolah ?? "-"}</td><td>${i.nilai_akhir ?? "-"}</td></tr>`
      )
      .join("");

    const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<title>Raport ${escapeHtml(displayName)} - Daarulhikam - ${semesterLabel}</title>
<style>
  body{font-family:Arial,sans-serif;margin:32px;color:#111}
  .kop{text-align:center;border-bottom:3px solid #111;padding-bottom:12px;margin-bottom:18px}
  .kop h1{margin:0;font-size:24px}.kop h2{margin:4px 0;font-size:18px}.kop p{margin:2px 0;font-size:12px}
  .identitas{width:100%;margin-bottom:18px;border-collapse:collapse}
  .identitas td{padding:5px 8px}.identitas td:first-child,.identitas td:nth-child(3){font-weight:bold;width:14%}
  table.nilai{width:100%;border-collapse:collapse}
  table.nilai th,table.nilai td{border:1px solid #333;padding:7px 6px;text-align:center;font-size:11px}
  table.nilai th:first-child,table.nilai td:first-child{text-align:left}
  table.nilai th{background:#eee}
  .footer{margin-top:45px;display:flex;justify-content:space-between;text-align:center}
  .ttd{width:220px}.ttd-space{height:70px}
  .print-btn{position:fixed;top:15px;right:15px;padding:10px 14px;cursor:pointer}
  @media print{.print-btn{display:none}body{margin:15mm}}
</style></head><body>
<button class="print-btn" onclick="window.print()">Cetak / Simpan PDF</button>
<div class="kop"><h1>DAARULHIKAM</h1><h2>RAPORT HASIL BELAJAR SANTRI</h2><p>${semesterLabel} | Tahun Pelajaran ${escapeHtml(tahunAjaran)}</p></div>
<table class="identitas">
  <tr><td>Nama Santri</td><td>${escapeHtml(displayName)}</td><td>Kelas</td><td>${escapeHtml(kelasLabel)}</td></tr>
  <tr><td>Semester</td><td>${semesterLabel}</td><td>Sekolah</td><td>Daarulhikam</td></tr>
</table>
<table class="nilai">
  <thead><tr><th>Mata Pelajaran</th><th>Kompetensi 1</th><th>Kompetensi 2</th><th>Tugas</th><th>Ulangan Harian</th><th>Sikap</th><th>Ujian Sekolah</th><th>Nilai Akhir</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">
  <div class="ttd"><div>Orang Tua / Wali Santri</div><div class="ttd-space"></div><strong>________________________</strong></div>
  <div class="ttd"><div>Daarulhikam, ${new Date().toLocaleDateString("id-ID")}</div><div class="ttd-space"></div><strong>________________________</strong><br>Wali Kelas</div>
</div>
</body></html>`;

    saveFile(html, "text/html;charset=utf-8", `Raport_Daarulhikam_${displayName.replace(/\s+/g, "_")}_${semesterLabel.replace(/\s+/g, "_")}.html`);
  }

  /* ===================== PROFIL ===================== */

  function handleImageUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return showToast("File harus berupa gambar.");

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // potong persegi dan kecilkan agar hemat penyimpanan browser
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 256;
        canvas
          .getContext("2d")
          ?.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
        avatarUrl = canvas.toDataURL("image/jpeg", 0.85);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function saveProfile() {
    if (!user) return;

    const namaBaru = editNama.trim();
    if (!namaBaru) return showToast("Nama tidak boleh kosong");

    user = { ...user, username: namaBaru, nama: namaBaru };

    try {
      localStorage.setItem("user", JSON.stringify(user));
      if (avatarUrl && user.id) localStorage.setItem(`avatar_${user.id}`, avatarUrl);
    } catch (error) {
      console.error("Gagal menyimpan profil:", error);
      return showToast("Gagal menyimpan profil, penyimpanan browser penuh.");
    }

    isSidebarOpen = false;
    showToast("Profil berhasil diperbarui");
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="mybca-app">
  <!-- ================= HEADER ================= -->
  <header class="app-header">
    <div class="header-container">
      <div class="user-greeting">
        <button class="profile-avatar-btn" on:click={() => (isSidebarOpen = true)} title="Edit profil" aria-label="Edit profil">
          {#if avatarUrl}
            <img src={avatarUrl} alt="Avatar" class="avatar-img" />
          {:else}
            <div class="avatar-placeholder">{initial}</div>
          {/if}
        </button>

        <div class="greeting-info">
          <span class="greeting-text">Selamat datang,</span>
          <h2 class="user-name">{displayName}</h2>
        </div>
      </div>

      <div class="notification-wrapper">
        <button
          class="notification-button"
          on:click={() => (showNotifications = !showNotifications)}
          aria-label="Notifikasi"
          aria-expanded={showNotifications}
        >
          <span class="notification-bell">🔔</span>
          {#if unreadCount > 0}
            <span class="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
          {/if}
        </button>

        {#if showNotifications}
          <button class="notification-backdrop" aria-label="Tutup notifikasi" on:click={() => (showNotifications = false)}></button>

          <div class="notification-panel">
            <div class="notification-panel-header">
              <div>
                <strong>Notifikasi</strong>
                <span>Update dari admin & ustad</span>
              </div>
              {#if notifications.length > 0}
                <button class="notification-clear" on:click={markAllRead}>Sudah dibaca</button>
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
                {#each notifications as item (item.id)}
                  <button class="notification-item" class:unread={!seenIds.has(item.id)} on:click={() => openNotification(item)}>
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
    </div>
  </header>

  <!-- ================= KONTEN ================= -->
  <main class="app-body">
    {#if message}
      <div class="alert-box" role="alert">{message}</div>
    {/if}

    <!-- ===== HOME ===== -->
    {#if activeSection === "home"}
      <div class="desktop-top-grid">
        <div class="balance-card">
          <span class="balance-label">Sisa uang jajan / saldo</span>
          <div class="balance-amount">Rp {formatRupiah(saldo)}</div>
          <div class="card-footer">
            <div class="info-pill">Kelas: <b>{kelasLabel}</b></div>
          </div>
        </div>

        <div class="stats-card desktop-only">
          <h3 class="section-title">Ringkasan keuangan</h3>
          <div class="stats-grid">
            <div class="stat-item bg-teal-light">
              <span class="stat-label">Total pemasukan</span>
              <span class="stat-val text-green">+ Rp {formatRupiah(totalPemasukan)}</span>
            </div>
            <div class="stat-item bg-red-light">
              <span class="stat-label">Total pengeluaran</span>
              <span class="stat-val text-red">- Rp {formatRupiah(totalPengeluaran)}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="dashboard-layout">
        <div class="menu-section">
          <h3 class="section-title">Layanan utama</h3>
          <div class="menu-grid">
            {#each menuItems as m}
              <button class="menu-item" on:click={() => openMenu(m)}>
                <div class="icon-circle bg-{m.tone}">{m.icon}</div>
                <span>
                  {m.label}
                  {#if m.section === "pengumuman" && unreadPengumuman > 0}
                    <span class="menu-notification-dot" aria-label="Ada pengumuman baru"></span>
                  {/if}
                </span>
              </button>
            {/each}
          </div>
        </div>

        <div class="recent-section">
          <div class="recent-header"><h3>Transaksi terakhir</h3></div>
          <div class="recent-list">
            {#if loadingEntries && entries.length === 0}
              <p class="empty-msg">Memuat transaksi...</p>
            {:else if entries.length === 0}
              <p class="empty-msg">Belum ada transaksi.</p>
            {:else}
              {#each entries.slice(0, 4) as item (item.id)}
                <div class="recent-item">
                  <div class="item-icon-type" class:is-in={item.kind === "pemasukan"}>
                    {item.kind === "pemasukan" ? "↙" : "↗"}
                  </div>
                  <div class="item-info">
                    <span class="item-title">{item.name}</span>
                    <span class="item-date">{item.date}</span>
                  </div>
                  <span class="item-amount" class:is-in={item.kind === "pemasukan"} class:is-out={item.kind === "pengeluaran"}>
                    {item.kind === "pemasukan" ? "+" : "-"} Rp {formatRupiah(item.amount)}
                  </span>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      </div>

      <!-- Banner -->
      <section
        class="banner-section"
        aria-label="Informasi dan promosi"
        on:mouseenter={() => (isBannerHovered = true)}
        on:mouseleave={() => (isBannerHovered = false)}
      >
        <div class="banner-slider">
          {#each bannerList as banner, index}
            <article class="banner-slide" class:banner-active={index === activeBanner} aria-hidden={index !== activeBanner}>
              <img src={banner.image} alt={banner.title} class="banner-image" loading={index === 0 ? "eager" : "lazy"} />
              <div class="banner-overlay"></div>
              <div class="banner-content">
                <span class="banner-label">Informasi</span>
                <h3>{banner.title}</h3>
                <p>{banner.description}</p>
                <button type="button" class="banner-button" tabindex={index === activeBanner ? 0 : -1} on:click={() => switchSection(banner.section)}>
                  {banner.buttonText} <span aria-hidden="true">→</span>
                </button>
              </div>
            </article>
          {/each}

          {#if bannerList.length > 1}
            <button type="button" class="banner-arrow banner-prev" on:click={prevBanner} aria-label="Banner sebelumnya">‹</button>
            <button type="button" class="banner-arrow banner-next" on:click={nextBanner} aria-label="Banner berikutnya">›</button>
            <div class="banner-dots">
              {#each bannerList as _, index}
                <button
                  type="button"
                  class="banner-dot"
                  class:active={index === activeBanner}
                  on:click={() => (activeBanner = index)}
                  aria-label={`Buka banner ${index + 1}`}
                  aria-current={index === activeBanner ? "true" : undefined}
                ></button>
              {/each}
            </div>
          {/if}
        </div>
      </section>
    {/if}

    <!-- ===== SPP ===== -->
    {#if activeSection === "spp"}
      <div class="page-card">
        <h3>Tagihan SPP santri</h3>
        <p class="sub-desc">Riwayat pembayaran SPP tahun {currentYear}.</p>

        <div class="spp-summary-grid">
          <div class="spp-card-stat bg-emerald-light">
            <span class="stat-label">Sudah dibayar</span>
            <span class="stat-val text-green">{sppLunas.length} bulan</span>
          </div>
          <div class="spp-card-stat bg-red-light">
            <span class="stat-label">Belum dibayar</span>
            <span class="stat-val text-red">{sppBelumLunas.length} bulan</span>
          </div>
          <div class="spp-card-stat bg-blue-light">
            <span class="stat-label">Total tunggakan</span>
            <span class="stat-val text-blue">Rp {formatRupiah(totalTunggakan)}</span>
          </div>
        </div>

        <div class="tab-header">
          <button class="tab-btn" class:active={sppTab === "semua"} on:click={() => (sppTab = "semua")}>Semua ({sppList.length})</button>
          <button class="tab-btn" class:active={sppTab === "belum_lunas"} on:click={() => (sppTab = "belum_lunas")}>Belum bayar ({sppBelumLunas.length})</button>
          <button class="tab-btn" class:active={sppTab === "lunas"} on:click={() => (sppTab = "lunas")}>Lunas ({sppLunas.length})</button>
        </div>

        <div class="spp-list">
          {#if loadingSPP}
            <p class="empty-msg">Memuat data tagihan SPP...</p>
          {:else if filteredSPP.length === 0}
            <p class="empty-msg">Tidak ada data pembayaran SPP.</p>
          {:else}
            {#each filteredSPP as item (item.key)}
              <div class="spp-item-card" class:unpaid={item.status === "belum_lunas"}>
                <div class="spp-item-info">
                  <div class="spp-month">{item.bulan} {item.tahun}</div>
                  <div class="spp-subinfo">
                    <span>Nominal: <b>Rp {formatRupiah(item.nominal)}</b></span>
                    {#if item.status !== "lunas"}
                      <span class="text-red">• Jatuh tempo: {item.jatuh_tempo}</span>
                    {/if}
                  </div>
                </div>
                <div class="spp-action">
                  {#if item.status === "lunas"}
                    <span class="status-badge badge-lunas">Lunas</span>
                  {:else}
                    <button class="btn-pay-now" on:click={() => (showTransferModal = true)}>Bayar sekarang</button>
                  {/if}
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {/if}

    <!-- ===== KEUANGAN ===== -->
    {#if activeSection === "keuangan"}
      <div class="page-card">
        <div class="tab-header">
          <button class="tab-btn" class:active={keuanganTab === "pemasukan"} on:click={() => (keuanganTab = "pemasukan")}>💰 Pemasukan</button>
          <button class="tab-btn" class:active={keuanganTab === "pengeluaran"} on:click={() => (keuanganTab = "pengeluaran")}>💸 Pengeluaran</button>
        </div>

        <div class="card-header-flex">
          <div>
            <h3>{keuanganTab === "pemasukan" ? "Data pemasukan" : "Data pengeluaran"}</h3>
            <p class="sub-desc margin-0">
              {keuanganTab === "pemasukan" ? "Catatan dana masuk / kiriman orang tua" : "Catatan konsumsi & jajan harian"}
            </p>
          </div>
          <button class="btn-export" on:click={() => exportCSV(activeEntries, keuanganTab)}>⬇️ Export CSV</button>
        </div>

        <div class="table-container">
          <table class="app-table">
            <thead>
              <tr><th>Keterangan</th><th>Tanggal</th><th>Jumlah</th></tr>
            </thead>
            <tbody>
              {#if loadingEntries}
                <tr><td colspan="3" class="text-center">Memuat data...</td></tr>
              {:else if activeEntries.length === 0}
                <tr><td colspan="3" class="text-center">Belum ada data {keuanganTab}.</td></tr>
              {:else}
                {#each activeEntries as item (item.id)}
                  <tr>
                    <td class="font-semibold">{item.name}</td>
                    <td class="text-muted">{item.date}</td>
                    <td class="font-semibold" class:text-green={keuanganTab === "pemasukan"} class:text-red={keuanganTab === "pengeluaran"}>
                      {keuanganTab === "pemasukan" ? "+" : "-"} Rp {formatRupiah(item.amount)}
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>

        <div class="total-bar" class:text-green-bg={keuanganTab === "pemasukan"} class:text-red-bg={keuanganTab === "pengeluaran"}>
          Total {keuanganTab}: Rp {formatRupiah(activeTotal)}
        </div>
      </div>
    {/if}

    <!-- ===== JADWAL ===== -->
    {#if activeSection === "jadwal"}
      <div class="page-card">
        <h3>Jadwal kegiatan santri</h3>
        <p class="sub-desc">Rangkaian rutinitas harian dan pekanan santri.</p>
        <div class="list-container">
          {#each jadwalList as item}
            <div class="info-item-card">
              <div class="info-badge">{item.hari}</div>
              <div class="info-content">
                <span class="info-title">{item.kegiatan}</span>
                <span class="info-time">⏰ {item.waktu}</span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- ===== PENGUMUMAN ===== -->
    {#if activeSection === "pengumuman"}
      <div class="page-card">
        <div class="card-header-flex">
          <div>
            <h3>Pengumuman pesantren</h3>
            <p class="sub-desc margin-0">Informasi resmi terbaru dari pengurus pesantren.</p>
          </div>
          <button class="btn-export" on:click={loadPengumuman}>🔄 Refresh</button>
        </div>

        {#if loadingPengumuman}
          <p class="empty-msg">Memuat pengumuman...</p>
        {:else if pengumumanList.length === 0}
          <p class="empty-msg">Belum ada pengumuman.</p>
        {:else}
          <div class="list-container">
            {#each pengumumanList as item (item.id)}
              <div class="notice-card">
                <span class="notice-date">📅 {formatTanggal(item.created_at)}</span>
                <h4 class="notice-title">{item.title}</h4>
                <p class="notice-text">{item.content}</p>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- ===== NILAI ===== -->
    {#if activeSection === "nilai"}
      <div class="page-card">
        <div class="card-header-flex">
          <div>
            <h3>Raport akademik santri</h3>
            <p class="sub-desc margin-0">Raport Daarulhikam untuk semester 1 dan semester 2.</p>
          </div>
          <div class="toolbar">
            <select bind:value={selectedSemester} on:change={loadNilai} class="form-control" aria-label="Pilih semester">
              <option value={1}>Semester 1</option>
              <option value={2}>Semester 2</option>
            </select>
            <button class="btn-export" on:click={loadNilai}>🔄 Refresh</button>
            <button class="btn-export" on:click={downloadRaport} disabled={loadingNilai || nilaiList.length === 0}>⬇️ Download raport</button>
          </div>
        </div>

        {#if loadingNilai}
          <p class="empty-msg">Memuat data nilai...</p>
        {:else if nilaiList.length === 0}
          <p class="empty-msg">Belum ada data nilai.</p>
        {:else}
          <div class="table-container">
            <table class="app-table wide">
              <thead>
                <tr>
                  <th>Mata pelajaran</th><th>Kompetensi 1</th><th>Kompetensi 2</th><th>Tugas</th>
                  <th>Ulangan harian</th><th>Sikap</th><th>Ujian sekolah</th><th>Nilai akhir</th>
                </tr>
              </thead>
              <tbody>
                {#each nilaiList as item (item.id)}
                  <tr>
                    <td class="font-semibold">{item.subject}</td>
                    <td>{item.nilai_pts ?? "-"}</td>
                    <td>{item.nilai_pas ?? "-"}</td>
                    <td>{item.nilai_tugas ?? "-"}</td>
                    <td>{item.nilai_ulangan_harian ?? "-"}</td>
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

    <!-- ===== PRESTASI ===== -->
    {#if activeSection === "prestasi"}
      <div class="page-card">
        <h3>Pencapaian & prestasi</h3>
        <p class="sub-desc">Catatan kebanggaan prestasi santri.</p>
        <div class="list-container">
          {#each prestasiList as item}
            <div class="achievement-card">
              <div class="trophy-icon">🏆</div>
              <div>
                <span class="achievement-title">{item.judul}</span>
                <p class="achievement-sub">{item.tingkat} • {item.tahun}</p>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- ===== ABSENSI ===== -->
    {#if activeSection === "absensi"}
      <div class="page-card">
        <h3>Riwayat absensi santri</h3>
        <p class="sub-desc">Daftar kehadiran harian yang dicatat oleh Ustadz.</p>

        {#if loadingAbsensi}
          <p class="empty-msg">Memuat data presensi...</p>
        {:else if absensiList.length === 0}
          <p class="empty-msg">Belum ada catatan absensi.</p>
        {:else}
          <div class="table-container">
            <table class="app-table">
              <thead><tr><th>Tanggal</th><th>Status</th></tr></thead>
              <tbody>
                {#each absensiList as item (item.id)}
                  <tr>
                    <td>{formatTanggal(item.date)}</td>
                    <td><span class="badge-status">{item.status || "-"}</span></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {/if}

    <!-- ===== QR ===== -->
    {#if activeSection === "barcode"}
      <div class="page-card text-center">
        <h3>QR code santri</h3>
        <p class="sub-desc">
          QR ini dibuat khusus untuk santri yang sedang login. Tunjukkan kepada Ustadz saat presensi atau pemeriksaan data.
        </p>

        <div class="qr-student-card">
          <div class="qr-student-header">
            <div class="qr-student-logo">MS</div>
            <div>
              <strong>MySantri</strong>
              <span>Kartu identitas santri</span>
            </div>
          </div>

          <div class="qr-student-profile">
            <div class="qr-avatar">
              {#if avatarUrl}
                <img src={avatarUrl} alt="Foto santri" />
              {:else}
                {initial}
              {/if}
            </div>
            <div class="qr-student-info">
              <strong>{displayName}</strong>
              <span>ID SANTRI-{user?.id}</span>
              <span>Kelas: {kelasLabel}</span>
            </div>
          </div>

          <div class="qr-code-wrapper">
            <canvas id="santri-qr-main" aria-label="QR code unik santri"></canvas>
          </div>

          <div class="qr-unique-note"><span>✓</span> QR unik untuk akun santri ini</div>

          <p class="qr-small-text">
            Jangan gunakan QR milik santri lain. Setiap QR berisi identitas akun yang sedang login.
          </p>
        </div>
      </div>
    {/if}
  </main>

  <!-- ================= NAVBAR MELAYANG ================= -->
  <nav class="floating-nav" aria-label="Navigasi utama">
    {#if activeSection === "home"}
      <button class="fnav-item active" aria-current="page" aria-label="Beranda">
        <svg class="fnav-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" />
        </svg>
        <span class="fnav-label">Beranda</span>
      </button>
    {:else}
      <button class="fnav-item fnav-back" on:click={() => switchSection("home")} aria-label="Kembali ke beranda">
        <svg class="fnav-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
        </svg>
        <span class="fnav-label">Kembali</span>
      </button>
    {/if}

    <button class="fnav-item" class:active={showSettings} on:click={() => (showSettings = true)} aria-label="Pengaturan" title="Pengaturan">
      <svg class="fnav-svg" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h9" /><path d="M17 7h3" /><circle cx="15" cy="7" r="2" />
        <path d="M4 17h3" /><path d="M11 17h9" /><circle cx="9" cy="17" r="2" />
      </svg>
      <span class="fnav-label">Pengaturan</span>
      {#if unreadCount > 0}<span class="fnav-dot"></span>{/if}
    </button>

    <button class="fnav-item" class:active={isSidebarOpen} on:click={() => (isSidebarOpen = true)} aria-label="Profil" title="Profil">
      {#if avatarUrl}
        <img src={avatarUrl} alt="" class="fnav-avatar" />
      {:else}
        <svg class="fnav-svg" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      {/if}
      <span class="fnav-label">Profil</span>
    </button>
  </nav>

  <!-- ================= SHEET PENGATURAN ================= -->
  {#if showSettings}
    <div class="modal-overlay sheet-overlay" role="presentation" on:click={() => (showSettings = false)}>
      <div class="sheet-box" role="dialog" aria-modal="true" aria-label="Pengaturan" on:click|stopPropagation>
        <div class="modal-header">
          <h3>Pengaturan</h3>
          <button class="close-x" on:click={() => (showSettings = false)} aria-label="Tutup">✕</button>
        </div>

        <div class="settings-list">
          <button class="settings-item" on:click={openEditProfile}>
            <span class="settings-icon">👤</span>
            <span class="settings-text"><strong>Edit profil</strong><small>Ubah nama dan foto</small></span>
            <span class="settings-arrow">›</span>
          </button>

          <button
            class="settings-item"
            on:click={() => {
              markAllRead();
              showToast("Notifikasi ditandai sudah dibaca");
            }}
          >
            <span class="settings-icon">🔔</span>
            <span class="settings-text">
              <strong>Tandai notifikasi dibaca</strong>
              <small>{unreadCount > 0 ? `${unreadCount} belum dibaca` : "Semua sudah dibaca"}</small>
            </span>
            <span class="settings-arrow">›</span>
          </button>

          <button class="settings-item" on:click={openTopUp}>
            <span class="settings-icon">🏦</span>
            <span class="settings-text"><strong>Top up / pembayaran</strong><small>Lihat rekening resmi pesantren</small></span>
            <span class="settings-arrow">›</span>
          </button>

          <button class="settings-item danger" on:click={logout}>
            <span class="settings-icon">🚪</span>
            <span class="settings-text"><strong>Keluar akun</strong><small>Akhiri sesi di perangkat ini</small></span>
            <span class="settings-arrow">›</span>
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ================= SIDEBAR PROFIL ================= -->
  {#if isSidebarOpen}
    <div class="sidebar-overlay" role="presentation" on:click={() => (isSidebarOpen = false)}>
      <div class="sidebar-content" role="dialog" aria-modal="true" aria-label="Edit profil" on:click|stopPropagation>
        <div class="sidebar-header">
          <h3>Edit profil</h3>
          <button class="close-x" on:click={() => (isSidebarOpen = false)} aria-label="Tutup">✕</button>
        </div>

        <div class="profile-upload-section">
          <div class="avatar-preview">
            {#if avatarUrl}
              <img src={avatarUrl} alt="Pratinjau avatar" />
            {:else}
              <div class="avatar-placeholder-lg">{(editNama || "S").charAt(0).toUpperCase()}</div>
            {/if}
          </div>

          <label for="upload-avatar" class="btn-upload-label">
            📸 Pilih foto
            <input type="file" id="upload-avatar" accept="image/*" on:change={handleImageUpload} style="display: none;" />
          </label>
        </div>

        <div class="form-group">
          <label for="input-nama">Nama lengkap / username</label>
          <input id="input-nama" type="text" class="form-input" bind:value={editNama} placeholder="Masukkan nama..." />
        </div>

        <button class="btn-save" on:click={saveProfile}>Simpan perubahan</button>
      </div>
    </div>
  {/if}

  <!-- ================= MODAL TOP UP ================= -->
  {#if showTransferModal}
    <div class="modal-overlay" role="presentation" on:click={() => (showTransferModal = false)}>
      <div class="modal-box" role="dialog" aria-modal="true" aria-label="Transfer dan pembayaran SPP" on:click|stopPropagation>
        <div class="modal-header">
          <h3>Transfer / pembayaran SPP</h3>
          <button class="close-x" on:click={() => (showTransferModal = false)} aria-label="Tutup">✕</button>
        </div>

        <div class="topup-student-banner">
          <div class="topup-student-icon">{initial}</div>
          <div>
            <span class="topup-student-label">Top up untuk santri</span>
            <strong>{displayName}</strong>
            <small>ID: SANTRI-{user?.id}</small>
          </div>
        </div>

        <p class="sub-desc">
          Lakukan pembayaran ke rekening resmi pesantren berikut. Gunakan ID santri sebagai referensi agar pembayaran
          dapat dicocokkan dengan akun yang benar.
        </p>

        <div class="rekening-list">
          {#each REKENING as rek (rek.nomor)}
            <div class="rekening-card">
              <div class="bank-heading">
                <div class="bank-logo bank-logo-{rek.tone}"><span>{rek.kode}</span></div>
                <div class="bank-info">
                  <span class="bank-name">{rek.nama}</span>
                  {#if rek.pemilik}<span class="bank-owner">a.n {rek.pemilik}</span>{/if}
                </div>
              </div>
              <div class="rekening-num">{rek.nomor}</div>
              <button class="btn-copy" on:click={() => copyRekening(rek.nomor)}>📋 Salin nomor</button>
            </div>
          {/each}
        </div>

        <div class="topup-reference">
          <span>Referensi transfer</span>
          <strong>SANTRI-{user?.id}</strong>
          <small>Cantumkan kode ini pada keterangan transfer jika diperlukan.</small>
        </div>

        <button class="btn-modal-close" on:click={() => (showTransferModal = false)}>Selesai</button>
      </div>
    </div>
  {/if}

  <!-- ================= TOAST ================= -->
  {#if toast}
    <div class="toast" role="status">{toast}</div>
  {/if}
</div>

<style>
  @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");

  /* ===== TOKEN ===== */
  .mybca-app {
    --navy: #0b1b33;
    --navy-2: #14305a;
    --primary: #2f6fdc;
    --primary-ink: #1f5fbf;
    --primary-soft: #e8f0fd;
    --gold: #f5c76b;
    --bg: #edf1f8;
    --surface: #ffffff;
    --surface-2: #f6f8fc;
    --border: #d9e0ec;
    --border-soft: #e7ecf4;
    --text: #14233a;
    --muted: #5b6b82;
    --faint: #8b98ad;
    --ok: #14804a;
    --ok-soft: #e5f5ec;
    --bad: #c0362c;
    --bad-soft: #fdecea;
    --warn: #9a6700;
    --warn-soft: #fff4d8;
    --radius: 18px;
    --radius-md: 14px;
    --radius-sm: 10px;
    --shadow: 0 1px 2px rgba(11, 27, 51, 0.05), 0 10px 28px -14px rgba(11, 27, 51, 0.22);
    --shadow-lg: 0 24px 60px -12px rgba(11, 27, 51, 0.45);
    --qr-pad: 20px;

    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    font-family: "Plus Jakarta Sans", Inter, "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
    font-size: 15px;
    line-height: 1.5;
    padding-bottom: calc(110px + env(safe-area-inset-bottom, 0px));
    -webkit-font-smoothing: antialiased;
  }

  @media (prefers-color-scheme: dark) {
    .mybca-app {
      --primary-ink: #7db0ff;
      --primary-soft: rgba(59, 130, 246, 0.16);
      --bg: #060e1b;
      --surface: #0e1c31;
      --surface-2: #132540;
      --border: #22364f;
      --border-soft: #1a2c45;
      --text: #e6edf7;
      --muted: #9fb0c6;
      --faint: #70829b;
      --ok: #4ade80;
      --ok-soft: rgba(34, 197, 94, 0.14);
      --bad: #f87171;
      --bad-soft: rgba(248, 113, 113, 0.14);
      --warn: #f5c76b;
      --warn-soft: rgba(245, 199, 107, 0.12);
      --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 12px 30px -14px rgba(0, 0, 0, 0.6);
    }
  }

  .mybca-app *,
  .mybca-app *::before,
  .mybca-app *::after { box-sizing: border-box; }

  .mybca-app * { scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
  .mybca-app button { font-family: inherit; }

  .mybca-app button:focus-visible,
  .mybca-app input:focus-visible,
  .mybca-app select:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  /* ===== HEADER ===== */
  .app-header {
    position: relative;
    color: #fff;
    padding: 18px 16px 92px;
    border-radius: 0 0 30px 30px;
    box-shadow: 0 14px 36px -18px rgba(11, 27, 51, 0.7);
    background:
      radial-gradient(120% 140% at 0% 0%, rgba(59, 130, 246, 0.4), transparent 55%),
      radial-gradient(90% 120% at 100% 100%, rgba(245, 199, 107, 0.16), transparent 50%),
      repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 16px),
      repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 16px),
      linear-gradient(160deg, var(--navy) 0%, var(--navy-2) 100%);
  }

  .header-container { max-width: 1180px; margin: 0 auto; display: flex; align-items: center; gap: 12px; }
  .user-greeting { display: flex; align-items: center; gap: 12px; margin-right: auto; min-width: 0; }

  .profile-avatar-btn { background: none; border: 0; padding: 0; cursor: pointer; border-radius: 50%; flex: 0 0 auto; }

  .avatar-img,
  .avatar-placeholder {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.12);
  }

  .avatar-img { object-fit: cover; display: block; }

  .avatar-placeholder {
    background: linear-gradient(135deg, #5b9bff, #2f6fdc);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 1.15rem;
  }

  .greeting-info { min-width: 0; }
  .greeting-text { display: block; font-size: 0.78rem; color: #b6c6dc; }

  .user-name {
    margin: 0;
    font-size: 1.12rem;
    font-weight: 750;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 62vw;
  }

  /* ===== BODY ===== */
  .app-body { max-width: 1180px; margin: -60px auto 0; padding: 0 16px; position: relative; }

  .alert-box {
    background: var(--bad-soft);
    color: var(--bad);
    border: 1px solid color-mix(in srgb, var(--bad) 30%, transparent);
    padding: 12px 14px;
    border-radius: var(--radius-md);
    margin-bottom: 16px;
    font-size: 0.88rem;
  }

  .desktop-top-grid { display: grid; grid-template-columns: 1fr; gap: 16px; margin-bottom: 16px; }
  .desktop-only { display: none; }

  .desktop-top-grid,
  .dashboard-layout,
  .banner-section,
  .page-card { animation: view-in 0.3s ease both; }

  @keyframes view-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: none; }
  }

  .stats-card,
  .menu-section,
  .recent-section,
  .page-card {
    background: var(--surface);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 20px;
  }

  .section-title { margin: 0 0 16px; font-size: 1rem; font-weight: 700; letter-spacing: -0.01em; }

  /* ===== KARTU SALDO ===== */
  .balance-card {
    position: relative;
    overflow: hidden;
    padding: 22px;
    color: #fff;
    border-radius: var(--radius);
    border: 1px solid rgba(255, 255, 255, 0.14);
    background:
      radial-gradient(90% 120% at 100% 0%, rgba(245, 199, 107, 0.2), transparent 55%),
      linear-gradient(145deg, #1b3a68 0%, #0e2142 100%);
    box-shadow: 0 22px 44px -20px rgba(11, 27, 51, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.16);
  }

  .balance-card::before,
  .balance-card::after {
    content: "";
    position: absolute;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.1);
    pointer-events: none;
  }

  .balance-card::before { width: 190px; height: 190px; right: -60px; top: -70px; }
  .balance-card::after { width: 120px; height: 120px; right: -10px; top: -30px; }

  .balance-label { position: relative; font-size: 0.84rem; color: rgba(255, 255, 255, 0.72); font-weight: 500; }

  .balance-amount {
    position: relative;
    margin: 6px 0 16px;
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--gold);
    font-variant-numeric: tabular-nums;
  }

  .card-footer { position: relative; display: flex; gap: 10px; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.14); }

  .info-pill {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.78);
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 4px 12px;
    border-radius: 999px;
  }

  .info-pill b { color: #fff; }

  .stats-grid,
  .spp-summary-grid { display: grid; gap: 12px; }
  .stats-grid { grid-template-columns: 1fr 1fr; }

  .stat-item,
  .spp-card-stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 14px 16px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-soft);
  }

  .stat-label { font-size: 0.78rem; color: var(--muted); font-weight: 500; }
  .stat-val { font-size: 1.08rem; font-weight: 750; font-variant-numeric: tabular-nums; }

  /* ===== DASHBOARD ===== */
  .dashboard-layout { display: grid; grid-template-columns: 1fr; gap: 16px; }
  .menu-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }

  .menu-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 16px 6px 14px;
    background: var(--surface-2);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease;
  }

  .menu-item:hover {
    transform: translateY(-3px);
    background: var(--surface);
    border-color: color-mix(in srgb, var(--primary) 45%, transparent);
    box-shadow: 0 14px 24px -14px rgba(47, 111, 220, 0.55);
  }

  .menu-item:active { transform: scale(0.97); }

  .menu-item span { font-size: 0.78rem; font-weight: 650; color: var(--text); text-align: center; line-height: 1.25; }

  .icon-circle {
    width: 48px;
    height: 48px;
    border-radius: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.35rem;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
  }

  .menu-notification-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-left: 5px;
    border-radius: 50%;
    background: #ff5a4d;
    box-shadow: 0 0 0 3px rgba(255, 90, 77, 0.2);
    vertical-align: middle;
  }

  .bg-emerald { background: rgba(16, 185, 129, 0.18); }
  .bg-green { background: rgba(34, 197, 94, 0.17); }
  .bg-blue { background: rgba(59, 130, 246, 0.18); }
  .bg-teal { background: rgba(20, 184, 166, 0.18); }
  .bg-yellow { background: rgba(245, 199, 107, 0.28); }
  .bg-purple { background: rgba(139, 92, 246, 0.18); }
  .bg-orange { background: rgba(249, 115, 22, 0.18); }
  .bg-teal-light { background: var(--ok-soft); }
  .bg-red-light { background: var(--bad-soft); }
  .bg-emerald-light { background: var(--ok-soft); }
  .bg-blue-light { background: var(--primary-soft); }

  /* ===== TRANSAKSI TERAKHIR ===== */
  .recent-header h3 { margin: 0 0 6px; font-size: 1rem; font-weight: 700; letter-spacing: -0.01em; }

  .recent-item { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border-soft); }
  .recent-item:last-child { border-bottom: 0; }

  .item-icon-type {
    width: 38px;
    height: 38px;
    flex: 0 0 38px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    background: var(--bad-soft);
    color: var(--bad);
  }

  .item-icon-type.is-in { background: var(--ok-soft); color: var(--ok); }
  .item-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .item-title { font-size: 0.9rem; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item-date { font-size: 0.75rem; color: var(--faint); }
  .item-amount { font-size: 0.9rem; font-weight: 750; white-space: nowrap; font-variant-numeric: tabular-nums; }

  /* ===== HALAMAN DALAM ===== */
  .page-card h3 { margin: 0; font-size: 1.2rem; font-weight: 800; letter-spacing: -0.02em; }
  .sub-desc { margin: 4px 0 18px; font-size: 0.85rem; color: var(--muted); }
  .margin-0 { margin: 0; }

  .card-header-flex { display: flex; flex-direction: column; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

  /* ===== TOMBOL & FORM ===== */
  .btn-export,
  .btn-copy,
  .btn-upload-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 9px 14px;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: 650;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.2s, border-color 0.2s, transform 0.15s;
  }

  .btn-export:hover:not(:disabled),
  .btn-copy:hover,
  .btn-upload-label:hover { background: var(--primary-soft); border-color: var(--primary); }

  .btn-export:active:not(:disabled) { transform: scale(0.97); }
  .btn-export:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-pay-now,
  .btn-save,
  .btn-modal-close {
    background: linear-gradient(135deg, #4a8af0, #2f6fdc);
    color: #fff;
    border: 0;
    border-radius: 12px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 10px 20px -8px rgba(47, 111, 220, 0.7);
    transition: transform 0.15s, box-shadow 0.2s, filter 0.2s;
  }

  .btn-pay-now { padding: 10px 18px; font-size: 0.82rem; width: 100%; }
  .btn-save,
  .btn-modal-close { width: 100%; padding: 13px; font-size: 0.92rem; }

  .btn-pay-now:hover,
  .btn-save:hover,
  .btn-modal-close:hover { filter: brightness(1.08); }

  .btn-pay-now:active,
  .btn-save:active,
  .btn-modal-close:active { transform: scale(0.98); }

  .form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
  .form-group label { font-size: 0.8rem; font-weight: 650; color: var(--muted); }

  .form-input,
  .form-control {
    padding: 11px 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    font-size: 0.9rem;
    font-family: inherit;
  }

  .form-input:focus,
  .form-control:focus { border-color: var(--primary); box-shadow: 0 0 0 4px var(--primary-soft); }

  /* ===== TAB (SEGMENTED) ===== */
  .tab-header {
    display: flex;
    gap: 4px;
    padding: 4px;
    margin-bottom: 18px;
    background: var(--surface-2);
    border: 1px solid var(--border-soft);
    border-radius: 14px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .tab-header::-webkit-scrollbar { display: none; }

  .tab-btn {
    flex: 1 0 auto;
    border: 0;
    background: transparent;
    padding: 9px 14px;
    border-radius: 10px;
    font-size: 0.84rem;
    font-weight: 650;
    color: var(--muted);
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.2s, color 0.2s, box-shadow 0.2s;
  }

  .tab-btn:hover { color: var(--text); }
  .tab-btn.active { background: var(--surface); color: var(--primary-ink); box-shadow: 0 3px 10px -3px rgba(11, 27, 51, 0.25); }

  /* ===== TABEL ===== */
  .table-container {
    overflow-x: auto;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-md);
    -webkit-overflow-scrolling: touch;
  }

  .app-table { width: 100%; min-width: 520px; border-collapse: collapse; text-align: left; font-size: 0.86rem; }
  .app-table.wide { min-width: 760px; }

  .app-table th {
    position: sticky;
    top: 0;
    background: var(--surface-2);
    color: var(--muted);
    padding: 12px 16px;
    font-weight: 700;
    font-size: 0.78rem;
    border-bottom: 1px solid var(--border-soft);
    white-space: nowrap;
  }

  .app-table td { padding: 13px 16px; border-bottom: 1px solid var(--border-soft); font-variant-numeric: tabular-nums; }
  .app-table tbody tr:nth-child(even) { background: rgba(127, 148, 180, 0.06); }
  .app-table tbody tr:hover { background: var(--primary-soft); }
  .app-table tbody tr:last-child td { border-bottom: 0; }

  .total-bar {
    margin-top: 14px;
    padding: 14px 18px;
    border-radius: var(--radius-md);
    font-weight: 750;
    font-size: 0.92rem;
    text-align: right;
    text-transform: capitalize;
  }

  .text-green-bg { background: var(--ok-soft); color: var(--ok); }
  .text-red-bg { background: var(--bad-soft); color: var(--bad); }
  .text-green { color: var(--ok); }
  .text-red { color: var(--bad); }
  .text-blue { color: var(--primary-ink); }
  .text-muted { color: var(--muted); }
  .text-center { text-align: center; }
  .font-semibold { font-weight: 650; }
  .is-in { color: var(--ok); }
  .is-out { color: var(--bad); }

  /* ===== SPP ===== */
  .spp-summary-grid { grid-template-columns: 1fr; margin-bottom: 18px; }
  .spp-list { display: flex; flex-direction: column; gap: 10px; }

  .spp-item-card {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 15px 18px;
    background: var(--surface);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-md);
    box-shadow: inset 4px 0 0 var(--ok);
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .spp-item-card.unpaid {
    box-shadow: inset 4px 0 0 var(--bad);
    background: linear-gradient(90deg, var(--bad-soft), transparent 45%), var(--surface);
  }

  .spp-month { font-size: 1rem; font-weight: 750; }
  .spp-subinfo { display: flex; flex-wrap: wrap; gap: 4px 8px; margin-top: 3px; font-size: 0.8rem; color: var(--muted); }

  .status-badge { display: inline-block; padding: 6px 14px; border-radius: 999px; font-size: 0.75rem; font-weight: 750; }
  .badge-lunas { background: var(--ok-soft); color: var(--ok); }

  /* ===== JADWAL, PENGUMUMAN, PRESTASI ===== */
  .list-container { display: flex; flex-direction: column; gap: 10px; }

  .info-item-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 15px 18px;
    background: var(--surface-2);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-md);
  }

  .info-badge {
    background: linear-gradient(135deg, var(--navy-2), var(--navy));
    color: #fff;
    font-size: 0.74rem;
    font-weight: 700;
    padding: 5px 12px;
    border-radius: 999px;
    white-space: nowrap;
  }

  .info-content { display: flex; flex-direction: column; gap: 2px; }
  .info-title { font-size: 0.92rem; font-weight: 700; }
  .info-time { font-size: 0.8rem; color: var(--muted); }

  .notice-card {
    background: var(--surface);
    border: 1px solid var(--border-soft);
    box-shadow: inset 4px 0 0 var(--primary);
    padding: 16px 18px;
    border-radius: var(--radius-md);
  }

  .notice-date { font-size: 0.74rem; color: var(--faint); font-weight: 600; }
  .notice-title { margin: 6px 0 4px; font-size: 1rem; font-weight: 750; }
  .notice-text { margin: 0; font-size: 0.86rem; color: var(--muted); white-space: pre-wrap; line-height: 1.65; }

  .achievement-card {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 18px;
    background: linear-gradient(120deg, var(--warn-soft), transparent 80%), var(--surface);
    border: 1px solid color-mix(in srgb, var(--gold) 55%, transparent);
    border-radius: var(--radius-md);
  }

  .trophy-icon { font-size: 1.8rem; filter: drop-shadow(0 4px 8px rgba(245, 199, 107, 0.5)); }
  .achievement-title { font-size: 0.94rem; font-weight: 750; color: var(--warn); }
  .achievement-sub { margin: 2px 0 0; font-size: 0.78rem; color: var(--muted); }

  .badge-status {
    display: inline-block;
    background: var(--primary-soft);
    color: var(--primary-ink);
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 0.76rem;
    font-weight: 700;
  }

  .empty-msg { color: var(--faint); font-size: 0.88rem; text-align: center; padding: 32px 0; }

  /* ===== QR SANTRI (KARTU ID) ===== */
  .qr-student-card {
    width: min(100%, 400px);
    margin: 16px auto 0;
    padding: var(--qr-pad);
    background: var(--surface);
    border: 1px solid var(--border-soft);
    border-radius: 24px;
    box-shadow: var(--shadow-lg);
    text-align: left;
    overflow: hidden;
  }

  .qr-student-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: calc(var(--qr-pad) * -1) calc(var(--qr-pad) * -1) 0;
    padding: 16px var(--qr-pad);
    color: #fff;
    background:
      repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.05) 0 1px, transparent 1px 14px),
      linear-gradient(135deg, var(--navy-2), var(--navy));
  }

  .qr-student-logo {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.22);
    color: var(--gold);
    font-weight: 800;
    font-size: 0.9rem;
  }

  .qr-student-header strong,
  .qr-student-header span,
  .qr-student-info strong,
  .qr-student-info span { display: block; }

  .qr-student-header span { font-size: 0.74rem; color: rgba(255, 255, 255, 0.7); }
  .qr-student-profile { display: flex; align-items: center; gap: 14px; padding: 18px 0 10px; }

  .qr-avatar {
    width: 58px;
    height: 58px;
    flex: 0 0 58px;
    border-radius: 16px;
    overflow: hidden;
    background: var(--primary-soft);
    color: var(--primary-ink);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.3rem;
    font-weight: 800;
  }

  .qr-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .qr-student-info { min-width: 0; }
  .qr-student-info strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 1.02rem; }
  .qr-student-info span { margin-top: 2px; font-size: 0.78rem; color: var(--muted); }

  .qr-code-wrapper {
    display: flex;
    justify-content: center;
    margin: 10px 0;
    padding: 14px;
    border: 1px dashed var(--border);
    border-radius: 18px;
    background: #fff;
  }

  .qr-code-wrapper canvas { display: block; width: min(250px, 100%); height: auto; }

  .qr-unique-note { display: flex; align-items: center; justify-content: center; gap: 7px; color: var(--ok); font-size: 0.8rem; font-weight: 700; }

  .qr-unique-note span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--ok-soft);
  }

  .qr-small-text { margin: 10px 0 0; color: var(--faint); text-align: center; font-size: 0.72rem; line-height: 1.5; }

  /* ===== SIDEBAR & MODAL ===== */
  .sidebar-overlay,
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(6, 14, 27, 0.55);
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
    display: flex;
    justify-content: flex-end;
    z-index: 1000;
  }

  .modal-overlay { justify-content: center; align-items: center; padding: 16px; }

  .sidebar-content {
    width: 350px;
    max-width: 92%;
    height: 100%;
    padding: 24px;
    background: var(--surface);
    border-radius: 24px 0 0 24px;
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .modal-box {
    width: 100%;
    max-width: 460px;
    max-height: 92vh;
    overflow-y: auto;
    padding: 24px;
    background: var(--surface);
    border-radius: 24px;
    box-shadow: var(--shadow-lg);
  }

  .sidebar-header,
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 18px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--border-soft);
  }

  .sidebar-header h3,
  .modal-header h3 { margin: 0; font-size: 1.08rem; font-weight: 800; letter-spacing: -0.01em; }

  .close-x {
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--muted);
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .close-x:hover { background: var(--border-soft); }

  .profile-upload-section { display: flex; flex-direction: column; align-items: center; gap: 14px; margin-bottom: 22px; }

  .avatar-preview img,
  .avatar-placeholder-lg {
    width: 92px;
    height: 92px;
    border-radius: 50%;
    border: 3px solid var(--surface);
    box-shadow: 0 0 0 3px var(--primary), 0 14px 26px -12px rgba(47, 111, 220, 0.6);
  }

  .avatar-preview img { object-fit: cover; }

  .avatar-placeholder-lg {
    background: linear-gradient(135deg, #5b9bff, #2f6fdc);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.2rem;
    font-weight: 800;
  }

  /* ===== TOP UP / REKENING ===== */
  .topup-student-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px;
    margin-bottom: 14px;
    border-radius: var(--radius-md);
    background: var(--primary-soft);
    border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
  }

  .topup-student-icon {
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    border-radius: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--navy-2), var(--navy));
    color: var(--gold);
    font-weight: 800;
  }

  .topup-student-banner span,
  .topup-student-banner strong,
  .topup-student-banner small,
  .topup-reference span,
  .topup-reference strong,
  .topup-reference small { display: block; }

  .topup-student-label,
  .topup-student-banner small,
  .topup-reference span { font-size: 0.72rem; color: var(--muted); }

  .topup-student-banner strong { font-size: 0.94rem; }

  .rekening-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }

  .rekening-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    background: var(--surface-2);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-md);
  }

  .bank-heading { display: flex; align-items: center; gap: 12px; }

  .bank-logo {
    width: 46px;
    height: 38px;
    flex: 0 0 46px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 0.8rem;
    font-weight: 800;
    box-shadow: 0 8px 14px -8px rgba(0, 0, 0, 0.5);
  }

  .bank-logo-bsi { background: linear-gradient(135deg, #0aa077, #087f5b); }
  .bank-logo-bri { background: linear-gradient(135deg, #2b86f0, #0b63ce); }
  .bank-info { display: flex; flex-direction: column; }
  .bank-name { font-weight: 750; font-size: 0.92rem; }
  .bank-owner { font-size: 0.76rem; color: var(--muted); }

  .rekening-num { font-size: 1.15rem; font-weight: 800; letter-spacing: 0.06em; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  .btn-copy { align-self: flex-start; }

  .topup-reference {
    margin-bottom: 16px;
    padding: 14px 16px;
    border-radius: var(--radius-md);
    background: var(--surface-2);
    border: 1px dashed var(--border);
  }

  .topup-reference strong { margin-top: 2px; color: var(--primary-ink); font-size: 1.05rem; letter-spacing: 0.04em; }
  .topup-reference small { margin-top: 3px; font-size: 0.72rem; color: var(--faint); }

  /* ===== NOTIFIKASI ===== */
  .notification-wrapper { position: relative; }

  .notification-button {
    position: relative;
    width: 44px;
    height: 44px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.1);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.2s, transform 0.15s;
  }

  .notification-button:hover { background: rgba(255, 255, 255, 0.18); }
  .notification-button:active { transform: scale(0.94); }
  .notification-bell { font-size: 1.15rem; line-height: 1; }

  .notification-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 999px;
    background: #ff5a4d;
    color: #fff;
    border: 2px solid var(--navy);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.64rem;
    font-weight: 800;
  }

  .notification-backdrop { position: fixed; inset: 0; z-index: 999; border: 0; background: transparent; cursor: default; }

  .notification-panel {
    position: absolute;
    top: calc(100% + 12px);
    right: 0;
    width: min(390px, calc(100vw - 32px));
    max-height: 480px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border-soft);
    border-radius: 20px;
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    z-index: 1000;
    animation: view-in 0.2s ease both;
  }

  .notification-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    border-bottom: 1px solid var(--border-soft);
    background: var(--surface-2);
  }

  .notification-panel-header > div { display: flex; flex-direction: column; }
  .notification-panel-header strong { font-size: 0.96rem; font-weight: 750; }
  .notification-panel-header span { font-size: 0.72rem; color: var(--faint); }

  .notification-clear {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--primary-ink);
    padding: 7px 12px;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }

  .notification-list { max-height: 400px; overflow-y: auto; }

  .notification-item {
    width: 100%;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 14px 18px;
    border: 0;
    border-bottom: 1px solid var(--border-soft);
    background: var(--surface);
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }

  .notification-item:hover { background: var(--surface-2); }
  .notification-item.unread { background: var(--primary-soft); }

  .notification-dot { width: 8px; height: 8px; flex: 0 0 8px; margin-top: 6px; border-radius: 50%; background: transparent; }
  .notification-item.unread .notification-dot { background: #ff5a4d; box-shadow: 0 0 0 3px rgba(255, 90, 77, 0.2); }

  .notification-item-content { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .notification-item-content strong { font-size: 0.85rem; font-weight: 700; }
  .notification-item-content span { font-size: 0.78rem; color: var(--muted); line-height: 1.4; }
  .notification-item-content small { font-size: 0.68rem; color: var(--faint); }

  .notification-empty { min-height: 180px; padding: 24px 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center; }

  .notification-empty-icon {
    width: 50px;
    height: 50px;
    border-radius: 16px;
    background: var(--surface-2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.35rem;
    margin-bottom: 6px;
  }

  .notification-empty strong { font-size: 0.9rem; }
  .notification-empty span { font-size: 0.76rem; color: var(--faint); }

  /* ===== BANNER ===== */
  .banner-section { margin-top: 16px; }

  .banner-slider {
    position: relative;
    width: 100%;
    min-height: 230px;
    overflow: hidden;
    border-radius: 22px;
    background: var(--navy);
    box-shadow: var(--shadow);
    isolation: isolate;
  }

  .banner-slide { position: absolute; inset: 0; opacity: 0; visibility: hidden; transition: opacity 0.6s ease, visibility 0.6s ease; }
  .banner-slide.banner-active { opacity: 1; visibility: visible; z-index: 2; }
  .banner-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }

  .banner-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, rgba(11, 27, 51, 0.94) 0%, rgba(11, 27, 51, 0.66) 55%, rgba(11, 27, 51, 0.15) 100%);
  }

  .banner-content {
    position: relative;
    z-index: 3;
    max-width: 620px;
    height: 100%;
    min-height: 230px;
    padding: 24px 56px 44px 22px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    color: #fff;
  }

  .banner-label {
    padding: 5px 12px;
    border-radius: 999px;
    background: rgba(245, 199, 107, 0.18);
    border: 1px solid rgba(245, 199, 107, 0.45);
    color: var(--gold);
    font-size: 0.7rem;
    font-weight: 700;
  }

  .banner-content h3 { margin: 12px 0 6px; font-size: clamp(1.2rem, 3vw, 1.9rem); line-height: 1.2; letter-spacing: -0.02em; font-weight: 800; color: #fff; }
  .banner-content p { margin: 0; max-width: 520px; font-size: 0.86rem; line-height: 1.6; color: rgba(255, 255, 255, 0.88); }

  .banner-button {
    margin-top: 16px;
    padding: 10px 16px;
    border: 0;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #fff;
    color: var(--navy);
    font-size: 0.82rem;
    font-weight: 750;
    cursor: pointer;
    box-shadow: 0 10px 22px -8px rgba(0, 0, 0, 0.5);
    transition: transform 0.2s, background 0.2s;
  }

  .banner-button:hover { background: var(--gold); transform: translateY(-2px); }

  .banner-arrow {
    position: absolute;
    top: 50%;
    z-index: 5;
    width: 36px;
    height: 36px;
    transform: translateY(-50%);
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 50%;
    background: rgba(11, 27, 51, 0.4);
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
    color: #fff;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    display: grid;
    place-items: center;
  }

  .banner-arrow:hover { background: rgba(11, 27, 51, 0.75); }
  .banner-prev { left: 10px; }
  .banner-next { right: 10px; }

  .banner-dots { position: absolute; left: 50%; bottom: 12px; z-index: 6; transform: translateX(-50%); display: flex; gap: 6px; }

  .banner-dot { width: 8px; height: 8px; padding: 0; border: 0; border-radius: 999px; background: rgba(255, 255, 255, 0.5); cursor: pointer; transition: width 0.3s ease, background 0.3s ease; }
  .banner-dot.active { width: 24px; background: var(--gold); }

  /* ===== NAVBAR MELAYANG ===== */
  .floating-nav {
    position: fixed;
    left: 50%;
    bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%);
    z-index: 900;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px;
    background: rgba(18, 38, 63, 0.88);
    -webkit-backdrop-filter: blur(18px) saturate(160%);
    backdrop-filter: blur(18px) saturate(160%);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    box-shadow:
      0 14px 34px rgba(18, 38, 63, 0.38),
      0 2px 6px rgba(18, 38, 63, 0.25),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    animation: fnav-in 0.5s cubic-bezier(0.2, 0.9, 0.3, 1) both;
  }

  .fnav-item {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 46px;
    min-width: 46px;
    padding: 0 12px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: rgba(255, 255, 255, 0.72);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.25s ease, color 0.25s ease, box-shadow 0.25s ease, transform 0.15s ease;
  }

  .fnav-item:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
  .fnav-item:active { transform: scale(0.94); }

  .fnav-item.active {
    padding: 0 16px;
    background: #2f6fdc;
    color: #fff;
    box-shadow: 0 6px 16px rgba(47, 111, 220, 0.5);
  }

  .fnav-item.fnav-back {
    padding: 0 16px;
    background: #fff;
    color: var(--navy);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
    animation: fnav-pop 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
  }

  .fnav-svg {
    width: 22px;
    height: 22px;
    flex: 0 0 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .fnav-avatar {
    width: 26px;
    height: 26px;
    flex: 0 0 26px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(255, 255, 255, 0.55);
  }

  .fnav-item.active .fnav-avatar { border-color: #fff; }

  .fnav-label {
    max-width: 0;
    margin-left: 0;
    overflow: hidden;
    opacity: 0;
    white-space: nowrap;
    font-size: 0.8rem;
    font-weight: 650;
    letter-spacing: 0.01em;
    transition: max-width 0.3s ease, margin-left 0.3s ease, opacity 0.2s ease;
  }

  .fnav-item.active .fnav-label,
  .fnav-item.fnav-back .fnav-label {
    max-width: 96px;
    margin-left: 8px;
    opacity: 1;
  }

  .fnav-dot {
    position: absolute;
    top: 9px;
    right: 10px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #ff5a4d;
    border: 2px solid #1a3150;
  }

  .fnav-item.active .fnav-dot { display: none; }

  @keyframes fnav-in {
    from { opacity: 0; transform: translate(-50%, 28px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }

  @keyframes fnav-pop {
    from { transform: scale(0.85); opacity: 0.4; }
    to { transform: scale(1); opacity: 1; }
  }

  /* ===== SHEET PENGATURAN ===== */
  .sheet-overlay { align-items: flex-end; padding: 0; }

  .sheet-box {
    position: relative;
    width: 100%;
    max-width: 520px;
    padding: 26px 20px calc(20px + env(safe-area-inset-bottom, 0px));
    background: var(--surface);
    border-radius: 26px 26px 0 0;
    box-shadow: var(--shadow-lg);
    animation: sheet-up 0.3s cubic-bezier(0.2, 0.9, 0.3, 1) both;
  }

  .sheet-box::before {
    content: "";
    position: absolute;
    top: 9px;
    left: 50%;
    width: 40px;
    height: 4px;
    margin-left: -20px;
    border-radius: 999px;
    background: var(--border);
  }

  @keyframes sheet-up {
    from { transform: translateY(40px); opacity: 0; }
    to { transform: none; opacity: 1; }
  }

  .settings-list { display: flex; flex-direction: column; gap: 8px; }

  .settings-item {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 13px 16px;
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-md);
    text-align: left;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, transform 0.15s;
  }

  .settings-item:hover { background: var(--primary-soft); border-color: color-mix(in srgb, var(--primary) 40%, transparent); }
  .settings-item:active { transform: scale(0.98); }

  .settings-icon {
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 13px;
    background: var(--surface);
    border: 1px solid var(--border-soft);
    font-size: 1.15rem;
  }

  .settings-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .settings-text strong { font-size: 0.92rem; font-weight: 700; }
  .settings-text small { font-size: 0.74rem; color: var(--muted); }
  .settings-arrow { color: var(--faint); font-size: 1.4rem; }

  .settings-item.danger .settings-icon { background: var(--bad-soft); border-color: transparent; }
  .settings-item.danger strong { color: var(--bad); }
  .settings-item.danger:hover { background: var(--bad-soft); border-color: color-mix(in srgb, var(--bad) 35%, transparent); }

  /* ===== TOAST ===== */
  .toast {
    position: fixed;
    left: 50%;
    bottom: calc(96px + env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%);
    z-index: 1100;
    max-width: calc(100% - 32px);
    padding: 11px 18px;
    border-radius: 999px;
    background: rgba(11, 27, 51, 0.92);
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #fff;
    font-size: 0.84rem;
    font-weight: 650;
    box-shadow: var(--shadow-lg);
    animation: toast-in 0.3s cubic-bezier(0.2, 0.9, 0.3, 1) both;
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translate(-50%, 12px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .banner-slide,
    .banner-dot,
    .menu-item,
    .fnav-item,
    .fnav-label { transition: none; }

    .floating-nav,
    .fnav-item.fnav-back,
    .desktop-top-grid,
    .dashboard-layout,
    .banner-section,
    .page-card,
    .notification-panel,
    .sheet-box,
    .toast { animation: none; }

    .menu-item:hover { transform: none; }
  }

  /* ===== TABLET (>= 600px) ===== */
  @media (min-width: 600px) {
    .spp-summary-grid { grid-template-columns: repeat(3, 1fr); }
    .spp-item-card { flex-direction: row; align-items: center; justify-content: space-between; }
    .btn-pay-now { width: auto; }
    .info-item-card { flex-direction: row; align-items: center; gap: 16px; }
    .info-badge { min-width: 116px; text-align: center; }
    .card-header-flex { flex-direction: row; align-items: center; }
    .banner-slider,
    .banner-content { min-height: 260px; }
    .banner-content { padding: 30px 84px 46px 34px; }
    .banner-content p { font-size: 0.94rem; }
  }

  /* ===== LAPTOP / DESKTOP (>= 900px) ===== */
  @media (min-width: 900px) {
    .app-header { padding: 22px 24px 108px; border-radius: 0 0 36px 36px; }
    .app-body { margin-top: -78px; padding: 0 24px; }
    .desktop-top-grid { grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .desktop-only { display: block; }
    .dashboard-layout { grid-template-columns: 1.5fr 1fr; gap: 20px; align-items: start; }
    .menu-grid { gap: 12px; }

    .stats-card,
    .menu-section,
    .recent-section,
    .page-card { padding: 26px; }

    .balance-card { padding: 28px; }
    .balance-amount { font-size: 2.4rem; }
    .banner-section { margin-top: 20px; }
    .user-name { max-width: 360px; }
  }

  /* ===== HP KECIL (< 600px) ===== */
  @media (max-width: 599px) {
    .mybca-app { --qr-pad: 16px; }

    .notification-panel {
      position: fixed;
      top: 72px;
      left: 12px;
      right: 12px;
      width: auto;
      max-height: calc(100vh - 90px);
    }

    .notification-list { max-height: calc(100vh - 170px); }

    .stats-card,
    .menu-section,
    .recent-section,
    .page-card { padding: 16px; }

    .modal-box { padding: 20px; }
    .banner-arrow { width: 30px; height: 30px; font-size: 1.3rem; }
    .banner-content { padding: 20px 46px 40px 18px; }
    .banner-content p { font-size: 0.76rem; }
    .total-bar { text-align: left; }
  }
</style>