// SPEC §7.3 submit-pin. Phase 1: rent pins only. Listing path (email/phone/consent) arrives in Phase 3.
import { z } from 'npm:zod@3';
import { admin } from '../_shared/supabase.ts';
import { verifyTurnstile } from '../_shared/turnstile.ts';
import { withinRateLimit } from '../_shared/ratelimit.ts';
import { clientIp, randomToken, sha256 } from '../_shared/crypto.ts';
import { inGuwahati, nearestLocality, round3, toWkt } from '../_shared/geo.ts';
import { LOCALITIES } from '../_shared/localities.ts';
import {
  FURNISHING,
  NO_BHK_TYPES,
  POWER_BACKUP,
  PROPERTY_TYPES,
  WATER_SUPPLY,
  WATERLOG,
  rentProblem,
} from '../_shared/rules.ts';
import { fail, ok, preflight, readJson } from '../_shared/http.ts';

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

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
  deposit_months: z.number().int().min(0).max(12).optional(),
  sqft: z.number().int().min(80).max(10000).optional(),
  occupants: z.enum(['family', 'bachelor']).optional(),
  pets_allowed: z.enum(['yes', 'no', 'any']).optional(),
  waterlogging: z.enum(WATERLOG).default('unknown'),
  water_supply: z.enum(WATER_SUPPLY).optional(),
  power_backup: z.enum(POWER_BACKUP).optional(),
  pg_meals: z.boolean().optional(),
  pg_gender: z.enum(['boys', 'girls', 'mixed']).optional(),
  one_liner: optText(150),
  lat: z.number(),
  lng: z.number(),
  turnstileToken: z.string().min(1).max(4096),
  browserId: z.string().min(8).max(100),
});

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  try {
    const parsed = RentPin.safeParse(await readJson(req));
    if (!parsed.success) return fail(req, 400, 'Some fields are missing or invalid. Check the form and try again.');
    const p = parsed.data;
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
      deposit_months: p.deposit_months ?? null,
      sqft: p.sqft ?? null,
      occupants: p.occupants ?? null,
      pets_allowed: p.pets_allowed ?? null,
      waterlogging: p.waterlogging,
      water_supply: p.water_supply ?? null,
      power_backup: p.power_backup ?? null,
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
