// Empty stand-in for Node built-ins (fs, path, crypto) in the browser bundle.
// Essentia's WASM build only touches them when it runs under Node.
module.exports = {};
