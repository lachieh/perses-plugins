// Copyright 2024 The Perses Authors
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { ModuleFederationOptions, pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { mergeRsbuildConfig, RsbuildConfig } from '@rsbuild/core';

const PLUGIN_REGISTRY = {
  BarChart: 3005,
  GaugeChart: 3006,
  Markdown: 3007,
  PieChart: 3008,
  Prometheus: 3009,
  ScatterChart: 3010,
  StatChart: 3011,
  StaticListVariable: 3012,
  StatusHistoryChart: 3013,
  Table: 3014,
  Tempo: 3015,
  TimeSeriesChart: 3016,
  TimeSeriesTable: 3017,
  TraceTable: 3018,
  TracingGanttChart: 3019,
  HistogramChart: 3020,
  FlameChart: 3021,
  DatasourceVariable: 3022,
  HeatMapChart: 3023,
  Loki: 3024,
  Pyroscope: 3025,
  ClickHouse: 3119,
} as const;

/**
 * Note that if you get a type error on this line such as `Type 'true' is not assignable to type 'false'`, it means that
 * there are duplicate port values in the `PLUGIN_REGISTRY` above and you will need to pick a new port number for
 * whichever plugin is duplicated.
 */
const registryIsValid: RegistryIsValid = true;
if (!registryIsValid) throw new Error('PLUGIN_REGISTRY has duplicate port values.');

type PluginName = keyof typeof PLUGIN_REGISTRY;
interface PluginConfigOptions {
  /**
   * The name of the plugin. This must match a key in the `PLUGIN_REGISTRY`.
   * @see {@link PLUGIN_REGISTRY}
   */
  name: PluginName;
  /**
   * Any rsbuild configuration options to merge with the base config. Note that
   * the `server.port` and `output.assetPrefix` are automatically set based on
   * the plugin name but can be overridden here. Additionally, the
   * ModuleFederation plugin is automatically added after any plugins specified
   * here. It's options can be configured via the `moduleFederation` property.
   *
   * @see {@link getRsbuildConfig}
   */
  rsbuildConfig?: RsbuildConfig;
  /**
   * Module Federation configuration options to pass to the Module Federation
   * plugin. Note that the `name` is inherited from the `name` property defined
   * alongside this object. Any values defined here will be merged over the base
   * config.
   *
   * @see {@link getBaseModuleFederationConfig}
   */
  moduleFederation?: ModuleFederationOptions;
}

/**
 * Create a complete rsbuild configuration for a Perses plugin, including sensible defaults for the dev server port,
 * output asset prefix, and module federation plugin configuration.
 *
 * @param options Configuration options for the plugin build.
 * @returns A complete rsbuild configuration object.
 */
export function createConfigForPlugin(options: PluginConfigOptions) {
  const { name, rsbuildConfig = {}, moduleFederation = {} } = options;

  const port = validatePluginPort(name);

  const mfConfig: ModuleFederationOptions = {
    ...getBaseModuleFederationConfig(name), // base config first
    ...moduleFederation, // then any user config overrides
  };

  const baseConfig: RsbuildConfig = getRsbuildConfig(name, port);
  const rsbuildConfigWithMfPlugin: RsbuildConfig = { plugins: [pluginModuleFederation(mfConfig)] };

  return mergeRsbuildConfig(
    baseConfig, // base config first
    rsbuildConfig, // then any user config overrides
    rsbuildConfigWithMfPlugin // then add the Module Federation plugin last
  );
}

function getAssetPrefix(name: string): string {
  return `/plugins/${name}/`;
}

function getRsbuildConfig(name: string, port: number): RsbuildConfig {
  const assetPrefix = getAssetPrefix(name);

  return {
    server: { port },
    dev: { assetPrefix },
    source: { entry: { main: './src/index-federation.ts' } },
    output: {
      assetPrefix,
      copy: [{ from: 'package.json' }, { from: 'README.md' }, { from: '../LICENSE', to: './LICENSE', toType: 'file' }],
      distPath: {
        root: 'dist',
        js: '__mf/js',
        css: '__mf/css',
        font: '__mf/font',
      },
    },
    tools: {
      htmlPlugin: false,
    },
  };
}

function getBaseModuleFederationConfig(name: string): ModuleFederationOptions {
  return {
    name,
    dts: false,
    runtime: false,
    getPublicPath: `function() { return (window?.PERSES_PLUGIN_ASSETS_PATH ?? '') + '${getAssetPrefix(name)}'; }`,
  };
}

// Utility type to check for duplicate values in an object
type RegistryIsValid<Registry extends typeof PLUGIN_REGISTRY = typeof PLUGIN_REGISTRY> = {
  [K in keyof Registry]: {
    [J in keyof Registry]: J extends K ? true : Registry[J] extends Registry[K] ? false : true;
  }[keyof Registry];
}[keyof Registry] extends true
  ? true
  : false;

class RsbuildDuplicatePortError extends Error {
  constructor(port: number, pluginA: string, pluginB: string, options?: ErrorOptions) {
    const message = [
      `Port ${port} is already assigned.`,
      `Port ${port} is assigned to "${pluginA}" and "${pluginB}".`,
      `Please use a unique port for each plugin.`,
    ].join('\n    ');

    super(message, options);
    this.name = 'RsbuildDuplicatePortError';
  }
}

class RsbuildUnknownPluginError extends Error {
  constructor(pluginName: string, options?: ErrorOptions) {
    const message = [
      `No port assigned for plugin "${pluginName}".`,
      `Please add an entry for "${pluginName}" in the 'PLUGIN_REGISTRY' in 'rsbuild.shared.ts'.`,
    ].join('\n    ');

    super(message, options);
    this.name = 'RsbuildUnknownPluginError';
  }
}

const PLUGIN_REGISTRY_PORT_MAP = new Map<number, string>();
function validatePluginPort(pluginName: string): number {
  const pluginIsKnown = (pluginName: string): pluginName is keyof typeof PLUGIN_REGISTRY =>
    pluginName in PLUGIN_REGISTRY;
  if (!pluginIsKnown(pluginName)) {
    throw new RsbuildUnknownPluginError(pluginName);
  }

  const port = PLUGIN_REGISTRY[pluginName];
  if (!port) {
    throw new RsbuildUnknownPluginError(pluginName);
  }

  const existingPlugin = PLUGIN_REGISTRY_PORT_MAP.get(port);
  if (existingPlugin && existingPlugin !== pluginName) {
    throw new RsbuildDuplicatePortError(port, existingPlugin, pluginName);
  }

  PLUGIN_REGISTRY_PORT_MAP.set(port, pluginName);
  return port;
}
