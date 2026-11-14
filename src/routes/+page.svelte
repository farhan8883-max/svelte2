<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { supabase } from "$lib/supabaseClient";

  // ---------- State ----------
  type Mood = "idle" | "shy" | "happy" | "sad";

  let mood: Mood = "idle";
  let theme: "dark" | "light" = "dark";
  let logoErr = false;

  let email = "";
  let password = "";
  let showPw = false;
  let pwFocused = false;
  let loading = false;
  let message = "";
  let isError = false;

  let robotEl: SVGSVGElement;
  let px = 0;
  let py = 0;
  let sadTimer: ReturnType<typeof setTimeout> | undefined;

  const hello = "Assalamualaikum! Ayo masuk dulu 👋";

  const stars = Array.from({ length: 30 }, (_, i) => ({
    x: (i * 37 + 11) % 100,
    y: (i * 53 + 7) % 58,
    s: 1 + (i % 3),
    d: (i % 7) * 0.55
  }));

  $: bubble =
    mood === "shy"
      ? "Tenang, aku tutup mata kok 🙈"
      : mood === "happy"
        ? "Alhamdulillah, selamat datang!"
        : mood === "sad"
          ? "Hmm, coba cek lagi ya 🥺"
          : hello;

  // ---------- Tema ----------
  onMount(() => {
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark") theme = saved;
      else theme = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    } catch {}
  });

  function toggleTheme() {
    theme = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("theme", theme);
    } catch {}
  }

  // ---------- Mata robot mengikuti pointer ----------
  function track(e: PointerEvent) {
    if (!robotEl) return;
    const r = robotEl.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height * 0.5);
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(d / 160, 1) * 5;
    px = (dx / d) * k;
    py = (dy / d) * k;
  }

  // ---------- Mood robot ----------
  function setIdleUnlessShy() {
    mood = pwFocused && !showPw ? "shy" : "idle";
  }

  function onPwFocus() {
    pwFocused = true;
    clearTimeout(sadTimer);
    setIdleUnlessShy();
  }

  function onPwBlur() {
    pwFocused = false;
    setIdleUnlessShy();
  }

  function togglePw() {
    showPw = !showPw;
    setIdleUnlessShy();
  }

  function onUserFocus() {
    clearTimeout(sadTimer);
    mood = "idle";
  }

  // ---------- Submit (Supabase) ----------
  function fail(msg: string) {
    mood = "sad";
    isError = true;
    message = msg;
    sadTimer = setTimeout(setIdleUnlessShy, 2500);
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (loading) return;

    message = "";
    isError = false;
    clearTimeout(sadTimer);

    const emailTrim = email.trim();
    if (!emailTrim || !password) {
      fail("Email dan password wajib diisi");
      return;
    }

    loading = true;
    try {
      const password_hash = btoa(password);

      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", emailTrim)
        .eq("password_hash", password_hash)
        .single();

      if (error || !data) {
        fail("Email atau password salah");
        return;
      }

      // Jangan simpan hash password di browser
      const { password_hash: _hash, ...safeUser } = data;
      localStorage.setItem("user", JSON.stringify(safeUser));

      mood = "happy";
      message = "Login berhasil!";

      // Pengarahan berdasarkan role
      const target =
        data.role === "admin" ? "/dashboard" : data.role === "ustad" ? "/ustad" : "/santri";
      setTimeout(() => goto(target), 900);
    } catch {
      fail("Terjadi kesalahan, coba lagi.");
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Masuk | Daarulhikam</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@400;600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<svelte:window on:pointermove={track} />

<div class="auth" data-theme={theme}>
  <!-- Langit: bulan/matahari, bintang, awan, siluet masjid -->
  <div class="sky" aria-hidden="true">
    <div class="orb"></div>
    {#each stars as s}
      <span class="star" style="left:{s.x}%;top:{s.y}%;width:{s.s}px;height:{s.s}px;animation-delay:{s.d}s"></span>
    {/each}
    <div class="cloud c1"></div>
    <div class="cloud c2"></div>
    <div class="cloud c3"></div>
    <svg class="skyline" viewBox="0 0 1200 200" preserveAspectRatio="xMidYMax slice">
      <g fill="var(--skyline)">
        <rect x="0" y="168" width="1200" height="32" />
        <rect x="200" y="140" width="130" height="40" />
        <rect x="870" y="140" width="130" height="40" />
        <rect x="420" y="120" width="360" height="60" />
        <path d="M450 120 A150 90 0 0 1 750 120Z" />
        <rect x="598" y="14" width="4" height="20" />
        <path d="M330 150 A45 45 0 0 1 420 150Z" />
        <path d="M780 150 A45 45 0 0 1 870 150Z" />
        <rect x="112" y="70" width="16" height="110" />
        <path d="M108 70 L120 36 L132 70Z" />
        <rect x="106" y="104" width="28" height="7" />
        <rect x="1072" y="70" width="16" height="110" />
        <path d="M1068 70 L1080 36 L1092 70Z" />
        <rect x="1066" y="104" width="28" height="7" />
      </g>
    </svg>
  </div>

  <!-- Tombol mode siang / malam -->
  <button
    class="theme"
    type="button"
    on:click={toggleTheme}
    aria-label={theme === "dark" ? "Ganti ke mode siang" : "Ganti ke mode malam"}
    aria-pressed={theme === "dark"}
  >
    <span class="ico sun">☀️</span>
    <span class="ico moon">🌙</span>
    <span class="knob"></span>
  </button>

  <main class="stage">
    <!-- Robot maskot -->
    <div class="mascot">
      {#key bubble}
        <div class="bubble" role="status">{bubble}</div>
      {/key}

      <svg
        bind:this={robotEl}
        class="robot {mood}"
        viewBox="0 0 220 190"
        role="img"
        aria-label="Maskot robot Daarulhikam"
      >
        <!-- badan -->
        <rect x="62" y="136" width="96" height="62" rx="24" fill="var(--metal)" stroke="var(--metal-d)" stroke-width="3" />

        <!-- tangan kiri bertumpu di kartu -->
        <line x1="70" y1="160" x2="46" y2="152" stroke="var(--metal-d)" stroke-width="16" stroke-linecap="round" />
        <line x1="70" y1="160" x2="46" y2="152" stroke="var(--metal)" stroke-width="10" stroke-linecap="round" />
        <circle cx="42" cy="150" r="14" fill="var(--metal)" stroke="var(--metal-d)" stroke-width="3" />

        <!-- tangan kanan melambai -->
        <g class="arm" class:wave={mood === "idle" || mood === "happy"}>
          <line x1="168" y1="152" x2="198" y2="100" stroke="var(--metal-d)" stroke-width="16" stroke-linecap="round" />
          <line x1="168" y1="152" x2="198" y2="100" stroke="var(--metal)" stroke-width="10" stroke-linecap="round" />
          <circle cx="202" cy="92" r="14" fill="var(--metal)" stroke="var(--metal-d)" stroke-width="3" />
        </g>

        <!-- telinga -->
        <rect x="20" y="72" width="18" height="38" rx="9" fill="var(--metal-d)" />
        <rect x="182" y="72" width="18" height="38" rx="9" fill="var(--metal-d)" />

        <!-- kepala -->
        <rect x="34" y="40" width="152" height="104" rx="40" fill="var(--metal)" stroke="var(--metal-d)" stroke-width="3" />
        <rect x="50" y="58" width="120" height="70" rx="28" fill="var(--screen)" />

        <!-- peci -->
        <path d="M62 50 L70 20 Q110 10 150 20 L158 50 Z" fill="var(--peci)" />
        <rect x="63" y="42" width="94" height="6" rx="3" fill="var(--gold)" />

        <!-- pipi -->
        <circle cx="68" cy="112" r="7" fill="#ff8fa3" opacity="0.55" />
        <circle cx="152" cy="112" r="7" fill="#ff8fa3" opacity="0.55" />

        <!-- mata -->
        {#if mood === "happy"}
          <path d="M76 98 Q88 80 100 98" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" />
          <path d="M120 98 Q132 80 144 98" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" />
        {:else}
          <g class="eye">
            <circle cx="88" cy="92" r="14" fill="#fff" />
            <g style="transform: translate({px}px, {py + (mood === 'sad' ? 3 : 0)}px)">
              <circle cx="88" cy="92" r="7.5" fill="#14243e" />
              <circle cx="85.5" cy="89.5" r="2.4" fill="#fff" />
            </g>
          </g>
          <g class="eye">
            <circle cx="132" cy="92" r="14" fill="#fff" />
            <g style="transform: translate({px}px, {py + (mood === 'sad' ? 3 : 0)}px)">
              <circle cx="132" cy="92" r="7.5" fill="#14243e" />
              <circle cx="129.5" cy="89.5" r="2.4" fill="#fff" />
            </g>
          </g>
        {/if}

        <!-- mulut -->
        {#if mood === "happy"}
          <path d="M94 108 Q110 134 126 108 Z" fill="var(--glow)" />
        {:else if mood === "sad"}
          <path d="M98 121 Q110 109 122 121" stroke="var(--glow)" stroke-width="5" fill="none" stroke-linecap="round" />
        {:else}
          <path d="M96 112 Q110 125 124 112" stroke="var(--glow)" stroke-width="5" fill="none" stroke-linecap="round" />
        {/if}

        <!-- tangan menutup mata (saat isi password) -->
        <g class="cover">
          <ellipse cx="88" cy="94" rx="21" ry="17" fill="var(--metal)" stroke="var(--metal-d)" stroke-width="3" />
          <path d="M77 90 v9 M88 88 v11 M99 90 v9" stroke="var(--metal-d)" stroke-width="2.5" stroke-linecap="round" />
          <ellipse cx="132" cy="94" rx="21" ry="17" fill="var(--metal)" stroke="var(--metal-d)" stroke-width="3" />
          <path d="M121 90 v9 M132 88 v11 M143 90 v9" stroke="var(--metal-d)" stroke-width="2.5" stroke-linecap="round" />
        </g>
      </svg>
    </div>

    <!-- Kartu form -->
    <section class="card">
      <header class="brand">
        <span class="logo-ring">
          {#if !logoErr}
            <img src="/logo.png" alt="Logo Pondok Pesantren Daarulhikam" on:error={() => (logoErr = true)} />
          {:else}
            <span class="mono">D</span>
          {/if}
        </span>
        <span class="names">
          <strong>Daarulhikam</strong>
          <small>Pondok Pesantren</small>
        </span>
      </header>

      <h1>Masuk</h1>
      <p class="sub">Silakan login untuk melanjutkan</p>

      <!-- ===== FORM LOGIN ===== -->
      <form on:submit={submit} novalidate={false}>
        <div class="field">
          <label for="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autocomplete="email"
            placeholder="Masukkan email"
            bind:value={email}
            on:focus={onUserFocus}
            required
          />
        </div>

        <div class="field">
          <label for="password">Password</label>
          <div class="pw">
            <input
              id="password"
              name="password"
              type={showPw ? "text" : "password"}
              autocomplete="current-password"
              placeholder="Masukkan password"
              bind:value={password}
              on:focus={onPwFocus}
              on:blur={onPwBlur}
              required
            />
            <button
              type="button"
              class="peek"
              aria-label={showPw ? "Sembunyikan password" : "Tampilkan password"}
              aria-pressed={showPw}
              on:click={togglePw}
            >
              {showPw ? "🙈" : "👁️"}
            </button>
          </div>
        </div>

        <button class="btn" type="submit" disabled={loading}>
          {loading ? "Memproses..." : "Masuk"}
        </button>

        {#if message}
          <div class="msg" class:error={isError} role="alert">{message}</div>
        {/if}
      </form>
    </section>
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
  }

  /* ---------- Token tema ---------- */
  .auth {
    --display: "Baloo 2", "Nunito", system-ui, sans-serif;
    --body: "Nunito", system-ui, sans-serif;
    transition: background 0.5s ease;
  }
  .auth[data-theme="dark"] {
    --bg-a: #060e22;
    --bg-b: #0e2748;
    --bg-c: #1a4a66;
    --card: rgba(13, 26, 48, 0.82);
    --card-line: rgba(255, 255, 255, 0.1);
    --text: #eef5ff;
    --muted: #9fb4d0;
    --field: rgba(255, 255, 255, 0.06);
    --field-line: rgba(255, 255, 255, 0.17);
    --gold: #f4c95d;
    --btn-a: #2bd1b0;
    --btn-b: #12a094;
    --btn-edge: #0a6a6a;
    --btn-text: #03201e;
    --metal: #e3ecf8;
    --metal-d: #9db2cf;
    --screen: #0b1730;
    --glow: #5ff0d4;
    --peci: #14151a;
    --skyline: #050b1a;
    --bubble: #ffffff;
    --bubble-text: #10243f;
  }
  .auth[data-theme="light"] {
    --bg-a: #6ec1f2;
    --bg-b: #b8e3fb;
    --bg-c: #fff0cc;
    --card: rgba(255, 255, 255, 0.84);
    --card-line: rgba(15, 42, 61, 0.08);
    --text: #0f2a3d;
    --muted: #506b80;
    --field: #ffffff;
    --field-line: #c6d9e7;
    --gold: #d9930d;
    --btn-a: #1ec2a2;
    --btn-b: #0c8f80;
    --btn-edge: #066a60;
    --btn-text: #ffffff;
    --metal: #ffffff;
    --metal-d: #b3c7d9;
    --screen: #17314d;
    --glow: #6ff5da;
    --peci: #1b1c22;
    --skyline: #5aa3b2;
    --bubble: #ffffff;
    --bubble-text: #0f2a3d;
  }

  .auth {
    position: relative;
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    justify-content: center;
    font-family: var(--body);
    color: var(--text);
    background: linear-gradient(180deg, var(--bg-a) 0%, var(--bg-b) 55%, var(--bg-c) 100%);
    overflow-x: hidden;
  }

  /* ---------- Langit ---------- */
  .sky {
    position: fixed;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .orb {
    position: absolute;
    top: 9%;
    left: 12%;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: transparent;
    box-shadow: inset -18px -6px 0 0 #f7e8b6, 0 0 40px rgba(247, 232, 182, 0.35);
    transition: all 0.6s ease;
  }
  .auth[data-theme="light"] .orb {
    background: radial-gradient(circle, #fff7c2 0%, #ffd84d 70%);
    box-shadow: inset 0 0 0 0 transparent, 0 0 70px 20px rgba(255, 216, 77, 0.55);
  }
  .star {
    position: absolute;
    border-radius: 50%;
    background: #fff;
    opacity: 0;
    transition: opacity 0.6s ease;
  }
  .auth[data-theme="dark"] .star {
    opacity: 0.85;
    animation: twinkle 3.2s ease-in-out infinite;
  }
  .cloud {
    position: absolute;
    height: 34px;
    background: #fff;
    border-radius: 40px;
    opacity: 0;
    transition: opacity 0.6s ease;
  }
  .cloud::before,
  .cloud::after {
    content: "";
    position: absolute;
    background: #fff;
    border-radius: 50%;
  }
  .cloud::before { width: 44px; height: 44px; top: -20px; left: 18px; }
  .cloud::after { width: 32px; height: 32px; top: -12px; right: 18px; }
  .c1 { width: 120px; top: 16%; left: -150px; }
  .c2 { width: 90px; top: 30%; left: -120px; }
  .c3 { width: 140px; top: 8%; left: -170px; }
  .auth[data-theme="light"] .cloud {
    opacity: 0.9;
    animation: drift 60s linear infinite;
  }
  .auth[data-theme="light"] .c2 { animation-duration: 85s; animation-delay: -30s; }
  .auth[data-theme="light"] .c3 { animation-duration: 110s; animation-delay: -70s; }
  .skyline {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 24vh;
    min-height: 120px;
    opacity: 0.9;
    transition: opacity 0.5s ease;
  }

  /* ---------- Tombol tema ---------- */
  .theme {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 20;
    width: 68px;
    height: 36px;
    border-radius: 999px;
    border: 2px solid var(--card-line);
    background: var(--card);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    cursor: pointer;
    padding: 0;
  }
  .theme:focus-visible { outline: 3px solid var(--gold); outline-offset: 3px; }
  .ico { position: absolute; top: 50%; transform: translateY(-50%); font-size: 15px; line-height: 1; }
  .sun { left: 9px; }
  .moon { right: 9px; }
  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--gold);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    transition: transform 0.35s cubic-bezier(0.3, 1.5, 0.5, 1);
  }
  .auth[data-theme="dark"] .knob { transform: translateX(32px); }

  /* ---------- Panggung ---------- */
  .stage {
    position: relative;
    z-index: 5;
    width: 100%;
    max-width: 400px;
    padding: 84px 20px 40px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .mascot {
    position: relative;
    z-index: 2;
    width: min(220px, 58vw);
    margin-bottom: -34px;
    animation: bob 4s ease-in-out infinite;
  }
  .robot { width: 100%; height: auto; display: block; overflow: visible; }

  .bubble {
    position: absolute;
    top: -62px;
    left: 50%;
    transform: translateX(-50%);
    width: max-content;
    max-width: min(300px, 86vw);
    padding: 9px 16px;
    border-radius: 18px;
    background: var(--bubble);
    color: var(--bubble-text);
    font-family: var(--display);
    font-weight: 600;
    font-size: 0.98rem;
    text-align: center;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    animation: pop 0.45s cubic-bezier(0.3, 1.6, 0.5, 1) both;
  }
  .bubble::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: -8px;
    width: 16px;
    height: 16px;
    background: var(--bubble);
    transform: translateX(-50%) rotate(45deg);
    border-radius: 3px;
  }

  /* gerak robot */
  .eye {
    transform-box: fill-box;
    transform-origin: center;
    animation: blink 5s infinite;
  }
  .arm {
    transform-box: view-box;
    transform-origin: 168px 152px;
    transition: transform 0.4s ease;
  }
  .arm.wave { animation: wave 0.7s ease-in-out infinite alternate; }
  .robot.sad .arm { transform: rotate(40deg); }
  .cover {
    opacity: 0;
    transform: translateY(26px);
    transition: opacity 0.3s ease, transform 0.35s cubic-bezier(0.3, 1.4, 0.5, 1);
  }
  .robot.shy .cover { opacity: 1; transform: translateY(0); }
  .robot.sad { animation: shake 0.5s ease 1; }

  /* ---------- Kartu ---------- */
  .card {
    position: relative;
    z-index: 3;
    width: 100%;
    box-sizing: border-box;
    padding: 28px 26px 24px;
    background: var(--card);
    border: 1px solid var(--card-line);
    border-radius: 28px;
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;
  }
  .logo-ring {
    flex: none;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    border: 2px solid var(--gold);
    background: var(--field);
    overflow: hidden;
  }
  .logo-ring img { width: 36px; height: 36px; object-fit: contain; }
  .mono { font-family: var(--display); font-weight: 800; font-size: 1.5rem; color: var(--gold); }
  .names { display: flex; flex-direction: column; line-height: 1.1; }
  .names strong { font-family: var(--display); font-size: 1.6rem; font-weight: 800; letter-spacing: 0.2px; }
  .names small { font-size: 0.82rem; color: var(--muted); font-weight: 600; margin-top: 2px; }

  h1 {
    margin: 0;
    font-family: var(--display);
    font-size: 1.35rem;
    font-weight: 700;
  }
  .sub { margin: 4px 0 18px; color: var(--muted); font-size: 0.92rem; }

  /* ---------- Form ---------- */
  .field { display: flex; flex-direction: column; margin-bottom: 14px; }
  .field label { font-size: 0.86rem; font-weight: 700; margin-bottom: 6px; color: var(--muted); }
  .field input {
    width: 100%;
    box-sizing: border-box;
    padding: 12px 14px;
    font: inherit;
    font-size: 0.97rem;
    color: var(--text);
    background: var(--field);
    border: 2px solid var(--field-line);
    border-radius: 14px;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .field input::placeholder { color: var(--muted); opacity: 0.7; }
  .field input:focus {
    border-color: var(--gold);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--gold) 25%, transparent);
  }

  .pw { position: relative; }
  .pw input { padding-right: 46px; }
  .peek {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    cursor: pointer;
    font-size: 1.05rem;
  }
  .peek:focus-visible { outline: 3px solid var(--gold); }

  .btn {
    width: 100%;
    margin-top: 6px;
    padding: 13px;
    border: 0;
    border-radius: 16px;
    font-family: var(--display);
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--btn-text);
    background: linear-gradient(180deg, var(--btn-a), var(--btn-b));
    box-shadow: 0 5px 0 var(--btn-edge), 0 12px 22px rgba(0, 0, 0, 0.25);
    cursor: pointer;
    transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.2s;
  }
  .btn:hover { filter: brightness(1.06); }
  .btn:active { transform: translateY(4px); box-shadow: 0 1px 0 var(--btn-edge), 0 6px 12px rgba(0, 0, 0, 0.25); }
  .btn:focus-visible { outline: 3px solid var(--gold); outline-offset: 3px; }
  .btn:disabled { opacity: 0.7; cursor: wait; }

  .msg {
    margin-top: 14px;
    padding: 10px 12px;
    border-radius: 12px;
    font-size: 0.88rem;
    font-weight: 600;
    text-align: center;
    background: rgba(34, 197, 94, 0.16);
    color: #22a35a;
    border: 1px solid rgba(34, 197, 94, 0.35);
  }
  .auth[data-theme="dark"] .msg { color: #5be394; }
  .msg.error {
    background: rgba(239, 68, 68, 0.14);
    color: #d93a3a;
    border-color: rgba(239, 68, 68, 0.35);
  }
  .auth[data-theme="dark"] .msg.error { color: #ff8a8a; }

  .alt { margin: 18px 0 0; text-align: center; font-size: 0.9rem; color: var(--muted); }
  .alt a { color: var(--gold); font-weight: 800; text-decoration: none; }
  .alt a:hover { text-decoration: underline; }

  /* ---------- Animasi ---------- */
  @keyframes twinkle { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.95; } }
  @keyframes drift { to { transform: translateX(calc(100vw + 320px)); } }
  @keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
  @keyframes wave { from { transform: rotate(-14deg); } to { transform: rotate(10deg); } }
  @keyframes blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.08); } }
  @keyframes pop { from { opacity: 0; transform: translateX(-50%) scale(0.6); } to { opacity: 1; transform: translateX(-50%) scale(1); } }
  @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }

  @media (prefers-reduced-motion: reduce) {
    .mascot, .arm.wave, .eye, .star, .cloud, .robot.sad, .bubble { animation: none !important; }
  }
  @media (max-width: 420px) {
    .stage { padding: 76px 14px 32px; }
    .card { padding: 24px 20px 20px; }
  }
</style>
