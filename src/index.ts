// @ts-ignore The dressed build step generates this module with your commands/components/events.
import { commands, components, events, config } from "../.dressed";
import {
  handleRequest,
  setupCommands,
  setupComponents,
  setupEvents,
} from "dressed/server";

export default {
  fetch: (
    request: Request,
    _env: unknown,
    ctx: { waitUntil<T>(promise: Promise<T>): void },
  ) =>
    handleRequest(
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
    ),
};
