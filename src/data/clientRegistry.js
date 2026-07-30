// Client Registry parsed from telegram_chatIDs.xlsx
// Contains sales personnel (KRM, KRO, Sr.KRO, etc.) with assigned states and districts.

export const CLIENT_USERS = [
  {
    name: "Prakash Roy",
    chatId: "7653852862",
    role: "Sr.KRO",
    states: ["WB"],
    districts: [
      "BANKURA",
      "HOOGHLY",
      "HOWRAH",
      "24 PARAGANAS NORTH",
      "24 PARAGANAS SOUTH",
      "KOLKATA",
      "NADIA",
      "EAST BARDHAMAN",
      "MEDINIPUR EAST",
      "MEDINIPUR WEST",
      "WEST BARDHAMAN",
      "PURULIA"
    ],
    labels: []
  },
  {
    name: "Kaushik",
    chatId: "8623015213",
    role: "KRM",
    states: ["WB"],
    districts: [
      "DARJEELING",
      "JALPAIGURI",
      "COOCHBEHAR",
      "ALIPURDUAR",
      "KALIMPONG",
      "MALDAH",
      "DINAJPUR UTTAR",
      "DINAJPUR DAKSHIN"
    ],
    labels: ["NORTH BENGAL"]
  },
  {
    name: "Arindam",
    chatId: "5003561296",
    role: "ALL",
    states: ["WB"],
    districts: [],
    labels: []
  },
  {
    name: "Madhav",
    chatId: "7338176633",
    role: "ALL",
    states: ["WB"],
    districts: [],
    labels: []
  },
  {
    name: "Prakash Rajput",
    chatId: "8747542184",
    role: "KRM",
    states: ["UTTARPRADESH"],
    districts: [],
    labels: []
  },
  {
    name: "Arun kumar bhandary",
    chatId: "8795173924",
    role: "KRM",
    states: ["Jharkhand"],
    districts: [],
    labels: []
  },
  {
    name: "Suman Das",
    chatId: "7079560895",
    role: "ALL",
    states: ["WB"],
    districts: [],
    labels: []
  },
  {
    name: "Deepak kumar",
    chatId: "8708875474",
    role: "KRM",
    states: ["Bihar"],
    districts: [],
    labels: []
  },
  {
    name: "Udaan",
    chatId: "8161302401",
    role: "ALL",
    states: ["WB"],
    districts: [],
    labels: []
  },
  {
    name: "BHASKAR JYOTI",
    chatId: "8822561822",
    role: "KRM",
    states: ["ASSAM", "TRIPURA"],
    districts: [],
    labels: []
  },
  {
    name: "KAUSTAV CHATTERJEE",
    chatId: "7529251159",
    role: "Sr.KRO",
    states: ["WB"],
    districts: [
      "DARJEELING",
      "JALPAIGURI",
      "COOCHBEHAR",
      "ALIPURDUAR",
      "KALIMPONG",
      "MALDAH",
      "DINAJPUR UTTAR",
      "DINAJPUR DAKSHIN",
      "MURSHIDABAD",
      "BIRBHUM"
    ],
    labels: []
  },
  {
    name: "PUSPAK MAJUMDER",
    chatId: "8841243197",
    role: "KRM",
    states: ["ODISHA"],
    districts: [],
    labels: []
  },
  {
    name: "KOUSHIK PAL",
    chatId: "6770405972",
    role: "KRO",
    states: ["WB"],
    districts: ["BIRBHUM"],
    labels: []
  },
  {
    name: "DHIRAJ JOSHI",
    chatId: "8804803478",
    role: "KRO",
    states: ["WB"],
    districts: ["24 PARAGANAS SOUTH", "KOLKATA"],
    labels: []
  },
  {
    name: "ARUNAVA KAR",
    chatId: "8740780769",
    role: "KRO",
    states: ["WB"],
    districts: ["MEDINIPUR WEST", "MEDINIPUR EAST", "JHARGRAM"],
    labels: []
  },
  {
    name: "SOURAV SAMANTA",
    chatId: "8669073507",
    role: "KRO",
    states: ["WB"],
    districts: ["MEDINIPUR EAST"],
    labels: []
  },
  {
    name: "AZARUL ISLAM",
    chatId: "5046680096",
    role: "KRO",
    states: ["WB"],
    districts: ["HOOGHLY"],
    labels: []
  },
  {
    name: "UDAY PAL",
    chatId: "8539221498",
    role: "KRO",
    states: ["WB"],
    districts: ["HOWRAH", "BANKURA"],
    labels: []
  },
  {
    name: "SANKAR NARAYAN DEY",
    chatId: "8674055628",
    role: "KRO",
    states: ["WB"],
    districts: ["24 PARAGANAS NORTH"],
    labels: []
  },
  {
    name: "SAPTARSHI SENGUPTA",
    chatId: "8563434720",
    role: "KRO",
    states: ["WB"],
    districts: ["HOWRAH"],
    labels: []
  },
  {
    name: "Bipul Pankaj",
    chatId: "8948014953",
    role: "KRO",
    states: ["Jharkhand"],
    districts: [],
    labels: []
  },
  {
    name: "Atanu Sarkar",
    chatId: "8526290910",
    role: "ALL",
    states: ["WB"],
    districts: [],
    labels: []
  },
  {
    name: "Ashok das",
    chatId: "6212313254",
    role: "KRO",
    states: ["WB"],
    districts: [
      "DARJEELING",
      "JALPAIGURI",
      "COOCHBEHAR",
      "ALIPURDUAR",
      "KALIMPONG",
      "MALDAH",
      "DINAJPUR UTTAR",
      "DINAJPUR DAKSHIN"
    ],
    labels: ["NORTH BENGAL"]
  },
  {
    name: "Subhadeep Banerjee",
    chatId: "8551094267",
    role: "ADMIN",
    states: ["WB"],
    districts: [],
    labels: []
  },
  {
    name: "Niket Rajan",
    chatId: "8847044457",
    role: "KRO",
    states: ["Jharkhand"],
    districts: [],
    labels: []
  },
  {
    name: "Sanjit Barman",
    chatId: "1459233923",
    role: "KRO",
    states: ["WB"],
    districts: [
      "DARJEELING",
      "JALPAIGURI",
      "COOCHBEHAR",
      "ALIPURDUAR",
      "KALIMPONG",
      "MALDAH",
      "DINAJPUR UTTAR",
      "DINAJPUR DAKSHIN"
    ],
    labels: ["NORTH BENGAL"]
  }
];

// Helper to normalize strings (remove spaces, lowercase)
function clean(str) {
  return (str || '').replace(/\s+/g, '').toLowerCase();
}

let dynamicUsersList = [...CLIENT_USERS];

// Load cached backend user roster if available in localStorage
try {
  const cached = typeof localStorage !== 'undefined' && localStorage.getItem('hmb_synced_users');
  if (cached) {
    const parsed = JSON.parse(cached);
    if (Array.isArray(parsed) && parsed.length > 0) {
      dynamicUsersList = parsed;
    }
  }
} catch { /* ignore */ }

/**
 * Syncs dynamic user roster fetched from n8n / Google Sheets backend.
 */
export function syncClientUsers(backendUsers) {
  if (Array.isArray(backendUsers) && backendUsers.length > 0) {
    dynamicUsersList = backendUsers;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('hmb_synced_users', JSON.stringify(backendUsers));
      }
    } catch { /* ignore */ }
  }
}

export function getClientUsers() {
  return dynamicUsersList;
}

/**
 * Authenticates a client user based on username and password rules.
 * Username: case-insensitive name match
 * Password: name without spaces + "@26" (case-insensitive)
 */
export function authenticateClientUser(inputUsername, inputPassword) {
  if (!inputUsername || !inputPassword) return null;

  const cleanUser = clean(inputUsername);
  const cleanPass = clean(inputPassword);

  const activeRoster = dynamicUsersList && dynamicUsersList.length > 0 ? dynamicUsersList : CLIENT_USERS;
  const matchedUser = activeRoster.find(u => clean(u.name) === cleanUser);
  if (!matchedUser) return null;

  const expectedPass = cleanUser + "@26";
  if (cleanPass === expectedPass) {
    return matchedUser;
  }

  return null;
}
