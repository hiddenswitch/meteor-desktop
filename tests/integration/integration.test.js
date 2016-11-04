/* eslint-disable no-console */
import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
import sinon from 'sinon';
import fs from 'fs';
import path from 'path';
import shell from 'shelljs';
import electron from 'electron';
import { Application } from 'spectron';

import paths from '../helpers/paths';
import meteorDesktop from '../../lib/index';

shell.config.fatal = true;

chai.use(sinonChai);
chai.use(dirty);
const { describe, it } = global;
const { expect } = chai;

/**
 * This is first experimental integration test.
 */

let appDir = '';

/**
 * Waits until a promise from a function finally returns true.
 * @param {Function} functionReturningPromise - function to test
 * @param {number}   ms                       - expiration timeout in milliseconds
 * @returns {Promise}
 */
function waitFor(functionReturningPromise, ms = 10000) {
    return new Promise((resolve, reject) => {
        let invokerTimeout;
        let timeout;
        const invokeFunction = () =>
            functionReturningPromise()
                .then((result) => {
                    console.log(result);
                    if (result) {
                        clearTimeout(invokerTimeout);
                        clearTimeout(timeout);
                        resolve();
                    } else {
                        invokerTimeout = setTimeout(invokeFunction, 500);
                    }
                })
                .catch(() => {
                    invokerTimeout = setTimeout(invokeFunction, 500);
                });
        invokeFunction();
        timeout = setTimeout(() => {
            clearTimeout(invokerTimeout);
            reject('timeout expired on waitFor');
        }, ms);
    });
}

/**
 * Waits for the app to load and appear.
 * @param {Object} app - test app
 * @returns {{app: (Application|*), window: *}}
 */
async function waitForApp(app) {
    await app.client.waitUntilWindowLoaded();
    const window = app.browserWindow;
    // Wait for the main window for max 30seconds. Adjust to your app.
    await waitFor(window.isVisible, 30000);
    expect(await app.client.getWindowCount()).to.equal(1);
    await app.client.waitUntil(
        async () => await app.client.execute(
            () => document.readyState === 'complete'
        )
    );
    return { app, window };
}

describe('desktop', () => {
    let MeteorDesktop;

    before(() => {
        appDir = path.join(paths.testsTmpPath, 'test-desktop');
    });

    beforeEach(() => {
        try {
            fs.unlinkSync('meteor.log');
        } catch (e) {
            // No worries...
        }
    });

    describe('add to scripts', () => {
        let exitStub;
        let cwdStub;
        it('should add a `desktop` entry in package.json', () => {
            exitStub = sinon.stub(process, 'exit');
            cwdStub = sinon.stub(process, 'cwd');
            cwdStub.returns(appDir);
            require('../../lib/scripts/addToScripts'); // eslint-disable-line
            const packageJson = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
            expect(exitStub).to.have.callCount(0);
            expect(packageJson.scripts.desktop).to.be.equal('meteor-desktop');
        });

        after(() => {
            exitStub.restore();
            cwdStub.restore();
        });
    });

    describe('build with params --init -b', () => {
        let exitStub;
        let app;

        after(async () => {
            exitStub.restore();
            if (app && app.isRunning()) {
                await app.stop();
            }
        });

        it('should create a build', async () => {
            exitStub = sinon.stub(process, 'exit', () => {
                try {
                    console.log(fs.readFileSync('meteor.log', 'utf8'));
                } catch (e) {
                    // Nothing to do.
                }
                process.exit(1);
            });
            // Load plugins directly from the package instead of those published to atmosphere.
            process.env.METEOR_PACKAGE_DIRS = path.resolve(path.join(__dirname, '..', '..', 'plugins'));
            MeteorDesktop = meteorDesktop(
                appDir,
                appDir,
                { ddpUrl: 'http://127.0.0.1:3080', init: true, build: true }
            );
            // Build the app.
            await MeteorDesktop.build();

            // Run it.
            app = new Application({
                path: electron,
                args: [path.join(appDir, '.meteor', 'desktop-build')],
                requireName: 'electronRequire',
                env: { NODE_ENV: 'test', ELECTRON_ENV: 'test', METEOR_DESKTOP_NO_SPLASH_SCREEN: 1 }
            });
            await app.start();
            await waitForApp(app);

            const title = await app.client.getTitle();
            expect(title).to.equal('test-desktop');
            const text = await app.client.getText('h1');
            expect(text).to.equal('Welcome to Meteor!');
        }).timeout(10 * 60000);
    });
});