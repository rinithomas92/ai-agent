export const hashtagLibrary = {
  motivation: {
    broad: ["#Motivation", "#Inspiration", "#Mindset", "#DailyInspiration", "#DailyQuotes"],
    niche: ["#DailyConfidence", "#PersonalGrowthJourney", "#SelfBelief", "#OvercomeObstacles"],
    specific: ["#KeepMovingForward", "#BuildYourConfidence", "#ChooseToShine", "#YourOnlyLimitIsYou"]
  },
  wellness: {
    broad: ["#Wellness", "#SelfCare", "#HealthyLiving", "#Mindfulness", "#HolisticHealth"],
    niche: ["#MentalWellness", "#HealingJourney", "#SlowLiving", "#EmotionalBurnout"],
    specific: ["#SelfCareReminder", "#NourishYourSoul", "#GentleReminders", "#PrioritizeYourPeace"]
  },
  career: {
    broad: ["#Career", "#Professional", "#Success", "#WorkLife", "#Ambition"],
    niche: ["#CareerGrowth", "#WorkLifeBalance", "#ProfessionalDevelopment", "#CareerGoals"],
    specific: ["#CareerConfidence", "#DreamJobJourney", "#CorporateWellness", "#DesignYourCareer"]
  },
  technology: {
    broad: ["#Technology", "#Innovation", "#Digital", "#Tech", "#TechWorld"],
    niche: ["#FutureTechnology", "#DigitalTransformation", "#TechTrends", "#EmergingTech"],
    specific: ["#TechInnovation", "#ModernTechnology", "#WomenInTech", "#InnovateDaily"]
  },
  business: {
    broad: ["#Business", "#Entrepreneur", "#Startup", "#Marketing", "#BusinessOwner"],
    niche: ["#EntrepreneurLife", "#BusinessStrategy", "#FemaleFounder", "#SmallBusinessOwner"],
    specific: ["#BuildYourEmpire", "#MindsetOfAnEntrepreneur", "#BusinessSuccessTips", "#ScaleYourBusiness"]
  },
  leadership: {
    broad: ["#Leadership", "#Management", "#Inspiration", "#Influence", "#Growth"],
    niche: ["#LeadershipDevelopment", "#LeadByExample", "#MindfulLeadership", "#ExecutiveCoaching"],
    specific: ["#EmpowerOthers", "#InspiringLeaders", "#LeadershipMindset", "#AuthenticLeadership"]
  },
  personalgrowth: {
    broad: ["#PersonalGrowth", "#SelfImprovement", "#Motivation", "#Transformation", "#SelfDiscovery"],
    niche: ["#PersonalGrowthJourney", "#SelfMastery", "#InnerWork", "#BecomingTheBestVersionOfYou"],
    specific: ["#ChooseGrowth", "#MindsetShift", "#GrowthOverComfort", "#OwnYourJourney"]
  },
  confidence: {
    broad: ["#Confidence", "#SelfEsteem", "#Empowerment", "#SelfLove", "#SelfWorth"],
    niche: ["#BuildConfidence", "#QuietConfidence", "#UnstoppableSelf", "#BodyPositivity"],
    specific: ["#OwnYourWorth", "#ConfidenceIsKey", "#FearlessMindset", "#SpeakYourTruth"]
  }
};

/**
 * Normalizes a list of hashtags:
 * - Adds # where missing.
 * - Removes spaces and invalid characters.
 * - Removes duplicates.
 */
export function normalizeHashtags(tags = []) {
  if (!Array.isArray(tags)) return [];
  const normalized = tags.map(tag => {
    let cleaned = tag.trim().replace(/\s+/g, '');
    if (!cleaned) return '';
    if (!cleaned.startsWith('#')) {
      cleaned = '#' + cleaned;
    }
    // Remove invalid characters except '#'
    cleaned = '#' + cleaned.slice(1).replace(/[^a-zA-Z0-9_]/g, '');
    return cleaned;
  }).filter(Boolean);

  // Return unique tags
  return [...new Set(normalized)];
}

/**
 * Selects 8-12 hashtags for a category.
 * Mixes broad, niche, and specific hashtags and randomizes them.
 */
export function getDemoHashtags(categoryName = '') {
  let cat = categoryName.toLowerCase().replace(/[^a-z]/g, '');
  if (!hashtagLibrary[cat]) {
    // try finding a match or default to motivation
    const matchedKey = Object.keys(hashtagLibrary).find(k => cat.includes(k) || k.includes(cat));
    cat = matchedKey || 'motivation';
  }

  const lib = hashtagLibrary[cat];
  const b = shuffle([...lib.broad]);
  const n = shuffle([...lib.niche]);
  const s = shuffle([...lib.specific]);

  // Take 3-4 broad, 3-4 niche, 2-4 specific to total 8-12
  const bCount = Math.floor(Math.random() * 2) + 3; // 3 to 4
  const nCount = Math.floor(Math.random() * 2) + 3; // 3 to 4
  const sCount = Math.floor(Math.random() * 3) + 2; // 2 to 4

  const selected = [
    ...b.slice(0, bCount),
    ...n.slice(0, nCount),
    ...s.slice(0, sCount)
  ];

  return normalizeHashtags(selected).slice(0, 12);
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
