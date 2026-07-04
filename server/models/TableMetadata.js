import mongoose from "mongoose";

const columnSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      required: true,
      enum: [
        "String",
        "Number",
        "Boolean",
        "Date",
        "Mixed",
      ],
    },

    nullable: {
      type: Boolean,
      default: true,
    },

    defaultValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    _id: false,
  }
);

const tableMetadataSchema = new mongoose.Schema(
  {
    tableName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    displayName: {
      type: String,
      required: true,
      trim: true,
    },

    columns: {
      type: [columnSchema],
      default: [],
    },

    // True only for the reserved "employees" table - the collection
    // that doubles as the login/identity source. Drives password
    // hashing/masking and access-control enforcement elsewhere.
    isIdentityTable: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("TableMetadata", tableMetadataSchema);