/**
 * Two-way skill matching for the barter system.
 */

// Skills from `wanted` that appear in `offered` (case-insensitive),
// returned in the spelling used in `offered`, without duplicates
const skillOverlap = (wanted = [], offered = []) => {
  const offeredByKey = new Map(offered.map((skill) => [skill.toLowerCase(), skill]));
  const result = [];
  wanted.forEach((skill) => {
    const match = offeredByKey.get(skill.toLowerCase());
    if (match && !result.includes(match)) result.push(match);
  });
  return result;
};

/**
 * Compares the current user with another user.
 * @returns {{
 *   theyCanTeachMe: string[],   // their teachable skills that I want to learn
 *   iCanTeachThem: string[],    // my teachable skills that they want to learn
 *   type: 'perfect' | 'oneWay' | 'none'
 * }}
 * 'perfect' means both lists are non-empty: each person can teach the other
 * something they want, so a barter is guaranteed to work.
 */
export const getSwapMatch = (me, other) => {
  const theyCanTeachMe = skillOverlap(me?.skillsToLearn, other?.skillsToTeach);
  const iCanTeachThem = skillOverlap(other?.skillsToLearn, me?.skillsToTeach);

  let type = 'none';
  if (theyCanTeachMe.length > 0 && iCanTeachThem.length > 0) {
    type = 'perfect';
  } else if (theyCanTeachMe.length > 0) {
    type = 'oneWay';
  }

  return { theyCanTeachMe, iCanTeachThem, type };
};

// True if `skill` is in `list`, ignoring case
export const includesSkill = (list = [], skill = '') =>
  list.some((item) => item.toLowerCase() === skill.toLowerCase());
