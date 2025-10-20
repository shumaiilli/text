// -------------------------------
// 自動字幕サーバー（OpenAI Whisper API使用・実用版）
// -------------------------------
// セットアップ：
// 1. npm i
// 2. プロジェクト直下に .env を作成し、OPENAI_API_KEY=sk-xxxx を記載
// 3. npm start
// 4. 別途 index.html を http サーバで配信（例: npx http-server . -p 5173）
// -------------------------------

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import multer from "multer";
import cors from "cors";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// アップロード先を確保
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ファイル制限（必要に応じて調整）
const upload = multer({
  dest: UPLOAD_DIR,
  limits: {
    // 例: 512MB 上限（Whisperは長尺OKですがアップロード回線やメモリを考慮）
    fileSize: 512 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    // video/* のみ許可
    if (file.mimetype.startsWith("video/")) return cb(null, true);
    cb(new Error("動画ファイルのみアップロードできます"));
  }
});

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/transcribe", upload.single("video"), async (req, res) => {
  const cleanup = () => {
    try {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    } catch {}
  };

  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY が設定されていません (.env を確認)");
    }
    if (!req.file) throw new Error("ファイルが受信されていません");

    console.log("🎥 受信:", req.file.originalname, req.file.mimetype, req.file.size, "bytes");

// Whisper へ送信（SRT）
const raw = await client.audio.transcriptions.create({
  file: fs.createReadStream(req.file.path),
  model: "whisper-1",
  response_format: "srt"
});

// 返却の揺れを吸収：文字列 or {text:"..."} の両方に対応
const srt = typeof raw === "string" ? raw : (raw?.text ?? "");
if (!srt) throw new Error("SRTが空でした（変換結果なし）");

console.log("✅ 変換完了 (SRT)");
// フロントは content-type を見て JSON/テキストを自動判定する実装なので、どちらでもOK
// テキストで返す:
res.type("text/plain; charset=utf-8").send(srt);
// JSONで返したい場合は代わりに:
// res.json({ srt });

  } catch (err) {
    console.error("❌ 変換エラー:", err);
    res.status(500).json({ error: String(err?.message || err) });
  } finally {
    cleanup();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 サーバー起動: http://localhost:${PORT}`);
});

