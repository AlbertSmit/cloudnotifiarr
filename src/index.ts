// Main Cloudflare Worker entry point
import { handleRequest } from "./router";
import type { Env } from "./types";

// #MARK: Worker Entry Point

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		return handleRequest(request, env);
	},
} satisfies ExportedHandler<Env>;
