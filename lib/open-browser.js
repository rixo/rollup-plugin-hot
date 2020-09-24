/**
 * Copyright (c) 2019 Fred K. Schott
 *
 * MIT License
 *
 * Copied from https://github.com/pikapkg/snowpack/blob/d484739bf3c16ddb156370aea672a7b9bd8a3cec/snowpack/src/util.ts#L156
 */

const execa = require('execa')
const open = require('open')

const appNames = {
  win32: {
    brave: 'brave',
    chrome: 'chrome',
  },
  darwin: {
    brave: 'Brave Browser',
    chrome: 'Google Chrome',
  },
  linux: {
    brave: 'brave',
    chrome: 'google-chrome',
  },
}

module.exports = async function openInBrowser(
  url /*: string */,
  browser /*: string */ = 'default'
) {
  browser = /chrome/i.test(browser)
    ? appNames[process.platform]['chrome']
    : /brave/i.test(browser)
    ? appNames[process.platform]['brave']
    : browser

  const isMac = process.platform === 'darwin'

  const isOpeningInChrome = /chrome|default/i.test(browser)

  if (isMac && isOpeningInChrome) {
    // If we're on macOS, and we haven't requested a specific browser,
    // we can try opening Chrome with AppleScript. This lets us reuse an
    // existing tab when possible instead of creating a new one.
    try {
      // see if Chrome process is open; fail if not
      await execa.command('ps cax | grep "Google Chrome"', {
        shell: true,
      })
      // use open Chrome tab if exists; create new Chrome tab if not
      const openChrome = execa(
        'osascript ../assets/openChrome.applescript "' + encodeURI(url) + '"',
        {
          cwd: __dirname,
          stdio: 'ignore',
          shell: true,
        }
      )
      // if Chrome doesn’t respond within 3s, fall back to opening new tab in default browser
      const isChromeStalled = setTimeout(() => {
        openChrome.cancel()
      }, 3000)

      try {
        await openChrome
      } catch (err) {
        if (err.isCanceled) {
          // eslint-disable-next-line no-console
          console.warn(
            `Chrome not responding after 3s. Opening dev server in new tab.`
          )
        } else {
          // eslint-disable-next-line no-console
          console.error(err.toString() || err)
        }
        open(url)
      } finally {
        clearTimeout(isChromeStalled)
      }
      return true
    } catch (err) {
      // if no open Chrome process, open default browser
      // no error message needed here
      open(url)
    }
  } else {
    browser === 'default' ? open(url) : open(url, { app: browser })
  }
}
