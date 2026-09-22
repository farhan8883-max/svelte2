
<script lang="ts">
  import { supabase } from "$lib/supabaseClient";
  import { onMount, tick } from "svelte";
  import { goto } from "$app/navigation";

  /* =========================
     INTERFACES
  ========================= */

  interface User {
    id: number;
    full_name: string;
    username: string;
    email: string;
    password_hash?: string;
    role: "admin" | "santri" | "ustad";
    class_name: string | null;
    class_id: number | null;
  }

  interface UserClass {
    id: number;
    name: string;
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

  interface Attendance {
    id?: number;
    user_id: number;
    date: string;
    status: "hadir" | "izin" | "sakit" | "alpha";
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
    | "home"
    | "spp"
    | "users"
    | "attendance"
    | "schedule"
    | "barcode"
    | "topup"
    | "announcement";

  /* =========================
     MONTHS
  ========================= */

  const months: {
    key: keyof Omit<
      SPPRecord,
      "id" | "user_id" | "year"
    >;
    label: string;
  }[] = [
    { key: "january", label: "Jan" },
    { key: "february", label: "Feb" },
    { key: "march", label: "Mar" },
    { key: "april", label: "Apr" },
    { key: "may", label: "Mei" },
    { key: "june", label: "Jun" },
    { key: "july", label: "Jul" },
    { key: "august", label: "Agu" },
    { key: "september", label: "Sep" },
    { key: "october", label: "Okt" },
    { key: "november", label: "Nov" },
    { key: "december", label: "Des" }
  ];

  /* =========================
     SCHEDULE OPTIONS
  ========================= */

  // Tetap dipakai oleh modul jadwal yang masih menggunakan nama kelas.
  const classOptions = [
    "Kelas 1", "Kelas 2", "Kelas 3",
    "Kelas 4", "Kelas 5", "Kelas 6", "Kelas 7", "Kelas 8", "Kelas 9", "Kelas 10", "Kelas 11", "Kelas 12", "SMA", "SMP", "SD"
  ];

  // Pilihan kelas untuk User memakai ID dari tabel `classes`.
  let userClassOptions: UserClass[] = [];

  const subjectOptions = [
    "None",
    "Al-Qur'an",
    "Tahfidz",
    "Aqidah",
    "Akhlak",
    "Fiqih",
    "Hadits",
    "Bahasa Arab",
    "Bahasa Indonesia",
    "Bahasa Inggris",
    "Matematika",
    "IPA",
    "IPS",
    "Sejarah Islam"
  ];

  const dayOptions = [
    "Senin", "Selasa", "Rabu", "Kamis",
    "Jumat", "Sabtu", "Minggu"
  ];

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

  $: schedulesByDay = dayOptions.map(day => ({
    day,
    items: schedules.filter(schedule => schedule.day === day)
  }));
  let announcements: Announcement[] = [];

  let sppData: Record<number, SPPRecord> = {};

  /* =========================
     DASHBOARD STATS
  ========================= */

  let totalSaldo = 0;
  let totalPemasukan = 0;
  let totalPengeluaran = 0;

  /* =========================
     TOAST
  ========================= */

  let message = "";
  let isError = false;
  let toastTimer: ReturnType<typeof setTimeout>;

  /* =========================
     SPP
  ========================= */

  let selectedYear = new Date().getFullYear();
  let searchKeyword = "";

  /* =========================
     USER MODAL
  ========================= */

  let showUserModal = false;
  let editingUserId: number | null = null;

  // Pencarian khusus halaman Kelola User.
  let userManagementSearch = "";

  let formFullName = "";
  let formUsername = "";
  let formEmail = "";
  let formPassword = "";
  let formConfirmPassword = "";
  let formClassId: number | null = null;
  let formClassName = "";

  let formRole:
    | "admin"
    | "santri"
    | "ustad" = "santri";

  let isSavingUser = false;

  /* =========================
     TOP UP
  ========================= */

  let transactionName = "";

  let transactionDate =
    new Date()
      .toISOString()
      .split("T")[0];

  let transactionAmount:
    | number
    | string = "";

  let transactionUserId = "";

  /* =========================
     ATTENDANCE
  ========================= */

  let attendanceDate =
    new Date()
      .toISOString()
      .split("T")[0];

  let selectedAttendanceUser = "";
  let attendanceClassFilter = "";
  let attendanceSearch = "";

  // Jenjang absensi dibuat terpisah agar saat tombol SD/SMP/SMA diklik
  // hanya santri pada jenjang tersebut yang ditampilkan.
  let attendanceSection: "SD" | "SMP" | "SMA" = "SD";
  let attendanceSmpClass = "";

  let attendanceStatus:
    | "hadir"
    | "izin"
    | "sakit"
    | "alpha" = "hadir";

  /* =========================
     QR SCANNER
  ========================= */

  let showQrScanner = false;
  let qrScannerError = "";
  let qrScannerStream: MediaStream | null = null;
  let qrScannerTimer: ReturnType<typeof setInterval> | null = null;
  let qrVideoElement: HTMLVideoElement;

  /* =========================
     SCHEDULE
  ========================= */

  let showScheduleModal = false;
  let editingScheduleId: number | null = null;

  let scheduleDay = "";

  let scheduleItems: ScheduleFormItem[] = [
    { class_name: "", subject: "None", subject2: "None", teacher_id: "", time: "" }
  ];

  /* =========================
     ANNOUNCEMENT
  ========================= */

  let showAnnouncementModal = false;

  let editingAnnouncementId:
    | number
    | null = null;

  let announcementTitle = "";
  let announcementContent = "";

  /* =========================
     ROLE DETAIL MODAL
  ========================= */

  let showRoleModal = false;
  let selectedRole: "admin" | "santri" | "ustad" | null = null;

  /* =========================
     INITIAL LOAD
  ========================= */

  onMount(async () => {

    const storedUser =
      localStorage.getItem("user");

    if (!storedUser) {

      goto("/login");

      return;
    }

    try {

      currentUser =
        JSON.parse(storedUser);

    } catch {

      localStorage.removeItem("user");

      goto("/login");

      return;
    }

    await Promise.all([
      loadClasses(),
      loadUsers(),
      loadEntries(),
      loadSPPData(),
      loadAttendance(),
      loadSchedules(),
      loadAnnouncements()
    ]);
  });

  /* =========================
     COMPUTED USERS
  ========================= */

  $: santriUsers =
    users.filter(
      user =>
        user.role === "santri"
    );

  function getSchoolLevel(className: string | null | undefined) {
    if (!className) return "";

    const value = className.trim().toLowerCase();

    // Mendukung nama kelas lama seperti "Kelas 1" dan juga nama yang
    // mengandung jenjang, misalnya "SD Kelas 1" / "SMA Kelas 10".
    if (/\b(kelas\s*)?[1-6]\b/.test(value) || /\bsd\b/.test(value)) {
      return "SD";
    }

    if (/\b(kelas\s*)?[7-9]\b/.test(value) || /\bsmp\b/.test(value)) {
      return "SMP";
    }

    if (/\b(kelas\s*)?(10|11|12)\b/.test(value) || /\bsma\b/.test(value)) {
      return "SMA";
    }

    return className;
  }

  $: filteredAttendanceSantri =
    santriUsers.filter(user => {
      const className = (user.class_name || "").trim().toLowerCase();
      const schoolLevel = getSchoolLevel(user.class_name);

      // Hanya tampilkan santri dari jenjang yang sedang dipilih.
      let sectionMatch = schoolLevel === attendanceSection;

      // Untuk SMP, pengguna tetap bisa memilih Kelas 1/2/3.
      if (attendanceSection === "SMP" && attendanceSmpClass) {
        const smpClassMap: Record<string, string[]> = {
          "1": ["kelas 7", "7", "smp 1", "smp kelas 1"],
          "2": ["kelas 8", "8", "smp 2", "smp kelas 2"],
          "3": ["kelas 9", "9", "smp 3", "smp kelas 3"]
        };

        const allowedNames = smpClassMap[attendanceSmpClass] || [];
        sectionMatch =
          sectionMatch &&
          allowedNames.some(name => className === name || className.endsWith(` ${name}`));
      }

      const keyword = attendanceSearch.trim().toLowerCase();
      const searchMatch =
        !keyword ||
        (user.full_name || "").toLowerCase().includes(keyword) ||
        (user.username || "").toLowerCase().includes(keyword) ||
        className.includes(keyword);

      return sectionMatch && searchMatch;
    });

  $: ustadUsers =
    users.filter(
      user =>
        user.role === "ustad"
    );

  $: adminUsers = users.filter(user => user.role === "admin");

  $: roleUsers =
    selectedRole
      ? users.filter(user => user.role === selectedRole)
      : [];

  // Data yang ditampilkan pada Kelola User mengikuti kata pencarian.
  // Pencarian mencakup nama, username, email, role, kelas, dan ID user.
  $: filteredManagedUsers = users.filter(user => {
    const keyword = userManagementSearch.trim().toLowerCase();

    if (!keyword) return true;

    return [
      user.id?.toString() || "",
      user.full_name || "",
      user.username || "",
      user.email || "",
      user.role || "",
      user.class_name || "",
      user.class_id?.toString() || ""
    ].some(value => value.toLowerCase().includes(keyword));
  });

  $: filteredSantri =
    santriUsers.filter(
      user =>
        user.username
          .toLowerCase()
          .includes(
            searchKeyword.toLowerCase()
          )
    );

  /* =========================
     ROLE DETAIL MODAL
  ========================= */

  function openRoleModal(role: "admin" | "santri" | "ustad") {
    selectedRole = role;
    showRoleModal = true;
  }

  function closeRoleModal() {
    showRoleModal = false;
    selectedRole = null;
  }

  function getRoleLabel(role: "admin" | "santri" | "ustad" | null) {
    if (role === "admin") return "Admin";
    if (role === "santri") return "Santri";
    if (role === "ustad") return "Ustad";
    return "User";
  }

  /* =========================
     ADMIN CHECK
  ========================= */

  $: isAdmin =
    currentUser?.role === "admin";

  /* =========================
     LOAD USERS
  ========================= */

  async function loadClasses() {
    // Mengambil seluruh kolom agar tetap kompatibel jika tabel `classes`
    // memakai `name` atau `class_name` sebagai kolom nama kelas.
    const { data, error } = await supabase
      .from("classes")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      showToast("Gagal memuat kelas: " + error.message, true);
      userClassOptions = [];
      return;
    }

    userClassOptions = (data || [])
      .map((row: any) => ({
        id: Number(row.id),
        name: String(row.name ?? row.class_name ?? row.nama ?? `Kelas ${row.id}`)
      }))
      .filter((kelas) => Number.isFinite(kelas.id) && kelas.name);
  }

  async function loadUsers() {

    const { data, error } = await supabase
      .from("users")
      .select("id, full_name, username, email, role, class_name, class_id")
      .order("username", { ascending: true });

    if (error) {
      showToast("Gagal memuat user: " + error.message, true);
      return;
    }

    users = (data || []) as User[];
  }

  /* =========================
     LOAD ENTRIES
  ========================= */

  async function loadEntries() {

    const {
      data,
      error
    } = await supabase
      .from("entries")
      .select("*")
      .order(
        "id",
        {
          ascending: false
        }
      );

    if (error) {

      showToast(
        "Gagal memuat transaksi: " +
          error.message,
        true
      );

      return;
    }

    entries =
      (data || []) as Entry[];

    calculateStats();
  }

  /* =========================
     CALCULATE MONEY
  ========================= */

  function calculateStats() {

    totalPemasukan =
      entries
        .filter(
          entry =>
            entry.kind ===
            "pemasukan"
        )
        .reduce(
          (
            total,
            entry
          ) =>
            total +
            Number(
              entry.amount
            ),
          0
        );

    totalPengeluaran =
      entries
        .filter(
          entry =>
            entry.kind ===
            "pengeluaran"
        )
        .reduce(
          (
            total,
            entry
          ) =>
            total +
            Number(
              entry.amount
            ),
          0
        );

    totalSaldo =
      totalPemasukan -
      totalPengeluaran;
  }

  /* =========================
     LOAD SPP
  ========================= */

  async function loadSPPData() {

    const {
      data,
      error
    } = await supabase
      .from("spp_payments")
      .select("*")
      .eq(
        "year",
        selectedYear
      );

    if (error) {

      showToast(
        "Gagal memuat SPP: " +
          error.message,
        true
      );

      return;
    }

    const map:
      Record<
        number,
        SPPRecord
      > = {};

    (
      (data || []) as
      SPPRecord[]
    ).forEach(
      item => {

        map[
          Number(
            item.user_id
          )
        ] = {
          ...item,
          user_id:
            Number(
              item.user_id
            )
        };

      }
    );

    sppData = map;
  }

  /* =========================
     TOGGLE SPP
  ========================= */

  async function toggleSPP(
    userId: number,

    monthKey: keyof Omit<
      SPPRecord,
      "id" |
      "user_id" |
      "year"
    >
  ) {

    if (!isAdmin) {

      showToast(
        "Hanya admin yang dapat mengubah SPP.",
        true
      );

      return;
    }

    const currentRecord =
      sppData[userId] || {

        user_id:
          userId,

        year:
          selectedYear,

        january:
          false,

        february:
          false,

        march:
          false,

        april:
          false,

        may:
          false,

        june:
          false,

        july:
          false,

        august:
          false,

        september:
          false,

        october:
          false,

        november:
          false,

        december:
          false
      };

    const nextValue =
      !currentRecord[
        monthKey
      ];

    const {
      error
    } = await supabase
      .from("spp_payments")
      .upsert(
        {
          ...currentRecord,

          user_id:
            userId,

          year:
            selectedYear,

          [monthKey]:
            nextValue
        },
        {
          onConflict:
            "user_id,year"
        }
      );

    if (error) {

      showToast(
        "Gagal mengubah SPP: " +
          error.message,
        true
      );

      return;
    }

    sppData = {

      ...sppData,

      [userId]: {

        ...currentRecord,

        [monthKey]:
          nextValue
      }
    };

    showToast(
      nextValue
        ? "✓ SPP berhasil ditandai lunas"
        : "Status SPP dibatalkan"
    );
  }

  /* =========================
     COUNT SPP
  ========================= */

  function getLunasCount(
    userId: number
  ) {

    const record =
      sppData[userId];

    if (!record) {
      return 0;
    }

    return months.filter(
      month =>
        record[
          month.key
        ]
    ).length;
  }

  /* =========================
     ADD TRANSACTION
  ========================= */

  async function addTransaction() {

    if (!isAdmin) {

      showToast(
        "Hanya admin yang dapat melakukan top up.",
        true
      );

      return;
    }

    if (
      !transactionName.trim() ||
      !transactionDate ||
      !transactionAmount ||
      !transactionUserId
    ) {

      showToast(
        "Semua data wajib diisi!",
        true
      );

      return;
    }

    const {
      error
    } = await supabase
      .from("entries")
      .insert([
        {
          name:
            transactionName.trim(),

          date:
            transactionDate,

          amount:
            Number(
              transactionAmount
            ),

          kind:
            "pemasukan",

          user_id:
            Number(
              transactionUserId
            )
        }
      ]);

    if (error) {

      showToast(
        "Gagal mengirim uang: " +
          error.message,
        true
      );

      return;
    }

    showToast(
      "✓ Uang berhasil terkirim!"
    );

    transactionName = "";
    transactionAmount = "";
    transactionUserId = "";

    await loadEntries();
  }

  /* =========================
     USER MODAL
  ========================= */

  function handleRoleChange() {
    // Kelas hanya berlaku untuk santri.
    if (formRole !== "santri") {
      formClassId = null;
      formClassName = "";
    }
  }

  function resetUserForm() {
    editingUserId = null;
    formFullName = "";
    formUsername = "";
    formEmail = "";
    formPassword = "";
    formConfirmPassword = "";
    formClassId = null;
    formClassName = "";
    formRole = "santri";
  }

  function openAddUserModal() {
    if (!isAdmin) {
      showToast("❌ Hanya admin yang dapat menambah user.", true);
      return;
    }

    resetUserForm();
    showUserModal = true;
  }

  function openEditUserModal(user: User) {
    if (!isAdmin) {
      showToast("❌ Hanya admin yang dapat mengedit user.", true);
      return;
    }

    editingUserId = user.id;
    formFullName = user.full_name || "";
    formUsername = user.username || "";
    formEmail = user.email || "";
    formPassword = "";
    formConfirmPassword = "";
    formRole = user.role;

    // Utamakan class_id. Jika data lama belum memiliki class_id,
    // coba cari ID berdasarkan class_name agar form tetap bisa diedit.
    formClassId =
      user.class_id ??
      userClassOptions.find((kelas) => kelas.name === user.class_name)?.id ??
      null;

    formClassName = user.class_name || "";
    showUserModal = true;
  }

  async function saveUser() {
    if (!isAdmin) {
      showToast("❌ Hanya admin yang dapat menyimpan user.", true);
      return;
    }

    if (isSavingUser) return;

    const full_name = formFullName.trim();
    const username = formUsername.trim();
    const email = formEmail.trim().toLowerCase();
    const password = formPassword;
    const confirmPassword = formConfirmPassword;

    // class_id adalah sumber utama relasi user -> kelas.
    const class_id =
      formRole === "santri" && formClassId !== null
        ? Number(formClassId)
        : null;

    // class_name tetap disinkronkan agar modul lama yang masih membaca
    // users.class_name tetap berjalan tanpa perubahan besar.
    const selectedClass =
      class_id !== null
        ? userClassOptions.find((kelas) => kelas.id === class_id)
        : null;

    const class_name =
      formRole === "santri"
        ? (selectedClass?.name || formClassName.trim() || null)
        : null;

    if (!full_name || !username || !email) {
      showToast("❌ Nama lengkap, username, dan email wajib diisi.", true);
      return;
    }

    if (formRole === "santri" && class_id === null) {
      showToast("❌ Kelas wajib dipilih untuk santri.", true);
      return;
    }

    if (username.length < 3) {
      showToast("❌ Username minimal 3 karakter.", true);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast("❌ Format email tidak valid.", true);
      return;
    }

    if (editingUserId === null && !password) {
      showToast("❌ Password wajib diisi.", true);
      return;
    }

    if (password && password.length < 6) {
      showToast("❌ Password minimal 6 karakter.", true);
      return;
    }

    if (password && password !== confirmPassword) {
      showToast("❌ Konfirmasi password tidak sama.", true);
      return;
    }

    isSavingUser = true;

    try {
      let usernameQuery = supabase
        .from("users")
        .select("id")
        .ilike("username", username);

      let emailQuery = supabase
        .from("users")
        .select("id")
        .ilike("email", email);

      if (editingUserId !== null) {
        usernameQuery = usernameQuery.neq("id", editingUserId);
        emailQuery = emailQuery.neq("id", editingUserId);
      }

      const [usernameResult, emailResult] = await Promise.all([
        usernameQuery,
        emailQuery
      ]);

      if (usernameResult.error) throw usernameResult.error;
      if (emailResult.error) throw emailResult.error;

      if ((usernameResult.data || []).length > 0) {
        showToast("❌ Username sudah digunakan.", true);
        return;
      }

      if ((emailResult.data || []).length > 0) {
        showToast("❌ Email sudah digunakan.", true);
        return;
      }

      if (editingUserId !== null) {
        const payload: Record<string, any> = {
          full_name,
          username,
          email,
          role: formRole,
          class_id,
          class_name
        };

        if (password) {
          payload.password_hash = btoa(password);
        }

        const { error } = await supabase
          .from("users")
          .update(payload)
          .eq("id", editingUserId);

        if (error) throw error;
        showToast(`✓ User "${username}" berhasil diperbarui!`);
      } else {
        const password_hash = btoa(password);

        const { error } = await supabase
          .from("users")
          .insert([{
            full_name,
            username,
            email,
            password_hash,
            role: formRole,
            class_id,
            class_name
          }]);

        if (error) throw error;
        showToast(`✓ User "${username}" berhasil ditambahkan!`);
      }

      showUserModal = false;
      resetUserForm();
      await loadUsers();

    } catch (error: any) {
      console.error("Gagal menyimpan user:", error);

      const errorMessage = error?.message || "Terjadi kesalahan.";

      if (errorMessage.includes("duplicate key")) {
        if (errorMessage.includes("email")) {
          showToast("❌ Email sudah digunakan.", true);
        } else {
          showToast("❌ Username sudah digunakan.", true);
        }
      } else {
        showToast("❌ Gagal menyimpan user: " + errorMessage, true);
      }
    } finally {
      isSavingUser = false;
    }
  }

  /* =========================
     DELETE USER
  ========================= */
async function deleteUser(
  id: number,
  username: string
) {
  if (!isAdmin) {
    showToast(
      "❌ Hanya admin yang dapat menghapus user.",
      true
    );
    return;
  }

  if (currentUser?.id === id) {
    showToast(
      "❌ Anda tidak dapat menghapus akun sendiri.",
      true
    );
    return;
  }

  const confirmed = confirm(
    `Apakah Anda yakin ingin menghapus user "${username}"?`
  );

  if (!confirmed) return;

  try {
    // Hapus data yang berhubungan dengan user
    await supabase
      .from("attendance")
      .delete()
      .eq("user_id", id);

    await supabase
      .from("spp_payments")
      .delete()
      .eq("user_id", id);

    await supabase
      .from("entries")
      .delete()
      .eq("user_id", id);

    await supabase
      .from("schedules")
      .update({ teacher_id: null })
      .eq("teacher_id", id);

    await supabase
      .from("announcements")
      .update({ created_by: null })
      .eq("created_by", id);

    // Hapus user
    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", id);

    if (error) throw error;

    showToast(
      `✓ User "${username}" berhasil dihapus!`
    );

    await Promise.all([
      loadUsers(),
      loadSPPData(),
      loadAttendance(),
      loadSchedules(),
      loadAnnouncements()
    ]);

  } catch (error: any) {
    console.error("Gagal menghapus user:", error);

    showToast(
      "❌ Gagal menghapus user: " +
      (error?.message || "Terjadi kesalahan."),
      true
    );
  }
}

  /* =========================
     LOAD ATTENDANCE
  ========================= */

  async function loadAttendance() {

    const {
      data,
      error
    } = await supabase
      .from("attendance")
      .select("*")
      .eq(
        "date",
        attendanceDate
      )
      .order(
        "id",
        {
          ascending:
            false
        }
      );

    if (error) {

      showToast(
        "Gagal memuat absensi: " +
          error.message,
        true
      );

      attendanceData = [];

      return;
    }

    attendanceData =
      (data || []) as
      Attendance[];
  }

  async function changeAttendanceDate() {

    await loadAttendance();
  }

  function getAttendance(
    userId: number
  ) {

    return attendanceData.find(
      item =>
        Number(
          item.user_id
        ) === userId
    );
  }

  /* =========================
     SAVE ATTENDANCE
  ========================= */

  async function saveAttendance() {

    if (!isAdmin) {

      showToast(
        "Hanya admin yang dapat mengisi absensi.",
        true
      );

      return;
    }

    if (
      !selectedAttendanceUser
    ) {

      showToast(
        "Pilih santri terlebih dahulu!",
        true
      );

      return;
    }

    const userId =
      Number(
        selectedAttendanceUser
      );

    const existing =
      getAttendance(
        userId
      );

    if (
      existing?.id
    ) {

      const {
        error
      } = await supabase
        .from("attendance")
        .update({
          status:
            attendanceStatus
        })
        .eq(
          "id",
          existing.id
        );

      if (error) {

        showToast(
          "Gagal mengubah absensi: " +
            error.message,
          true
        );

        return;
      }

    } else {

      const {
        error
      } = await supabase
        .from("attendance")
        .insert([
          {
            user_id:
              userId,

            date:
              attendanceDate,

            status:
              attendanceStatus
          }
        ]);

      if (error) {

        showToast(
          "Gagal menyimpan absensi: " +
            error.message,
          true
        );

        return;
      }
    }

    showToast(
      "✓ Absensi berhasil disimpan!"
    );

    selectedAttendanceUser = "";

    await loadAttendance();
  }

  /* =========================
     LOAD SCHEDULE
  ========================= */

  async function loadSchedules() {

    const {
      data,
      error
    } = await supabase
      .from("schedules")
      .select("*")
      .order(
        "id",
        {
          ascending:
            true
        }
      );

    if (error) {

      showToast(
        "Gagal memuat jadwal: " +
          error.message,
        true
      );

      schedules = [];

      return;
    }

    schedules =
      (data || []) as
      Schedule[];
  }

  /* =========================
     ADD SCHEDULE
  ========================= */

  function createEmptyScheduleItem(): ScheduleFormItem {
    return { class_name: "", subject: "None", subject2: "None", teacher_id: "", time: "" };
  }

  function addScheduleItem() {
    scheduleItems = [...scheduleItems, createEmptyScheduleItem()];
  }

  function removeScheduleItem(index: number) {
    if (scheduleItems.length === 1) {
      showToast("Minimal harus ada satu jadwal!", true);
      return;
    }
    scheduleItems = scheduleItems.filter((_, i) => i !== index);
  }

  function openAddSchedule() {
    if (!isAdmin) {
      showToast("Hanya admin yang dapat menambah jadwal.", true);
      return;
    }
    editingScheduleId = null;
    scheduleDay = "";
    scheduleItems = [createEmptyScheduleItem()];
    showScheduleModal = true;
  }

  function openEditSchedule(schedule: Schedule) {
    if (!isAdmin) return;
    editingScheduleId = schedule.id || null;
    scheduleDay = schedule.day;
    scheduleItems = [{
      class_name: schedule.class_name || "",
      subject: schedule.subject || "None",
      subject2: schedule.subject2 || "None",
      teacher_id: schedule.teacher_id ? String(schedule.teacher_id) : "",
      time: schedule.time || ""
    }];
    showScheduleModal = true;
  }

  async function saveSchedule() {
    if (!isAdmin) return;
    if (!scheduleDay) {
      showToast("Pilih hari terlebih dahulu!", true);
      return;
    }

    for (const item of scheduleItems) {
      if (!item.class_name || !item.teacher_id || !item.time) {
        showToast("Kelas, ustad, dan jam wajib diisi pada semua kelompok jadwal!", true);
        return;
      }
      const selectedTeacher = users.find(user => user.id === Number(item.teacher_id));
      if (!selectedTeacher || selectedTeacher.role !== "ustad") {
        showToast("Pengajar harus memiliki role Ustad!", true);
        return;
      }
    }

    const payload = scheduleItems.map(item => ({
      day: scheduleDay,
      class_name: item.class_name,
      subject: item.subject || "None",
      subject2: item.subject2 && item.subject2 !== "None" && item.subject2 !== item.subject
        ? item.subject2
        : null,
      teacher_id: Number(item.teacher_id),
      time: item.time
    }));

    if (editingScheduleId !== null) {
      const { error } = await supabase.from("schedules").update(payload[0]).eq("id", editingScheduleId);
      if (error) {
        showToast("Gagal mengedit jadwal: " + error.message, true);
        return;
      }
      showToast("✓ Jadwal berhasil diperbarui!");
    } else {
      const { error } = await supabase.from("schedules").insert(payload);
      if (error) {
        showToast("Gagal menambah jadwal: " + error.message, true);
        return;
      }
      showToast("✓ Semua jadwal berhasil ditambahkan!");
    }

    showScheduleModal = false;
    editingScheduleId = null;
    scheduleDay = "";
    scheduleItems = [createEmptyScheduleItem()];
    await loadSchedules();
  }

  /* =========================
     DELETE SCHEDULE
  ========================= */

  async function deleteSchedule(
    id: number
  ) {

    if (!isAdmin) {
      return;
    }

    if (
      !confirm(
        "Hapus jadwal ini?"
      )
    ) {
      return;
    }

    const {
      error
    } = await supabase
      .from("schedules")
      .delete()
      .eq(
        "id",
        id
      );

    if (error) {

      showToast(
        "Gagal menghapus jadwal: " +
          error.message,
        true
      );

      return;
    }

    showToast(
      "✓ Jadwal berhasil dihapus!"
    );

    await loadSchedules();
  }

  /* =========================
     GET TEACHER
  ========================= */

  function getTeacherName(
    teacherId:
      | number
      | null
  ) {

    if (!teacherId) {
      return "-";
    }

    return (
      users.find(
        user =>
          user.id ===
          Number(
            teacherId
          )
      )?.username ||
      "Pengajar tidak ditemukan"
    );
  }

  /* =========================
     LOAD ANNOUNCEMENTS
  ========================= */

  async function loadAnnouncements() {

    const {
      data,
      error
    } = await supabase
      .from("announcements")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false
        }
      );

    if (error) {

      showToast(
        "Gagal memuat pengumuman: " +
          error.message,
        true
      );

      announcements = [];

      return;
    }

    announcements =
      (data || []) as
      Announcement[];
  }

  /* =========================
     OPEN ADD ANNOUNCEMENT
  ========================= */

  function openAddAnnouncement() {

    if (!isAdmin) {

      showToast(
        "Hanya admin yang dapat membuat pengumuman.",
        true
      );

      return;
    }

    editingAnnouncementId = null;

    announcementTitle = "";

    announcementContent = "";

    showAnnouncementModal = true;
  }

  /* =========================
     EDIT ANNOUNCEMENT
  ========================= */

  function openEditAnnouncement(
    announcement: Announcement
  ) {

    if (!isAdmin) {

      showToast(
        "Hanya admin yang dapat mengedit pengumuman.",
        true
      );

      return;
    }

    editingAnnouncementId =
      announcement.id || null;

    announcementTitle =
      announcement.title;

    announcementContent =
      announcement.content;

    showAnnouncementModal = true;
  }

  /* =========================
     SAVE ANNOUNCEMENT
  ========================= */

  async function saveAnnouncement() {

    if (!isAdmin) {

      showToast(
        "Hanya admin yang dapat menyimpan pengumuman.",
        true
      );

      return;
    }

    if (
      !announcementTitle.trim() ||
      !announcementContent.trim()
    ) {

      showToast(
        "Judul dan isi pengumuman wajib diisi!",
        true
      );

      return;
    }

    if (
      editingAnnouncementId !== null
    ) {

      const {
        error
      } = await supabase
        .from("announcements")
        .update({
          title:
            announcementTitle.trim(),

          content:
            announcementContent.trim()
        })
        .eq(
          "id",
          editingAnnouncementId
        );

      if (error) {

        showToast(
          "Gagal mengubah pengumuman: " +
            error.message,
          true
        );

        return;
      }

      showToast(
        "✓ Pengumuman berhasil diperbarui!"
      );

    } else {

      const {
        error
      } = await supabase
        .from("announcements")
        .insert([
          {
            title:
              announcementTitle.trim(),

            content:
              announcementContent.trim(),

            created_by:
              currentUser?.id || null
          }
        ]);

      if (error) {

        showToast(
          "Gagal membuat pengumuman: " +
            error.message,
          true
        );

        return;
      }

      showToast(
        "✓ Pengumuman berhasil dibuat!"
      );
    }

    showAnnouncementModal = false;

    announcementTitle = "";

    announcementContent = "";

    await loadAnnouncements();
  }

  /* =========================
     DELETE ANNOUNCEMENT
  ========================= */

  async function deleteAnnouncement(
    id: number
  ) {

    if (!isAdmin) {
      return;
    }

    if (
      !confirm(
        "Hapus pengumuman ini?"
      )
    ) {
      return;
    }

    const {
      error
    } = await supabase
      .from("announcements")
      .delete()
      .eq(
        "id",
        id
      );

    if (error) {

      showToast(
        "Gagal menghapus pengumuman: " +
          error.message,
        true
      );

      return;
    }

    showToast(
      "✓ Pengumuman berhasil dihapus!"
    );

    await loadAnnouncements();
  }

  /* =========================
     BARCODE
  ========================= */

  function getQrValue(santriId: number) {
    return `santri:${santriId}`;
  }

  function getQrImageUrl(santriId: number) {
    const data = encodeURIComponent(getQrValue(santriId));
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${data}`;
  }

  function parseQrValue(value: string) {
    const text = value.trim();

    const direct = text.match(/^santri:(\d+)$/i);
    if (direct) return Number(direct[1]);

    try {
      const url = new URL(text);
      const id = url.searchParams.get("santri");
      if (id && /^\d+$/.test(id)) return Number(id);
    } catch {
      // Bukan URL, lanjutkan sebagai teks biasa.
    }

    const idMatch = text.match(/(?:ID[-:]?)(\d+)/i);
    return idMatch ? Number(idMatch[1]) : null;
  }

  async function handleQrScan(value: string) {
    const userId = parseQrValue(value);

    if (!userId) {
      qrScannerError = "QR tidak dikenali. Gunakan QR santri dari menu Barcode.";
      return;
    }

    const santri = santriUsers.find(user => user.id === userId);

    if (!santri) {
      qrScannerError = "Data santri dari QR tidak ditemukan.";
      return;
    }

    selectedAttendanceUser = String(santri.id);
    attendanceSearch = santri.full_name || santri.username;

    const scannedLevel = getSchoolLevel(santri.class_name);

    if (scannedLevel === "SMP") {
      attendanceSection = "SMP";
      const scannedClass = (santri.class_name || "").trim().toLowerCase();

      if (/\bkelas\s*7\b|\bsmp\s*1\b/.test(scannedClass)) attendanceSmpClass = "1";
      else if (/\bkelas\s*8\b|\bsmp\s*2\b/.test(scannedClass)) attendanceSmpClass = "2";
      else if (/\bkelas\s*9\b|\bsmp\s*3\b/.test(scannedClass)) attendanceSmpClass = "3";
      else attendanceSmpClass = "";
    } else if (scannedLevel === "SMA") {
      attendanceSection = "SMA";
      attendanceSmpClass = "";
    } else {
      attendanceSection = "SD";
      attendanceSmpClass = "";
    }

    attendanceClassFilter = scannedLevel;
    activeView = "attendance";

    await stopQrScanner();
    showQrScanner = false;
    qrScannerError = "";
    showToast(`✓ ${santri.full_name || santri.username} dipilih untuk absensi.`);
  }

  async function startQrScanner() {
    if (!isAdmin) {
      showToast("Hanya admin yang dapat melakukan absensi.", true);
      return;
    }

    showQrScanner = true;
    qrScannerError = "";

    if (!navigator.mediaDevices?.getUserMedia) {
      qrScannerError = "Kamera Chrome tidak tersedia. Pastikan situs dibuka melalui HTTPS atau localhost.";
      return;
    }

    try {
      qrScannerStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });

      await tick();
      if (!qrVideoElement) throw new Error("Video kamera belum siap.");

      qrVideoElement.srcObject = qrScannerStream;
      await qrVideoElement.play();

      const BarcodeDetectorClass = (window as any).BarcodeDetector;
      if (!BarcodeDetectorClass) {
        qrScannerError = "Chrome belum mendukung pembaca QR bawaan. Gunakan Chrome versi terbaru atau pilih santri secara manual.";
        return;
      }

      const detector = new BarcodeDetectorClass({ formats: ["qr_code"] });
      qrScannerTimer = setInterval(async () => {
        if (!qrVideoElement || qrVideoElement.readyState < 2) return;
        try {
          const codes = await detector.detect(qrVideoElement);
          if (codes?.length && codes[0]?.rawValue) {
            await handleQrScan(codes[0].rawValue);
          }
        } catch {
          // Abaikan frame kamera yang gagal dibaca.
        }
      }, 300);
    } catch (error) {
      await stopQrScanner();
      qrScannerError = error instanceof DOMException && error.name === "NotAllowedError"
        ? "Izin kamera Chrome ditolak. Izinkan Camera untuk situs ini."
        : "Kamera Chrome tidak dapat dibuka. Pastikan kamera tersedia dan situs menggunakan HTTPS atau localhost.";
    }
  }

  async function stopQrScanner() {
    if (qrScannerTimer) {
      clearInterval(qrScannerTimer);
      qrScannerTimer = null;
    }

    if (qrScannerStream) {
      qrScannerStream.getTracks().forEach(track => track.stop());
      qrScannerStream = null;
    }

    if (qrVideoElement) {
      qrVideoElement.pause();
      qrVideoElement.srcObject = null;
    }
  }

  async function closeQrScanner() {
    await stopQrScanner();
    showQrScanner = false;
    qrScannerError = "";
  }

  function getBarcodeBars(
    id: number
  ) {

    const text =
      String(id);

    const bars:
      number[] = [];

    for (
      let i = 0;
      i < text.length;
      i++
    ) {

      const code =
        text.charCodeAt(i);

      bars.push(
        2 + (code % 3)
      );

      bars.push(
        1 + ((code + i) % 2)
      );

      bars.push(
        2 + ((code * 2) % 3)
      );
    }

    return bars;
  }

  /* =========================
     TOAST
  ========================= */

  function showToast(
    msg: string,
    error = false
  ) {

    message = msg;

    isError = error;

    clearTimeout(
      toastTimer
    );

    toastTimer =
      setTimeout(
        () => {

          message = "";

        },
        3500
      );
  }

  /* =========================
     FORMAT RUPIAH
  ========================= */

  function formatRupiah(
    value: number
  ) {

    return new Intl.NumberFormat(
      "id-ID"
    ).format(
      Number(value)
    );
  }

  /* =========================
     FORMAT DATE
  ========================= */

  function formatDate(
    value?: string
  ) {

    if (!value) {
      return "-";
    }

    return new Date(
      value
    ).toLocaleDateString(
      "id-ID",
      {
        day:
          "numeric",

        month:
          "long",

        year:
          "numeric"
      }
    );
  }

  /* =========================
     STATUS LABEL
  ========================= */

  function attendanceLabel(
    status: string
  ) {

    const labels:
      Record<
        string,
        string
      > = {

        hadir:
          "Hadir",

        izin:
          "Izin",

        sakit:
          "Sakit",

        alpha:
          "Alpha"

      };

    return (
      labels[status] ||
      status
    );
  }

  /* =========================
     LOGOUT
  ========================= */

  function logout() {

    localStorage.removeItem(
      "user"
    );

    goto(
      "/login"
    );
  }

  /* =========================
     NAVIGATION
  ========================= */

  function changeView(
    view: ActiveView
  ) {

    activeView = view;

    sidebarOpen = false;
  }
</script>


<!-- =========================
     APP
========================= -->

<div class="app-layout">

  <!-- =========================
       SIDEBAR
  ========================= -->

  <aside
    class:open={sidebarOpen}
    class="sidebar"
  >

    <div class="brand">

      <div class="brand-logo">
        💳
      </div>

      <div>

        <h2>
          Daarulhikam
        </h2>

        <p>
          Sistem Informasi Pesantren
        </p>

      </div>

    </div>


    <nav class="nav-menu">

      <button
        class:active={
          activeView === "home"
        }
        class="nav-item"
        on:click={() =>
          changeView("home")}
      >
        🏠
        Beranda
      </button>


      <button
        class:active={
          activeView === "spp"
        }
        class="nav-item"
        on:click={() =>
          changeView("spp")}
      >
        💳
        SPP Santri
      </button>


      <button
        class:active={
          activeView === "attendance"
        }
        class="nav-item"
        on:click={() =>
          changeView("attendance")}
      >
        📅
        Absensi
      </button>


      <button
        class:active={
          activeView === "schedule"
        }
        class="nav-item"
        on:click={() =>
          changeView("schedule")}
      >
        🗓️
        Jadwal
      </button>


      <button
        class:active={
          activeView === "announcement"
        }
        class="nav-item"
        on:click={() =>
          changeView("announcement")}
      >
        📢
        Pengumuman
      </button>


      {#if isAdmin}

        <button
          class:active={
            activeView === "users"
          }
          class="nav-item"
          on:click={() =>
            changeView("users")}
        >
          👥
          Kelola User
        </button>

      {/if}


      <button
        class:active={
          activeView === "barcode"
        }
        class="nav-item"
        on:click={() =>
          changeView("barcode")}
      >
        🆔
        Barcode Santri
      </button>


      {#if isAdmin}

        <button
          class:active={
            activeView === "topup"
          }
          class="nav-item"
          on:click={() =>
            changeView("topup")}
        >
          ➕
          Top Up Saldo
        </button>

      {/if}

    </nav>


    <button
      class="logout-btn-side"
      on:click={logout}
    >
      🚪
      Keluar Aplikasi
    </button>

  </aside>


  {#if sidebarOpen}

    <div
      class="sidebar-overlay"
      on:click={() =>
        sidebarOpen = false}
    ></div>

  {/if}


  <!-- =========================
       MAIN
  ========================= -->

  <main class="main-content">


    <!-- =========================
         HEADER
    ========================= -->

    <div class="bca-header-bg">

      <div class="top-nav-bar">


        <button
          class="hamburger"
          on:click={() =>
            sidebarOpen =
              !sidebarOpen}
        >
          ☰
        </button>


        <div class="welcome-box">

          <div class="avatar-circle">

            {
              currentUser?.username
                ?.charAt(0)
                .toUpperCase()
              || "U"
            }

          </div>


          <div class="welcome-text">

            <span>
              Selamat Datang,
            </span>

            <strong>
              {
                currentUser?.username ||
                "User"
              }
            </strong>

          </div>

        </div>


        <button
          class="logout-btn-header"
          on:click={logout}
        >
          🚪
          <span>
            Keluar
          </span>
        </button>

      </div>

    </div>


    <!-- =========================
         TOAST
    ========================= -->

    {#if message}

      <div
        class:error={isError}
        class:success={!isError}
        class="toast"
      >
        {message}
      </div>

    {/if}


    <div class="dashboard-body">


      <!-- =========================
           HOME
      ========================= -->

      {#if activeView === "home"}

        <div class="portal-grid user-stats-grid">

          <button type="button" class="bca-card user-stat-card clickable-stat-card" on:click={() => openRoleModal("santri")}>
            <div class="user-stat-icon">👤</div>
            <div class="user-stat-content">
              <span>Jumlah Santri</span>
              <strong>{santriUsers.length}</strong>
            </div>
          </button>

          <button type="button" class="bca-card user-stat-card clickable-stat-card" on:click={() => openRoleModal("ustad")}>
            <div class="user-stat-icon">👨‍🏫</div>
            <div class="user-stat-content">
              <span>Jumlah Ustad</span>
              <strong>{ustadUsers.length}</strong>
            </div>
          </button>

          <button type="button" class="bca-card user-stat-card clickable-stat-card" on:click={() => openRoleModal("admin")}>
            <div class="user-stat-icon">🛡️</div>
            <div class="user-stat-content">
              <span>Jumlah Admin</span>
              <strong>{adminUsers.length}</strong>
            </div>
          </button>

        </div>


        <div class="portal-grid-secondary">

          <div class="bca-card services-card">

            <h3 class="box-title">
              Layanan Utama
            </h3>

            <div class="services-grid">

              <button class="service-item" on:click={() => changeView("spp")}>
                <div class="s-icon blue">💳</div>
                <span>SPP</span>
              </button>

              <button class="service-item" on:click={() => changeView("attendance")}>
                <div class="s-icon red">📅</div>
                <span>Absensi</span>
              </button>

              <button class="service-item" on:click={() => changeView("schedule")}>
                <div class="s-icon purple">🗓️</div>
                <span>Jadwal</span>
              </button>

              <button class="service-item" on:click={() => changeView("announcement")}>
                <div class="s-icon orange">📢</div>
                <span>Pengumuman</span>
              </button>

              {#if isAdmin}
                <button class="service-item" on:click={() => changeView("users")}>
                  <div class="s-icon cyan">👥</div>
                  <span>Kelola User</span>
                </button>
              {/if}

              <button class="service-item" on:click={() => changeView("barcode")}>
                <div class="s-icon blue">🆔</div>
                <span>Barcode</span>
              </button>

            </div>

          </div>

        </div>


        <div class="bca-card home-announcement-card">

          <div class="sub-header-row">

            <div>

              <h3>
                📢 Pengumuman Terbaru
              </h3>

              <p class="sub-description">
                Informasi terbaru dari admin.
              </p>

            </div>

            <button
              class="btn-back"
              on:click={() => changeView("announcement")}
            >
              Lihat Semua →
            </button>

          </div>


          {#if announcements.length === 0}

            <p class="empty-cell">
              Belum ada pengumuman.
            </p>

          {:else}

            <div class="home-announcement-list">

              {#each announcements.slice(0, 3) as announcement}

                <div class="home-announcement-item">

                  <div>

                    <strong>
                      📢 {announcement.title}
                    </strong>

                    <p>
                      {
                        announcement.content.length > 120
                          ? announcement.content.slice(0, 120) + "..."
                          : announcement.content
                      }
                    </p>

                  </div>

                  <small>
                    {formatDate(announcement.created_at)}
                  </small>

                </div>

              {/each}

            </div>

          {/if}

        </div>


{:else if activeView === "spp"}

        <div
          class="bca-card sub-view-container"
        >

          <div
            class="sub-header-row"
          >

            <div>

              <h3>
                💳 Pembayaran SPP Santri
              </h3>

              <p
                class="sub-description"
              >
                Hanya data santri yang
                ditampilkan.
              </p>

            </div>


            <button
              class="btn-back"
              on:click={() =>
                changeView("home")}
            >
              ← Kembali
            </button>

          </div>


          <div
            class="control-card-inline"
          >

            <div
              class="search-box"
            >

              <span>
                🔍
              </span>

              <input
                type="text"
                placeholder="Cari santri..."
                bind:value={
                  searchKeyword
                }
              />

            </div>


            <div
              class="year-picker"
            >

              <label>
                Tahun
              </label>


              <select
                bind:value={
                  selectedYear
                }
                on:change={
                  loadSPPData
                }
              >

                <option value={2025}>
                  2025
                </option>

                <option value={2026}>
                  2026
                </option>

                <option value={2027}>
                  2027
                </option>

                <option value={2028}>
                  2028
                </option>

              </select>

            </div>

          </div>


          <div
            class="table-responsive"
          >

            <table
              class="data-table spp-table"
            >

              <thead>

                <tr>

                  <th>
                    Nama Santri
                  </th>


                  {#each months as month}

                    <th>
                      {month.label}
                    </th>

                  {/each}


                  <th>
                    Total
                  </th>

                </tr>

              </thead>


              <tbody>

                {#if filteredSantri.length === 0}

                  <tr>

                    <td
                      colspan="14"
                      class="empty-cell"
                    >
                      Tidak ada santri.
                    </td>

                  </tr>

                {:else}

                  {#each filteredSantri as santri}

                    <tr>

                      <td>

                        <div
                          class="user-cell"
                        >

                          <span
                            class="user-avatar"
                          >

                            {
                              santri.username
                                .charAt(0)
                                .toUpperCase()
                            }

                          </span>


                          <strong>
                            {santri.username}
                          </strong>

                        </div>

                      </td>


                      {#each months as month}

                        {@const isLunas =
                          sppData[
                            santri.id
                          ]?.[
                            month.key
                          ]}


                        <td
                          class="text-center"
                        >

                          <button
                            disabled={!isAdmin}
                            class:disabled={!isAdmin}
                            class:lunas={isLunas}
                            class:belum={!isLunas}
                            class="spp-chip"
                            on:click={() =>
                              toggleSPP(
                                santri.id,
                                month.key
                              )}
                          >

                            {isLunas
                              ? "✓"
                              : "✕"}

                          </button>

                        </td>

                      {/each}


                      <td
                        class="text-center"
                      >

                        <span
                          class:full={
                            getLunasCount(
                              santri.id
                            ) === 12
                          }
                          class="badge-count"
                        >

                          {
                            getLunasCount(
                              santri.id
                            )
                          }
                          /12

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
           USER MANAGEMENT
      ========================= -->

      {:else if activeView === "users"}

        <div
          class="bca-card sub-view-container"
        >

          <div
            class="sub-header-row"
          >

            <div>

              <h3>
                👥 Kelola User
              </h3>

              <p
                class="sub-description"
              >
                Tambah, edit, atau hapus
                santri dan pengajar.
              </p>

            </div>


            <div
              class="action-group-top"
            >

              <button
                class="btn-primary"
                on:click={
                  openAddUserModal
                }
              >
                ➕ Tambah User
              </button>


              <button
                class="btn-back"
                on:click={() =>
                  changeView("home")}
              >
                ← Kembali
              </button>

            </div>

          </div>


          <div
            class="control-card-inline user-management-search"
          >

            <div class="search-box">

              <span>🔍</span>

              <input
                type="text"
                placeholder="Cari user, nama, username, role, kelas..."
                bind:value={userManagementSearch}
              />

              {#if userManagementSearch}
                <button
                  type="button"
                  class="search-clear-btn"
                  title="Hapus pencarian"
                  on:click={() => userManagementSearch = ""}
                >
                  ✕
                </button>
              {/if}

            </div>

            <div class="user-search-result-count">
              Menampilkan <strong>{filteredManagedUsers.length}</strong> dari <strong>{users.length}</strong> user
            </div>

          </div>


          <div
            class="table-responsive"
          >

            <table
              class="data-table"
            >

              <thead>

                <tr>

                  <th>
                    ID
                  </th>

                  <th>
                    Nama
                  </th>

                  <th>
                    Role
                  </th>

                  <th>
                    Kelas
                  </th>

                  <th>
                    Aksi
                  </th>

                </tr>

              </thead>


              <tbody>

                {#if filteredManagedUsers.length === 0}

                  <tr>
                    <td colspan="5" class="empty-cell">
                      {#if userManagementSearch}
                        User dengan kata "{userManagementSearch}" tidak ditemukan.
                      {:else}
                        Belum ada user.
                      {/if}
                    </td>
                  </tr>

                {:else}

                  {#each filteredManagedUsers as user}

                  <tr>

                    <td>
                      {user.id}
                    </td>


                    <td>

                      <div
                        class="user-cell"
                      >

                        <span
                          class="user-avatar"
                        >

                          {
                            user.username
                              .charAt(0)
                              .toUpperCase()
                          }

                        </span>


                        <strong>
                          {user.username}
                        </strong>

                      </div>

                    </td>


                    <td>

                      <span
                        class="role-badge {user.role}"
                      >
                        {user.role}
                      </span>

                    </td>

                    <td>
                      {#if user.class_name}
                        <span class="class-badge">🏫 {user.class_name}</span>
                        {#if user.class_id !== null}
                          <small class="form-hint" style="display:block; margin-top:4px;">ID Kelas: {user.class_id}</small>
                        {/if}
                      {:else}
                        <span class="text-muted">—</span>
                      {/if}
                    </td>

                    <td>

                      <div
                        class="action-buttons"
                      >

                        <button
  class="btn-icon"
  title="Edit"
  on:click={() => openEditUserModal(user)}
>
  ✏️
</button>

<button
  class="btn-icon danger"
  title="Hapus"
  on:click={() => deleteUser(
    user.id,
    user.username
  )}
>
  🗑️
</button>

                      </div>

                    </td>

                  </tr>

                  {/each}

                {/if}

              </tbody>

            </table>

          </div>

        </div>


      <!-- =========================
           ATTENDANCE
      ========================= -->

      {:else if activeView === "attendance"}

        <div
          class="bca-card sub-view-container"
        >

          <div
            class="sub-header-row"
          >

            <div>

              <h3>
                📅 Absensi Santri
              </h3>

              <p
                class="sub-description"
              >
                Lihat absensi santri
                berdasarkan tanggal.
              </p>

            </div>


            <button
              class="btn-back"
              on:click={() =>
                changeView("home")}
            >
              ← Kembali
            </button>

          </div>


          <div
            class="attendance-date-box"
          >

            <label>
              Pilih Tanggal
            </label>


            <input
              type="date"
              bind:value={
                attendanceDate
              }
              on:change={
                changeAttendanceDate
              }
            />

          </div>


          {#if isAdmin}

            <div
              class="attendance-form"
            >

              <div class="attendance-section-filter">
                <div class="attendance-section-label">
                  Jenjang Absensi
                </div>

                <div class="attendance-section-buttons">
                  <button
                    type="button"
                    class:active={attendanceSection === "SD"}
                    on:click={() => {
                      attendanceSection = "SD";
                      attendanceSmpClass = "";
                      attendanceClassFilter = "SD";
                      selectedAttendanceUser = "";
                    }}
                  >
                    🏫 SD
                  </button>

                  <button
                    type="button"
                    class:active={attendanceSection === "SMP"}
                    on:click={() => {
                      attendanceSection = "SMP";
                      attendanceSmpClass = "";
                      attendanceClassFilter = "SMP";
                      selectedAttendanceUser = "";
                    }}
                  >
                    🎓 SMP
                  </button>

                  <button
                    type="button"
                    class:active={attendanceSection === "SMA"}
                    on:click={() => {
                      attendanceSection = "SMA";
                      attendanceSmpClass = "";
                      attendanceClassFilter = "SMA";
                      selectedAttendanceUser = "";
                    }}
                  >
                    🎓 SMA
                  </button>
                </div>

                {#if attendanceSection === "SMP"}
                  <div class="attendance-smp-classes">
                    <div class="attendance-smp-title">
                      Kelas SMP
                    </div>

                    <div class="attendance-smp-buttons">
                      <button
                        type="button"
                        class:active={attendanceSmpClass === "1"}
                        on:click={() => {
                          attendanceSmpClass = "1";
                          attendanceClassFilter = "SMP";
                          selectedAttendanceUser = "";
                        }}
                      >
                        Kelas 1
                      </button>

                      <button
                        type="button"
                        class:active={attendanceSmpClass === "2"}
                        on:click={() => {
                          attendanceSmpClass = "2";
                          attendanceClassFilter = "SMP";
                          selectedAttendanceUser = "";
                        }}
                      >
                        Kelas 2
                      </button>

                      <button
                        type="button"
                        class:active={attendanceSmpClass === "3"}
                        on:click={() => {
                          attendanceSmpClass = "3";
                          attendanceClassFilter = "SMP";
                          selectedAttendanceUser = "";
                        }}
                      >
                        Kelas 3
                      </button>

                      <button
                        type="button"
                        class:clear={attendanceSmpClass === ""}
                        on:click={() => {
                          attendanceSmpClass = "";
                          attendanceClassFilter = "SMP";
                          selectedAttendanceUser = "";
                        }}
                      >
                        Semua SMP
                      </button>
                    </div>
                  </div>
                {/if}
              </div>

              <input
                class="attendance-search"
                type="search"
                placeholder="🔎 Cari nama/username santri..."
                bind:value={attendanceSearch}
                on:input={() => {
                  selectedAttendanceUser = "";
                }}
              />

              <select
                bind:value={selectedAttendanceUser}
              >

                <option value="">
                  -- Pilih Santri ({filteredAttendanceSantri.length}) --
                </option>

                {#each filteredAttendanceSantri as santri}
                  <option value={santri.id}>
                    {santri.full_name || santri.username}
                    {santri.full_name && santri.username !== santri.full_name ? ` (@${santri.username})` : ""}
                    {santri.class_name ? ` — ${santri.class_name}` : ""}
                  </option>
                {/each}

              </select>


              <select
                bind:value={
                  attendanceStatus
                }
              >

                <option value="hadir">
                  Hadir
                </option>

                <option value="izin">
                  Izin
                </option>

                <option value="sakit">
                  Sakit
                </option>

                <option value="alpha">
                  Alpha
                </option>

              </select>


              <button
                class="btn-primary"
                on:click={
                  saveAttendance
                }
              >
                ✓ Simpan Absensi
              </button>

            </div>

          {/if}


          <div
            class="attendance-summary"
          >

            <div
              class="attendance-summary-item"
            >

              <strong>
                {
                  filteredAttendanceSantri.filter(
                    santri => getAttendance(santri.id)?.status === "hadir"
                  ).length
                }
              </strong>

              <span>
                Hadir
              </span>

            </div>


            <div
              class="attendance-summary-item"
            >

              <strong>
                {
                  filteredAttendanceSantri.filter(
                    santri => getAttendance(santri.id)?.status === "izin"
                  ).length
                }
              </strong>

              <span>
                Izin
              </span>

            </div>


            <div
              class="attendance-summary-item"
            >

              <strong>
                {
                  filteredAttendanceSantri.filter(
                    santri => getAttendance(santri.id)?.status === "sakit"
                  ).length
                }
              </strong>

              <span>
                Sakit
              </span>

            </div>


            <div
              class="attendance-summary-item"
            >

              <strong>
                {
                  filteredAttendanceSantri.filter(
                    santri => getAttendance(santri.id)?.status === "alpha"
                  ).length
                }
              </strong>

              <span>
                Alpha
              </span>

            </div>

          </div>


          <div
            class="table-responsive"
          >

            <table
              class="data-table"
            >

              <thead>

                <tr>

                  <th>
                    Nama Santri
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Tanggal
                  </th>

                </tr>

              </thead>


              <tbody>

                {#if filteredAttendanceSantri.length === 0}
                  <tr>
                    <td colspan="3" class="empty-cell">
                      Tidak ada santri pada jenjang {attendanceSection}{attendanceSection === "SMP" && attendanceSmpClass ? ` Kelas ${attendanceSmpClass}` : ""}.
                    </td>
                  </tr>
                {:else}
                  {#each filteredAttendanceSantri as santri}

                  {@const attendance =
                    getAttendance(
                      santri.id
                    )}


                  <tr>

                    <td>

                      <div
                        class="user-cell"
                      >

                        <span
                          class="user-avatar"
                        >

                          {
                            santri.username
                              .charAt(0)
                              .toUpperCase()
                          }

                        </span>


                        <strong>
                          {santri.username}
                        </strong>

                      </div>

                    </td>


                    <td>

                      {#if attendance}

                        <span
                          class="attendance-badge {attendance.status}"
                        >

                          {
                            attendanceLabel(
                              attendance.status
                            )
                          }

                        </span>

                      {:else}

                        <span
                          class="attendance-badge belum"
                        >
                          Belum diisi
                        </span>

                      {/if}

                    </td>


                    <td>
                      {attendanceDate}
                    </td>

                  </tr>

                  {/each}
                {/if}

              </tbody>

            </table>

          </div>

        </div>


      <!-- =========================
           SCHEDULE
      ========================= -->

      {:else if activeView === "schedule"}
        <div class="bca-card sub-view-container">
          <div class="sub-header-row">
            <div>
              <h3>🗓️ Jadwal & Pengajar</h3>
              <p class="sub-description">Jadwal dikelompokkan berdasarkan hari. Satu hari dapat berisi banyak kelas, mata pelajaran, dan ustad.</p>
            </div>
            <div class="action-group-top">
              {#if isAdmin}<button class="btn-primary" on:click={openAddSchedule}>➕ Tambah Jadwal Hari</button>{/if}
              <button class="btn-back" on:click={() => changeView("home")}>← Kembali</button>
            </div>
          </div>

          {#if schedules.length === 0}
            <p class="empty-cell">Belum ada jadwal.</p>
          {:else}
            <div class="schedule-day-list">
              {#each schedulesByDay as dayGroup}
                {#if dayGroup.items.length > 0}
                  <div class="schedule-day-card">
                    <div class="schedule-day-title">📅 {dayGroup.day}</div>
                    <div class="table-responsive">
                      <table class="data-table">
                        <thead><tr><th>Kelas</th><th>Mata Pelajaran</th><th>Pengajar</th><th>Jam</th>{#if isAdmin}<th>Aksi</th>{/if}</tr></thead>
                        <tbody>
                          {#each dayGroup.items as schedule}
                            <tr>
                              <td><span class="class-badge">🏫 {schedule.class_name || "Belum ditentukan"}</span></td>
                              <td>
                                <div class="schedule-subjects">
                                  {#if schedule.subject && schedule.subject !== "None"}
                                    <span class="subject-badge">{schedule.subject}</span>
                                  {/if}
                                  {#if schedule.subject2 && schedule.subject2 !== "None"}
                                    <span class="subject-badge subject-badge-secondary">{schedule.subject2}</span>
                                  {/if}
                                  {#if (!schedule.subject || schedule.subject === "None") && (!schedule.subject2 || schedule.subject2 === "None")}
                                    <span class="subject-none">Tidak ada</span>
                                  {/if}
                                </div>
                              </td>
                              <td><div class="teacher-cell">👨‍🏫 {getTeacherName(schedule.teacher_id)}</div></td>
                              <td>🕒 {schedule.time}</td>
                              {#if isAdmin}
                                <td><div class="action-buttons">
                                  <button class="btn-icon" title="Edit" on:click={() => openEditSchedule(schedule)}>✏️</button>
                                  {#if schedule.id}<button class="btn-icon danger" title="Hapus" on:click={() => deleteSchedule(schedule.id)}>🗑️</button>{/if}
                                </div></td>
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


      <!-- =========================
           ANNOUNCEMENT
      ========================= -->

      {:else if activeView === "announcement"}

        <div
          class="bca-card sub-view-container"
        >

          <div
            class="sub-header-row"
          >

            <div>

              <h3>
                📢 Pengumuman
              </h3>

              <p
                class="sub-description"
              >
                Informasi terbaru dari
                administrasi pesantren.
              </p>

            </div>


            <div
              class="action-group-top"
            >

              {#if isAdmin}

                <button
                  class="btn-primary"
                  on:click={
                    openAddAnnouncement
                  }
                >
                  ➕ Buat Pengumuman
                </button>

              {/if}


              <button
                class="btn-back"
                on:click={() =>
                  changeView("home")}
              >
                ← Kembali
              </button>

            </div>

          </div>


          {#if announcements.length === 0}

            <div
              class="empty-announcement"
            >

              <div>
                📭
              </div>

              <p>
                Belum ada pengumuman.
              </p>

            </div>

          {:else}

            <div
              class="announcement-list"
            >

              {#each announcements as announcement}

                <div
                  class="announcement-card"
                >

                  <div
                    class="announcement-header"
                  >

                    <div>

                      <h4>
                        📢
                        {announcement.title}
                      </h4>


                      <small>
                        {
                          formatDate(
                            announcement.created_at
                          )
                        }
                      </small>

                    </div>


                    {#if isAdmin}

                      <div
                        class="action-buttons"
                      >

                        <button
                          class="btn-icon"
                          title="Edit"
                          on:click={() =>
                            openEditAnnouncement(
                              announcement
                            )}
                        >
                          ✏️
                        </button>


                        {#if announcement.id}

                          <button
                            class="btn-icon danger"
                            title="Hapus"
                            on:click={() =>
                              deleteAnnouncement(
                                announcement.id
                              )}
                          >
                            🗑️
                          </button>

                        {/if}

                      </div>

                    {/if}

                  </div>


                  <div
                    class="announcement-content"
                  >

                    {announcement.content}

                  </div>

                </div>

              {/each}

            </div>

          {/if}

        </div>


      <!-- =========================
           BARCODE
      ========================= -->

      {:else if activeView === "barcode"}

        <div
          class="bca-card sub-view-container"
        >

          <div
            class="sub-header-row"
          >

            <div>

              <h3>
                🆔 Barcode ID Santri
              </h3>

              <p
                class="sub-description"
              >
                Setiap santri memiliki
                barcode berdasarkan ID.
              </p>

            </div>


            <div class="barcode-header-actions">
              <button
                class="btn-primary"
                on:click={startQrScanner}
              >
                📷 Scan QR Absen
              </button>

              <button
                class="btn-back"
                on:click={() =>
                  changeView("home")}
              >
                ← Kembali
              </button>
            </div>

          </div>


          <div
            class="barcode-grid"
          >

            {#if santriUsers.length === 0}

              <p
                class="empty-cell"
              >
                Belum ada santri.
              </p>

            {:else}

              {#each santriUsers as santri}

                <div
                  class="barcode-card"
                >

                  <div
                    class="barcode-user"
                  >

                    <div
                      class="user-avatar"
                    >

                      {
                        santri.username
                          .charAt(0)
                          .toUpperCase()
                      }

                    </div>


                    <strong>
                      {santri.username}
                    </strong>

                  </div>


                  <div class="qr-code-wrap">
                    <img
                      class="qr-code-image"
                      src={getQrImageUrl(santri.id)}
                      alt={`QR absensi ${santri.full_name || santri.username}`}
                      loading="lazy"
                    />
                  </div>

                  <div class="barcode-number">
                    QR-{santri.id}
                  </div>

                  <small class="qr-hint">Scan QR ini untuk memilih santri di Absensi.</small>

                </div>

              {/each}

            {/if}

          </div>

        </div>


      <!-- =========================
           TOP UP
      ========================= -->

      {:else if activeView === "topup"}

        <div
          class="bca-card sub-view-container"
        >

          <div
            class="sub-header-row"
          >

            <div>

              <h3>
                ➕ Top Up Saldo Santri
              </h3>

              <p
                class="sub-description"
              >
                Kirim saldo ke akun
                santri.
              </p>

            </div>


            <button
              class="btn-back"
              on:click={() =>
                changeView("home")}
            >
              ← Kembali
            </button>

          </div>


          <form
            class="quick-form"
            on:submit|preventDefault={
              addTransaction
            }
          >

            <div
              class="form-group"
            >

              <label>
                Pilih Santri
              </label>

              <select
                bind:value={
                  transactionUserId
                }
              >

                <option value="">
                  -- Pilih Santri --
                </option>


                {#each santriUsers as santri}

                  <option
                    value={santri.id}
                  >
                    {santri.username}
                  </option>

                {/each}

              </select>

            </div>


            <div
              class="form-group"
            >

              <label>
                Keterangan
              </label>

              <input
                type="text"
                placeholder="Contoh: Uang jajan"
                bind:value={
                  transactionName
                }
              />

            </div>


            <div
              class="form-group"
            >

              <label>
                Tanggal
              </label>

              <input
                type="date"
                bind:value={
                  transactionDate
                }
              />

            </div>


            <div
              class="form-group"
            >

              <label>
                Jumlah Top Up
              </label>

              <input
                type="number"
                placeholder="Contoh: 50000"
                min="1"
                bind:value={
                  transactionAmount
                }
              />

            </div>


            <button
              type="submit"
              class="btn-primary big-button"
            >
              💸 Kirim Uang
            </button>

          </form>

        </div>

      {/if}

    </div>

  </main>

</div>


<!-- =========================
     QR SCANNER
========================= -->

{#if showQrScanner}
  <div class="modal-backdrop qr-scanner-backdrop" role="presentation" on:click={(event) => { if (event.currentTarget === event.target) closeQrScanner(); }}>
    <div class="modal-content qr-scanner-modal" role="dialog" aria-modal="true" aria-label="Scan QR Absensi">
      <div class="modal-header">
        <div>
          <h3>📷 Scan QR Absensi</h3>
          <p class="sub-description">Kamera terhubung langsung ke Chrome. Arahkan kamera belakang ke QR santri.</p>
        </div>
        <button class="btn-close-modal" aria-label="Tutup scanner" on:click={closeQrScanner}>✕</button>
      </div>

      <div class="qr-camera-box">
        <video bind:this={qrVideoElement} class="qr-camera-video" playsinline muted></video>
        <div class="qr-scan-frame" aria-hidden="true"></div>
      </div>

      {#if qrScannerError}
        <div class="qr-scanner-error">{qrScannerError}</div>
      {:else}
        <p class="qr-scanner-status">Memindai QR secara otomatis…</p>
      {/if}

      <div class="modal-footer">
        <button class="btn-secondary" on:click={closeQrScanner}>Tutup</button>
      </div>
    </div>
  </div>
{/if}

<!-- =========================
     USER MODAL
========================= -->

{#if showUserModal}
  <div class="modal-backdrop" role="presentation" on:click={() => { if (!isSavingUser) showUserModal = false; }}>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="user-modal-title" on:click|stopPropagation>
      <div class="modal-header">
        <div>
          <h3 id="user-modal-title">{editingUserId !== null ? "✏️ Edit User" : "➕ Tambah User"}</h3>
          <p class="modal-subtitle">{editingUserId !== null ? "Perbarui data akun user." : "Tambahkan akun user baru seperti registrasi."}</p>
        </div>
        <button type="button" class="btn-close-modal" aria-label="Tutup" disabled={isSavingUser} on:click={() => showUserModal = false}>✕</button>
      </div>

      <div class="form-group-modal">
        <label for="user-full-name">Nama Lengkap</label>
        <input id="user-full-name" type="text" placeholder="Masukkan nama lengkap" bind:value={formFullName} disabled={isSavingUser} />
      </div>

      <div class="form-group-modal">
        <label for="user-username">Username</label>
        <input id="user-username" type="text" placeholder="Masukkan username" bind:value={formUsername} disabled={isSavingUser} />
      </div>

      <div class="form-group-modal">
        <label for="user-email">Email</label>
        <input id="user-email" type="email" placeholder="Masukkan email" bind:value={formEmail} disabled={isSavingUser} />
      </div>

      <div class="form-group-modal">
        <label for="user-password">{editingUserId !== null ? "Password Baru (opsional)" : "Password"}</label>
        <input id="user-password" type="password" placeholder={editingUserId !== null ? "Kosongkan jika tidak ingin mengubah password" : "Minimal 6 karakter"} bind:value={formPassword} disabled={isSavingUser} />
      </div>

      <div class="form-group-modal">
        <label for="user-confirm-password">Konfirmasi Password</label>
        <input id="user-confirm-password" type="password" placeholder="Ulangi password" bind:value={formConfirmPassword} disabled={isSavingUser} on:keydown={(event) => { if (event.key === "Enter") saveUser(); }} />
      </div>

      <div class="form-group-modal">
        <label for="user-role">Role</label>
        <select id="user-role" bind:value={formRole} on:change={handleRoleChange} disabled={isSavingUser}>
          <option value="santri">Santri</option>
          <option value="ustad">Ustad / Pengajar</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {#if formRole === "santri"}
        <div class="form-group-modal">
          <label for="user-class">Kelas <span class="required-mark">*</span></label>
          <select id="user-class" bind:value={formClassId} disabled={isSavingUser}>
            <option value={null}>-- Pilih Kelas --</option>
            {#each userClassOptions as kelas}
              <option value={kelas.id}>{kelas.name}</option>
            {/each}
          </select>
          <small class="form-hint">Kelas disimpan berdasarkan ID dari tabel classes.</small>
        </div>
      {/if}

      <div class="modal-footer">
        <button type="button" class="btn-secondary" disabled={isSavingUser} on:click={() => showUserModal = false}>Batal</button>
        <button type="button" class="btn-primary" disabled={isSavingUser} on:click={saveUser}>
          {#if isSavingUser}
            ⏳ Menyimpan...
          {:else if editingUserId !== null}
            💾 Simpan Perubahan
          {:else}
            ➕ Tambah User
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- =========================
     ROLE DETAIL MODAL
========================= -->

{#if showRoleModal}
  <div class="modal-backdrop role-modal-backdrop" role="presentation" on:click={closeRoleModal}>
    <div class="modal-card role-modal-card" role="dialog" aria-modal="true" aria-label={`Daftar ${getRoleLabel(selectedRole)}`} on:click|stopPropagation>
      <div class="modal-header">
        <div>
          <h3>👥 Daftar {getRoleLabel(selectedRole)}</h3>
          <p class="modal-subtitle">Total {roleUsers.length} {getRoleLabel(selectedRole)}</p>
        </div>
        <button type="button" class="btn-close-modal" aria-label="Tutup" on:click={closeRoleModal}>✕</button>
      </div>

      <div class="role-user-list">
        {#if roleUsers.length === 0}
          <div class="empty-role-list">Belum ada data {getRoleLabel(selectedRole)}.</div>
        {:else}
          {#each roleUsers as user}
            <div class="role-user-item">
              <span class="user-avatar">{user.username.charAt(0).toUpperCase()}</span>
              <div class="role-user-info">
                <strong>{user.full_name || user.username}</strong>
                <span>@{user.username}</span>
                <small>{user.email}</small>
                {#if user.role === "santri" && user.class_name}
                  <small>🏫 {user.class_name}</small>
                {/if}
              </div>
              <span class={`role-badge ${user.role}`}>{user.role}</span>
            </div>
          {/each}
        {/if}
      </div>

      <div class="modal-footer">
        <button type="button" class="btn-secondary" on:click={closeRoleModal}>Tutup</button>
      </div>
    </div>
  </div>
{/if}

<!-- =========================
     SCHEDULE MODAL
========================= -->

{#if showScheduleModal}
  <div class="modal-backdrop" on:click={() => showScheduleModal = false}>
    <div class="modal-card schedule-modal" on:click|stopPropagation>
      <div class="modal-header">
        <h3>{editingScheduleId !== null ? "✏️ Edit Jadwal" : "➕ Tambah Jadwal Per Hari"}</h3>
        <button class="btn-close-modal" on:click={() => showScheduleModal = false}>✕</button>
      </div>

      <div class="form-group-modal">
        <label>📅 Hari</label>
        <select bind:value={scheduleDay}><option value="">Pilih Hari</option>{#each dayOptions as day}<option value={day}>{day}</option>{/each}</select>
      </div>

      {#each scheduleItems as item, index}
        <div class="schedule-item-box">
          <div class="schedule-item-header">
            <strong>Kelompok Jadwal {index + 1}</strong>
            {#if editingScheduleId === null && scheduleItems.length > 1}<button type="button" class="btn-remove-schedule" on:click={() => removeScheduleItem(index)}>🗑️ Hapus</button>{/if}
          </div>
          <div class="form-group-modal"><label>🏫 Kelas</label><select bind:value={item.class_name}><option value="">Pilih Kelas</option>{#each classOptions as className}<option value={className}>{className}</option>{/each}</select></div>
          <div class="form-group-modal"><label>📚 Mata Pelajaran 1</label><select bind:value={item.subject}>{#each subjectOptions as subject}<option value={subject}>{subject === "None" ? "Tidak Ada" : subject}</option>{/each}</select></div>
          <div class="form-group-modal"><label>📚 Mata Pelajaran 2 <span class="form-hint-inline">(opsional)</span></label><select bind:value={item.subject2}>{#each subjectOptions as subject}<option value={subject}>{subject === "None" ? "Tidak Ada / 1 Pelajaran Saja" : subject}</option>{/each}</select></div>
          <div class="form-group-modal">
            <label>👨‍🏫 Ustad Pengajar</label>
            <select bind:value={item.teacher_id}>
              <option value="">Pilih Ustad</option>
              {#if ustadUsers.length === 0}<option disabled value="">Belum ada user dengan role Ustad</option>{:else}{#each ustadUsers as ustad}<option value={ustad.id}>{ustad.full_name || ustad.username}</option>{/each}{/if}
            </select>
            <small class="form-hint">Hanya user dengan role Ustad yang dapat dipilih.</small>
          </div>
          <div class="form-group-modal"><label>🕒 Jam</label><input type="text" placeholder="Contoh: 08:00 - 09:00" bind:value={item.time} /></div>
        </div>
      {/each}

      {#if editingScheduleId === null}<button type="button" class="btn-add-schedule-item" on:click={addScheduleItem}>➕ Tambah Kelompok Jadwal / Ustad</button>{/if}
      <div class="modal-footer">
        <button class="btn-secondary" on:click={() => showScheduleModal = false}>Batal</button>
        <button class="btn-primary" on:click={saveSchedule}>💾 {editingScheduleId !== null ? "Simpan Perubahan" : "Simpan Semua Jadwal"}</button>
      </div>
    </div>
  </div>
{/if}


<!-- =========================
     ANNOUNCEMENT MODAL
========================= -->

{#if showAnnouncementModal}

  <div
    class="modal-backdrop"
    on:click={() =>
      showAnnouncementModal =
        false}
  >

    <div
      class="modal-card"
      on:click|stopPropagation
    >

      <div
        class="modal-header"
      >

        <h3>

          {
            editingAnnouncementId !== null
              ? "Edit Pengumuman"
              : "Buat Pengumuman"
          }

        </h3>


        <button
          class="btn-close-modal"
          on:click={() =>
            showAnnouncementModal =
              false}
        >
          ✕
        </button>

      </div>


      <div
        class="form-group-modal"
      >

        <label>
          Judul Pengumuman
        </label>

        <input
          type="text"
          placeholder="Masukkan judul..."
          bind:value={
            announcementTitle
          }
        />

      </div>


      <div
        class="form-group-modal"
      >

        <label>
          Isi Pengumuman
        </label>

        <textarea
          class="announcement-textarea"
          placeholder="Tulis isi pengumuman..."
          bind:value={
            announcementContent
          }
        ></textarea>

      </div>


      <div
        class="modal-footer"
      >

        <button
          class="btn-secondary"
          on:click={() =>
            showAnnouncementModal =
              false}
        >
          Batal
        </button>


        <button
          class="btn-primary"
          on:click={
            saveAnnouncement
          }
        >
          💾 Simpan
        </button>

      </div>

    </div>

  </div>

{/if}


<style>

  /* ===== FILTER JENJANG ABSENSI ===== */
  .attendance-section-filter {
    width: 100%;
    margin-bottom: 18px;
    padding: 16px;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    background: #f8fafc;
  }

  .attendance-section-label {
    margin-bottom: 10px;
    font-size: 14px;
    font-weight: 700;
    color: #334155;
  }

  .attendance-section-buttons,
  .attendance-smp-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
  }

  .attendance-section-buttons button,
  .attendance-smp-buttons button {
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    background: #ffffff;
    color: #334155;
    padding: 9px 14px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.18s ease;
  }

  .attendance-section-buttons button:hover,
  .attendance-smp-buttons button:hover {
    border-color: #94a3b8;
    transform: translateY(-1px);
  }

  .attendance-section-buttons button.active,
  .attendance-smp-buttons button.active {
    background: #2563eb;
    border-color: #2563eb;
    color: #ffffff;
  }

  .attendance-smp-classes {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid #e2e8f0;
  }

  .attendance-smp-title {
    margin-bottom: 9px;
    font-size: 13px;
    font-weight: 700;
    color: #475569;
  }

  @media (max-width: 640px) {
    .attendance-section-buttons button,
    .attendance-smp-buttons button {
      flex: 1 1 auto;
      min-width: 110px;
    }
  }


  :global(*) {

    box-sizing:
      border-box;

  }


  :global(body) {

    margin:
      0;

    background:
      #f4f6f9;

    font-family:
      Arial,
      sans-serif;

    color:
      #2d3748;

  }


  :global(button),
  :global(input),
  :global(select),
  :global(textarea) {

    font-family:
      inherit;

  }


  /* =========================
     APP
  ========================= */

  .app-layout {

    display:
      flex;

    min-height:
      100vh;

  }


  /* =========================
     SIDEBAR
  ========================= */

  .sidebar {

    width:
      260px;

    min-height:
      100vh;

    background:
      linear-gradient(
        180deg,
        #004d99,
        #003366
      );

    color:
      white;

    padding:
      24px 18px;

    display:
      flex;

    flex-direction:
      column;

    gap:
      24px;

    transition:
      0.3s;

    position:
      fixed;

    left:
      0;

    top:
      0;

    z-index:
      100;

  }


  .brand {

    display:
      flex;

    align-items:
      center;

    gap:
      12px;

  }


  .brand-logo {

    font-size:
      24px;

    background:
      rgba(
        255,
        255,
        255,
        0.15
      );

    padding:
      10px;

    border-radius:
      12px;

  }


  .brand h2 {

    margin:
      0;

    font-size:
      19px;

  }


  .brand p {

    margin:
      3px 0 0;

    font-size:
      11px;

    opacity:
      0.75;

  }


  .nav-menu {

    display:
      flex;

    flex-direction:
      column;

    gap:
      7px;

    flex:
      1;

  }


  .nav-item {

    width:
      100%;

    border:
      none;

    background:
      transparent;

    color:
      white;

    text-align:
      left;

    padding:
      13px 15px;

    border-radius:
      10px;

    cursor:
      pointer;

    font-size:
      14px;

    opacity:
      0.8;

    transition:
      0.2s;

  }


  .nav-item:hover,
  .nav-item.active {

    opacity:
      1;

    background:
      rgba(
        255,
        255,
        255,
        0.15
      );

  }


  .logout-btn-side {

    border:
      none;

    background:
      rgba(
        239,
        68,
        68,
        0.25
      );

    color:
      white;

    padding:
      12px;

    border-radius:
      10px;

    cursor:
      pointer;

    font-weight:
      600;

  }


  .sidebar-overlay {

    display:
      none;

  }


  /* =========================
     MAIN
  ========================= */

  .main-content {

    flex:
      1;

    margin-left:
      260px;

    min-width:
      0;

  }


  /* =========================
     HEADER
  ========================= */

  .bca-header-bg {

    background:
      linear-gradient(
        135deg,
        #005caf,
        #003366
      );

    padding:
      24px 32px 70px;

    border-bottom-left-radius:
      30px;

    border-bottom-right-radius:
      30px;

  }


  .top-nav-bar {

    display:
      flex;

    align-items:
      center;

    justify-content:
      space-between;

  }


  .hamburger {

    display:
      none;

    border:
      none;

    background:
      transparent;

    color:
      white;

    font-size:
      28px;

    cursor:
      pointer;

  }


  .welcome-box {

    display:
      flex;

    align-items:
      center;

    gap:
      12px;

  }


  .avatar-circle {

    width:
      45px;

    height:
      45px;

    border-radius:
      50%;

    background:
      #00a3e0;

    display:
      flex;

    align-items:
      center;

    justify-content:
      center;

    font-weight:
      bold;

    color:
      white;

  }


  .welcome-text {

    display:
      flex;

    flex-direction:
      column;

    color:
      white;

  }


  .welcome-text span {

    font-size:
      12px;

    opacity:
      0.8;

  }


  .welcome-text strong {

    font-size:
      16px;

  }


  .logout-btn-header {

    border:
      none;

    background:
      rgba(
        255,
        255,
        255,
        0.15
      );

    color:
      white;

    padding:
      9px 15px;

    border-radius:
      20px;

    cursor:
      pointer;

    font-weight:
      600;

  }


  /* =========================
     BODY
  ========================= */

  .dashboard-body {

    padding:
      0 32px 32px;

    margin-top:
      -38px;

  }


  .portal-grid {

    display:
      grid;

    grid-template-columns:
      2fr 1fr;

    gap:
      20px;

    margin-bottom:
      20px;

  }


  .portal-grid-secondary {

    display:
      grid;

    grid-template-columns:
      1fr 1fr;

    gap:
      20px;

  }


  .bca-card {

    background:
      white;

    border-radius:
      18px;

    padding:
      22px;

    box-shadow:
      0 5px 22px
      rgba(
        0,
        0,
        0,
        0.06
      );

    border:
      1px solid
      #e2e8f0;

  }


  /* =========================
     SALDO
  ========================= */

  .saldo-card {

    background:
      linear-gradient(
        135deg,
        #005caf,
        #003366
      );

    color:
      white;

    border:
      none;

  }


  .card-top-row {

    display:
      flex;

    justify-content:
      space-between;

    align-items:
      center;

  }


  .card-label {

    font-size:
      13px;

    opacity:
      0.85;

  }


  .badge-brand {

    background:
      rgba(
        255,
        255,
        255,
        0.18
      );

    padding:
      5px 10px;

    border-radius:
      20px;

    font-size:
      11px;

  }


  .card-main-balance {

    font-size:
      32px;

    font-weight:
      800;

    margin:
      24px 0;

  }


  .card-footer-info {

    border-top:
      1px solid
      rgba(
        255,
        255,
        255,
        0.2
      );

    padding-top:
      12px;

    font-size:
      12px;

    opacity:
      0.85;

  }


  /* =========================
     SUMMARY
  ========================= */

  .box-title {

    margin:
      0 0 16px;

    font-size:
      16px;

  }


  .summary-pills-row {

    display:
      flex;

    flex-direction:
      column;

    gap:
      10px;

  }


  .summary-pill {

    padding:
      14px;

    border-radius:
      12px;

    display:
      flex;

    flex-direction:
      column;

    gap:
      4px;

  }


  .summary-pill.green {

    background:
      #e6f4ea;

    border-left:
      4px solid
      #137333;

  }


  .summary-pill.red {

    background:
      #fce8e6;

    border-left:
      4px solid
      #c5221f;

  }


  .pill-title {

    font-size:
      11px;

    color:
      #64748b;

    font-weight:
      600;

  }


  .pill-value {

    font-size:
      15px;

    font-weight:
      bold;

  }


  .summary-pill.green
  .pill-value {

    color:
      #137333;

  }


  .summary-pill.red
  .pill-value {

    color:
      #c5221f;

  }


  /* =========================
     SERVICES
  ========================= */

  .services-grid {

    display:
      grid;

    grid-template-columns:
      repeat(
        3,
        1fr
      );

    gap:
      12px;

  }


  .service-item {

    border:
      1px solid
      #edf2f7;

    background:
      #f8fafc;

    border-radius:
      12px;

    padding:
      14px 8px;

    cursor:
      pointer;

    display:
      flex;

    flex-direction:
      column;

    align-items:
      center;

    gap:
      8px;

    transition:
      0.2s;

  }


  .service-item:hover {

    transform:
      translateY(-2px);

    background:
      #edf2f7;

  }


  .service-item span {

    font-size:
      11px;

    font-weight:
      600;

    color:
      #475569;

  }


  .s-icon {

    width:
      42px;

    height:
      42px;

    border-radius:
      12px;

    display:
      flex;

    align-items:
      center;

    justify-content:
      center;

    font-size:
      19px;

  }


  .blue {
    background: #e1f5fe;
  }

  .red {
    background: #ffebee;
  }

  .purple {
    background: #f3e5f5;
  }

  .orange {
    background: #fff3e0;
  }

  .cyan {
    background: #e0f7fa;
  }

  .green {
    background: #e8f5e9;
  }


  /* =========================
     TRANSACTION
  ========================= */

  .transaction-list {

    display:
      flex;

    flex-direction:
      column;

    gap:
      8px;

  }


  .trx-item {

    display:
      flex;

    align-items:
      center;

    gap:
      12px;

    padding:
      10px 0;

    border-bottom:
      1px solid
      #f1f5f9;

  }


  .trx-icon-wrapper {

    width:
      35px;

    height:
      35px;

    border-radius:
      50%;

    display:
      flex;

    align-items:
      center;

    justify-content:
      center;

    font-weight:
      bold;

  }


  .trx-icon-wrapper.pemasukan {

    background:
      #e6f4ea;

    color:
      #137333;

  }


  .trx-icon-wrapper.pengeluaran {

    background:
      #fce8e6;

    color:
      #c5221f;

  }


  .trx-details {

    flex:
      1;

    display:
      flex;

    flex-direction:
      column;

  }


  .trx-details strong {

    font-size:
      13px;

  }


  .trx-details small {

    font-size:
      11px;

    color:
      #94a3b8;

  }


  .trx-amount {

    font-size:
      13px;

    font-weight:
      bold;

  }


  .trx-amount.pemasukan {

    color:
      #137333;

  }


  .trx-amount.pengeluaran {

    color:
      #c5221f;

  }


  /* =========================
     SUB PAGE
  ========================= */

  .sub-header-row {

    display:
      flex;

    justify-content:
      space-between;

    align-items:
      center;

    gap:
      15px;

    flex-wrap:
      wrap;

    margin-bottom:
      20px;

  }


  .sub-header-row h3 {

    margin:
      0;

    font-size:
      18px;

  }


  .sub-description {

    margin:
      5px 0 0;

    font-size:
      12px;

    color:
      #64748b;

  }


  .action-group-top {

    display:
      flex;

    gap:
      8px;

    flex-wrap:
      wrap;

  }


  /* =========================
     BUTTONS
  ========================= */

  .btn-primary {

    border:
      none;

    background:
      #005caf;

    color:
      white;

    padding:
      10px 15px;

    border-radius:
      9px;

    cursor:
      pointer;

    font-size:
      12px;

    font-weight:
      600;

  }


  .btn-primary:hover {

    background:
      #004b8f;

  }


  .btn-secondary {

    border:
      none;

    background:
      #e2e8f0;

    color:
      #475569;

    padding:
      9px 14px;

    border-radius:
      8px;

    cursor:
      pointer;

  }


  .btn-back {

    border:
      none;

    background:
      #e2e8f0;

    color:
      #475569;

    padding:
      10px 14px;

    border-radius:
      9px;

    cursor:
      pointer;

    font-weight:
      600;

    font-size:
      12px;

  }


  .btn-icon {

    border:
      none;

    background:
      #f1f5f9;

    padding:
      7px 9px;

    border-radius:
      7px;

    cursor:
      pointer;

  }


  .btn-icon.danger {

    background:
      #fee2e2;

  }


  .action-buttons {

    display:
      flex;

    gap:
      6px;

    justify-content:
      center;

  }


  /* =========================
     CONTROLS
  ========================= */

  .control-card-inline {

    display:
      flex;

    justify-content:
      space-between;

    align-items:
      center;

    gap:
      12px;

    flex-wrap:
      wrap;

    margin-bottom:
      16px;

  }


  .user-management-search {

    margin-bottom: 16px;

    display: flex;

    align-items: center;

    justify-content: space-between;

    gap: 12px;

    flex-wrap: wrap;

  }


  .user-management-search .search-box {

    flex: 1;

    min-width: 260px;

    max-width: 520px;

  }


  .search-clear-btn {

    border: none;

    background: transparent;

    cursor: pointer;

    font-size: 14px;

    padding: 2px 4px;

  }


  .user-search-result-count {

    color: #64748b;

    font-size: 14px;

  }


  .search-box {

    display:
      flex;

    align-items:
      center;

    gap:
      6px;

    background:
      #f8fafc;

    border:
      1px solid
      #cbd5e1;

    padding:
      8px 12px;

    border-radius:
      9px;

    width:
      260px;

  }


  .search-box input {

    border:
      none;

    background:
      transparent;

    outline:
      none;

    width:
      100%;

  }


  .year-picker {

    display:
      flex;

    align-items:
      center;

    gap:
      8px;

    font-size:
      12px;

  }


  .year-picker select {

    padding:
      8px;

    border-radius:
      8px;

    border:
      1px solid
      #cbd5e1;

  }


  /* =========================
     TABLE
  ========================= */

  .table-responsive {

    width:
      100%;

    overflow-x:
      auto;

  }


  .data-table {

    width:
      100%;

    min-width:
      650px;

    border-collapse:
      collapse;

    font-size:
      12px;

  }


  .data-table th {

    background:
      #f8fafc;

    color:
      #475569;

    padding:
      12px 8px;

    text-align:
      left;

    border-bottom:
      1px solid
      #e2e8f0;

  }


  .data-table td {

    padding:
      10px 8px;

    border-bottom:
      1px solid
      #f1f5f9;

  }


  .text-center {

    text-align:
      center;

  }


  .empty-cell {

    text-align:
      center;

    padding:
      25px;

    color:
      #94a3b8;

  }


  .user-cell {

    display:
      flex;

    align-items:
      center;

    gap:
      8px;

  }


  .user-avatar {

    width:
      30px;

    height:
      30px;

    border-radius:
      50%;

    background:
      #e1f5fe;

    color:
      #0288d1;

    display:
      flex;

    align-items:
      center;

    justify-content:
      center;

    font-size:
      11px;

    font-weight:
      bold;

    flex-shrink:
      0;

  }


  /* =========================
     ROLE
  ========================= */

  .required-mark {
    color: #dc2626;
    font-weight: 700;
  }

  .text-muted {
    color: #94a3b8;
  }

  .role-badge {

    display:
      inline-block;

    padding:
      4px 8px;

    border-radius:
      20px;

    font-size:
      10px;

    font-weight:
      bold;

    text-transform:
      uppercase;

  }


  .role-badge.santri {

    background:
      #e1f5fe;

    color:
      #0288d1;

  }


  .role-badge.admin {

    background:
      #fff3e0;

    color:
      #ef6c00;

  }


  .role-badge.ustad {

    background:
      #ede9fe;

    color:
      #6d28d9;

  }


  /* =========================
     SPP
  ========================= */

  .spp-chip {

    width:
      26px;

    height:
      26px;

    border:
      none;

    border-radius:
      7px;

    font-weight:
      bold;

    cursor:
      pointer;

  }


  .spp-chip.lunas {

    background:
      #dcfce7;

    color:
      #15803d;

  }


  .spp-chip.belum {

    background:
      #fee2e2;

    color:
      #dc2626;

  }


  .spp-chip.disabled {

    cursor:
      not-allowed;

    opacity:
      0.7;

  }


  .badge-count {

    background:
      #f1f5f9;

    padding:
      5px 8px;

    border-radius:
      20px;

    font-weight:
      bold;

  }


  .badge-count.full {

    background:
      #dcfce7;

    color:
      #15803d;

  }


  /* =========================
     ATTENDANCE
  ========================= */

  .attendance-date-box {

    display:
      flex;

    flex-direction:
      column;

    gap:
      6px;

    margin-bottom:
      15px;

    max-width:
      250px;

  }


  .attendance-date-box label {

    font-size:
      12px;

    font-weight:
      600;

  }


  .attendance-date-box input {

    padding:
      10px;

    border:
      1px solid
      #cbd5e1;

    border-radius:
      9px;

  }


  .attendance-form {

    display:
      flex;

    gap:
      10px;

    flex-wrap:
      wrap;

    margin-bottom:
      20px;

  }


  .attendance-form select,
  .attendance-form input {

    padding:
      10px;

    border:
      1px solid
      #cbd5e1;

    border-radius:
      9px;

    min-width:
      180px;

  }

  .attendance-search {
    min-width: 240px;
  }


  .attendance-summary {

    display:
      grid;

    grid-template-columns:
      repeat(
        4,
        1fr
      );

    gap:
      12px;

    margin-bottom:
      20px;

  }


  .attendance-summary-item {

    background:
      #f8fafc;

    border:
      1px solid
      #e2e8f0;

    border-radius:
      12px;

    padding:
      14px;

    display:
      flex;

    flex-direction:
      column;

  }


  .attendance-summary-item strong {

    font-size:
      22px;

  }


  .attendance-summary-item span {

    font-size:
      11px;

    color:
      #64748b;

  }


  .attendance-badge {

    display:
      inline-block;

    padding:
      5px 9px;

    border-radius:
      20px;

    font-size:
      11px;

    font-weight:
      bold;

  }


  .attendance-badge.hadir {

    background:
      #dcfce7;

    color:
      #15803d;

  }


  .attendance-badge.izin {

    background:
      #dbeafe;

    color:
      #1d4ed8;

  }


  .attendance-badge.sakit {

    background:
      #fef3c7;

    color:
      #b45309;

  }


  .attendance-badge.alpha {

    background:
      #fee2e2;

    color:
      #dc2626;

  }


  .attendance-badge.belum {

    background:
      #f1f5f9;

    color:
      #64748b;

  }


  /* =========================
     TEACHER
  ========================= */

  .teacher-cell {

    display:
      flex;

    align-items:
      center;

    gap:
      6px;

  }


  /* =========================
     ANNOUNCEMENT
  ========================= */

  .announcement-list {

    display:
      flex;

    flex-direction:
      column;

    gap:
      15px;

  }


  .announcement-card {

    border:
      1px solid
      #e2e8f0;

    border-radius:
      14px;

    padding:
      18px;

    background:
      #ffffff;

    transition:
      0.2s;

  }


  .announcement-card:hover {

    transform:
      translateY(-2px);

    box-shadow:
      0 8px 20px
      rgba(
        0,
        0,
        0,
        0.06
      );

  }


  .announcement-header {

    display:
      flex;

    justify-content:
      space-between;

    align-items:
      flex-start;

    gap:
      12px;

    margin-bottom:
      14px;

  }


  .announcement-header h4 {

    margin:
      0 0 5px;

    font-size:
      16px;

    color:
      #1e293b;

  }


  .announcement-header small {

    color:
      #94a3b8;

    font-size:
      11px;

  }


  .announcement-content {

    color:
      #475569;

    font-size:
      13px;

    line-height:
      1.7;

    white-space:
      pre-wrap;

  }


  .empty-announcement {

    text-align:
      center;

    padding:
      50px 20px;

    color:
      #94a3b8;

    font-size:
      14px;

  }


  .empty-announcement div {

    font-size:
      35px;

  }


  .announcement-textarea {

    width:
      100%;

    min-height:
      140px;

    padding:
      10px;

    border:
      1px solid
      #cbd5e1;

    border-radius:
      9px;

    font-family:
      inherit;

    font-size:
      13px;

    resize:
      vertical;

    outline:
      none;

  }


  .announcement-textarea:focus {

    border-color:
      #005caf;

    box-shadow:
      0 0 0 3px
      rgba(
        0,
        92,
        175,
        0.1
      );

  }


  /* =========================
     HOME ANNOUNCEMENT
  ========================= */

  .home-announcement-card {

    margin-top:
      20px;

  }


  .home-announcement-list {

    display:
      flex;

    flex-direction:
      column;

    gap:
      12px;

  }


  .home-announcement-item {

    display:
      flex;

    justify-content:
      space-between;

    align-items:
      flex-start;

    gap:
      20px;

    padding:
      14px;

    background:
      #f8fafc;

    border-radius:
      12px;

    border:
      1px solid
      #e2e8f0;

  }


  .home-announcement-item strong {

    font-size:
      13px;

  }


  .home-announcement-item p {

    margin:
      6px 0 0;

    font-size:
      12px;

    color:
      #64748b;

    line-height:
      1.5;

  }


  .home-announcement-item small {

    color:
      #94a3b8;

    white-space:
      nowrap;

    font-size:
      11px;

  }


  /* =========================
     BARCODE
  ========================= */

  .barcode-grid {

    display:
      grid;

    grid-template-columns:
      repeat(
        auto-fit,
        minmax(
          230px,
          1fr
        )
      );

    gap:
      18px;

  }


  .barcode-card {

    border:
      1px solid
      #e2e8f0;

    border-radius:
      14px;

    padding:
      18px;

    background:
      #fff;

  }


  .barcode-user {

    display:
      flex;

    align-items:
      center;

    gap:
      10px;

    margin-bottom:
      18px;

  }


  .barcode {

    display:
      flex;

    align-items:
      stretch;

    height:
      80px;

    justify-content:
      center;

    gap:
      2px;

    background:
      white;

    padding:
      8px;

    border:
      1px solid
      #e2e8f0;

  }


  .barcode span {

    display:
      block;

    height:
      100%;

    background:
      #111827;

  }


  .barcode-number {

    text-align:
      center;

    margin-top:
      10px;

    font-family:
      monospace;

    font-size:
      14px;

    letter-spacing:
      3px;

    font-weight:
      bold;

  }


  .barcode-header-actions {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }

  .qr-code-wrap {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 12px;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
  }

  .qr-code-image {
    width: 220px;
    height: 220px;
    display: block;
    image-rendering: pixelated;
  }

  .qr-hint {
    display: block;
    text-align: center;
    margin-top: 8px;
    color: #64748b;
    line-height: 1.5;
  }

  .qr-native-camera-input {
    position: fixed;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .qr-scanner-modal {
    width: min(520px, calc(100vw - 30px));
  }

  .qr-camera-box {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    border-radius: 18px;
    background: #0f172a;
  }

  .qr-camera-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .qr-scan-frame {
    position: absolute;
    inset: 18%;
    border: 3px solid #fff;
    border-radius: 18px;
    box-shadow: 0 0 0 999px rgba(0, 0, 0, 0.25);
    pointer-events: none;
  }

  .qr-scanner-status {
    text-align: center;
    color: #64748b;
    margin: 12px 0 0;
  }

  .qr-scanner-error {
    margin-top: 12px;
    padding: 12px 14px;
    border-radius: 10px;
    background: #fef2f2;
    color: #b91c1c;
    line-height: 1.5;
    font-size: 13px;
  }

  /* =========================
     FORM
  ========================= */

  .quick-form {

    max-width:
      500px;

    display:
      flex;

    flex-direction:
      column;

    gap:
      14px;

  }


  .form-group {

    display:
      flex;

    flex-direction:
      column;

    gap:
      6px;

  }


  .form-group label {

    font-size:
      12px;

    font-weight:
      600;

  }


  .form-group input,
  .form-group select {

    padding:
      11px;

    border:
      1px solid
      #cbd5e1;

    border-radius:
      9px;

    outline:
      none;

  }


  .big-button {

    padding:
      13px;

    font-size:
      14px;

  }


  /* =========================
     MODAL
  ========================= */

  .modal-backdrop {

    position:
      fixed;

    inset:
      0;

    background:
      rgba(
        0,
        0,
        0,
        0.5
      );

    display:
      flex;

    align-items:
      center;

    justify-content:
      center;

    padding:
      20px;

    z-index:
      1000;

  }


  .modal-card {

    width:
      100%;

    max-width:
      430px;

    background:
      white;

    border-radius:
      16px;

    padding:
      22px;

    box-shadow:
      0 20px 50px
      rgba(
        0,
        0,
        0,
        0.2
      );

  }


  .modal-header {

    display:
      flex;

    align-items:
      center;

    justify-content:
      space-between;

    margin-bottom:
      18px;

  }


  .modal-header h3 {

    margin:
      0;

  }


  .btn-close-modal {

    border:
      none;

    width:
      30px;

    height:
      30px;

    border-radius:
      50%;

    cursor:
      pointer;

    background:
      #f1f5f9;

  }


  .form-group-modal {

    display:
      flex;

    flex-direction:
      column;

    gap:
      6px;

    margin-bottom:
      14px;

  }


  .form-group-modal label {

    font-size:
      12px;

    font-weight:
      600;

  }


  .form-group-modal input,
  .form-group-modal select {

    padding:
      10px;

    border:
      1px solid
      #cbd5e1;

    border-radius:
      9px;

    outline:
      none;

  }


  .modal-footer {

    display:
      flex;

    justify-content:
      flex-end;

    gap:
      8px;

    margin-top:
      20px;

  }


  /* =========================
     TOAST
  ========================= */

  .toast {

    position:
      fixed;

    top:
      20px;

    right:
      20px;

    z-index:
      2000;

    padding:
      14px 18px;

    border-radius:
      12px;

    font-size:
      13px;

    font-weight:
      600;

    box-shadow:
      0 10px 30px
      rgba(
        0,
        0,
        0,
        0.15
      );

  }


  .toast.success {

    background:
      #dcfce7;

    color:
      #15803d;

  }


  .toast.error {

    background:
      #fee2e2;

    color:
      #dc2626;

  }


  /* =========================
     TABLET
  ========================= */

  @media (
    max-width:
    1000px
  ) {

    .portal-grid,
    .portal-grid-secondary {

      grid-template-columns:
        1fr;

    }


    .services-grid {

      grid-template-columns:
        repeat(
          4,
          1fr
        );

    }

  }


  /* =========================
     MOBILE
  ========================= */

  @media (
    max-width:
    768px
  ) {

    .sidebar {

      transform:
        translateX(
          -100%
        );

    }


    .sidebar.open {

      transform:
        translateX(
          0
        );

    }


    .sidebar-overlay {

      display:
        block;

      position:
        fixed;

      inset:
        0;

      background:
        rgba(
          0,
          0,
          0,
          0.4
        );

      z-index:
        90;

    }


    .main-content {

      margin-left:
        0;

    }


    .hamburger {

      display:
        block;

    }


    .bca-header-bg {

      padding:
        20px 18px 65px;

    }


    .dashboard-body {

      padding:
        0 16px 25px;

      margin-top:
        -32px;

    }


    .bca-card {

      padding:
        16px;

    }


    .card-main-balance {

      font-size:
        25px;

    }


    .welcome-text strong {

      font-size:
        14px;

    }


    .logout-btn-header span {

      display:
        none;

    }


    .services-grid {

      grid-template-columns:
        repeat(
          3,
          1fr
        );

    }


    .attendance-summary {

      grid-template-columns:
        repeat(
          2,
          1fr
        );

    }


    .attendance-form {

      flex-direction:
        column;

    }


    .attendance-form select,
    .attendance-form input,
    .attendance-form button {

      width:
        100%;

    }


    .sub-header-row {

      align-items:
        flex-start;

    }


    .announcement-header {

      flex-direction:
        column;

    }


    .home-announcement-item {

      flex-direction:
        column;

      gap:
        8px;

    }

  }


  /* =========================
     SMALL MOBILE
  ========================= */

  @media (
    max-width:
    430px
  ) {

    .services-grid {

      grid-template-columns:
        repeat(
          2,
          1fr
        );

    }


    .top-nav-bar {

      gap:
        8px;

    }


    .welcome-box {

      gap:
        8px;

    }


    .avatar-circle {

      width:
        38px;

      height:
        38px;

    }


    .card-main-balance {

      font-size:
        22px;

    }


    .action-group-top {

      width:
        100%;

    }


    .action-group-top button {

      flex:
        1;

    }

  }



  /* =========================
     HOME USER STATS
  ========================= */

  .user-stats-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .user-stat-card {
    display: flex;
    align-items: center;
    gap: 16px;
    min-height: 140px;
    padding: 24px;
  }

  .user-stat-icon {
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 16px;
    font-size: 28px;
    background: rgba(255, 255, 255, 0.14);
  }

  .user-stat-content {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .user-stat-content span {
    font-size: 14px;
    opacity: 0.85;
  }

  .user-stat-content strong {
    font-size: 32px;
    line-height: 1;
  }

  @media (max-width: 900px) {
    .user-stats-grid {
      grid-template-columns: 1fr;
    }
  }


  /* =========================
     ROLE STAT MODAL
  ========================= */

  .clickable-stat-card {
    border: none;
    width: 100%;
    text-align: left;
    cursor: pointer;
    font: inherit;
    color: inherit;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .clickable-stat-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.14);
  }

  .clickable-stat-card:focus-visible {
    outline: 3px solid rgba(255, 255, 255, 0.8);
    outline-offset: 3px;
  }

  .role-modal-card {
    max-width: 620px;
  }

  .role-user-list {
    max-height: 55vh;
    overflow-y: auto;
    padding: 12px 4px;
  }

  .role-user-item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px;
    margin: 10px 0;
    border-radius: 14px;
    background: #f7f9fc;
    border: 1px solid #edf0f5;
  }

  .role-user-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .role-user-info strong,
  .role-user-info span,
  .role-user-info small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .role-user-info span {
    color: #6b7280;
    font-size: 13px;
  }

  .role-user-info small {
    color: #9ca3af;
    font-size: 12px;
  }

  .empty-role-list {
    padding: 40px 20px;
    text-align: center;
    color: #6b7280;
  }

  @media (max-width: 600px) {
    .role-user-item {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .role-user-info {
      min-width: calc(100% - 60px);
    }
  }


  /* =========================
     SCHEDULE IMPROVEMENTS
  ========================= */

  .class-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 8px;
    background: #eef4ff;
    color: #2457a5;
    font-size: 13px;
    font-weight: 600;
  }

  .schedule-subjects {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .subject-badge {
    display: inline-flex;
    align-items: center;
    padding: 7px 11px;
    border-radius: 9px;
    background: #eef4ff;
    color: #2457a5;
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
  }

  .subject-badge-secondary {
    background: #f3e8ff;
    color: #7e22ce;
  }

  .subject-none {
    display: inline-block;
    padding: 5px 10px;
    border-radius: 8px;
    background: #f1f1f1;
    color: #888;
    font-size: 12px;
    font-style: italic;
  }

  .form-hint {
    display: block;
    margin-top: 6px;
    color: #888;
    font-size: 12px;
  }

  .form-group-modal select {
    width: 100%;
    padding: 12px;
    border: 1px solid #ddd;
    border-radius: 10px;
    background: white;
    font-size: 14px;
    outline: none;
  }

  .form-group-modal select:focus {
    border-color: #2463eb;
  }
  /* GROUPED SCHEDULE */
  .schedule-modal { max-height: 90vh; overflow-y: auto; }
  .schedule-item-box { margin-top: 16px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc; }
  .schedule-item-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
  .btn-remove-schedule { border: none; padding: 8px 12px; border-radius: 8px; cursor: pointer; background: #fee2e2; color: #b91c1c; }
  .btn-add-schedule-item { width: 100%; margin-top: 16px; padding: 12px; border: 1px dashed #2463eb; border-radius: 10px; background: #eff6ff; color: #2463eb; font-weight: 600; cursor: pointer; }
  .schedule-day-list { display: grid; gap: 20px; }
  .schedule-day-card { overflow: hidden; border: 1px solid #e5e7eb; border-radius: 14px; }
  .schedule-day-title { padding: 14px 18px; background: #f3f4f6; font-size: 18px; font-weight: 700; }

</style>
