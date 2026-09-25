import { Router as ProductRouter } from "express";
import {
  getProducts, getProduct, createProduct, updateProduct,
  deleteProduct, getRecommendations, getSimilar, getPickupLocations,
} from "../controllers/product.controller.js";
import { verifyToken, requireRole, optionalAuth } from "../middleware/auth.js";
import { validate, productSchema, productUpdateSchema } from "../middleware/validate.js";
import { uploadProductPhoto } from "../middleware/productPhoto.js";
 
const productRouter = ProductRouter();
productRouter.post("/image", verifyToken, requireRole("seller"), uploadProductPhoto);
 
productRouter.get("/", optionalAuth, getProducts);
productRouter.get("/locations", getPickupLocations);
productRouter.get("/recommendations/:userId", verifyToken, getRecommendations);
productRouter.get("/similar/:productId", getSimilar);
productRouter.get("/:id", optionalAuth, getProduct);
productRouter.post("/", verifyToken, requireRole("seller"), validate(productSchema), createProduct);
productRouter.put("/:id", verifyToken, requireRole("seller", "admin"), validate(productUpdateSchema), updateProduct);
productRouter.delete("/:id", verifyToken, requireRole("seller", "admin"), deleteProduct);
 
export { productRouter as default };
