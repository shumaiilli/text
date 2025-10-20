// ========== 要素参照 ==========
const fileInput   = document.getElementById("fileInput");
const player      = document.getElementById("player");
const submitBtn   = document.getElementById("submitBtn");
const downloadBtn = document.getElementById("downloadBtn");
const log         = document.getElementById("log");
const progress    = document.getElementById("progress");
const statusEl    = document.getElementById("status");
const srtPreview  = document.getElementById("srtPreview");
const durationEl  = document.getElementById("duration");
const filesizeEl  = document.getElementById("filesize");
const endpointEl  = document.getElementById("endpoint");

// 字幕オーバーレイ用
const subOverlay    = document.getElementById("subOverlay");
const subText       = document.getElementById("subText");
const toggleOverlay = document.getElementById("toggleOverlay");
const fontUp        = document.getElementById("fontUp");
const fontDown      = document.getElementById("fontDown");

// ========== 設定（APIのURLをあなたのWeb Serviceに変更） ==========
const API_BASE = "https://text-nspj.onrender.com"; // ← あなたのAPI(Web Service)のURLに
if (endpointEl) endpointEl.textContent = `${API_BASE}/transcribe`;

// ========== 状態 ==========
let cues = [];      // {start,end,text}[]
let lastIndex = -1; // 直前に表示していた字幕のインデックス

// ========== ユーティリティ ==========
function humanMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

// SRT → {start, end, text}[]
function parseSRT(srt) {
  const blocks = srt.replace(/\r/g, "").trim().split(/\n\s*\n/);
  return blocks.map((b) => {
    const lines = b.split("\n");
    if (/^\d+$/.test(lines[0])) lines.shift(); // 先頭の連番は捨てる
    const m = lines[0].match(
      /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
    );
    if (!m) return null;
    const toSec = (h, m, s, ms) => (((+h * 60) + (+m)) * 60 + (+s)) + (+ms) / 1000;
    const start = toSec(m[1], m[2], m[3], m[4]);
    const end   = toSec(m[5], m[6], m[7], m[8]);
    const text  = lines.slice(1).join("\n");
    return { start, end, text };
  }).filter(Boolean);
}

// 受け取ったSRTをオーバーレイに反映
function onSrtReady(srtText) {
  cues = parseSRT(srtText);
  lastIndex = -1;
  if (toggleOverlay) {
    subOverlay.style.display = toggleOverlay.checked ? "flex" : "none";
  }
}

// ========== イベント：ファイル選択 ==========
fileInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  player.src = url;

  filesizeEl.textContent = humanMB(file.size);

  player.onloadedmetadata = () => {
    durationEl.textContent = (player.duration / 60).toFixed(1) + " 分";
  };

  submitBtn.disabled = false;
  log.textContent = "ファイル読み込み完了";
});

// ========== イベント：字幕生成（アップロード→変換） ==========
submitBtn.addEventListener("click", async () => {
  const file = fileInput.files?.[0];
  if (!file) return alert("ファイルを選択してください");

  const formData = new FormData();
  // ← サーバー側の multer.single("file") に合わせて "file" で送る
  formData.append("file", file);

  log.textContent = "アップロード中...";
  progress.style.display = "block";
  statusEl.textContent = "送信中...";

  try {
    const res = await fetch(`${API_BASE}/transcribe`, {
      method: "POST",
      body: formData
    });

    const isJson = res.headers.get("content-type")?.includes("application/json");

    if (!res.ok) {
      let msg = `サーバーエラー ${res.status}`;
      if (isJson) {
        const j = await res.json().catch(() => null);
        if (j?.error) msg += `\n詳細: ${j.error}`;
      }
      throw new Error(msg);
    }

    // JSON でも text/plain でも対応
    const data = isJson ? await res.json() : { srt: await res.text() };
    if (!data?.srt) throw new Error("SRTの取得に失敗しました");

    // ▼ 自動でオーバーレイに反映（毎回1行足す必要なし）
    onSrtReady(data.srt);

    // 既存プレビュー＆DL
    srtPreview.textContent = data.srt;
    log.textContent = "変換完了 ✅";
    statusEl.textContent = "完了";
    downloadBtn.style.display = "inline-block";

    downloadBtn.onclick = () => {
      const blob = new Blob([data.srt], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "transcript.srt";
      a.click();
    };
  } catch (err) {
    console.error(err);
    log.textContent = "エラー: " + (err?.message || err);
    statusEl.textContent = "失敗 ❌";
  } finally {
    progress.style.display = "none";
  }
});

// ========== オーバーレイ表示：動画の時間に合わせて字幕切替 ==========
player.addEventListener("timeupdate", () => {
  if (toggleOverlay && !toggleOverlay.checked) return;
  if (!cues.length) { subText.textContent = ""; return; }

  const t = player.currentTime;
  let i = lastIndex;

  if (i < 0 || i >= cues.length || t < cues[i].start || t > cues[i].end) {
    // 二分探索（簡易版）
    let lo = 0, hi = cues.length - 1; i = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (t < cues[mid].start) hi = mid - 1;
      else if (t > cues[mid].end) lo = mid + 1;
      else { i = mid; break; }
    }
  }

  if (i !== lastIndex) {
    lastIndex = i;
    subText.textContent = (i >= 0) ? cues[i].text : "";
  }
});

// ========== オーバーレイのON/OFF & 文字サイズ調整 ==========
toggleOverlay?.addEventListener("change", () => {
  subOverlay.style.display = toggleOverlay.checked ? "flex" : "none";
});

function tweakFont(delta) {
  const cur = parseFloat(getComputedStyle(subText).fontSize);
  subText.style.fontSize = Math.max(12, cur + delta * 2) + "px";
}
fontUp?.addEventListener("click",  () => tweakFont(1));
fontDown?.addEventListener("click",()=> tweakFont(-1));

// ========== キーボードショートカット（任意：快適操作） ==========
document.addEventListener("keydown", (e) => {
  if (["INPUT","TEXTAREA"].includes(e.target.tagName)) return;
  if (e.key === "k") { player.paused ? player.play() : player.pause(); }
  if (e.key === "j") { player.playbackRate = Math.max(0.5, player.playbackRate - 0.25); }
  if (e.key === "l") { player.playbackRate = Math.min(2.0, player.playbackRate + 0.25); }
  if (e.key === "i") player.currentTime = Math.max(0, player.currentTime - 0.1);
  if (e.key === "o") player.currentTime += 0.1;
});
