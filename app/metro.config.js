const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Das Verzeichnis, in dem deine App liegt (also der Ordner 'app')
const projectRoot = __dirname;
// Das Verzeichnis des gesamten Monorepos (das Root-Verzeichnis)
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 1. WatchFolders: Metro muss auch Dateien im Root-Verzeichnis überwachen
config.watchFolders = [workspaceRoot];

// 2. Resolver: Metro muss wissen, wo es nach node_modules suchen soll
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Optional: Wenn du Symlinks/Workspaces nutzt, ist das wichtig
config.resolver.disableHierarchicalLookup = true;

module.exports = config;