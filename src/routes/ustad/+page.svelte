<script lang="ts">
  import { supabase } from "$lib/supabaseClient";
  import { onMount, onDestroy } from "svelte";
  import QRCode from "qrcode";
  import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
  import { goto } from "$app/navigation";
  import * as XLSX from "xlsx";

  /* =========================
     INTERFACES
  ========================= */

  interface User {
    id: number;
    username: string;
    full_name?: string | null;
    role: "admin" | "santri" | "ustad";
    kelas?: string | null;
    class_name?: string | null;
    class_id?: number | null;
  }

  interface ClassRoom {
    id: number;
    name: string;
  }

  interface StudentGrade {
    id?: number;
    user_id: number;
    class_id: number;
    subject: string;
    academic_year: string;
    semester: number;
    nilai_tugas: number | null;
    nilai_ulangan_harian: number | null;
    nilai_pts: number | null;
    nilai_pas: number | null;
    nilai_sikap_karakter: number | null;
    nilai_ujian_sekolah: number | null;
    nilai_akhir?: number | null;
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
    january: boolean;
    february: boolean;
    march: boolean;
    april: boolean;
    may: boolean;
    june: boolean;
    july: boolean;
    august: boolean;
    september: boolean;
    october: boolean;
    november: boolean;
    december: boolean;
  }

  interface NgajiSession {
    id: number;
    nama_sesi: string;
    tanggal: string;
    waktu_mulai?: string | null;
    waktu_selesai?: string | null;
    status: "dibuka" | "ditutup";
    keterangan?: string | null;
  }

  interface Attendance {
    id?: number;
    user_id: number;
    date: string;
    status: "hadir" | "izin" | "sakit" | "alpha" | "pulang";
  }

  interface NgajiAttendanceRecord {
    id: number;
    session_id: number;
    user_id: number;
    tanggal: string;
    status: "hadir" | "izin" | "sakit" | "alpha" | "pulang";
    metode?: string | null;
    created_at?: string;
  }

  type AttendanceStatus = Attendance["status"] | "";

  let attendanceDrafts: Record<number, AttendanceStatus> = {};

  interface Schedule {
    id?: number;
    day: string;
    subject: string;
    subject2?: string | null;
    teacher_id: number | null;
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
    | "home"
    | "spp"
    | "users"
    | "attendance"
    | "attendanceScan"
    | "ngajiScan"
    | "schedule"
    | "grades"
    | "barcode"
    | "topup"
    | "announcement";

  /* =========================
     THEME (DARK / LIGHT)
  ========================= */
  let theme: "dark" | "light" = "dark";

  function toggleTheme() {
    theme = theme === "dark" ? "light" : "dark";
    if (typeof window !== "undefined") {
      localStorage.setItem("app_theme", theme);
    }
  }

  /* =========================
     MAIN STATE
  ========================= */

  let activeView: ActiveView = "home";
  let sidebarOpen = false;

  let currentUser: User | null = null;
  let users: User[] = [];
  let entries: Entry[] = [];
  let schedules: Schedule[] = [];
  let attendanceData: Attendance[] = [];
  let announcements: Announcement[] = [];
  let sppData: Record<number, SPPRecord> = {};

  /* =========================
     GRADE / REKAP NILAI
  ========================= */

  let classes: ClassRoom[] = [];
  let grades: StudentGrade[] = [];
  let gradesLoading = false;

  let gradeFilterClass = "";
  let gradeFilterStudent = "";
  let gradeFilterAcademicYear = `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`;
  let gradeFilterSemester = "1";

  let showGradeModal = false;
  let editingGradeId: number | null = null;
  let gradeClassId = "";
  let gradeStudentId = "";
  const subjectOptions = [
    "Al-Qur'an Hadits",
    "Aqidah Akhlak",
    "Fiqih",
    "Sejarah Kebudayaan Islam",
    "Bahasa Arab",
    "Bahasa Indonesia",
    "Bahasa Inggris",
    "Matematika",
    "IPA",
    "IPS",
    "Pendidikan Pancasila",
    "Informatika",
    "Tahfidz",
    "Olahraga"
  ];
  let gradeSubject = "";
  let gradeAcademicYear = `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`;
  let gradeSemester = "1";
  let gradeTask: number | string = "";
  let gradeDailyTest: number | string = "";
  let gradeUjiKompetensi1: number | string = "";
  let gradeUjiKompetensi2: number | string = "";
  let gradeCharacter: number | string = "";
  let gradeSchoolExam: number | string = "";

  let showStudentClassModal = false;
  let selectedStudentForClass = "";
  let selectedClassForStudent = "";

  let message = "";
  let isError = false;
  let toastTimer: ReturnType<typeof setTimeout>;

  let attendanceDate = new Date().toISOString().split("T")[0];

  let qrCodes: Record<number, string> = {};
  let qrScanner: Html5Qrcode | null = null;
  let qrScannerRunning = false;
  let qrScanBusy = false;
  let qrScannerStarting = false;
  let lastScannedPayload = "";
  let lastScannedStudent: User | null = null;
  let qrScanMessage = "";
  let cameraError = "";

  // NGAJI STATES
  let ngajiSessions: NgajiSession[] = [];
  let selectedNgajiSessionId = "";
  const getLocalDateValue = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  let selectedNgajiDate = getLocalDateValue();
  const DEFAULT_NGAJI_SESSIONS = [
    { nama_sesi: "Subuh", waktu_mulai: "04:00", waktu_selesai: "05:30" },
    { nama_sesi: "Dzuhur", waktu_mulai: "12:00", waktu_selesai: "13:00" },
    { nama_sesi: "Ashar", waktu_mulai: "15:00", waktu_selesai: "16:00" },
    { nama_sesi: "Maghrib", waktu_mulai: "18:00", waktu_selesai: "19:00" },
    { nama_sesi: "Isya", waktu_mulai: "19:30", waktu_selesai: "20:30" }
  ];
  let ngajiAttendanceCount = 0;
  let ngajiAttendanceRows: NgajiAttendanceRecord[] = [];
  let ngajiAttendanceSearch = "";
  let ngajiLastScannedStudent: User | null = null;
  let ngajiScanMessage = "";
  let ngajiSessionsLoading = false;

  // Sub-tab di dalam menu Ngaji: "scan" (QR Scanner) atau "manual" (Presensi Manual)
  let ngajiActiveSubTab: "scan" | "manual" = "manual";

  async function loadNgajiSessions() {
    if (!selectedNgajiDate) selectedNgajiDate = getLocalDateValue();
    ngajiSessionsLoading = true;

    try {
      const { data: existingRows, error: readError } = await supabase
        .from("ngaji_sessions")
        .select("id, nama_sesi, tanggal, waktu_mulai, waktu_selesai, status, keterangan")
        .eq("tanggal", selectedNgajiDate);

      if (readError) throw readError;

      const existingNames = new Set(
        (existingRows || []).map((row: NgajiSession) => row.nama_sesi.toLowerCase())
      );

      const missingRows = DEFAULT_NGAJI_SESSIONS
        .filter(session => !existingNames.has(session.nama_sesi.toLowerCase()))
        .map(session => ({
          ...session,
          tanggal: selectedNgajiDate,
          status: "dibuka",
          keterangan: `Absensi ngaji ${session.nama_sesi}`
        }));

      if (missingRows.length) {
        const { error: insertError } = await supabase
          .from("ngaji_sessions")
          .insert(missingRows);

        if (insertError) throw insertError;
      }

      const { data, error } = await supabase
        .from("ngaji_sessions")
        .select("id, nama_sesi, tanggal, waktu_mulai, waktu_selesai, status, keterangan")
        .eq("tanggal", selectedNgajiDate)
        .order("id", { ascending: true });

      if (error) throw error;

      const order = ["Subuh", "Dzuhur", "Ashar", "Maghrib", "Isya"];
      ngajiSessions = ((data || []) as NgajiSession[])
        .filter(item => order.includes(item.nama_sesi))
        .sort((a, b) => order.indexOf(a.nama_sesi) - order.indexOf(b.nama_sesi));

      const selectedStillExists = ngajiSessions.some(
        item => String(item.id) === String(selectedNgajiSessionId)
      );

      if (!selectedStillExists) {
        const firstOpen = ngajiSessions.find(item => item.status === "dibuka");
        selectedNgajiSessionId = firstOpen ? String(firstOpen.id) : "";
      }

      await loadNgajiAttendanceCount();
    } catch (error) {
      console.error("Gagal memuat sesi ngaji:", error);
      ngajiSessions = [];
      selectedNgajiSessionId = "";
      const detail = error instanceof Error ? error.message : String(error);
      showToast("Gagal memuat sesi ngaji: " + detail, true);
    } finally {
      ngajiSessionsLoading = false;
    }
  }

  async function selectNgajiSession(value: string) {
    selectedNgajiSessionId = value;
    ngajiLastScannedStudent = null;
    ngajiScanMessage = "";
    cameraError = "";

    if (qrScannerRunning || qrScannerStarting) {
      await stopQRScanner();
    }
    await loadNgajiAttendanceCount();
  }

  async function changeNgajiDate() {
    if (qrScannerRunning || qrScannerStarting) await stopQRScanner();
    selectedNgajiSessionId = "";
    ngajiLastScannedStudent = null;
    ngajiScanMessage = "";
    await loadNgajiSessions();
  }

  async function loadNgajiAttendanceCount() {
    if (!selectedNgajiSessionId) {
      ngajiAttendanceCount = 0;
      ngajiAttendanceRows = [];
      return;
    }

    try {
      const { data, error } = await supabase
        .from("ngaji_attendance")
        .select("id, session_id, user_id, tanggal, status, metode, created_at")
        .eq("session_id", Number(selectedNgajiSessionId))
        .order("created_at", { ascending: true });

      if (error) throw error;
      ngajiAttendanceRows = (data || []) as NgajiAttendanceRecord[];
      ngajiAttendanceCount = ngajiAttendanceRows.filter(row => row.status === "hadir").length;
    } catch (error) {
      ngajiAttendanceRows = [];
      ngajiAttendanceCount = 0;
    }
  }

  // Mendapatkan status ngaji seorang santri berdasarkan sesi terpilih
  function getNgajiStudentStatus(userId: number): AttendanceStatus {
    const row = ngajiAttendanceRows.find(r => Number(r.user_id) === Number(userId));
    return row ? (row.status as AttendanceStatus) : "";
  }

  // Ringkasan status ngaji untuk sesi terpilih
  $: ngajiSummaryCounts = {
    hadir: ngajiAttendanceRows.filter(r => r.status === "hadir").length,
    izin: ngajiAttendanceRows.filter(r => r.status === "izin").length,
    sakit: ngajiAttendanceRows.filter(r => r.status === "sakit").length,
    alpha: ngajiAttendanceRows.filter(r => r.status === "alpha").length,
    pulang: ngajiAttendanceRows.filter(r => r.status === "pulang").length,
    belum: santriUsers.length - ngajiAttendanceRows.length
  };

  // Simpan / Update Absensi Ngaji Manual (Hadir, Izin, Sakit, Alpha, Pulang)
  async function saveNgajiAttendanceManual(userId: number, status: AttendanceStatus) {
    if (!canManageAttendance) {
      showToast("Hanya ustadz atau admin yang dapat mencatat absensi.", true);
      return;
    }
    if (!selectedNgajiSessionId) {
      showToast("Pilih sesi ngaji terlebih dahulu.", true);
      return;
    }

    const student = santriUsers.find(u => u.id === userId);
    const existing = ngajiAttendanceRows.find(row => Number(row.user_id) === Number(userId));

    // Jika status dikosongkan (pilih '-- Belum --'), hapus rekap jika ada
    if (!status && existing) {
      const { error } = await supabase.from("ngaji_attendance").delete().eq("id", existing.id);
      if (error) {
        showToast("Gagal menghapus status: " + error.message, true);
        return;
      }
      showToast(`Status absensi ${student?.full_name || student?.username} direset.`);
      await loadNgajiAttendanceCount();
      return;
    }

    if (!status) return;

    const payload = {
      session_id: Number(selectedNgajiSessionId),
      user_id: userId,
      tanggal: selectedNgajiDate,
      status,
      metode: "manual"
    };

    const result = existing?.id
      ? await supabase.from("ngaji_attendance").update({ status, metode: "manual" }).eq("id", existing.id)
      : await supabase.from("ngaji_attendance").insert(payload);

    if (result.error) {
      showToast("Gagal menyimpan absensi ngaji: " + result.error.message, true);
      return;
    }

    showToast(`✓ Absensi ${student?.full_name || student?.username} (${attendanceLabel(status)}) tersimpan.`);
    await loadNgajiAttendanceCount();
  }

  $: ngajiFilteredSantriList = santriUsers.filter(user => {
    const keyword = ngajiAttendanceSearch.trim().toLowerCase();
    if (!keyword) return true;
    const name = (user.full_name || "").toLowerCase();
    const uname = user.username.toLowerCase();
    const kls = (user.class_name || user.kelas || "").toLowerCase();
    return name.includes(keyword) || uname.includes(keyword) || kls.includes(keyword);
  });

  async function fetchAllRows(table: "attendance" | "ngaji_attendance" | "ngaji_sessions", columns: string, orderColumn: string) {
    const pageSize = 1000;
    let allRows: any[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .order(orderColumn, { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const batch = data || [];
      allRows = allRows.concat(batch);
      if (batch.length < pageSize) break;
    }
    return allRows;
  }

  async function exportAttendanceRecapExcel() {
    if (!canManageAttendance) {
      showToast("Hanya admin atau ustad yang dapat mengekspor rekap.", true);
      return;
    }
    try {
      showToast("Sedang menyiapkan data rekap absensi...");
      const [schoolRows, ngajiRows, sessionRows] = await Promise.all([
        fetchAllRows("attendance", "id, user_id, date, status", "date"),
        fetchAllRows("ngaji_attendance", "id, session_id, user_id, tanggal, status, metode, created_at", "tanggal"),
        fetchAllRows("ngaji_sessions", "id, nama_sesi, tanggal, waktu_mulai, waktu_selesai", "tanggal")
      ]);

      const statusLabels = ["hadir", "izin", "sakit", "alpha", "pulang", "belum absen"];
      const schoolDates = [...new Set(schoolRows.map((row: any) => String(row.date)))].sort();
      const schoolDetail: any[][] = [["Tanggal", "Nama Santri", "Username", "Kelas", "Status"]];
      for (const date of schoolDates) {
        const daily = new Map<number, string>(schoolRows
          .filter((row: any) => String(row.date) === date)
          .map((row: any): [number, string] => [Number(row.user_id), String(row.status || "").toLowerCase()]));
        for (const student of santriUsers) {
          schoolDetail.push([date, student.full_name || student.username, student.username, student.class_name || student.kelas || "-", daily.get(Number(student.id)) || "Belum Absen"]);
        }
      }
      const schoolSummary: any[][] = [["Tanggal", "Hadir", "Izin", "Sakit", "Alpha", "Pulang", "Belum Absen", "Total Santri"]];
      for (const date of schoolDates) {
        const dailyRows = schoolDetail.slice(1).filter(row => row[0] === date);
        const counts = statusLabels.map(status => dailyRows.filter(row => String(row[4]).toLowerCase() === status).length);
        schoolSummary.push([date, ...counts.slice(0, 5), counts[5], santriUsers.length]);
      }

      const ngajiDetail: any[][] = [["Tanggal", "Sesi", "Waktu", "Nama Santri", "Username", "Status", "Metode Absen"]];
      const ngajiSummary: any[][] = [["Tanggal", "Sesi", "Hadir", "Izin", "Sakit", "Alpha", "Pulang", "Belum Absen", "Total Santri"]];
      const sortedSessions = [...sessionRows].sort((a: any, b: any) => String(a.tanggal).localeCompare(String(b.tanggal)) || String(a.nama_sesi).localeCompare(String(b.nama_sesi)));
      for (const session of sortedSessions) {
        const records = ngajiRows.filter((row: any) => Number(row.session_id) === Number(session.id));
        const recordByUser = new Map<number, any>(records.map((row: any): [number, any] => [Number(row.user_id), row]));
        const counts: Record<string, number> = { hadir: 0, izin: 0, sakit: 0, alpha: 0, pulang: 0, "belum absen": 0 };
        for (const student of santriUsers) {
          const record = recordByUser.get(Number(student.id));
          const status = String(record?.status || "belum absen").toLowerCase();
          if (status in counts) counts[status] += 1;
          ngajiDetail.push([session.tanggal, session.nama_sesi, session.waktu_mulai || "-", student.full_name || student.username, student.username, status, record?.metode || "-"]);
        }
        ngajiSummary.push([session.tanggal, session.nama_sesi, counts.hadir, counts.izin, counts.sakit, counts.alpha, counts.pulang, counts["belum absen"], santriUsers.length]);
      }

      const workbook = XLSX.utils.book_new();
      const addSheet = (name: string, rows: any[][]) => {
        const sheet = XLSX.utils.aoa_to_sheet(rows);
        sheet["!cols"] = (rows[0] || []).map((header: any) => ({ wch: Math.min(28, Math.max(14, String(header).length + 4)) }));
        sheet["!autofilter"] = { ref: sheet["!ref"] || "A1:A1" };
        XLSX.utils.book_append_sheet(workbook, sheet, name);
      };
      addSheet("Rekap Sekolah", schoolSummary);
      addSheet("Detail Sekolah", schoolDetail);
      addSheet("Rekap Ngaji", ngajiSummary);
      addSheet("Detail Ngaji", ngajiDetail);
      XLSX.writeFile(workbook, `rekap-absensi-santri-${getLocalDateValue()}.xlsx`);
      showToast(`Export berhasil disiapkan.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      showToast("Gagal mengekspor data: " + detail, true);
    }
  }

  async function saveNgajiAttendanceFromQR(userId: number) {
    if (!canManageAttendance) {
      showToast("Akses scanner khusus admin/ustad.", true);
      return false;
    }
    if (!selectedNgajiSessionId) {
      ngajiScanMessage = "Pilih sesi ngaji terlebih dahulu.";
      showToast(ngajiScanMessage, true);
      return false;
    }

    const santri = santriUsers.find(user => user.id === userId);
    if (!santri) {
      ngajiScanMessage = "QR santri tidak dikenali.";
      showToast(ngajiScanMessage, true);
      return false;
    }

    const session = ngajiSessions.find(item => item.id === Number(selectedNgajiSessionId));
    if (!session || session.status !== "dibuka") {
      ngajiScanMessage = "Sesi ngaji telah ditutup.";
      showToast(ngajiScanMessage, true);
      return false;
    }

    const { error } = await supabase
      .from("ngaji_attendance")
      .insert({
        session_id: Number(selectedNgajiSessionId),
        user_id: userId,
        tanggal: session.tanggal,
        status: "hadir",
        metode: "qr_scan"
      });

    if (error) {
      if (error.code === "23505") {
        ngajiScanMessage = `${santri.full_name || santri.username} sudah absen sesi ini.`;
      } else {
        ngajiScanMessage = "Gagal simpan absensi: " + error.message;
      }
      showToast(ngajiScanMessage, true);
      return false;
    }

    ngajiLastScannedStudent = santri;
    ngajiScanMessage = `✓ ${santri.full_name || santri.username} tercatat Hadir (${session.nama_sesi}).`;
    await loadNgajiAttendanceCount();
    showToast(ngajiScanMessage);
    return true;
  }

  async function generateQRCode(userId: number) {
    try {
      return await QRCode.toDataURL(`SANTRI:${userId}`, {
        width: 280,
        margin: 2,
        errorCorrectionLevel: "H",
        type: "image/png"
      });
    } catch {
      return "";
    }
  }

  async function generateAllQRCodes() {
    const result: Record<number, string> = {};
    for (const santri of santriUsers) {
      result[santri.id] = await generateQRCode(santri.id);
    }
    qrCodes = result;
  }

  function parseSantriQr(payload: string) {
    const value = payload.trim();
    if (!value.toUpperCase().startsWith("SANTRI:")) return null;
    const id = Number(value.slice(7).trim());
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  async function saveAttendanceForStudent(userId: number, status: AttendanceStatus, showMessage = true) {
    if (!canManageAttendance || !status) {
      if (showMessage) showToast("Pilih status absensi.", true);
      return false;
    }

    const existing = getAttendance(userId);
    const result = existing?.id
      ? await supabase.from("attendance").update({ status }).eq("id", existing.id)
      : await supabase.from("attendance").insert([{ user_id: userId, date: attendanceDate, status }]);

    if (result.error) {
      if (showMessage) showToast("Gagal menyimpan: " + result.error.message, true);
      return false;
    }

    attendanceDrafts = { ...attendanceDrafts, [userId]: status };
    await loadAttendance();

    if (showMessage) {
      const student = santriUsers.find(user => user.id === userId);
      showToast(`✓ Absensi ${student?.full_name || student?.username} tersimpan.`);
    }
    return true;
  }

  async function saveAttendanceFromQR(userId: number) {
    if (!canManageAttendance) {
      showToast("Akses dibatasi.", true);
      return false;
    }
    const santri = santriUsers.find(user => user.id === userId);
    if (!santri) {
      showToast("QR Code santri tidak sah.", true);
      return false;
    }

    const saved = await saveAttendanceForStudent(userId, "hadir", false);
    if (!saved) return false;

    lastScannedStudent = santri;
    qrScanMessage = `✓ ${santri.full_name || santri.username} hadir sekolah.`;
    showToast(qrScanMessage);
    return true;
  }

  async function handleQRCode(decodedText: string) {
    if (qrScanBusy) return;
    const payload = decodedText.trim();
    if (!payload || payload === lastScannedPayload) return;

    const userId = parseSantriQr(payload);
    if (!userId) {
      lastScannedPayload = payload;
      qrScanMessage = "Format QR santri tidak valid.";
      showToast(qrScanMessage, true);
      setTimeout(() => { if (lastScannedPayload === payload) lastScannedPayload = ""; }, 1800);
      return;
    }

    qrScanBusy = true;
    lastScannedPayload = payload;

    try {
      if (activeView === "ngajiScan") {
        await saveNgajiAttendanceFromQR(userId);
      } else {
        await saveAttendanceFromQR(userId);
      }
    } finally {
      setTimeout(() => {
        qrScanBusy = false;
        lastScannedPayload = "";
      }, 1800);
    }
  }

  function getCameraErrorMessage(error: unknown) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") return "Akses kamera ditolak. Berikan izin di browser.";
    if (name === "NotFoundError") return "Kamera tidak ditemukan.";
    if (name === "NotReadableError") return "Kamera sedang aktif di tab lain.";
    return "Kamera tidak dapat diakses. Pastikan koneksi HTTPS aman.";
  }

  async function releaseQRScanner() {
    const scanner = qrScanner;
    qrScanner = null;
    if (!scanner) {
      qrScannerRunning = false;
      return;
    }
    try {
      if (scanner.isScanning) await scanner.stop();
    } catch {}
    try {
      await scanner.clear();
    } catch {}
    qrScannerRunning = false;
  }

  async function startQRScanner() {
    if (qrScannerRunning || qrScannerStarting) return;
    if (!canManageAttendance) return;

    if (activeView === "ngajiScan") {
      const selected = ngajiSessions.find(item => String(item.id) === String(selectedNgajiSessionId));
      if (!selectedNgajiSessionId || !selected || selected.status !== "dibuka") {
        showToast("Pilih sesi ngaji yang aktif terlebih dahulu.", true);
        return;
      }
    }

    if (typeof window === "undefined" || !window.isSecureContext) {
      cameraError = "Fitur kamera membutuhkan HTTPS.";
      showToast(cameraError, true);
      return;
    }

    qrScannerStarting = true;
    cameraError = "";
    qrScanMessage = "Membuka sensor kamera...";
    lastScannedPayload = "";
    qrScanBusy = false;

    try {
      await releaseQRScanner();
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

      const reader = document.getElementById("qr-reader");
      if (!reader) throw new Error("Area kamera tidak ditemukan.");
      reader.innerHTML = "";

      const scanner = new Html5Qrcode("qr-reader", {
        verbose: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE]
      });
      qrScanner = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: (viewWidth, viewHeight) => {
            const size = Math.floor(Math.min(viewWidth, viewHeight, 280) * 0.85);
            return { width: size, height: size };
          },
          aspectRatio: 1
        },
        async decodedText => {
          await handleQRCode(decodedText);
        },
        () => {}
      );

      qrScannerRunning = true;
      qrScanMessage = "Arahkan QR Code santri ke bingkai pemindai.";
    } catch (error) {
      await releaseQRScanner();
      cameraError = getCameraErrorMessage(error);
      qrScanMessage = cameraError;
      showToast(cameraError, true);
    } finally {
      qrScannerStarting = false;
    }
  }

  async function stopQRScanner() {
    cameraError = "";
    qrScanMessage = "Kamera nonaktif.";
    qrScanBusy = false;
    lastScannedPayload = "";
    await releaseQRScanner();
    const reader = document.getElementById("qr-reader");
    if (reader) reader.innerHTML = "";
  }

  /* =========================
     ABSENSI MANUAL SEKOLAH: GROUP & KELAS SMP 1, 2, 3
  ========================= */
  let selectedAttendanceGroup: "SD" | "SMP" | "SMA" = "SMP";
  let selectedSmpGrade: "1" | "2" | "3" = "1";

  let showScheduleModal = false;
  let editingScheduleId: number | null = null;
  let scheduleDay = "";
  let scheduleSubject = "";
  let scheduleSubject2 = "";
  let scheduleTeacherId = "";
  let scheduleTime = "";

  const scheduleDays = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
  $: schedulesByDay = scheduleDays.map(day => ({
    day,
    schedules: schedules
      .filter(schedule => schedule.day === day)
      .sort((a, b) => a.time.localeCompare(b.time))
  }));

  let showAnnouncementModal = false;
  let editingAnnouncementId: number | null = null;
  let announcementTitle = "";
  let announcementContent = "";

  onMount(async () => {
    const savedTheme = localStorage.getItem("app_theme") as "dark" | "light" | null;
    if (savedTheme) {
      theme = savedTheme;
    }

    const storedUser = localStorage.getItem("user");
    if (!storedUser) {
      goto("/login");
      return;
    }
    try {
      currentUser = JSON.parse(storedUser);
    } catch {
      localStorage.removeItem("user");
      goto("/login");
      return;
    }

    await Promise.all([
      loadUsers(),
      loadEntries(),
      loadSPPData(),
      loadAttendance(),
      loadSchedules(),
      loadAnnouncements(),
      loadClasses(),
      loadGrades()
    ]);
  });

  $: santriUsers = users.filter(user => user.role === "santri");

  function getEducationGroup(user: User): "SD" | "SMP" | "SMA" | null {
    const classRoomName = user.class_name || user.kelas || classes.find(item => item.id === Number(user.class_id))?.name || "";
    const classText = classRoomName.toLowerCase();
    if (classText.includes("sma") || classText.includes("smk") || classText.includes("aliyah")) return "SMA";
    if (classText.includes("smp") || classText.includes("mts")) return "SMP";
    if (classText.includes("sd") || classText.includes("mi")) return "SD";

    const match = classText.match(/\b(\d{1,2})\b/);
    const gradeNumber = match ? Number(match[1]) : NaN;
    if (gradeNumber >= 1 && gradeNumber <= 6) return "SD";
    if (gradeNumber >= 7 && gradeNumber <= 9) return "SMP";
    if (gradeNumber >= 10 && gradeNumber <= 12) return "SMA";
    return null;
  }

  function getSmpGradeNumber(user: User): "1" | "2" | "3" | null {
    const classRoomName = user.class_name || user.kelas || classes.find(item => item.id === Number(user.class_id))?.name || "";
    const text = classRoomName.toLowerCase();

    if (/\bvii\b/i.test(text) || /\b7\b/.test(text) || /\bkelas\s*1\b/i.test(text) || /\bsmp\s*1\b/i.test(text)) return "1";
    if (/\bviii\b/i.test(text) || /\b8\b/.test(text) || /\bkelas\s*2\b/i.test(text) || /\bsmp\s*2\b/i.test(text)) return "2";
    if (/\bix\b/i.test(text) || /\b9\b/.test(text) || /\bkelas\s*3\b/i.test(text) || /\bsmp\s*3\b/i.test(text)) return "3";

    const match = text.match(/\b([1-3|7-9])\b/);
    if (match) {
      const val = Number(match[1]);
      if (val === 1 || val === 7) return "1";
      if (val === 2 || val === 8) return "2";
      if (val === 3 || val === 9) return "3";
    }
    return null;
  }

  $: smpUsers = santriUsers.filter(s => getEducationGroup(s) === "SMP");
  $: smpCountClass1 = smpUsers.filter(s => getSmpGradeNumber(s) === "1").length;
  $: smpCountClass2 = smpUsers.filter(s => getSmpGradeNumber(s) === "2").length;
  $: smpCountClass3 = smpUsers.filter(s => getSmpGradeNumber(s) === "3").length;

  $: attendanceStudents = santriUsers.filter(santri => {
    const group = getEducationGroup(santri);
    if (group !== selectedAttendanceGroup) return false;
    if (selectedAttendanceGroup === "SMP") {
      return getSmpGradeNumber(santri) === selectedSmpGrade;
    }
    return true;
  });

  $: attendanceGroupCounts = {
    SD: santriUsers.filter(santri => getEducationGroup(santri) === "SD").length,
    SMP: smpUsers.length,
    SMA: santriUsers.filter(santri => getEducationGroup(santri) === "SMA").length
  };

  $: ustadUsers = users.filter(user => user.role === "ustad");

  $: gradeStudents = santriUsers.filter(user =>
    !gradeClassId || Number(user.class_id) === Number(gradeClassId)
  );

  $: filteredGradeStudents = santriUsers.filter(user =>
    !gradeFilterClass || Number(user.class_id) === Number(gradeFilterClass)
  );

  $: filteredGrades = grades.filter(grade => {
    if (currentUser?.role === "santri") return true;
    if (gradeFilterClass && grade.class_id !== Number(gradeFilterClass)) return false;
    if (gradeFilterStudent && grade.user_id !== Number(gradeFilterStudent)) return false;
    if (gradeFilterAcademicYear && grade.academic_year !== gradeFilterAcademicYear) return false;
    if (gradeFilterSemester && grade.semester !== Number(gradeFilterSemester)) return false;
    return true;
  });

  $: isAdmin = currentUser?.role === "admin";
  $: canManageAttendance = currentUser?.role === "admin" || currentUser?.role === "ustad";

  function openStudentClassModal() {
    if (!canManageAttendance) return;
    selectedStudentForClass = "";
    selectedClassForStudent = "";
    showStudentClassModal = true;
  }

  async function saveStudentClass() {
    if (!canManageAttendance) return;
    if (!selectedStudentForClass || !selectedClassForStudent) {
      showToast("Pilih santri dan kelas.", true);
      return;
    }
    const student = santriUsers.find(u => u.id === Number(selectedStudentForClass));
    const classRoom = classes.find(c => c.id === Number(selectedClassForStudent));
    if (!student || !classRoom) return;

    const { error } = await supabase
      .from("users")
      .update({ class_id: classRoom.id, class_name: classRoom.name, kelas: classRoom.name })
      .eq("id", student.id);

    if (error) {
      showToast("Gagal menyimpan: " + error.message, true);
      return;
    }
    showToast(`Santri berhasil dipindahkan ke kelas ${classRoom.name}.`);
    showStudentClassModal = false;
    await loadUsers();
  }

  async function loadUsers() {
    const { data, error } = await supabase
      .from("users")
      .select("id, username, full_name, role, kelas, class_name, class_id")
      .order("username", { ascending: true });
    if (!error && data) {
      users = data as User[];
      await generateAllQRCodes();
    }
  }

  async function loadClasses() {
    const { data } = await supabase.from("classes").select("id, name").order("name", { ascending: true });
    if (data) classes = data as ClassRoom[];
  }

  async function loadGrades() {
    gradesLoading = true;
    try {
      let query = supabase.from("student_grades").select("*").order("academic_year", { ascending: false }).order("semester", { ascending: false }).order("id", { ascending: false });
      if (currentUser?.role === "santri") query = query.eq("user_id", currentUser.id);
      const { data, error } = await query;
      if (!error && data) grades = data as StudentGrade[];
    } finally {
      gradesLoading = false;
    }
  }

  async function refreshGradeData() {
    await Promise.all([loadUsers(), loadClasses(), loadGrades()]);
  }

  function resetGradeForm() {
    editingGradeId = null;
    gradeClassId = "";
    gradeStudentId = "";
    gradeSubject = "";
    gradeAcademicYear = gradeFilterAcademicYear;
    gradeSemester = gradeFilterSemester;
    gradeTask = "";
    gradeDailyTest = "";
    gradeUjiKompetensi1 = "";
    gradeUjiKompetensi2 = "";
    gradeCharacter = "";
    gradeSchoolExam = "";
  }

  function openAddGrade() {
    if (!canManageAttendance) return;
    resetGradeForm();
    showGradeModal = true;
  }

  function openEditGrade(grade: StudentGrade) {
    if (!canManageAttendance) return;
    editingGradeId = grade.id || null;
    gradeClassId = String(grade.class_id);
    gradeStudentId = String(grade.user_id);
    gradeSubject = grade.subject;
    gradeAcademicYear = grade.academic_year;
    gradeSemester = String(grade.semester);
    gradeTask = grade.nilai_tugas ?? "";
    gradeDailyTest = grade.nilai_ulangan_harian ?? "";
    gradeUjiKompetensi1 = grade.nilai_pts ?? "";
    gradeUjiKompetensi2 = grade.nilai_pas ?? "";
    gradeCharacter = grade.nilai_sikap_karakter ?? "";
    gradeSchoolExam = grade.nilai_ujian_sekolah ?? "";
    showGradeModal = true;
  }

  function normalizeGrade(value: number | string) {
    if (value === "" || value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined;
  }

  async function saveGrade() {
    if (!canManageAttendance) return;
    if (!gradeClassId || !gradeStudentId || !gradeSubject || !gradeAcademicYear.trim()) {
      showToast("Kelas, santri, mapel, tahun ajaran dan semester wajib diisi.", true);
      return;
    }
    const values = [gradeTask, gradeDailyTest, gradeUjiKompetensi1, gradeUjiKompetensi2, gradeCharacter, gradeSchoolExam].map(normalizeGrade);
    if (values.some(v => v === undefined)) {
      showToast("Rentang nilai harus antara 0 sampai 100.", true);
      return;
    }

    const payload = {
      user_id: Number(gradeStudentId),
      class_id: Number(gradeClassId),
      subject: gradeSubject.trim(),
      academic_year: gradeAcademicYear.trim(),
      semester: Number(gradeSemester),
      nilai_tugas: values[0],
      nilai_ulangan_harian: values[1],
      nilai_pts: values[2],
      nilai_pas: values[3],
      nilai_sikap_karakter: values[4],
      nilai_ujian_sekolah: values[5]
    };

    let error;
    if (editingGradeId) {
      ({ error } = await supabase.from("student_grades").update(payload).eq("id", editingGradeId));
    } else {
      ({ error } = await supabase.from("student_grades").upsert(payload, { onConflict: "user_id,subject,academic_year,semester" }));
    }

    if (error) {
      showToast("Gagal menyimpan nilai: " + error.message, true);
      return;
    }
    showToast("Nilai berhasil disimpan.");
    showGradeModal = false;
    await loadGrades();
  }

  async function deleteGrade(id: number) {
    if (!canManageAttendance || !confirm("Hapus data nilai ini?")) return;
    const { error } = await supabase.from("student_grades").delete().eq("id", id);
    if (!error) {
      showToast("Nilai berhasil dihapus.");
      await loadGrades();
    }
  }

  function getGradeStudentName(userId: number) {
    const user = users.find(u => u.id === userId);
    return user?.full_name || user?.username || "-";
  }

  function getGradeClassName(classId: number) {
    return classes.find(c => c.id === classId)?.name || "-";
  }

  function cleanFileName(value: unknown, fallback = "semua") {
    const text = String(value ?? "").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-");
    return text || fallback;
  }

  function makeSheetName(name: string, usedNames: Set<string>) {
    const base = String(name || "Tanpa-Nama").replace(/[\\/:*?"<>|\[\]]+/g, "-").trim().substring(0, 31) || "Tanpa-Nama";
    let result = base;
    let counter = 1;
    while (usedNames.has(result)) {
      const suffix = `-${counter}`;
      result = `${base.substring(0, 31 - suffix.length)}${suffix}`;
      counter += 1;
    }
    usedNames.add(result);
    return result;
  }

  function exportGradesToExcel() {
    if (!filteredGrades.length) {
      showToast("Tidak ada data nilai untuk diekspor.", true);
      return;
    }
    try {
      const includeStudent = currentUser?.role !== "santri";
      const headers = [
        ...(includeStudent ? ["Nama Santri"] : []),
        "Kelas",
        "Mata Pelajaran",
        "Tahun Ajaran",
        "Semester",
        "Uji Kompetensi 1",
        "Uji Kompetensi 2",
        "Tugas",
        "UH",
        "Ujian Sekolah",
        "Sikap",
        "Nilai Akhir"
      ];

      const getGradeRow = (grade: StudentGrade) => [
        ...(includeStudent ? [getGradeStudentName(grade.user_id)] : []),
        getGradeClassName(grade.class_id),
        grade.subject || "-",
        grade.academic_year || "-",
        grade.semester,
        grade.nilai_pts ?? "-",
        grade.nilai_pas ?? "-",
        grade.nilai_tugas ?? "-",
        grade.nilai_ulangan_harian ?? "-",
        grade.nilai_ujian_sekolah ?? "-",
        grade.nilai_sikap_karakter ?? "-",
        Number(getGradeAverage(grade))
      ];

      const workbook = XLSX.utils.book_new();
      const allRows = filteredGrades.map(getGradeRow);
      const allData = [
        ["REKAP NILAI SANTRI"],
        [],
        ["Tahun Ajaran", gradeFilterAcademicYear || "Semua"],
        ["Semester", gradeFilterSemester || "Semua"],
        ["Kelas", gradeFilterClass ? getGradeClassName(Number(gradeFilterClass)) : "Semua"],
        ["Santri", gradeFilterStudent ? getGradeStudentName(Number(gradeFilterStudent)) : "Semua"],
        [],
        headers,
        ...allRows
      ];

      const allSheet = XLSX.utils.aoa_to_sheet(allData);
      XLSX.utils.book_append_sheet(workbook, allSheet, "Rekap Semua");

      const gradesByStudent = new Map<string, StudentGrade[]>();
      filteredGrades.forEach((grade) => {
        const name = getGradeStudentName(grade.user_id);
        if (!gradesByStudent.has(name)) gradesByStudent.set(name, []);
        gradesByStudent.get(name)!.push(grade);
      });

      const usedSheetNames = new Set<string>(["Rekap Semua"]);
      gradesByStudent.forEach((studentGrades, studentName) => {
        const sheetName = makeSheetName(studentName, usedSheetNames);
        const className = studentGrades.length ? getGradeClassName(studentGrades[0].class_id) : "-";
        const studentHeaders = [
          "Mata Pelajaran", "Tahun Ajaran", "Semester", "Uji Kompetensi 1", "Uji Kompetensi 2",
          "Tugas", "UH", "Ujian Sekolah", "Sikap", "Nilai Akhir"
        ];
        const studentRows = studentGrades.map((grade) => [
          grade.subject || "-", grade.academic_year || "-", grade.semester,
          grade.nilai_pts ?? "-", grade.nilai_pas ?? "-", grade.nilai_tugas ?? "-",
          grade.nilai_ulangan_harian ?? "-", grade.nilai_ujian_sekolah ?? "-",
          grade.nilai_sikap_karakter ?? "-", Number(getGradeAverage(grade))
        ]);

        const studentSheet = XLSX.utils.aoa_to_sheet([
          ["REKAP NILAI SANTRI"],
          [],
          ["Nama Santri", studentName],
          ["Kelas", className],
          ["Tahun Ajaran", gradeFilterAcademicYear || "Semua"],
          ["Semester", gradeFilterSemester || "Semua"],
          [],
          studentHeaders,
          ...studentRows
        ]);
        XLSX.utils.book_append_sheet(workbook, studentSheet, sheetName);
      });

      const className = gradeFilterClass ? cleanFileName(getGradeClassName(Number(gradeFilterClass)), "semua-kelas") : "semua-kelas";
      const studentName = gradeFilterStudent ? cleanFileName(getGradeStudentName(Number(gradeFilterStudent)), "semua-santri") : "semua-santri";
      const fileName = `rekap-nilai-${className}-${studentName}-${cleanFileName(gradeFilterAcademicYear)}-sem-${gradeFilterSemester}.xlsx`;

      XLSX.writeFile(workbook, fileName);
      showToast(`✓ Excel berhasil dibuat (${gradesByStudent.size} santri).`);
    } catch {
      showToast("Gagal membuat file Excel.", true);
    }
  }

  function getGradeAverage(grade: StudentGrade) {
    if (grade.nilai_akhir !== null && grade.nilai_akhir !== undefined) {
      return Number(grade.nilai_akhir).toFixed(2);
    }
    const vals = [grade.nilai_tugas, grade.nilai_ulangan_harian, grade.nilai_pts, grade.nilai_pas, grade.nilai_sikap_karakter, grade.nilai_ujian_sekolah];
    const total = vals.reduce((s, v) => s + Number(v ?? 0), 0);
    return (total / 6).toFixed(2);
  }

  async function loadEntries() {
    const { data } = await supabase.from("entries").select("*").order("id", { ascending: false });
    if (data) {
      entries = data as Entry[];
    }
  }

  async function loadSPPData() {
    const { data } = await supabase.from("spp_payments").select("*").eq("year", new Date().getFullYear());
    if (data) {
      const map: Record<number, SPPRecord> = {};
      (data as SPPRecord[]).forEach(item => { map[Number(item.user_id)] = { ...item, user_id: Number(item.user_id) }; });
      sppData = map;
    }
  }

  async function loadAttendance() {
    const { data } = await supabase.from("attendance").select("*").eq("date", attendanceDate).order("id", { ascending: false });
    if (data) {
      attendanceData = data as Attendance[];
      const drafts: Record<number, AttendanceStatus> = {};
      attendanceData.forEach(item => { drafts[Number(item.user_id)] = item.status; });
      attendanceDrafts = drafts;
    }
  }

  async function changeAttendanceDate() {
    lastScannedStudent = null;
    qrScanMessage = "";
    await loadAttendance();
  }

  function getAttendance(userId: number) {
    return attendanceData.find(item => Number(item.user_id) === userId);
  }

  function getDraftAttendance(userId: number): AttendanceStatus {
    return attendanceDrafts[userId] ?? "";
  }

  function setDraftAttendance(userId: number, status: AttendanceStatus) {
    attendanceDrafts = { ...attendanceDrafts, [userId]: status };
  }

  $: attendanceDraftGroup = attendanceStudents.map(santri => ({
    student: santri,
    status: getDraftAttendance(santri.id)
  }));

  $: attendanceDraftSummary = {
  hadir: attendanceDraftGroup.filter(i => i.status === "hadir").length,
  izin: attendanceDraftGroup.filter(i => i.status === "izin").length,
  sakit: attendanceDraftGroup.filter(i => i.status === "sakit").length,
  alpha: attendanceDraftGroup.filter(i => i.status === "alpha").length,
  pulang: attendanceDraftGroup.filter(i => i.status === "pulang").length, // <-- Ditambahkan
  belum: attendanceDraftGroup.filter(i => !i.status).length
};

  async function loadSchedules() {
    const { data } = await supabase.from("schedules").select("*").order("id", { ascending: true });
    if (data) schedules = data as Schedule[];
  }

  function openAddSchedule() {
    if (!isAdmin) return;
    editingScheduleId = null;
    scheduleDay = "";
    scheduleSubject = "";
    scheduleSubject2 = "";
    scheduleTeacherId = "";
    scheduleTime = "";
    showScheduleModal = true;
  }

  function openEditSchedule(s: Schedule) {
    if (!isAdmin) return;
    editingScheduleId = s.id || null;
    scheduleDay = s.day;
    scheduleSubject = s.subject || "";
    scheduleSubject2 = s.subject2 || "";
    scheduleTeacherId = s.teacher_id ? String(s.teacher_id) : "";
    scheduleTime = s.time;
    showScheduleModal = true;
  }

  async function saveSchedule() {
    if (!isAdmin || !scheduleDay || !scheduleSubject || !scheduleTime) return;
    const payload = {
      day: scheduleDay,
      subject: scheduleSubject.trim(),
      subject2: scheduleSubject2.trim() || null,
      teacher_id: Number(scheduleTeacherId) || null,
      time: scheduleTime
    };
    const { error } = editingScheduleId !== null
      ? await supabase.from("schedules").update(payload).eq("id", editingScheduleId)
      : await supabase.from("schedules").insert([payload]);

    if (!error) {
      showToast("Jadwal tersimpan.");
      showScheduleModal = false;
      await loadSchedules();
    }
  }

  async function deleteSchedule(id: number) {
    if (!isAdmin || !confirm("Hapus jadwal ini?")) return;
    const { error } = await supabase.from("schedules").delete().eq("id", id);
    if (!error) {
      showToast("Jadwal terhapus.");
      await loadSchedules();
    }
  }

  function getTeacherName(tId: number | null) {
    return users.find(u => u.id === Number(tId))?.username || "-";
  }

  async function loadAnnouncements() {
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      showToast("Gagal memuat pengumuman: " + error.message, true);
      announcements = [];
      return;
    }
    announcements = (data || []) as Announcement[];
  }

  function openAddAnnouncement() {
    if (!isAdmin) {
      showToast("Hanya admin yang dapat membuat pengumuman.", true);
      return;
    }
    editingAnnouncementId = null;
    announcementTitle = "";
    announcementContent = "";
    showAnnouncementModal = true;
  }

  function openEditAnnouncement(a: Announcement) {
    if (!isAdmin) return;
    editingAnnouncementId = a.id || null;
    announcementTitle = a.title;
    announcementContent = a.content;
    showAnnouncementModal = true;
  }

  async function saveAnnouncement() {
    if (!isAdmin) return;
    if (!announcementTitle.trim() || !announcementContent.trim()) {
      showToast("Judul dan isi pengumuman wajib diisi!", true);
      return;
    }
    const payload = { title: announcementTitle.trim(), content: announcementContent.trim() };
    const { error } = editingAnnouncementId !== null
      ? await supabase.from("announcements").update(payload).eq("id", editingAnnouncementId)
      : await supabase.from("announcements").insert([{ ...payload, created_by: currentUser?.id || null }]);

    if (error) {
      showToast("Gagal menyimpan pengumuman: " + error.message, true);
      return;
    }
    showToast("Pengumuman berhasil dipublikasikan.");
    showAnnouncementModal = false;
    announcementTitle = "";
    announcementContent = "";
    await loadAnnouncements();
  }

  async function deleteAnnouncement(id: number) {
    if (!isAdmin || !confirm("Hapus pengumuman ini?")) return;
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (!error) {
      showToast("Pengumuman berhasil dihapus.");
      await loadAnnouncements();
    }
  }

  function showToast(msg: string, error = false) {
    message = msg;
    isError = error;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { message = ""; }, 3200);
  }

  function formatDate(val?: string) {
    return val ? new Date(val).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-";
  }

  function attendanceLabel(status: string) {
    const labels: Record<string, string> = { hadir: "Hadir", izin: "Izin", sakit: "Sakit", alpha: "Alpha", pulang: "Pulang" };
    return labels[status] || status;
  }

  function logout() {
    localStorage.removeItem("user");
    goto("/login");
  }

  async function changeView(view: ActiveView) {
    if ((activeView === "attendanceScan" || activeView === "ngajiScan") && view !== activeView) {
      await stopQRScanner();
    }
    activeView = view;
    sidebarOpen = false;

    if (view === "attendance" || view === "attendanceScan") {
      lastScannedStudent = null;
      lastScannedPayload = "";
      qrScanMessage = "";
      await loadAttendance();
    }
    if (view === "ngajiScan") {
      ngajiLastScannedStudent = null;
      ngajiScanMessage = "";
      lastScannedPayload = "";
      await loadNgajiSessions();
    }
    if (view === "barcode") await generateAllQRCodes();
    if (view === "grades") await refreshGradeData();
    if (view === "announcement") await loadAnnouncements();
  }

  onDestroy(() => {
    void stopQRScanner();
  });
</script>

<!-- =========================
     APP LAYOUT WITH THEME
========================= -->
<div class="zen-layout theme-{theme}">

  <!-- SIDEBAR (DESKTOP) -->
  <aside class:open={sidebarOpen} class="zen-sidebar">
    <div class="sidebar-brand">
      <div class="brand-avatar">🕌</div>
      <div class="brand-text">
        <h3>Daarulhikam</h3>
        <span>Portal Pesantren</span>
      </div>
    </div>

    <nav class="sidebar-nav">
      <button class:active={activeView === "home"} on:click={() => changeView("home")}>
        <span class="nav-ico">🏠</span> Beranda
      </button>
      <button class:active={activeView === "attendance"} on:click={() => changeView("attendance")}>
        <span class="nav-ico">📋</span> Absensi Sekolah
      </button>
      <button class:active={activeView === "ngajiScan"} class="nav-highlight emerald" on:click={() => changeView("ngajiScan")}>
        <span class="nav-ico">📖</span> Absensi Ngaji
      </button>
      {#if canManageAttendance}
        <button class:active={activeView === "attendanceScan"} class="nav-highlight blue" on:click={() => changeView("attendanceScan")}>
          <span class="nav-ico">📷</span> Scan Sekolah
        </button>
      {/if}
      <button class:active={activeView === "schedule"} on:click={() => changeView("schedule")}>
        <span class="nav-ico">🗓️</span> Jadwal
      </button>
      <button class:active={activeView === "grades"} on:click={() => changeView("grades")}>
        <span class="nav-ico">📊</span> Rekap Nilai
      </button>
      <button class:active={activeView === "announcement"} on:click={() => changeView("announcement")}>
        <span class="nav-ico">📢</span> Pengumuman
      </button>
      {#if isAdmin}
        <button class:active={activeView === "users"} on:click={() => changeView("users")}>
          <span class="nav-ico">👥</span> Kelola User
        </button>
      {/if}
      <button class:active={activeView === "barcode"} on:click={() => changeView("barcode")}>
        <span class="nav-ico">🆔</span> Barcode Santri
      </button>
    </nav>

    <div class="sidebar-footer">
      <button class="logout-btn-clean" on:click={logout}>
        <span>🚪</span> Keluar Sistem
      </button>
    </div>
  </aside>

  {#if sidebarOpen}
    <div class="zen-overlay" on:click={() => (sidebarOpen = false)}></div>
  {/if}

  <!-- MAIN VIEWPORT -->
  <main class="zen-main">

    <!-- TOP NAVBAR -->
    <header class="zen-topbar">
      <div class="topbar-left">
        <button class="menu-burger" on:click={() => (sidebarOpen = !sidebarOpen)}>☰</button>
        <div class="user-pill">
          <div class="user-photo">{currentUser?.username?.charAt(0).toUpperCase() || "U"}</div>
          <div class="user-meta">
            <small>Assalamu'alaikum,</small>
            <strong>{currentUser?.username || "Pengajar"}</strong>
          </div>
        </div>
      </div>
      <div class="topbar-right">
        <!-- THEME TOGGLE BUTTON -->
        <button class="theme-toggle-btn" on:click={toggleTheme} title="Ganti Mode Terang / Gelap">
          {#if theme === "dark"}
            <span>☀️ Terang</span>
          {:else}
            <span>🌙 Gelap</span>
          {/if}
        </button>
      </div>
    </header>

    <!-- TOAST NOTIFICATION -->
    {#if message}
      <div class="zen-toast" class:error={isError}>
        <span class="toast-indicator"></span>
        <p>{message}</p>
      </div>
    {/if}

    <!-- CONTENT BODY -->
    <div class="zen-content">

      <!-- =========================
           HOME VIEW (BENTO STYLE)
      ========================= -->
      {#if activeView === "home"}
        <div class="bento-grid">
          <div class="bento-card bento-hero">
            <div class="hero-shine"></div>
            <div class="hero-content">
              <span class="tag-status">Presensi & Akademik Terpadu</span>
              <h2>Pondok Pesantren Daarulhikam</h2>
              <p>Kelola absensi santri, kegiatan ngaji halaqah (scan & manual), dan evaluasi nilai dalam satu sistem terpadu.</p>
              
              <div class="hero-actions">
                <button class="btn-hero primary" on:click={() => changeView("attendanceScan")}>
                  <span>📷</span> Scan Sekolah
                </button>
                <button class="btn-hero emerald" on:click={() => changeView("ngajiScan")}>
                  <span>📖</span> Presensi Ngaji
                </button>
              </div>
            </div>
          </div>

          <div class="bento-card bento-services">
            <h3>Menu Cepat Layanan</h3>
            <div class="services-mosaic">
              <button class="mosaic-tile" on:click={() => changeView("attendance")}>
                <div class="tile-icon red">📋</div>
                <strong>Manual Sekolah</strong>
                <small>Presensi Harian</small>
              </button>

              <button class="mosaic-tile" on:click={() => changeView("ngajiScan")}>
                <div class="tile-icon green">📖</div>
                <strong>Presensi Ngaji</strong>
                <small>Manual & QR Scan</small>
              </button>

              <button class="mosaic-tile" on:click={() => changeView("schedule")}>
                <div class="tile-icon purple">🗓️</div>
                <strong>Jadwal</strong>
                <small>Belajar Santri</small>
              </button>

              <button class="mosaic-tile" on:click={() => changeView("grades")}>
                <div class="tile-icon orange">📊</div>
                <strong>Nilai</strong>
                <small>Rekap Capaian</small>
              </button>
            </div>
          </div>
        </div>

      <!-- =========================
           ABSENSI MANUAL SEKOLAH (SMP KELAS 1, 2, 3)
      ========================= -->
      {:else if activeView === "attendance"}
        <div class="card-sheet">
          <div class="sheet-head">
            <div>
              <h2>Presensi Manual Sekolah</h2>
              <p>Pilih jenjang pendidikan dan sesuaikan status kehadiran santri.</p>
            </div>
            <div class="flex-actions">
              <button class="btn-cta mini green" on:click={exportAttendanceRecapExcel}>📥 Export Rekap</button>
              <button class="btn-round-close" on:click={() => changeView("home")}>✕</button>
            </div>
          </div>

          <div class="filter-strip">
            <div class="input-date-styled">
              <label>Tanggal Pencatatan</label>
              <input type="date" bind:value={attendanceDate} on:change={changeAttendanceDate} />
            </div>

            <!-- TAB TINGKAT UMUM -->
            <div class="tab-segments">
              <button class:active={selectedAttendanceGroup === "SD"} on:click={() => { selectedAttendanceGroup = "SD"; }}>
                SD ({attendanceGroupCounts.SD})
              </button>
              <button class:active={selectedAttendanceGroup === "SMP"} on:click={() => { selectedAttendanceGroup = "SMP"; }}>
                SMP ({attendanceGroupCounts.SMP})
              </button>
              <button class:active={selectedAttendanceGroup === "SMA"} on:click={() => { selectedAttendanceGroup = "SMA"; }}>
                SMA ({attendanceGroupCounts.SMA})
              </button>
            </div>
          </div>

          <!-- SUB-TAB KHUSUS SMP KELAS 1, 2, 3 -->
          {#if selectedAttendanceGroup === "SMP"}
            <div class="smp-subnav-panel">
              <span class="subnav-title">Pilih Kelas SMP:</span>
              <div class="smp-classes-bar">
                <button
                  class:active={selectedSmpGrade === "1"}
                  on:click={() => (selectedSmpGrade = "1")}
                >
                  🏫 SMP Kelas 1 (VII) • <span class="badge-count">{smpCountClass1}</span>
                </button>
                <button
                  class:active={selectedSmpGrade === "2"}
                  on:click={() => (selectedSmpGrade = "2")}
                >
                  🏫 SMP Kelas 2 (VIII) • <span class="badge-count">{smpCountClass2}</span>
                </button>
                <button
                  class:active={selectedSmpGrade === "3"}
                  on:click={() => (selectedSmpGrade = "3")}
                >
                  🏫 SMP Kelas 3 (IX) • <span class="badge-count">{smpCountClass3}</span>
                </button>
              </div>
            </div>
          {/if}

          <div class="summary-chips">
  <div class="chip green"><span>Hadir</span> <strong>{attendanceDraftSummary.hadir}</strong></div>
  <div class="chip blue"><span>Izin</span> <strong>{attendanceDraftSummary.izin}</strong></div>
  <div class="chip amber"><span>Sakit</span> <strong>{attendanceDraftSummary.sakit}</strong></div>
  <div class="chip red"><span>Alpha</span> <strong>{attendanceDraftSummary.alpha}</strong></div>
  <div class="chip purple"><span>Pulang</span> <strong>{attendanceDraftSummary.pulang}</strong></div> <!-- Ditambahkan -->
  <div class="chip gray"><span>Belum Absen</span> <strong>{attendanceDraftSummary.belum}</strong></div>
</div>

          <div class="table-wrap-glass">
            <table class="zen-table">
              <thead>
                <tr>
                  <th>Santri</th>
                  <th>Kelas Terdaftar</th>
                  <th>Status Kehadiran</th>
                  <th>Tercatat</th>
                </tr>
              </thead>
              <tbody>
                {#if attendanceStudents.length === 0}
                  <tr>
                    <td colspan="4" class="text-center-muted">
                      Tidak ada santri yang terdaftar di kelompok {selectedAttendanceGroup} {selectedAttendanceGroup === "SMP" ? `Kelas ${selectedSmpGrade}` : ""}.
                    </td>
                  </tr>
                {:else}
                  {#each attendanceStudents as santri}
                    {@const att = getAttendance(santri.id)}
                    <tr>
                      <td>
                        <div class="name-block">
                          <span class="mini-avatar">{santri.username.charAt(0).toUpperCase()}</span>
                          <div>
                            <strong>{santri.full_name || santri.username}</strong>
                            <small class="block text-sub">@{santri.username}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span class="class-label-tag">
                          {santri.class_name || santri.kelas || "-"}
                        </span>
                      </td>
                      <td>
                        <select
                          class="select-pill"
                          value={getDraftAttendance(santri.id)}
                          on:change={async (e) => {
                            const status = (e.currentTarget as HTMLSelectElement).value as AttendanceStatus;
                            setDraftAttendance(santri.id, status);
                            if (status) await saveAttendanceForStudent(santri.id, status);
                          }}
                        >
                          <option value="">-- Pilih Status --</option>
                          <option value="hadir">Hadir</option>
                          <option value="izin">Izin</option>
                          <option value="sakit">Sakit</option>
                          <option value="alpha">Alpha</option>
                          <option value="pulang">Pulang</option>
                        </select>
                      </td>
                      <td>
                        <span class="status-pill {att?.status || 'belum'}">
                          {att ? attendanceLabel(att.status) : "Belum Absen"}
                        </span>
                      </td>
                    </tr>
                  {/each}
                {/if}
              </tbody>
            </table>
          </div>
        </div>

      <!-- =========================
           ABSENSI NGAJI (MANUAL & QR SCAN)
      ========================= -->
      {:else if activeView === "ngajiScan"}
        <div class="card-sheet">
          <div class="sheet-head">
            <div>
              <span class="tag-badge emerald">HALAQAH AL-QUR'AN</span>
              <h2>Presensi & Absensi Ngaji</h2>
              <p>Kelola absensi santri per sesi pengajian secara manual atau scan QR Code.</p>
            </div>
            <div class="flex-actions">
              <button class="btn-cta mini green" on:click={exportAttendanceRecapExcel}>📥 Export Excel</button>
              <button class="btn-round-close" on:click={() => changeView("home")}>✕</button>
            </div>
          </div>

          <!-- KONTROL TANGGAL & SESI NGAJI -->
          <div class="ngaji-controls-panel">
            <div class="input-date-styled">
              <label>Tanggal Pengajian</label>
              <input type="date" bind:value={selectedNgajiDate} on:change={changeNgajiDate} />
            </div>

            <div class="input-date-styled">
              <label>Pilih Sesi Halaqah</label>
              <select value={selectedNgajiSessionId} on:change={(e) => selectNgajiSession((e.currentTarget as HTMLSelectElement).value)}>
                <option value="">-- Pilih Sesi Ngaji --</option>
                {#each ngajiSessions as s}
                  <option value={String(s.id)}>
                    Sesi {s.nama_sesi} {s.waktu_mulai ? `(${s.waktu_mulai.slice(0, 5)})` : ""}
                  </option>
                {/each}
              </select>
            </div>

            <!-- TOGGLE MODE NGAJI (MANUAL vs SCANNER) -->
            <div class="tab-segments ngaji-mode-toggle">
              <button
                class:active={ngajiActiveSubTab === "manual"}
                on:click={() => { ngajiActiveSubTab = "manual"; void stopQRScanner(); }}
              >
                📋 Input Manual
              </button>
              <button
                class:active={ngajiActiveSubTab === "scan"}
                on:click={() => { ngajiActiveSubTab = "scan"; }}
              >
                📷 Scan Barcode
              </button>
            </div>
          </div>

          <!-- RINGKASAN STATUS NGAJI -->
          <div class="summary-chips">
            <div class="chip green"><span>Hadir</span> <strong>{ngajiSummaryCounts.hadir}</strong></div>
            <div class="chip blue"><span>Izin</span> <strong>{ngajiSummaryCounts.izin}</strong></div>
            <div class="chip amber"><span>Sakit</span> <strong>{ngajiSummaryCounts.sakit}</strong></div>
            <div class="chip red"><span>Alpha</span> <strong>{ngajiSummaryCounts.alpha}</strong></div>
            <div class="chip purple"><span>Pulang</span> <strong>{ngajiSummaryCounts.pulang}</strong></div>
            <div class="chip gray"><span>Belum Absen</span> <strong>{ngajiSummaryCounts.belum}</strong></div>
          </div>

          <!-- ==============================================
               SUB-VIEW 1: INPUT MANUAL PRESENSI NGAJI
          ============================================== -->
          {#if ngajiActiveSubTab === "manual"}
            <div class="manual-ngaji-panel">
              <div class="sub-panel-bar">
                <input
                  type="text"
                  class="search-santri-input"
                  bind:value={ngajiAttendanceSearch}
                  placeholder="🔍 Cari santri atau kelas..."
                />
                <span class="santri-count-badge">Total Santri: {santriUsers.length}</span>
              </div>

              {#if !selectedNgajiSessionId}
                <div class="empty-state-card">
                  <span class="empty-icon">⚠️</span>
                  <h3>Pilih Sesi Terlebih Dahulu</h3>
                  <p>Tentukan sesi pengajian (Subuh, Dzuhur, Ashar, Maghrib, atau Isya) di bagian atas untuk mulai mencatat absensi.</p>
                </div>
              {:else}
                <div class="table-wrap-glass">
                  <table class="zen-table">
                    <thead>
                      <tr>
                        <th>Santri</th>
                        <th>Kelas</th>
                        <th>Pilih Status Kehadiran Ngaji</th>
                        <th>Status Saat Ini</th>
                        <th>Metode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#if ngajiFilteredSantriList.length === 0}
                        <tr>
                          <td colspan="5" class="text-center-muted">
                            Tidak ditemukan santri dengan kata kunci "{ngajiAttendanceSearch}".
                          </td>
                        </tr>
                      {:else}
                        {#each ngajiFilteredSantriList as santri}
                          {@const stStatus = getNgajiStudentStatus(santri.id)}
                          {@const rowData = ngajiAttendanceRows.find(r => Number(r.user_id) === Number(santri.id))}
                          <tr>
                            <td>
                              <div class="name-block">
                                <span class="mini-avatar emerald-avatar">{santri.username.charAt(0).toUpperCase()}</span>
                                <div>
                                  <strong>{santri.full_name || santri.username}</strong>
                                  <small class="block text-sub">ID: SANTRI-{santri.id}</small>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span class="class-label-tag">
                                {santri.class_name || santri.kelas || "-"}
                              </span>
                            </td>
                            <td>
                              <!-- SELECT MANUAL DENGAN PILIHAN LENGKAP -->
                              <select
                                class="select-pill ngaji-select"
                                value={stStatus}
                                on:change={async (e) => {
                                  const val = (e.currentTarget as HTMLSelectElement).value as AttendanceStatus;
                                  await saveNgajiAttendanceManual(santri.id, val);
                                }}
                              >
                                <option value="">-- Belum Absen --</option>
                                <option value="hadir">✅ Hadir</option>
                                <option value="izin">🔵 Izin</option>
                                <option value="sakit">🟡 Sakit</option>
                                <option value="alpha">🔴 Alpha</option>
                                <option value="pulang">🟣 Pulang</option>
                              </select>
                            </td>
                            <td>
                              <span class="status-pill {stStatus || 'belum'}">
                                {stStatus ? attendanceLabel(stStatus) : "Belum Absen"}
                              </span>
                            </td>
                            <td>
                              <small class="text-sub">
                                {rowData?.metode === "qr_scan" ? "📷 Barcode" : rowData?.metode === "manual" ? "✍️ Manual" : "-"}
                              </small>
                            </td>
                          </tr>
                        {/each}
                      {/if}
                    </tbody>
                  </table>
                </div>
              {/if}
            </div>

          <!-- ==============================================
               SUB-VIEW 2: SCAN BARCODE NGAJI
          ============================================== -->
          {:else}
            <div class="scanner-sheet">
              <div class="scanner-arena">
                <div class="scanner-frame">
                  <div id="qr-reader" class:active={qrScannerRunning}></div>
                  {#if !qrScannerRunning}
                    <div class="scanner-standby">
                      <div class="pulsing-ring emerald">📖</div>
                      <p>Arahkan kamera ke QR Code Santri</p>
                      <button class="btn-cta emerald" on:click={startQRScanner} disabled={qrScannerStarting || !selectedNgajiSessionId}>
                        {qrScannerStarting ? "Memuat..." : "Mulai Scan Ngaji"}
                      </button>
                    </div>
                  {:else}
                    <button class="btn-cta stop" on:click={stopQRScanner}>Hentikan Kamera</button>
                  {/if}
                </div>

                {#if ngajiScanMessage}
                  <div class="scanner-feedback" class:positive={!!ngajiLastScannedStudent}>
                    {ngajiScanMessage}
                  </div>
                {/if}

                {#if ngajiLastScannedStudent}
                  <div class="student-scanned-card emerald">
                    <div class="avatar-lg">{ngajiLastScannedStudent.username.charAt(0).toUpperCase()}</div>
                    <div>
                      <strong>{ngajiLastScannedStudent.full_name || ngajiLastScannedStudent.username}</strong>
                      <span>Tercatat Hadir Ngaji</span>
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          {/if}

        </div>

      <!-- =========================
           SCAN ABSENSI SEKOLAH
      ========================= -->
      {:else if activeView === "attendanceScan"}
        <div class="card-sheet scanner-sheet">
          <div class="sheet-head">
            <div>
              <span class="tag-badge blue">PRESENSI SEKOLAH</span>
              <h2>Scan QR Absensi Sekolah</h2>
              <p>Pindai kartu identitas QR santri untuk mencatat jam kehadiran harian.</p>
            </div>
            <button class="btn-round-close" on:click={() => changeView("home")}>✕</button>
          </div>

          <div class="scanner-arena">
            <div class="scanner-frame">
              <div id="qr-reader" class:active={qrScannerRunning}></div>
              {#if !qrScannerRunning}
                <div class="scanner-standby">
                  <div class="pulsing-ring">📷</div>
                  <p>Kamera siap digunakan</p>
                  <button class="btn-cta blue" on:click={startQRScanner} disabled={qrScannerStarting}>
                    {qrScannerStarting ? "Menginisialisasi..." : "Aktifkan Kamera"}
                  </button>
                </div>
              {:else}
                <button class="btn-cta stop" on:click={stopQRScanner}>Hentikan Kamera</button>
              {/if}
            </div>

            {#if qrScanMessage}
              <div class="scanner-feedback" class:positive={!!lastScannedStudent}>
                {qrScanMessage}
              </div>
            {/if}

            {#if lastScannedStudent}
              <div class="student-scanned-card">
                <div class="avatar-lg">{lastScannedStudent.username.charAt(0).toUpperCase()}</div>
                <div>
                  <strong>{lastScannedStudent.full_name || lastScannedStudent.username}</strong>
                  <span>ID: SANTRI-{lastScannedStudent.id} • Hadir Sekolah</span>
                </div>
              </div>
            {/if}
          </div>
        </div>

      <!-- =========================
           JADWAL
      ========================= -->
      {:else if activeView === "schedule"}
        <div class="card-sheet">
          <div class="sheet-head">
            <div>
              <h2>Jadwal Pembelajaran</h2>
              <p>Agenda pengajaran santri terorganisir per hari.</p>
            </div>
            {#if isAdmin}
              <button class="btn-cta blue mini" on:click={openAddSchedule}>+ Tambah Jadwal</button>
            {/if}
          </div>

          <div class="schedule-timeline">
            {#each schedulesByDay as dayGroup}
              {#if dayGroup.schedules.length > 0}
                <div class="day-cluster">
                  <span class="day-badge">{dayGroup.day}</span>
                  <div class="cluster-cards">
                    {#each dayGroup.schedules as sc}
                      <div class="lesson-card">
                        <div class="lesson-time">🕒 {sc.time}</div>
                        <div class="lesson-info">
                          <strong>{sc.subject} {sc.subject2 ? `+ ${sc.subject2}` : ""}</strong>
                          <small>Pengampu: {getTeacherName(sc.teacher_id)}</small>
                        </div>
                        {#if isAdmin}
                          <div class="action-buttons-inline">
                            <button class="btn-mini-icon" on:click={() => openEditSchedule(sc)}>✏️</button>
                            <button class="btn-mini-icon danger" on:click={() => deleteSchedule(sc.id!)}>🗑️</button>
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        </div>

      <!-- =========================
           REKAP NILAI
      ========================= -->
      {:else if activeView === "grades"}
        <div class="card-sheet">
          <div class="sheet-head">
            <div>
              <h2>Rekapitulasi Nilai Santri</h2>
              <p>Kelola dan analisis nilai santri berdasarkan kelas, mata pelajaran, dan semester.</p>
            </div>
            <div class="flex-actions">
              {#if canManageAttendance}
                <button class="btn-cta mini outline" on:click={openStudentClassModal}>👨‍🎓 Atur Kelas</button>
                <button class="btn-cta blue mini" on:click={openAddGrade}>➕ Input Nilai</button>
              {/if}
              <button class="btn-cta mini green" on:click={exportGradesToExcel} disabled={gradesLoading || filteredGrades.length === 0}>
                📥 Export Excel
              </button>
              <button class="btn-cta mini outline" on:click={refreshGradeData} disabled={gradesLoading}>🔄 Refresh</button>
            </div>
          </div>

          {#if currentUser?.role !== "santri"}
            <div class="grade-filter-box">
              <div class="field-item">
                <label>Kelas</label>
                <select bind:value={gradeFilterClass} on:change={() => (gradeFilterStudent = "")}>
                  <option value="">Semua Kelas</option>
                  {#each classes as c}
                    <option value={c.id}>{c.name}</option>
                  {/each}
                </select>
              </div>

              <div class="field-item">
                <label>Santri</label>
                <select bind:value={gradeFilterStudent}>
                  <option value="">Semua Santri</option>
                  {#each filteredGradeStudents as s}
                    <option value={s.id}>{s.username}</option>
                  {/each}
                </select>
              </div>

              <div class="field-item">
                <label>Tahun Ajaran</label>
                <input type="text" bind:value={gradeFilterAcademicYear} placeholder="2026/2027" />
              </div>

              <div class="field-item">
                <label>Semester</label>
                <select bind:value={gradeFilterSemester}>
                  <option value="1">Semester 1</option>
                  <option value="2">Semester 2</option>
                </select>
              </div>
            </div>
          {/if}

          <div class="table-wrap-glass">
            <table class="zen-table">
              <thead>
                <tr>
                  {#if currentUser?.role !== "santri"}<th>Santri</th>{/if}
                  <th>Kelas</th>
                  <th>Mata Pelajaran</th>
                  <th>UK 1 (PTS)</th>
                  <th>UK 2 (PAS)</th>
                  <th>Tugas</th>
                  <th>UH</th>
                  <th>Ujian Sekolah</th>
                  <th>Sikap</th>
                  <th>Nilai Akhir</th>
                  {#if canManageAttendance}<th>Aksi</th>{/if}
                </tr>
              </thead>
              <tbody>
                {#if gradesLoading}
                  <tr><td colspan="11" class="text-center-muted">Memuat data nilai...</td></tr>
                {:else if filteredGrades.length === 0}
                  <tr><td colspan="11" class="text-center-muted">Belum ada data nilai yang sesuai kriteria filter.</td></tr>
                {:else}
                  {#each filteredGrades as g}
                    <tr>
                      {#if currentUser?.role !== "santri"}<td><strong>{getGradeStudentName(g.user_id)}</strong></td>{/if}
                      <td>{getGradeClassName(g.class_id)}</td>
                      <td>{g.subject}</td>
                      <td>{g.nilai_pts ?? "-"}</td>
                      <td>{g.nilai_pas ?? "-"}</td>
                      <td>{g.nilai_tugas ?? "-"}</td>
                      <td>{g.nilai_ulangan_harian ?? "-"}</td>
                      <td>{g.nilai_ujian_sekolah ?? "-"}</td>
                      <td>{g.nilai_sikap_karakter ?? "-"}</td>
                      <td><span class="score-tag">{getGradeAverage(g)}</span></td>
                      {#if canManageAttendance}
                        <td>
                          <div class="action-buttons-inline">
                            <button class="btn-mini-icon" on:click={() => openEditGrade(g)}>✏️</button>
                            <button class="btn-mini-icon danger" on:click={() => deleteGrade(g.id!)}>🗑️</button>
                          </div>
                        </td>
                      {/if}
                    </tr>
                  {/each}
                {/if}
              </tbody>
            </table>
          </div>
        </div>

      <!-- =========================
           PENGUMUMAN
      ========================= -->
      {:else if activeView === "announcement"}
        <div class="card-sheet">
          <div class="sheet-head">
            <div>
              <h2>Pengumuman Pesantren</h2>
              <p>Pemberitahuan, agenda kegiatan, dan maklumat resmi pondok.</p>
            </div>
            <div class="flex-actions">
              {#if isAdmin}
                <button class="btn-cta blue mini" on:click={openAddAnnouncement}>➕ Buat Pengumuman</button>
              {/if}
              <button class="btn-round-close" on:click={() => changeView("home")}>✕</button>
            </div>
          </div>

          <div class="announcement-grid-list">
            {#if announcements.length === 0}
              <div class="empty-state-card">
                <span class="empty-icon">📭</span>
                <h3>Belum Ada Pengumuman</h3>
                <p>Informasi terbaru dari pimpinan atau administrasi pondok akan tertera di sini.</p>
              </div>
            {:else}
              {#each announcements as item}
                <div class="announcement-bubble">
                  <div class="bubble-header">
                    <div>
                      <h4>📢 {item.title}</h4>
                      <small>📅 Dipublikasikan pada: {formatDate(item.created_at)}</small>
                    </div>
                    {#if isAdmin}
                      <div class="action-buttons-inline">
                        <button class="btn-mini-icon" title="Edit" on:click={() => openEditAnnouncement(item)}>✏️</button>
                        <button class="btn-mini-icon danger" title="Hapus" on:click={() => deleteAnnouncement(item.id!)}>🗑️</button>
                      </div>
                    {/if}
                  </div>
                  <div class="bubble-content">
                    {item.content}
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>

      <!-- =========================
           BARCODE SANTRI
      ========================= -->
      {:else if activeView === "barcode"}
        <div class="card-sheet">
          <div class="sheet-head">
            <div>
              <h2>Kartu Identitas Digital Santri</h2>
              <p>Pindai barcode unik santri untuk presensi kegiatan belajar maupun halaqah.</p>
            </div>
            <button class="btn-round-close" on:click={() => changeView("home")}>✕</button>
          </div>

          <div class="qr-cards-grid">
            {#each santriUsers as santri}
              <div class="qr-card-item">
                <div class="qr-head">
                  <span class="qr-institution">DAARULHIKAM</span>
                  <span class="qr-role">SANTRI</span>
                </div>
                <div class="qr-canvas-box">
                  {#if qrCodes[santri.id]}
                    <img src={qrCodes[santri.id]} alt="QR Santri" />
                  {:else}
                    <span>Memuat QR...</span>
                  {/if}
                </div>
                <strong>{santri.username}</strong>
                <small>ID: SANTRI-{santri.id}</small>
              </div>
            {/each}
          </div>
        </div>

      {/if}

    </div>
  </main>

  <!-- ========================================================
       MODERN DUAL-SCAN FLOATING DOCK (MOBILE NAV)
  ======================================================== -->
  <nav class="dock-navbar" aria-label="Navigasi Utama">
    <button class:active={activeView === "home"} on:click={() => changeView("home")}>
      <span class="dock-icon">⌂</span>
      <span class="dock-txt">Beranda</span>
    </button>

    <button class:active={activeView === "attendance"} on:click={() => changeView("attendance")}>
      <span class="dock-icon">📋</span>
      <span class="dock-txt">Sekolah</span>
    </button>

    <div class="dock-scan-capsule">
      {#if canManageAttendance}
        <button
          class:active={activeView === "attendanceScan"}
          class="scan-pill-btn blue"
          on:click={() => changeView("attendanceScan")}
          title="Scan Absensi Sekolah"
        >
          <span class="pill-ico">📷</span>
          <span class="pill-tag">Sekolah</span>
        </button>
      {/if}

      <button
        class:active={activeView === "ngajiScan"}
        class="scan-pill-btn emerald"
        on:click={() => changeView("ngajiScan")}
        title="Presensi Ngaji"
      >
        <span class="pill-ico">📖</span>
        <span class="pill-tag">Ngaji</span>
      </button>
    </div>

    <button class:active={activeView === "schedule"} on:click={() => changeView("schedule")}>
      <span class="dock-icon">🗓️</span>
      <span class="dock-txt">Jadwal</span>
    </button>

    <button class:active={activeView === "announcement"} on:click={() => changeView("announcement")}>
      <span class="dock-icon">📢</span>
      <span class="dock-txt">Info</span>
    </button>
  </nav>

</div>

<!-- =========================
     MODAL WINDOWS
========================= -->

<!-- MODAL ATUR KELAS SANTRI -->
{#if showStudentClassModal}
  <div class="zen-modal-curtain" on:click={() => (showStudentClassModal = false)}>
    <div class="zen-modal-box" on:click|stopPropagation>
      <div class="modal-top">
        <h3>👨‍🎓 Atur Kelas Santri</h3>
        <button class="modal-close-x" on:click={() => (showStudentClassModal = false)}>✕</button>
      </div>
      <div class="field-item">
        <label>Pilih Santri</label>
        <select bind:value={selectedStudentForClass}>
          <option value="">-- Pilih Santri --</option>
          {#each santriUsers as s}
            <option value={s.id}>{s.full_name || s.username} ({s.class_name || "Belum ada kelas"})</option>
          {/each}
        </select>
      </div>
      <div class="field-item">
        <label>Pilih Kelas Baru</label>
        <select bind:value={selectedClassForStudent}>
          <option value="">-- Pilih Kelas --</option>
          {#each classes as c}
            <option value={c.id}>{c.name}</option>
          {/each}
        </select>
      </div>
      <div class="modal-btns">
        <button class="btn-cta mini outline" on:click={() => (showStudentClassModal = false)}>Batal</button>
        <button class="btn-cta mini blue" on:click={saveStudentClass}>Simpan Kelas</button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL INPUT / EDIT NILAI -->
{#if showGradeModal}
  <div class="zen-modal-curtain" on:click={() => (showGradeModal = false)}>
    <div class="zen-modal-box wide" on:click|stopPropagation>
      <div class="modal-top">
        <h3>{editingGradeId ? "Edit Nilai Santri" : "Input Nilai Santri"}</h3>
        <button class="modal-close-x" on:click={() => (showGradeModal = false)}>✕</button>
      </div>
      <div class="modal-grid-fields">
        <div class="field-item">
          <label>Kelas</label>
          <select bind:value={gradeClassId} on:change={() => { gradeStudentId = ""; }}>
            <option value="">-- Pilih Kelas --</option>
            {#each classes as c}<option value={c.id}>{c.name}</option>{/each}
          </select>
        </div>
        <div class="field-item">
          <label>Santri</label>
          <select bind:value={gradeStudentId}>
            <option value="">-- Pilih Santri --</option>
            {#each gradeStudents as s}<option value={s.id}>{s.username}</option>{/each}
          </select>
        </div>
        <div class="field-item">
          <label>Mata Pelajaran</label>
          <select bind:value={gradeSubject}>
            <option value="">-- Pilih Mata Pelajaran --</option>
            {#each subjectOptions as sub}<option value={sub}>{sub}</option>{/each}
          </select>
        </div>
        <div class="field-item">
          <label>Tahun Ajaran</label>
          <input type="text" bind:value={gradeAcademicYear} placeholder="2026/2027" />
        </div>
        <div class="field-item">
          <label>Semester</label>
          <select bind:value={gradeSemester}>
            <option value="1">Semester 1</option>
            <option value="2">Semester 2</option>
          </select>
        </div>
        <div class="field-item"><label>Uji Kompetensi 1 (PTS)</label><input type="number" min="0" max="100" bind:value={gradeUjiKompetensi1} /></div>
        <div class="field-item"><label>Uji Kompetensi 2 (PAS)</label><input type="number" min="0" max="100" bind:value={gradeUjiKompetensi2} /></div>
        <div class="field-item"><label>Nilai Tugas</label><input type="number" min="0" max="100" bind:value={gradeTask} /></div>
        <div class="field-item"><label>Ulangan Harian (UH)</label><input type="number" min="0" max="100" bind:value={gradeDailyTest} /></div>
        <div class="field-item"><label>Sikap / Karakter</label><input type="number" min="0" max="100" bind:value={gradeCharacter} /></div>
        <div class="field-item"><label>Ujian Sekolah</label><input type="number" min="0" max="100" bind:value={gradeSchoolExam} /></div>
      </div>
      <div class="modal-btns">
        <button class="btn-cta mini outline" on:click={() => (showGradeModal = false)}>Batal</button>
        <button class="btn-cta mini blue" on:click={saveGrade}>Simpan Nilai</button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL PENGUMUMAN -->
{#if showAnnouncementModal}
  <div class="zen-modal-curtain" on:click={() => (showAnnouncementModal = false)}>
    <div class="zen-modal-box" on:click|stopPropagation>
      <div class="modal-top">
        <h3>{editingAnnouncementId !== null ? "Edit Pengumuman" : "Buat Pengumuman"}</h3>
        <button class="modal-close-x" on:click={() => (showAnnouncementModal = false)}>✕</button>
      </div>
      <div class="field-item">
        <label>Judul Pengumuman</label>
        <input type="text" bind:value={announcementTitle} placeholder="Contoh: Libur Ramadhan 1447 H" />
      </div>
      <div class="field-item">
        <label>Isi Pengumuman</label>
        <textarea rows="5" class="input-styled-area" bind:value={announcementContent} placeholder="Tulis rincian informasi di sini..."></textarea>
      </div>
      <div class="modal-btns">
        <button class="btn-cta mini outline" on:click={() => (showAnnouncementModal = false)}>Batal</button>
        <button class="btn-cta mini blue" on:click={saveAnnouncement}>Publikasikan</button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL JADWAL -->
{#if showScheduleModal}
  <div class="zen-modal-curtain" on:click={() => (showScheduleModal = false)}>
    <div class="zen-modal-box" on:click|stopPropagation>
      <div class="modal-top">
        <h3>{editingScheduleId !== null ? "Edit Jadwal" : "Tambah Jadwal"}</h3>
        <button class="modal-close-x" on:click={() => (showScheduleModal = false)}>✕</button>
      </div>
      <div class="field-item">
        <label>Hari</label>
        <select bind:value={scheduleDay}>
          <option value="">Pilih Hari</option>
          {#each scheduleDays as d}<option value={d}>{d}</option>{/each}
        </select>
      </div>
      <div class="field-item">
        <label>Mata Pelajaran Utama</label>
        <input type="text" bind:value={scheduleSubject} placeholder="Contoh: Tahfidz" />
      </div>
      <div class="field-item">
        <label>Mata Pelajaran 2 (Opsional)</label>
        <input type="text" bind:value={scheduleSubject2} placeholder="Contoh: Tajwid" />
      </div>
      <div class="field-item">
        <label>Pengampu</label>
        <select bind:value={scheduleTeacherId}>
          <option value="">Pilih Ustadz/Ustadzah</option>
          {#each ustadUsers as u}<option value={u.id}>{u.username}</option>{/each}
        </select>
      </div>
      <div class="field-item">
        <label>Waktu Pelaksanaan</label>
        <input type="text" bind:value={scheduleTime} placeholder="08:00 - 09:30" />
      </div>
      <div class="modal-btns">
        <button class="btn-cta mini outline" on:click={() => (showScheduleModal = false)}>Batal</button>
        <button class="btn-cta mini blue" on:click={saveSchedule}>Simpan Jadwal</button>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  /* ========================================================
     CSS VARIABLES FOR DYNAMIC THEME (DARK / LIGHT)
  ======================================================== */
  .zen-layout.theme-dark {
    --bg-app: #090e1a;
    --bg-radial: radial-gradient(at 0% 0%, rgba(30, 58, 138, 0.35) 0px, transparent 50%),
                 radial-gradient(at 100% 100%, rgba(5, 150, 105, 0.25) 0px, transparent 50%),
                 radial-gradient(at 50% 50%, #0d1527 0px, #050811 100%);
    --card-bg: rgba(20, 30, 52, 0.75);
    --card-border: rgba(255, 255, 255, 0.1);
    --sidebar-bg: rgba(13, 21, 39, 0.95);
    --topbar-bg: rgba(13, 21, 39, 0.75);
    --text-main: #f8fafc;
    --text-sub: #94a3b8;
    --table-header-bg: rgba(255, 255, 255, 0.03);
    --table-border: rgba(255, 255, 255, 0.05);
    --table-wrap-bg: rgba(11, 18, 33, 0.6);
    --input-bg: #0f172a;
    --input-border: rgba(255, 255, 255, 0.2);
    --input-text: #ffffff;
    --dock-bg: rgba(13, 21, 39, 0.92);
    --chip-bg: rgba(255, 255, 255, 0.05);
    --bubble-bg: rgba(255, 255, 255, 0.04);
    --modal-bg: #0f172a;
  }

  .zen-layout.theme-light {
    --bg-app: #f1f5f9;
    --bg-radial: radial-gradient(at 0% 0%, rgba(191, 219, 254, 0.6) 0px, transparent 50%),
                 radial-gradient(at 100% 100%, rgba(167, 243, 208, 0.5) 0px, transparent 50%),
                 #f8fafc;
    --card-bg: rgba(255, 255, 255, 0.92);
    --card-border: rgba(203, 213, 225, 0.8);
    --sidebar-bg: rgba(255, 255, 255, 0.98);
    --topbar-bg: rgba(255, 255, 255, 0.85);
    --text-main: #0f172a;
    --text-sub: #64748b;
    --table-header-bg: #f8fafc;
    --table-border: #e2e8f0;
    --table-wrap-bg: #ffffff;
    --input-bg: #ffffff;
    --input-border: #cbd5e1;
    --input-text: #0f172a;
    --dock-bg: rgba(255, 255, 255, 0.95);
    --chip-bg: #f1f5f9;
    --bubble-bg: #f8fafc;
    --modal-bg: #ffffff;
  }

  /* LAYOUT SHELL */
  .zen-layout {
    display: flex;
    min-height: 100vh;
    width: 100%;
    position: relative;
    background: var(--bg-app);
    background-image: var(--bg-radial);
    color: var(--text-main);
    transition: background 0.3s ease, color 0.3s ease;
  }

  /* SIDEBAR (DESKTOP) */
  .zen-sidebar {
    width: 270px;
    background: var(--sidebar-bg);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border-right: 1px solid var(--card-border);
    display: flex;
    flex-direction: column;
    padding: 24px 18px;
    position: fixed;
    height: 100vh;
    z-index: 100;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .sidebar-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 28px;
    padding-left: 6px;
  }

  .brand-avatar {
    width: 44px;
    height: 44px;
    border-radius: 14px;
    background: linear-gradient(135deg, #2563eb, #38bdf8);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
    flex-shrink: 0;
  }

  .brand-text h3 {
    font-size: 16px;
    font-weight: 800;
    color: var(--text-main);
  }

  .brand-text span {
    font-size: 11px;
    color: var(--text-sub);
  }

  .sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    overflow-y: auto;
  }

  .sidebar-nav button {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 14px;
    background: transparent;
    border: none;
    color: var(--text-sub);
    border-radius: 14px;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .sidebar-nav button:hover,
  .sidebar-nav button.active {
    background: rgba(37, 99, 235, 0.12);
    color: #2563eb;
    transform: translateX(3px);
  }

  .sidebar-nav button.nav-highlight.blue {
    background: rgba(37, 99, 235, 0.15);
    color: #2563eb;
  }

  .sidebar-nav button.nav-highlight.emerald {
    background: rgba(5, 150, 105, 0.15);
    color: #059669;
  }

  .logout-btn-clean {
    width: 100%;
    padding: 12px;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 12px;
    color: #ef4444;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  /* MAIN WRAPPER */
  .zen-main {
    flex: 1;
    margin-left: 270px;
    min-height: 100vh;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .zen-topbar {
    height: 70px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 32px;
    background: var(--topbar-bg);
    backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--card-border);
    position: sticky;
    top: 0;
    z-index: 50;
  }

  .topbar-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .topbar-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .theme-toggle-btn {
    padding: 7px 14px;
    border-radius: 12px;
    border: 1px solid var(--card-border);
    background: var(--chip-bg);
    color: var(--text-main);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s ease;
  }

  .theme-toggle-btn:hover {
    background: rgba(37, 99, 235, 0.15);
    border-color: #3b82f6;
  }

  .menu-burger {
    display: none;
    background: none;
    border: none;
    color: var(--text-main);
    font-size: 24px;
    cursor: pointer;
    line-height: 1;
  }

  .user-pill {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .user-photo {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: linear-gradient(135deg, #3b82f6, #06b6d4);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 16px;
    color: #fff;
    flex-shrink: 0;
  }

  .user-meta small {
    display: block;
    font-size: 11px;
    color: var(--text-sub);
  }

  .user-meta strong {
    font-size: 14.5px;
    color: var(--text-main);
  }

  .badge-role {
    font-size: 11px;
    font-weight: 800;
    padding: 5px 14px;
    border-radius: 20px;
    background: rgba(56, 189, 248, 0.15);
    border: 1px solid rgba(56, 189, 248, 0.3);
    color: #0284c7;
  }

  /* CONTENT AREA */
  .zen-content {
    padding: 28px 32px 110px;
    width: 100%;
    max-width: 1380px;
    margin: 0 auto;
  }

  /* BENTO HERO */
  .bento-grid {
    display: grid;
    grid-template-columns: 1.5fr 1fr;
    gap: 20px;
    width: 100%;
  }

  .bento-card {
    background: var(--card-bg);
    backdrop-filter: blur(20px);
    border: 1px solid var(--card-border);
    border-radius: 26px;
    padding: 26px;
    position: relative;
    overflow: hidden;
  }

  .bento-hero {
    background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%);
    border: 1px solid rgba(59, 130, 246, 0.35);
    color: #ffffff;
  }

  .hero-shine {
    position: absolute;
    top: -50px;
    right: -50px;
    width: 220px;
    height: 220px;
    background: radial-gradient(circle, rgba(56, 189, 248, 0.35) 0%, transparent 70%);
    pointer-events: none;
  }

  .tag-status {
    display: inline-block;
    font-size: 11.5px;
    font-weight: 800;
    color: #4ade80;
    margin-bottom: 12px;
  }

  .bento-hero h2 {
    font-size: clamp(20px, 2.5vw, 26px);
    font-weight: 800;
    color: #ffffff;
    margin-bottom: 8px;
    line-height: 1.3;
  }

  .bento-hero p {
    font-size: 14px;
    color: #cbd5e1;
    line-height: 1.6;
    margin-bottom: 22px;
  }

  .hero-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .btn-hero {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 22px;
    border-radius: 16px;
    border: none;
    font-weight: 700;
    font-size: 13.5px;
    cursor: pointer;
  }

  .btn-hero.primary {
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    color: #fff;
    box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4);
  }

  .btn-hero.emerald {
    background: linear-gradient(135deg, #059669, #047857);
    color: #fff;
    box-shadow: 0 6px 20px rgba(5, 150, 105, 0.4);
  }

  /* MOSAIC SERVICES */
  .bento-services h3 {
    font-size: 16px;
    font-weight: 800;
    color: var(--text-main);
    margin-bottom: 16px;
  }

  .services-mosaic {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .mosaic-tile {
    background: var(--chip-bg);
    border: 1px solid var(--card-border);
    border-radius: 18px;
    padding: 16px 14px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .mosaic-tile:hover {
    transform: translateY(-2px);
    border-color: #3b82f6;
  }

  .tile-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 19px;
    margin-bottom: 10px;
  }

  .tile-icon.red { background: rgba(239, 68, 68, 0.2); }
  .tile-icon.green { background: rgba(5, 150, 105, 0.2); }
  .tile-icon.purple { background: rgba(168, 85, 247, 0.2); }
  .tile-icon.orange { background: rgba(249, 115, 22, 0.2); }
  .tile-icon.amber { background: rgba(245, 158, 11, 0.2); }

  .mosaic-tile strong {
    font-size: 13.5px;
    color: var(--text-main);
  }

  .mosaic-tile small {
    font-size: 11px;
    color: var(--text-sub);
  }

  /* UNIVERSAL CARD SHEET */
  .card-sheet {
    background: var(--card-bg);
    backdrop-filter: blur(24px);
    border: 1px solid var(--card-border);
    border-radius: 28px;
    padding: clamp(16px, 3vw, 28px);
    width: 100%;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
  }

  .sheet-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 22px;
    gap: 16px;
    flex-wrap: wrap;
  }

  .sheet-head h2 {
    font-size: clamp(18px, 2vw, 22px);
    font-weight: 800;
    color: var(--text-main);
  }

  .sheet-head p {
    font-size: 13px;
    color: var(--text-sub);
    margin-top: 4px;
  }

  .btn-round-close {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid var(--card-border);
    background: var(--chip-bg);
    color: var(--text-main);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .flex-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* ========================================================
     SMP CLASS PICKER SUB-BAR
  ======================================================== */
  .smp-subnav-panel {
    background: var(--chip-bg);
    border: 1px solid var(--card-border);
    border-radius: 16px;
    padding: 12px 16px;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .subnav-title {
    font-size: 12px;
    font-weight: 800;
    color: var(--text-sub);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .smp-classes-bar {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    flex: 1;
  }

  .smp-classes-bar button {
    padding: 8px 14px;
    border-radius: 12px;
    border: 1px solid var(--card-border);
    background: var(--card-bg);
    color: var(--text-sub);
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s ease;
  }

  .smp-classes-bar button.active {
    background: #0284c7;
    color: #ffffff;
    border-color: #0284c7;
    box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35);
  }

  .badge-count {
    background: rgba(255, 255, 255, 0.25);
    padding: 2px 7px;
    border-radius: 10px;
    font-size: 11px;
  }

  .class-label-tag {
    font-size: 11.5px;
    font-weight: 700;
    background: var(--chip-bg);
    padding: 4px 10px;
    border-radius: 8px;
    border: 1px solid var(--card-border);
  }

  /* ========================================================
     NGAJI CONTROLS & MANUAL PANEL
  ======================================================== */
  .ngaji-controls-panel {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    align-items: flex-end;
    margin-bottom: 18px;
  }

  .ngaji-mode-toggle {
    margin-left: auto;
  }

  .manual-ngaji-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .sub-panel-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .search-santri-input {
    flex: 1 1 240px;
    max-width: 400px;
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px solid var(--input-border);
    background: var(--input-bg);
    color: var(--input-text);
    font: inherit;
    font-size: 13px;
    outline: none;
  }

  .search-santri-input:focus {
    border-color: #059669;
    box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.25);
  }

  .santri-count-badge {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-sub);
    background: var(--chip-bg);
    padding: 6px 12px;
    border-radius: 10px;
    border: 1px solid var(--card-border);
  }

  .emerald-avatar {
    background: rgba(5, 150, 105, 0.2) !important;
    color: #059669 !important;
  }

  .ngaji-select {
    max-width: 170px;
  }

  /* TABLE WRAPPER */
  .table-wrap-glass {
    border-radius: 18px;
    overflow-x: auto;
    border: 1px solid var(--card-border);
    background: var(--table-wrap-bg);
    width: 100%;
  }

  .zen-table {
    width: 100%;
    min-width: 680px;
    border-collapse: collapse;
    font-size: 13px;
  }

  .zen-table th {
    padding: 14px 18px;
    text-align: left;
    color: var(--text-sub);
    background: var(--table-header-bg);
    border-bottom: 1px solid var(--table-border);
    font-weight: 700;
    white-space: nowrap;
  }

  .zen-table td {
    padding: 14px 18px;
    border-bottom: 1px solid var(--table-border);
    color: var(--text-main);
    white-space: nowrap;
  }

  .name-block {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .text-sub {
    color: var(--text-sub);
    font-size: 11px;
  }

  .mini-avatar {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: rgba(56, 189, 248, 0.2);
    color: #0284c7;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 13px;
    flex-shrink: 0;
  }

  .score-tag {
    font-size: 14px;
    font-weight: 800;
    color: #0284c7;
  }

  .status-pill {
    padding: 5px 12px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
  }

  .status-pill.hadir { background: rgba(34, 197, 94, 0.2); color: #16a34a; }
  .status-pill.izin { background: rgba(59, 130, 246, 0.2); color: #2563eb; }
  .status-pill.sakit { background: rgba(245, 158, 11, 0.2); color: #d97706; }
  .status-pill.alpha { background: rgba(239, 68, 68, 0.2); color: #dc2626; }
  .status-pill.pulang { background: rgba(168, 85, 247, 0.2); color: #9333ea; }
  .status-pill.belum { background: rgba(148, 163, 184, 0.2); color: var(--text-sub); }

  /* GRADE FILTER COMPONENT */
  .grade-filter-box {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 14px;
    background: var(--chip-bg);
    border: 1px solid var(--card-border);
    border-radius: 18px;
    padding: 16px;
    margin-bottom: 20px;
  }

  .field-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }

  .field-item label {
    font-size: 11.5px;
    font-weight: 700;
    color: var(--text-sub);
  }

  .field-item input,
  .field-item select,
  .input-styled-area,
  .select-pill {
    width: 100%;
    padding: 11px 14px;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 12px;
    color: var(--input-text);
    font: inherit;
    font-size: 13.5px;
    outline: none;
  }

  .field-item select option,
  .select-pill option,
  .input-date-styled select option {
    background-color: var(--input-bg);
    color: var(--input-text);
    padding: 10px;
  }

  .field-item input:focus,
  .field-item select:focus,
  .input-styled-area:focus {
    border-color: #38bdf8;
    box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.25);
  }

  /* PENGUMUMAN BUBBLES */
  .announcement-grid-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .announcement-bubble {
    background: var(--bubble-bg);
    border: 1px solid var(--card-border);
    border-radius: 20px;
    padding: 20px;
  }

  .bubble-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
    gap: 12px;
  }

  .bubble-header h4 {
    font-size: 16px;
    color: var(--text-main);
    font-weight: 800;
  }

  .bubble-header small {
    display: block;
    color: var(--text-sub);
    font-size: 11.5px;
    margin-top: 2px;
  }

  .bubble-content {
    font-size: 13.5px;
    line-height: 1.7;
    color: var(--text-main);
    white-space: pre-wrap;
  }

  .empty-state-card {
    padding: 50px 20px;
    text-align: center;
    color: var(--text-sub);
  }

  .empty-icon {
    font-size: 42px;
    display: block;
    margin-bottom: 10px;
  }

  .action-buttons-inline {
    display: flex;
    gap: 6px;
  }

  .btn-mini-icon {
    border: none;
    background: var(--chip-bg);
    color: var(--text-main);
    padding: 6px 10px;
    border-radius: 8px;
    cursor: pointer;
  }

  .btn-mini-icon.danger {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  /* FILTER STRIP & CHIPS */
  .filter-strip {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    align-items: flex-end;
    margin-bottom: 18px;
  }

  .input-date-styled {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1 1 200px;
  }

  .input-date-styled label {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-sub);
  }

  .input-date-styled input,
  .input-date-styled select {
    width: 100%;
    padding: 10px 14px;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 12px;
    color: var(--input-text);
    font: inherit;
  }

  .tab-segments {
    display: flex;
    gap: 6px;
    background: var(--chip-bg);
    padding: 4px;
    border-radius: 14px;
    flex-wrap: wrap;
  }

  .tab-segments button {
    padding: 8px 16px;
    border-radius: 10px;
    border: none;
    background: transparent;
    color: var(--text-sub);
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    flex: 1 1 auto;
  }

  .tab-segments button.active {
    background: #2563eb;
    color: #fff;
  }

  .summary-chips {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .chip {
    padding: 8px 14px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    background: var(--chip-bg);
    border: 1px solid var(--card-border);
    flex: 1 1 calc(16% - 10px);
    min-width: 100px;
  }

  .chip.green strong { color: #16a34a; }
  .chip.blue strong { color: #2563eb; }
  .chip.amber strong { color: #d97706; }
  .chip.red strong { color: #dc2626; }
  .chip.purple strong { color: #9333ea; }
  .chip.gray strong { color: var(--text-sub); }

  .select-pill {
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    color: var(--input-text);
    font: inherit;
    font-size: 12.5px;
    width: 100%;
    min-width: 120px;
  }

  /* BUTTONS */
  .btn-cta {
    padding: 12px 24px;
    border-radius: 14px;
    border: none;
    font-weight: 700;
    font-size: 13.5px;
    cursor: pointer;
  }

  .btn-cta.mini {
    padding: 8px 16px;
    font-size: 12px;
    border-radius: 10px;
  }

  .btn-cta.blue { background: #2563eb; color: #fff; }
  .btn-cta.emerald, .btn-cta.green { background: #059669; color: #fff; }
  .btn-cta.outline { background: var(--chip-bg); color: var(--text-main); border: 1px solid var(--card-border); }
  .btn-cta.stop { background: #ef4444; color: #fff; }

  /* SCANNER UI */
  .scanner-sheet { max-width: 600px; margin: 0 auto; }
  .scanner-arena { display: flex; flex-direction: column; align-items: center; gap: 16px; width: 100%; }
  .scanner-frame {
    width: 100%; min-height: 280px; border-radius: 24px;
    border: 2px dashed var(--card-border);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    background: var(--table-wrap-bg); position: relative; overflow: hidden;
  }

  #qr-reader { width: 100%; border-radius: 22px; }
  .scanner-standby { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 20px; text-align: center; }

  .pulsing-ring {
    width: 60px; height: 60px; border-radius: 50%;
    background: rgba(37, 99, 235, 0.2); display: flex; align-items: center; justify-content: center;
    font-size: 26px;
  }

  .pulsing-ring.emerald { background: rgba(5, 150, 105, 0.2); }

  .scanner-feedback {
    width: 100%; padding: 14px; border-radius: 14px;
    background: var(--chip-bg); text-align: center; font-size: 13px; font-weight: 700;
  }

  .scanner-feedback.positive { background: rgba(34, 197, 94, 0.2); color: #16a34a; }

  .student-scanned-card {
    display: flex; align-items: center; gap: 14px; width: 100%;
    padding: 14px 18px; border-radius: 18px; background: rgba(37, 99, 235, 0.15);
    border: 1px solid rgba(37, 99, 235, 0.35);
  }

  .student-scanned-card.emerald {
    background: rgba(5, 150, 105, 0.15); border-color: rgba(5, 150, 105, 0.35);
  }

  .avatar-lg {
    width: 44px; height: 44px; border-radius: 12px; background: #2563eb;
    color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 800;
    flex-shrink: 0;
  }

  /* TIMELINE SCHEDULE */
  .schedule-timeline { display: flex; flex-direction: column; gap: 16px; }
  .day-cluster { display: flex; flex-direction: column; gap: 8px; }
  .day-badge {
    font-size: 12px; font-weight: 800; color: #0284c7;
    background: rgba(56, 189, 248, 0.15); padding: 4px 12px; border-radius: 12px; width: fit-content;
  }

  .cluster-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
  .lesson-card {
    background: var(--chip-bg); border: 1px solid var(--card-border);
    border-radius: 16px; padding: 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px;
  }

  .lesson-time { font-size: 12px; color: #0284c7; font-weight: 700; flex-shrink: 0; }
  .lesson-info { flex: 1; min-width: 0; }
  .lesson-info strong { display: block; font-size: 13.5px; color: var(--text-main); overflow: hidden; text-overflow: ellipsis; }
  .lesson-info small { color: var(--text-sub); font-size: 11.5px; }

  /* QR ID CARDS */
  .qr-cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 16px; }
  .qr-card-item {
    background: #ffffff; color: #0f172a; border-radius: 20px; padding: 16px;
    display: flex; flex-direction: column; align-items: center;
    border: 1px solid var(--card-border);
  }

  .qr-head { width: 100%; display: flex; justify-content: space-between; font-size: 9px; font-weight: 800; color: #64748b; margin-bottom: 10px; }
  .qr-canvas-box img { width: 130px; height: 130px; max-width: 100%; }
  .qr-card-item strong { font-size: 14px; margin-top: 6px; }
  .qr-card-item small { font-size: 10px; color: #64748b; }

  /* MODAL CURTAIN */
  .zen-modal-curtain {
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px;
  }

  .zen-modal-box {
    background: var(--modal-bg); border: 1px solid var(--card-border);
    border-radius: 24px; padding: clamp(16px, 3vw, 26px); width: 100%; max-width: 480px; 
    display: flex; flex-direction: column; gap: 14px; max-height: 90vh; overflow-y: auto;
    color: var(--text-main);
  }

  .zen-modal-box.wide { max-width: 720px; }
  .modal-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .modal-top h3 { font-size: 18px; color: var(--text-main); font-weight: 800; }
  .modal-close-x { background: none; border: none; color: var(--text-sub); font-size: 20px; cursor: pointer; }
  .modal-grid-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .modal-btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }

  /* TOAST */
  .zen-toast {
    position: fixed; top: 20px; right: 20px; background: var(--modal-bg);
    border: 1px solid var(--card-border); backdrop-filter: blur(16px);
    padding: 14px 20px; border-radius: 16px; display: flex; align-items: center; gap: 12px; z-index: 2000;
    max-width: calc(100vw - 40px);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  }
  .toast-indicator { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; flex-shrink: 0; }
  .zen-toast.error .toast-indicator { background: #ef4444; }
  .text-center-muted { text-align: center; color: var(--text-sub); padding: 26px; }

  /* DOCK NAVBAR */
  .dock-navbar { display: none; }

  @media (max-width: 1024px) {
    .zen-sidebar { transform: translateX(-100%); }
    .zen-sidebar.open { transform: translateX(0); }
    .zen-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(4px); z-index: 90; }
    .zen-main { margin-left: 0; }
    .menu-burger { display: block; }
    .zen-topbar { padding: 0 16px; }
    .zen-content { padding: 18px 16px 125px; }

    .dock-navbar {
      display: flex;
      align-items: center;
      justify-content: space-around;
      position: fixed;
      left: max(10px, env(safe-area-inset-left));
      right: max(10px, env(safe-area-inset-right));
      bottom: max(10px, env(safe-area-inset-bottom));
      height: 68px;
      padding: 0 6px;
      background: var(--dock-bg);
      backdrop-filter: blur(28px) saturate(180%);
      -webkit-backdrop-filter: blur(28px) saturate(180%);
      border: 1px solid var(--card-border);
      border-radius: 26px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
      z-index: 150;
    }

    .dock-navbar > button {
      background: transparent;
      border: none;
      color: var(--text-sub);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      cursor: pointer;
      flex: 1;
      height: 100%;
      min-width: 0;
    }

    .dock-navbar > button.active {
      color: #0284c7;
    }

    .dock-icon { font-size: 19px; line-height: 1; }
    .dock-txt { font-size: 9px; font-weight: 700; white-space: nowrap; }

    .dock-scan-capsule {
      display: flex;
      align-items: center;
      gap: 6px;
      background: var(--modal-bg);
      padding: 3px;
      border-radius: 22px;
      border: 1px solid var(--card-border);
      margin-top: -26px;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
      flex-shrink: 0;
    }

    .scan-pill-btn {
      width: 52px;
      height: 52px;
      border-radius: 17px;
      border: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #ffffff;
      transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .scan-pill-btn.blue {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      box-shadow: 0 6px 18px rgba(37, 99, 235, 0.4);
    }

    .scan-pill-btn.emerald {
      background: linear-gradient(135deg, #059669, #047857);
      box-shadow: 0 6px 18px rgba(5, 150, 105, 0.4);
    }

    .scan-pill-btn:active { transform: scale(0.92); }
    .scan-pill-btn.active { transform: translateY(-4px) scale(1.05); }
    .pill-ico { font-size: 17px; line-height: 1; }
    .pill-tag { font-size: 8px; font-weight: 800; letter-spacing: 0.02em; margin-top: 2px; text-transform: uppercase; }
  }

  @media (max-width: 640px) {
    .bento-grid { grid-template-columns: 1fr; }
    .services-mosaic { grid-template-columns: repeat(2, 1fr); }
    .hero-actions { flex-direction: column; }
    .btn-hero { width: 100%; justify-content: center; }
    .modal-grid-fields { grid-template-columns: 1fr; }
    .chip { flex: 1 1 calc(33% - 10px); }
  }
</style>