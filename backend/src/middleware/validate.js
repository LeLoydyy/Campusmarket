import { z } from "zod";

/**
 * Creates an Express middleware that validates req.body against a Zod schema.
 * Returns 400 with formatted errors if validation fails.
 */
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return res.status(400).json({ error: "Validation failed", details: errors });
  }
  req.body = result.data; // use parsed/coerced data
  next();
};

// ── Shared schemas ────────────────────────────────────────────────────────────

// New accounts must use a campus mailbox; existing accounts (e.g. administrators) may sign in with any.
export const CAMPUS_EMAIL_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || "csucc.edu.ph").toLowerCase();
const campusEmail = z.string().trim().email("Enter a valid email address.").toLowerCase()
  .refine((value) => value.endsWith(`@${CAMPUS_EMAIL_DOMAIN}`), `Use your @${CAMPUS_EMAIL_DOMAIN} email address.`);
const otpCode = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.");

export const sendCodeSchema = z.object({ email: campusEmail });
export const verifyEmailSchema = z.object({ email: campusEmail, code: otpCode });

export const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: campusEmail,
  email_token: z.string().min(1, "Confirm your email with the code we sent you."),
  password: z.string().min(8).max(100)
    .regex(/[a-z]/i, "Password needs at least one letter.")
    .regex(/\d/, "Password needs at least one number."),
  security_question: z.string().trim().min(5).max(150),
  security_answer: z.string().trim().min(2, "Security answer is too short.").max(100),
  role: z.enum(["buyer", "seller"]).default("buyer"),
  campus_id: z.string().trim().min(3).max(50),
  affiliation: z.enum(["student", "faculty", "employee"]),
  department: z.string().trim().min(2).max(120),
  store_name: z.string().trim().max(100).optional(),
  campus_location: z.string().trim().max(150).optional(),
}).refine((value) => value.role !== "seller" || (value.store_name?.length >= 2 && value.campus_location?.length >= 2), {
  message: "Sellers must provide a store name and CSUCC campus location.", path: ["store_name"],
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1).max(100),
  new_password: z.string().min(8).max(100),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  avatar_url: z.string().trim().max(2000).refine((value) => !value || /^https?:\/\//i.test(value), "Avatar must be an http(s) image URL.").optional(),
});

export const credentialsSchema = z.object({
  campus_id: z.string().trim().min(3).max(50),
  affiliation: z.enum(["student", "faculty", "employee"]),
  department: z.string().trim().min(2).max(120),
});

const imageUrl = z.string().max(2000).refine((value) => !value || /^https?:\/\//i.test(value) || /^\/images\//.test(value) || /^\/api\/product-images\/[a-f0-9-]+\.(png|jpg|webp)$/.test(value), "Choose a product photo or a valid image URL.");

export const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),
});

export const loginVerifySchema = z.object({
  challenge: z.string().min(1),
  code: otpCode.optional(),
  security_answer: z.string().trim().min(1).max(100).optional(),
}).refine((value) => Boolean(value.code) !== Boolean(value.security_answer), {
  message: "Enter the emailed code or your security answer.", path: ["code"],
});

export const loginResendSchema = z.object({ challenge: z.string().min(1) });

export const productSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  price: z.coerce.number().positive(),
  stock: z.coerce.number().int().nonnegative(),
  category: z.enum([
    "food",
    "clothing",
    "electronics",
    "accessories",
    "student-made",
    "other",
  ]),
  image_url: imageUrl.optional(),
  stall_id: z.string().uuid(),
  is_active: z.boolean().optional(),
});

export const productUpdateSchema = productSchema.omit({ stall_id: true }).partial();

export const stallSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(1000).optional(),
  banner_url: imageUrl.optional(),
  logo_url: imageUrl.optional(),
  location: z.string().trim().min(2).max(150),
  category: z.string().trim().min(2).max(50).optional(),
  contact_number: z.string().max(30).optional(),
  operating_hours: z.string().max(150).optional(),
  is_active: z.boolean().optional(),
});

export const reviewRegistrationSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  note: z.string().trim().min(5).max(500),
  credentials_checked: z.boolean().optional(),
}).refine((value) => value.status !== "approved" || value.credentials_checked === true, { message: "Confirm that credentials were checked against CSUCC records." });

export const reviewApplicationSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  note: z.string().trim().min(5).max(500),
});

export const posSchema = z.object({
  request_id: z.string().uuid(),
  buyer_id: z.string().uuid(),
  items: z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().positive().max(10000) })).min(1).max(50),
  cash_received: z.number().nonnegative().max(1000000),
});

export const orderSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.coerce.number().int().positive(),
      })
    )
    .min(1),
  delivery_notes: z.string().max(500).optional(),
  notes: z.string().trim().max(500).optional(),
  fulfillment: z.enum(["pickup", "delivery"]).default("pickup"),
});

export const messageSchema = z.object({
  receiver_id: z.string().uuid(),
  product_id: z.string().uuid().optional(),
  content: z.string().min(1).max(2000),
});

export const reviewSchema = z.object({
  product_id: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});
