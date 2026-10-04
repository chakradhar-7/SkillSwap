// Escape user input so it can be used safely inside a RegExp (prevents
// invalid-pattern crashes and catastrophic-backtracking patterns).
const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = escapeRegex;
