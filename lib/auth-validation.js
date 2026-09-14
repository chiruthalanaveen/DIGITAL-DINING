import { z } from 'zod'

/*
 * Generic authentication messages.
 * These avoid exposing sensitive account information.
 */
export const GENERIC_VALIDATION_ERROR =
  'Please check the information you entered and try again.'

export const GENERIC_AUTH_ERROR =
  'Unable to authenticate. Please check your details and try again.'

/*
 * Restaurant registration validation.
 */
export const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters.')
    .max(100, 'Name is too long.'),

  email: z
    .string()
    .trim()
    .email('Please enter a valid email address.')
    .max(254, 'Email address is too long.')
    .transform((value) => value.toLowerCase()),

  phone: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'Phone number must contain exactly 10 digits.'),

  dob: z
    .string()
    .trim()
    .min(1, 'Date of birth is required.'),

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password is too long.'),

  restaurantName: z
    .string()
    .trim()
    .min(2, 'Restaurant name must be at least 2 characters.')
    .max(150, 'Restaurant name is too long.')
    .optional(),

  managerName: z
    .string()
    .trim()
    .max(100, 'Manager name is too long.')
    .optional(),

  address: z
    .string()
    .trim()
    .max(500, 'Address is too long.')
    .optional(),

  city: z
    .string()
    .trim()
    .max(100, 'City name is too long.')
    .optional(),

  state: z
    .string()
    .trim()
    .max(100, 'State name is too long.')
    .optional(),

  pincode: z
    .string()
    .trim()
    .max(10, 'Pincode is too long.')
    .optional(),
})

/*
 * Login validation.
 *
 * The login API may use email, password, and date of birth.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Please enter a valid email address.')
    .max(254, 'Email address is too long.')
    .transform((value) => value.toLowerCase()),

  password: z
    .string()
    .min(1, 'Password is required.')
    .max(128, 'Password is too long.'),

  dob: z
    .string()
    .trim()
    .min(1, 'Date of birth is required.')
    .optional(),
})