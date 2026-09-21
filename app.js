const SUPABASE_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
const $ = (id) => document.getElementById(id);
let session = null;
let modeSignup = false;

const HEADLINES = [
  "The table is set for this hour.",
  "A single light left on.",
  "Something someone meant to say.",
  "Held up to the window.",
  "Printed before the ink dried.",
];
const EDITORIALS = [
  "Lumen Hour is a magazine with one chair. Every sixty minutes we clear it and seat a public note.",
  "If a piece is marked public it can be read by anyone, and it can be the hour.",
  "Private notes stay in the desk drawer. Public ones walk the floor.",
];

function hourSlot(d = new Date()) {
  const t = new Date(d);
  t.setMinutes(0, 0, 0);
  return t.toISOString();
}
const pad = (n) => String(n).padStart(2, "0");

function tick() {
  const now = new Date();
  $("clock-time").textContent =
    pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds());
  const next = new Date(now);
  next.setHours(now.getHours() + 1, 0, 0, 0);
  const left = Math.max(0, next - now);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  $("clock-left").textContent = m + "m " + pad(s) + "s until the next hour";
  $("slot-label").textContent = "Hour slot " + hourSlot();
  const bar = $("hour-bar");
  if (bar) bar.style.width = ((3600000 - left) / 3600000) * 100 + "%";
}

function show(view) {
  ["home", "wall", "desk"].forEach((v) => {
    $("view-" + v).classList.toggle("hidden", v !== view);
  });
  document.querySelectorAll("[data-nav]").forEach((b) => {
    b.classList.toggle("on", b.dataset.nav === view);
  });
  if (view === "wall") loadWall();
  if (view === "desk") loadMine();
}

document.querySelectorAll("[data-nav]").forEach((b) => {
  b.addEventListener("click", (e) => {
    e.preventDefault();
    show(b.dataset.nav);
  });
});

function setAuthUI() {
  const in_ = !!session;
  $("auth-open").classList.toggle("hidden", in_);
  $("sign-out").classList.toggle("hidden", !in_);
  document.querySelectorAll(".needs-auth").forEach((el) => el.classList.toggle("hidden", !in_));
}

async function ensureProfile(user) {
  const handle =
    (user.user_metadata && user.user_metadata.handle) ||
    (user.email || "reader").split("@")[0].slice(0, 20);
  const { data } = await sb.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (!data) {
    await sb.from("profiles").insert({
      id: user.id,
      handle: handle.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24) || "reader",
      display_name: handle,
    });
  }
}

async function refreshSession() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  if (session) await ensureProfile(session.user);
  setAuthUI();
  await loadHour();
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function noteCard(n, i, mine) {
  const who = n.profiles ? n.profiles.handle || n.profiles.display_name : "anonymous";
  const actions = mine
    ? `<div class="row">
        <button class="text-btn" data-toggle="${n.id}" data-pub="${n.is_public}">${n.is_public ? "make private" : "make public"}</button>
        <button class="text-btn" data-del="${n.id}">delete</button>
      </div>`
    : "";
  return `<article class="card" style="--i:${i}">
    <h3>${escapeHtml(n.title)}</h3>
    <p>${escapeHtml(n.body)}</p>
    <span class="pill">${n.is_public ? "public" : "private"} · ${escapeHtml(who || "")}</span>
    ${actions}
  </article>`;
}

async function loadWall() {
  const { data, error } = await sb
    .from("notes")
    .select("id,title,body,is_public,created_at,user_id,profiles(handle,display_name)")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(48);
  const wall = $("wall");
  if (error) {
    wall.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    return;
  }
  if (!data || !data.length) {
    wall.innerHTML = `<p class="muted">The wall is empty. Publish a public note from your desk.</p>`;
    return;
  }
  wall.innerHTML = data.map((n, i) => noteCard(n, i, false)).join("");
}

async function loadMine() {
  if (!session) return;
  const u = session.user;
  $("who").textContent = u.email;
  const { data } = await sb
    .from("notes")
    .select("id,title,body,is_public,created_at,user_id,profiles(handle,display_name)")
    .eq("user_id", u.id)
    .order("created_at", { ascending: false });
  $("mine").innerHTML = (data || []).map((n, i) => noteCard(n, i, true)).join("") || `<p class="muted">Nothing on the desk yet.</p>`;
  $("mine").querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.onclick = async () => {
      const pub = btn.dataset.pub === "true";
      await sb.from("notes").update({ is_public: !pub }).eq("id", btn.dataset.toggle);
      loadMine();
      loadHour();
    };
  });
  $("mine").querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm("Delete this note?")) return;
      await sb.from("notes").delete().eq("id", btn.dataset.del);
      loadMine();
    };
  });
}

async function pickFeaturedNote() {
  const { data } = await sb
    .from("notes")
    .select("id,title,body,user_id,featured_at,profiles(handle,display_name)")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(40);
  if (!data || !data.length) return null;
  const unfeatured = data.filter((n) => !n.featured_at);
  const pool = unfeatured.length ? unfeatured : data;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function ensureHour() {
  const slot = hourSlot();
  const { data: existing } = await sb
    .from("hours")
    .select("*, notes(*, profiles(handle,display_name))")
    .eq("slot", slot)
    .maybeSingle();
  if (existing) return existing;

  const note = await pickFeaturedNote();
  const headline = HEADLINES[new Date().getHours() % HEADLINES.length];
  const editorial = EDITORIALS[new Date().getHours() % EDITORIALS.length];

  if (!session) return { headline, editorial, notes: note };

  const { data: inserted, error } = await sb
    .from("hours")
    .insert({ slot, headline, editorial, featured_note_id: note ? note.id : null })
    .select("*, notes(*, profiles(handle,display_name))")
    .maybeSingle();
  if (error) {
    const { data: again } = await sb
      .from("hours")
      .select("*, notes(*, profiles(handle,display_name))")
      .eq("slot", slot)
      .maybeSingle();
    return again || { headline, editorial, notes: note };
  }
  if (note) await sb.from("notes").update({ featured_at: new Date().toISOString() }).eq("id", note.id);
  return inserted;
}

async function loadHour() {
  const hour = await ensureHour();
  if (!hour) return;
  $("hour-headline").textContent = hour.headline || HEADLINES[0];
  $("hour-editorial").textContent = hour.editorial || EDITORIALS[0];
  const note = hour.notes;
  const box = $("feature");
  if (!note) {
    box.innerHTML = `<p class="muted">No public notes this hour. Sign in, write one, mark it public.</p>`;
    return;
  }
  const who = note.profiles ? note.profiles.handle || note.profiles.display_name : "a reader";
  box.innerHTML = `<p class="byline">Featured · ${escapeHtml(who)}</p>
    <h3>${escapeHtml(note.title)}</h3>
    <p>${escapeHtml(note.body)}</p>`;
}

$("note-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!session) return;
  const fd = new FormData(e.target);
  const { error } = await sb.from("notes").insert({
    user_id: session.user.id,
    title: String(fd.get("title")).trim(),
    body: String(fd.get("body")).trim(),
    is_public: fd.get("is_public") === "on",
  });
  if (error) {
    alert(error.message);
    return;
  }
  e.target.reset();
  await loadMine();
  await loadHour();
});

$("auth-open").onclick = () => $("auth-sheet").classList.remove("hidden");
$("auth-close").onclick = () => $("auth-sheet").classList.add("hidden");
$("auth-toggle").onclick = () => {
  modeSignup = !modeSignup;
  $("auth-title").textContent = modeSignup ? "Make a desk" : "Welcome back";
  $("auth-submit").textContent = modeSignup ? "Create account" : "Sign in";
  $("auth-toggle").textContent = modeSignup ? "Already have one?" : "Need an account?";
  $("handle-field").classList.toggle("hidden", !modeSignup);
};
$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("auth-err").textContent = "";
  const fd = new FormData(e.target);
  const email = String(fd.get("email"));
  const password = String(fd.get("password"));
  const handle = String(fd.get("handle") || "").trim();
  let error;
  if (modeSignup) {
    const res = await sb.auth.signUp({ email, password, options: { data: { handle } } });
    error = res.error;
    if (!error && res.data.user) await ensureProfile(res.data.user);
    if (!error && !res.data.session) {
      $("auth-err").textContent = "Account created. If email confirmation is on, check your inbox, then sign in.";
      return;
    }
  } else {
    const res = await sb.auth.signInWithPassword({ email, password });
    error = res.error;
  }
  if (error) {
    $("auth-err").textContent = error.message;
    return;
  }
  $("auth-sheet").classList.add("hidden");
  await refreshSession();
  show("desk");
});
$("sign-out").onclick = async () => {
  await sb.auth.signOut();
  session = null;
  setAuthUI();
  show("home");
};

sb.auth.onAuthStateChange((_e, s) => {
  session = s;
  setAuthUI();
});

tick();
setInterval(tick, 1000);
refreshSession();
show("home");
setInterval(loadHour, 60 * 1000);
