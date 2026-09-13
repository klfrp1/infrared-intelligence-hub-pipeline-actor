const PUBLICATION_RE = /^([A-Z]{2})(\d{4,})([A-Z]\d?)?$/;

export function normalizePublicationNumber(value = '') {
    const cleaned = String(value || '')
        .toUpperCase()
        .replace(/<[^>]*>/g, '')
        .replace(/[^A-Z0-9]/g, '');

    const match = cleaned.match(PUBLICATION_RE);
    if (!match) return '';

    const [, authority, digits, kindCode = ''] = match;
    return `${authority}${digits}${kindCode}`;
}

export function canonicalPatentKey(value = '') {
    const normalized = normalizePublicationNumber(value);
    if (!normalized) return '';

    const match = normalized.match(PUBLICATION_RE);
    if (!match) return '';

    const [, authority, digits] = match;
    const canonicalDigits = digits.replace(/^0+(?=\d)/, '');
    return `${authority}${canonicalDigits}`;
}

export function hasPatentKindCode(value = '') {
    const normalized = normalizePublicationNumber(value);
    if (!normalized) return false;

    const match = normalized.match(PUBLICATION_RE);
    return Boolean(match?.[3]);
}

export function isSuspiciousPublicationNumber(value = '') {
    const normalized = normalizePublicationNumber(value);
    if (!normalized) return Boolean(String(value || '').trim());

    const match = normalized.match(PUBLICATION_RE);
    if (!match) return true;

    const [, authority, digits, kindCode = ''] = match;

    if (authority === 'US' && !kindCode && /^0\d{6,}$/.test(digits)) {
        return true;
    }

    return false;
}
