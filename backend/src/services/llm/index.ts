import type { Env } from '../../config/env';
import type { Logger } from '../../utils/logger';
import { CachingLlmProvider } from './caching-provider';
import { OpenAiProvider } from './openai-provider';
import type { LlmProvider } from './provider';

export { CachingLlmProvider } from './caching-provider';
export { OpenAiProvider } from './openai-provider';
export {
  addUsage,
  EMPTY_USAGE,
  type LlmJsonRequest,
  type LlmJsonResult,
  type LlmProvider,
  type LlmUsage,
} from './provider';

export const LLM_CACHE_DIR = '.llm-cache';

/**
 * Selects the adapter at boot. Adding Anthropic means writing `anthropic-provider.ts`, adding
 * `'anthropic'` to the `LLM_PROVIDER` enum in `config/env.ts`, and adding one case here.
 */
export function createLlmProvider(env: Env, logger: Logger): LlmProvider {
  let provider: LlmProvider;

  switch (env.LLM_PROVIDER) {
    case 'openai': {
      if (!env.OPENAI_API_KEY) {
        // Unreachable: `loadEnv` already rejects this combination. Kept so the type narrows without
        // a non-null assertion, and so the failure is loud if the schema ever loosens.
        throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER=openai');
      }
      provider = new OpenAiProvider({ apiKey: env.OPENAI_API_KEY, logger });
      break;
    }
  }

  if (env.LLM_CACHE) {
    if (env.NODE_ENV === 'production') {
      throw new Error('LLM_CACHE must not be enabled in production: responses would be replayed.');
    }
    logger.warn('LLM disk cache is enabled — model responses are replayed from .llm-cache/', {
      dir: LLM_CACHE_DIR,
    });
    provider = new CachingLlmProvider(provider, { dir: LLM_CACHE_DIR, logger });
  }

  return provider;
}
