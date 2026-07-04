import express from "express";
import multer from "multer";

import {
  createTableController,
  listTablesController,
  describeTableController,
  renameTableController,
  deleteTableController,
  importCsvController,
} from "../controllers/tableController.js";

import {
  authorize,
  requireTableAccess,
  requireConfirmParam,
} from "../middleware/auth.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const router = express.Router();

// Creating/renaming/deleting tables is a schema-level, admin-only
// operation - employees get record-level CRUD on tables they're
// granted access to, not control over which tables exist.
router.post("/", authorize("admin"), createTableController);

router.get("/", listTablesController);

router.post(
  "/import-csv",
  authorize("admin"),
  upload.single("file"),
  importCsvController
);

router.get(
  "/:tableName",
  requireTableAccess(),
  describeTableController
);

router.put(
  "/:tableName/rename",
  authorize("admin"),
  renameTableController
);

router.delete(
  "/:tableName",
  authorize("admin"),
  requireConfirmParam,
  deleteTableController
);

export default router;
