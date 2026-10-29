// SPEC §7.3 submit-pin. Phase 1: rent pins only. Listing path (email/phone/consent) arrives in Phase 3.
import { z } from 'npm:zod@3';
import { admin } from '../_shared/supabase.ts';
import { verifyTurnstile } from '../_shared/turnstile.ts';
import { withinRateLimit } from '../_shared/ratelimit.ts';
import { clientIp, randomToken, sha256 } from '../_shared/crypto.ts';
import { inGuwahati, nearestLocality, round3, toWkt } from '../_shared/geo.ts';
import { LOCALITIES } from '../_shared/localities.ts';
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
import { fail, ok, preflight, readJson } from '../_shared/http.ts';

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

const RentPin = z.object({
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
  lat: z.number(),
  lng: z.number(),
  turnstileToken: z.string().min(1).max(10000), // Cloudflare verifies it; length cap only stops abuse
  browserId: z.string().min(8).max(100),
});

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  try {
    const parsed = RentPin.safeParse(await readJson(req));
    if (!parsed.success) {
      // Name the fields (never their values) so problems can be diagnosed from the browser.
      const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? 'body')))];
      console.warn('submit-pin validation failed:', fields.join(', '));
      return fail(req, 400, 'Some answers need fixing. Check the highlighted fields and try again.', {
        fields,
      });
    }
    // Drop answers that don't apply (e.g. litres for 24-hour water), then cross-field checks.
    const p = pruneConditions(parsed.data);
    const problems = conditionProblems(p);
    if (problems.length) {
      return fail(req, 400, problems[0].message, { fields: problems.map((x) => x.field) });
    }
    const ip = clientIp(req);

    if (!(await verifyTurnstile(p.turnstileToken, ip))) {
      return fail(req, 403, 'Spam check failed. Please refresh the check and try again.');
    }
    if (!inGuwahati(p.lat, p.lng)) {
      return fail(req, 400, 'That spot is outside Guwahati. Only Guwahati pins are accepted for now.');
    }

    const bhk = NO_BHK_TYPES.includes(p.property_type) ? 0 : Math.max(1, p.bhk);
    const problem = rentProblem(p.property_type, bhk, p.rent);
    if (problem) return fail(req, 400, problem);

    // Rate limit last, so rejected inputs (typos, wrong spot) don't use up someone's daily quota.
    if (!(await withinRateLimit('submit-pin', ip, p.browserId, 5))) {
      return fail(req, 429, 'You have added the maximum number of pins for today. Try again tomorrow.');
    }

    const isPg = p.property_type === 'pg';
    const lat = round3(p.lat);
    const lng = round3(p.lng);
    const editToken = randomToken();

    const row = {
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
      locality_slug: nearestLocality(lat, lng, LOCALITIES),
      location: toWkt(lat, lng),
      edit_token_hash: await sha256(editToken),
    };

    const { data, error } = await admin.from('pins').insert(row).select('id, created_at').single();
    if (error || !data) throw error ?? new Error('insert returned no row');

    // Public shape only (mirrors public_pins). Never echo edit_token_hash.
    const { edit_token_hash: _omit, location: _loc, ...pub } = row;
    return ok(req, {
      id: data.id,
      editToken,
      pin: { ...pub, id: data.id, created_at: data.created_at, is_outlier: false, lat, lng },
    });
  } catch (e) {
    console.error('submit-pin failed:', e instanceof Error ? e.message : 'unknown');
    return fail(req, 500, 'Something went wrong on our side. Please try again in a minute.');
  }
});
