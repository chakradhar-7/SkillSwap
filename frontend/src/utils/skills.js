// Predefined skills list - shared across the application
export const predefinedSkills = [
  'JavaScript', 'Python', 'React', 'Node.js', 'Web Design', 'UI/UX Design',
  'Graphic Design', 'Photography', 'Video Editing', 'Content Writing',
  'Digital Marketing', 'SEO', 'Social Media Marketing', 'Data Analysis',
  'Machine Learning', 'Mobile Development', 'Guitar', 'Piano', 'Singing',
  'Dancing', 'Yoga', 'Fitness Training', 'Cooking', 'Baking', 'Drawing',
  'Painting', 'Public Speaking', 'Language Teaching', 'Math Tutoring',
  'HTML/CSS', 'TypeScript', 'Vue.js', 'Angular', 'Express.js', 'MongoDB',
  'SQL', 'Java', 'C++', 'C#', 'Swift', 'Kotlin', 'Flutter', 'Dart',
  'PHP', 'Ruby', 'Go', 'Rust', 'Docker', 'Kubernetes', 'AWS', 'Azure',
  'Git', 'Linux', 'DevOps', 'Cybersecurity', 'Blockchain', 'Web3',
  'Game Development', '3D Modeling', 'Animation', 'Illustration',
  'Music Production', 'Sound Design', 'Podcasting', 'Creative Writing',
  'Business Strategy', 'Project Management', 'Agile', 'Scrum',
  'Financial Planning', 'Investing', 'Trading', 'Accounting',
  'Spanish', 'French', 'German', 'Mandarin', 'Japanese', 'Korean',
  'Meditation', 'Mindfulness', 'Life Coaching', 'Career Counseling'
];

// Normalize skill name - handle capitalization
export const normalizeSkillName = (skill) => {
  if (!skill || !skill.trim()) return '';
  
  const trimmed = skill.trim();
  
  // Handle special cases with slashes, hyphens, etc.
  return trimmed
    .split(/[\s\/\-]+/)
    .map(word => {
      // Keep acronyms uppercase (like HTML, CSS, API, etc.)
      if (word.length <= 3 && word === word.toUpperCase()) {
        return word;
      }
      // Capitalize first letter, lowercase rest
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

// Check if skill exists in predefined list (case-insensitive)
export const skillExists = (skill, skillList = predefinedSkills) => {
  const normalized = normalizeSkillName(skill);
  return skillList.some(s => s.toLowerCase() === normalized.toLowerCase());
};

// Get all unique skills from all users (for dynamic skill list)
export const getAllUserSkills = async (api) => {
  try {
    const res = await api.get('/profile/all');
    const allSkills = new Set();
    
    res.data.forEach(user => {
      (user.skillsToTeach || []).forEach(skill => allSkills.add(normalizeSkillName(skill)));
      (user.skillsToLearn || []).forEach(skill => allSkills.add(normalizeSkillName(skill)));
    });
    
    return Array.from(allSkills).sort();
  } catch (err) {
    console.error('Failed to fetch user skills:', err);
    return [];
  }
};

