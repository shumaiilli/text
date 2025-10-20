// server.js －－ ESM版
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import cors from "cors";
import OpenAI, { toFile } from "openai";

const app = express();
app.use(cors());
app.use(express.json());

const __dirname = path.resolve(".");
const PORT = process.env.PORT || 3000;

// ===== Multer: 一時保存 + 受け付けMIME（video/* と audio/*） =====
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(__dirname, "tmp")),
    filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`)
  }),
  limits: { fileSize: 512 * 1024 * 1024 }, // 512MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("video/") || file.mimetype.startsWith("audio/")) {
      return cb(null, true);
    }
    cb(new Error("動画/音声ファイルのみアップロードできます"));
  }
});

// tmpフォルダ作成（無ければ）
try { fs.mkdirSync(path.join(__dirname, "tmp"), { recursive: true }); } catch {}

// ===== OpenAI クライアント =====
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ヘルスチェック
app.get("/health", (_req, res) => res.json({ ok: true }));

// ===== ここが本体：字幕生成（SRT） =====
app.post("/transcribe", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "file is required" });

  const tempPath = req.file.path;
  try {
    // 1) 拡張子を“明示”してアップロード（←ここが重要）
    const fileForUpload = await toFile(
      fs.createReadStream(tempPath),
      req.file.originalname || "audio.mp4"
    );

    // 2) Whisper に SRT を要求
    const raw = await client.audio.transcriptions.create({
      file: fileForUpload,
      model: "whisper-1",
      response_format: "srt"
    });

    // 3) 返却の揺れを吸収（文字列 or {text:"..."})
    const srt = typeof raw === "string" ? raw : (raw?.text ?? "");
    if (!srt) throw new Error("SRTが空でした（変換結果なし）");

    // 4) text/plain で返す（フロントはJSON/テキストどちらも対応）
    res.type("text/plain; charset=utf-8").send(srt);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "transcribe failed" });
  } finally {
    // 一時ファイルは削除
    try { fs.unlinkSync(tempPath); } catch {}
  }
});

// （任意）フロントを同居させたい場合は以下を有効化：
// app.use(express.static(__dirname)); // index.html 等を同一URLで配信

app.listen(PORT, () => {
  console.log(`🚀 server on : http://localhost:${PORT}`);
});
