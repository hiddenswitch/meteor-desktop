/* eslint-disable no-console */
const fs = Npm.require('fs');
const path = Npm.require('path');

function saveNewVersion(version, versionFile) {
    fs.writeFileSync(versionFile, JSON.stringify({
        version
    }, null, 2), 'UTF-8');
}

/**
 * Tries to read a settings.json file from desktop dir.
 *
 * @param {Object} file        - The file being processed by the build plugin.
 * @param {string} desktopPath - Path to the desktop dir.
 * @returns {Object}
 */
function getSettings(desktopPath) {
    let settings = {};
    try {
        settings = JSON.parse(
            this.fs.readFileSync(path.join(desktopPath, 'settings.json'), 'UTF-8')
        );
    } catch (e) {
        return {};
    }
    return settings;
}

// TODO: any better way of getting this path?
const rootPath = path.resolve(path.join(process.cwd(), '..', '..', '..', '..', '..'));
const desktopPath = path.resolve(path.join(rootPath, '.desktop'));

const settings = getSettings(desktopPath);
if (!('desktopHCP' in settings) || !settings.desktopHCP) {
    console.warn('[meteor-desktop] will not watch for changes is .desktop because there is no ' +
        '.desktop/settings.json or desktopHCP is set to false');
} else if (!('omega:meteor-desktop-bundler' in Package || !__METEOR_DESKTOP_BUNDLER)) {
    console.info('[meteor-desktop] .desktop HCP will not work because web.cordova architecture ' +
        'is missing. Run Meteor\'s mobile target or with --mobile-server.');
} else {
    const chokidar = Npm.require('chokidar');
    const hash = Npm.require('hash-files');
    const versionFile = path.join(rootPath, 'version.desktop');

    let version;

    try {
        version = JSON.parse(
            fs.readFileSync(versionFile, 'UTF-8')
        ).version;
    } catch (e) {
        throw new Error('[meteor-desktop] There is no version.desktop file. Are you sure you have ' +
            'omega:meteor-desktop-bundler package added to your project?');
    }

    const currentVersion = hash.sync({
        files: [`${desktopPath}${path.sep}**`]
    });

    if (currentVersion !== version) {
        // TODO: something meteor'ish to print to stdout?
        console.info('[meteor-desktop] Initial .desktop version inconsistency found. Files have ' +
            'changed during the build, triggering desktop rebuild.');
        saveNewVersion(currentVersion, versionFile);
    } else {
        const watcher = chokidar.watch(desktopPath, {
            persistent: true,
            ignored: /tmp___/,
            ignoreInitial: true
        });

        let timeout = null;

        watcher
            .on('all', (event, filePath) => {
                if (timeout) {
                    clearTimeout(timeout);
                }
                // Simple 2s debounce.
                timeout = setTimeout(() => {
                    console.log(`[meteor-desktop] ${filePath} have been changed, triggering desktop ` +
                        'rebuild.');
                    saveNewVersion(hash.sync({
                        files: [`${desktopPath}${path.sep}**`]
                    }), versionFile);
                }, 2000);
            });
        console.log(`[meteor-desktop] Watching ${desktopPath} for changes.`);
    }
}
