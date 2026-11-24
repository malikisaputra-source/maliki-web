// kredit-maliki: Template oleh Maliki Saputra (@malikisaputra) — https://malikisaputra.biz.id · Lisensi Nonkomersial Maliki Studio 1.0: dilarang dijual ulang.
// Lapisan platform: tampilan yang sama jalan di desktop (server lokal), Android (jembatan WebView), atau browser biasa.
const Inang = (() => {
  const android = window.MalikiAndroid;
  const desktop = !android && !window.MALIKI_ONLINE && /^https?:$/.test(location.protocol) && /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  const jenis = android ? 'android' : desktop ? 'desktop' : 'browser';
  let n = 0;
  const tunggu = {};
  window.__balasAndroid = (id, ok, isi) => {
    const t = tunggu[id];
    if (!t) return;
    delete tunggu[id];
    ok ? t.res(isi) : t.rej(new Error(isi));
  };
  const panggil = (fn, arg) => new Promise((res, rej) => {
    const id = ++n;
    tunggu[id] = {res, rej};
    android[fn](id, JSON.stringify(arg || {}));
  });
  async function api(jalur, d) {
    let r;
    try { r = await fetch(jalur, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(d || {})}); }
    catch { throw new Error('Mesin aplikasi mati atau tertutup. Tutup aplikasi ini lalu buka ulang.'); }
    const j = await r.json().catch(() => ({ok: false, pesan: 'Mesin aplikasi tidak menjawab. Tutup aplikasi ini lalu buka ulang.'}));
    if (!j.ok) throw new Error(j.pesan || 'Gagal');
    return j;
  }
  function pesanGalat(kode, teks) {
    if (kode === 503 || kode === 500) return 'Server AI sedang sibuk (banyak pengguna). Coba lagi beberapa menit lagi.';
    if (kode === 429) return 'Kuota AI habis untuk sementara (batas gratis Gemini per menit/hari). Tunggu sebentar atau coba besok, atau ganti model di Pengaturan (mis. gemini-flash-lite-latest).';
    if (kode === 400 && /API key/i.test(teks)) return 'Kunci API tidak valid. Periksa lagi di Pengaturan.';
    if (kode === 403) return 'Kunci API ditolak (tidak punya izin). Buat kunci baru di aistudio.google.com/apikey.';
    if (kode === 404) return 'Model AI tidak ditemukan. Kosongkan nama model di Pengaturan untuk memakai bawaan.';
    return `AI membalas ${kode}: ${String(teks).slice(0, 200)}`;
  }
  async function http(url, header, body) {
    if (android) {
      const j = JSON.parse(await panggil('http', {url, header, body: JSON.stringify(body)}));
      if (j.status >= 400) throw new Error(pesanGalat(j.status, j.teks));
      return JSON.parse(j.teks);
    }
    let r;
    for (let coba = 0; coba < 3; coba++) {  // server sibuk (503) → tunggu sebentar lalu ulangi
      r = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json', ...header}, body: JSON.stringify(body)});
      if (r.status !== 503 && r.status !== 500) break;
      await new Promise((ok) => setTimeout(ok, 2500 * (coba + 1)));
    }
    if (!r.ok) throw new Error(pesanGalat(r.status, await r.text()));
    return r.json();
  }
  async function ai(set, prompt) {
    return jagaKlaim(await aiMentah(set, prompt), prompt);
  }
  // Penjaga: harga (Rp), persen, dan angka "ribu/juta/+ pelanggan" yang tidak ada di permintaan pengguna dibuang
  function jagaKlaim(teks, prompt) {
    const ada = (x) => prompt.includes(x.trim());
    return teks
      .replace(/\s?Rp\s?\d[\d.,]*(\s?(ribu|rb|juta|jt|k)\b)?/gi, (m) => ada(m) ? m : '')
      .replace(/\s?\b\d+([.,]\d+)?\s?%/g, (m) => ada(m) ? m : '')
      .replace(/\b\d[\d.,]*\s?(?:ribu|rb|juta|jt)?\+?\s(?=(pelanggan|pembeli|klien|followers|pengikut|terjual)\b)/gi, (m) => ada(m) ? m : '');
  }
  async function aiMentah(set, prompt) {
    if (desktop) return (await api('/api/ai', {...set, prompt})).teks;
    if (set.penyedia === 'gemini') {
      if (!set.kunci) throw new Error('Kunci Gemini belum diisi (Pengaturan).');
      const model = set.model || 'gemini-3.8-flash';
      const j = await http(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {'x-goog-api-key': set.kunci},
        {contents: [{parts: [{text: prompt}]}]});
      return j.candidates[0].content.parts.map((p) => p.text || '').join('');
    }
    if (set.penyedia === 'openai') {
      const url = (set.url || 'http://localhost:11434/v1').replace(/\/$/, '') + '/chat/completions';
      const j = await http(url, {Authorization: `Bearer ${set.kunci || 'ollama'}`}, {model: set.model || 'gemma3:4b', messages: [{role: 'user', content: prompt}]});
      return j.choices[0].message.content;
    }
    throw new Error('Langganan (Claude Code/Codex/OpenCode) hanya bisa dari aplikasi desktop.');
  }
  async function simpan(nama, base64, mime) {
    if (desktop) return (await api('/api/simpan', {nama, isi: base64})).jalur;
    if (android) return panggil('simpan', {nama, isi: base64, mime});
    const a = document.createElement('a');
    a.href = `data:${mime};base64,${base64}`;
    a.download = nama;
    a.click();
    return nama;
  }
  async function info() {
    if (desktop) return api('/api/info');
    return {desktop: false, cli: {}};
  }
  async function bukaUrl(url) {
    if (desktop) return api('/api/buka-url', {url});
    if (android) { location.href = url; return; }
    window.open(url, '_blank', 'noopener');
  }
  return {jenis, api, panggil, ai, simpan, info, bukaUrl};
})();

// Utilitas bersama
const keBase64 = (u8) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const dariBase64 = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
const teksKeBase64 = (t) => keBase64(new TextEncoder().encode(t));
function ambilJSON(teks) {
  const t = teks.replace(/```(json)?/g, '');
  const a = Math.min(...['[', '{'].map((c) => (t.indexOf(c) < 0 ? 1e9 : t.indexOf(c))));
  const z = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
  if (a === 1e9 || z < a) throw new Error('Jawaban AI bukan JSON. Coba lagi.');
  return JSON.parse(t.slice(a, z + 1));
}
