/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";

Config.setRspack(false);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);
// The flame is a WebGL raymarcher. Headless Chrome on Linux only draws it with SwiftShader (CPU), so expect slow renders.
Config.setChromiumOpenGlRenderer("swangle");
