import money from '../../src/common/utils/money';

describe('exact monetary values', () => {
  test('preserves decimal precision', () => {
    expect(money('0.1').plus(money('0.2')).toFixed(4)).toBe('0.3000');
    expect(money('9999999999999999.9999').toFixed(4)).toBe(
      '9999999999999999.9999',
    );
  });
  test.each([
    '1e3',
    '0.00001',
    'NaN',
    'Infinity',
    '1,000',
    '01',
    '10000000000000000',
  ])('rejects %s', (value) => {
    expect(() => money(value)).toThrow();
  });
});
