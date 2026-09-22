import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { installRunComfyExtension } from "./runcomfy-node.mjs";
import { installRunComfySwitch } from "./runcomfy-switch.mjs";

installRunComfyExtension({ app, api });
installRunComfySwitch({ app, api });
