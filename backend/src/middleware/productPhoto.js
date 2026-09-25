import multer from "multer";
import { stallStore } from "../data/marketStore.js";
import { savePhoto } from "../services/photoStorage.js";

export { productPhotoDirectory } from "../services/photoStorage.js";
const parsePhoto = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } }).single("image");

// Identify the format from the file's own bytes, not the client-supplied type.
const detectImage = (buffer, mimetype) => {
  if (mimetype === "image/png" && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { extension: "png", contentType: "image/png" };
  if (mimetype === "image/jpeg" && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return { extension: "jpg", contentType: "image/jpeg" };
  if (mimetype === "image/webp" && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return { extension: "webp", contentType: "image/webp" };
  return null;
};

/**
 * Read one image from the multipart field "image" (max 5 MB; JPG, PNG or WebP).
 * Resolves { buffer, type }, or null after already sending a 400 response.
 */
export const readImageUpload = (req, res) => new Promise((resolve) => {
  parsePhoto(req, res, (error) => {
    const reject = (message) => { res.status(400).json({ error: message }); resolve(null); };
    if (error) return reject(error.code === "LIMIT_FILE_SIZE" ? "Choose a photo smaller than 5 MB." : "Upload one photo at a time.");
    if (!req.file) return reject("Choose a photo.");
    const type = detectImage(req.file.buffer, req.file.mimetype);
    if (!type) return reject("Choose a JPG, PNG, or WebP photo.");
    resolve({ buffer: req.file.buffer, type });
  });
});

export const uploadProductPhoto = async (req, res, next) => {
  try {
    const stall = await stallStore.getMy(req.user.id);
    if (!stall || !["approved", "active"].includes(stall.status)) return res.status(403).json({ error: "An approved stall is required to upload product photos." });
    const image = await readImageUpload(req, res);
    if (!image) return;
    res.status(201).json({ image_url: await savePhoto(image.buffer, image.type) });
  } catch (error) { next(error); }
};
