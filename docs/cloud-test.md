# Install and verify on RunComfy Cloud

Use a ComfyUI instance with native `VIDEO` / `Save Video` support and Python 3.10 or newer. Model generation runs through the RunComfy Model API; the plugin does not load the model weights on the ComfyUI machine.

## Install

If the instance already provides RunComfy partner nodes, skip installation. Otherwise, open its terminal and install from the public repository:

```sh
cd /path/to/ComfyUI/custom_nodes
git clone --branch main https://github.com/runcomfy-com/comfyui-runcomfy-partner-nodes.git
/path/to/ComfyUI/python -m pip install -r comfyui-runcomfy-partner-nodes/requirements.txt
```

Replace the paths with the instance's ComfyUI directory and Python interpreter. Restart ComfyUI and refresh the browser. Search for `RunComfy` in the node menu, or import [the Seedance I2V example](../example_workflows/seedance-25-i2v-1080p.json).

## Verify account setup

Open **Settings → RunComfy → Account → API Token** to check the account connection. With no saved override, all partner nodes use the hosting service's `RUNCOMFY_API_TOKEN` automatically. Choose **Configure account** and save your API Token from [RunComfy Profile](https://www.runcomfy.com/profile) to switch accounts. The dialog identifies a saved token with a masked placeholder and active-source status. Clear the saved token to return to the environment account.

For a self-managed instance, see [environment configuration](../README.md#configure-your-account). A saved token takes precedence over `RUNCOMFY_API_TOKEN`, which takes precedence over `RUNCOMFY_TOKEN`. `RUNCOMFY_API_TOKEN_FILE` is reserved for the managed startup contract: startup must read the protected file and export `RUNCOMFY_API_TOKEN` before launching ComfyUI. The plugin does not read that file itself. If this marker exists without a saved override or injected token, account access stops; restart the managed machine to reconnect. Legacy `RUNCOMFY_TOKEN` is not used on managed machines. Installing the plugin alone does not provision managed credentials.

Verify the following before generating:

- The price badge loads the live unit rate. Fixed-rate models also show an estimate when the catalog and selected inputs support it.
- Changing duration updates the estimate where applicable.
- On a separate instance without a configured account or managed credential marker, a new generation without a token fails before a paid API submission.
- The account token never appears in the exported workflow JSON.

### HTTPS configuration

If an HTTPS reverse proxy changes the internal host or scheme, set `RUNCOMFY_PUBLIC_ORIGIN` to the exact browser-visible ComfyUI origin before launching ComfyUI. For a RunComfy host, the pattern is `https://SERVER_ID-comfyui.runcomfy.com`; use the instance's actual ComfyUI address, not the outer `www.runcomfy.com` page URL.

Supply this setting through the host's launch configuration. Do not bake a test instance's address into a reusable image or disable origin checks. Without the correct origin, proxied credential writes may be rejected with HTTP 403.

## Generate once

Generation is charged to the configured RunComfy account balance. Cloud machine time is billed separately.

1. Import the Seedance I2V example and select an uploaded image in `Load Image`.
2. Enter a motion prompt, choose 4 seconds and enable audio.
3. Queue once, then confirm a playable video with audio in `Save Video`.
4. Check the matching request and cost in your RunComfy account history.

A green node border means execution is active; the plugin does not report a percentage for remote generation. If submission becomes uncertain, check the account history before queuing again. Use the node's recovery controls to retrieve an existing request without creating a new generation.

Manually saved tokens and token-scoped recovery records stay in the plugin directory by default and are included in Cloud Save. Verify that reopening the snapshot retains the saved override, including when someone opens its share link on another machine. That person can use the saved token's account balance. A snapshot without a saved override uses the new machine's injected default token. Team-shared configuration paths are supported; external custom paths require their storage to be preserved separately. Clear the saved token before creating a snapshot that should not carry it. Clearing a running instance does not remove credentials from existing snapshots. Stop a temporary test machine when it is no longer needed.

## Offline checks and limitations

The [development commands](../README.md#development-and-tests) run offline tests without submitting paid generations. See the [validation report](validation-2026-09-22.md) for recorded local browser and native-media checks, plus their limits. Installation or passing offline tests does not establish live cloud token provisioning or paid output quality.

## References

- [Installing a custom-node branch on RunComfy](https://comfyui-guides.runcomfy.com/ultimate-comfyui-how-tos-a-runcomfy-guide/how-to-use-a-specific-branch-of-a-custom-node)
- [Creating custom workflows on RunComfy](https://docs.runcomfy.com/serverless/custom-workflows)
