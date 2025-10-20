// server.js －－ CommonJS版
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const OpenAI = require("openai");
const { toFile } = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

const __dirname = path.resolve(".");
const PORT = process.env.PORT || 3000;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(__dirname, "tmp")),
    filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`)
  }),
  limits: { fileSize: 512 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("video/") || file.mimetype.startsWith("audio/")) {
      return cb(null, true);
    }
    cb(new Error("動画/音声ファイルのみアップロードできます"));
  }
});
try { fs.mkdirSync(path.join(__dirname, "tmp"), { recursive: true }); } catch {}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/transcribe", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "file is required" });
  const tempPath = req.file.path;

  try {
    const fileForUpload = await toFile(
      fs.createReadStream(tempPath),
      req.file.originalname || "audio.mp4"
    );
    const raw = await client.audio.transcriptions.create({
      file: fileForUpload,
      model: "whisper-1",
      response_format: "srt"
    });
    const srt = typeof raw === "string" ? raw : (raw?.text ?? "");
    if (!srt) throw new Error("SRTが空でした（変換結果なし）");

    res.type("text/plain; charset=utf-8").send(srt);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "transcribe failed" });
  } finally {
    try { fs.unlinkSync(tempPath); } catch {}
  }
});

// app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`🚀 server on : http://localhost:${PORT}`);
});
