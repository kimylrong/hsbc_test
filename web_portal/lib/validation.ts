import { z } from "zod";

// Validation boundaries must match App 1 schemas.py (and Task 1 models.py).
export const houseFeaturesSchema = z.object({
  square_footage: z
    .number({ error: "Required" })
    .int("Enter a whole number")
    .min(100, "Min 100 sq ft")
    .max(20000, "Max 20,000 sq ft"),
  bedrooms: z
    .number({ error: "Required" })
    .int("Enter a whole number")
    .min(1, "Min 1")
    .max(10, "Max 10"),
  bathrooms: z.number({ error: "Required" }).min(0.5, "Min 0.5").max(8, "Max 8"),
  year_built: z
    .number({ error: "Required" })
    .int("Enter a whole number")
    .min(1800, "Min 1800")
    .max(2026, "Max 2026"),
  lot_size: z
    .number({ error: "Required" })
    .int("Enter a whole number")
    .min(500, "Min 500")
    .max(100000, "Max 100,000"),
  distance_to_city_center: z
    .number({ error: "Required" })
    .min(0.1, "Min 0.1")
    .max(50, "Max 50"),
  school_rating: z.number({ error: "Required" }).min(1, "Min 1").max(10, "Max 10"),
});

export type HouseFeaturesForm = z.infer<typeof houseFeaturesSchema>;