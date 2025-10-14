import { commands, components, events, config } from "../.dressed/index.mjs";
import {
  handleRequest,
  setupCommands,
  setupComponents,
  setupEvents,
} from "dressed/server";

type WorkerEnv = Record<string, unknown> & {
  FIGHT_NIGHT_SETTINGS?: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
    delete?(key: string): Promise<void>;
    list?(
      options?: {
        prefix?: string;
        limit?: number;
        cursor?: string;
      },
    ): Promise<{
      keys: { name: string }[];
      list_complete: boolean;
      cursor?: string;
    }>;
  };
};

function registerEnv(env: WorkerEnv): void {
  const globalAny = globalThis as Record<PropertyKey, unknown>;
  globalAny.env = env;
  if (env.FIGHT_NIGHT_SETTINGS) {
    globalAny.FIGHT_NIGHT_SETTINGS = env.FIGHT_NIGHT_SETTINGS;
  }
}

export default {
  fetch: (
    request: Request,
    env: WorkerEnv,
    ctx: { waitUntil<T>(promise: Promise<T>): void },
  ) => {
    registerEnv(env);
    return handleRequest(
      request,
      (...args) => {
        const promise = setupCommands(commands)(...args);
        ctx.waitUntil(promise);
        return promise;
      },
      (...args) => {
        const promise = setupComponents(components)(...args);
        ctx.waitUntil(promise);
        return promise;
      },
      (...args) => {
        const promise = setupEvents(events)(...args);
        ctx.waitUntil(promise);
        return promise;
      },
      config,
    );
  },
};
