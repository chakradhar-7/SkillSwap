// Time credits: 1 credit = 1 hour of teaching

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

// "1 credit", "2.5 credits"
export const formatCredits = (amount) => {
  const value = round(amount);
  return `${value} credit${value === 1 ? '' : 's'}`;
};

// "+2", "-1.5"
export const formatCreditChange = (amount) => {
  const value = round(amount);
  return value > 0 ? `+${value}` : `${value}`;
};

// Credits for one session of the given length
export const sessionCost = (durationHours) => round(durationHours);
