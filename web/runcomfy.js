import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
// ComfyUI marks .js entries no-store, but .mjs dependencies can remain cached.
import { installRunComfyExtension } from "./runcomfy-node.mjs?v=20260923-shared-token2";
import { installRunComfySwitch } from "./runcomfy-switch.mjs";

installRunComfyExtension({ app, api });
installRunComfySwitch({ app, api });
