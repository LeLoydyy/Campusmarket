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

const strongPassword = z.string().min(8, "Use at least 8 characters.").max(100)
  .regex(/[a-z]/i, "Password needs at least one letter.")
  .regex(/\d/, "Password needs at least one number.");

// Three different questions, each with an answer (hashed before storage).
const recoveryQuestions = z.array(z.object({
  question: z.string().trim().min(5).max(150),
  answer: z.string().trim().min(2, "Each answer needs at least 2 characters.").max(100),
})).length(3, "Answer three security questions.")
  .refine((items) => new Set(items.map((item) => item.question.toLowerCase())).size === 3, "Pick three different questions.");

export const sendCodeSchema = z.object({ email: campusEmail });
export const verifyEmailSchema = z.object({ email: campusEmail, code: otpCode });

export const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: campusEmail,
  // Checked in the register controller (it can be skipped locally with SKIP_EMAIL_OTP).
  email_token: z.string().optional(),
  password: strongPassword,
  security_questions: recoveryQuestions,
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
  phone: z.string().trim().max(20).regex(/^[0-9+\-\s()]*$/, "Use digits, spaces, + or - only.").optional(),
  address: z.string().trim().max(200).optional(),
});

export const credentialsSchema = z.object({
  campus_id: z.string().trim().min(3).max(50),
  affiliation: z.enum(["student", "faculty", "employee"]),
  department: z.string().trim().min(2).max(120),
});

const imageUrl = z.string().max(2000).refine((value) => !value || /^https?:\/\//i.test(value) || /^\/images\//.test(value) || /^\/api\/product-images\/[a-f0-9-]+\.(png|jpg|webp)$/.test(value), "Choose a product photo or a valid image URL.");

// `email` also accepts an administrator's username.
export const loginSchema = z.object({
  email: z.string().trim().min(3, "Enter your email or username.").max(254).toLowerCase(),
  password: z.string().min(1),
});

// ── Account setup, recovery and password reset ────────────────────────────────
const employeeId = z.string().trim().min(3, "Enter the employee ID.").max(50);

export const setupSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(80),
  employee_id: employeeId,
  new_password: strongPassword,
  security_questions: recoveryQuestions,
});

export const recoveryQuestionsSchema = z.object({
  current_password: z.string().min(1).max(100),
  security_questions: recoveryQuestions,
});

const anyEmail = z.string().trim().email("Enter a valid email address.").toLowerCase();
export const forgotStartSchema = z.object({ email: anyEmail });
export const forgotVerifySchema = z.object({ email: anyEmail, code: otpCode });
export const forgotCompleteSchema = z.object({
  email: anyEmail,
  code: otpCode,
  answers: z.array(z.string().max(100)).max(3).default([]),
  new_password: strongPassword,
});

// ── Admin: administrators and accounts ────────────────────────────────────────
const username = z.string().trim().toLowerCase().min(3, "Usernames need at least 3 characters.").max(30)
  .regex(/^[a-z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores.")
  .refine((value) => !value.includes("@"), "A username can't be an email address.");
const shiftMinute = z.number().int().min(0).max(1440).nullable();
const permissionList = z.array(z.enum(["approve", "block", "edit", "delete", "admins", "logs", "marketplace"])).nullable();
const withValidShift = (schema) => schema
  .refine((value) => (value.shift_start == null) === (value.shift_end == null), { message: "Set both the shift start and end, or neither.", path: ["shift_start"] })
  .refine((value) => value.shift_start == null || value.shift_start !== value.shift_end, { message: "A shift can't start and end at the same time.", path: ["shift_end"] });

export const createAdminSchema = withValidShift(z.object({
  username,
  email: campusEmail,
  name: z.string().trim().max(80).optional(),
  employee_id: employeeId.optional().or(z.literal("").transform(() => undefined)),
  shift_start: shiftMinute.default(null),
  shift_end: shiftMinute.default(null),
  permissions: permissionList.default(null),
}));

export const updateAdminSchema = withValidShift(z.object({
  username: username.optional(),
  email: campusEmail.optional(),
  name: z.string().trim().min(2).max(80).optional(),
  employee_id: employeeId.optional(),
  shift_start: shiftMinute.optional(),
  shift_end: shiftMinute.optional(),
  permissions: permissionList.optional(),
}));

export const updateAccountSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: anyEmail.optional(),
  campus_id: z.string().trim().min(3).max(50).optional(),
  affiliation: z.enum(["student", "faculty", "employee"]).optional(),
  department: z.string().trim().min(2).max(120).optional(),
});

export const removeAccountSchema = z.object({
  reason: z.string().trim().min(10, "Explain why in at least 10 characters.").max(500),
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
  // Empty or null = no sale; the store checks it is below the regular price.
  sale_price: z.union([z.coerce.number().positive(), z.literal(""), z.null()]).optional(),
  images: z.array(imageUrl).max(4, "Add up to 4 extra photos.").optional(),
  options: z.array(z.object({
    label: z.string().trim().min(1, "Name each option.").max(30),
    stock: z.coerce.number().int().nonnegative().max(100000),
  })).max(12, "Use up to 12 options.").optional(),
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
  items: z.array(z.object({ product_id: z.string().uuid(), option_id: z.string().min(1).nullable().optional(), quantity: z.number().int().positive().max(10000) })).min(1).max(50),
  cash_received: z.number().nonnegative().max(1000000),
});

export const orderSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        option_id: z.string().min(1).nullable().optional(),
        quantity: z.coerce.number().int().positive(),
      })
    )
    .min(1),
  delivery_notes: z.string().max(500).optional(),
  notes: z.string().trim().max(500).optional(),
  fulfillment: z.enum(["pickup", "delivery"]).default("pickup"),
  delivery_address: z.string().trim().max(200).optional(),
});

export const messageSchema = z.object({
  receiver_id: z.string().uuid(),
  product_id: z.string().uuid().optional(),
  content: z.string().min(1).max(2000),
});

export const reviewSchema = z.object({
  order_id: z.string().min(1),
  product_id: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});
export const reviewReplySchema = z.object({ reply: z.string().trim().max(1000) });
export const notificationPrefsSchema = z.object({
  orderUpdates: z.boolean().optional(),
  reviewAlerts: z.boolean().optional(),
  stockAlerts: z.boolean().optional(),
});
export const favoritesSchema = z.object({ product_ids: z.array(z.string().min(1)).min(1).max(200) });

// ── Plans: admin switch, featured picks, visible picks on Free ────────────────
export const stallPlanSchema = z.object({
  tier: z.enum(["free", "premium"]),
  premium_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-31.").nullable().optional(),
  note: z.string().trim().max(500).default(""),
});
export const featuredSchema = z.object({ featured: z.boolean() });
export const visibleProductsSchema = z.object({ product_ids: z.array(z.string().min(1)).max(25) });

// ── Premium plan requests ─────────────────────────────────────────────────────
export const planRequestSchema = z.object({
  note: z.string().trim().max(500).default(""),
  payment_reference: z.string().trim().max(100).optional().transform((value) => value || null),
});

export const planReviewSchema = z.object({
  decision: z.enum(["approved", "declined"]),
  note: z.string().trim().max(500).default(""),
  premium_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-31.").nullable().optional(),
}).refine((value) => value.decision === "approved" || value.note.length >= 5, {
  message: "Tell the seller why (5+ characters).", path: ["note"],
});
