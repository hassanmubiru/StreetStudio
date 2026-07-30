import { describe, it, expect, vi } from 'vitest';
describe('localStorage probe', () => {
  it('same object?', () => {
    expect(window.localStorage).toBe(window.localStorage);
    const desc = Object.getOwnPropertyDescriptor(window.localStorage, 'getItem')
      || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window.localStorage), 'getItem');
    console.log('DESC', JSON.stringify(desc && { configurable: desc.configurable, writable: desc.writable, hasValue: !!desc.value }));
    const spy = vi.spyOn(window.localStorage, 'getItem').mockReturnValue('X');
    console.log('READBACK', window.localStorage.getItem('k'));
    console.log('ISSPY', (window.localStorage.getItem as any).mock !== undefined);
  });
});
