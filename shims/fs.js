/**
 * fs shim for React Native
 *
 * The @arcium-hq/client package imports Node's fs module, but only uses it
 * in ArcisModule.loadFromFile() which is not called in our React Native app.
 * This shim satisfies the bundler while throwing clear errors if called.
 */

const notSupported = (name) => () => {
  throw new Error(
    `fs.${name}() is not supported in React Native. ` +
    `The @arcium-hq/client package requires Node.js for file operations.`
  );
};

module.exports = {
  readFileSync: notSupported('readFileSync'),
  writeFileSync: notSupported('writeFileSync'),
  existsSync: notSupported('existsSync'),
  mkdirSync: notSupported('mkdirSync'),
  readdirSync: notSupported('readdirSync'),
  statSync: notSupported('statSync'),
  unlinkSync: notSupported('unlinkSync'),
  readFile: notSupported('readFile'),
  writeFile: notSupported('writeFile'),
  promises: {
    readFile: notSupported('promises.readFile'),
    writeFile: notSupported('promises.writeFile'),
  },
};
