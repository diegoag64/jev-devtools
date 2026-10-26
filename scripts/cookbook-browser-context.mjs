import { pathToFileURL } from "node:url";
import { sep } from "node:path";
// All entry points go through the runner so evidence cannot silently overwrite a
// previous success and every result has source identity and a terminal status.
export function browserOutput() {
  if (!process.env.JEV_COOKBOOK_OUTPUT)
    throw new Error(
      "Use npm run verify:cookbooks -- [--only <recipe-or-collection>] to run browser checks.",
    );
  return process.env.JEV_COOKBOOK_OUTPUT;
}
export const browserOutputURL = () => pathToFileURL(browserOutput() + sep);
