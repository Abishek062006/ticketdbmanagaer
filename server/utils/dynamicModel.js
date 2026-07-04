import mongoose from "mongoose";

const modelCache = new Map();

export const physicalCollectionName = (tableName) => {
  return `tbl_${tableName}`;
};

export const getDynamicModel = (tableName) => {
  if (modelCache.has(tableName)) {
    return modelCache.get(tableName);
  }

  const collectionName = physicalCollectionName(tableName);

  const dynamicSchema = new mongoose.Schema(
    {},
    {
      strict: false,
      timestamps: true,
    }
  );

  const model = mongoose.model(
    collectionName,
    dynamicSchema,
    collectionName
  );

  modelCache.set(tableName, model);

  return model;
};

export const invalidateDynamicModel = (tableName) => {
  const collectionName = physicalCollectionName(tableName);

  if (mongoose.models[collectionName]) {
    mongoose.deleteModel(collectionName);
  }

  modelCache.delete(tableName);
};
