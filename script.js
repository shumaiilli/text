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
