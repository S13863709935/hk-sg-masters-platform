// Catalogue identity only; not an admissions-major equivalence rule.
export function identity(name) {
  return name.toLowerCase().replace(/\bmssc\b/g, 'msocsc').replace(/\(inter-faculty\)/g, '')
    .replace(/\((?:ma|msc|msocsc|macc|med|mpharm|mcm|mps|mhrm|mba|mfa|msw|mpa)\)/g, '')
    .replace(/master of science/g, 'msc').replace(/master of arts/g, 'ma').replace(/master of social sciences/g, 'msocsc')
    .replace(/master of business administration/g, 'mba').replace(/\b(?:of|in)\b/g, '').replace(/&/g, 'and')
    .replace(/[^\p{L}\p{N}]/gu, '');
}
