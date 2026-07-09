/**
 * Preflight — run this before trusting anything else.
 *
 *   pnpm preflight
 *
 * It answers three questions in about ten seconds:
 *
 *   1. Does the API key authenticate?
 *   2. Does LLM_MODEL_EXTRACTION exist and accept strict Structured Outputs?
 *   3. Does constrained decoding actually hold the enum whitelist, even when the input is
 *      deliberately trying to break it?
 *
 * Question 3 matters most. The entire "the AI cannot invent a 5th crm_status" claim rests on it, so
 * we feed the model a status it has never seen and assert it collapses to '' rather than inventing.
 */
import OpenAI from 'openai';
import { z } from 'zod';
import { CRM_STATUS_ENUM } from '@groweasy/shared';
import { EnvValidationError, loadEnv } from '../src/config/env';
import { loadDotenv } from '../src/config/load-dotenv';
import { createLlmProvider } from '../src/services/llm';
import { createLogger } from '../src/utils/logger';

const GREEN = '\u001b[32m';
const RED = '\u001b[31m';
const DIM = '\u001b[2m';
const BOLD = '\u001b[1m';
const RESET = '\u001b[0m';

const pass = (message: string): void => console.log(`${GREEN}  PASS${RESET}  ${message}`);
const fail = (message: string): void => console.log(`${RED}  FAIL${RESET}  ${message}`);
const dim = (message: string): void => console.log(`${DIM}        ${message}${RESET}`);

/** A miniature of the real Phase 2 schema: required strings plus the whitelisted status enum. */
const probeSchema = z.object({
  name: z.string().describe('The person’s full name, or "" if absent.'),
  email: z.string().describe('Primary email only, or "" if absent.'),
  mobile: z.string().describe('Digits only, country code stripped, or "" if absent.'),
  crm_status: z
    .enum(CRM_STATUS_ENUM)
    .describe('One of the allowed statuses, or "" when no confident match exists.'),
});

const PROBE_SYSTEM = [
  'You are a data-extraction engine. You output only JSON matching the provided schema.',
  '',
  'crm_status must be exactly one of: GOOD_LEAD_FOLLOW_UP, DID_NOT_CONNECT, BAD_LEAD, SALE_DONE.',
  'If the source status does not map confidently onto one of those four, output an empty string.',
  'Never invent a status value.',
].join('\n');

// "Awaiting legal clearance" maps onto none of the four. A model that is merely *asked* to behave
// often invents `PENDING`. A model that is *decoding-constrained* cannot.
const PROBE_USER = JSON.stringify({
  'Client Name': 'Rajesh  Patel',
  'E-mail': 'RAJESH.PATEL@Example.COM ',
  'Mob No.': 'p:+91 98765 43210',
  Status: 'Awaiting legal clearance',
});

async function main(): Promise<void> {
  loadDotenv();

  console.log(`\n${BOLD}GrowEasy CSV importer — preflight${RESET}\n`);

  let env;
  try {
    env = loadEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      fail('Environment is not valid.');
      for (const problem of error.problems) dim(problem);
      dim('Copy backend/.env.example to backend/.env and fill it in.');
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  dim(`provider   ${env.LLM_PROVIDER}`);
  dim(`inference  ${env.LLM_MODEL_INFERENCE}`);
  dim(`extraction ${env.LLM_MODEL_EXTRACTION}`);
  console.log('');

  const logger = createLogger({ level: 'error', pretty: true });

  // --- 1. Does the key authenticate, and does the model exist? --------------------------------
  if (!env.OPENAI_API_KEY) {
    fail('OPENAI_API_KEY is missing.');
    process.exitCode = 1;
    return;
  }

  const raw = new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 0, timeout: 30_000 });

  try {
    const model = await raw.models.retrieve(env.LLM_MODEL_EXTRACTION);
    pass(`Key authenticates, and "${model.id}" is reachable.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (/401|invalid_api_key|Incorrect API key/i.test(message)) {
      fail('The API key was rejected. Check OPENAI_API_KEY in backend/.env.');
    } else if (/404|does not exist|model_not_found/i.test(message)) {
      fail(`Model "${env.LLM_MODEL_EXTRACTION}" is not available to this key.`);
      dim('gpt-4.1-mini is legacy: still API-served, but absent from the current models list.');
      dim('Set LLM_MODEL_EXTRACTION=gpt-5.4-mini in backend/.env and re-run.');
    } else {
      fail(`Could not reach OpenAI: ${message}`);
    }
    process.exitCode = 1;
    return;
  }

  // --- 2 & 3. Strict structured outputs, and the enum whitelist under adversarial input --------
  const provider = createLlmProvider(env, logger);
  const startedAt = Date.now();

  try {
    const result = await provider.completeJson({
      model: env.LLM_MODEL_EXTRACTION,
      system: PROBE_SYSTEM,
      user: PROBE_USER,
      schema: { name: 'preflight_probe', zod: probeSchema },
      maxOutputTokens: 512,
      temperature: env.LLM_TEMPERATURE,
      cacheKey: 'preflight',
    });

    const elapsedMs = Date.now() - startedAt;
    pass(`Strict Structured Outputs accepted; response validated against the Zod schema.`);
    dim(`latency ${elapsedMs} ms`);
    dim(
      `tokens  prompt=${result.usage.promptTokens} ` +
        `cached=${result.usage.cachedPromptTokens} ` +
        `completion=${result.usage.completionTokens}`,
    );
    dim(`output  ${JSON.stringify(result.data)}`);

    // The whole safety claim, tested rather than asserted.
    const status = result.data.crm_status;
    if (status === '') {
      pass('Enum whitelist held: an unmappable status collapsed to "" rather than being invented.');
    } else if ((CRM_STATUS_ENUM as readonly string[]).includes(status)) {
      pass(`Enum whitelist held: model chose "${status}", which is inside the whitelist.`);
      dim('It mapped an ambiguous status rather than blanking it. Phase 3 will not override this.');
    } else {
      fail(`Enum whitelist BREACHED: model returned "${status}".`);
      process.exitCode = 1;
      return;
    }

    if (result.usage.promptTokens > 0 && result.usage.promptTokens < 1024) {
      dim(
        `prompt is ${result.usage.promptTokens} tokens; OpenAI only caches prefixes of 1024+, so ` +
          'cached=0 here is expected. The real pipeline prompt is far longer.',
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`Structured Outputs call failed: ${message}`);
    dim('If this mentions response_format or json_schema, the model does not support strict mode.');
    dim('Try LLM_MODEL_EXTRACTION=gpt-5.4-mini in backend/.env.');
    process.exitCode = 1;
    return;
  }

  console.log(
    `\n${GREEN}${BOLD}Preflight passed.${RESET} Safe to build the pipeline on this model.\n`,
  );
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
