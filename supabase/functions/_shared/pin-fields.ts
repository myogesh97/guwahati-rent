// Rent pin answers: one schema and one set of checks for submit-pin AND edit-pin `update`
// (NEXT-PHASES §4.7: "the same validation as submit-pin").
import { z } from 'npm:zod@3';
import {
  DRINKING_WATER,
  FLOOR_LEVEL,
  FURNISHING,
  LIMITS,
  NO_BHK_TYPES,
  POWER_BACKUP,
  POWER_CUTS,
  PROPERTY_TYPES,
  ROAD_IN_RAIN,
  WATER_AVAILABILITY,
  WATER_EXTRA_COST,
  WATER_SOURCES,
  WATER_SUPPLY,
  WATERLOG,
  WATERLOG_ANSWERS,
  WATERLOG_DURATION,
  WATERLOG_PLACES,
  WATERLOG_SEVERITY,
  conditionProblems,
  pruneConditions,
  rentProblem,
  waterlogSummary,
} from '../_shared/rules.ts';

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const uniqueList = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.enum(values))
    .max(values.length)
    .optional()
    .transform((v) => (v && v.length ? [...new Set(v)] : undefined));

/** Every answer in the rent form. submit-pin adds location + spam check; edit-pin adds the token. */
export const PinFields = z.object({
  kind: z.literal('rent'),
  property_type: z.enum(PROPERTY_TYPES),
  bhk: z.number().int().min(0).max(5),
  rent: z.number().int(),
  furnishing: z.enum(FURNISHING),
  gated: z.boolean(),
  parking_cars: z.number().int().min(0).max(5),
  society_name: optText(120),
  maintenance_incl: z.boolean().optional(),
  maintenance_amount: z.number().int().min(LIMITS.maintenance.min).max(LIMITS.maintenance.max).optional(),
  deposit_months: z.number().int().min(LIMITS.deposit.min).max(LIMITS.deposit.max).optional(),
  sqft: z.number().int().min(LIMITS.sqft.min).max(LIMITS.sqft.max).optional(),
  occupants: z.enum(['family', 'bachelor']).optional(),
  pets_allowed: z.enum(['yes', 'no', 'any']).optional(),
  // Older clients send the summary directly; current clients send the detailed answer.
  waterlogging: z.enum(WATERLOG).optional(),
  waterlog_answer: z.enum(WATERLOG_ANSWERS).optional(),
  waterlog_where: uniqueList(WATERLOG_PLACES),
  waterlog_severity: z.enum(WATERLOG_SEVERITY).optional(),
  waterlog_duration: z.enum(WATERLOG_DURATION).optional(),
  road_in_rain: z.enum(ROAD_IN_RAIN).optional(),
  floor_level: z.enum(FLOOR_LEVEL).optional(),
  waterlog_note: optText(150),
  water_supply: z.enum(WATER_SUPPLY).optional(), // legacy; current clients send water_availability
  water_sources: uniqueList(WATER_SOURCES),
  water_availability: z.enum(WATER_AVAILABILITY).optional(),
  water_litres: z.number().int().min(LIMITS.waterLitres.min).max(LIMITS.waterLitres.max).optional(),
  water_hours: optText(60),
  water_extra_cost: z.enum(WATER_EXTRA_COST).optional(),
  water_shared: z.boolean().optional(),
  drinking_water: z.enum(DRINKING_WATER).optional(),
  water_note: optText(150),
  conditions_as_of: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  power_backup: z.enum(POWER_BACKUP).optional(),
  power_cuts: z.enum(POWER_CUTS).optional(),
  pg_meals: z.boolean().optional(),
  pg_gender: z.enum(['boys', 'girls', 'mixed']).optional(),
  one_liner: optText(150),
});

export type PinInput = z.infer<typeof PinFields>;

/** Names of the fields that failed (never their values), for the 400 response. */
export const failedFields = (error: z.ZodError): string[] => [
  ...new Set(error.issues.map((i) => String(i.path[0] ?? 'body'))),
];

/**
 * Prunes answers that don't apply, then runs the cross-field and plausibility checks.
 * Returns the pruned input and the bhk to store, or the first problem.
 */
export function checkPin<T extends PinInput>(
  input: T,
): { ok: true; p: T; bhk: number } | { ok: false; message: string; fields: string[] } {
  const p = pruneConditions(input);
  const problems = conditionProblems(p);
  if (problems.length) return { ok: false, message: problems[0].message, fields: problems.map((x) => x.field) };
  const bhk = NO_BHK_TYPES.includes(p.property_type) ? 0 : Math.max(1, p.bhk);
  const problem = rentProblem(p.property_type, bhk, p.rent);
  if (problem) return { ok: false, message: problem, fields: ['rent'] };
  return { ok: true, p, bhk };
}

/** The pins columns written from the answers (everything except location / token / locality). */
export function pinColumns(p: PinInput, bhk: number) {
  const isPg = p.property_type === 'pg';
  return {
    kind: 'rent',
    property_type: p.property_type,
    bhk,
    rent: p.rent,
    furnishing: p.furnishing,
    gated: p.gated,
    parking_cars: p.parking_cars,
    society_name: p.society_name,
    maintenance_incl: p.maintenance_incl ?? null,
    maintenance_amount: p.maintenance_amount ?? null,
    deposit_months: p.deposit_months ?? null,
    sqft: p.sqft ?? null,
    occupants: p.occupants ?? null,
    pets_allowed: p.pets_allowed ?? null,
    waterlogging: p.waterlog_answer
      ? waterlogSummary(p.waterlog_answer, p.waterlog_where)
      : (p.waterlogging ?? 'unknown'),
    waterlog_where: p.waterlog_where ?? null,
    waterlog_severity: p.waterlog_severity ?? null,
    waterlog_duration: p.waterlog_duration ?? null,
    road_in_rain: p.road_in_rain ?? null,
    floor_level: p.floor_level ?? null,
    waterlog_note: p.waterlog_note,
    water_supply: p.water_supply ?? null,
    water_sources: p.water_sources ?? null,
    water_availability: p.water_availability ?? null,
    water_litres: p.water_litres ?? null,
    water_hours: p.water_hours ?? null,
    water_extra_cost: p.water_extra_cost ?? null,
    water_shared: p.water_shared ?? null,
    drinking_water: p.drinking_water ?? null,
    water_note: p.water_note,
    conditions_as_of: p.conditions_as_of ?? null,
    power_backup: p.power_backup ?? null,
    power_cuts: p.power_cuts ?? null,
    pg_meals: isPg ? (p.pg_meals ?? null) : null,
    pg_gender: isPg ? (p.pg_gender ?? null) : null,
    one_liner: p.one_liner,
  };
}
