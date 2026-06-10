/**
 * ws's optional native addons (bufferutil / utf-8-validate) break inside the
 * bundled asar — node-gyp-build resolves against the rollup output and returns
 * a broken binding, so Sender.frame crashes with "bufferUtil.mask is not a
 * function" on the first outgoing frame. Force ws's pure-JS fallbacks instead.
 * MUST be the first import of the main entry, before anything pulls in 'ws'.
 */
process.env['WS_NO_BUFFER_UTIL'] = '1';
process.env['WS_NO_UTF_8_VALIDATE'] = '1';
