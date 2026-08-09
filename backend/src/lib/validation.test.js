import { describe, it, expect } from 'vitest';
import { EMAIL_RE, MIN_PASSWORD_LENGTH } from './validation.js';

describe('EMAIL_RE', () => {
  it.each(['a@b.com', 'first.last@example.co.uk', 'user+tag@sub.domain.io'])(
    'accepts %s',
    (email) => {
      expect(EMAIL_RE.test(email)).toBe(true);
    }
  );

  it.each(['not-an-email', 'missing-domain@', '@missing-local.com', 'spaces in@email.com', ''])(
    'rejects %s',
    (email) => {
      expect(EMAIL_RE.test(email)).toBe(false);
    }
  );
});

describe('MIN_PASSWORD_LENGTH', () => {
  it('is at least 8', () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(8);
  });
});
