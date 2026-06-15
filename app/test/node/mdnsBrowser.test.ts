import { describe, expect, it } from 'vitest';

import { normalizeService } from '../../src/main/mdnsBrowser.js';

describe('normalizeService', () => {
  it('prefers a routable IPv4 over the .local hostname', () => {
    const h = normalizeService({
      name: 'omadia-box',
      host: 'box.local',
      fqdn: 'omadia-box._omadia._tcp.local',
      port: 8080,
      addresses: ['fe80::1', '192.168.1.42'],
      txt: { name: 'Acme Omadia', auth: 'password', proto: '1.0' },
    });
    expect(h).toEqual({
      id: 'omadia-box._omadia._tcp.local',
      name: 'Acme Omadia',
      address: '192.168.1.42',
      port: 8080,
      authMode: 'password',
    });
  });

  it('falls back to the hostname when no address is advertised', () => {
    const h = normalizeService({ name: 'box', host: 'box.local', port: 8080 });
    expect(h?.address).toBe('box.local');
    expect(h?.name).toBe('box');
    expect(h?.id).toBe('box@box.local:8080');
  });

  it('uses the TXT name over the service name', () => {
    const h = normalizeService({
      name: 'service-id',
      host: 'h.local',
      port: 80,
      txt: { name: 'Living Room' },
    });
    expect(h?.name).toBe('Living Room');
  });

  it('drops an unknown auth value', () => {
    const h = normalizeService({
      host: 'h.local',
      port: 80,
      txt: { auth: 'weird' },
    });
    expect(h?.authMode).toBeUndefined();
  });

  it('returns null without an address or a port', () => {
    expect(normalizeService({ name: 'x', port: 80 })).toBeNull();
    expect(normalizeService({ name: 'x', host: 'h.local' })).toBeNull();
  });
});
