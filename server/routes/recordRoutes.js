import express from "express";

import {
  createRecordController,
  listRecordsController,
  getRecordController,
  updateRecordController,
  deleteRecordController,
} from "../controllers/recordController.js";

import {
  requireTableAccess,
  requireConfirmParam,
} from "../middleware/auth.js";

const router = express.Router();

router.post(
  "/:tableName/records",
  requireTableAccess(),
  createRecordController
);

router.get(
  "/:tableName/records",
  requireTableAccess(),
  listRecordsController
);

router.get(
  "/:tableName/records/:recordId",
  requireTableAccess(),
  getRecordController
);

router.put(
  "/:tableName/records/:recordId",
  requireTableAccess(),
  updateRecordController
);

router.delete(
  "/:tableName/records/:recordId",
  requireTableAccess(),
  requireConfirmParam,
  deleteRecordController
);

export default router;
