<!--
  MySantri - Dashboard Santri (Tema Sapphire Blue & QR Scanner Compatible)
  Dependensi: npm install qrcode
-->

<script lang="ts">
  import { supabase } from "$lib/supabaseClient";
  import { onMount, onDestroy, tick } from "svelte";
  import { goto } from "$app/navigation";
  import QRCode from "qrcode";

  /* ===================== TIPE ===================== */

  type Section =
    | "home" | "keuangan" | "barcode" | "absensi" | "jadwal"
    | "pengumuman" | "prestasi" | "spp" | "nilai" | "ngaji";

  interface UserData {
    id: number;
    username?: string;
    nama?: string;
    kelas?: string;
    kelas_id?: string | number;
  }
  interface Entry { id: number; date: string; amount: number; kind: "pemasukan" | "pengeluaran"; name: string; user_id: number; }
  interface Absensi { id: number; date: string; status: string; }
  interface NgajiAttendance {
    id: number;
    session_id: number;
    user_id: number;
    tanggal: string;
    jam_scan: string | null;
    status: "hadir" | "izin" | "sakit" | "alpa" | string | null;
    metode: string | null;
    keterangan: string | null;
    created_at: string | null;
  }
  interface Pengumuman { id: number; title: string; content: string; created_at: string; }
  interface SPPItem { bulan: string; key: string; tahun: number; status: "lunas" | "belum_lunas"; jatuh_tempo: string; }
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

  const MONTHS = [
    { name: "Januari", key: "january" }, { name: "Februari", key: "february" },
    { name: "Maret", key: "march" }, { name: "April", key: "april" },
    { name: "Mei", key: "may" }, { name: "Juni", key: "june" },
    { name: "Juli", key: "july" }, { name: "Agustus", key: "august" },
    { name: "September", key: "september" }, { name: "Oktober", key: "october" },
    { name: "November", key: "november" }, { name: "Desember", key: "december" }
  ];

  const REKENING = [
    { kode: "BSI", nama: "Bank Syariah Indonesia", pemilik: "AGUS YUSUP", nomor: "1018392778", tone: "bsi" },
    { kode: "BRI", nama: "Bank Rakyat Indonesia", pemilik: "YAYASAN DAARULHIKAM", nomor: "551301029259535", tone: "bri" }
  ];

  const menuItems: MenuItem[] = [
    { section: "spp", label: "SPP Santri", icon: "💳", tone: "blue" },
    { section: "keuangan", label: "Tabungan", icon: "👛", tone: "sky" },
    { section: "absensi", label: "Presensi", icon: "🗓️", tone: "indigo" },
    { section: "ngaji", label: "Halaqah Ngaji", icon: "📖", tone: "blue" },
    { section: "jadwal", label: "Jadwal", icon: "⏱️", tone: "cyan" },
    { section: "pengumuman", label: "Maklumat", icon: "📢", tone: "amber" },
    { section: "prestasi", label: "Prestasi", icon: "🏆", tone: "yellow" },
    { section: "nilai", label: "Raport Nilai", icon: "📝", tone: "purple" },
    { section: "barcode", label: "Digital Card", icon: "🪪", tone: "blue" },
    { section: "topup", label: "Isi Saldo", icon: "⚡", tone: "sky" }
  ];

  const bannerList: BannerItem[] = [
    { image: "/images/foto.png", title: "Informasi Kepesantrenan", description: "Dapatkan maklumat dan agenda resmi santri terkini.", buttonText: "Buka Berita", section: "pengumuman" },
    { image: "/images/foto1.png", title: "Layanan SPP Digital", description: "Bayar dan pantau rekapitulasi SPP bulanan tanpa antre.", buttonText: "Cek Status", section: "spp" },
    { image: "/images/foto2.png", title: "Pancaran Prestasi", description: "Inspirasi capaian musabaqah dan keilmuan para santri.", buttonText: "Jelajahi", section: "prestasi" }
  ];

  const jadwalList: JadwalItem[] = [
    { hari: "Senin - Sabtu", kegiatan: "Qiyamul Lail & Shalat Subuh Berjamaah", waktu: "03.45 – 05.15 WIB" },
    { hari: "Senin - Sabtu", kegiatan: "Halaqah Al-Qur'an Subuh", waktu: "05.15 – 06.15 WIB" },
    { hari: "Senin - Sabtu", kegiatan: "Madrasah Formal / Diniyah", waktu: "07.15 – 12.00 WIB" },
    { hari: "Senin - Sabtu", kegiatan: "Shalat Dzuhur & Istirahat Qailullah", waktu: "12.00 – 13.30 WIB" },
    { hari: "Senin - Sabtu", kegiatan: "Ta'lim Kitab Kuning Sore", waktu: "15.45 – 17.15 WIB" },
    { hari: "Senin - Sabtu", kegiatan: "Muraja'ah & Setoran Hafalan Malam", waktu: "18.30 – 20.30 WIB" },
    { hari: "Ahad", kegiatan: "Riyadhah & Kerja Bakti Pesantren", waktu: "Sepanjang Hari" }
  ];

  const prestasiList: PrestasiItem[] = [
    { tahun: "2026", judul: "Juara 1 MHQ 30 Juz Tingkat Remaja", tingkat: "Tingkat Provinsi" },
    { tahun: "2025", judul: "Juara 2 Debat Bahasa Arab Pesantren", tingkat: "Tingkat Nasional" }
  ];

  /* ===================== THEME & STATE ===================== */

  let isDarkMode = false;
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
  let ngajiAttendanceList: NgajiAttendance[] = [];
  let pengumumanList: Pengumuman[] = [];
  let sppList: SPPItem[] = [];
  let nilaiList: StudentGrade[] = [];

  let loadingEntries = false;
  let loadingAbsensi = false;
  let loadingNgajiAttendance = false;
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

  /* ===================== THEME LOGIC ===================== */

  function initTheme() {
    const saved = localStorage.getItem("app_theme");
    if (saved) {
      isDarkMode = saved === "dark";
    } else {
      isDarkMode = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    applyTheme();
  }

  function toggleTheme() {
    isDarkMode = !isDarkMode;
    localStorage.setItem("app_theme", isDarkMode ? "dark" : "light");
    applyTheme();
  }

  function applyTheme() {
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", isDarkMode);
    }
  }

  /* ===================== REAKTIF ===================== */

  $: displayName = user?.nama || user?.username || "Santri";
  $: initial = displayName.charAt(0).toUpperCase();
  $: kelasLabel = user?.kelas || user?.kelas_id ? String(user?.kelas || user?.kelas_id) : "Belum ditentukan";

  $: pemasukan = entries.filter((e) => e.kind === "pemasukan");
  $: pengeluaran = entries.filter((e) => e.kind === "pengeluaran");
  $: totalPemasukan = pemasukan.reduce((t, e) => t + Number(e.amount || 0), 0);
  $: totalPengeluaran = pengeluaran.reduce((t, e) => t + Number(e.amount || 0), 0);
  $: saldo = totalPemasukan - totalPengeluaran;
  $: activeEntries = keuanganTab === "pemasukan" ? pemasukan : pengeluaran;
  $: activeTotal = keuanganTab === "pemasukan" ? totalPemasukan : totalPengeluaran;

  $: ngajiHadir = ngajiAttendanceList.filter((a) => a.status === "hadir").length;
  $: ngajiIzin = ngajiAttendanceList.filter((a) => a.status === "izin").length;
  $: ngajiSakit = ngajiAttendanceList.filter((a) => a.status === "sakit").length;
  $: ngajiAlpa = ngajiAttendanceList.filter((a) => a.status === "alpa").length;

  $: sppLunas = sppList.filter((s) => s.status === "lunas");
  $: sppBelumLunas = sppList.filter((s) => s.status === "belum_lunas");
  $: filteredSPP = sppTab === "semua" ? sppList : sppList.filter((s) => s.status === sppTab);

  $: unreadCount = notifications.filter((n) => !seenIds.has(n.id)).length;
  $: unreadPengumuman = notifications.filter((n) => n.section === "pengumuman" && !seenIds.has(n.id)).length;

  /* ===================== FORMATTING ===================== */

  function formatRupiah(value: number): string {
    return new Intl.NumberFormat("id-ID").format(value || 0);
  }

  function formatJamScan(value: string | null): string {
    if (!value) return "-";
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleString("id-ID", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false
    });
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
        notify(verb(p, "Pengumuman baru", "Pengumuman diperbarui"), row.title || "Ada informasi terbaru dari pondok pesantren.", "pengumuman");
      }
      loadPengumuman();
    });

    listen("attendance", true, (p) => {
      const row = p.new || {};
      notify(verb(p, "Absensi baru", "Absensi diperbarui"), `Status absensi kamu: ${row.status || "diperbarui"}.`, "absensi");
      loadAbsensi();
    });

    listen("ngaji_attendance", true, (p) => {
      const row = p.new || p.old || {};
      if (p.eventType !== "DELETE") {
        notify(verb(p, "Kehadiran ngaji tercatat", "Kehadiran ngaji diperbarui"), `Status ngaji: ${row.status || "diperbarui"}.`, "ngaji");
      }
      loadNgajiAttendance();
    });

    listen("student_grades", true, (p) => {
      const row = p.new || {};
      notify(verb(p, "Nilai baru", "Nilai diperbarui"), row.subject ? `Nilai ${row.subject} telah diperbarui.` : "Ada pembaruan nilai.", "nilai");
      loadNilai();
    });

    listen("entries", true, (p) => {
      const row = p.new || {};
      notify(verb(p, "Keuangan diperbarui", "Transaksi diperbarui"), row.name ? `${row.name} (Rp ${formatRupiah(Number(row.amount || 0))})` : "Ada perubahan kas.", "keuangan");
      loadEntries();
    });

    listen("spp_payments", true, () => {
      notify("SPP diperbarui", "Data pembayaran SPP telah terverifikasi.", "spp");
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
    }, 5500);
  }

  function stopBannerAutoplay() {
    if (bannerInterval) clearInterval(bannerInterval);
    bannerInterval = null;
  }

  /* ===================== LIFECYCLE ===================== */

  onMount(async () => {
    initTheme();
    loadUser();

    if (!user?.id) {
      await goto("/");
      return;
    }

    await Promise.allSettled([
      loadEntries(),
      loadAbsensi(),
      loadNgajiAttendance(),
      loadSPP(),
      loadPengumuman(),
      loadNilai()
    ]);

    if (user?.id) setupRealtime();
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
      editNama = user?.nama || user?.username || "";
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
    if (error) return fail("Gagal memuat keuangan", error);
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

  async function loadNgajiAttendance() {
    if (!user?.id) return;
    loadingNgajiAttendance = true;
    try {
      const { data, error } = await supabase
        .from("ngaji_attendance")
        .select("id, session_id, user_id, tanggal, jam_scan, status, metode, keterangan, created_at")
        .eq("user_id", user.id)
        .order("tanggal", { ascending: false })
        .order("jam_scan", { ascending: false });

      if (error) {
        fail("Gagal memuat kehadiran ngaji", error);
        return;
      }
      ngajiAttendanceList = (data || []) as NgajiAttendance[];
    } catch (error) {
      console.error("Gagal memuat kehadiran ngaji:", error);
      message = "Terjadi kendala saat membaca catatan kehadiran ngaji.";
    } finally {
      loadingNgajiAttendance = false;
    }
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

    try {
      const { data: existing, error } = await supabase
        .from("spp_payments")
        .select("*")
        .eq("user_id", user.id)
        .eq("year", currentYear)
        .maybeSingle();

      if (error) {
        fail("Gagal memuat SPP", error);
        return;
      }

      let paymentData = existing;
      if (!paymentData) {
        const { data: created, error: insertError } = await supabase
          .from("spp_payments")
          .insert({ user_id: user.id, year: currentYear })
          .select()
          .single();

        if (insertError) {
          fail("Gagal membuat data SPP", insertError);
          return;
        }
        paymentData = created;
      }

      sppList = MONTHS.map((m) => ({
        bulan: m.name,
        key: m.key,
        tahun: currentYear,
        status: paymentData?.[m.key] === true ? "lunas" : "belum_lunas",
        jatuh_tempo: `10 ${m.name} ${currentYear}`
      }));
    } catch (error) {
      console.error("Gagal memuat SPP:", error);
      message = "Gagal memproses data tagihan SPP.";
    } finally {
      loadingSPP = false;
    }
  }

  /* ===================== QR CODE COMPATIBLE DENGAN ROLE USTAD ===================== */

  async function generateStudentQR() {
    if (!user?.id) return;
    await tick();

    const canvas = document.getElementById("santri-qr-main") as HTMLCanvasElement | null;
    if (!canvas) return;

    // Payload disesuaikan dengan skema pembacaan QR pada Role Ustadz (attendance & scanner)
    const payload = JSON.stringify({
      type: "SANTRI",
      user_id: user.id,
      id: user.id,
      nama: user.nama || user.username || displayName,
      username: user.username || "",
      kelas: user.kelas || user.kelas_id || "",
      kelas_id: user.kelas_id || user.kelas || ""
    });

    try {
      await QRCode.toCanvas(canvas, payload, {
        width: 260,
        margin: 2,
        errorCorrectionLevel: "H",
        color: {
          dark: isDarkMode ? "#0b192c" : "#0f172a",
          light: "#ffffff"
        }
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
    else if (section === "ngaji") await loadNgajiAttendance();
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

  async function copyRekening(nomor: string) {
    try {
      await navigator.clipboard.writeText(nomor);
      showToast("Nomor rekening berhasil disalin");
    } catch {
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
    if (!data.length) return showToast("Tidak ada rekaman transaksi");

    const rows = [["Keterangan", "Tanggal", "Jumlah (IDR)", "Kategori"], ...data.map((i) => [i.name, i.date, i.amount, i.kind])];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");

    saveFile("\uFEFF" + csv, "text/csv;charset=utf-8;", `Laporan_${filename}_${displayName.replace(/\s+/g, "_")}.csv`);
  }

  function downloadRaport() {
    if (!nilaiList.length) return showToast("Belum ada data nilai semester ini.");

    const semesterLabel = selectedSemester === 1 ? "Semester 1 (Ganjil)" : "Semester 2 (Genap)";
    const tahunAjaran = nilaiList[0]?.academic_year || String(currentYear);

    const rows = nilaiList
      .map(
        (i) => `<tr>
          <td style="font-weight:600;text-align:left;">${escapeHtml(i.subject)}</td>
          <td>${i.nilai_pts ?? "-"}</td>
          <td>${i.nilai_pas ?? "-"}</td>
          <td>${i.nilai_tugas ?? "-"}</td>
          <td>${i.nilai_ulangan_harian ?? "-"}</td>
          <td>${i.nilai_sikap_karakter ?? "-"}</td>
          <td>${i.nilai_ujian_sekolah ?? "-"}</td>
          <td style="font-weight:700;color:#2563eb">${i.nilai_akhir ?? "-"}</td>
        </tr>`
      )
      .join("");

    const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<title>Raport Santri - ${escapeHtml(displayName)}</title>
<style>
  body{font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:40px;color:#0f172a;line-height:1.5}
  .header{display:flex;align-items:center;border-bottom:2px solid #0f172a;padding-bottom:14px;margin-bottom:20px}
  .kop{text-align:center;flex:1}
  .kop h1{margin:0;font-size:22px;letter-spacing:1px;color:#1d4ed8}
  .kop h2{margin:4px 0;font-size:16px;color:#334155}
  .kop p{margin:0;font-size:12px;color:#64748b}
  .bio-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:20px;font-size:13px;background:#f8fafc;padding:14px 18px;border-radius:10px}
  .bio-grid div span{color:#64748b;display:inline-block;width:120px}
  table{width:100%;border-collapse:collapse;margin-top:10px}
  th,td{border:1px solid #cbd5e1;padding:9px 10px;text-align:center;font-size:12px}
  th{background:#f1f5f9;font-weight:700;color:#1e293b}
  tr:nth-child(even){background:#fafafa}
  .footer{margin-top:50px;display:flex;justify-content:space-between;text-align:center;font-size:13px}
  .ttd-box{width:220px}
  .ttd-space{height:75px}
  @media print{.no-print{display:none}body{margin:10mm}}
</style></head><body>
<div class="no-print" style="text-align:right;margin-bottom:16px">
  <button onclick="window.print()" style="padding:10px 18px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-weight:bold;cursor:pointer">Cetak / Simpan PDF</button>
</div>
<div class="header">
  <div class="kop">
    <h1>PONDOK PESANTREN DAARULHIKAM</h1>
    <h2>BUKU LAPORAN HASIL BELAJAR SANTRI</h2>
    <p>${semesterLabel} • Tahun Akademik ${escapeHtml(tahunAjaran)}</p>
  </div>
</div>
<div class="bio-grid">
  <div><span>Nama Santri:</span> <b>${escapeHtml(displayName)}</b></div>
  <div><span>NIS / ID:</span> <b>SANTRI-${user?.id}</b></div>
  <div><span>Kelas / Halaqah:</span> <b>${escapeHtml(kelasLabel)}</b></div>
  <div><span>Tanggal Cetak:</span> <b>${new Date().toLocaleDateString("id-ID")}</b></div>
</div>
<table>
  <thead>
    <tr>
      <th style="text-align:left">Mata Pelajaran</th>
      <th>PTS</th><th>PAS</th><th>Tugas</th><th>UH</th><th>Adab & Karakter</th><th>Ujian Akhir</th><th>Nilai Akhir</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">
  <div class="ttd-box">
    <div>Mengetahui,</div>
    <div>Wali Santri</div>
    <div class="ttd-space"></div>
    <b>( ..................................... )</b>
  </div>
  <div class="ttd-box">
    <div>Daarulhikam, ${new Date().toLocaleDateString("id-ID")}</div>
    <div>Wali Kelas / Asatidz</div>
    <div class="ttd-space"></div>
    <b>( ..................................... )</b>
  </div>
</div>
</body></html>`;

    saveFile(html, "text/html;charset=utf-8", `Raport_${displayName.replace(/\s+/g, "_")}_${semesterLabel.replace(/\s+/g, "_")}.html`);
  }

  function handleImageUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return showToast("Format berkas harus foto!");

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 256;
        canvas.getContext("2d")?.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
        avatarUrl = canvas.toDataURL("image/jpeg", 0.88);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function saveProfile() {
    if (!user) return;
    const namaBaru = editNama.trim();
    if (!namaBaru) return showToast("Nama santri tidak boleh kosong");

    user = { ...user, username: namaBaru, nama: namaBaru };

    try {
      localStorage.setItem("user", JSON.stringify(user));
      if (avatarUrl && user.id) localStorage.setItem(`avatar_${user.id}`, avatarUrl);
    } catch {
      return showToast("Memori lokal peramban penuh!");
    }

    isSidebarOpen = false;
    showToast("Profil berhasil diperbarui ✨");
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="modern-app {isDarkMode ? 'dark' : ''}">
  <!-- Ambient background glow layers (Sapphire / Royal Blue) -->
  <div class="ambient-glow glow-1" aria-hidden="true"></div>
  <div class="ambient-glow glow-2" aria-hidden="true"></div>

  <!-- ================= HEADER TOPBAR ================= -->
  <header class="app-topbar">
    <div class="topbar-container">
      <div class="user-profile-meta">
        <button class="avatar-interactive" on:click={() => (isSidebarOpen = true)} aria-label="Buka profil">
          {#if avatarUrl}
            <img src={avatarUrl} alt="Avatar" class="avatar-face" />
          {:else}
            <div class="avatar-fallback">{initial}</div>
          {/if}
          <span class="avatar-badge-online"></span>
        </button>

        <div class="user-greeting-block">
          <div class="greeting-subtitle">Assalamu'alaikum,</div>
          <h1 class="user-heading">{displayName}</h1>
          <div class="header-class-chip">Kelas: <b>{kelasLabel}</b></div>
        </div>
      </div>

      <div class="topbar-actions">
        <!-- MODE SIANG / MALAM TOGGLE -->
        <button
          class="icon-action-btn theme-toggle-btn"
          on:click={toggleTheme}
          title={isDarkMode ? "Beralih ke mode siang" : "Beralih ke mode malam"}
          aria-label="Ubah tema tampilan"
        >
          {#if isDarkMode}
            <!-- Sun Icon -->
            <svg class="action-svg sun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="4" stroke-width="2"/>
              <path stroke-width="2" stroke-linecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
            </svg>
          {:else}
            <!-- Moon Icon -->
            <svg class="action-svg moon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          {/if}
        </button>

        <!-- NOTIFICATION BELL -->
        <div class="notif-anchor">
          <button
            class="icon-action-btn"
            on:click={() => (showNotifications = !showNotifications)}
            aria-label="Notifikasi sistem"
            aria-expanded={showNotifications}
          >
            <svg class="action-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {#if unreadCount > 0}
              <span class="notif-counter-pill">{unreadCount > 9 ? "9+" : unreadCount}</span>
            {/if}
          </button>

          {#if showNotifications}
            <button class="notif-dismiss-backdrop" aria-label="Tutup panel" on:click={() => (showNotifications = false)}></button>
            <div class="notif-dropdown-card">
              <div class="notif-card-header">
                <div>
                  <h4>Notifikasi</h4>
                  <p>Kabar & maklumat santri</p>
                </div>
                {#if notifications.length > 0}
                  <button class="btn-text-read" on:click={markAllRead}>Tandai Dibaca</button>
                {/if}
              </div>

              <div class="notif-scroll-pane">
                {#if notifications.length === 0}
                  <div class="notif-empty-state">
                    <span class="empty-icon-bubble">🔔</span>
                    <p class="empty-title">Tidak ada notifikasi baru</p>
                    <small>Semua maklumat dari pondok akan tampil di sini</small>
                  </div>
                {:else}
                  {#each notifications as item (item.id)}
                    <button class="notif-tile" class:is-unread={!seenIds.has(item.id)} on:click={() => openNotification(item)}>
                      <div class="notif-glow-dot"></div>
                      <div class="notif-tile-body">
                        <h5>{item.title}</h5>
                        <p>{item.text}</p>
                        <time>{formatTanggal(item.created_at)}</time>
                      </div>
                    </button>
                  {/each}
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </header>

  <!-- ================= MAIN CONTAINER ================= -->
  <main class="app-main-content">
    {#if message}
      <div class="banner-alert" role="alert">
        <span class="alert-icon">⚠️</span>
        <div class="alert-text">{message}</div>
        <button class="alert-close" on:click={() => (message = "")}>✕</button>
      </div>
    {/if}

    <!-- SECTION: HOME -->
    {#if activeSection === "home"}
      <div class="dashboard-viewport">
        <!-- TOP ROW: KARTU SALDO & SUMMARY DESKTOP -->
        <div class="hero-balance-row">
          <div class="card-glass-balance">
            <div class="balance-card-inner">
              <div class="balance-header-tag">
                <span class="chip-balance">Dompet Santri</span>
                <span class="chip-class">Halaqah: <b>{kelasLabel}</b></span>
              </div>

              <div class="balance-figure-area">
                <span class="currency-tag">Rp</span>
                <span class="nominal-tag">{formatRupiah(saldo)}</span>
              </div>

              <div class="balance-actions-toolbar">
                <button class="balance-quick-btn" on:click={() => (showTransferModal = true)}>
                  <span class="quick-icon">⚡</span>
                  <span>Top Up SPP / Jajan</span>
                </button>
                <button class="balance-quick-btn btn-secondary-action" on:click={() => switchSection("barcode")}>
                  <span class="quick-icon">🪪</span>
                  <span>Kartu QR Ustadz</span>
                </button>
              </div>
            </div>
            <!-- Decorative circle glow -->
            <div class="card-circle-glow" aria-hidden="true"></div>
          </div>

          <!-- SUMMARY KEUANGAN CEPAT (DESKTOP) -->
          <div class="card-glass quick-summary-desktop">
            <h3 class="card-mini-title">Arus Kas Pekan Ini</h3>
            <div class="quick-cashflow-grid">
              <div class="cash-stat-card in-card">
                <div class="stat-indicator in">↗</div>
                <div class="stat-meta">
                  <span class="stat-meta-label">Total Kiriman</span>
                  <span class="stat-meta-val text-blue">+Rp {formatRupiah(totalPemasukan)}</span>
                </div>
              </div>
              <div class="cash-stat-card out-card">
                <div class="stat-indicator out">↘</div>
                <div class="stat-meta">
                  <span class="stat-meta-label">Total Belanja</span>
                  <span class="stat-meta-val text-rose">-Rp {formatRupiah(totalPengeluaran)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- GRID KONTEN HOME (LAYANAN & RECENT) -->
        <div class="core-dashboard-grid">
          <!-- LAYANAN UTAMA -->
          <section class="card-glass services-section">
            <div class="section-title-wrap">
              <h3>Layanan Akademik & Pondok</h3>
              <span class="badge-subtle">10 Fitur Terintegrasi</span>
            </div>

            <div class="services-app-grid">
              {#each menuItems as item}
                <button class="service-app-tile" on:click={() => openMenu(item)}>
                  <div class="app-icon-pod tone-{item.tone}">
                    <span>{item.icon}</span>
                    {#if item.section === "pengumuman" && unreadPengumuman > 0}
                      <span class="service-pulse-dot" aria-label="Ada maklumat baru"></span>
                    {/if}
                  </div>
                  <span class="app-tile-name">{item.label}</span>
                </button>
              {/each}
            </div>
          </section>

          <!-- RIWAYAT TRANSAKSI TERAKHIR -->
          <section class="card-glass recent-transactions-section">
            <div class="section-title-wrap">
              <h3>Transaksi Terakhir</h3>
              <button class="link-more-btn" on:click={() => switchSection("keuangan")}>Lihat Semua ›</button>
            </div>

            <div class="recent-records-flow">
              {#if loadingEntries && entries.length === 0}
                <div class="skeleton-shimmer">Memuat riwayat transaksi...</div>
              {:else if entries.length === 0}
                <div class="empty-state-card">
                  <span class="empty-ico">💸</span>
                  <p>Belum ada rekaman transaksi santri.</p>
                </div>
              {:else}
                {#each entries.slice(0, 4) as item (item.id)}
                  <div class="tx-card-row">
                    <div class="tx-badge {item.kind === 'pemasukan' ? 'tx-badge-in' : 'tx-badge-out'}">
                      {item.kind === "pemasukan" ? "↙" : "↗"}
                    </div>
                    <div class="tx-details">
                      <div class="tx-name">{item.name}</div>
                      <div class="tx-time">{item.date}</div>
                    </div>
                    <div class="tx-sum {item.kind === 'pemasukan' ? 'text-blue' : 'text-rose'}">
                      {item.kind === "pemasukan" ? "+" : "-"} Rp {formatRupiah(item.amount)}
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          </section>
        </div>

        <!-- BANNER SLIDER ESTETIK -->
        <section
          class="card-glass-banner-slider"
          aria-label="Papan Maklumat & Berita"
          on:mouseenter={() => (isBannerHovered = true)}
          on:mouseleave={() => (isBannerHovered = false)}
        >
          <div class="slider-canvas">
            {#each bannerList as banner, idx}
              <article class="slider-frame" class:is-active={idx === activeBanner} aria-hidden={idx !== activeBanner}>
                <img src={banner.image} alt={banner.title} class="slider-backdrop-img" loading={idx === 0 ? "eager" : "lazy"} />
                <div class="slider-scrim-gradient"></div>
                <div class="slider-caption-body">
                  <span class="slider-pill">Pesantren News</span>
                  <h3 class="slider-headline">{banner.title}</h3>
                  <p class="slider-summary">{banner.description}</p>
                  <button type="button" class="slider-cta-btn" on:click={() => switchSection(banner.section)}>
                    <span>{banner.buttonText}</span>
                    <span class="cta-arrow" aria-hidden="true">→</span>
                  </button>
                </div>
              </article>
            {/each}

            {#if bannerList.length > 1}
              <button type="button" class="slider-arrow-btn nav-prev" on:click={prevBanner} aria-label="Sebelumnya">‹</button>
              <button type="button" class="slider-arrow-btn nav-next" on:click={nextBanner} aria-label="Selanjutnya">›</button>
              <div class="slider-bullet-indicators">
                {#each bannerList as _, idx}
                  <button
                    type="button"
                    class="bullet-dot"
                    class:is-active={idx === activeBanner}
                    on:click={() => (activeBanner = idx)}
                    aria-label={`Slide ${idx + 1}`}
                  ></button>
                {/each}
              </div>
            {/if}
          </div>
        </section>
      </div>
    {/if}

    <!-- SECTION: SPP SANTRI -->
    {#if activeSection === "spp"}
      <div class="card-glass page-box">
        <div class="page-header-block">
          <div>
            <h2 class="page-title">Iuran Bulanan (SPP)</h2>
            <p class="page-subtitle">Informasi status pembiayaan santri tahun akademik {currentYear}.</p>
          </div>
          <button class="btn-modern-primary" on:click={() => (showTransferModal = true)}>⚡ Bayar / Transfer</button>
        </div>

        <div class="spp-overview-grid">
          <div class="spp-kpi-card kpi-paid">
            <span class="kpi-label">Sudah Terbayar</span>
            <span class="kpi-value text-blue">{sppLunas.length} Bulan</span>
          </div>
          <div class="spp-kpi-card kpi-unpaid">
            <span class="kpi-label">Menunggu Pembayaran</span>
            <span class="kpi-value text-rose">{sppBelumLunas.length} Bulan</span>
          </div>
        </div>

        <div class="segmented-control-bar">
          <button class="seg-btn" class:active={sppTab === "semua"} on:click={() => (sppTab = "semua")}>Semua ({sppList.length})</button>
          <button class="seg-btn" class:active={sppTab === "belum_lunas"} on:click={() => (sppTab = "belum_lunas")}>Belum Lunas ({sppBelumLunas.length})</button>
          <button class="seg-btn" class:active={sppTab === "lunas"} on:click={() => (sppTab = "lunas")}>Lunas ({sppLunas.length})</button>
        </div>

        <div class="spp-cards-stream">
          {#if loadingSPP}
            <div class="skeleton-shimmer">Sinkronisasi data tagihan SPP...</div>
          {:else if filteredSPP.length === 0}
            <div class="empty-state-card"><p>Tidak ada catatan pada filter ini.</p></div>
          {:else}
            {#each filteredSPP as item (item.key)}
              <div class="spp-entry-card" class:is-paid={item.status === "lunas"}>
                <div class="spp-entry-info">
                  <div class="spp-title">{item.bulan} {item.tahun}</div>
                  <div class="spp-due-date">
                    {#if item.status === "lunas"}
                      <span class="badge-status-paid">✓ Terverifikasi Lunas</span>
                    {:else}
                      <span class="badge-status-unpaid">⏳ Jatuh Tempo: {item.jatuh_tempo}</span>
                    {/if}
                  </div>
                </div>
                {#if item.status !== "lunas"}
                  <button class="btn-spp-action" on:click={() => (showTransferModal = true)}>Lunasi Sekarang</button>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {/if}

    <!-- SECTION: KEUANGAN / TABUNGAN -->
    {#if activeSection === "keuangan"}
      <div class="card-glass page-box">
        <div class="segmented-control-bar">
          <button class="seg-btn" class:active={keuanganTab === "pemasukan"} on:click={() => (keuanganTab = "pemasukan")}>
            💰 Pemasukan (Kiriman)
          </button>
          <button class="seg-btn" class:active={keuanganTab === "pengeluaran"} on:click={() => (keuanganTab = "pengeluaran")}>
            💸 Pengeluaran (Belanja)
          </button>
        </div>

        <div class="page-header-flex">
          <div>
            <h2 class="page-title">{keuanganTab === "pemasukan" ? "Catatan Pemasukan Kas" : "Catatan Pengeluaran Kas"}</h2>
            <p class="page-subtitle">Rekam jejak keuangan pribadi santri secara real-time.</p>
          </div>
          <button class="btn-export-pill" on:click={() => exportCSV(activeEntries, keuanganTab)}>
            📥 Unduh CSV
          </button>
        </div>

        <div class="table-responsive-box">
          <table class="glass-table">
            <thead>
              <tr>
                <th>Deskripsi Transaksi</th>
                <th>Tanggal</th>
                <th class="text-right">Nominal</th>
              </tr>
            </thead>
            <tbody>
              {#if loadingEntries}
                <tr><td colspan="3" class="text-center-padded">Sinkronisasi data...</td></tr>
              {:else if activeEntries.length === 0}
                <tr><td colspan="3" class="text-center-padded">Belum ada riwayat {keuanganTab}.</td></tr>
              {:else}
                {#each activeEntries as item (item.id)}
                  <tr>
                    <td class="font-bold">{item.name}</td>
                    <td class="text-dim">{item.date}</td>
                    <td class="text-right font-bold {keuanganTab === 'pemasukan' ? 'text-blue' : 'text-rose'}">
                      {keuanganTab === "pemasukan" ? "+" : "-"} Rp {formatRupiah(item.amount)}
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>

        <div class="recap-total-strip {keuanganTab === 'pemasukan' ? 'bg-blue-glass' : 'bg-rose-glass'}">
          <span>Total {keuanganTab}:</span>
          <strong>Rp {formatRupiah(activeTotal)}</strong>
        </div>
      </div>
    {/if}

    <!-- SECTION: JADWAL -->
    {#if activeSection === "jadwal"}
      <div class="card-glass page-box">
        <h2 class="page-title">Jadwal Harian Santri</h2>
        <p class="page-subtitle">Rangkaian disiplin ibadah, belajar, dan ta'lim pondok pesantren.</p>

        <div class="timeline-stream">
          {#each jadwalList as item}
            <div class="timeline-row-card">
              <div class="timeline-chip">{item.hari}</div>
              <div class="timeline-content">
                <span class="timeline-activity">{item.kegiatan}</span>
                <span class="timeline-clock">⏰ {item.waktu}</span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- SECTION: PENGUMUMAN -->
    {#if activeSection === "pengumuman"}
      <div class="card-glass page-box">
        <div class="page-header-flex">
          <div>
            <h2 class="page-title">Maklumat & Warta Pesantren</h2>
            <p class="page-subtitle">Informasi resmi langsung dari sekretariat kepengurusan santri.</p>
          </div>
          <button class="btn-refresh-pill" on:click={loadPengumuman}>🔄 Perbarui</button>
        </div>

        {#if loadingPengumuman}
          <div class="skeleton-shimmer">Mengambil warta pengumuman...</div>
        {:else if pengumumanList.length === 0}
          <div class="empty-state-card"><p>Tidak ada pengumuman aktif saat ini.</p></div>
        {:else}
          <div class="announcement-stream">
            {#each pengumumanList as item (item.id)}
              <article class="announcement-glass-card">
                <div class="announcement-date">🗓️ {formatTanggal(item.created_at)}</div>
                <h3 class="announcement-heading">{item.title}</h3>
                <p class="announcement-body">{item.content}</p>
              </article>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- SECTION: RAPORT NILAI -->
    {#if activeSection === "nilai"}
      <div class="card-glass page-box">
        <div class="page-header-flex">
          <div>
            <h2 class="page-title">Transkrip Nilai Akademik</h2>
            <p class="page-subtitle">Penilaian kurikulum integrasi kepesantrenan dan formal.</p>
          </div>
          <div class="controls-toolbar">
            <select bind:value={selectedSemester} on:change={loadNilai} class="select-dropdown-glass" aria-label="Pilih semester">
              <option value={1}>Semester 1 (Ganjil)</option>
              <option value={2}>Semester 2 (Genap)</option>
            </select>
            <button class="btn-export-pill" on:click={downloadRaport} disabled={loadingNilai || nilaiList.length === 0}>
              📄 Raport Resmi
            </button>
          </div>
        </div>

        {#if loadingNilai}
          <div class="skeleton-shimmer">Mengalkulasi lembar raport...</div>
        {:else if nilaiList.length === 0}
          <div class="empty-state-card"><p>Belum ada rincian nilai untuk semester ini.</p></div>
        {:else}
          <div class="table-responsive-box">
            <table class="glass-table wide">
              <thead>
                <tr>
                  <th>Mata Pelajaran</th>
                  <th>PTS</th>
                  <th>PAS</th>
                  <th>Tugas</th>
                  <th>UH</th>
                  <th>Adab</th>
                  <th>Ujian Akhir</th>
                  <th>Nilai Akhir</th>
                </tr>
              </thead>
              <tbody>
                {#each nilaiList as item (item.id)}
                  <tr>
                    <td class="font-bold">{item.subject}</td>
                    <td>{item.nilai_pts ?? "-"}</td>
                    <td>{item.nilai_pas ?? "-"}</td>
                    <td>{item.nilai_tugas ?? "-"}</td>
                    <td>{item.nilai_ulangan_harian ?? "-"}</td>
                    <td>{item.nilai_sikap_karakter ?? "-"}</td>
                    <td>{item.nilai_ujian_sekolah ?? "-"}</td>
                    <td class="font-bold text-blue">{item.nilai_akhir ?? "-"}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {/if}

    <!-- SECTION: PRESTASI -->
    {#if activeSection === "prestasi"}
      <div class="card-glass page-box">
        <h2 class="page-title">Catatan Prestasi Santri</h2>
        <p class="page-subtitle">Jejak musabaqah dan kejuaraan yang mengharumkan nama pesantren.</p>

        <div class="achievement-stream">
          {#each prestasiList as item}
            <div class="achievement-glass-card">
              <div class="trophy-badge">🏆</div>
              <div class="achievement-meta">
                <h4 class="achievement-header">{item.judul}</h4>
                <p class="achievement-level">{item.tingkat} • Tahun {item.tahun}</p>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- SECTION: ABSENSI -->
    {#if activeSection === "absensi"}
      <div class="card-glass page-box">
        <h2 class="page-title">Presensi Kelas Formal</h2>
        <p class="page-subtitle">Riwayat kehadiran kegiatan belajar mengajar harian.</p>

        {#if loadingAbsensi}
          <div class="skeleton-shimmer">Memuat catatan kehadiran...</div>
        {:else if absensiList.length === 0}
          <div class="empty-state-card"><p>Belum ada catatan presensi kelas.</p></div>
        {:else}
          <div class="table-responsive-box">
            <table class="glass-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Status Presensi</th>
                </tr>
              </thead>
              <tbody>
                {#each absensiList as item (item.id)}
                  <tr>
                    <td>{formatTanggal(item.date)}</td>
                    <td>
                      <span class="badge-status-pill">{item.status || "Hadir"}</span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {/if}

    <!-- SECTION: NGAJI -->
    {#if activeSection === "ngaji"}
      <div class="card-glass page-box">
        <div class="page-header-flex">
          <div>
            <h2 class="page-title">Kehadiran Halaqah Al-Qur'an</h2>
            <p class="page-subtitle">Presensi scan barcode setoran dan tadarus bersama asatidz.</p>
          </div>
          <button class="btn-refresh-pill" on:click={loadNgajiAttendance} disabled={loadingNgajiAttendance}>
            {loadingNgajiAttendance ? "Memuat..." : "↻ Sinkron"}
          </button>
        </div>

        <div class="ngaji-metrics-row">
          <div class="metric-glass-tile">
            <strong>{ngajiAttendanceList.length}</strong>
            <span>Total Pertemuan</span>
          </div>
          <div class="metric-glass-tile highlight-blue">
            <strong>{ngajiHadir}</strong>
            <span>Hadir</span>
          </div>
          <div class="metric-glass-tile highlight-sky">
            <strong>{ngajiIzin}</strong>
            <span>Izin</span>
          </div>
          <div class="metric-glass-tile highlight-amber">
            <strong>{ngajiSakit}</strong>
            <span>Sakit</span>
          </div>
          <div class="metric-glass-tile highlight-rose">
            <strong>{ngajiAlpa}</strong>
            <span>Alpa</span>
          </div>
        </div>

        {#if loadingNgajiAttendance}
          <div class="skeleton-shimmer">Mengambil log kehadiran ngaji...</div>
        {:else if ngajiAttendanceList.length === 0}
          <div class="empty-state-card"><p>Belum ada rekaman kehadiran ngaji untuk akun santri ini.</p></div>
        {:else}
          <div class="table-responsive-box">
            <table class="glass-table wide">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Waktu Scan</th>
                  <th>Sesi</th>
                  <th>Status</th>
                  <th>Metode</th>
                  <th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                {#each ngajiAttendanceList as item (item.id)}
                  <tr>
                    <td>{formatTanggal(item.tanggal)}</td>
                    <td class="text-dim">{formatJamScan(item.jam_scan)}</td>
                    <td>#{item.session_id}</td>
                    <td>
                      <span class="status-chip {item.status}">
                        {item.status ? item.status.toUpperCase() : "-"}
                      </span>
                    </td>
                    <td>{item.metode || "QR Code"}</td>
                    <td class="text-dim">{item.keterangan || "-"}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {/if}

    <!-- SECTION: BARCODE / DIGITAL ID -->
    {#if activeSection === "barcode"}
      <div class="card-glass page-box text-center">
        <h2 class="page-title">Digital Identity Card Santri</h2>
        <p class="page-subtitle">Barcode dan identitas ini telah disinkronkan langsung dengan scanner di perangkat Ustadz.</p>

        <div class="digital-student-card">
          <div class="id-card-top-header">
            <div class="id-logo-stamp">MS</div>
            <div class="id-brand-text">
              <strong>MySantri Identity</strong>
              <small>Pondok Pesantren Daarulhikam</small>
            </div>
          </div>

          <div class="id-card-body-row">
            <div class="id-avatar-circle">
              {#if avatarUrl}
                <img src={avatarUrl} alt="Foto santri" />
              {:else}
                {initial}
              {/if}
            </div>
            <div class="id-text-info">
              <h3>{displayName}</h3>
              <div class="id-number">NIS: SANTRI-{user?.id}</div>
              <div class="id-class-badge">Halaqah / Kelas: <b>{kelasLabel}</b></div>
            </div>
          </div>

          <div class="qr-canvas-holder">
            <canvas id="santri-qr-main" aria-label="QR Code Identitas Santri"></canvas>
          </div>

          <!-- DETAIL KELAS & VERIFIKASI USTADZ -->
          <div class="qr-info-detail-box">
            <div class="detail-row">
              <span class="detail-label">Status Presensi:</span>
              <span class="detail-val text-blue">● Siap Scan</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Kelas Terdaftar:</span>
              <span class="detail-val"><b>{kelasLabel}</b></span>
            </div>
          </div>

          <div class="qr-security-footer">
            <span class="verified-icon">🛡️</span>
            <span>QR Terhubung Otomatis ke Sistem Scanner Ustadz</span>
          </div>
        </div>
      </div>
    {/if}
  </main>

  <!-- ================= FLOATING DOCK NAVBAR ================= -->
  <nav class="glass-floating-dock" aria-label="Navigasi Bawah">
    {#if activeSection === "home"}
      <button class="dock-btn is-active" aria-current="page">
        <svg class="dock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z"/>
        </svg>
        <span class="dock-label">Beranda</span>
      </button>
    {:else}
      <button class="dock-btn dock-btn-return" on:click={() => switchSection("home")}>
        <svg class="dock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M19 12H5m7 7l-7-7 7-7"/>
        </svg>
        <span class="dock-label">Kembali</span>
      </button>
    {/if}

    <button class="dock-btn" class:is-active={showSettings} on:click={() => (showSettings = true)}>
      <svg class="dock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="3" stroke-width="2"/>
        <path stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
      <span class="dock-label">Menu</span>
    </button>

    <button class="dock-btn" class:is-active={isSidebarOpen} on:click={() => (isSidebarOpen = true)}>
      {#if avatarUrl}
        <img src={avatarUrl} alt="" class="dock-avatar-img" />
      {:else}
        <svg class="dock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4" stroke-width="2"/>
        </svg>
      {/if}
      <span class="dock-label">Profil</span>
    </button>
  </nav>

  <!-- ================= SHEET SETTINGS / OPSI ================= -->
  {#if showSettings}
    <div class="sheet-modal-backdrop" role="presentation" on:click={() => (showSettings = false)}>
      <div class="sheet-glass-panel" role="dialog" aria-modal="true" on:click|stopPropagation>
        <div class="sheet-pill-handle"></div>
        <div class="sheet-panel-header">
          <h3>Pengaturan & Akses</h3>
          <button class="btn-close-circle" on:click={() => (showSettings = false)}>✕</button>
        </div>

        <div class="sheet-options-stack">
          <!-- THEME SWITCH TILE DI MODAL -->
          <button class="sheet-option-item" on:click={toggleTheme}>
            <span class="sheet-opt-icon">{isDarkMode ? "☀️" : "🌙"}</span>
            <div class="sheet-opt-text">
              <strong>Tampilan Aplikasi</strong>
              <small>Saat ini: Mode {isDarkMode ? "Malam (Dark)" : "Siang (Light)"}</small>
            </div>
            <span class="sheet-arrow">›</span>
          </button>

          <button class="sheet-option-item" on:click={openEditProfile}>
            <span class="sheet-opt-icon">👤</span>
            <div class="sheet-opt-text">
              <strong>Edit Akun Santri</strong>
              <small>Perbarui nama santri dan foto profil</small>
            </div>
            <span class="sheet-arrow">›</span>
          </button>

          <button class="sheet-option-item" on:click={() => { markAllRead(); showToast("Semua maklumat ditandai dibaca"); }}>
            <span class="sheet-opt-icon">🔔</span>
            <div class="sheet-opt-text">
              <strong>Pembersihan Notifikasi</strong>
              <small>{unreadCount > 0 ? `${unreadCount} belum dibaca` : "Semua sudah dibaca"}</small>
            </div>
            <span class="sheet-arrow">›</span>
          </button>

          <button class="sheet-option-item" on:click={openTopUp}>
            <span class="sheet-opt-icon">💳</span>
            <div class="sheet-opt-text">
              <strong>Nomor Rekening Pondok</strong>
              <small>Rekening resmi BSI & BRI pesantren</small>
            </div>
            <span class="sheet-arrow">›</span>
          </button>

          <button class="sheet-option-item danger" on:click={logout}>
            <span class="sheet-opt-icon">🚪</span>
            <div class="sheet-opt-text">
              <strong>Keluar dari Aplikasi</strong>
              <small>Akhiri sesi santri di perangkat ini</small>
            </div>
            <span class="sheet-arrow">›</span>
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ================= SIDEBAR EDIT PROFIL ================= -->
  {#if isSidebarOpen}
    <div class="drawer-modal-backdrop" role="presentation" on:click={() => (isSidebarOpen = false)}>
      <div class="drawer-glass-content" role="dialog" aria-modal="true" on:click|stopPropagation>
        <div class="drawer-header">
          <h3>Profil Santri</h3>
          <button class="btn-close-circle" on:click={() => (isSidebarOpen = false)}>✕</button>
        </div>

        <div class="drawer-profile-uploader">
          <div class="avatar-holder-lg">
            {#if avatarUrl}
              <img src={avatarUrl} alt="Pratinjau avatar" />
            {:else}
              <span class="avatar-lg-text">{initial}</span>
            {/if}
          </div>
          <label for="file-avatar-upload" class="btn-file-trigger">
            📷 Ganti Foto
            <input type="file" id="file-avatar-upload" accept="image/*" on:change={handleImageUpload} style="display:none;" />
          </label>
        </div>

        <div class="input-form-group">
          <label for="txt-nama-santri">Nama Lengkap Santri</label>
          <input id="txt-nama-santri" type="text" class="input-modern" bind:value={editNama} placeholder="Ketik nama lengkap..." />
        </div>

        <div class="input-form-group">
          <span class="input-static-label">Kelas Terdaftar</span>
          <div class="input-static-val">{kelasLabel}</div>
        </div>

        <button class="btn-action-primary" on:click={saveProfile}>Simpan Pembaruan</button>
      </div>
    </div>
  {/if}

  <!-- ================= MODAL TOP UP & REKENING ================= -->
  {#if showTransferModal}
    <div class="sheet-modal-backdrop modal-center" role="presentation" on:click={() => (showTransferModal = false)}>
      <div class="modal-glass-box" role="dialog" aria-modal="true" on:click|stopPropagation>
        <div class="sheet-panel-header">
          <h3>Pembayaran & Transfer</h3>
          <button class="btn-close-circle" on:click={() => (showTransferModal = false)}>✕</button>
        </div>

        <div class="student-ref-banner">
          <div class="ref-icon">🪪</div>
          <div class="ref-body">
            <span>Referensi Identitas Santri</span>
            <strong>{displayName}</strong>
            <small>ID Unik: SANTRI-{user?.id} • Kelas: {kelasLabel}</small>
          </div>
        </div>

        <p class="dialog-instruction">
          Kirimkan dana SPP atau uang saku ke rekening resmi pesantren. Cantumkan ID santri pada berita transfer agar otomatis diverifikasi.
        </p>

        <div class="rekening-cards-stack">
          {#each REKENING as rek (rek.nomor)}
            <div class="bank-glass-tile">
              <div class="bank-meta-top">
                <span class="bank-tag-badge bank-{rek.tone}">{rek.kode}</span>
                <div class="bank-name-wrap">
                  <strong>{rek.nama}</strong>
                  {#if rek.pemilik}<small>a.n {rek.pemilik}</small>{/if}
                </div>
              </div>
              <div class="bank-digits-row">
                <span class="digits-number">{rek.nomor}</span>
                <button class="btn-copy-chip" on:click={() => copyRekening(rek.nomor)}>📋 Salin</button>
              </div>
            </div>
          {/each}
        </div>

        <button class="btn-action-primary" on:click={() => (showTransferModal = false)}>Tutup</button>
      </div>
    </div>
  {/if}

  <!-- ================= TOAST NOTIFICATION ================= -->
  {#if toast}
    <div class="floating-glass-toast" role="status">{toast}</div>
  {/if}
</div>

<style>
  @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");

  /* ================= MODERN DESIGN TOKENS (SAPPHIRE & ROYAL BLUE) ================= */
  :global(:root) {
    --bg-base: #f1f5fb;
    --surface-glass: rgba(255, 255, 255, 0.88);
    --surface-card: #ffffff;
    --surface-subtle: #f8fafc;
    --border-glass: rgba(219, 234, 254, 0.85);
    --border-subtle: #e2e8f0;
    --text-main: #0f172a;
    --text-muted: #64748b;
    --text-dim: #94a3b8;

    --brand-primary: #1d4ed8;       /* Royal Blue */
    --brand-secondary: #0284c7;     /* Sky Blue */
    --brand-accent: #3b82f6;        /* Bright Blue */
    --brand-gradient: linear-gradient(135deg, #1d4ed8 0%, #0284c7 100%);
    --card-gradient: linear-gradient(135deg, #1e3a8a 0%, #0369a1 100%);

    --state-success: #10b981;
    --state-success-soft: rgba(16, 185, 129, 0.12);
    --state-danger: #f43f5e;
    --state-danger-soft: rgba(244, 63, 94, 0.12);

    --glass-blur: blur(16px);
    --shadow-sm: 0 2px 8px -2px rgba(29, 78, 216, 0.08);
    --shadow-md: 0 10px 25px -5px rgba(29, 78, 216, 0.1);
    --shadow-lg: 0 20px 35px -8px rgba(29, 78, 216, 0.16);
  }

  /* ================= MODE MALAM (DARK THEME) ================= */
  :global(html.dark),
  .modern-app.dark {
    --bg-base: #070d18;
    --surface-glass: rgba(15, 23, 42, 0.82);
    --surface-card: #0f172a;
    --surface-subtle: #172339;
    --border-glass: rgba(255, 255, 255, 0.08);
    --border-subtle: #1e293b;
    --text-main: #f8fafc;
    --text-muted: #94a3b8;
    --text-dim: #64748b;

    --brand-primary: #3b82f6;
    --brand-secondary: #38bdf8;
    --brand-gradient: linear-gradient(135deg, #2563eb 0%, #0284c7 100%);
    --card-gradient: linear-gradient(135deg, #172554 0%, #0c4a6e 100%);

    --shadow-sm: 0 2px 10px rgba(0, 0, 0, 0.4);
    --shadow-md: 0 10px 25px rgba(0, 0, 0, 0.5);
    --shadow-lg: 0 20px 40px rgba(0, 0, 0, 0.7);
  }

  /* BASE RESET */
  .modern-app {
    min-height: 100vh;
    min-height: 100dvh;
    background-color: var(--bg-base);
    color: var(--text-main);
    font-family: "Plus Jakarta Sans", system-ui, -apple-system, sans-serif;
    position: relative;
    overflow-x: hidden;
    padding-bottom: calc(105px + env(safe-area-inset-bottom, 0px));
    transition: background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s ease;
  }

  .modern-app *,
  .modern-app *::before,
  .modern-app *::after { box-sizing: border-box; }

  /* AMBIENT GLOWS */
  .ambient-glow {
    position: fixed;
    border-radius: 50%;
    filter: blur(100px);
    pointer-events: none;
    z-index: 0;
    opacity: 0.45;
  }
  .glow-1 { top: -100px; left: -100px; width: 400px; height: 400px; background: rgba(37, 99, 235, 0.22); }
  .glow-2 { top: 250px; right: -120px; width: 380px; height: 380px; background: rgba(2, 132, 199, 0.2); }

  /* TOPBAR HEADER */
  .app-topbar {
    position: sticky;
    top: 0;
    z-index: 800;
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    background: var(--surface-glass);
    border-bottom: 1px solid var(--border-glass);
    padding: 14px 20px;
    transition: background 0.3s ease, border-color 0.3s ease;
  }
  .topbar-container {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .user-profile-meta { display: flex; align-items: center; gap: 14px; }

  .avatar-interactive {
    position: relative;
    border: none;
    background: none;
    padding: 0;
    cursor: pointer;
  }
  .avatar-face,
  .avatar-fallback {
    width: 46px;
    height: 46px;
    border-radius: 14px;
    object-fit: cover;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
  }
  .avatar-fallback {
    background: var(--brand-gradient);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.15rem;
    font-weight: 800;
  }
  .avatar-badge-online {
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 12px;
    height: 12px;
    background: #3b82f6;
    border: 2px solid var(--surface-card);
    border-radius: 50%;
  }

  .user-greeting-block { display: flex; flex-direction: column; }
  .greeting-subtitle { font-size: 0.76rem; color: var(--text-muted); font-weight: 600; }
  .user-heading {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--text-main);
  }
  .header-class-chip {
    font-size: 0.72rem;
    color: var(--brand-primary);
    font-weight: 650;
    margin-top: 2px;
  }

  .topbar-actions { display: flex; align-items: center; gap: 10px; }

  .icon-action-btn {
    position: relative;
    width: 42px;
    height: 42px;
    border-radius: 12px;
    border: 1px solid var(--border-glass);
    background: var(--surface-card);
    color: var(--text-main);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    transition: transform 0.2s, background 0.2s, border-color 0.2s;
  }
  .icon-action-btn:hover { transform: translateY(-2px); border-color: var(--brand-primary); }
  .action-svg { width: 20px; height: 20px; stroke: currentColor; }
  .sun-icon { color: #f59e0b; }
  .moon-icon { color: #38bdf8; }

  .notif-counter-pill {
    position: absolute;
    top: -4px;
    right: -4px;
    background: var(--state-danger);
    color: #fff;
    font-size: 0.65rem;
    font-weight: 800;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--surface-card);
  }

  /* DROPDOWN NOTIF */
  .notif-anchor { position: relative; }
  .notif-dismiss-backdrop { position: fixed; inset: 0; z-index: 850; background: transparent; border: 0; }
  .notif-dropdown-card {
    position: absolute;
    top: calc(100% + 12px);
    right: 0;
    width: min(380px, 90vw);
    max-height: 460px;
    background: var(--surface-card);
    border: 1px solid var(--border-glass);
    border-radius: 20px;
    box-shadow: var(--shadow-lg);
    z-index: 900;
    overflow: hidden;
    animation: fadeScale 0.2s ease both;
  }
  .notif-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border-glass);
    background: var(--surface-subtle);
  }
  .notif-card-header h4 { margin: 0; font-size: 0.95rem; font-weight: 800; }
  .notif-card-header p { margin: 2px 0 0; font-size: 0.72rem; color: var(--text-muted); }
  .btn-text-read { background: none; border: none; color: var(--brand-primary); font-size: 0.75rem; font-weight: 700; cursor: pointer; }
  .notif-scroll-pane { max-height: 380px; overflow-y: auto; }
  .notif-tile {
    width: 100%;
    padding: 12px 16px;
    display: flex;
    gap: 12px;
    border: none;
    border-bottom: 1px solid var(--border-glass);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .notif-tile.is-unread { background: rgba(37, 99, 235, 0.08); }
  .notif-glow-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--brand-primary); margin-top: 6px; flex-shrink: 0; }
  .notif-tile-body h5 { margin: 0 0 2px; font-size: 0.86rem; font-weight: 700; color: var(--text-main); }
  .notif-tile-body p { margin: 0 0 4px; font-size: 0.76rem; color: var(--text-muted); line-height: 1.4; }
  .notif-tile-body time { font-size: 0.68rem; color: var(--text-dim); }

  /* MAIN CONTENT LAYOUT */
  .app-main-content {
    max-width: 1200px;
    margin: 20px auto 0;
    padding: 0 16px;
    position: relative;
    z-index: 1;
  }

  /* GLASS CARD BASE */
  .card-glass {
    background: var(--surface-card);
    border: 1px solid var(--border-glass);
    border-radius: 24px;
    box-shadow: var(--shadow-sm);
    padding: 24px;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  /* HERO BALANCE SECTION */
  .hero-balance-row {
    display: grid;
    grid-template-columns: 1fr;
    gap: 18px;
    margin-bottom: 20px;
  }
  .quick-summary-desktop { display: none; }

  .card-glass-balance {
    position: relative;
    overflow: hidden;
    background: var(--card-gradient);
    border-radius: 26px;
    padding: 26px 24px;
    color: #ffffff;
    box-shadow: 0 14px 30px -10px rgba(37, 99, 235, 0.45);
  }
  .card-circle-glow {
    position: absolute;
    right: -40px;
    top: -40px;
    width: 220px;
    height: 220px;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.25) 0%, transparent 70%);
    pointer-events: none;
  }
  .balance-card-inner { position: relative; z-index: 2; }
  .balance-header-tag { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .chip-balance {
    font-size: 0.76rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: rgba(255, 255, 255, 0.18);
    padding: 4px 10px;
    border-radius: 8px;
  }
  .chip-class { font-size: 0.82rem; opacity: 0.95; }

  .balance-figure-area { display: flex; align-items: baseline; gap: 6px; margin: 8px 0 20px; }
  .currency-tag { font-size: 1.3rem; font-weight: 700; color: rgba(255, 255, 255, 0.8); }
  .nominal-tag { font-size: clamp(2rem, 5vw, 2.6rem); font-weight: 800; letter-spacing: -0.02em; }

  .balance-actions-toolbar { display: flex; gap: 10px; flex-wrap: wrap; }
  .balance-quick-btn {
    flex: 1;
    min-width: 140px;
    background: rgba(255, 255, 255, 0.95);
    color: #1e3a8a;
    border: none;
    border-radius: 12px;
    padding: 12px 16px;
    font-weight: 750;
    font-size: 0.85rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: transform 0.15s, background 0.15s;
  }
  .balance-quick-btn:hover { transform: translateY(-2px); background: #ffffff; }
  .btn-secondary-action {
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }
  .btn-secondary-action:hover { background: rgba(255, 255, 255, 0.28); }

  /* CASHFLOW STATS */
  .card-mini-title { margin: 0 0 16px; font-size: 0.96rem; font-weight: 750; }
  .quick-cashflow-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .cash-stat-card {
    padding: 16px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid var(--border-glass);
  }
  .in-card { background: rgba(59, 130, 246, 0.1); }
  .out-card { background: var(--state-danger-soft); }
  .stat-indicator {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    font-weight: 800;
  }
  .stat-indicator.in { background: #2563eb; color: #fff; }
  .stat-indicator.out { background: #f43f5e; color: #fff; }
  .stat-meta-label { font-size: 0.74rem; color: var(--text-muted); display: block; }
  .stat-meta-val { font-size: 0.95rem; font-weight: 800; margin-top: 2px; display: block; }

  /* DASHBOARD CORE LAYOUT */
  .core-dashboard-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 20px;
    margin-bottom: 20px;
  }
  .section-title-wrap {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 18px;
  }
  .section-title-wrap h3 { margin: 0; font-size: 1.05rem; font-weight: 800; }
  .badge-subtle { font-size: 0.72rem; color: var(--brand-primary); font-weight: 700; background: rgba(37, 99, 235, 0.1); padding: 4px 8px; border-radius: 6px; }

  /* SERVICES GRID */
  .services-app-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .service-app-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    background: var(--surface-subtle);
    border: 1px solid var(--border-glass);
    border-radius: 16px;
    padding: 14px 6px;
    cursor: pointer;
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s;
  }
  .service-app-tile:hover {
    transform: translateY(-4px);
    background: var(--surface-card);
    border-color: var(--brand-primary);
    box-shadow: var(--shadow-md);
  }
  .app-icon-pod {
    width: 44px;
    height: 44px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.3rem;
    position: relative;
  }
  .tone-blue { background: rgba(37, 99, 235, 0.15); }
  .tone-sky { background: rgba(2, 132, 199, 0.15); }
  .tone-indigo { background: rgba(79, 70, 229, 0.15); }
  .tone-cyan { background: rgba(6, 182, 212, 0.15); }
  .tone-amber { background: rgba(245, 158, 11, 0.15); }
  .tone-yellow { background: rgba(234, 179, 8, 0.15); }
  .tone-purple { background: rgba(168, 85, 247, 0.15); }
  .tone-rose { background: rgba(244, 63, 94, 0.15); }

  .service-pulse-dot {
    position: absolute;
    top: -2px;
    right: -2px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--state-danger);
    box-shadow: 0 0 0 3px var(--surface-card);
  }
  .app-tile-name {
    font-size: 0.74rem;
    font-weight: 700;
    color: var(--text-main);
    text-align: center;
    line-height: 1.2;
  }

  /* TRANSAKSI TERAKHIR */
  .recent-records-flow { display: flex; flex-direction: column; gap: 8px; }
  .tx-card-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--surface-subtle);
    border-radius: 14px;
    border: 1px solid var(--border-glass);
  }
  .tx-badge {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
  }
  .tx-badge-in { background: rgba(37, 99, 235, 0.12); color: var(--brand-primary); }
  .tx-badge-out { background: var(--state-danger-soft); color: var(--state-danger); }
  .tx-details { flex: 1; min-width: 0; }
  .tx-name { font-size: 0.86rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tx-time { font-size: 0.72rem; color: var(--text-dim); }
  .tx-sum { font-size: 0.88rem; font-weight: 800; font-variant-numeric: tabular-nums; }
  .link-more-btn { background: none; border: none; color: var(--brand-secondary); font-size: 0.78rem; font-weight: 750; cursor: pointer; }

  /* BANNER SLIDER */
  .card-glass-banner-slider {
    border-radius: 24px;
    overflow: hidden;
    position: relative;
    background: #0b192c;
    box-shadow: var(--shadow-md);
  }
  .slider-canvas {
    position: relative;
    min-height: 220px;
    width: 100%;
  }
  .slider-frame {
    position: absolute;
    inset: 0;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.5s ease;
  }
  .slider-frame.is-active { opacity: 1; visibility: visible; }
  .slider-backdrop-img { width: 100%; height: 100%; object-fit: cover; }
  .slider-scrim-gradient {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, rgba(11, 25, 44, 0.95) 0%, rgba(11, 25, 44, 0.6) 60%, rgba(11, 25, 44, 0.2) 100%);
  }
  .slider-caption-body {
    position: absolute;
    inset: 0;
    padding: 24px 30px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    color: #fff;
    max-width: 580px;
  }
  .slider-pill {
    background: rgba(59, 130, 246, 0.3);
    color: #93c5fd;
    border: 1px solid rgba(59, 130, 246, 0.5);
    font-size: 0.68rem;
    font-weight: 800;
    padding: 3px 10px;
    border-radius: 999px;
  }
  .slider-headline { margin: 8px 0 4px; font-size: 1.3rem; font-weight: 800; color: #fff; }
  .slider-summary { margin: 0 0 14px; font-size: 0.84rem; opacity: 0.9; line-height: 1.5; }
  .slider-cta-btn {
    background: #fff;
    color: #1e3a8a;
    border: none;
    padding: 8px 16px;
    border-radius: 999px;
    font-weight: 750;
    font-size: 0.8rem;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }
  .slider-arrow-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(15, 23, 42, 0.5);
    backdrop-filter: blur(8px);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.3);
    font-size: 1.3rem;
    cursor: pointer;
    display: grid;
    place-items: center;
    z-index: 5;
  }
  .nav-prev { left: 12px; }
  .nav-next { right: 12px; }
  .slider-bullet-indicators {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 6px;
    z-index: 5;
  }
  .bullet-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    border: none;
    background: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    transition: width 0.3s, background 0.3s;
  }
  .bullet-dot.is-active { width: 22px; background: #38bdf8; }

  /* SEGMENTED BAR */
  .segmented-control-bar {
    display: flex;
    background: var(--surface-subtle);
    border: 1px solid var(--border-glass);
    border-radius: 14px;
    padding: 4px;
    gap: 4px;
    margin-bottom: 20px;
    overflow-x: auto;
  }
  .seg-btn {
    flex: 1;
    border: none;
    background: transparent;
    padding: 9px 14px;
    border-radius: 10px;
    font-size: 0.82rem;
    font-weight: 750;
    color: var(--text-muted);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s ease;
  }
  .seg-btn.active {
    background: var(--surface-card);
    color: var(--brand-primary);
    box-shadow: var(--shadow-sm);
  }

  /* SPP STYLE */
  .spp-overview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px; }
  .spp-kpi-card {
    padding: 16px;
    border-radius: 16px;
    border: 1px solid var(--border-glass);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .kpi-paid { background: rgba(37, 99, 235, 0.1); }
  .kpi-unpaid { background: var(--state-danger-soft); }
  .kpi-label { font-size: 0.74rem; font-weight: 650; color: var(--text-muted); }
  .kpi-value { font-size: 1.15rem; font-weight: 800; }

  .spp-cards-stream { display: flex; flex-direction: column; gap: 10px; }
  .spp-entry-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-radius: 16px;
    background: var(--surface-subtle);
    border: 1px solid var(--border-glass);
    border-left: 5px solid var(--state-danger);
  }
  .spp-entry-card.is-paid { border-left-color: var(--brand-primary); }
  .spp-title { font-size: 0.98rem; font-weight: 750; }
  .badge-status-paid { color: var(--brand-primary); font-size: 0.76rem; font-weight: 750; }
  .badge-status-unpaid { color: var(--state-danger); font-size: 0.76rem; font-weight: 700; }
  .btn-spp-action {
    background: var(--brand-gradient);
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: 8px 14px;
    font-weight: 750;
    font-size: 0.8rem;
    cursor: pointer;
  }

  /* GLASS TABLE */
  .table-responsive-box {
    overflow-x: auto;
    border: 1px solid var(--border-glass);
    border-radius: 16px;
    background: var(--surface-card);
  }
  .glass-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left; }
  .glass-table th {
    background: var(--surface-subtle);
    padding: 12px 16px;
    font-size: 0.76rem;
    font-weight: 750;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border-glass);
    white-space: nowrap;
  }
  .glass-table td { padding: 13px 16px; border-bottom: 1px solid var(--border-glass); font-variant-numeric: tabular-nums; }
  .glass-table tr:hover { background: var(--surface-subtle); }
  .recap-total-strip {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 20px;
    border-radius: 14px;
    margin-top: 14px;
    font-weight: 800;
  }
  .bg-blue-glass { background: rgba(37, 99, 235, 0.12); color: var(--brand-primary); }
  .bg-rose-glass { background: var(--state-danger-soft); color: var(--state-danger); }

  /* JADWAL, ANNOUNCEMENT, PRESTASI */
  .timeline-stream,
  .announcement-stream,
  .achievement-stream { display: flex; flex-direction: column; gap: 10px; }
  .timeline-row-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 18px;
    background: var(--surface-subtle);
    border-radius: 14px;
    border: 1px solid var(--border-glass);
  }
  .timeline-chip {
    background: var(--brand-gradient);
    color: #fff;
    font-size: 0.72rem;
    font-weight: 750;
    padding: 6px 12px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .timeline-activity { font-size: 0.92rem; font-weight: 750; display: block; }
  .timeline-clock { font-size: 0.78rem; color: var(--text-muted); }

  .announcement-glass-card {
    padding: 18px 20px;
    background: var(--surface-subtle);
    border: 1px solid var(--border-glass);
    border-left: 4px solid var(--brand-primary);
    border-radius: 16px;
  }
  .announcement-date { font-size: 0.72rem; color: var(--text-dim); font-weight: 700; margin-bottom: 6px; }
  .announcement-heading { margin: 0 0 6px; font-size: 1.05rem; font-weight: 800; }
  .announcement-body { margin: 0; font-size: 0.85rem; color: var(--text-muted); line-height: 1.6; white-space: pre-wrap; }

  .achievement-glass-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 20px;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.12), transparent 70%), var(--surface-subtle);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 16px;
  }
  .trophy-badge { font-size: 2rem; }
  .achievement-header { margin: 0 0 2px; font-size: 0.96rem; font-weight: 800; color: #1d4ed8; }
  .achievement-level { margin: 0; font-size: 0.78rem; color: var(--text-muted); }

  /* NGAJI METRICS */
  .ngaji-metrics-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 10px;
    margin-bottom: 18px;
  }
  .metric-glass-tile {
    padding: 14px;
    border-radius: 14px;
    border: 1px solid var(--border-glass);
    background: var(--surface-subtle);
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .metric-glass-tile strong { font-size: 1.3rem; font-weight: 800; }
  .metric-glass-tile span { font-size: 0.72rem; color: var(--text-muted); }
  .status-chip { padding: 4px 10px; border-radius: 6px; font-weight: 800; font-size: 0.7rem; }
  .status-chip.hadir { background: rgba(37, 99, 235, 0.15); color: var(--brand-primary); }
  .status-chip.izin { background: rgba(2, 132, 199, 0.15); color: #0284c7; }
  .status-chip.sakit { background: rgba(245, 158, 11, 0.15); color: #d97706; }
  .status-chip.alpa { background: var(--state-danger-soft); color: var(--state-danger); }

  /* DIGITAL CARD & QR SCANNER USTADZ COMPATIBLE */
  .digital-student-card {
    max-width: 390px;
    margin: 20px auto 0;
    background: var(--surface-card);
    border: 1px solid var(--border-glass);
    border-radius: 26px;
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    text-align: left;
  }
  .id-card-top-header {
    background: var(--card-gradient);
    color: #fff;
    padding: 16px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .id-logo-stamp {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
  }
  .id-brand-text strong { display: block; font-size: 0.95rem; }
  .id-brand-text small { font-size: 0.72rem; opacity: 0.85; }

  .id-card-body-row { display: flex; align-items: center; gap: 14px; padding: 18px 20px 10px; }
  .id-avatar-circle {
    width: 58px;
    height: 58px;
    border-radius: 18px;
    background: rgba(37, 99, 235, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
    font-weight: 800;
    overflow: hidden;
    color: var(--brand-primary);
  }
  .id-avatar-circle img { width: 100%; height: 100%; object-fit: cover; }
  .id-text-info h3 { margin: 0 0 2px; font-size: 1.05rem; font-weight: 800; }
  .id-number { font-size: 0.78rem; color: var(--text-muted); font-weight: 600; }
  .id-class-badge {
    display: inline-block;
    margin-top: 4px;
    background: rgba(37, 99, 235, 0.12);
    color: var(--brand-primary);
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 0.74rem;
    font-weight: 750;
  }

  .qr-canvas-holder {
    background: #ffffff;
    padding: 16px;
    margin: 12px 20px;
    border-radius: 20px;
    border: 1px dashed var(--border-subtle);
    display: flex;
    justify-content: center;
  }

  .qr-info-detail-box {
    margin: 4px 20px 10px;
    padding: 12px 14px;
    background: var(--surface-subtle);
    border: 1px solid var(--border-glass);
    border-radius: 12px;
  }
  .detail-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    padding: 3px 0;
  }
  .detail-label { color: var(--text-muted); font-weight: 600; }
  .detail-val { font-weight: 750; }

  .qr-security-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 20px 18px;
    font-size: 0.74rem;
    font-weight: 700;
    color: var(--brand-primary);
  }

  /* FLOATING DOCK BOTTOM NAVBAR */
  .glass-floating-dock {
    position: fixed;
    bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    left: 50%;
    transform: translateX(-50%);
    z-index: 900;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px;
    background: var(--surface-glass);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--border-glass);
    border-radius: 999px;
    box-shadow: var(--shadow-lg);
  }
  .dock-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border: none;
    background: transparent;
    border-radius: 999px;
    color: var(--text-muted);
    font-weight: 750;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .dock-btn:hover { color: var(--text-main); background: var(--surface-subtle); }
  .dock-btn.is-active {
    background: var(--brand-gradient);
    color: #ffffff;
    box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
  }
  .dock-btn-return {
    background: var(--surface-card);
    color: var(--text-main);
    border: 1px solid var(--border-glass);
  }
  .dock-icon { width: 20px; height: 20px; }
  .dock-avatar-img { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; }

  /* MODAL & DRAWER OVERLAYS */
  .sheet-modal-backdrop,
  .drawer-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(9, 13, 22, 0.65);
    backdrop-filter: blur(8px);
    z-index: 1000;
    display: flex;
  }
  .sheet-modal-backdrop { align-items: flex-end; justify-content: center; }
  .modal-center { align-items: center; }

  .sheet-glass-panel,
  .modal-glass-box {
    width: 100%;
    max-width: 500px;
    background: var(--surface-card);
    border: 1px solid var(--border-glass);
    border-radius: 28px 28px 0 0;
    box-shadow: var(--shadow-lg);
    padding: 24px;
    animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .modal-glass-box { border-radius: 28px; max-height: 90vh; overflow-y: auto; margin: 16px; }

  .sheet-pill-handle { width: 44px; height: 4px; background: var(--border-subtle); border-radius: 999px; margin: 0 auto 16px; }
  .sheet-panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
  .sheet-panel-header h3 { margin: 0; font-size: 1.1rem; font-weight: 800; }
  .btn-close-circle {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--surface-subtle);
    color: var(--text-muted);
    cursor: pointer;
    font-weight: 700;
  }

  .sheet-options-stack { display: flex; flex-direction: column; gap: 8px; }
  .sheet-option-item {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 13px 16px;
    border-radius: 14px;
    background: var(--surface-subtle);
    border: 1px solid var(--border-glass);
    color: var(--text-main);
    text-align: left;
    cursor: pointer;
    transition: background 0.15s, transform 0.15s;
  }
  .sheet-option-item:hover { background: var(--border-glass); transform: translateX(3px); }
  .sheet-opt-icon { font-size: 1.25rem; }
  .sheet-opt-text { flex: 1; display: flex; flex-direction: column; }
  .sheet-opt-text strong { font-size: 0.88rem; font-weight: 750; }
  .sheet-opt-text small { font-size: 0.72rem; color: var(--text-muted); }
  .sheet-arrow { font-size: 1.3rem; color: var(--text-dim); }
  .sheet-option-item.danger strong { color: var(--state-danger); }

  /* DRAWER SIDEBAR */
  .drawer-modal-backdrop { justify-content: flex-end; }
  .drawer-glass-content {
    width: 360px;
    max-width: 90%;
    height: 100%;
    background: var(--surface-card);
    border-left: 1px solid var(--border-glass);
    padding: 24px;
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    animation: slideLeft 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .drawer-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
  .drawer-header h3 { margin: 0; font-size: 1.15rem; font-weight: 800; }
  .drawer-profile-uploader { display: flex; flex-direction: column; align-items: center; gap: 14px; margin-bottom: 24px; }
  .avatar-holder-lg {
    width: 96px;
    height: 96px;
    border-radius: 28px;
    overflow: hidden;
    background: var(--brand-gradient);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--shadow-md);
  }
  .avatar-holder-lg img { width: 100%; height: 100%; object-fit: cover; }
  .avatar-lg-text { font-size: 2.2rem; font-weight: 800; color: #fff; }
  .btn-file-trigger {
    background: var(--surface-subtle);
    border: 1px solid var(--border-glass);
    padding: 8px 16px;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 750;
    cursor: pointer;
  }

  .input-form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; }
  .input-form-group label, .input-static-label { font-size: 0.78rem; font-weight: 700; color: var(--text-muted); }
  .input-static-val {
    background: var(--surface-subtle);
    border: 1px solid var(--border-glass);
    border-radius: 12px;
    padding: 12px 14px;
    font-size: 0.88rem;
    font-weight: 750;
    color: var(--brand-primary);
  }
  .input-modern,
  .select-dropdown-glass {
    background: var(--surface-subtle);
    border: 1px solid var(--border-glass);
    border-radius: 12px;
    padding: 12px 14px;
    color: var(--text-main);
    font-size: 0.88rem;
    font-family: inherit;
    outline: none;
  }
  .input-modern:focus,
  .select-dropdown-glass:focus { border-color: var(--brand-primary); }

  .btn-action-primary,
  .btn-modern-primary {
    background: var(--brand-gradient);
    color: #fff;
    border: none;
    border-radius: 14px;
    padding: 12px 20px;
    font-weight: 750;
    font-size: 0.88rem;
    cursor: pointer;
    box-shadow: 0 6px 18px rgba(37, 99, 235, 0.35);
  }
  .btn-action-primary { width: 100%; }

  .btn-export-pill,
  .btn-refresh-pill {
    background: var(--surface-subtle);
    border: 1px solid var(--border-glass);
    color: var(--text-main);
    padding: 8px 14px;
    border-radius: 10px;
    font-size: 0.78rem;
    font-weight: 750;
    cursor: pointer;
  }

  /* REKENING TOPUP */
  .student-ref-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: rgba(37, 99, 235, 0.1);
    border-radius: 14px;
    margin-bottom: 14px;
  }
  .ref-icon { font-size: 1.5rem; }
  .ref-body span { font-size: 0.72rem; color: var(--brand-primary); display: block; }
  .ref-body strong { font-size: 0.95rem; }
  .dialog-instruction { font-size: 0.82rem; color: var(--text-muted); line-height: 1.5; margin: 0 0 16px; }

  .rekening-cards-stack { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
  .bank-glass-tile {
    padding: 14px 16px;
    background: var(--surface-subtle);
    border: 1px solid var(--border-glass);
    border-radius: 14px;
  }
  .bank-meta-top { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .bank-tag-badge {
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 0.72rem;
    font-weight: 800;
    color: #fff;
  }
  .bank-bsi { background: #00a39d; }
  .bank-bri { background: #00529c; }
  .bank-name-wrap strong { display: block; font-size: 0.88rem; }
  .bank-name-wrap small { font-size: 0.7rem; color: var(--text-muted); }
  .bank-digits-row { display: flex; justify-content: space-between; align-items: center; }
  .digits-number { font-size: 1.1rem; font-weight: 800; letter-spacing: 0.05em; font-variant-numeric: tabular-nums; }
  .btn-copy-chip {
    background: var(--surface-card);
    border: 1px solid var(--border-glass);
    color: var(--brand-primary);
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 0.74rem;
    font-weight: 750;
    cursor: pointer;
  }

  /* TOAST */
  .floating-glass-toast {
    position: fixed;
    bottom: calc(90px + env(safe-area-inset-bottom, 0px));
    left: 50%;
    transform: translateX(-50%);
    background: rgba(15, 23, 42, 0.92);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #fff;
    padding: 10px 18px;
    border-radius: 999px;
    font-size: 0.82rem;
    font-weight: 700;
    z-index: 1200;
    box-shadow: var(--shadow-lg);
    animation: toastUp 0.25s ease both;
  }

  /* UTILITY & ANIMATIONS */
  .text-blue { color: var(--brand-primary); }
  .text-rose { color: var(--state-danger); }
  .text-dim { color: var(--text-dim); }
  .font-bold { font-weight: 750; }
  .text-center-padded { text-align: center; padding: 24px; color: var(--text-muted); }
  .skeleton-shimmer { text-align: center; padding: 24px; color: var(--text-dim); font-size: 0.85rem; }
  .empty-state-card { text-align: center; padding: 32px 16px; color: var(--text-muted); font-size: 0.88rem; }
  .empty-ico { font-size: 1.8rem; margin-bottom: 6px; display: block; }

  @keyframes fadeScale { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
  @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @keyframes slideLeft { from { transform: translateX(100%); } to { transform: translateX(0); } }
  @keyframes toastUp { from { opacity: 0; transform: translate(-50%, 15px); } to { opacity: 1; transform: translate(-50%, 0); } }

  /* RESPONSIVE LAYOUT */
  @media (min-width: 768px) {
    .hero-balance-row { grid-template-columns: 1.4fr 1fr; }
    .quick-summary-desktop { display: block; }
    .core-dashboard-grid { grid-template-columns: 1.4fr 1fr; }
    .services-app-grid { grid-template-columns: repeat(5, 1fr); }
    .page-header-flex { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
  }

  @media (max-width: 599px) {
    .services-app-grid { grid-template-columns: repeat(3, 1fr); }
    .app-topbar { padding: 12px 16px; }
    .card-glass { padding: 18px; border-radius: 20px; }
    .dock-label { display: none; }
    .dock-btn.is-active .dock-label { display: inline-block; }
  }
</style>