/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

const playwright = require('playwright');
const inspect = require('util').inspect;
const path = require('path');
const fs = require('fs');

// eslint-disable-next-line no-redeclare
const URL = process.argv[2];
const BROWSER_VAR = 'JLAB_BROWSER_TYPE';
const BROWSER = process.env[BROWSER_VAR] || 'chromium';
const OUTPUT_VAR = 'JLAB_BROWSER_CHECK_OUTPUT';
const OUTPUT = process.env[OUTPUT_VAR];

let nextScreenshot = 0;
const screenshotStem = `screenshot-${+new Date()}`;

if (OUTPUT) {
  console.log(`Screenshots will be saved in ${OUTPUT}...`);
  if (!fs.existsSync(OUTPUT)) {
    console.log(`Creating ${OUTPUT}...`);
    fs.mkdirSync(OUTPUT, { recursive: true });
  }
}

async function main() {
  /* eslint-disable no-console */
  console.info(`Starting headless ${BROWSER}...`);

  const pwBrowser = playwright[BROWSER];
  const browser = await pwBrowser.launch({
    logger: {
      isEnabled: () => !!OUTPUT,
      log: (name, severity, message, args) => console.log(name, message)
    }
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  async function screenshot() {
    if (!OUTPUT) {
      return;
    }
    const screenshotPath = path.join(
      OUTPUT,
      `${screenshotStem}-${++nextScreenshot}.png`
    );
    console.log(`Capturing screenshot ${screenshotPath}...`);
    await page.screenshot({
      type: 'png',
      path: screenshotPath
    });
  }

  console.info('Navigating to page:', URL);
  await page.goto(URL);
  console.info('Waiting for page to load...');

  // Wait for the local file to redirect on notebook >= 6.0
  await page.waitForNavigation();

  console.log('Waiting for page content..');
  const html = await page.content();
  if (inspect(html).indexOf('jupyter-config-data') === -1) {
    console.error('Error loading JupyterLab page:');
    console.error(html);
  }

  console.log('Waiting for #main selector...');
  await page.waitForSelector('#main', { timeout: 100000 });

  console.log('Waiting for #browserTest selector...');
  const el = await page.waitForSelector('#browserTest', {
    timeout: 100000,
    state: 'attached'
  });
  console.log('Waiting for application to start...');
  let testError = null;

  try {
    await page.waitForSelector('.completed', { state: 'attached' });
  } catch (e) {
    testError = e;
  }

  await screenshot();

  const textContent = await el.getProperty('textContent');
  const errors = JSON.parse(await textContent.jsonValue());

  for (let error of errors) {
    console.error(`Parsed an error from text content: ${error.message}`, error);
    testError = true;
  }

  await browser.close();

  if (testError) {
    throw testError;
  }
  console.info('Browser test complete');
}

// Stop the process if an error is raised in the async function.
process.on('unhandledRejection', up => {
  throw up;
});

void main();
