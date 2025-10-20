const fileInput = document.getElementById("fileInput");
const player = document.getElementById("player");
const submitBtn = document.getElementById("submitBtn");
const downloadBtn = document.getElementById("downloadBtn");
const log = document.getElementById("log");
const progress = document.getElementById("progress");
const statusEl = document.getElementById("status");
const srtPreview = document.getElementById("srtPreview");
const duration = document.getElementById("duration");
const filesize = document.getElementById("filesize");

const API_BASE = "https://text-nspj.onrender.com"; // 必要に応じて変更

// ファイル選択時の処理
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  player.src = url;

  filesize.textContent = (file.size / 1024 / 1024).toFixed(2) + " MB";

  player.onloadedmetadata = () => {
    duration.textContent = (player.duration / 60).toFixed(1) + " 分";
  };

  submitBtn.disabled = false;
  log.textContent = "ファイル読み込み完了";
});

// 字幕生成ボタン
submitBtn.addEventListener("click", async () => {
  const file = fileInput.files[0];
  if (!file) return alert("ファイルを選択してください");

  const formData = new FormData();
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

    const data = isJson ? await res.json() : { srt: await res.text() };
    if (!data?.srt) throw new Error("SRTの取得に失敗しました");

    srtPreview.textContent = data.srt;
    log.textContent = "変換完了 ✅";
    statusEl.textContent = "完了";
    downloadBtn.style.display = "inline-block";

    // SRT ダウンロード
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

// === 字幕プレビュー機能追加 ===
const subOverlay = document.getElementById("subOverlay");
const subText = document.getElementById("subText");
let cues = [];
let lastIndex = -1;

function parseSRT(srt) {
  const blocks = srt.replace(/\r/g,'').trim().split(/\n\s*\n/);
  return blocks.map(b => {
    const lines = b.split('\n');
    if (/^\d+$/.test(lines[0])) lines.shift();
    const m = lines[0].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/);
    const toSec = (h,m,s,ms)=>(((+h*60)+(+m))*60+(+s))+ms/1000;
    const start = toSec(m[1],m[2],m[3],m[4]);
    const end   = toSec(m[5],m[6],m[7],m[8]);
    const text  = lines.slice(1).join('\n');
    return { start, end, text };
  }).filter(Boolean);
}

// 動画時間と同期して表示
player.addEventListener("timeupdate", () => {
  const t = player.currentTime;
  let i = lastIndex;
  if (i < 0 || i >= cues.length || t < cues[i].start || t > cues[i].end) {
    i = cues.findIndex(c => t >= c.start && t <= c.end);
  }
  if (i !== lastIndex) {
    lastIndex = i;
    subText.textContent = i >= 0 ? cues[i].text : "";
  }
});

// SRTを受け取った時に呼ぶ関数
function onSrtReady(srtText) {
  cues = parseSRT(srtText);
  lastIndex = -1;
}

