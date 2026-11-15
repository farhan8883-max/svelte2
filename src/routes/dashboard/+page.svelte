<script lang="ts">
  import { supabase } from "$lib/supabaseClient";
  import { onMount, onDestroy, tick } from "svelte";
  import { goto } from "$app/navigation";
  import * as XLSX from "xlsx";

  /* =========================
     TYPES
  ========================= */

  type Role = "admin" | "santri" | "ustad";
  type Theme = "light" | "dark";
  type AttStatus = "hadir" | "izin" | "sakit" | "alpha";

  interface User {
    id: number;
    full_name: string;
    username: string;
    email: string;
    role: Role;
    class_name: string | null;
    class_id: number | null;
  }

  interface UserClass { id: number; name: string }

  interface PendaftaranSantri {
    id: number;
    nama_santri: string;
    tempat_lahir: string | null;
    tanggal_lahir: string | null;
    jenis_kelamin: string | null;
    nik: string | null;
    nisn: string | null;
    alamat: string | null;
    rt: string | null;
    rw: string | null;
    nama_perumahan: string | null;
    nama_kelurahan: string | null;
    nama_kecamatan: string | null;
    hp_santri: string | null;
    nama_ayah: string | null;
    tahun_ayah: number | null;
    pendidikan_ayah: string | null;
    pekerjaan_ayah: string | null;
    penghasilan_ayah: string | null;
    hp_ayah: string | null;
    nama_ibu: string | null;
    tahun_ibu: number | null;
    pendidikan_ibu: string | null;
    pekerjaan_ibu: string | null;
    penghasilan_ibu: string | null;
    hp_ibu: string | null;
    nama_wali: string | null;
    tahun_wali: number | null;
    pendidikan_wali: string | null;
    pekerjaan_wali: string | null;
    penghasilan_wali: string | null;
    jurusan: string | null;
    created_at: string | null;
    bukti_pembayaran: string | null;
    kk_path: string | null;
    ktp_path: string | null;
  }

  interface Entry {
    id: number;
    date: string;
    amount: number;
    kind: "pemasukan" | "pengeluaran";
    name: string;
    user_id: number;
  }

  interface SPPRecord {
    id?: number;
    user_id: number;
    year: number;
    january: boolean; february: boolean; march: boolean; april: boolean;
    may: boolean; june: boolean; july: boolean; august: boolean;
    september: boolean; october: boolean; november: boolean; december: boolean;
  }

  type MonthKey = keyof Omit<SPPRecord, "id" | "user_id" | "year">;

  interface Attendance {
    id?: number;
    user_id: number;
    date: string;
    status: AttStatus;
  }

  interface Schedule {
    id?: number;
    day: string;
    class_name: string;
    subject: string;
    subject2?: string | null;
    teacher_id: number | null;
    time: string;
  }

  interface ScheduleFormItem {
    class_name: string;
    subject: string;
    subject2: string;
    teacher_id: string;
    time: string;
  }

  interface Announcement {
    id?: number;
    title: string;
    content: string;
    created_at?: string;
    created_by: number | null;
  }

  type ActiveView =
    | "home" | "spp" | "users" | "attendance" | "schedule" | "barcode"
    | "topup" | "pocket-expense" | "announcement" | "santri-report" | "pendaftaran";

  /* =========================
     KONSTANTA
  ========================= */

  const months: { key: MonthKey; label: string }[] = [
    { key: "january", label: "Jan" }, { key: "february", label: "Feb" },
    { key: "march", label: "Mar" }, { key: "april", label: "Apr" },
    { key: "may", label: "Mei" }, { key: "june", label: "Jun" },
    { key: "july", label: "Jul" }, { key: "august", label: "Agu" },
    { key: "september", label: "Sep" }, { key: "october", label: "Okt" },
    { key: "november", label: "Nov" }, { key: "december", label: "Des" }
  ];

  const classOptions = [
    "Kelas 1", "Kelas 2", "Kelas 3", "Kelas 4", "Kelas 5", "Kelas 6",
    "Kelas 7", "Kelas 8", "Kelas 9", "Kelas 10", "Kelas 11", "Kelas 12",
    "SD", "SMP", "SMA"
  ];

  const subjectOptions = [
    "None", "Al-Qur'an", "Tahfidz", "Aqidah", "Akhlak", "Fiqih", "Hadits",
    "Bahasa Arab", "Bahasa Indonesia", "Bahasa Inggris", "Matematika",
    "IPA", "IPS", "Sejarah Islam"
  ];

  const dayOptions = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
  const attStatuses: AttStatus[] = ["hadir", "izin", "sakit", "alpha"];
  const attColors: Record<string, string> = {
    hadir: "#22c55e", izin: "#3b82f6", sakit: "#f59e0b", alpha: "#ef4444", belum: "#94a3b8"
  };
  const levelColors: Record<string, string> = {
    SD: "#6366f1", SMP: "#f97316", SMA: "#14b8a6", Lainnya: "#94a3b8"
  };

  const adminOnlyViews: ActiveView[] = ["users", "topup", "pocket-expense", "pendaftaran", "santri-report"];

  const viewMeta: Record<ActiveView, { title: string; subtitle: string }> = {
    home: { title: "Beranda", subtitle: "Ringkasan pesantren sekilas" },
    spp: { title: "SPP Santri", subtitle: "Status pembayaran bulanan" },
    attendance: { title: "Absensi", subtitle: "Kehadiran santri dan ustad" },
    schedule: { title: "Jadwal", subtitle: "Jadwal pelajaran dan pengajar" },
    announcement: { title: "Pengumuman", subtitle: "Informasi dari administrasi" },
    users: { title: "Kelola User", subtitle: "Akun santri, ustad, dan admin" },
    pendaftaran: { title: "Pendaftaran Santri", subtitle: "Calon santri dari formulir pendaftaran" },
    barcode: { title: "Barcode", subtitle: "QR pribadi untuk absensi" },
    topup: { title: "Top Up Saldo", subtitle: "Tambah saldo uang jajan santri" },
    "pocket-expense": { title: "Pengeluaran Jajan", subtitle: "Catat pemakaian saldo santri" },
    "santri-report": { title: "Laporan Santri", subtitle: "Rincian akun satu santri" }
  };

  const navItems: { view: ActiveView; icon: string; label: string; adminOnly?: boolean }[] = [
    { view: "home", icon: "🏠", label: "Beranda" },
    { view: "spp", icon: "💳", label: "SPP Santri" },
    { view: "attendance", icon: "📅", label: "Absensi" },
    { view: "schedule", icon: "🗓️", label: "Jadwal" },
    { view: "announcement", icon: "📢", label: "Pengumuman" },
    { view: "users", icon: "👥", label: "Kelola User", adminOnly: true },
    { view: "pendaftaran", icon: "📝", label: "Pendaftaran Santri", adminOnly: true },
    { view: "barcode", icon: "🆔", label: "Barcode" },
    { view: "topup", icon: "➕", label: "Top Up Saldo", adminOnly: true },
    { view: "pocket-expense", icon: "💸", label: "Pengeluaran Jajan", adminOnly: true }
  ];

  const parentGroups = [
    { title: "Data Ayah", p: "ayah", hp: true },
    { title: "Data Ibu", p: "ibu", hp: true },
    { title: "Data Wali", p: "wali", hp: false }
  ];

  const santriTextFields = [
    { key: "nama_santri", label: "Nama santri" }, { key: "tempat_lahir", label: "Tempat lahir" },
    { key: "jenis_kelamin", label: "Jenis kelamin" }, { key: "nik", label: "NIK" },
    { key: "nisn", label: "NISN" }, { key: "hp_santri", label: "Nomor HP santri" },
    { key: "jurusan", label: "Jurusan" }, { key: "rt", label: "RT" }, { key: "rw", label: "RW" },
    { key: "nama_perumahan", label: "Nama perumahan" }, { key: "nama_kelurahan", label: "Kelurahan" },
    { key: "nama_kecamatan", label: "Kecamatan" }
  ];

  /* =========================
     STATE
  ========================= */

  let theme: Theme = "light";
  let activeView: ActiveView = "home";
  let sidebarOpen = false;
  let currentUser: User | null = null;

  let users: User[] = [];
  let entries: Entry[] = [];
  let schedules: Schedule[] = [];
  let attendanceData: Attendance[] = [];
  let announcements: Announcement[] = [];
  let sppData: Record<number, SPPRecord> = {};
  let userClassOptions: UserClass[] = [];

  let message = "";
  let isError = false;
  let toastTimer: ReturnType<typeof setTimeout>;

  let selectedYear = currentYear;
  let searchKeyword = "";

  /* ---- pendaftaran ---- */
  let pendaftaranSantri: PendaftaranSantri[] = [];
  let pendaftaranSearch = "";
  let loadingPendaftaran = false;
  let selectedPendaftar: PendaftaranSantri | null = null;
  let showPendaftaranDetail = false;
  let showPendaftaranEdit = false;
  let savingPendaftaran = false;
  let pendaftaranForm: Record<string, any> = {};
  let previewDokumenUrl = "";
  let previewDokumenTitle = "";

  /* ---- user ---- */
  let showUserModal = false;
  let editingUserId: number | null = null;
  let userManagementSearch = "";
  let formFullName = "";
  let formUsername = "";
  let formEmail = "";
  let formPassword = "";
  let formConfirmPassword = "";
  let formClassId: number | null = null;
  let formRole: Role = "santri";
  let isSavingUser = false;

  /* ---- top up & pengeluaran ---- */
  let transactionName = "";
  let transactionDate = localDate();
  let transactionAmount: number | string = "";
  let transactionUserId = "";
  let transactionSantriSearch = "";

  let pocketExpenseName = "Uang jajan";
  let pocketExpenseDate = localDate();
  let pocketExpenseAmount: number | string = "";
  let pocketExpenseUserId = "";
  let pocketExpenseSantriSearch = "";

  /* ---- absensi ---- */
  let attendanceDate = localDate();
  let selectedAttendanceUser = "";
  let attendanceMode: "santri" | "ustad" = "santri";
  let attendanceSearch = "";
  let attendanceSection: "SD" | "SMP" | "SMA" = "SD";
  let attendanceSmpClass = "";
  let attendanceStatus: AttStatus = "hadir";

  let selectedUstadAttendanceUser = "";
  let ustadAttendance: Attendance[] = [];
  let ustadAttendanceStatus: AttStatus = "hadir";
  let ustadAttendanceSearch = "";
  let savingUstadAttendance = false;
  let ustadReportYear = currentYear;
  let ustadReportMonth = new Date().getMonth() + 1;
  let ustadReportData: Attendance[] = [];
  let loadingUstadReport = false;

  /* ---- QR ---- */
  let showQrScanner = false;
  let qrScannerError = "";
  let qrScannerStream: MediaStream | null = null;
  let qrScannerTimer: ReturnType<typeof setInterval> | null = null;
  let qrVideoElement: HTMLVideoElement;
  let qrScannerMode: "santri" | "ustad" = "santri";
  let qrBusy = false;

  /* ---- jadwal ---- */
  let showScheduleModal = false;
  let editingScheduleId: number | null = null;
  let scheduleDay = "";
  let scheduleItems: ScheduleFormItem[] = [createEmptyScheduleItem()];

  /* ---- pengumuman ---- */
  let showAnnouncementModal = false;
  let editingAnnouncementId: number | null = null;
  let announcementTitle = "";
  let announcementContent = "";

  /* ---- modal role & laporan ---- */
  let showRoleModal = false;
  let selectedRole: Role | null = null;
  let selectedSantriReport: User | null = null;
  let santriReportSpp: SPPRecord | null = null;
  let santriReportAttendance: Attendance[] = [];
  let santriReportEntries: Entry[] = [];
  let isLoadingSantriReport = false;

  /* =========================
     HELPER MURNI
  ========================= */

  // Tanggal lokal (YYYY-MM-DD). toISOString() memakai UTC sehingga di WIB
  // dini hari tanggalnya bisa mundur satu hari.
  function localDate(d: Date = new Date()) {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split("T")[0];
  }

  function formatRupiah(value: number) {
    return new Intl.NumberFormat("id-ID").format(Number(value) || 0);
  }

  function formatDate(value?: string | null) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  }

  function attendanceLabel(status: string) {
    return ({ hadir: "Hadir", izin: "Izin", sakit: "Sakit", alpha: "Alpha", belum: "Belum diisi" } as Record<string, string>)[status] || status;
  }

  function show(v: unknown) {
    return v === null || v === undefined || v === "" ? "—" : String(v);
  }

  function initial(u: { full_name?: string; username?: string } | null | undefined) {
    return ((u?.full_name || u?.username || "U").trim().charAt(0) || "U").toUpperCase();
  }

  function conic(segs: { value: number; color: string }[]) {
    const total = segs.reduce((a, s) => a + s.value, 0);
    if (!total) return "conic-gradient(var(--track) 0 100%)";
    let acc = 0;
    const parts = segs.filter(s => s.value > 0).map(s => {
      const start = (acc / total) * 100;
      acc += s.value;
      return `${s.color} ${start}% ${(acc / total) * 100}%`;
    });
    return `conic-gradient(${parts.join(",")})`;
  }

  function getSchoolLevel(className: string | null | undefined) {
    if (!className) return "";
    const v = className.trim().toLowerCase();
    if (/\bsma\b/.test(v)) return "SMA";
    if (/\bsmp\b/.test(v)) return "SMP";
    if (/\bsd\b/.test(v)) return "SD";
    const m = v.match(/\b(\d{1,2})\b/);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 6) return "SD";
      if (n <= 9) return "SMP";
      if (n <= 12) return "SMA";
    }
    return "";
  }

  // Kelas SMP 1-3 (boleh ditulis "Kelas 7-9" atau "SMP 1-3").
  function getSmpGrade(className: string | null | undefined) {
    const v = (className || "").trim().toLowerCase();
    const m = v.match(/\b(\d{1,2})\b/);
    if (!m) return "";
    const n = Number(m[1]);
    if (/\bsmp\b/.test(v) && n >= 1 && n <= 3) return String(n);
    if (n >= 7 && n <= 9) return String(n - 6);
    return "";
  }

  // Fungsi menerima data sebagai argumen supaya template ikut
  // diperbarui ketika data berubah.
  function getSantriBalance(list: Entry[], userId: number) {
    return list
      .filter(e => Number(e.user_id) === userId)
      .reduce((t, e) => (e.kind === "pemasukan" ? t + Number(e.amount || 0) : t - Number(e.amount || 0)), 0);
  }

  function sumKind(list: Entry[], userId: number, kind: Entry["kind"]) {
    return list
      .filter(e => Number(e.user_id) === userId && e.kind === kind)
      .reduce((t, e) => t + Number(e.amount || 0), 0);
  }

  function getLunasCount(map: Record<number, SPPRecord>, userId: number) {
    const r = map[userId];
    return r ? months.filter(m => r[m.key]).length : 0;
  }

  function getAttendance(list: Attendance[], userId: number) {
    return list.find(i => Number(i.user_id) === userId);
  }

  function isImageUrl(url: string | null) {
    return !!url && !/\.pdf$/i.test(url.split("?")[0].split("#")[0]);
  }

  function showToast(msg: string, error = false) {
    message = msg;
    isError = error;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (message = ""), 3500);
  }

  /* =========================
     TURUNAN (REAKTIF)
  ========================= */

  $: isAdmin = currentUser?.role === "admin";
  $: isSantriRole = currentUser?.role === "santri";
  $: visibleNav = navItems.filter(n => !n.adminOnly || isAdmin);
  $: meta = viewMeta[activeView];

  $: santriUsers = users.filter(u => u.role === "santri");
  $: ustadUsers = users.filter(u => u.role === "ustad");
  $: adminUsers = users.filter(u => u.role === "admin");
  // Santri hanya boleh melihat datanya sendiri.
  $: visibleSantri = isSantriRole && currentUser
    ? santriUsers.filter(u => u.id === currentUser!.id)
    : santriUsers;
  $: roleUsers = selectedRole ? users.filter(u => u.role === selectedRole) : [];

  $: scheduleClassOptions = userClassOptions.length
    ? userClassOptions.map(k => k.name)
    : classOptions;

  $: schedulesByDay = dayOptions.map(day => ({
    day,
    items: schedules.filter(s => s.day === day)
  }));

  $: filteredSantri = visibleSantri.filter(u => {
    const k = searchKeyword.trim().toLowerCase();
    return !k || (u.username || "").toLowerCase().includes(k) || (u.full_name || "").toLowerCase().includes(k);
  });

  $: filteredManagedUsers = users.filter(u => {
    const k = userManagementSearch.trim().toLowerCase();
    if (!k) return true;
    return [u.id, u.full_name, u.username, u.email, u.role, u.class_name, u.class_id]
      .some(v => String(v ?? "").toLowerCase().includes(k));
  });

  $: filteredAttendanceSantri = visibleSantri.filter(u => {
    const k = attendanceSearch.trim().toLowerCase();
    const searchMatch =
      !k ||
      (u.full_name || "").toLowerCase().includes(k) ||
      (u.username || "").toLowerCase().includes(k) ||
      (u.class_name || "").toLowerCase().includes(k);
    if (isSantriRole) return searchMatch;

    let sectionMatch = getSchoolLevel(u.class_name) === attendanceSection;
    if (attendanceSection === "SMP" && attendanceSmpClass) {
      sectionMatch = sectionMatch && getSmpGrade(u.class_name) === attendanceSmpClass;
    }
    return sectionMatch && searchMatch;
  });

  $: filteredUstadAttendanceUsers = ustadUsers.filter(u => {
    const k = ustadAttendanceSearch.trim().toLowerCase();
    return !k || [u.id, u.full_name, u.username, u.email].some(v => String(v ?? "").toLowerCase().includes(k));
  });

  $: filteredTransactionSantri = santriUsers.filter(u => {
    const k = transactionSantriSearch.trim().toLowerCase();
    return !k || [u.full_name, u.username, u.id, u.class_name].some(v => String(v ?? "").toLowerCase().includes(k));
  });

  $: filteredPocketExpenseSantri = santriUsers.filter(u => {
    const k = pocketExpenseSantriSearch.trim().toLowerCase();
    return !k || [u.full_name, u.username, u.id, u.class_name].some(v => String(v ?? "").toLowerCase().includes(k));
  });

  $: selectedPocketExpenseSantri = santriUsers.find(u => u.id === Number(pocketExpenseUserId)) || null;
  $: selectedPocketExpenseBalance = selectedPocketExpenseSantri
    ? getSantriBalance(entries, selectedPocketExpenseSantri.id)
    : 0;
  $: pocketRecentEntries = selectedPocketExpenseSantri
    ? entries.filter(e => Number(e.user_id) === selectedPocketExpenseSantri!.id).slice(0, 8)
    : [];

  $: filteredPendaftaranSantri = pendaftaranSantri.filter(p => {
    const k = pendaftaranSearch.trim().toLowerCase();
    if (!k) return true;
    return [p.nama_santri, p.nik, p.nisn, p.jurusan, p.nama_ayah, p.nama_ibu, p.nama_kecamatan]
      .some(v => (v || "").toLowerCase().includes(k));
  });

  $: filteredUstadReportUsers = ustadUsers;

  /* ---- statistik beranda ---- */
  $: todayCounts = attStatuses.map(s => ({
    status: s,
    count: visibleSantri.filter(u => attendanceData.find(a => Number(a.user_id) === u.id)?.status === s).length
  }));
  $: todayFilled = todayCounts.reduce((t, c) => t + c.count, 0);
  $: todayUnfilled = Math.max(visibleSantri.length - todayFilled, 0);
  $: todayHadirPct = visibleSantri.length
    ? Math.round((todayCounts[0].count / visibleSantri.length) * 100)
    : 0;
  $: attendanceDonut = conic([
    ...todayCounts.map(c => ({ value: c.count, color: attColors[c.status] })),
    { value: todayUnfilled, color: attColors.belum }
  ]);

  $: sppMonthStats = months.map(m => {
    const n = visibleSantri.filter(s => sppData[s.id]?.[m.key]).length;
    return {
      label: m.label,
      count: n,
      pct: visibleSantri.length ? Math.round((n / visibleSantri.length) * 100) : 0
    };
  });

  $: levelStats = ["SD", "SMP", "SMA", "Lainnya"].map(l => ({
    level: l,
    count: visibleSantri.filter(u => (getSchoolLevel(u.class_name) || "Lainnya") === l).length,
    color: levelColors[l]
  }));
  $: levelDonut = conic(levelStats.map(l => ({ value: l.count, color: l.color })));

  $: classOverview = (() => {
    const map = new Map<string, { name: string; total: number; lunas: number; hadir: number; saldo: number }>();
    for (const s of visibleSantri) {
      const name = s.class_name || "Belum ada kelas";
      const row = map.get(name) || { name, total: 0, lunas: 0, hadir: 0, saldo: 0 };
      row.total += 1;
      const rec = sppData[s.id];
      row.lunas += rec ? months.filter(m => rec[m.key]).length : 0;
      if (attendanceData.find(a => Number(a.user_id) === s.id)?.status === "hadir") row.hadir += 1;
      row.saldo += getSantriBalance(entries, s.id);
      map.set(name, row);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "id", { numeric: true }));
  })();

  $: kpis = [
    { label: "Total Santri", value: santriUsers.length, note: "Akun aktif", icon: "🎓", cls: "k-blue", role: "santri" as Role | null },
    { label: "Total Ustad", value: ustadUsers.length, note: "Tenaga pengajar", icon: "👨‍🏫", cls: "k-green", role: "ustad" as Role | null },
    { label: "Total Admin", value: adminUsers.length, note: "Pengelola sistem", icon: "🛡️", cls: "k-purple", role: "admin" as Role | null },
    { label: "Hadir Hari Ini", value: `${todayHadirPct}%`, note: `${todayCounts[0].count} dari ${visibleSantri.length} santri`, icon: "📅", cls: "k-orange", role: null },
    isAdmin
      ? { label: "Pendaftar", value: pendaftaranSantri.length, note: "Calon santri masuk", icon: "📝", cls: "k-teal", role: null }
      : { label: "Pengumuman", value: announcements.length, note: "Informasi terbaru", icon: "📢", cls: "k-teal", role: null }
  ];

  $: santriReportPemasukan = santriReportEntries.filter(e => e.kind === "pemasukan").reduce((t, e) => t + Number(e.amount || 0), 0);
  $: santriReportPengeluaran = santriReportEntries.filter(e => e.kind === "pengeluaran").reduce((t, e) => t + Number(e.amount || 0), 0);
  $: santriReportSaldo = santriReportPemasukan - santriReportPengeluaran;

  /* =========================
     TEMA
  ========================= */

  function applyTheme(t: Theme) {
    theme = t;
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("theme", t); } catch { /* abaikan */ }
  }

  function toggleTheme() {
    applyTheme(theme === "light" ? "dark" : "light");
  }

  /* =========================
     LIFECYCLE
  ========================= */

  onMount(async () => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("theme"); } catch { /* abaikan */ }
    applyTheme(
      saved === "dark" || saved === "light"
        ? saved
        : window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    );

    const storedUser = localStorage.getItem("user");
    if (!storedUser) { goto("/login"); return; }

    try {
      currentUser = JSON.parse(storedUser);
    } catch {
      localStorage.removeItem("user");
      goto("/login");
      return;
    }

    // Pastikan nilai reaktif (isAdmin dll.) sudah terhitung sebelum
    // memuat data. Sebelumnya loadPendaftaranSantri() selalu berhenti
    // karena isAdmin belum terisi pada saat onMount berjalan.
    await tick();

    const jobs = [loadClasses(), loadUsers(), loadEntries(), loadSPPData(), loadAttendance(), loadSchedules(), loadAnnouncements()];
    if (isAdmin) jobs.push(loadPendaftaranSantri());
    await Promise.all(jobs);
  });

  onDestroy(() => {
    clearTimeout(toastTimer);
    if (typeof window !== "undefined") stopQrScanner();
  });

  /* =========================
     LOAD DATA
  ========================= */

  async function loadClasses() {
    const { data, error } = await supabase.from("classes").select("*").order("id", { ascending: true });
    if (error) { showToast("Gagal memuat kelas: " + error.message, true); userClassOptions = []; return; }
    userClassOptions = (data || [])
      .map((row: any) => ({ id: Number(row.id), name: String(row.name ?? row.class_name ?? row.nama ?? `Kelas ${row.id}`) }))
      .filter(k => Number.isFinite(k.id) && k.name);
  }

  async function loadUsers() {
    // Email hanya diambil untuk admin.
    const cols = isAdmin
      ? "id, full_name, username, email, role, class_name, class_id"
      : "id, full_name, username, role, class_name, class_id";
    const { data, error } = await supabase.from("users").select(cols).order("username", { ascending: true });
    if (error) { showToast("Gagal memuat user: " + error.message, true); return; }
    users = ((data || []) as any[]).map(u => ({ ...u, email: u.email || "" })) as User[];
  }

  async function loadEntries() {
    let q = supabase.from("entries").select("*").order("id", { ascending: false });
    if (currentUser && !isAdmin) q = q.eq("user_id", currentUser.id);
    const { data, error } = await q;
    if (error) { showToast("Gagal memuat transaksi: " + error.message, true); return; }
    entries = (data || []) as Entry[];
  }

  async function loadSPPData() {
    let q = supabase.from("spp_payments").select("*").eq("year", selectedYear);
    if (currentUser && isSantriRole) q = q.eq("user_id", currentUser.id);
    const { data, error } = await q;
    if (error) { showToast("Gagal memuat SPP: " + error.message, true); return; }
    const map: Record<number, SPPRecord> = {};
    ((data || []) as SPPRecord[]).forEach(item => {
      map[Number(item.user_id)] = { ...item, user_id: Number(item.user_id) };
    });
    sppData = map;
  }

  async function loadAttendance() {
    let q = supabase.from("attendance").select("*").eq("date", attendanceDate).order("id", { ascending: false });
    if (currentUser && isSantriRole) q = q.eq("user_id", currentUser.id);
    const { data, error } = await q;
    if (error) { showToast("Gagal memuat absensi: " + error.message, true); attendanceData = []; return; }
    attendanceData = (data || []) as Attendance[];
  }

  async function loadSchedules() {
    const { data, error } = await supabase.from("schedules").select("*").order("id", { ascending: true });
    if (error) { showToast("Gagal memuat jadwal: " + error.message, true); schedules = []; return; }
    schedules = (data || []) as Schedule[];
  }

  async function loadAnnouncements() {
    const { data, error } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
    if (error) { showToast("Gagal memuat pengumuman: " + error.message, true); announcements = []; return; }
    announcements = (data || []) as Announcement[];
  }

  async function changeAttendanceDate() {
    await loadAttendance();
    if (isAdmin && attendanceMode === "ustad") await loadUstadAttendance();
  }

  /* =========================
     NAVIGASI
  ========================= */

  async function changeView(view: ActiveView) {
    if (adminOnlyViews.includes(view) && !isAdmin) {
      showToast("Halaman ini hanya untuk admin.", true);
      return;
    }
    activeView = view;
    sidebarOpen = false;
    if (view === "pendaftaran" && pendaftaranSantri.length === 0) await loadPendaftaranSantri();
  }

  function logout() {
    stopQrScanner();
    localStorage.removeItem("user");
    goto("/login");
  }

  /* =========================
     EXPORT EXCEL
  ========================= */

  function exportSPPToExcel() {
    const rows = filteredSantri.map((s, i) => {
      const r = sppData[s.id];
      const row: Record<string, string | number> = {
        No: i + 1, "ID Santri": s.id, "Nama Santri": s.full_name || "",
        Username: s.username || "", Kelas: s.class_name || "", Tahun: selectedYear
      };
      months.forEach(m => (row[m.label] = r?.[m.key] ? "Lunas" : "Belum"));
      row["Total Lunas"] = getLunasCount(sppData, s.id);
      row["Sisa Bulan"] = 12 - getLunasCount(sppData, s.id);
      return row;
    });
    if (!rows.length) { showToast("Tidak ada data SPP untuk diekspor.", true); return; }

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 5 }, { wch: 12 }, { wch: 28 }, { wch: 20 }, { wch: 18 }, { wch: 10 }, ...Array(12).fill({ wch: 8 }), { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SPP");
    XLSX.writeFile(wb, `SPP_Santri_${selectedYear}.xlsx`);
    showToast("✓ Data SPP berhasil diekspor ke Excel.");
  }

  function exportAttendanceToExcel() {
    const rows = filteredAttendanceSantri.map((s, i) => {
      const a = getAttendance(attendanceData, s.id);
      return {
        No: i + 1, "ID Santri": s.id, "Nama Santri": s.full_name || "", Username: s.username || "",
        Kelas: s.class_name || "", Jenjang: getSchoolLevel(s.class_name),
        Status: attendanceLabel(a ? a.status : "belum"), Tanggal: attendanceDate
      };
    });
    if (!rows.length) { showToast("Tidak ada data absensi untuk diekspor.", true); return; }

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 5 }, { wch: 12 }, { wch: 28 }, { wch: 20 }, { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Absensi");
    const cls = attendanceSection === "SMP" && attendanceSmpClass ? `_Kelas_${attendanceSmpClass}` : "";
    XLSX.writeFile(wb, `Absensi_${attendanceDate}_${isSantriRole ? "saya" : attendanceSection.toLowerCase()}${cls}.xlsx`);
    showToast("✓ Data absensi berhasil diekspor ke Excel.");
  }

  function getUstadMonthlyStatus(list: Attendance[], userId: number, status: AttStatus) {
    return list.filter(i => Number(i.user_id) === userId && i.status === status).length;
  }

  function getUstadMonthlyTotal(list: Attendance[], userId: number) {
    return list.filter(i => Number(i.user_id) === userId).length;
  }

  function exportUstadMonthlyReport() {
    if (!isAdmin) { showToast("Hanya admin yang dapat mengekspor laporan.", true); return; }
    const rows = ustadUsers.map((u, i) => ({
      No: i + 1, "ID Ustad": u.id, "Nama Ustad": u.full_name || "", Username: u.username || "",
      Hadir: getUstadMonthlyStatus(ustadReportData, u.id, "hadir"),
      Izin: getUstadMonthlyStatus(ustadReportData, u.id, "izin"),
      Sakit: getUstadMonthlyStatus(ustadReportData, u.id, "sakit"),
      Alpha: getUstadMonthlyStatus(ustadReportData, u.id, "alpha"),
      Total: getUstadMonthlyTotal(ustadReportData, u.id)
    }));
    if (!rows.length) { showToast("Tidak ada data ustad untuk diekspor.", true); return; }

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 5 }, { wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Absensi Ustad");
    XLSX.writeFile(wb, `Laporan_Absensi_Ustad_${monthNames[ustadReportMonth - 1]}_${ustadReportYear}.xlsx`);
    showToast("✓ Laporan absensi ustad berhasil diekspor.");
  }

  /* =========================
     SPP
  ========================= */

  function emptySpp(userId: number): SPPRecord {
    return {
      user_id: userId, year: selectedYear,
      january: false, february: false, march: false, april: false,
      may: false, june: false, july: false, august: false,
      september: false, october: false, november: false, december: false
    };
  }

  async function toggleSPP(userId: number, monthKey: MonthKey) {
    if (!isAdmin) { showToast("Hanya admin yang dapat mengubah SPP.", true); return; }

    const current = sppData[userId] || emptySpp(userId);
    const nextValue = !current[monthKey];

    const { error } = await supabase
      .from("spp_payments")
      .upsert({ ...current, user_id: userId, year: selectedYear, [monthKey]: nextValue }, { onConflict: "user_id,year" });

    if (error) { showToast("Gagal mengubah SPP: " + error.message, true); return; }

    sppData = { ...sppData, [userId]: { ...current, [monthKey]: nextValue } };
    showToast(nextValue ? "✓ SPP berhasil ditandai lunas" : "Status SPP dibatalkan");
  }

  /* =========================
     TOP UP & PENGELUARAN
  ========================= */

  async function addTransaction() {
    if (!isAdmin) { showToast("Hanya admin yang dapat melakukan top up.", true); return; }
    const amount = Number(transactionAmount);
    if (!transactionName.trim() || !transactionDate || !transactionUserId || !Number.isFinite(amount) || amount <= 0) {
      showToast("Semua data wajib diisi dan jumlah harus lebih dari 0.", true);
      return;
    }

    const { error } = await supabase.from("entries").insert([{
      name: transactionName.trim(), date: transactionDate, amount,
      kind: "pemasukan", user_id: Number(transactionUserId)
    }]);
    if (error) { showToast("Gagal mengirim uang: " + error.message, true); return; }

    showToast("✓ Uang berhasil terkirim!");
    transactionName = "";
    transactionAmount = "";
    transactionUserId = "";
    transactionSantriSearch = "";
    await loadEntries();
  }

  async function addPocketExpense() {
    if (!isAdmin) { showToast("Hanya admin yang dapat mencatat pengeluaran uang jajan.", true); return; }
    const amount = Number(pocketExpenseAmount);
    if (!pocketExpenseUserId || !pocketExpenseDate || !pocketExpenseName.trim() || !Number.isFinite(amount) || amount <= 0) {
      showToast("Santri, keterangan, tanggal, dan jumlah wajib diisi.", true);
      return;
    }

    // Saldo tidak cukup tetap boleh; selisih negatif menjadi hutang santri.
    const { error } = await supabase.from("entries").insert([{
      name: pocketExpenseName.trim(), date: pocketExpenseDate, amount,
      kind: "pengeluaran", user_id: Number(pocketExpenseUserId)
    }]);
    if (error) { showToast("Gagal mencatat pengeluaran: " + error.message, true); return; }

    showToast("✓ Pengeluaran uang jajan berhasil dicatat.");
    pocketExpenseName = "Uang jajan";
    pocketExpenseAmount = "";
    pocketExpenseUserId = "";
    pocketExpenseSantriSearch = "";
    pocketExpenseDate = localDate();
    await loadEntries();
  }

  /* =========================
     USER
  ========================= */

  function handleRoleChange() {
    if (formRole !== "santri") formClassId = null;
  }

  function resetUserForm() {
    editingUserId = null;
    formFullName = formUsername = formEmail = formPassword = formConfirmPassword = "";
    formClassId = null;
    formRole = "santri";
  }

  function openAddUserModal() {
    if (!isAdmin) { showToast("❌ Hanya admin yang dapat menambah user.", true); return; }
    resetUserForm();
    showUserModal = true;
  }

  function openEditUserModal(user: User) {
    if (!isAdmin) { showToast("❌ Hanya admin yang dapat mengedit user.", true); return; }
    editingUserId = user.id;
    formFullName = user.full_name || "";
    formUsername = user.username || "";
    formEmail = user.email || "";
    formPassword = "";
    formConfirmPassword = "";
    formRole = user.role;
    formClassId = user.class_id ?? userClassOptions.find(k => k.name === user.class_name)?.id ?? null;
    showUserModal = true;
  }

  async function saveUser() {
    if (!isAdmin) { showToast("❌ Hanya admin yang dapat menyimpan user.", true); return; }
    if (isSavingUser) return;

    const full_name = formFullName.trim();
    const username = formUsername.trim();
    const email = formEmail.trim().toLowerCase();
    const password = formPassword;

    const class_id = formRole === "santri" && formClassId !== null ? Number(formClassId) : null;
    // class_name tetap disinkronkan untuk modul lama.
    const class_name = class_id !== null ? userClassOptions.find(k => k.id === class_id)?.name ?? null : null;

    if (!full_name || !username || !email) { showToast("❌ Nama lengkap, username, dan email wajib diisi.", true); return; }
    if (formRole === "santri" && class_id === null) { showToast("❌ Kelas wajib dipilih untuk santri.", true); return; }
    if (username.length < 3) { showToast("❌ Username minimal 3 karakter.", true); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast("❌ Format email tidak valid.", true); return; }
    if (editingUserId === null && !password) { showToast("❌ Password wajib diisi.", true); return; }
    if (password && password.length < 6) { showToast("❌ Password minimal 6 karakter.", true); return; }
    if (password && password !== formConfirmPassword) { showToast("❌ Konfirmasi password tidak sama.", true); return; }

    isSavingUser = true;
    try {
      let uq = supabase.from("users").select("id").ilike("username", username);
      let eq = supabase.from("users").select("id").ilike("email", email);
      if (editingUserId !== null) { uq = uq.neq("id", editingUserId); eq = eq.neq("id", editingUserId); }
      const [ur, er] = await Promise.all([uq, eq]);
      if (ur.error) throw ur.error;
      if (er.error) throw er.error;
      if ((ur.data || []).length) { showToast("❌ Username sudah digunakan.", true); return; }
      if ((er.data || []).length) { showToast("❌ Email sudah digunakan.", true); return; }

      if (editingUserId !== null) {
        const payload: Record<string, any> = { full_name, username, email, role: formRole, class_id, class_name };
        if (password) payload.password_hash = btoa(password);
        const { error } = await supabase.from("users").update(payload).eq("id", editingUserId);
        if (error) throw error;
        showToast(`✓ User "${username}" berhasil diperbarui!`);
      } else {
        const { error } = await supabase.from("users").insert([{
          full_name, username, email, password_hash: btoa(password), role: formRole, class_id, class_name
        }]);
        if (error) throw error;
        showToast(`✓ User "${username}" berhasil ditambahkan!`);
      }

      showUserModal = false;
      resetUserForm();
      await loadUsers();
    } catch (error: any) {
      console.error("Gagal menyimpan user:", error);
      const msg: string = error?.message || "Terjadi kesalahan.";
      if (msg.includes("duplicate key")) {
        showToast(msg.includes("email") ? "❌ Email sudah digunakan." : "❌ Username sudah digunakan.", true);
      } else {
        showToast("❌ Gagal menyimpan user: " + msg, true);
      }
    } finally {
      isSavingUser = false;
    }
  }

  async function deleteUser(id: number, username: string) {
    if (!isAdmin) { showToast("❌ Hanya admin yang dapat menghapus user.", true); return; }
    if (currentUser?.id === id) { showToast("❌ Anda tidak dapat menghapus akun sendiri.", true); return; }
    if (!confirm(`Apakah Anda yakin ingin menghapus user "${username}"?`)) return;

    try {
      const steps = [
        supabase.from("attendance").delete().eq("user_id", id),
        supabase.from("attendance_ustad").delete().eq("user_id", id),
        supabase.from("spp_payments").delete().eq("user_id", id),
        supabase.from("entries").delete().eq("user_id", id),
        supabase.from("schedules").update({ teacher_id: null }).eq("teacher_id", id),
        supabase.from("announcements").update({ created_by: null }).eq("created_by", id)
      ];
      for (const step of steps) {
        const { error } = await step;
        if (error) throw error;
      }
      const { error } = await supabase.from("users").delete().eq("id", id);
      if (error) throw error;

      showToast(`✓ User "${username}" berhasil dihapus!`);
      await Promise.all([loadUsers(), loadEntries(), loadSPPData(), loadAttendance(), loadSchedules(), loadAnnouncements()]);
    } catch (error: any) {
      console.error("Gagal menghapus user:", error);
      showToast("❌ Gagal menghapus user: " + (error?.message || "Terjadi kesalahan."), true);
    }
  }

  function openRoleModal(role: Role) {
    if (!isAdmin) return;
    selectedRole = role;
    showRoleModal = true;
  }

  function closeRoleModal() {
    showRoleModal = false;
    selectedRole = null;
  }

  /* =========================
     LAPORAN SANTRI
  ========================= */

  async function openSantriReport(user: User) {
    if (!isAdmin || user.role !== "santri") { showToast("❌ Hanya admin yang dapat melihat laporan santri.", true); return; }

    selectedSantriReport = user;
    activeView = "santri-report";
    isLoadingSantriReport = true;
    santriReportSpp = null;
    santriReportAttendance = [];
    santriReportEntries = [];

    try {
      const [spp, att, ent] = await Promise.all([
        supabase.from("spp_payments").select("*").eq("user_id", user.id).eq("year", selectedYear).maybeSingle(),
        supabase.from("attendance").select("*").eq("user_id", user.id).order("date", { ascending: false }),
        supabase.from("entries").select("*").eq("user_id", user.id).order("date", { ascending: false }).order("id", { ascending: false })
      ]);
      if (spp.error) throw spp.error;
      if (att.error) throw att.error;
      if (ent.error) throw ent.error;
      santriReportSpp = (spp.data || null) as SPPRecord | null;
      santriReportAttendance = (att.data || []) as Attendance[];
      santriReportEntries = (ent.data || []) as Entry[];
    } catch (error: any) {
      console.error("Gagal memuat laporan santri:", error);
      showToast("❌ Gagal memuat laporan santri: " + (error?.message || "Terjadi kesalahan."), true);
    } finally {
      isLoadingSantriReport = false;
    }
  }

  function closeSantriReport() {
    selectedSantriReport = null;
    santriReportSpp = null;
    santriReportAttendance = [];
    santriReportEntries = [];
    activeView = "users";
  }

  /* =========================
     ABSENSI SANTRI
  ========================= */

  async function saveAttendance() {
    if (!isAdmin) { showToast("Hanya admin yang dapat mengisi absensi.", true); return; }
    if (!selectedAttendanceUser) { showToast("Pilih santri terlebih dahulu!", true); return; }

    const userId = Number(selectedAttendanceUser);
    const existing = getAttendance(attendanceData, userId);

    const { error } = existing?.id
      ? await supabase.from("attendance").update({ status: attendanceStatus }).eq("id", existing.id)
      : await supabase.from("attendance").insert([{ user_id: userId, date: attendanceDate, status: attendanceStatus }]);

    if (error) { showToast("Gagal menyimpan absensi: " + error.message, true); return; }

    showToast("✓ Absensi berhasil disimpan!");
    selectedAttendanceUser = "";
    await loadAttendance();
  }

  /* =========================
     ABSENSI USTAD
  ========================= */

  async function loadUstadAttendance() {
    if (!isAdmin) { ustadAttendance = []; return; }
    const { data, error } = await supabase
      .from("attendance_ustad").select("*").eq("date", attendanceDate).order("id", { ascending: false });
    if (error) { showToast("Gagal memuat absensi ustad: " + error.message, true); ustadAttendance = []; return; }
    ustadAttendance = (data || []) as Attendance[];

    if (selectedUstadAttendanceUser) {
      ustadAttendanceStatus = getAttendance(ustadAttendance, Number(selectedUstadAttendanceUser))?.status || "hadir";
    }
  }

  async function loadUstadMonthlyReport() {
    if (!isAdmin) return;
    loadingUstadReport = true;
    try {
      const mm = String(ustadReportMonth).padStart(2, "0");
      const last = new Date(ustadReportYear, ustadReportMonth, 0).getDate();
      const { data, error } = await supabase
        .from("attendance_ustad").select("*")
        .gte("date", `${ustadReportYear}-${mm}-01`)
        .lte("date", `${ustadReportYear}-${mm}-${String(last).padStart(2, "0")}`)
        .order("date", { ascending: true }).order("user_id", { ascending: true });
      if (error) throw error;
      ustadReportData = (data || []) as Attendance[];
    } catch (e: any) {
      showToast("Gagal memuat laporan ustad: " + (e?.message || "Kesalahan"), true);
      ustadReportData = [];
    } finally {
      loadingUstadReport = false;
    }
  }

  async function saveUstadAttendance() {
    if (!isAdmin) { showToast("Hanya admin yang dapat mengisi absensi ustad.", true); return; }
    if (!selectedUstadAttendanceUser) { showToast("Pilih ustad terlebih dahulu.", true); return; }
    if (!attendanceDate) { showToast("Tanggal absensi wajib dipilih.", true); return; }

    savingUstadAttendance = true;
    try {
      const { error } = await supabase.from("attendance_ustad").upsert(
        { user_id: Number(selectedUstadAttendanceUser), date: attendanceDate, status: ustadAttendanceStatus },
        { onConflict: "user_id,date" }
      );
      if (error) throw error;
      showToast("✓ Absensi ustad berhasil disimpan.");
      await Promise.all([loadUstadAttendance(), loadUstadMonthlyReport()]);
    } catch (e: any) {
      showToast("Gagal menyimpan absensi ustad: " + (e?.message || "Kesalahan"), true);
    } finally {
      savingUstadAttendance = false;
    }
  }

  async function switchAttendanceMode(mode: "santri" | "ustad") {
    attendanceMode = mode;
    if (mode === "santri") {
      selectedAttendanceUser = "";
      await loadAttendance();
    } else {
      selectedUstadAttendanceUser = "";
      ustadAttendanceStatus = "hadir";
      await Promise.all([loadUstadAttendance(), loadUstadMonthlyReport()]);
    }
  }

  function pickSection(section: "SD" | "SMP" | "SMA", smp = "") {
    attendanceSection = section;
    attendanceSmpClass = smp;
    selectedAttendanceUser = "";
  }

  function onUstadSelectChange() {
    ustadAttendanceStatus = getAttendance(ustadAttendance, Number(selectedUstadAttendanceUser))?.status || "hadir";
  }

  /* =========================
     QR
  ========================= */

  function getQrImageUrl(userId: number, role: "santri" | "ustad" = "santri") {
    const data = encodeURIComponent(`${role}:${userId}`);
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${data}`;
  }

  function parseQrValue(value: string) {
    const text = value.trim();
    const direct = text.match(/^santri:(\d+)$/i);
    if (direct) return Number(direct[1]);
    try {
      const id = new URL(text).searchParams.get("santri");
      if (id && /^\d+$/.test(id)) return Number(id);
    } catch { /* bukan URL */ }
    const m = text.match(/(?:ID[-:]?)(\d+)/i);
    return m ? Number(m[1]) : null;
  }

  async function finishScan() {
    await stopQrScanner();
    showQrScanner = false;
    qrScannerError = "";
  }

  async function handleQrScan(value: string) {
    if (qrBusy) return;
    qrBusy = true;
    try {
      const ustadMatch = value.trim().match(/^ustad:(\d+)$/i);

      if (qrScannerMode === "ustad") {
        if (!ustadMatch) { qrScannerError = "QR bukan milik ustad. Gunakan QR ustad dari menu Barcode."; return; }
        const ustadId = Number(ustadMatch[1]);
        const ustad = ustadUsers.find(u => u.id === ustadId);
        if (!ustad) { qrScannerError = "Data ustad dari QR tidak ditemukan."; return; }

        const { error } = await supabase.from("attendance_ustad").upsert(
          { user_id: ustadId, date: attendanceDate, status: "hadir" },
          { onConflict: "user_id,date" }
        );
        if (error) { qrScannerError = "Gagal menyimpan absensi ustad: " + error.message; return; }

        await finishScan();
        await Promise.all([loadUstadAttendance(), loadUstadMonthlyReport()]);
        showToast(`✓ Kehadiran ${ustad.full_name || ustad.username} berhasil dicatat.`);
        return;
      }

      if (ustadMatch) { qrScannerError = "QR ini milik ustad. Pilih mode Scan QR Ustad."; return; }

      const userId = parseQrValue(value);
      if (!userId) { qrScannerError = "QR tidak dikenali. Gunakan QR santri dari menu Barcode."; return; }
      const santri = santriUsers.find(u => u.id === userId);
      if (!santri) { qrScannerError = "Data santri dari QR tidak ditemukan."; return; }

      const level = getSchoolLevel(santri.class_name);
      attendanceMode = "santri";
      attendanceSection = level === "SMP" || level === "SMA" ? level : "SD";
      attendanceSmpClass = level === "SMP" ? getSmpGrade(santri.class_name) : "";
      attendanceSearch = santri.full_name || santri.username;
      selectedAttendanceUser = String(santri.id);
      activeView = "attendance";

      await finishScan();
      showToast(`✓ ${santri.full_name || santri.username} dipilih untuk absensi.`);
    } finally {
      qrBusy = false;
    }
  }

  async function startQrScanner(mode: "santri" | "ustad" = "santri") {
    if (!isAdmin) { showToast("Hanya admin yang dapat melakukan absensi.", true); return; }
    if (!attendanceDate) { showToast("Pilih tanggal absensi terlebih dahulu.", true); return; }

    qrScannerMode = mode;
    showQrScanner = true;
    qrScannerError = "";

    if (!navigator.mediaDevices?.getUserMedia) {
      qrScannerError = "Kamera tidak tersedia. Pastikan situs dibuka melalui HTTPS atau localhost.";
      return;
    }

    try {
      qrScannerStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } }, audio: false
      });
      await tick();
      if (!qrVideoElement) throw new Error("Video kamera belum siap.");
      qrVideoElement.srcObject = qrScannerStream;
      await qrVideoElement.play();

      const Detector = (window as any).BarcodeDetector;
      if (!Detector) {
        qrScannerError = "Browser belum mendukung pembaca QR bawaan. Gunakan Chrome terbaru atau pilih santri secara manual.";
        return;
      }

      const detector = new Detector({ formats: ["qr_code"] });
      qrScannerTimer = setInterval(async () => {
        if (qrBusy || !qrVideoElement || qrVideoElement.readyState < 2) return;
        try {
          const codes = await detector.detect(qrVideoElement);
          if (codes?.length && codes[0]?.rawValue) await handleQrScan(codes[0].rawValue);
        } catch { /* abaikan frame gagal */ }
      }, 300);
    } catch (error) {
      await stopQrScanner();
      qrScannerError = error instanceof DOMException && error.name === "NotAllowedError"
        ? "Izin kamera ditolak. Izinkan Camera untuk situs ini."
        : "Kamera tidak dapat dibuka. Pastikan kamera tersedia dan situs menggunakan HTTPS atau localhost.";
    }
  }

  async function stopQrScanner() {
    if (qrScannerTimer) { clearInterval(qrScannerTimer); qrScannerTimer = null; }
    if (qrScannerStream) { qrScannerStream.getTracks().forEach(t => t.stop()); qrScannerStream = null; }
    if (qrVideoElement) { qrVideoElement.pause(); qrVideoElement.srcObject = null; }
  }

  /* =========================
     JADWAL
  ========================= */

  function createEmptyScheduleItem(): ScheduleFormItem {
    return { class_name: "", subject: "None", subject2: "None", teacher_id: "", time: "" };
  }

  function addScheduleItem() { scheduleItems = [...scheduleItems, createEmptyScheduleItem()]; }

  function removeScheduleItem(index: number) {
    if (scheduleItems.length === 1) { showToast("Minimal harus ada satu jadwal!", true); return; }
    scheduleItems = scheduleItems.filter((_, i) => i !== index);
  }

  function openAddSchedule() {
    if (!isAdmin) { showToast("Hanya admin yang dapat menambah jadwal.", true); return; }
    editingScheduleId = null;
    scheduleDay = "";
    scheduleItems = [createEmptyScheduleItem()];
    showScheduleModal = true;
  }

  function openEditSchedule(s: Schedule) {
    if (!isAdmin) return;
    editingScheduleId = s.id ?? null;
    scheduleDay = s.day;
    scheduleItems = [{
      class_name: s.class_name || "", subject: s.subject || "None", subject2: s.subject2 || "None",
      teacher_id: s.teacher_id ? String(s.teacher_id) : "", time: s.time || ""
    }];
    showScheduleModal = true;
  }

  async function saveSchedule() {
    if (!isAdmin) return;
    if (!scheduleDay) { showToast("Pilih hari terlebih dahulu!", true); return; }

    for (const item of scheduleItems) {
      if (!item.class_name || !item.teacher_id || !item.time.trim()) {
        showToast("Kelas, ustad, dan jam wajib diisi pada semua kelompok jadwal!", true);
        return;
      }
      const t = users.find(u => u.id === Number(item.teacher_id));
      if (!t || t.role !== "ustad") { showToast("Pengajar harus memiliki role Ustad!", true); return; }
    }

    const payload = scheduleItems.map(i => ({
      day: scheduleDay,
      class_name: i.class_name,
      subject: i.subject || "None",
      subject2: i.subject2 && i.subject2 !== "None" && i.subject2 !== i.subject ? i.subject2 : null,
      teacher_id: Number(i.teacher_id),
      time: i.time.trim()
    }));

    const { error } = editingScheduleId !== null
      ? await supabase.from("schedules").update(payload[0]).eq("id", editingScheduleId)
      : await supabase.from("schedules").insert(payload);

    if (error) { showToast("Gagal menyimpan jadwal: " + error.message, true); return; }
    showToast(editingScheduleId !== null ? "✓ Jadwal berhasil diperbarui!" : "✓ Semua jadwal berhasil ditambahkan!");

    showScheduleModal = false;
    editingScheduleId = null;
    scheduleDay = "";
    scheduleItems = [createEmptyScheduleItem()];
    await loadSchedules();
  }

  async function deleteSchedule(id: number | undefined) {
    if (!isAdmin || id === undefined) return;
    if (!confirm("Hapus jadwal ini?")) return;
    const { error } = await supabase.from("schedules").delete().eq("id", id);
    if (error) { showToast("Gagal menghapus jadwal: " + error.message, true); return; }
    showToast("✓ Jadwal berhasil dihapus!");
    await loadSchedules();
  }

  function getTeacherName(teacherId: number | null) {
    if (!teacherId) return "-";
    const t = users.find(u => u.id === Number(teacherId));
    return t ? t.full_name || t.username : "Pengajar tidak ditemukan";
  }

  /* =========================
     PENGUMUMAN
  ========================= */

  function openAddAnnouncement() {
    if (!isAdmin) { showToast("Hanya admin yang dapat membuat pengumuman.", true); return; }
    editingAnnouncementId = null;
    announcementTitle = "";
    announcementContent = "";
    showAnnouncementModal = true;
  }

  function openEditAnnouncement(a: Announcement) {
    if (!isAdmin) { showToast("Hanya admin yang dapat mengedit pengumuman.", true); return; }
    editingAnnouncementId = a.id ?? null;
    announcementTitle = a.title;
    announcementContent = a.content;
    showAnnouncementModal = true;
  }

  async function saveAnnouncement() {
    if (!isAdmin) { showToast("Hanya admin yang dapat menyimpan pengumuman.", true); return; }
    if (!announcementTitle.trim() || !announcementContent.trim()) { showToast("Judul dan isi pengumuman wajib diisi!", true); return; }

    const body = { title: announcementTitle.trim(), content: announcementContent.trim() };
    const { error } = editingAnnouncementId !== null
      ? await supabase.from("announcements").update(body).eq("id", editingAnnouncementId)
      : await supabase.from("announcements").insert([{ ...body, created_by: currentUser?.id ?? null }]);

    if (error) { showToast("Gagal menyimpan pengumuman: " + error.message, true); return; }
    showToast(editingAnnouncementId !== null ? "✓ Pengumuman berhasil diperbarui!" : "✓ Pengumuman berhasil dibuat!");

    showAnnouncementModal = false;
    announcementTitle = "";
    announcementContent = "";
    await loadAnnouncements();
  }

  async function deleteAnnouncement(id: number | undefined) {
    if (!isAdmin || id === undefined) return;
    if (!confirm("Hapus pengumuman ini?")) return;
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) { showToast("Gagal menghapus pengumuman: " + error.message, true); return; }
    showToast("✓ Pengumuman berhasil dihapus!");
    await loadAnnouncements();
  }

  /* =========================
     PENDAFTARAN SANTRI
  ========================= */

  async function loadPendaftaranSantri() {
    if (!isAdmin) return;
    loadingPendaftaran = true;
    try {
      // Ambil bertahap agar tidak terpotong batas baris per query Supabase.
      const all: PendaftaranSantri[] = [];
      const size = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("pendaftaran_santri").select("*")
          .order("created_at", { ascending: false })
          .range(from, from + size - 1);
        if (error) throw error;
        const page = (data || []) as PendaftaranSantri[];
        all.push(...page);
        if (page.length < size) break;
        from += size;
      }
      pendaftaranSantri = all;
    } catch (error: any) {
      console.error("Gagal memuat pendaftaran santri:", error);
      showToast("Gagal memuat pendaftaran santri: " + (error?.message || "Terjadi kesalahan."), true);
      pendaftaranSantri = [];
    } finally {
      loadingPendaftaran = false;
    }
  }

  function santriRows(p: PendaftaranSantri): [string, any][] {
    return [
      ["Nama lengkap", p.nama_santri], ["Tempat lahir", p.tempat_lahir],
      ["Tanggal lahir", p.tanggal_lahir ? formatTanggalPendaftaran(p.tanggal_lahir) : null],
      ["Jenis kelamin", p.jenis_kelamin], ["NIK", p.nik], ["NISN", p.nisn],
      ["Nomor HP", p.hp_santri], ["Jurusan", p.jurusan]
    ];
  }

  function parentRows(p: PendaftaranSantri, g: { p: string; hp: boolean }): [string, any][] {
    const r = p as unknown as Record<string, any>;
    const rows: [string, any][] = [
      ["Nama", r["nama_" + g.p]], ["Tahun lahir", r["tahun_" + g.p]],
      ["Pendidikan", r["pendidikan_" + g.p]], ["Pekerjaan", r["pekerjaan_" + g.p]],
      ["Penghasilan", r["penghasilan_" + g.p]]
    ];
    if (g.hp) rows.push(["Nomor HP", r["hp_" + g.p]]);
    return rows;
  }

  function addressRows(p: PendaftaranSantri): [string, any][] {
    return [
      ["Alamat", p.alamat], ["RT / RW", `${p.rt || "—"} / ${p.rw || "—"}`],
      ["Perumahan", p.nama_perumahan], ["Kelurahan", p.nama_kelurahan],
      ["Kecamatan", p.nama_kecamatan], ["Tanggal daftar", formatTanggalPendaftaran(p.created_at)]
    ];
  }

  function docsOf(p: PendaftaranSantri) {
    return [
      { title: "Bukti Pembayaran", icon: "💳", url: p.bukti_pembayaran, file: "bukti-pembayaran" },
      { title: "Kartu Keluarga", icon: "🏠", url: p.kk_path, file: "kartu-keluarga" },
      { title: "KTP", icon: "🪪", url: p.ktp_path, file: "ktp" }
    ];
  }

  function openPendaftaranDetail(p: PendaftaranSantri) {
    selectedPendaftar = p;
    showPendaftaranDetail = true;
  }

  function openPendaftaranEdit(p: PendaftaranSantri) {
    selectedPendaftar = p;
    pendaftaranForm = { ...p };
    showPendaftaranEdit = true;
  }

  async function savePendaftaranEdit() {
    if (!isAdmin || !pendaftaranForm.id || savingPendaftaran) return;
    if (!String(pendaftaranForm.nama_santri || "").trim()) { showToast("Nama santri wajib diisi.", true); return; }

    savingPendaftaran = true;
    try {
      const { id, created_at, ...payload } = pendaftaranForm;
      // Input kosong menjadi null, bukan string kosong.
      for (const k of Object.keys(payload)) if (payload[k] === "") payload[k] = null;

      const { error } = await supabase.from("pendaftaran_santri").update(payload).eq("id", id);
      if (error) throw error;

      pendaftaranSantri = pendaftaranSantri.map(i => (i.id === id ? ({ ...i, ...payload, id, created_at } as PendaftaranSantri) : i));
      selectedPendaftar = pendaftaranSantri.find(i => i.id === id) || null;
      showPendaftaranEdit = false;
      showToast("✓ Data pendaftaran berhasil diperbarui.");
    } catch (error: any) {
      showToast("Gagal mengubah data pendaftaran: " + (error?.message || "Terjadi kesalahan."), true);
    } finally {
      savingPendaftaran = false;
    }
  }

  function formatTanggalPendaftaran(value: string | null) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  }

  function openDokumenPreview(url: string | null, title: string) {
    const v = (url || "").trim();
    if (!v) { showToast("Dokumen belum diunggah.", true); return; }
    previewDokumenUrl = v;
    previewDokumenTitle = title;
  }

  function closeDokumenPreview() {
    previewDokumenUrl = "";
    previewDokumenTitle = "";
  }

  async function downloadDokumen(url: string | null, title: string, namaSantri = "santri") {
    const value = (url || "").trim();
    if (!value) { showToast("Dokumen belum diunggah.", true); return; }
    try {
      const res = await fetch(value);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const byType: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
      const ext = value.split("?")[0].split("#")[0].match(/\.([a-zA-Z0-9]{2,5})$/)?.[1] || byType[blob.type] || "file";
      const safe = `${title}-${namaSantri}`.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${safe}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      console.error("Gagal mengunduh dokumen pendaftaran:", error);
      showToast("Dokumen gagal diunduh. Periksa URL dan izin akses Storage Supabase.", true);
    }
  }
</script>

<svelte:head>
  <title>Daarulhikam · {meta.title}</title>
</svelte:head>

<div class="app">

  <!-- ================= SIDEBAR ================= -->
  <aside class="sidebar" class:open={sidebarOpen}>
    <div class="brand">
      <div class="brand-mark">🕌</div>
      <div>
        <h2>Daarulhikam</h2>
        <p>Sistem Informasi Pesantren</p>
      </div>
    </div>

    <nav class="nav" aria-label="Menu utama">
      {#each visibleNav as item}
        <button class="nav-item" class:active={activeView === item.view} on:click={() => changeView(item.view)}>
          <span class="nav-icon">{item.icon}</span>{item.label}
        </button>
      {/each}
    </nav>

    <div class="quote-card">
      <div class="quote-trophy">🏆</div>
      <p>“Ilmu adalah kunci kemajuan. Terus belajar, terus bertumbuh.”</p>
    </div>

    <button class="logout-side" on:click={logout}>🚪 Keluar Aplikasi</button>
  </aside>

  {#if sidebarOpen}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="overlay" on:click={() => (sidebarOpen = false)}></div>
  {/if}

  <!-- ================= MAIN ================= -->
  <main class="main">
    <header class="topbar">
      <button class="hamburger" aria-label="Buka menu" on:click={() => (sidebarOpen = !sidebarOpen)}>☰</button>

      <div class="page-title">
        <h1>{meta.title}</h1>
        <span>{meta.subtitle}</span>
      </div>

      <div class="top-actions">
        {#if activeView === "home" || activeView === "spp"}
          <label class="select-chip">
            <small>Tahun SPP</small>
            <select bind:value={selectedYear} on:change={loadSPPData}>
              {#each yearOptions as y}<option value={y}>{y}</option>{/each}
            </select>
          </label>
        {/if}

        <button class="icon-btn" title={theme === "light" ? "Beralih ke mode gelap" : "Beralih ke mode terang"} aria-label="Ganti tema" on:click={toggleTheme}>
          {theme === "light" ? "🌙" : "☀️"}
        </button>

        <div class="user-chip">
          <span class="avatar">{initial(currentUser)}</span>
          <div>
            <strong>{currentUser?.full_name || currentUser?.username || "User"}</strong>
            <small>{currentUser?.role || ""}</small>
          </div>
        </div>

        <button class="icon-btn logout-top" title="Keluar" aria-label="Keluar" on:click={logout}>🚪</button>
      </div>
    </header>

    {#if message}
      <div class="toast" class:error={isError} role="status">{message}</div>
    {/if}

    <section class="content">

      <!-- ================= HOME ================= -->
      {#if activeView === "home"}

        <div class="kpi-grid">
          {#each kpis as k}
            <button type="button" class="kpi {k.cls}" disabled={!k.role || !isAdmin} on:click={() => k.role && openRoleModal(k.role)}>
              <span class="kpi-icon">{k.icon}</span>
              <span class="kpi-body">
                <small>{k.label}</small>
                <strong>{k.value}</strong>
                <em>{k.note}</em>
              </span>
            </button>
          {/each}
        </div>

        <div class="grid-3">
          <div class="panel">
            <h3 class="panel-title">Absensi Hari Ini</h3>
            <p class="panel-sub">{formatDate(attendanceDate)}</p>
            <div class="donut-wrap">
              <div class="donut" style="background:{attendanceDonut}">
                <div class="donut-hole"><strong>{visibleSantri.length}</strong><span>Santri</span></div>
              </div>
              <ul class="legend">
                {#each todayCounts as c}
                  <li><i style="background:{attColors[c.status]}"></i>{attendanceLabel(c.status)}<b>{c.count}</b></li>
                {/each}
                <li><i style="background:{attColors.belum}"></i>Belum diisi<b>{todayUnfilled}</b></li>
              </ul>
            </div>
          </div>

          <div class="panel">
            <h3 class="panel-title">SPP Lunas per Bulan</h3>
            <p class="panel-sub">Persentase santri yang lunas · {selectedYear}</p>
            <div class="bars" role="img" aria-label="Grafik persentase SPP lunas per bulan">
              {#each sppMonthStats as m, i}
                <div class="bar-col" title="{m.count} santri lunas">
                  <span class="bar-val">{m.pct}%</span>
                  <div class="bar-track"><div class="bar-fill c{i % 5}" style="height:{m.pct}%"></div></div>
                  <span class="bar-label">{m.label}</span>
                </div>
              {/each}
            </div>
          </div>

          <div class="panel">
            <div class="panel-head tight">
              <h3 class="panel-title">📢 Pengumuman Terbaru</h3>
              <button class="link-btn" on:click={() => changeView("announcement")}>Lihat semua</button>
            </div>
            {#if announcements.length === 0}
              <p class="empty">Belum ada pengumuman.</p>
            {:else}
              <ul class="news-list">
                {#each announcements.slice(0, 4) as a}
                  <li>
                    <strong>{a.title}</strong>
                    <p>{a.content.length > 90 ? a.content.slice(0, 90) + "…" : a.content}</p>
                    <small>{formatDate(a.created_at)}</small>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </div>

        <div class="grid-2">
          <div class="panel">
            <h3 class="panel-title">Ringkasan per Kelas</h3>
            <p class="panel-sub">SPP tahun {selectedYear} dan kehadiran {formatDate(attendanceDate)}</p>
            <div class="table-wrap">
              <table class="table dark-head">
                <thead>
                  <tr>
                    <th>Kelas</th><th>Santri</th><th>Rata-rata SPP</th><th>Lunas</th><th>Hadir</th>
                    {#if isAdmin}<th>Saldo</th>{/if}
                  </tr>
                </thead>
                <tbody>
                  {#if classOverview.length === 0}
                    <tr><td colspan={isAdmin ? 6 : 5} class="empty">Belum ada data santri.</td></tr>
                  {:else}
                    {#each classOverview as c}
                      {@const pct = c.total ? Math.round((c.lunas / (c.total * 12)) * 100) : 0}
                      <tr>
                        <td><strong>{c.name}</strong></td>
                        <td>{c.total}</td>
                        <td>{(c.total ? c.lunas / c.total : 0).toFixed(1)} / 12 bln</td>
                        <td>
                          <div class="meter"><div style="width:{pct}%"></div></div>
                          <small>{pct}%</small>
                        </td>
                        <td>{c.hadir}/{c.total}</td>
                        {#if isAdmin}
                          <td class:neg={c.saldo < 0}>{c.saldo < 0 ? "- " : ""}Rp {formatRupiah(Math.abs(c.saldo))}</td>
                        {/if}
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>
          </div>

          <div class="panel">
            <h3 class="panel-title">Santri per Jenjang</h3>
            <p class="panel-sub">Berdasarkan kelas yang terdaftar</p>
            <div class="donut-wrap stack">
              <div class="donut" style="background:{levelDonut}">
                <div class="donut-hole"><strong>{visibleSantri.length}</strong><span>Total</span></div>
              </div>
              <ul class="legend">
                {#each levelStats as l}
                  <li><i style="background:{l.color}"></i>{l.level}<b>{l.count}</b></li>
                {/each}
              </ul>
            </div>
          </div>
        </div>

        <p class="foot-note">Data diperbarui {formatDate(localDate())} · Sumber: basis data Daarulhikam</p>

      <!-- ================= SPP ================= -->
      {:else if activeView === "spp"}

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">💳 Pembayaran SPP Santri</h3>
              <p class="panel-sub">Tahun {selectedYear}. {isAdmin ? "Klik kotak untuk mengubah status." : "Hanya admin yang dapat mengubah status."}</p>
            </div>
            <div class="actions">
              <button class="btn primary" on:click={exportSPPToExcel}>📊 Export Excel</button>
              <button class="btn ghost" on:click={() => changeView("home")}>← Kembali</button>
            </div>
          </div>

          <div class="toolbar">
            <label class="search"><span>🔍</span><input type="text" placeholder="Cari santri..." bind:value={searchKeyword} /></label>
          </div>

          <div class="table-wrap">
            <table class="table spp-table">
              <thead>
                <tr>
                  <th>Nama Santri</th>
                  {#each months as m}<th class="center">{m.label}</th>{/each}
                  <th class="center">Total</th>
                </tr>
              </thead>
              <tbody>
                {#if filteredSantri.length === 0}
                  <tr><td colspan="14" class="empty">Tidak ada santri.</td></tr>
                {:else}
                  {#each filteredSantri as s (s.id)}
                    <tr>
                      <td>
                        <div class="user-cell">
                          <span class="avatar sm">{initial(s)}</span>
                          <div><strong>{s.full_name || s.username}</strong><small>{s.class_name || "—"}</small></div>
                        </div>
                      </td>
                      {#each months as m}
                        {@const lunas = !!sppData[s.id]?.[m.key]}
                        <td class="center">
                          <button class="chip-spp" class:lunas class:belum={!lunas} disabled={!isAdmin}
                            aria-label="{m.label}: {lunas ? 'lunas' : 'belum'}"
                            on:click={() => toggleSPP(s.id, m.key)}>{lunas ? "✓" : "✕"}</button>
                        </td>
                      {/each}
                      <td class="center">
                        <span class="pill" class:full={getLunasCount(sppData, s.id) === 12}>{getLunasCount(sppData, s.id)}/12</span>
                      </td>
                    </tr>
                  {/each}
                {/if}
              </tbody>
            </table>
          </div>
        </div>

      <!-- ================= PENDAFTARAN ================= -->
      {:else if activeView === "pendaftaran"}

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">📝 Data Pendaftaran Santri</h3>
              <p class="panel-sub">Daftar calon santri yang masuk dari formulir pendaftaran.</p>
            </div>
            <div class="actions">
              <button class="btn primary" on:click={loadPendaftaranSantri} disabled={loadingPendaftaran}>{loadingPendaftaran ? "Memuat..." : "↻ Refresh Data"}</button>
              <button class="btn ghost" on:click={() => changeView("home")}>← Kembali</button>
            </div>
          </div>

          <div class="toolbar">
            <label class="search wide">
              <span>🔍</span>
              <input type="text" placeholder="Cari nama, NIK, NISN, jurusan, atau orang tua..." bind:value={pendaftaranSearch} />
              {#if pendaftaranSearch}<button type="button" class="clear" aria-label="Hapus pencarian" on:click={() => (pendaftaranSearch = "")}>✕</button>{/if}
            </label>
            <span class="count">Menampilkan <b>{filteredPendaftaranSantri.length}</b> dari <b>{pendaftaranSantri.length}</b> pendaftar</span>
          </div>

          {#if loadingPendaftaran}
            <div class="empty box">⏳ Memuat data pendaftaran...</div>
          {:else if filteredPendaftaranSantri.length === 0}
            <div class="empty box">
              {pendaftaranSearch ? `Data dengan kata "${pendaftaranSearch}" tidak ditemukan.` : "Belum ada data pendaftaran santri."}
            </div>
          {:else}
            <div class="reg-grid">
              {#each filteredPendaftaranSantri as p (p.id)}
                <article class="reg-card">
                  <div class="reg-head">
                    <span class="avatar lg">{initial({ full_name: p.nama_santri })}</span>
                    <div><h4>{p.nama_santri}</h4><small>Pendaftar #{p.id}</small></div>
                  </div>
                  <div class="tags">
                    {#if p.jurusan}<span class="tag">📚 {p.jurusan}</span>{/if}
                    {#if p.jenis_kelamin}<span class="tag">👤 {p.jenis_kelamin}</span>{/if}
                    <span class="tag" class:ok={!!p.bukti_pembayaran}>{p.bukti_pembayaran ? "✓ Bukti bayar" : "○ Belum bayar"}</span>
                  </div>
                  <dl class="kv">
                    <div><dt>Nomor HP</dt><dd>{show(p.hp_santri)}</dd></div>
                    <div><dt>Orang tua / wali</dt><dd>{show(p.nama_ayah || p.nama_ibu || p.nama_wali)}</dd></div>
                    <div><dt>Kecamatan</dt><dd>{show(p.nama_kecamatan)}</dd></div>
                    <div><dt>Didaftarkan</dt><dd>{formatTanggalPendaftaran(p.created_at)}</dd></div>
                  </dl>
                  <div class="actions">
                    <button type="button" class="btn primary grow" on:click={() => openPendaftaranDetail(p)}>Lihat Data Lengkap</button>
                    <button type="button" class="btn ghost grow" on:click={() => openPendaftaranEdit(p)}>✎ Ubah Data</button>
                  </div>
                </article>
              {/each}
            </div>
          {/if}
        </div>

      <!-- ================= USERS ================= -->
      {:else if activeView === "users"}

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">👥 Kelola User</h3>
              <p class="panel-sub">Tambah, edit, atau hapus santri, ustad, dan admin.</p>
            </div>
            <div class="actions">
              <button class="btn primary" on:click={openAddUserModal}>➕ Tambah User</button>
              <button class="btn ghost" on:click={() => changeView("home")}>← Kembali</button>
            </div>
          </div>

          <div class="toolbar">
            <label class="search wide">
              <span>🔍</span>
              <input type="text" placeholder="Cari nama, username, email, role, kelas..." bind:value={userManagementSearch} />
              {#if userManagementSearch}<button type="button" class="clear" aria-label="Hapus pencarian" on:click={() => (userManagementSearch = "")}>✕</button>{/if}
            </label>
            <span class="count">Menampilkan <b>{filteredManagedUsers.length}</b> dari <b>{users.length}</b> user</span>
          </div>

          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>ID</th><th>Nama</th><th>Role</th><th>Kelas</th><th class="center">Aksi</th></tr></thead>
              <tbody>
                {#if filteredManagedUsers.length === 0}
                  <tr><td colspan="5" class="empty">{userManagementSearch ? `User "${userManagementSearch}" tidak ditemukan.` : "Belum ada user."}</td></tr>
                {:else}
                  {#each filteredManagedUsers as u (u.id)}
                    <tr>
                      <td>{u.id}</td>
                      <td>
                        <div class="user-cell">
                          <span class="avatar sm">{initial(u)}</span>
                          <div><strong>{u.full_name || u.username}</strong><small>@{u.username} · {u.email || "-"}</small></div>
                        </div>
                      </td>
                      <td><span class="role {u.role}">{u.role}</span></td>
                      <td>
                        {#if u.class_name}
                          <span class="tag">🏫 {u.class_name}</span>
                          {#if u.class_id !== null}<small class="hint">ID Kelas: {u.class_id}</small>{/if}
                        {:else}<span class="muted">—</span>{/if}
                      </td>
                      <td>
                        <div class="row-actions">
                          {#if u.role === "santri"}
                            <button class="icon-sq" title="Lihat laporan santri" aria-label="Lihat laporan santri" on:click={() => openSantriReport(u)}>👁️</button>
                          {/if}
                          <button class="icon-sq" title="Edit" aria-label="Edit user" on:click={() => openEditUserModal(u)}>✏️</button>
                          <button class="icon-sq danger" title="Hapus" aria-label="Hapus user" on:click={() => deleteUser(u.id, u.username)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  {/each}
                {/if}
              </tbody>
            </table>
          </div>
        </div>

      <!-- ================= ABSENSI ================= -->
      {:else if activeView === "attendance"}

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">📅 {attendanceMode === "ustad" ? "Absensi Ustad" : "Absensi Santri"}</h3>
              <p class="panel-sub">{attendanceMode === "ustad" ? "Admin mencatat absensi ustad berdasarkan tanggal." : isAdmin ? "Lihat dan input absensi santri berdasarkan tanggal." : "Lihat riwayat kehadiran berdasarkan tanggal."}</p>
              {#if isAdmin}
                <div class="seg">
                  <button type="button" class:active={attendanceMode === "santri"} on:click={() => switchAttendanceMode("santri")}>Absensi Santri</button>
                  <button type="button" class:active={attendanceMode === "ustad"} on:click={() => switchAttendanceMode("ustad")}>Absensi Ustad</button>
                </div>
              {/if}
            </div>
            <div class="actions">
              {#if attendanceMode === "santri"}
                <button class="btn primary" on:click={exportAttendanceToExcel}>📊 Export Excel</button>
              {:else}
                <button class="btn primary" on:click={exportUstadMonthlyReport}>📊 Export Laporan Ustad</button>
              {/if}
              <button class="btn ghost" on:click={() => changeView("home")}>← Kembali</button>
            </div>
          </div>

          <label class="field narrow">
            <span>Pilih Tanggal</span>
            <input type="date" bind:value={attendanceDate} on:change={changeAttendanceDate} />
          </label>

          {#if attendanceMode === "santri"}

            {#if isAdmin}
              <div class="box filter-box">
                <strong>Jenjang Absensi</strong>
                <div class="seg">
                  <button type="button" class:active={attendanceSection === "SD"} on:click={() => pickSection("SD")}>🏫 SD</button>
                  <button type="button" class:active={attendanceSection === "SMP"} on:click={() => pickSection("SMP")}>🎓 SMP</button>
                  <button type="button" class:active={attendanceSection === "SMA"} on:click={() => pickSection("SMA")}>🎓 SMA</button>
                </div>
                {#if attendanceSection === "SMP"}
                  <div class="seg sub">
                    {#each ["1", "2", "3"] as k}
                      <button type="button" class:active={attendanceSmpClass === k} on:click={() => pickSection("SMP", k)}>Kelas {k}</button>
                    {/each}
                    <button type="button" class:active={attendanceSmpClass === ""} on:click={() => pickSection("SMP", "")}>Semua SMP</button>
                  </div>
                {/if}

                <div class="form-row">
                  <input class="input" type="search" placeholder="🔎 Cari nama/username santri..." bind:value={attendanceSearch} on:input={() => (selectedAttendanceUser = "")} />
                  <select class="input" bind:value={selectedAttendanceUser}>
                    <option value="">-- Pilih Santri ({filteredAttendanceSantri.length}) --</option>
                    {#each filteredAttendanceSantri as s}
                      <option value={String(s.id)}>{s.full_name || s.username}{s.class_name ? ` — ${s.class_name}` : ""}</option>
                    {/each}
                  </select>
                  <select class="input" bind:value={attendanceStatus}>
                    {#each attStatuses as st}<option value={st}>{attendanceLabel(st)}</option>{/each}
                  </select>
                  <button class="btn primary" on:click={saveAttendance}>✓ Simpan Absensi</button>
                </div>
              </div>
            {:else}
              <div class="toolbar">
                <label class="search"><span>🔍</span><input type="text" placeholder="Cari nama..." bind:value={attendanceSearch} /></label>
              </div>
            {/if}

            <div class="mini-stats">
              {#each attStatuses as st}
                <div><i style="background:{attColors[st]}"></i><span>{attendanceLabel(st)}</span>
                  <strong>{filteredAttendanceSantri.filter(s => getAttendance(attendanceData, s.id)?.status === st).length}</strong></div>
              {/each}
            </div>

            <div class="table-wrap">
              <table class="table">
                <thead><tr><th>Nama Santri</th><th>Kelas</th><th>Status</th><th>Tanggal</th></tr></thead>
                <tbody>
                  {#if filteredAttendanceSantri.length === 0}
                    <tr><td colspan="4" class="empty">Tidak ada santri{isSantriRole ? "" : ` pada jenjang ${attendanceSection}`}.</td></tr>
                  {:else}
                    {#each filteredAttendanceSantri as s (s.id)}
                      {@const a = getAttendance(attendanceData, s.id)}
                      <tr>
                        <td><strong>{s.full_name || s.username}</strong><small class="block">@{s.username}</small></td>
                        <td>{s.class_name || "-"}</td>
                        <td><span class="status {a ? a.status : 'belum'}">{attendanceLabel(a ? a.status : "belum")}</span></td>
                        <td>{attendanceDate}</td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>

          {:else if isAdmin}

            <div class="box filter-box">
              <strong>👨‍🏫 Input Absensi Ustad</strong>
              <div class="form-row">
                <input class="input" type="search" placeholder="🔎 Cari nama / username ustad..." bind:value={ustadAttendanceSearch} />
                <select class="input" bind:value={selectedUstadAttendanceUser} on:change={onUstadSelectChange}>
                  <option value="">-- Pilih Ustad ({filteredUstadAttendanceUsers.length}) --</option>
                  {#each filteredUstadAttendanceUsers as u}
                    <option value={String(u.id)}>{u.full_name || u.username}</option>
                  {/each}
                </select>
                <select class="input" bind:value={ustadAttendanceStatus}>
                  {#each attStatuses as st}<option value={st}>{attendanceLabel(st)}</option>{/each}
                </select>
                <button class="btn primary" disabled={savingUstadAttendance} on:click={saveUstadAttendance}>{savingUstadAttendance ? "Menyimpan..." : "✓ Simpan Absensi"}</button>
              </div>
            </div>

            <div class="mini-stats">
              {#each attStatuses as st}
                <div><i style="background:{attColors[st]}"></i><span>{attendanceLabel(st)}</span><strong>{ustadAttendance.filter(i => i.status === st).length}</strong></div>
              {/each}
            </div>

            <div class="table-wrap">
              <table class="table">
                <thead><tr><th>Nama Ustad</th><th>Status</th><th>Tanggal</th></tr></thead>
                <tbody>
                  {#if filteredUstadAttendanceUsers.length === 0}
                    <tr><td colspan="3" class="empty">Belum ada user dengan role ustad.</td></tr>
                  {:else}
                    {#each filteredUstadAttendanceUsers as u (u.id)}
                      {@const a = getAttendance(ustadAttendance, u.id)}
                      <tr>
                        <td><strong>{u.full_name || u.username}</strong><small class="block">@{u.username}</small></td>
                        <td><span class="status {a ? a.status : 'belum'}">{attendanceLabel(a ? a.status : "belum")}</span></td>
                        <td>{attendanceDate}</td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>

            <div class="box">
              <div class="panel-head tight">
                <div>
                  <h3 class="panel-title">📊 Laporan Absensi Ustad per Bulan</h3>
                  <p class="panel-sub">Rekap hadir, izin, sakit, dan alpha setiap ustad.</p>
                </div>
              </div>
              <div class="form-row">
                <label class="field"><span>Tahun</span>
                  <select bind:value={ustadReportYear} on:change={loadUstadMonthlyReport}>{#each yearOptions as y}<option value={y}>{y}</option>{/each}</select>
                </label>
                <label class="field"><span>Bulan</span>
                  <select bind:value={ustadReportMonth} on:change={loadUstadMonthlyReport}>{#each monthNames as n, i}<option value={i + 1}>{n}</option>{/each}</select>
                </label>
              </div>
              {#if loadingUstadReport}
                <div class="empty">⏳ Memuat laporan...</div>
              {:else}
                <div class="table-wrap">
                  <table class="table">
                    <thead><tr><th>No</th><th>Nama Ustad</th><th>Username</th><th>Hadir</th><th>Izin</th><th>Sakit</th><th>Alpha</th><th>Total</th></tr></thead>
                    <tbody>
                      {#if filteredUstadReportUsers.length === 0}
                        <tr><td colspan="8" class="empty">Belum ada user dengan role ustad.</td></tr>
                      {:else}
                        {#each filteredUstadReportUsers as u, i (u.id)}
                          <tr>
                            <td>{i + 1}</td><td><strong>{u.full_name || "-"}</strong></td><td>@{u.username}</td>
                            {#each attStatuses as st}<td>{getUstadMonthlyStatus(ustadReportData, u.id, st)}</td>{/each}
                            <td><strong>{getUstadMonthlyTotal(ustadReportData, u.id)}</strong></td>
                          </tr>
                        {/each}
                      {/if}
                    </tbody>
                  </table>
                </div>
              {/if}
            </div>
          {/if}
        </div>

      <!-- ================= JADWAL ================= -->
      {:else if activeView === "schedule"}

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">🗓️ Jadwal & Pengajar</h3>
              <p class="panel-sub">Dikelompokkan per hari. Satu hari dapat berisi banyak kelas, pelajaran, dan ustad.</p>
            </div>
            <div class="actions">
              {#if isAdmin}<button class="btn primary" on:click={openAddSchedule}>➕ Tambah Jadwal Hari</button>{/if}
              <button class="btn ghost" on:click={() => changeView("home")}>← Kembali</button>
            </div>
          </div>

          {#if schedules.length === 0}
            <p class="empty">Belum ada jadwal.</p>
          {:else}
            <div class="day-list">
              {#each schedulesByDay as g}
                {#if g.items.length > 0}
                  <div class="day-card">
                    <div class="day-title">📅 {g.day}</div>
                    <div class="table-wrap">
                      <table class="table">
                        <thead><tr><th>Kelas</th><th>Mata Pelajaran</th><th>Pengajar</th><th>Jam</th>{#if isAdmin}<th class="center">Aksi</th>{/if}</tr></thead>
                        <tbody>
                          {#each g.items as s (s.id)}
                            <tr>
                              <td><span class="tag">🏫 {s.class_name || "Belum ditentukan"}</span></td>
                              <td>
                                <div class="tags">
                                  {#if s.subject && s.subject !== "None"}<span class="tag blue">{s.subject}</span>{/if}
                                  {#if s.subject2 && s.subject2 !== "None"}<span class="tag violet">{s.subject2}</span>{/if}
                                  {#if (!s.subject || s.subject === "None") && (!s.subject2 || s.subject2 === "None")}<span class="muted">Tidak ada</span>{/if}
                                </div>
                              </td>
                              <td>👨‍🏫 {getTeacherName(s.teacher_id)}</td>
                              <td>🕒 {s.time}</td>
                              {#if isAdmin}
                                <td>
                                  <div class="row-actions">
                                    <button class="icon-sq" title="Edit" aria-label="Edit jadwal" on:click={() => openEditSchedule(s)}>✏️</button>
                                    <button class="icon-sq danger" title="Hapus" aria-label="Hapus jadwal" on:click={() => deleteSchedule(s.id)}>🗑️</button>
                                  </div>
                                </td>
                              {/if}
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        </div>

      <!-- ================= PENGUMUMAN ================= -->
      {:else if activeView === "announcement"}

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">📢 Pengumuman</h3>
              <p class="panel-sub">Informasi terbaru dari administrasi pesantren.</p>
            </div>
            <div class="actions">
              {#if isAdmin}<button class="btn primary" on:click={openAddAnnouncement}>➕ Buat Pengumuman</button>{/if}
              <button class="btn ghost" on:click={() => changeView("home")}>← Kembali</button>
            </div>
          </div>

          {#if announcements.length === 0}
            <div class="empty box">📭<br />Belum ada pengumuman.</div>
          {:else}
            <div class="news-full">
              {#each announcements as a (a.id)}
                <article class="news-card">
                  <div class="news-top">
                    <div><h4>📢 {a.title}</h4><small>{formatDate(a.created_at)}</small></div>
                    {#if isAdmin}
                      <div class="row-actions">
                        <button class="icon-sq" title="Edit" aria-label="Edit pengumuman" on:click={() => openEditAnnouncement(a)}>✏️</button>
                        <button class="icon-sq danger" title="Hapus" aria-label="Hapus pengumuman" on:click={() => deleteAnnouncement(a.id)}>🗑️</button>
                      </div>
                    {/if}
                  </div>
                  <div class="news-body">{a.content}</div>
                </article>
              {/each}
            </div>
          {/if}
        </div>

      <!-- ================= BARCODE ================= -->
      {:else if activeView === "barcode"}

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">🆔 Barcode {isAdmin ? "Santri & Ustad" : "Santri"}</h3>
              <p class="panel-sub">Setiap santri memiliki QR pribadi untuk absensi.</p>
            </div>
            <div class="actions">
              {#if isAdmin}
                <button class="btn primary" on:click={() => startQrScanner("santri")}>📷 Scan QR Santri</button>
                <button class="btn primary" on:click={() => startQrScanner("ustad")}>📷 Scan QR Ustad</button>
              {/if}
              <button class="btn ghost" on:click={() => changeView("home")}>← Kembali</button>
            </div>
          </div>

          <div class="qr-grid">
            {#if visibleSantri.length === 0}
              <p class="empty">Belum ada santri.</p>
            {:else}
              {#each visibleSantri as s (s.id)}
                <div class="qr-card">
                  <div class="user-cell"><span class="avatar sm">{initial(s)}</span><strong>{s.full_name || s.username}</strong></div>
                  <div class="qr-img"><img src={getQrImageUrl(s.id)} alt={`QR absensi ${s.full_name || s.username}`} loading="lazy" /></div>
                  <div class="qr-code">QR-{s.id}</div>
                  <small class="hint center">Scan QR ini untuk memilih santri di Absensi.</small>
                </div>
              {/each}
            {/if}
          </div>

          {#if isAdmin}
            <h3 class="panel-title sect">🧑‍🏫 Barcode ID Ustad</h3>
            <p class="panel-sub">QR ini dipakai admin untuk mencatat kehadiran ustad.</p>
            <div class="qr-grid">
              {#if ustadUsers.length === 0}
                <p class="empty">Belum ada ustad.</p>
              {:else}
                {#each ustadUsers as u (u.id)}
                  <div class="qr-card">
                    <div class="user-cell"><span class="avatar sm">{initial(u)}</span><strong>{u.full_name || u.username}</strong></div>
                    <div class="qr-img"><img src={getQrImageUrl(u.id, "ustad")} alt={`QR absensi ustad ${u.full_name || u.username}`} loading="lazy" /></div>
                    <div class="qr-code">USTAD-{u.id}</div>
                    <small class="hint center">Scan lewat tombol Scan QR Ustad untuk mencatat hadir.</small>
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
        </div>

      <!-- ================= TOP UP ================= -->
      {:else if activeView === "topup"}

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">➕ Top Up Saldo Santri</h3>
              <p class="panel-sub">Kirim saldo ke akun santri.</p>
            </div>
            <button class="btn ghost" on:click={() => changeView("home")}>← Kembali</button>
          </div>

          <form class="form-stack" on:submit|preventDefault={addTransaction}>
            <label class="field"><span>Pilih Santri</span>
              <input type="text" bind:value={transactionSantriSearch} placeholder="🔍 Cari nama, username, ID, atau kelas..." />
              <select bind:value={transactionUserId}>
                <option value="">-- Pilih Santri --</option>
                {#each filteredTransactionSantri as s}
                  <option value={String(s.id)}>{s.full_name || s.username || `Santri #${s.id}`}{s.class_name ? ` - ${s.class_name}` : ""}</option>
                {/each}
              </select>
            </label>
            <label class="field"><span>Keterangan</span><input type="text" placeholder="Contoh: Uang jajan" bind:value={transactionName} /></label>
            <label class="field"><span>Tanggal</span><input type="date" bind:value={transactionDate} /></label>
            <label class="field"><span>Jumlah Top Up</span><input type="number" placeholder="Contoh: 50000" min="1" bind:value={transactionAmount} /></label>
            <button type="submit" class="btn primary big">💸 Kirim Uang</button>
          </form>
        </div>

      <!-- ================= PENGELUARAN ================= -->
      {:else if activeView === "pocket-expense"}

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">💸 Pengeluaran Uang Jajan Santri</h3>
              <p class="panel-sub">Catat pemakaian saldo santri. Saldo berkurang otomatis.</p>
            </div>
            <button class="btn ghost" on:click={() => changeView("home")}>← Kembali</button>
          </div>

          <div class="split">
            <form class="form-stack" on:submit|preventDefault={addPocketExpense}>
              <label class="field"><span>🔎 Cari Santri</span>
                <input type="text" bind:value={pocketExpenseSantriSearch} placeholder="Cari nama, username, ID, atau kelas..." />
                <select bind:value={pocketExpenseUserId}>
                  <option value="">-- Pilih Santri --</option>
                  {#each filteredPocketExpenseSantri as s}
                    <option value={String(s.id)}>{s.full_name || s.username || `Santri #${s.id}`}{s.class_name ? ` - ${s.class_name}` : ""}</option>
                  {/each}
                </select>
              </label>

              <div class="balance-card">
                <span class="balance-icon">💰</span>
                <div>
                  <small>{selectedPocketExpenseBalance < 0 ? "Hutang Saat Ini" : "Saldo Saat Ini"}</small>
                  <strong class:neg={selectedPocketExpenseBalance < 0}>{selectedPocketExpenseBalance < 0 ? "- " : ""}Rp {formatRupiah(Math.abs(selectedPocketExpenseBalance))}</strong>
                  <small>{selectedPocketExpenseSantri ? selectedPocketExpenseSantri.full_name || selectedPocketExpenseSantri.username : "Pilih santri untuk melihat saldo"}</small>
                </div>
              </div>

              <label class="field"><span>Keterangan Pengeluaran</span><input type="text" bind:value={pocketExpenseName} placeholder="Contoh: Uang jajan" /></label>
              <label class="field"><span>Tanggal</span><input type="date" bind:value={pocketExpenseDate} /></label>
              <label class="field"><span>Jumlah Pengeluaran</span>
                <input type="number" min="1" step="1" bind:value={pocketExpenseAmount} placeholder="Contoh: 10000" />
                {#if selectedPocketExpenseSantri && Number(pocketExpenseAmount) > selectedPocketExpenseBalance}
                  <small class="warn">Saldo tidak mencukupi. Pengeluaran tetap dapat disimpan; kekurangannya menjadi hutang santri.</small>
                {/if}
              </label>
              <button type="submit" class="btn primary big" disabled={!selectedPocketExpenseSantri || !Number(pocketExpenseAmount)}>💸 Simpan Pengeluaran</button>
            </form>

            <div class="box">
              <h4 class="box-title">Ringkasan Saldo Santri</h4>
              {#if selectedPocketExpenseSantri}
                <div class="user-cell big">
                  <span class="avatar lg">{initial(selectedPocketExpenseSantri)}</span>
                  <div><strong>{selectedPocketExpenseSantri.full_name || selectedPocketExpenseSantri.username}</strong><small>{selectedPocketExpenseSantri.class_name || "Kelas belum diatur"}</small></div>
                </div>
                <div class="sum-grid">
                  <div><small>Total Masuk</small><strong class="pos">Rp {formatRupiah(sumKind(entries, selectedPocketExpenseSantri.id, "pemasukan"))}</strong></div>
                  <div><small>Total Keluar</small><strong class="neg">Rp {formatRupiah(sumKind(entries, selectedPocketExpenseSantri.id, "pengeluaran"))}</strong></div>
                  <div><small>{selectedPocketExpenseBalance < 0 ? "Hutang" : "Saldo"}</small><strong class:neg={selectedPocketExpenseBalance < 0}>{selectedPocketExpenseBalance < 0 ? "- " : ""}Rp {formatRupiah(Math.abs(selectedPocketExpenseBalance))}</strong></div>
                </div>
                {#if selectedPocketExpenseBalance < 0}
                  <div class="alert">⚠️ Santri memiliki hutang <b>Rp {formatRupiah(Math.abs(selectedPocketExpenseBalance))}</b>. Hutang berkurang saat ada top up berikutnya.</div>
                {/if}
              {:else}
                <p class="empty">👤 Pilih santri untuk melihat ringkasan saldo.</p>
              {/if}

              <h4 class="box-title spaced">Transaksi Terakhir</h4>
              {#if pocketRecentEntries.length === 0}
                <p class="empty">{selectedPocketExpenseSantri ? "Belum ada transaksi untuk santri ini." : "Pilih santri untuk melihat transaksi."}</p>
              {:else}
                <ul class="trx-list">
                  {#each pocketRecentEntries as e (e.id)}
                    <li>
                      <span class="trx-ico {e.kind}">{e.kind === "pemasukan" ? "↗" : "↘"}</span>
                      <div><strong>{e.name}</strong><small>{formatDate(e.date)}</small></div>
                      <b class:pos={e.kind === "pemasukan"} class:neg={e.kind === "pengeluaran"}>{e.kind === "pemasukan" ? "+" : "-"} Rp {formatRupiah(e.amount)}</b>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          </div>
        </div>

      <!-- ================= LAPORAN SANTRI ================= -->
      {:else if activeView === "santri-report"}

        <div class="panel" role="region" aria-labelledby="report-title">
          <div class="panel-head">
            <div>
              <h3 class="panel-title" id="report-title">👁️ Laporan Akun Santri</h3>
              <p class="panel-sub">Melihat data akun santri tanpa mengubah data.</p>
            </div>
            <button type="button" class="btn ghost" on:click={closeSantriReport}>← Kembali ke Kelola User</button>
          </div>

          {#if selectedSantriReport}
            <div class="box profile">
              <span class="avatar xl">{initial(selectedSantriReport)}</span>
              <div>
                <h4>{selectedSantriReport.full_name || selectedSantriReport.username}</h4>
                <p class="muted">@{selectedSantriReport.username}</p>
                <div class="tags">
                  <span class="tag">🆔 ID: {selectedSantriReport.id}</span>
                  <span class="tag">📧 {selectedSantriReport.email || "-"}</span>
                  <span class="tag">🏫 {selectedSantriReport.class_name || "Belum ada kelas"}</span>
                </div>
              </div>
            </div>
          {/if}

          {#if isLoadingSantriReport}
            <div class="empty">⏳ Memuat laporan santri...</div>
          {:else}
            <div class="report-stats">
              <div class="box"><small>SPP {selectedYear}</small><strong>{santriReportSpp ? months.filter(m => santriReportSpp?.[m.key]).length : 0}/12</strong><em>Bulan lunas</em></div>
              <div class="box"><small>Hadir</small><strong>{santriReportAttendance.filter(i => i.status === "hadir").length}</strong><em>Riwayat absensi</em></div>
              <div class="box"><small>Izin / Sakit</small><strong>{santriReportAttendance.filter(i => i.status === "izin" || i.status === "sakit").length}</strong><em>Riwayat absensi</em></div>
              <div class="box"><small>Alpha</small><strong>{santriReportAttendance.filter(i => i.status === "alpha").length}</strong><em>Riwayat absensi</em></div>
              <div class="box"><small>Saldo</small><strong class:neg={santriReportSaldo < 0}>Rp {formatRupiah(santriReportSaldo)}</strong><em>Transaksi tercatat</em></div>
            </div>

            <div class="box">
              <h4 class="box-title">💳 Status SPP {selectedYear}</h4>
              <div class="month-grid">
                {#each months as m}
                  {@const paid = !!santriReportSpp?.[m.key]}
                  <div class="month" class:paid><span>{m.label}</span><strong>{paid ? "✓ Lunas" : "✕ Belum"}</strong></div>
                {/each}
              </div>
            </div>

            <div class="grid-2 even">
              <div class="box">
                <h4 class="box-title">📅 Riwayat Absensi <small>({santriReportAttendance.length})</small></h4>
                {#if santriReportAttendance.length === 0}
                  <p class="empty">Belum ada riwayat absensi.</p>
                {:else}
                  <div class="table-wrap short">
                    <table class="table"><thead><tr><th>Tanggal</th><th>Status</th></tr></thead><tbody>
                      {#each santriReportAttendance as i}
                        <tr><td>{formatDate(i.date)}</td><td><span class="status {i.status}">{attendanceLabel(i.status)}</span></td></tr>
                      {/each}
                    </tbody></table>
                  </div>
                {/if}
              </div>
              <div class="box">
                <h4 class="box-title">💰 Riwayat Transaksi <small>({santriReportEntries.length})</small></h4>
                {#if santriReportEntries.length === 0}
                  <p class="empty">Belum ada transaksi.</p>
                {:else}
                  <div class="table-wrap short">
                    <table class="table"><thead><tr><th>Tanggal</th><th>Nama</th><th>Jenis</th><th>Jumlah</th></tr></thead><tbody>
                      {#each santriReportEntries as i}
                        <tr><td>{formatDate(i.date)}</td><td>{i.name}</td><td><span class="status {i.kind === 'pemasukan' ? 'hadir' : 'alpha'}">{i.kind === "pemasukan" ? "Masuk" : "Keluar"}</span></td><td>Rp {formatRupiah(i.amount)}</td></tr>
                      {/each}
                    </tbody></table>
                  </div>
                {/if}
              </div>
            </div>

            <div class="sum-grid three">
              <div class="box"><small>Total Pemasukan</small><strong class="pos">Rp {formatRupiah(santriReportPemasukan)}</strong></div>
              <div class="box"><small>Total Pengeluaran</small><strong class="neg">Rp {formatRupiah(santriReportPengeluaran)}</strong></div>
              <div class="box"><small>Saldo Bersih</small><strong class:neg={santriReportSaldo < 0}>Rp {formatRupiah(santriReportSaldo)}</strong></div>
            </div>
          {/if}
        </div>

      {/if}
    </section>
  </main>
</div>

<!-- ================= MODAL: DETAIL PENDAFTAR ================= -->
{#if showPendaftaranDetail && selectedPendaftar}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="backdrop" on:click={(e) => { if (e.target === e.currentTarget) showPendaftaranDetail = false; }}>
    <div class="modal wide" role="dialog" aria-modal="true" aria-label="Detail pendaftaran santri">
      <div class="modal-head">
        <div><h3>📋 Data Lengkap Pendaftar</h3><p class="panel-sub">{selectedPendaftar.nama_santri} · Pendaftar #{selectedPendaftar.id}</p></div>
        <button class="close" aria-label="Tutup" on:click={() => (showPendaftaranDetail = false)}>✕</button>
      </div>

      <div class="detail-grid">
        <div class="box"><h4 class="box-title">Data Santri</h4>
          <dl class="kv">{#each santriRows(selectedPendaftar) as [l, v]}<div><dt>{l}</dt><dd>{show(v)}</dd></div>{/each}</dl>
        </div>
        {#each parentGroups as g}
          <div class="box"><h4 class="box-title">{g.title}</h4>
            <dl class="kv">{#each parentRows(selectedPendaftar, g) as [l, v]}<div><dt>{l}</dt><dd>{show(v)}</dd></div>{/each}</dl>
          </div>
        {/each}
        <div class="box"><h4 class="box-title">Alamat</h4>
          <dl class="kv">{#each addressRows(selectedPendaftar) as [l, v]}<div><dt>{l}</dt><dd>{show(v)}</dd></div>{/each}</dl>
        </div>
      </div>

      <h4 class="box-title spaced">📎 Dokumen Pendaftaran</h4>
      <div class="doc-grid">
        {#each docsOf(selectedPendaftar) as d}
          <article class="doc-card">
            <div class="doc-title"><strong>{d.icon} {d.title}</strong><span class="tag" class:ok={!!d.url}>{d.url ? "Tersedia" : "Belum diunggah"}</span></div>
            {#if d.url}
              <button type="button" class="doc-preview" aria-label="Lihat {d.title}" on:click={() => openDokumenPreview(d.url, d.title)}>
                {#if isImageUrl(d.url)}<img src={d.url} alt="{d.title} {selectedPendaftar.nama_santri}" loading="lazy" />{:else}<span class="doc-file">📄 PDF</span>{/if}
                <span class="doc-open">🔍 Lihat</span>
              </button>
              <button type="button" class="btn ghost block" on:click={() => downloadDokumen(d.url, d.file, selectedPendaftar?.nama_santri || "santri")}>⬇ Unduh</button>
            {:else}
              <div class="doc-empty">Belum diunggah.</div>
            {/if}
          </article>
        {/each}
      </div>

      <div class="modal-foot">
        <button class="btn ghost" on:click={() => { const p = selectedPendaftar; showPendaftaranDetail = false; if (p) openPendaftaranEdit(p); }}>✎ Ubah Data</button>
        <button class="btn primary" on:click={() => (showPendaftaranDetail = false)}>Tutup</button>
      </div>
    </div>
  </div>
{/if}

<!-- ================= LIGHTBOX DOKUMEN ================= -->
{#if previewDokumenUrl}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="lightbox" on:click={(e) => { if (e.target === e.currentTarget) closeDokumenPreview(); }}>
    <div class="lightbox-box" role="dialog" aria-modal="true" aria-label={previewDokumenTitle}>
      <div class="lightbox-head">
        <strong>{previewDokumenTitle}</strong>
        <div class="actions">
          <a href={previewDokumenUrl} target="_blank" rel="noopener noreferrer">Buka tab baru ↗</a>
          <button type="button" class="btn ghost" on:click={() => downloadDokumen(previewDokumenUrl, previewDokumenTitle, selectedPendaftar?.nama_santri || "santri")}>⬇ Unduh</button>
          <button type="button" class="close" aria-label="Tutup" on:click={closeDokumenPreview}>✕</button>
        </div>
      </div>
      {#if isImageUrl(previewDokumenUrl)}
        <img src={previewDokumenUrl} alt={previewDokumenTitle} />
      {:else}
        <iframe src={previewDokumenUrl} title={previewDokumenTitle}></iframe>
      {/if}
    </div>
  </div>
{/if}

<!-- ================= MODAL: EDIT PENDAFTAR ================= -->
{#if showPendaftaranEdit}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="backdrop" on:click={(e) => { if (e.target === e.currentTarget && !savingPendaftaran) showPendaftaranEdit = false; }}>
    <div class="modal wide" role="dialog" aria-modal="true" aria-label="Ubah data pendaftaran santri">
      <div class="modal-head">
        <div><h3>✎ Ubah Data Pendaftar</h3><p class="panel-sub">Perubahan disimpan ke database pendaftaran.</p></div>
        <button class="close" aria-label="Tutup" on:click={() => (showPendaftaranEdit = false)}>✕</button>
      </div>

      <div class="edit-grid">
        {#each santriTextFields as f}
          <label class="field"><span>{f.label}</span><input type="text" bind:value={pendaftaranForm[f.key]} /></label>
        {/each}
        <label class="field"><span>Tanggal lahir</span><input type="date" bind:value={pendaftaranForm.tanggal_lahir} /></label>
        <label class="field full"><span>Alamat lengkap</span><textarea rows="3" bind:value={pendaftaranForm.alamat}></textarea></label>

        {#each parentGroups as g}
          <h4 class="full box-title">{g.title}</h4>
          <label class="field"><span>Nama</span><input type="text" bind:value={pendaftaranForm["nama_" + g.p]} /></label>
          <label class="field"><span>Tahun lahir</span><input type="number" bind:value={pendaftaranForm["tahun_" + g.p]} /></label>
          <label class="field"><span>Pendidikan</span><input type="text" bind:value={pendaftaranForm["pendidikan_" + g.p]} /></label>
          <label class="field"><span>Pekerjaan</span><input type="text" bind:value={pendaftaranForm["pekerjaan_" + g.p]} /></label>
          <label class="field"><span>Penghasilan</span><input type="text" bind:value={pendaftaranForm["penghasilan_" + g.p]} /></label>
          {#if g.hp}<label class="field"><span>Nomor HP</span><input type="text" bind:value={pendaftaranForm["hp_" + g.p]} /></label>{/if}
        {/each}
      </div>

      <div class="modal-foot">
        <button class="btn ghost" disabled={savingPendaftaran} on:click={() => (showPendaftaranEdit = false)}>Batal</button>
        <button class="btn primary" disabled={savingPendaftaran} on:click={savePendaftaranEdit}>{savingPendaftaran ? "Menyimpan..." : "Simpan Perubahan"}</button>
      </div>
    </div>
  </div>
{/if}

<!-- ================= MODAL: QR ================= -->
{#if showQrScanner}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="backdrop" on:click={(e) => { if (e.currentTarget === e.target) finishScan(); }}>
    <div class="modal" role="dialog" aria-modal="true" aria-label="Scan QR Absensi">
      <div class="modal-head">
        <div><h3>📷 Scan QR Absensi {qrScannerMode === "ustad" ? "Ustad" : "Santri"}</h3><p class="panel-sub">Arahkan kamera belakang ke QR {qrScannerMode}.</p></div>
        <button class="close" aria-label="Tutup scanner" on:click={finishScan}>✕</button>
      </div>
      <div class="cam">
        <video bind:this={qrVideoElement} playsinline muted></video>
        <div class="cam-frame" aria-hidden="true"></div>
      </div>
      {#if qrScannerError}<div class="alert err">{qrScannerError}</div>{:else}<p class="panel-sub center">Memindai QR secara otomatis…</p>{/if}
      <div class="modal-foot"><button class="btn ghost" on:click={finishScan}>Tutup</button></div>
    </div>
  </div>
{/if}

<!-- ================= MODAL: USER ================= -->
{#if showUserModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="backdrop" on:click={() => { if (!isSavingUser) showUserModal = false; }}>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title" on:click|stopPropagation>
      <div class="modal-head">
        <div>
          <h3 id="user-modal-title">{editingUserId !== null ? "✏️ Edit User" : "➕ Tambah User"}</h3>
          <p class="panel-sub">{editingUserId !== null ? "Perbarui data akun user." : "Tambahkan akun user baru."}</p>
        </div>
        <button type="button" class="close" aria-label="Tutup" disabled={isSavingUser} on:click={() => (showUserModal = false)}>✕</button>
      </div>

      <label class="field"><span>Nama Lengkap</span><input type="text" placeholder="Masukkan nama lengkap" bind:value={formFullName} disabled={isSavingUser} /></label>
      <label class="field"><span>Username</span><input type="text" placeholder="Masukkan username" bind:value={formUsername} disabled={isSavingUser} /></label>
      <label class="field"><span>Email</span><input type="email" placeholder="Masukkan email" bind:value={formEmail} disabled={isSavingUser} /></label>
      <label class="field"><span>{editingUserId !== null ? "Password Baru (opsional)" : "Password"}</span>
        <input type="password" placeholder={editingUserId !== null ? "Kosongkan jika tidak diubah" : "Minimal 6 karakter"} bind:value={formPassword} disabled={isSavingUser} /></label>
      <label class="field"><span>Konfirmasi Password</span>
        <input type="password" placeholder="Ulangi password" bind:value={formConfirmPassword} disabled={isSavingUser} on:keydown={(e) => { if (e.key === "Enter") saveUser(); }} /></label>
      <label class="field"><span>Role</span>
        <select bind:value={formRole} on:change={handleRoleChange} disabled={isSavingUser}>
          <option value="santri">Santri</option><option value="ustad">Ustad / Pengajar</option><option value="admin">Admin</option>
        </select></label>

      {#if formRole === "santri"}
        <label class="field"><span>Kelas <b class="req">*</b></span>
          <select bind:value={formClassId} disabled={isSavingUser}>
            <option value={null}>-- Pilih Kelas --</option>
            {#each userClassOptions as k}<option value={k.id}>{k.name}</option>{/each}
          </select>
          <small class="hint">Kelas disimpan berdasarkan ID dari tabel classes.</small></label>
      {/if}

      <div class="modal-foot">
        <button type="button" class="btn ghost" disabled={isSavingUser} on:click={() => (showUserModal = false)}>Batal</button>
        <button type="button" class="btn primary" disabled={isSavingUser} on:click={saveUser}>
          {#if isSavingUser}⏳ Menyimpan...{:else if editingUserId !== null}💾 Simpan Perubahan{:else}➕ Tambah User{/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ================= MODAL: ROLE ================= -->
{#if showRoleModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="backdrop" on:click={closeRoleModal}>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="modal" role="dialog" aria-modal="true" aria-label="Daftar {selectedRole}" on:click|stopPropagation>
      <div class="modal-head">
        <div><h3>👥 Daftar {selectedRole ? selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1) : "User"}</h3><p class="panel-sub">Total {roleUsers.length}</p></div>
        <button type="button" class="close" aria-label="Tutup" on:click={closeRoleModal}>✕</button>
      </div>
      <div class="role-list">
        {#if roleUsers.length === 0}
          <p class="empty">Belum ada data.</p>
        {:else}
          {#each roleUsers as u (u.id)}
            <div class="role-item">
              <span class="avatar">{initial(u)}</span>
              <div class="role-info">
                <strong>{u.full_name || u.username}</strong>
                <small>@{u.username} · {u.email || "-"}</small>
                {#if u.role === "santri" && u.class_name}<small>🏫 {u.class_name}</small>{/if}
              </div>
              <span class="role {u.role}">{u.role}</span>
            </div>
          {/each}
        {/if}
      </div>
      <div class="modal-foot"><button type="button" class="btn ghost" on:click={closeRoleModal}>Tutup</button></div>
    </div>
  </div>
{/if}

<!-- ================= MODAL: JADWAL ================= -->
{#if showScheduleModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="backdrop" on:click={() => (showScheduleModal = false)}>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="modal wide scroll" role="dialog" aria-modal="true" aria-label="Form jadwal" on:click|stopPropagation>
      <div class="modal-head">
        <h3>{editingScheduleId !== null ? "✏️ Edit Jadwal" : "➕ Tambah Jadwal per Hari"}</h3>
        <button class="close" aria-label="Tutup" on:click={() => (showScheduleModal = false)}>✕</button>
      </div>

      <label class="field"><span>📅 Hari</span>
        <select bind:value={scheduleDay}><option value="">Pilih Hari</option>{#each dayOptions as d}<option value={d}>{d}</option>{/each}</select></label>

      {#each scheduleItems as item, index}
        <div class="box sched-item">
          <div class="panel-head tight">
            <strong>Kelompok Jadwal {index + 1}</strong>
            {#if editingScheduleId === null && scheduleItems.length > 1}
              <button type="button" class="btn danger sm" on:click={() => removeScheduleItem(index)}>🗑️ Hapus</button>
            {/if}
          </div>
          <label class="field"><span>🏫 Kelas</span>
            <select bind:value={item.class_name}><option value="">Pilih Kelas</option>{#each scheduleClassOptions as c}<option value={c}>{c}</option>{/each}</select></label>
          <label class="field"><span>📚 Mata Pelajaran 1</span>
            <select bind:value={item.subject}>{#each subjectOptions as s}<option value={s}>{s === "None" ? "Tidak Ada" : s}</option>{/each}</select></label>
          <label class="field"><span>📚 Mata Pelajaran 2 <small>(opsional)</small></span>
            <select bind:value={item.subject2}>{#each subjectOptions as s}<option value={s}>{s === "None" ? "Tidak Ada / 1 Pelajaran Saja" : s}</option>{/each}</select></label>
          <label class="field"><span>👨‍🏫 Ustad Pengajar</span>
            <select bind:value={item.teacher_id}>
              <option value="">Pilih Ustad</option>
              {#if ustadUsers.length === 0}<option disabled value="">Belum ada user dengan role Ustad</option>
              {:else}{#each ustadUsers as u}<option value={String(u.id)}>{u.full_name || u.username}</option>{/each}{/if}
            </select>
            <small class="hint">Hanya user dengan role Ustad yang dapat dipilih.</small></label>
          <label class="field"><span>🕒 Jam</span><input type="text" placeholder="Contoh: 08:00 - 09:00" bind:value={item.time} /></label>
        </div>
      {/each}

      {#if editingScheduleId === null}
        <button type="button" class="btn dashed block" on:click={addScheduleItem}>➕ Tambah Kelompok Jadwal / Ustad</button>
      {/if}

      <div class="modal-foot">
        <button class="btn ghost" on:click={() => (showScheduleModal = false)}>Batal</button>
        <button class="btn primary" on:click={saveSchedule}>💾 {editingScheduleId !== null ? "Simpan Perubahan" : "Simpan Semua Jadwal"}</button>
      </div>
    </div>
  </div>
{/if}

<!-- ================= MODAL: PENGUMUMAN ================= -->
{#if showAnnouncementModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="backdrop" on:click={() => (showAnnouncementModal = false)}>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="modal" role="dialog" aria-modal="true" aria-label="Form pengumuman" on:click|stopPropagation>
      <div class="modal-head">
        <h3>{editingAnnouncementId !== null ? "Edit Pengumuman" : "Buat Pengumuman"}</h3>
        <button class="close" aria-label="Tutup" on:click={() => (showAnnouncementModal = false)}>✕</button>
      </div>
      <label class="field"><span>Judul Pengumuman</span><input type="text" placeholder="Masukkan judul..." bind:value={announcementTitle} /></label>
      <label class="field"><span>Isi Pengumuman</span><textarea rows="6" placeholder="Tulis isi pengumuman..." bind:value={announcementContent}></textarea></label>
      <div class="modal-foot">
        <button class="btn ghost" on:click={() => (showAnnouncementModal = false)}>Batal</button>
        <button class="btn primary" on:click={saveAnnouncement}>💾 Simpan</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* =========================================================
     TOKEN WARNA — terang (default) dan gelap
  ========================================================= */
  :global(:root) {
    --page: linear-gradient(135deg, #e6e9ff 0%, #efe7ff 55%, #e3f1ff 100%);
    --surface: #f5f7fd;
    --card: #ffffff;
    --card-alt: #f1f4fb;
    --text: #172033;
    --muted: #64708a;
    --border: #e2e7f2;
    --track: #e5e9f4;
    --accent: #2f5bea;
    --accent-soft: #e8eeff;
    --accent-text: #ffffff;
    --head-bg: #131c4a;
    --head-text: #ffffff;
    --pos: #15803d;
    --neg: #dc2626;
    --warn-bg: #fff7ed;
    --warn-border: #fdba74;
    --warn-text: #9a3412;
    --shadow: 0 6px 24px rgba(30, 41, 90, 0.08);
    --overlay: rgba(10, 15, 40, 0.6);
    --side-1: #0c1440;
    --side-2: #070b26;
    color-scheme: light;
  }

  :global([data-theme="dark"]) {
    --page: linear-gradient(135deg, #070a1a 0%, #0c1030 55%, #0a1226 100%);
    --surface: #0f1530;
    --card: #161d3d;
    --card-alt: #1b2347;
    --text: #e8ecfa;
    --muted: #96a0c0;
    --border: #272f55;
    --track: #262e54;
    --accent: #6c8cff;
    --accent-soft: #212b5c;
    --accent-text: #0a0f26;
    --head-bg: #0a0f2c;
    --head-text: #e8ecfa;
    --pos: #4ade80;
    --neg: #f87171;
    --warn-bg: #3a2415;
    --warn-border: #7c4a1f;
    --warn-text: #fdba74;
    --shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
    --overlay: rgba(0, 0, 0, 0.75);
    --side-1: #090e2c;
    --side-2: #050819;
    color-scheme: dark;
  }

  :global(*) { box-sizing: border-box; }
  :global(body) {
    margin: 0;
    background: var(--page);
    background-attachment: fixed;
    color: var(--text);
    font-family: "Plus Jakarta Sans", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif;
    transition: background 0.25s, color 0.25s;
  }
  :global(button), :global(input), :global(select), :global(textarea) { font-family: inherit; }
  :global(:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }

  /* =========================================================
     LAYOUT
  ========================================================= */
  .app { display: flex; min-height: 100vh; padding: 14px; gap: 14px; }

  .sidebar {
    position: sticky; top: 14px; align-self: flex-start;
    width: 244px; height: calc(100vh - 28px); flex-shrink: 0;
    display: flex; flex-direction: column; gap: 18px;
    padding: 20px 14px 16px;
    border-radius: 24px;
    background: linear-gradient(180deg, var(--side-1), var(--side-2));
    color: #fff; z-index: 100; overflow-y: auto;
    box-shadow: var(--shadow);
  }
  .brand { display: flex; align-items: center; gap: 11px; padding: 0 6px; }
  .brand-mark { font-size: 22px; background: rgba(255, 255, 255, 0.12); border-radius: 12px; padding: 8px; }
  .brand h2 { margin: 0; font-size: 17px; letter-spacing: 0.2px; }
  .brand p { margin: 2px 0 0; font-size: 10.5px; opacity: 0.7; }

  .nav { display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .nav-item {
    display: flex; align-items: center; gap: 11px; width: 100%;
    border: 0; background: transparent; color: rgba(255, 255, 255, 0.78);
    text-align: left; padding: 11px 12px; border-radius: 12px;
    font-size: 13.5px; font-weight: 500; cursor: pointer; transition: background 0.15s, color 0.15s;
  }
  .nav-item:hover { background: rgba(255, 255, 255, 0.09); color: #fff; }
  .nav-item.active { background: linear-gradient(90deg, #2563eb, #3b82f6); color: #fff; font-weight: 700; box-shadow: 0 6px 16px rgba(37, 99, 235, 0.45); }
  .nav-icon { width: 22px; text-align: center; }

  .quote-card {
    padding: 14px; border-radius: 16px; text-align: center;
    background: rgba(255, 255, 255, 0.07); border: 1px solid rgba(255, 255, 255, 0.12);
  }
  .quote-trophy { font-size: 26px; }
  .quote-card p { margin: 6px 0 0; font-size: 12px; line-height: 1.55; opacity: 0.88; }
  .logout-side {
    border: 0; padding: 11px; border-radius: 12px; cursor: pointer;
    background: rgba(239, 68, 68, 0.22); color: #fff; font-weight: 600; font-size: 13px;
  }
  .logout-side:hover { background: rgba(239, 68, 68, 0.38); }
  .overlay { display: none; }

  .main {
    flex: 1; min-width: 0;
    background: var(--surface); border-radius: 24px;
    padding: 22px 24px 20px; box-shadow: var(--shadow);
    border: 1px solid var(--border);
  }

  .topbar { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; flex-wrap: wrap; }
  .hamburger { display: none; border: 0; background: var(--card); color: var(--text); font-size: 20px; width: 40px; height: 40px; border-radius: 12px; cursor: pointer; border: 1px solid var(--border); }
  .page-title { flex: 1; min-width: 160px; }
  .page-title h1 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.4px; }
  .page-title span { color: var(--muted); font-size: 13px; }
  .top-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

  .select-chip {
    display: flex; flex-direction: column; gap: 1px; padding: 6px 12px;
    background: var(--card); border: 1px solid var(--border); border-radius: 12px;
  }
  .select-chip small { font-size: 10px; color: var(--muted); }
  .select-chip select { border: 0; background: transparent; color: var(--text); font-weight: 700; font-size: 13px; outline-offset: 4px; cursor: pointer; }
  .select-chip select option { background: var(--card); color: var(--text); }

  .icon-btn {
    width: 42px; height: 42px; border-radius: 12px; cursor: pointer; font-size: 17px;
    background: var(--accent); color: var(--accent-text); border: 0;
  }
  .icon-btn.logout-top { background: var(--card); border: 1px solid var(--border); color: var(--text); }
  .user-chip { display: flex; align-items: center; gap: 9px; padding: 5px 12px 5px 6px; background: var(--card); border: 1px solid var(--border); border-radius: 14px; }
  .user-chip strong { display: block; font-size: 13px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .user-chip small { color: var(--muted); font-size: 11px; text-transform: capitalize; }

  .avatar {
    display: inline-grid; place-items: center; flex-shrink: 0;
    width: 34px; height: 34px; border-radius: 50%;
    background: var(--accent-soft); color: var(--accent); font-weight: 800; font-size: 13px;
  }
  .avatar.sm { width: 30px; height: 30px; font-size: 12px; }
  .avatar.lg { width: 44px; height: 44px; border-radius: 14px; font-size: 18px; }
  .avatar.xl { width: 64px; height: 64px; font-size: 25px; }

  .toast {
    position: fixed; top: 22px; right: 22px; z-index: 2000; padding: 13px 18px;
    border-radius: 14px; font-size: 13px; font-weight: 600; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    max-width: min(420px, calc(100vw - 44px));
  }
  .toast:not(.error) { background: #dcfce7; color: #166534; }
  .toast.error { background: #fee2e2; color: #b91c1c; }

  /* =========================================================
     KARTU & PANEL
  ========================================================= */
  .content { display: flex; flex-direction: column; gap: 16px; }

  .kpi-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; }
  .kpi {
    display: flex; align-items: center; gap: 13px; padding: 18px 16px; border: 0;
    border-radius: 18px; color: #fff; text-align: left; font: inherit;
    box-shadow: 0 10px 22px rgba(30, 41, 90, 0.18);
    transition: transform 0.15s;
  }
  .kpi:not(:disabled) { cursor: pointer; }
  .kpi:not(:disabled):hover { transform: translateY(-3px); }
  .kpi:disabled { opacity: 1; cursor: default; }
  .kpi-icon { display: grid; place-items: center; width: 50px; height: 50px; border-radius: 50%; background: rgba(255, 255, 255, 0.22); font-size: 24px; flex-shrink: 0; }
  .kpi-body { display: flex; flex-direction: column; min-width: 0; }
  .kpi-body small { font-size: 11.5px; opacity: 0.92; font-weight: 600; }
  .kpi-body strong { font-size: 28px; line-height: 1.15; font-weight: 800; }
  .kpi-body em { font-style: normal; font-size: 11px; opacity: 0.9; }
  .k-blue { background: linear-gradient(135deg, #2563eb, #4f46e5); }
  .k-green { background: linear-gradient(135deg, #059669, #22c55e); }
  .k-purple { background: linear-gradient(135deg, #7c3aed, #a855f7); }
  .k-orange { background: linear-gradient(135deg, #ea580c, #fb923c); }
  .k-teal { background: linear-gradient(135deg, #0e7490, #14b8a6); }

  .grid-3 { display: grid; grid-template-columns: 1fr 1.35fr 1fr; gap: 14px; }
  .grid-2 { display: grid; grid-template-columns: 1.9fr 1fr; gap: 14px; }
  .grid-2.even { grid-template-columns: 1fr 1fr; }

  .panel {
    background: var(--card); border: 1px solid var(--border); border-radius: 18px;
    padding: 18px; min-width: 0;
  }
  .panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-wrap: wrap; margin-bottom: 16px; }
  .panel-head.tight { margin-bottom: 10px; align-items: center; }
  .panel-title { margin: 0; font-size: 15px; font-weight: 800; }
  .panel-title.sect { margin-top: 28px; }
  .panel-sub { margin: 4px 0 0; font-size: 12px; color: var(--muted); }
  .panel-sub.center { text-align: center; margin-top: 12px; }
  .link-btn { border: 0; background: transparent; color: var(--accent); font-weight: 700; font-size: 12px; cursor: pointer; }

  .box { background: var(--card-alt); border: 1px solid var(--border); border-radius: 14px; padding: 14px; min-width: 0; }
  .box + .box, .box + .table-wrap, .toolbar + .box, .panel > .box { margin-top: 14px; }
  .box-title { margin: 0 0 10px; font-size: 14px; font-weight: 800; }
  .box-title.spaced { margin-top: 18px; }
  .box-title small { color: var(--muted); font-weight: 600; }

  .actions { display: flex; gap: 8px; flex-wrap: wrap; }

  /* ---------- donut ---------- */
  .donut-wrap { display: flex; align-items: center; gap: 18px; margin-top: 14px; flex-wrap: wrap; }
  .donut-wrap.stack { flex-direction: column; align-items: stretch; }
  .donut-wrap.stack .donut { align-self: center; }
  .donut { position: relative; width: 150px; height: 150px; border-radius: 50%; flex-shrink: 0; }
  .donut-hole {
    position: absolute; inset: 22px; border-radius: 50%; background: var(--card);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .donut-hole strong { font-size: 26px; font-weight: 800; line-height: 1; }
  .donut-hole span { font-size: 11px; color: var(--muted); }
  .legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; flex: 1; min-width: 130px; font-size: 12.5px; }
  .legend li { display: flex; align-items: center; gap: 8px; }
  .legend i { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .legend b { margin-left: auto; font-weight: 800; }

  /* ---------- bar chart ---------- */
  .bars { display: flex; gap: 6px; align-items: flex-end; height: 200px; margin-top: 16px; }
  .bar-col { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .bar-val { font-size: 9.5px; color: var(--muted); font-weight: 700; }
  .bar-track { flex: 1; width: 100%; max-width: 26px; display: flex; align-items: flex-end; background: var(--track); border-radius: 8px 8px 4px 4px; overflow: hidden; }
  .bar-fill { width: 100%; border-radius: 8px 8px 0 0; min-height: 0; transition: height 0.4s; }
  .bar-label { font-size: 10.5px; color: var(--muted); }
  .c0 { background: linear-gradient(180deg, #3b82f6, #2563eb); }
  .c1 { background: linear-gradient(180deg, #4ade80, #16a34a); }
  .c2 { background: linear-gradient(180deg, #a78bfa, #7c3aed); }
  .c3 { background: linear-gradient(180deg, #fdba74, #f97316); }
  .c4 { background: linear-gradient(180deg, #5eead4, #0d9488); }

  /* ---------- pengumuman beranda ---------- */
  .news-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .news-list li { padding: 11px 12px; border-radius: 12px; background: var(--card-alt); border: 1px solid var(--border); }
  .news-list strong { font-size: 13px; }
  .news-list p { margin: 4px 0; font-size: 12px; color: var(--muted); line-height: 1.5; }
  .news-list small { font-size: 11px; color: var(--muted); }

  .foot-note { text-align: center; font-size: 11.5px; color: var(--muted); margin: 4px 0 0; }

  /* =========================================================
     TABEL
  ========================================================= */
  .table-wrap { width: 100%; overflow-x: auto; border-radius: 12px; }
  .table-wrap.short { max-height: 340px; overflow-y: auto; }
  .table { width: 100%; min-width: 560px; border-collapse: collapse; font-size: 12.5px; }
  .table th { text-align: left; padding: 11px 10px; background: var(--card-alt); color: var(--muted); font-weight: 700; font-size: 11.5px; border-bottom: 1px solid var(--border); white-space: nowrap; }
  .table td { padding: 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  .table tbody tr:hover { background: var(--card-alt); }
  .table.dark-head th { background: var(--head-bg); color: var(--head-text); }
  .table.dark-head th:first-child { border-top-left-radius: 10px; }
  .table.dark-head th:last-child { border-top-right-radius: 10px; }
  .spp-table { min-width: 900px; }
  .center { text-align: center !important; }
  .empty { text-align: center; color: var(--muted); padding: 24px 12px; font-size: 13px; }
  .empty.box { margin-top: 14px; }
  .block { display: block; }
  .neg { color: var(--neg) !important; }
  .pos { color: var(--pos) !important; }
  .muted { color: var(--muted); }
  small.hint { display: block; margin-top: 4px; color: var(--muted); font-size: 11.5px; }
  small.hint.center { text-align: center; }
  small.warn { color: var(--warn-text); font-size: 12px; line-height: 1.45; }
  .req { color: var(--neg); }

  .meter { height: 7px; width: 90px; border-radius: 99px; background: var(--track); overflow: hidden; display: inline-block; vertical-align: middle; margin-right: 6px; }
  .meter > div { height: 100%; background: linear-gradient(90deg, #22c55e, #16a34a); border-radius: 99px; }

  .user-cell { display: flex; align-items: center; gap: 9px; }
  .user-cell small { display: block; color: var(--muted); font-size: 11px; }
  .user-cell.big { margin: 14px 0; }

  .chip-spp { width: 26px; height: 26px; border: 0; border-radius: 8px; font-weight: 800; cursor: pointer; }
  .chip-spp:disabled { cursor: not-allowed; opacity: 0.75; }
  .chip-spp.lunas { background: #dcfce7; color: #15803d; }
  .chip-spp.belum { background: #fee2e2; color: #dc2626; }
  [data-theme="dark"] .chip-spp.lunas { background: #14532d; color: #86efac; }
  [data-theme="dark"] .chip-spp.belum { background: #5b1b1b; color: #fca5a5; }

  .pill { display: inline-block; padding: 4px 9px; border-radius: 99px; background: var(--card-alt); font-weight: 800; font-size: 12px; }
  .pill.full { background: #dcfce7; color: #15803d; }

  .role, .status, .tag {
    display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px;
    border-radius: 99px; font-size: 11.5px; font-weight: 700; background: var(--card-alt); color: var(--text);
  }
  .role { text-transform: uppercase; font-size: 10px; }
  .role.santri { background: #e0f2fe; color: #0369a1; }
  .role.admin { background: #ffedd5; color: #c2410c; }
  .role.ustad { background: #ede9fe; color: #6d28d9; }
  .status.hadir { background: #dcfce7; color: #15803d; }
  .status.izin { background: #dbeafe; color: #1d4ed8; }
  .status.sakit { background: #fef3c7; color: #b45309; }
  .status.alpha { background: #fee2e2; color: #dc2626; }
  .status.belum { background: var(--card-alt); color: var(--muted); }
  .tag.ok { background: #dcfce7; color: #15803d; }
  .tag.blue { background: #e0e9ff; color: #2447b8; }
  .tag.violet { background: #f3e8ff; color: #7e22ce; }
  [data-theme="dark"] .role.santri { background: #0c3a57; color: #7dd3fc; }
  [data-theme="dark"] .role.admin { background: #4a2411; color: #fdba74; }
  [data-theme="dark"] .role.ustad { background: #2e2160; color: #c4b5fd; }
  [data-theme="dark"] .status.hadir, [data-theme="dark"] .tag.ok, [data-theme="dark"] .pill.full { background: #14532d; color: #86efac; }
  [data-theme="dark"] .status.izin { background: #1e3a8a; color: #93c5fd; }
  [data-theme="dark"] .status.sakit { background: #5b3a0a; color: #fcd34d; }
  [data-theme="dark"] .status.alpha { background: #5b1b1b; color: #fca5a5; }
  [data-theme="dark"] .tag.blue { background: #1e2d6b; color: #a5b8ff; }
  [data-theme="dark"] .tag.violet { background: #3b1d63; color: #d8b4fe; }
  .tags { display: flex; flex-wrap: wrap; gap: 7px; }

  .row-actions { display: flex; gap: 6px; justify-content: center; }
  .icon-sq { border: 0; background: var(--card-alt); color: var(--text); padding: 7px 9px; border-radius: 9px; cursor: pointer; }
  .icon-sq:hover { background: var(--accent-soft); }
  .icon-sq.danger { background: #fee2e2; }
  [data-theme="dark"] .icon-sq.danger { background: #5b1b1b; }

  /* =========================================================
     TOMBOL & FORM
  ========================================================= */
  .btn { border: 0; border-radius: 11px; padding: 10px 15px; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: filter 0.15s, transform 0.1s; }
  .btn:hover:not(:disabled) { filter: brightness(1.08); }
  .btn:active:not(:disabled) { transform: translateY(1px); }
  .btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .btn.primary { background: var(--accent); color: var(--accent-text); }
  .btn.ghost { background: var(--card-alt); color: var(--text); border: 1px solid var(--border); }
  .btn.danger { background: #fee2e2; color: #b91c1c; }
  .btn.sm { padding: 6px 10px; }
  .btn.big { padding: 13px; font-size: 14px; }
  .btn.block { width: 100%; margin-top: 10px; }
  .btn.grow { flex: 1 1 120px; }
  .btn.dashed { background: var(--accent-soft); color: var(--accent); border: 1px dashed var(--accent); padding: 12px; }

  .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 13px; }
  .field > span { font-size: 12px; font-weight: 700; }
  .field span small { color: var(--muted); font-weight: 500; }
  .field.narrow { max-width: 250px; }
  .field input, .field select, .field textarea, .input {
    width: 100%; padding: 10px 11px; border: 1px solid var(--border); border-radius: 10px;
    background: var(--card); color: var(--text); font-size: 13px; outline: none;
  }
  .field input:focus, .field select:focus, .field textarea:focus, .input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .field textarea { resize: vertical; min-height: 110px; }
  .form-stack { max-width: 520px; display: flex; flex-direction: column; }
  .form-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; align-items: flex-end; }
  .form-row .input, .form-row .field { flex: 1 1 200px; margin-bottom: 0; }
  .filter-box strong { font-size: 13px; }

  .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
  .search { display: flex; align-items: center; gap: 7px; width: 280px; max-width: 100%; padding: 8px 12px; background: var(--card); border: 1px solid var(--border); border-radius: 11px; }
  .search.wide { flex: 1; max-width: 520px; width: auto; min-width: 240px; }
  .search input { border: 0; background: transparent; color: var(--text); outline: none; width: 100%; font-size: 13px; }
  .clear { border: 0; background: transparent; color: var(--muted); cursor: pointer; }
  .count { color: var(--muted); font-size: 12.5px; }

  .seg { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .seg.sub { padding-top: 12px; border-top: 1px solid var(--border); }
  .seg button { border: 1px solid var(--border); background: var(--card); color: var(--text); padding: 8px 14px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .seg button.active { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }

  .mini-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 16px 0; }
  .mini-stats > div { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: 12px; background: var(--card-alt); border: 1px solid var(--border); position: relative; }
  .mini-stats i { position: absolute; top: 14px; right: 14px; width: 9px; height: 9px; border-radius: 50%; }
  .mini-stats span { font-size: 11.5px; color: var(--muted); }
  .mini-stats strong { font-size: 22px; }

  /* =========================================================
     PENDAFTARAN
  ========================================================= */
  .reg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 290px), 1fr)); gap: 14px; }
  .reg-card { padding: 16px; border: 1px solid var(--border); border-radius: 16px; background: var(--card-alt); min-width: 0; display: flex; flex-direction: column; gap: 12px; }
  .reg-head { display: flex; align-items: center; gap: 11px; }
  .reg-head h4 { margin: 0 0 3px; font-size: 15px; overflow-wrap: anywhere; }
  .reg-head small { color: var(--muted); font-size: 11.5px; }

  .kv { margin: 0; display: grid; gap: 9px; }
  .kv > div { display: grid; gap: 2px; }
  .kv dt { color: var(--muted); font-size: 11.5px; }
  .kv dd { margin: 0; font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }

  .detail-grid, .edit-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; }
  .detail-grid > .box { margin-top: 0 !important; }
  .edit-grid .field { margin-bottom: 0; }
  .edit-grid .full, .full { grid-column: 1 / -1; }
  .edit-grid h4.full { margin: 8px 0 0; }

  .doc-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .doc-card { padding: 11px; border: 1px solid var(--border); border-radius: 12px; background: var(--card-alt); min-width: 0; }
  .doc-title { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 10px; font-size: 12px; }
  .doc-preview { position: relative; display: block; width: 100%; padding: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 10px; background: var(--track); cursor: zoom-in; }
  .doc-preview img { display: block; width: 100%; height: 160px; object-fit: contain; }
  .doc-file { display: grid; place-items: center; height: 160px; font-size: 22px; color: var(--muted); }
  .doc-open { display: block; padding: 7px; font-size: 12px; font-weight: 700; color: var(--accent); background: var(--accent-soft); }
  .doc-empty { display: grid; place-items: center; min-height: 120px; border: 1px dashed var(--border); border-radius: 10px; color: var(--muted); font-size: 12px; }

  .lightbox { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; padding: 16px; background: rgba(8, 12, 30, 0.9); }
  .lightbox-box { width: min(1000px, 96vw); max-height: 94vh; overflow: hidden; border-radius: 16px; background: var(--card); color: var(--text); display: flex; flex-direction: column; }
  .lightbox-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; flex-wrap: wrap; }
  .lightbox-head a { color: var(--accent); font-size: 12px; font-weight: 700; text-decoration: none; align-self: center; }
  .lightbox-box img { display: block; width: 100%; max-height: calc(94vh - 70px); object-fit: contain; background: #0b1020; }
  .lightbox-box iframe { width: 100%; height: calc(94vh - 70px); border: 0; background: #fff; }

  /* =========================================================
     JADWAL, PENGUMUMAN, QR, KEUANGAN
  ========================================================= */
  .day-list { display: grid; gap: 16px; }
  .day-card { border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
  .day-title { padding: 12px 16px; background: var(--card-alt); font-weight: 800; font-size: 15px; }
  .sched-item { margin-top: 14px; }

  .news-full { display: grid; gap: 12px; }
  .news-card { border: 1px solid var(--border); border-radius: 14px; padding: 16px; background: var(--card-alt); }
  .news-top { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
  .news-top h4 { margin: 0 0 4px; font-size: 15px; }
  .news-top small { color: var(--muted); font-size: 11.5px; }
  .news-body { font-size: 13px; line-height: 1.7; white-space: pre-wrap; color: var(--muted); }

  .qr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 16px; margin-top: 4px; }
  .qr-card { border: 1px solid var(--border); border-radius: 14px; padding: 16px; background: var(--card-alt); }
  .qr-img { display: flex; justify-content: center; margin-top: 14px; padding: 10px; background: #fff; border-radius: 12px; }
  .qr-img img { width: 200px; max-width: 100%; height: auto; display: block; image-rendering: pixelated; }
  .qr-code { text-align: center; margin-top: 10px; font-family: ui-monospace, monospace; font-weight: 800; letter-spacing: 2px; }

  .split { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(300px, 0.95fr); gap: 22px; align-items: start; }
  .balance-card { display: flex; align-items: center; gap: 14px; padding: 14px; margin-bottom: 14px; border-radius: 14px; background: var(--accent-soft); border: 1px solid var(--border); }
  .balance-icon { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 12px; background: var(--card); font-size: 22px; }
  .balance-card small { display: block; color: var(--muted); font-size: 12px; }
  .balance-card strong { display: block; font-size: 22px; margin: 2px 0; }
  .sum-grid { display: grid; gap: 10px; }
  .sum-grid > div { padding: 12px; border-radius: 11px; background: var(--card); border: 1px solid var(--border); }
  .sum-grid.three { grid-template-columns: repeat(3, 1fr); margin-top: 14px; }
  .sum-grid small { display: block; color: var(--muted); font-size: 12px; }
  .sum-grid strong { display: block; margin-top: 4px; font-size: 17px; }
  .alert { margin-top: 12px; padding: 12px 14px; border-radius: 12px; background: var(--warn-bg); border: 1px solid var(--warn-border); color: var(--warn-text); font-size: 13px; line-height: 1.5; }
  .alert.err { background: #fef2f2; border-color: #fecaca; color: #b91c1c; }
  .trx-list { list-style: none; margin: 0; padding: 0; }
  .trx-list li { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .trx-list li > div { flex: 1; min-width: 0; }
  .trx-list strong, .trx-list small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .trx-list small { color: var(--muted); font-size: 11px; }
  .trx-ico { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; font-weight: 800; flex-shrink: 0; }
  .trx-ico.pemasukan { background: #dcfce7; color: #15803d; }
  .trx-ico.pengeluaran { background: #fee2e2; color: #dc2626; }

  .profile { display: flex; align-items: center; gap: 16px; margin-bottom: 14px; }
  .profile h4 { margin: 0 0 3px; font-size: 19px; }
  .profile p { margin: 0 0 10px; }
  .report-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
  .report-stats .box { margin-top: 0 !important; }
  .report-stats small, .report-stats em { display: block; color: var(--muted); font-style: normal; font-size: 11.5px; }
  .report-stats strong { display: block; margin: 5px 0 2px; font-size: 21px; overflow-wrap: anywhere; }
  .month-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 9px; }
  .month { padding: 10px; border-radius: 10px; text-align: center; background: var(--card); border: 1px solid var(--border); }
  .month span, .month strong { display: block; }
  .month strong { margin-top: 3px; font-size: 11.5px; color: var(--neg); }
  .month.paid strong { color: var(--pos); }

  /* =========================================================
     MODAL
  ========================================================= */
  .backdrop { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 18px; background: var(--overlay); }
  .modal { width: 100%; max-width: 460px; max-height: 92vh; overflow-y: auto; padding: 22px; border-radius: 18px; background: var(--card); color: var(--text); border: 1px solid var(--border); box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35); }
  .modal.wide { max-width: 920px; }
  .modal-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
  .modal-head h3 { margin: 0; font-size: 17px; }
  .modal-foot { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
  .close { border: 0; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; background: var(--card-alt); color: var(--text); flex-shrink: 0; }
  .role-list { max-height: 52vh; overflow-y: auto; }
  .role-item { display: flex; align-items: center; gap: 12px; padding: 12px; margin-bottom: 8px; border-radius: 12px; background: var(--card-alt); border: 1px solid var(--border); }
  .role-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .role-info strong, .role-info small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .role-info small { color: var(--muted); font-size: 12px; }

  .cam { position: relative; width: 100%; aspect-ratio: 1 / 1; overflow: hidden; border-radius: 16px; background: #0b1020; }
  .cam video { width: 100%; height: 100%; object-fit: cover; }
  .cam-frame { position: absolute; inset: 18%; border: 3px solid #fff; border-radius: 16px; box-shadow: 0 0 0 999px rgba(0, 0, 0, 0.3); pointer-events: none; }

  /* =========================================================
     RESPONSIF
  ========================================================= */
  @media (max-width: 1280px) {
    .kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .grid-3 { grid-template-columns: 1fr 1fr; }
    .grid-3 > :last-child { grid-column: 1 / -1; }
  }

  @media (max-width: 1000px) {
    .grid-2, .split { grid-template-columns: 1fr; }
    .report-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .month-grid { grid-template-columns: repeat(4, 1fr); }
  }

  @media (max-width: 860px) {
    .app { padding: 0; gap: 0; }
    .sidebar { position: fixed; top: 0; left: 0; height: 100vh; border-radius: 0 24px 24px 0; transform: translateX(-105%); transition: transform 0.25s; }
    .sidebar.open { transform: none; }
    .overlay { display: block; position: fixed; inset: 0; background: var(--overlay); z-index: 90; }
    .main { border-radius: 0; border: 0; padding: 16px 14px 24px; }
    .hamburger { display: block; }
    .page-title h1 { font-size: 21px; }
    .user-chip div { display: none; }
    .user-chip { padding: 5px; }
    .detail-grid, .edit-grid, .doc-grid { grid-template-columns: 1fr; }
    .edit-grid .full, .full { grid-column: auto; }
    .grid-3 { grid-template-columns: 1fr; }
    .sum-grid.three { grid-template-columns: 1fr; }
  }

  @media (max-width: 560px) {
    .kpi-grid { grid-template-columns: 1fr 1fr; }
    .kpi { flex-direction: column; align-items: flex-start; }
    .kpi-body strong { font-size: 24px; }
    .mini-stats { grid-template-columns: repeat(2, 1fr); }
    .report-stats { grid-template-columns: 1fr 1fr; }
    .month-grid { grid-template-columns: repeat(3, 1fr); }
    .profile { flex-direction: column; align-items: flex-start; }
    .actions { width: 100%; }
    .actions .btn { flex: 1; }
    .bars { gap: 3px; }
    .bar-val { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    * { transition: none !important; }
  }
</style>
