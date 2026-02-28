import multer from "multer";
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { parseSchedulePdfForPreview } from "../services/scheduleImportService";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
});

router.use(requireAuth);

router.post(
  "/schedule",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;

    if (!file) {
      res.status(400).json({ message: "Adjunta un archivo PDF en el campo file." });
      return;
    }

    const isPdf =
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      res.status(400).json({ message: "El archivo debe ser un PDF." });
      return;
    }

    const preview = await parseSchedulePdfForPreview(file.buffer);

    if (preview.courses.length === 0) {
      res.status(422).json({
        message:
          "No se detectaron materias en el PDF. Revisa que sea el horario oficial con texto seleccionable.",
        warnings: preview.warnings,
        hints: [
          "Sube un PDF exportado directamente desde la plataforma (evita fotos o escaneos borrosos).",
          "Si tu PDF no se reconoce, usa la importacion por Excel/CSV desde Materias.",
        ],
      });
      return;
    }

    res.json(preview);
  }),
);

export { router as importsRoutes };
