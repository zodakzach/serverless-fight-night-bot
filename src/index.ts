import { commands, components, events, config } from "../.dressed/index.mjs";
import {
  handleRequest,
  setupCommands,
  setupComponents,
  setupEvents,
} from "dressed/server";
import { runNotifier, type NotifierEnv } from "./notifier/notifier.ts";

type WorkerEnv = Record<string, unknown> & {
  DISCORD_APP_ID?: string;
  DISCORD_PUBLIC_KEY?: string;
  DISCORD_TOKEN?: string;
  ESPN_USER_AGENT?: string;
  RUN_AT?: string;
  TZ?: string;
  FIGHT_NIGHT_SETTINGS?: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
    delete?(key: string): Promise<void>;
    list?(options?: {
      prefix?: string;
      limit?: number;
      cursor?: string;
    }): Promise<{
      keys: { name: string }[];
      list_complete: boolean;
      cursor?: string;
    }>;
  };
};

type ScheduledEvent = {
  scheduledTime?: number;
  cron?: string;
};

function registerEnv(env: WorkerEnv): void {
  const globalAny = globalThis as Record<PropertyKey, unknown>;
  globalAny.env = env;
  if (env.FIGHT_NIGHT_SETTINGS) {
    globalAny.FIGHT_NIGHT_SETTINGS = env.FIGHT_NIGHT_SETTINGS;
  }

  const nodeProcess = globalAny.process as
    | { env?: Record<string, string> }
    | undefined;
  if (!nodeProcess) {
    globalAny.process = { env: {} };
  }
  const resolvedProcess = globalAny.process as { env: Record<string, string> };
  if (!resolvedProcess.env) {
    resolvedProcess.env = {};
  }
  const targetEnv = resolvedProcess.env;

  const inject = (key: keyof WorkerEnv) => {
    const value = env[key];
    if (typeof value === "string" && value.length > 0) {
      targetEnv[String(key)] = value;
    }
  };

  inject("DISCORD_APP_ID");
  inject("DISCORD_PUBLIC_KEY");
  inject("DISCORD_TOKEN");
  inject("ESPN_USER_AGENT");
  inject("RUN_AT");
  inject("TZ");
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
  scheduled: (
    event: ScheduledEvent,
    env: WorkerEnv,
    ctx: { waitUntil<T>(promise: Promise<T>): void },
  ) => {
    registerEnv(env);

    const notifierEnv: NotifierEnv = {
      DISCORD_TOKEN:
        typeof env.DISCORD_TOKEN === "string" ? env.DISCORD_TOKEN : "",
      FIGHT_NIGHT_SETTINGS: env.FIGHT_NIGHT_SETTINGS,
    };

    const scheduledTime =
      typeof event.scheduledTime === "number"
        ? new Date(event.scheduledTime)
        : new Date();

    ctx.waitUntil(runNotifier(notifierEnv, scheduledTime));
  },
};
